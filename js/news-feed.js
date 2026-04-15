(function (g) {
    const api =
        (typeof g !== "undefined" && g.APP_API) ? g.APP_API : null;
    const DEFAULT_LIMIT = 6;
    const ARCHIVE_LIMIT = 20;
    const ARCHIVE_CONTAINER_ID = "news-feed-archive-container";
    let archiveLoaded = false;
    let archiveVisible = false;

    function getArchiveContainer(grid) {
        let container = byId(ARCHIVE_CONTAINER_ID);
        if (!container) {
            container = document.createElement("div");
            container.id = ARCHIVE_CONTAINER_ID;
            container.className = "news-archive-container";
            grid.appendChild(container);
        }
        return container;
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function escapeAttr(value) {
        return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    function getArticleUrl(article) {
        if (article && article.detailUrl) return article.detailUrl;
        if (api && typeof api.getNewsArticleUrl === "function" && article && article.id) {
            return api.getNewsArticleUrl(article.id);
        }
        return "#";
    }

    function renderCards(grid, articles, options = {}) {
        if (!grid) return;
        if (!options.append) {
            grid.innerHTML = "";
        }

        (articles || []).forEach((article) => {
            const card = document.createElement("a");
                card.className = "news-card";
                card.href = getArticleUrl(article);

            const media = document.createElement("div");
            media.className = "news-card-media";

            // Show thumbnail image directly; fallback to placeholder on error.
            if (article.thumbnailUrl) {
                const img = document.createElement("img");
                img.className = "news-card-media-img";
                img.alt = article.title || "Bản tin";
                img.loading = "lazy";
                img.decoding = "async";
                img.src = article.thumbnailUrl;
                img.onerror = function() {
                    try {
                        const fallback = document.createElement("div");
                        fallback.className = "news-card-media-fallback";
                        fallback.textContent = article.title || "Bản tin";
                        img.replaceWith(fallback);
                    } catch (e) {}
                };
                media.appendChild(img);
            } else {
                const fallback = document.createElement("div");
                fallback.className = "news-card-media-fallback";
                fallback.textContent = article.title || "Bản tin";
                media.appendChild(fallback);
            }

            const body = document.createElement("div");
            body.className = "news-card-body";

            const title = document.createElement("h3");
            title.className = "news-card-title";
            title.textContent = article.title || "Bản tin";

            const date = document.createElement("div");
            date.className = "news-card-date";
            date.textContent = article.publishedDateText || "";
            if (!article.publishedDateText) {
                date.classList.add("is-hidden");
            }
            const action = document.createElement("div");
            action.className = "news-card-action";
            action.textContent = "Xem chi tiết";
            action.className = "news-card-action";
            action.textContent = "Xem chi tiết";

            body.appendChild(title);
            body.appendChild(date);
            body.appendChild(action);

            card.appendChild(media);
            card.appendChild(body);
            grid.appendChild(card);
        });
    }

    function renderEmpty(grid, message) {
        if (grid) {
            grid.innerHTML = `
                <div class="news-card">
                    <div class="news-card-body">
                        <h3 class="news-card-title">${escapeAttr(message)}</h3>
                        <div class="news-card-action">Vui lòng thử lại với tên file khác.</div>
                    </div>
                </div>
            `;
        }
    }

    function toggleLoadMoreButton(hidden) {
        const btn = byId("news-feed-load-more");
        if (!btn) return;
        btn.classList.toggle("is-hidden", Boolean(hidden));
        btn.disabled = Boolean(hidden);
    }

    async function loadNewsFeed(query) {
        const grid = byId("news-feed-grid");
        const q = String(query || "").trim();

        if (!api || typeof api.getNewsFeed !== "function") {
            renderEmpty(grid, "Chưa cấu hình kết nối server bản tin.");
            toggleLoadMoreButton(true);
            return;
        }

        try {
            // If streaming API is available, render each article as it arrives.
            if (api && typeof api.streamNewsFeed === "function") {
                grid.innerHTML = ""; // clear grid immediately
                let any = false;
                let buffer = [];
                let flushTimer = null;
                const FLUSH_DELAY = 60; // ms
                const WATCHDOG_TIMEOUT = 8000; // ms without progress before abort
                const WATCHDOG_POLL = 1000; // ms
                const seen = new Set();

                function flushBuffer() {
                    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
                    if (buffer.length) {
                        try {
                            renderCards(grid, buffer, { append: true });
                        } catch (e) {
                            console.warn('batch render failed', e);
                        }
                        buffer = [];
                    }
                }

                const controller = new AbortController();
                let lastProgress = Date.now();
                const watchdog = setInterval(() => {
                    try {
                        if (Date.now() - lastProgress > WATCHDOG_TIMEOUT) {
                            try { controller.abort(); } catch (e) {}
                        }
                    } catch (e) { /* ignore */ }
                }, WATCHDOG_POLL);

                try {
                    await api.streamNewsFeed(q, DEFAULT_LIMIT, "latest", (article) => {
                        if (!article) return;
                        const id = article.id || article.fileId || article.detailUrl || article.slug || article.title;
                        try { console.debug && console.debug('news-feed: received', id, article && article.title); } catch (e) {}
                        if (id && seen.has(id)) return;
                        if (id) seen.add(id);
                        buffer.push(article);
                        any = true;
                        lastProgress = Date.now();
                        if (!flushTimer) {
                            flushTimer = setTimeout(flushBuffer, FLUSH_DELAY);
                        }
                    }, { signal: controller.signal });
                } catch (err) {
                    console.warn('streamNewsFeed aborted or failed, attempting retries', err);
                    try {
                        // Try up to 3 retry attempts by asking server to resend the feed.
                        // Server will process sequentially if attempt >= 2.
                        let attempts = 0;
                        const MAX_ATTEMPTS = 3;
                        let totalReceived = seen.size || 0;

                        while (attempts < MAX_ATTEMPTS && totalReceived < DEFAULT_LIMIT) {
                            attempts++;
                            try {
                                // increase per-doc timeout to give server more time under CPU pressure
                                const resp = await api.retryNewsFeed({ q, limit: DEFAULT_LIMIT, source: 'latest', attempt: attempts, docTimeoutMs: 5000 });
                                const articles = (resp && Array.isArray(resp.articles)) ? resp.articles : [];
                                for (const a of articles) {
                                    const id = a.id || a.fileId || a.detailUrl || a.slug || a.title;
                                    if (id && seen.has(id)) continue;
                                    if (id) seen.add(id);
                                    buffer.push(a);
                                    totalReceived++;
                                }
                                if (articles.length) any = true;
                                if (!flushTimer) flushTimer = setTimeout(flushBuffer, FLUSH_DELAY);

                                if (totalReceived >= DEFAULT_LIMIT) break;
                            } catch (retryErr) {
                                console.warn('retryNewsFeed attempt failed', attempts, retryErr);
                                // continue to next attempt
                            }
                        }

                        // If after retries we still have fewer than the requested limit, fall back to full fetch
                        if (totalReceived < DEFAULT_LIMIT) {
                            try {
                                const data = await api.getNewsFeed(q, DEFAULT_LIMIT, "latest");
                                const articles = (data && Array.isArray(data.articles)) ? data.articles : [];
                                for (const a of articles) {
                                    const id = a.id || a.fileId || a.detailUrl || a.slug || a.title;
                                    if (id && seen.has(id)) continue;
                                    if (id) seen.add(id);
                                    buffer.push(a);
                                }
                                if (articles.length) any = true;
                                if (!flushTimer) {
                                    flushTimer = setTimeout(flushBuffer, FLUSH_DELAY);
                                }
                            } catch (e2) {
                                console.warn('fallback getNewsFeed failed', e2);
                            }
                        }
                    } catch (e) {
                        console.warn('retry logic failed', e);
                    }
                } finally {
                    clearInterval(watchdog);
                }

                // flush remaining
                flushBuffer();

                if (!any && !buffer.length) {
                    renderEmpty(
                        grid,
                        q ? "Không tìm thấy bản tin phù hợp." : "Chưa có bản tin để hiển thị.",
                    );
                    toggleLoadMoreButton(true);
                    return;
                }

                archiveLoaded = false;
                archiveVisible = false;
                toggleLoadMoreButton(Boolean(q));
                return;
            }

            // Fallback: existing API that returns all articles at once
            const data = await api.getNewsFeed(q, DEFAULT_LIMIT, "latest");
            const articles = (data && Array.isArray(data.articles)) ? data.articles : [];

            if (!articles.length) {
                renderEmpty(
                    grid,
                    q ? "Không tìm thấy bản tin phù hợp." : "Chưa có bản tin để hiển thị.",
                );
                toggleLoadMoreButton(true);
                return;
            }

            renderCards(grid, articles);
            archiveLoaded = false;
            archiveVisible = false;
            toggleLoadMoreButton(Boolean(q));
        } catch (error) {
            console.warn("loadNewsFeed error", error);
            renderEmpty(grid, "Không tải được mục bản tin.");
            toggleLoadMoreButton(true);
        }
    }

    async function loadArchiveNews() {
        const grid = byId("news-feed-grid");
        const btn = byId("news-feed-load-more");
        const input = byId("news-feed-query");
        if (!grid || !btn || archiveLoaded) return;
        if ((input && input.value && input.value.trim())) return;

        btn.disabled = true;
        btn.textContent = "Đang tải...";

        try {
            if (api && typeof api.streamNewsFeed === "function") {
                let any = false;
                let buffer = [];
                let flushTimer = null;
                const FLUSH_DELAY = 60; // ms
                const WATCHDOG_TIMEOUT = 12000; // ms for archive builds
                const WATCHDOG_POLL = 1000;
                const seen = new Set();
                const container = getArchiveContainer(grid);

                function flushBuffer() {
                    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
                    if (buffer.length) {
                        try {
                            renderCards(container, buffer, { append: true });
                        } catch (e) {
                            console.warn('batch render failed', e);
                        }
                        buffer = [];
                    }
                }

                const controller = new AbortController();
                let lastProgress = Date.now();
                const watchdog = setInterval(() => {
                    try {
                        if (Date.now() - lastProgress > WATCHDOG_TIMEOUT) {
                            try { controller.abort(); } catch (e) {}
                        }
                    } catch (e) { /* ignore */ }
                }, WATCHDOG_POLL);

                try {
                    await api.streamNewsFeed("", ARCHIVE_LIMIT, "archive", (article) => {
                        if (!article) return;
                        const id = article.id || article.fileId || article.detailUrl || article.slug || article.title;
                        try { console.debug && console.debug('news-archive: received', id, article && article.title); } catch (e) {}
                        if (id && seen.has(id)) return;
                        if (id) seen.add(id);
                        buffer.push(article);
                        any = true;
                        lastProgress = Date.now();
                        if (!flushTimer) {
                            flushTimer = setTimeout(flushBuffer, FLUSH_DELAY);
                        }
                    }, { signal: controller.signal });
                } catch (err) {
                    console.warn('archive stream failed, falling back', err);
                    try {
                        const data = await api.getNewsFeed("", ARCHIVE_LIMIT, "archive");
                        const articles = (data && Array.isArray(data.articles)) ? data.articles : [];
                        for (const a of articles) {
                            const id = a.id || a.fileId || a.detailUrl || a.slug || a.title;
                            if (id && seen.has(id)) continue;
                            if (id) seen.add(id);
                            buffer.push(a);
                        }
                        if (articles.length) any = true;
                        if (!flushTimer) {
                            flushTimer = setTimeout(flushBuffer, FLUSH_DELAY);
                        }
                    } catch (e2) {
                        console.warn('archive fallback failed', e2);
                    }
                } finally {
                    clearInterval(watchdog);
                }

                flushBuffer();

                if (any || buffer.length) {
                    archiveLoaded = true;
                    archiveVisible = true;
                    btn.textContent = "Thu gọn";
                    btn.disabled = false;
                } else {
                    btn.textContent = "Không còn bản tin";
                    btn.disabled = true;
                }
            } else {
                const data = await api.getNewsFeed("", ARCHIVE_LIMIT, "archive");
                const articles = (data && Array.isArray(data.articles)) ? data.articles : [];

                if (articles.length) {
                    const container = getArchiveContainer(grid);
                    renderCards(container, articles, { append: true });
                    archiveLoaded = true;
                    archiveVisible = true;
                    btn.textContent = "Thu gọn";
                    btn.disabled = false;
                } else {
                    btn.textContent = "Không còn bản tin";
                    btn.disabled = true;
                }
            }
        } catch (error) {
            console.warn("loadArchiveNews error", error);
            btn.disabled = false;
            btn.textContent = "Xem thêm";
        }
    }

    function initNewsFeed() {
        const input = byId("news-feed-query");
        const submit = byId("news-feed-submit");
        const moreLink = byId("news-feed-more");
        const loadMoreBtn = byId("news-feed-load-more");
        if (!input || !submit) return;

        let timerId = null;
        let isComposing = false;

        const triggerSearch = () => {
            const value = (input.value || "").trim();
            loadNewsFeed(value);
        };

        submit.addEventListener("click", () => {
            clearTimeout(timerId);
            triggerSearch();
        });

        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                clearTimeout(timerId);
                triggerSearch();
            }
        });

        input.addEventListener("compositionstart", () => {
            isComposing = true;
        });

        input.addEventListener("compositionend", () => {
            isComposing = false;
            clearTimeout(timerId);
            timerId = setTimeout(triggerSearch, 120);
        });

        input.addEventListener("input", () => {
            if (isComposing) return;
            clearTimeout(timerId);
            timerId = setTimeout(triggerSearch, 260);
        });

        if (moreLink) {
            moreLink.addEventListener("click", (event) => {
                event.preventDefault();
                const navLink = document.getElementById("tm-gallery-link") ||
                    document.querySelector('a[href="#gallery"]');
                if (navLink) navLink.click();
            });
        }

        if (loadMoreBtn) {
            loadMoreBtn.addEventListener("click", () => {
                const grid = byId("news-feed-grid");
                if (!archiveLoaded) {
                    loadArchiveNews();
                    return;
                }

                const container = getArchiveContainer(grid);
                archiveVisible = !archiveVisible;
                container.classList.toggle("is-hidden", !archiveVisible);
                loadMoreBtn.textContent = archiveVisible ? "Thu gọn" : "Xem thêm";
            });
        }

        loadNewsFeed("");
    }

    document.addEventListener("DOMContentLoaded", initNewsFeed);
})(typeof window !== "undefined" ? window : globalThis);