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

    async function requestJson(path, params) {
        const res = await fetch(buildUrl(path, params));
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
        async exportNamedText(docKey, mimeType = "text/plain") {
            return requestText("exportDriveText", { docKey, mimeType });
        },
        async exportDriveText(fileId, mimeType = "text/plain") {
            return requestText("exportDriveText", { fileId, mimeType });
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
