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

    async function requestJson(path, params, options = {}) {
        const method = (options.method || "GET").toUpperCase();
        const fetchOptions = { method };

        if (options.body !== undefined) {
            fetchOptions.headers = {
                "Content-Type": "application/json",
            };
            fetchOptions.body = JSON.stringify(options.body);
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
            const data = await requestJson("listDriveFiles", { folderId });
            return normalizeFolderResponse(data).files;
        },
        // [COPILOT-EDIT] Server-side search API: searchDriveFiles(q, folderId, rootKey, options)
        async searchDriveFiles(q, folderId, rootKey, options = {}) {
            const params = Object.assign({ q, folderId, rootKey }, options || {});
            const data = await requestJson("searchDriveFiles", params);
            if (!data) return { results: [] };
            return data;
        },
        async getNewsFeed(q = "", limit = 6, source = "latest") {
            return requestJson("newsFeed", { q, limit, source });
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
