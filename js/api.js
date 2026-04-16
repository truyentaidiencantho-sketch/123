(function(g) {
    // Set this to your intermediary server URL, for example:
    // https://your-worker.your-subdomain.workers.dev
    const DEFAULT_PROXY_BASE_URL =
        "https://truyentai-drive-proxy.truyentaidiencantho.workers.dev";
    const rawProxyBaseUrl =
        (g.__WEB_API_PROXY_BASE__ || DEFAULT_PROXY_BASE_URL || "").trim();
    const proxyBaseUrl = rawProxyBaseUrl.replace(/\/+$/, "");

    function buildUrl(path, params) {
        if (!proxyBaseUrl) {
            throw new Error(
                "Chua cau hinh server trung gian trong js/api.js",
            );
        }

        const url = new URL(path, `${proxyBaseUrl}/`);
        Object.entries(params || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== "") {
                url.searchParams.set(key, value);
            }
        });

        return url.toString();
    }

    // LocalStorage cache helpers (simple TTL cache)
    function _getLocalCache(key, ttlMs) {
        try {
            const now = Date.now();
            const raw = localStorage.getItem(key);
            const ts = Number(localStorage.getItem(key + "_time") || 0);
            if (raw && ts && (now - ts) < ttlMs) {
                return JSON.parse(raw);
            }
        } catch (e) {
            // ignore storage errors
        }
        return null;
    }

    function _setLocalCache(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            localStorage.setItem(key + "_time", String(Date.now()));
        } catch (e) {
            // ignore storage errors
        }
    }

    async function requestJson(path, params, options = {}) {
        const method = (options.method || "GET").toUpperCase();
        const fetchOptions = { method };

        if (options.body !== undefined) {
            fetchOptions.headers = {
                "Content-Type": "application/json",
            };
            fetchOptions.body = JSON.stringify(options.body);
        }

        // Allow callers to force a fresh fetch (bypass CDN/edge cache)
        if (options.forceRefresh) {
            fetchOptions.headers = Object.assign({}, fetchOptions.headers || {}, { 'x-force-refresh': '1' });
        }

        const res = await fetch(buildUrl(path, params), fetchOptions);
        const text = await res.text();

        if (!res.ok) {
            throw new Error(`${res.status} ${text}`);
        }

        if (!text) return null;
        return JSON.parse(text);
    }

    async function requestText(path, params) {
        const res = await fetch(buildUrl(path, params));
        const text = await res.text();

        if (!res.ok) {
            throw new Error(`${res.status} ${text}`);
        }

        return text;
    }

    g.APP_API = {
        proxyBaseUrl,
        hasProxy() {
            return Boolean(proxyBaseUrl);
        },
        async getRootFolder(rootKey) {
            const data = await requestJson("listDriveFiles", { rootKey });
            return normalizeFolderResponse(data);
        },
        async listDriveFiles(folderId) {
            const cacheKey = `listDriveFiles::${folderId}`;
            const cached = _getLocalCache(cacheKey, 5 * 60 * 1000); // 5 minutes
            if (cached) {
                return normalizeFolderResponse(cached).files;
            }
            const data = await requestJson("listDriveFiles", { folderId }, { forceRefresh: true });
            _setLocalCache(cacheKey, data);
            return normalizeFolderResponse(data).files;
        },
        // [COPILOT-EDIT] Server-side search API: searchDriveFiles(q, folderId, rootKey, options)
        async searchDriveFiles(q, folderId, rootKey, options = {}) {
            const params = Object.assign({ q, folderId, rootKey }, options || {});
            const cacheKey = `searchDriveFiles::${q || ''}::${folderId || ''}::${rootKey || ''}`;
            const cached = _getLocalCache(cacheKey, 5 * 60 * 1000); // 5 minutes
            if (cached) return cached;
            const data = await requestJson("searchDriveFiles", params, { forceRefresh: true });
            if (data) _setLocalCache(cacheKey, data);
            if (!data) return { results: [] };
            return data;
        },
        async getNewsFeed(q = "", limit = 6, source = "latest") {
            const cacheKey = `newsFeed::${q || ''}::${limit}::${source}`;
            const cached = _getLocalCache(cacheKey, 5 * 60 * 1000); // 5 minutes
            if (cached) return cached;
            const data = await requestJson("newsFeed", { q, limit, source }, { forceRefresh: true });
            _setLocalCache(cacheKey, data);
            return data;
        },
        // getSiteAnalytics removed (Cloudflare approach disabled)
        async streamNewsFeed(q = "", limit = 6, source = "latest", onArticle, options = {}) {
            const url = buildUrl("newsFeedStream", { q, limit, source });
            const fetchOptions = {};
            if (options && options.signal) fetchOptions.signal = options.signal;
            const res = await fetch(url, fetchOptions);
            try { console.debug && console.debug('streamNewsFeed: fetch', url, 'status', res.status); } catch (e) {}
            if (!res.ok) throw new Error(`${res.status}`);

            // If the runtime doesn't support streaming, fall back to full JSON parse
            if (!res.body) {
                const text = await res.text();
                if (!text) return;
                const lines = text.split('\n').filter(Boolean);
                for (const line of lines) {
                    try {
                        const obj = JSON.parse(line);
                        try { console.debug && console.debug('streamNewsFeed: parsed (non-stream)', obj && (obj.id || obj.slug || obj.title)); } catch (e) {}
                        onArticle(obj);
                    } catch (e) {
                        try { console.warn && console.warn('streamNewsFeed: malformed JSON (non-stream)', line.slice(0,200), e); } catch (er) {}
                    }
                }
                return;
            }

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    buf += decoder.decode(value, { stream: true });
                    const parts = buf.split('\n');
                    buf = parts.pop();
                    for (const line of parts) {
                        if (!line || !line.trim()) continue;
                        try {
                            const obj = JSON.parse(line);
                            try { console.debug && console.debug('streamNewsFeed: parsed', obj && (obj.id || obj.slug || obj.title)); } catch (e) {}
                            onArticle(obj);
                        } catch (e) {
                            try { console.warn && console.warn('streamNewsFeed: malformed JSON line', line.slice(0,200), e); } catch (er) {}
                        }
                    }
                }

                if (buf && buf.trim()) {
                    try {
                        const obj = JSON.parse(buf);
                        try { console.debug && console.debug('streamNewsFeed: parsed (buf)', obj && (obj.id || obj.slug || obj.title)); } catch (e) {}
                        onArticle(obj);
                    } catch (e) {
                        try { console.warn && console.warn('streamNewsFeed: malformed final chunk', buf.slice(0,200), e); } catch (er) {}
                    }
                }
            } finally {
                try { reader.releaseLock(); } catch (e) {}
            }
        },
        async retryNewsFeed(body = {}) {
            return requestJson('newsFeedRetry', null, { method: 'POST', body });
        },
        getNewsArticleUrl(fileId) {
            return buildUrl("newsArticle", { fileId });
        },
        async exportNamedText(docKey, mimeType = "text/plain") {
            return requestText("exportDriveText", { docKey, mimeType });
        },
        async exportDriveText(fileId, mimeType = "text/plain") {
            return requestText("exportDriveText", { fileId, mimeType });
        },
        async verifyAdminPassword(password) {
            return requestJson("verifyAdminPassword", null, {
                method: "POST",
                body: { password },
            });
        },
        // Purge server cache entries and optionally refresh them.
        async purgeCache(paths = [], refresh = true) {
            return requestJson("purgeCache", null, { method: "POST", body: { paths, refresh } });
        },
    };

    function normalizeFolderResponse(data) {
        if (Array.isArray(data)) {
            return { folderId: "", files: data };
        }

        if (data && Array.isArray(data.files)) {
            return {
                folderId: data.folderId || "",
                files: data.files,
            };
        }

        return { folderId: "", files: [] };
    }
})(typeof window !== "undefined" ? window : globalThis);
