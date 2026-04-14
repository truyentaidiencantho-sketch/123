const APP_API_CLIENT =
    (typeof window !== 'undefined' && window.APP_API) ? window.APP_API : null;
const ROOT_KEYS = {
    library: 'library',
    news: 'news',
    admin: 'admin',
    video: 'video',
};
const DOC_KEYS = {
    intro: 'intro',
};

// Flag to remember admin auth during this page session (reset on reload)
let ADMIN_AUTHENTICATED = false;

// Heroicons CDN base + helper to render inline <img> icons
const HI_BASE = "https://unpkg.com/heroicons@2.1.5/24/outline/";
const hi = (name, extraClass = "") => `<img src="${HI_BASE}${name}.svg" alt="" class="hi-icon${extraClass ? " " + extraClass : ""}">`;

// Last Drive error (for debugging)
let lastDriveError = null;

let currentFolder = "";
let pathStack = [];
// navigation history for main library (used by breadcrumb Prev/Next)
let libraryHistory = [];
let libraryHistoryIndex = -1;

function getApiClient() {
    if (!APP_API_CLIENT || !APP_API_CLIENT.hasProxy || !APP_API_CLIENT.hasProxy()) {
        throw new Error(
            "Chua cau hinh server trung gian trong js/api.js",
        );
    }

    return APP_API_CLIENT;
}

async function fetchRootFolder(rootKey) {
    return getApiClient().getRootFolder(rootKey);
}

async function exportDriveText(fileId, mimeType) {
    return getApiClient().exportDriveText(fileId, mimeType);
}

async function exportNamedText(docKey, mimeType) {
    return getApiClient().exportNamedText(docKey, mimeType);
}

async function verifyAdminPassword(password) {
    return getApiClient().verifyAdminPassword(password);
}

async function openLibraryRoot() {
    const root = await fetchRootFolder(ROOT_KEYS.library);
    await loadFolder(root.folderId, "Thư viện", true);
}

async function openCustomRoot(rootKey, folderName, containerId, breadcrumbId) {
    const root = await fetchRootFolder(rootKey);
    await loadFolderCustom(
        root.folderId,
        folderName,
        true,
        containerId,
        breadcrumbId,
    );
}

/* ================= LOAD FOLDER ================= */
async function loadFolder(folderId, folderName = "Thư viện", reset = false, pushHistory = true) {

    if (reset) {
        pathStack = [{ id: folderId, name: folderName }];
    } else {
        const last = pathStack[pathStack.length - 1];
        if (!last || last.id !== folderId) {
            pathStack.push({ id: folderId, name: folderName });
        }
    }

    currentFolder = folderId;

    try {
        const files = await fetchFilesInFolder(folderId);
        // render immediate children for the folder view
        renderFiles(files);
        renderBreadcrumb();

        // [COPILOT-EDIT] Do not fetch recursive file list on client anymore.
        // Server will perform recursive search; client keeps only immediate children.
        const container = document.getElementById('library');
        if (container) {
            container._files = files; // immediate children only
        }

        // initialize search UI for library
        setupSearch('library', 'library-search', 'breadcrumb');

        // update navigation history (push snapshot) when requested
        try {
            if (pushHistory) {
                if (!Array.isArray(libraryHistory)) libraryHistory = [];
                if (reset) {
                    libraryHistory = [{ folderId, folderName, path: JSON.parse(JSON.stringify(pathStack)) }];
                    libraryHistoryIndex = 0;
                } else {
                    // truncate forward history
                    libraryHistory = libraryHistory.slice(0, Math.max(0, libraryHistoryIndex + 1));
                    libraryHistory.push({ folderId, folderName, path: JSON.parse(JSON.stringify(pathStack)) });
                    libraryHistoryIndex = libraryHistory.length - 1;
                }
            }
        } catch (e) {
            console.warn('Error updating library history', e);
        }

        // re-render breadcrumb so Prev/Next button states update
        renderBreadcrumb();
    } catch (err) {
        document.getElementById("library").innerHTML =
            "<p style='padding:20px'>Không tải được dữ liệu.</p>";
    }
}


/* ================= RENDER FILES ================= */
function renderFiles(files) {

    const container = document.getElementById("library");
    container.innerHTML = "";

    files.forEach(file => {

        const div = document.createElement("div");

        // ===== FOLDER =====
        if (file.mimeType === "application/vnd.google-apps.folder") {

            div.className = "library-item library-folder";

            div.innerHTML = `
                <div class="library-left">
                    <span class="icon-pill pill-folder">${hi('folder')}</span>
                    <span class="folder-name">${file.name}</span>
                </div>
            `;

            div.onclick = () => loadFolder(file.id, file.name);
        }

        // ===== FILE =====
        else {

            div.className = "library-item library-file";

            const iconData = getFileIconData(file.name);

            div.innerHTML = `
                <div class="library-left">
                    <span class="icon-pill ${iconData.pill}">${hi(iconData.slug)}</span>
                    <span class="file-name">${file.name}</span>
                </div>

                <div class="library-actions">
                    <button class="view-btn"
                        onclick="openPreview('${file.id}')">
                        ${hi('eye','hi-icon-btn')} <span>Xem</span>
                    </button>

                    <a class="download-btn"
                       href="https://drive.google.com/uc?id=${file.id}&export=download"
                       target="_blank">
                       ${hi('arrow-down-tray','hi-icon-btn')} <span>Tải</span>
                    </a>
                </div>
            `;
        }

        container.appendChild(div);
    });
}


/* ================= ICON THEO FILE (Heroicons) ================= */
function getFileIconData(name) {

    const ext = (name || "").split(".").pop().toLowerCase();

    if (["jpg", "jpeg", "png", "gif", "webp", "avif"].includes(ext)) return { slug: "photo", pill: "pill-green" };
    if (["pdf"].includes(ext)) return { slug: "document-text", pill: "pill-red" };
    if (["doc", "docx"].includes(ext)) return { slug: "document-text", pill: "pill-blue" };
    if (["xls", "xlsx", "csv"].includes(ext)) return { slug: "chart-bar", pill: "pill-emerald" };
    if (["ppt", "pptx"].includes(ext)) return { slug: "chart-bar", pill: "pill-amber" };

    return { slug: "document", pill: "pill-slate" };
}


/* ================= BREADCRUMB ================= */
function renderBreadcrumb() {

    const breadcrumb = document.getElementById("breadcrumb");
    if (!breadcrumb) return;
    breadcrumb.innerHTML = "";

    const navWrap = document.createElement('div');
    navWrap.style.display = 'flex';
    navWrap.style.alignItems = 'center';
    navWrap.style.gap = '8px';

    const backBtn = document.createElement('button');
    backBtn.className = 'library-nav-btn';
    backBtn.innerHTML = hi('chevron-left','hi-icon-btn');
    backBtn.disabled = !(Array.isArray(libraryHistory) && libraryHistoryIndex > 0);
    backBtn.onclick = () => libraryGoBack();

    const fwdBtn = document.createElement('button');
    fwdBtn.className = 'library-nav-btn';
    fwdBtn.innerHTML = hi('chevron-right','hi-icon-btn');
    fwdBtn.disabled = !(Array.isArray(libraryHistory) && libraryHistoryIndex < libraryHistory.length - 1);
    fwdBtn.onclick = () => libraryGoForward();

    navWrap.appendChild(backBtn);
    navWrap.appendChild(fwdBtn);

    const crumbContainer = document.createElement('div');
    crumbContainer.style.fontWeight = '600';
    crumbContainer.style.marginLeft = '8px';

    pathStack.forEach((item, index) => {
        const span = document.createElement('span');
        span.innerText = item.name;
        span.className = 'breadcrumb-item';

        span.onclick = async () => {
            pathStack = pathStack.slice(0, index + 1);
            currentFolder = item.id;
            const files = await fetchFilesInFolder(item.id);
            renderFiles(files);

            // push breadcrumb navigation into history as a new snapshot
            try {
                if (!Array.isArray(libraryHistory)) libraryHistory = [];
                libraryHistory = libraryHistory.slice(0, Math.max(0, libraryHistoryIndex + 1));
                libraryHistory.push({ folderId: item.id, folderName: item.name, path: JSON.parse(JSON.stringify(pathStack)) });
                libraryHistoryIndex = libraryHistory.length - 1;
            } catch (e) {
                console.warn('Error updating history from breadcrumb click', e);
            }

            renderBreadcrumb();
        };

        crumbContainer.appendChild(span);
        if (index < pathStack.length - 1) crumbContainer.appendChild(document.createTextNode(' / '));
    });

    navWrap.appendChild(crumbContainer);
    breadcrumb.appendChild(navWrap);
}


/* ================= PREVIEW MODAL ================= */
function openPreview(fileId) {

    const modal = document.getElementById("previewModal");
    const frame = document.getElementById("previewFrame");
    const img = document.getElementById("previewImg");

    // hide image preview if any
    if (img) { img.style.display = 'none'; img.src = ''; }

    if (frame) {
        frame.style.display = 'block';
        frame.src = `https://drive.google.com/file/d/${fileId}/preview`;
    }

    if (modal) modal.style.display = 'flex';
    try { document.body.style.overflow = 'hidden'; } catch (e) {}
}

// Open a direct image/URL in the same preview modal
function openDirectPreview(url, altText) {
    const modal = document.getElementById("previewModal");
    const frame = document.getElementById("previewFrame");
    const img = document.getElementById("previewImg");

    if (!modal) return;
    // hide both initially
    if (img) { img.style.display = 'none'; img.src = ''; }
    if (frame) { frame.style.display = 'none'; frame.src = ''; }

    // attempt to load as an image first (fast fail)
    const loader = new Image();
    let settled = false;
    const onLoadedImage = () => {
        if (settled) return; settled = true; clearTimeout(t);
        if (img) {
            img.src = url;
            img.alt = altText || '';
            img.style.display = 'block';
        }
        if (frame) { frame.style.display = 'none'; frame.src = ''; }
        if (modal) modal.style.display = 'flex';
        try { document.body.style.overflow = 'hidden'; } catch (e) {}
    };
    const onImageError = () => {
        if (settled) return; settled = true; clearTimeout(t);
        // fallback: if URL looks like a Drive file, try the Drive preview iframe
        const idMatch = (url && url.match && (url.match(/\/d\/([a-zA-Z0-9_-]{10,})/) || url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)));
        const fileId = idMatch ? idMatch[1] : null;
        if (fileId && frame) {
            frame.src = `https://drive.google.com/file/d/${fileId}/preview`;
            frame.style.display = 'block';
            if (modal) modal.style.display = 'flex';
            try { document.body.style.overflow = 'hidden'; } catch (e) {}
            return;
        }

        // last resort: show iframe with the original URL (may show an HTML page)
        if (frame) {
            frame.src = url;
            frame.style.display = 'block';
            if (modal) modal.style.display = 'flex';
            try { document.body.style.overflow = 'hidden'; } catch (e) {}
            return;
        }
    };

    loader.onload = onLoadedImage;
    loader.onerror = onImageError;
    // set a timeout so we don't wait forever
    const t = setTimeout(() => { if (!settled) { loader.onerror(); } }, 6000);
    try { loader.src = url; } catch (e) { onImageError(); }
}

function closePreview() {
    const modal = document.getElementById("previewModal");
    const frame = document.getElementById("previewFrame");
    const img = document.getElementById("previewImg");

    if (frame) { try { frame.src = ''; frame.style.display = 'none'; } catch (e) {} }
    if (img) { try { img.src = ''; img.style.display = 'none'; } catch (e) {} }
    if (modal) modal.style.display = 'none';
    try { document.body.style.overflow = ''; } catch (e) {}
}

// Close modal when clicking overlay or pressing Escape
document.addEventListener('click', function(e) {
    const modal = document.getElementById('previewModal');
    if (!modal) return;
    if (modal.style.display === 'flex' && e.target === modal) closePreview();
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closePreview();
});

/* ================= DRIVE HELPERS (for gallery / quancao) ================= */
async function fetchFilesInFolder(folderId) {
    try {
        return await getApiClient().listDriveFiles(folderId);
    } catch (err) {
        console.warn('fetchFilesInFolder error', err);
        lastDriveError = { source: 'proxyApi', error: String(err) };
        throw err;
    }
}

function getDriveImageUrl(fileId) {
    // Use export=view so the image can be embedded in an <img> tag.
    // (export=download may redirect to an HTML confirmation page for some files)
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
}

function formatDurationMs(ms) {
    if (!ms && ms !== 0) return '';
    const s = Math.floor(Number(ms) / 1000);
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = n => String(n).padStart(2, '0');
    if (hh > 0) return `${hh}:${pad(mm)}:${pad(ss)}`;
    return `${mm}:${pad(ss)}`;
}

async function getDriveImageUrlsFromFolder(folderId) {
    const files = await fetchFilesInFolder(folderId);
    const images = (files || []).filter(f => (f.mimeType && f.mimeType.startsWith('image/')) || f.thumbnailLink || f.webContentLink || f.url);

    return images.map(f => {
        // Prefer explicit URL (Apps Script), then thumbnail (usually public), then Drive full links, then constructed view URL
        const url = (f.url && f.url.trim()) || f.thumbnailLink || f.webContentLink || f.webViewLink || (f.id ? getDriveImageUrl(f.id) : '');
        return { id: f.id, name: f.name, url };
    });
}

/**
 * Recursively fetch all files under a folder (including files in nested subfolders).
 * Returns a flat array of file objects. Adds a `_path` string reflecting folder names from
 * the root folder passed to this function (not Drive root).
 */
async function fetchFilesRecursively(rootFolderId) {
    const visited = new Set();
    const results = [];

    async function walk(folderId, pathParts) {
        if (!folderId || visited.has(folderId)) return;
        visited.add(folderId);

        let children = [];
        try {
            children = await fetchFilesInFolder(folderId) || [];
        } catch (err) {
            console.warn('fetchFilesRecursively: error fetching', folderId, err);
            return;
        }

        for (const item of children) {
            // annotate path for each item (useful for debugging or showing location)
            const annotated = Object.assign({}, item);
            annotated._path = pathParts.length ? pathParts.join('/') : '';
            results.push(annotated);

            if (item.mimeType === 'application/vnd.google-apps.folder') {
                // descend into subfolder
                await walk(item.id, pathParts.concat(item.name || item.id));
            }
        }
    }

    await walk(rootFolderId, []);
    return results;
}


/* ================= LOAD INTRO FROM GOOGLE DOC ================= */
async function loadIntroFromGoogleDoc() {
    const container = document.querySelector('#intro .intro-columns');
    if (!container) return;
    const textContainer = container.querySelector('.intro-text') || container;

    try {
        // Prefer intermediary server exports to avoid browser-side Drive API calls.
        let html = null;

        try {
            html = await exportNamedText(DOC_KEYS.intro, 'text/html');
        } catch (e) { /* fallback */ }

        if (!html) {
            // plain-text fallback
            const txt = await exportNamedText(DOC_KEYS.intro, 'text/plain');
            const paragraphs = txt.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
            const combinedHtml = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
            textContainer.innerHTML = combinedHtml;
            return;
        }

        // Parse HTML and collect block nodes; preserve markup
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const selector = 'p, h1, h2, h3, h4, h5, h6, ul, ol, blockquote, pre, table';
        let nodes = Array.from(doc.querySelectorAll(selector)).filter(n => n.textContent && n.textContent.trim());

        if (!nodes.length) {
            const raw = (doc.body && doc.body.textContent) ? doc.body.textContent : '';
            const paragraphs = raw.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
            const combinedHtml = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');
            textContainer.innerHTML = combinedHtml;
            return;
        }

        // Combine all blocks into one HTML string so CSS multi-column can balance them
        const combinedHtml = nodes.map(n => n.outerHTML.trim()).join('');
        textContainer.innerHTML = combinedHtml;

    } catch (err) {
        console.warn('loadIntroFromGoogleDoc error', err);
    }
}

// escape HTML for plain-text fallback
function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


/* ================= RESET POPUP ================= */
document.addEventListener("DOMContentLoaded", function () {

    const libraryLink = document.querySelector('a[href="#library-popup"]');
    const closeBtn = document.querySelector("#library-popup .tm-close-popup");

    // Setup "Bản tin & Kế hoạch" popup to load from Drive (select by id so href can be external)
    const galleryLink = document.querySelector('#tm-gallery-link');

    if (libraryLink) {
        libraryLink.addEventListener("click", function (e) {
            e.preventDefault();
            openLibraryRoot();
        });
    }

    if (galleryLink) {
        // If the nav link points to an external Drive URL, let the browser navigate there.
        const galleryHref = galleryLink.getAttribute('href') || '';
        if (!/^https?:\/\//i.test(galleryHref)) {
            galleryLink.addEventListener('click', function (e) {
                e.preventDefault();
                openCustomRoot(
                    ROOT_KEYS.news,
                    'Bản tin & Kế hoạch',
                    'bantin',
                    'bantin-breadcrumb',
                );
            });
        }
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", function (e) {
            e.preventDefault();
            currentFolder = "";
            pathStack = [];
        });
    }

    // Setup "Thư mục admin" (about) popup to load from a separate Drive folder
    const quyDinhLink = document.querySelector('a[href="#about"]');

    // Show password prompt (Magnific inline) and validate against doc passwords.
    // Authentication is per-interaction; reloading the page will require entering the password again.
    function openAdminPasswordPrompt(folderId) {
        // If already authenticated in this session, skip prompt
        if (ADMIN_AUTHENTICATED) {
            loadFolderCustom(folderId, 'Thư mục admin', true, 'quydinh', 'quydinh-breadcrumb')
                .then(() => $.magnificPopup.open({ items: { src: '#about' }, type: 'inline', showCloseBtn: false }))
                .catch(err => {
                    console.warn('Error opening admin after cached auth', err);
                    alert('Lỗi khi mở thư mục admin.');
                });
            return;
        }
        if (typeof $ === 'undefined' || !$.magnificPopup) {
            // fallback: directly open admin (best-effort)
            loadFolderCustom(folderId, 'Thư mục admin', true, 'quydinh', 'quydinh-breadcrumb');
            return;
        }

        $.magnificPopup.open({
            items: { src: '#admin-pass-prompt' },
            type: 'inline',
            showCloseBtn: false,
            callbacks: {
                open: function() {
                    const inp = document.getElementById('admin-pass-input');
                    const msg = document.getElementById('admin-pass-message');
                    const okBtn = document.getElementById('admin-pass-submit');
                    const cancelBtn = document.getElementById('admin-pass-cancel');

                    const onCancel = () => { if (msg) msg.textContent = ''; if (inp) inp.value = ''; $.magnificPopup.close(); };

                    cancelBtn.onclick = onCancel;

                    const onEnter = (ev) => { if (ev.key === 'Enter') okBtn.click(); };
                    if (inp) { inp.addEventListener('keydown', onEnter); inp._onEnter = onEnter; }

                    okBtn.onclick = async function () {
                        if (msg) msg.textContent = '';
                        const val = (inp && inp.value) ? inp.value.trim() : '';
                        if (!val) { if (msg) msg.textContent = 'Vui lòng nhập mật khẩu.'; return; }
                        if (msg) msg.textContent = 'Đang kiểm tra...';
                        let result = null;
                        try {
                            // Kiểm tra mật khẩu ở server
                            result = await verifyAdminPassword(val);
                        } catch (err) {
                            if (msg) msg.textContent = 'Không kiểm tra được mật khẩu. Vui lòng thử lại sau.';
                            console.warn('verifyAdminPassword error', err);
                            return;
                        }
                        if (result && result.ok) {
                            ADMIN_AUTHENTICATED = true;
                            if (msg) msg.textContent = 'Đã nhập đúng mật khẩu, vui lòng đợi trong giây lát...';
                            // load admin folder then open the about popup
                            try {
                                await loadFolderCustom(folderId, 'Thư mục admin', true, 'quydinh', 'quydinh-breadcrumb');
                                $.magnificPopup.close();
                                $.magnificPopup.open({ items: { src: '#about' }, type: 'inline', showCloseBtn: false });
                            } catch (e) {
                                console.warn('Error loading admin folder after auth', e);
                                alert('Lỗi khi mở thư mục admin.');
                            }
                        } else {
                            if (msg) msg.textContent = 'Mật khẩu không đúng.';
                        }
                    };
                },
                close: function() {
                    // cleanup
                    const inp = document.getElementById('admin-pass-input');
                    const msg = document.getElementById('admin-pass-message');
                    const okBtn = document.getElementById('admin-pass-submit');
                    const cancelBtn = document.getElementById('admin-pass-cancel');
                    if (okBtn) okBtn.onclick = null;
                    if (cancelBtn) cancelBtn.onclick = null;
                    if (inp) { if (inp._onEnter) { inp.removeEventListener('keydown', inp._onEnter); delete inp._onEnter; } inp.value = ''; }
                    if (msg) msg.textContent = '';
                }
            }
        });
    }

    if (quyDinhLink) {
        quyDinhLink.addEventListener('click', function (e) {
            e.preventDefault();
            fetchRootFolder(ROOT_KEYS.admin)
                .then((root) => openAdminPasswordPrompt(root.folderId))
                .catch((err) => console.warn('Failed to load admin root', err));
        });
    }

    // Setup Video popup to load from provided Drive folder
    const videoLink = document.querySelector('a[href="#video-popup"]');
    if (videoLink) {
        videoLink.addEventListener('click', function (e) {
            e.preventDefault();
            openCustomRoot(ROOT_KEYS.video, 'Video', 'video', 'video-breadcrumb');
        });
    }

    const aboutCloseBtn = document.querySelector('#about .tm-close-popup');
    if (aboutCloseBtn) {
        aboutCloseBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const c = document.getElementById('quydinh');
            if (c) c._pathStack = [];
        });
    }

    // Load "Giới thiệu" text from a Google Doc and split into two columns
    // The document should be public or exported via an Apps Script endpoint
    try {
        loadIntroFromGoogleDoc();
    } catch (err) {
        console.warn('Failed to load intro doc', err);
    }

});

/* ================= CUSTOM FOLDER LOADER (for other popups) ================= */
async function loadFolderCustom(folderId, folderName = "Thư mục admin", reset = false, containerId = "quydinh", breadcrumbId = "quydinh-breadcrumb", pushHistory = true) {
    const container = document.getElementById(containerId);
    const breadcrumb = document.getElementById(breadcrumbId);

    if (!container) return;

    // Manage a per-container path stack stored on the element
    let pathStackLocal = container._pathStack || [];
    if (reset) {
        pathStackLocal = [{ id: folderId, name: folderName }];
    } else {
        const last = pathStackLocal[pathStackLocal.length - 1];
        if (!last || last.id !== folderId) {
            pathStackLocal.push({ id: folderId, name: folderName });
        }
    }
    container._pathStack = pathStackLocal;

    container.innerHTML = "<p style='padding:20px'>Đang tải dữ liệu...</p>";

    try {
        const files = await fetchFilesInFolder(folderId);
        // [COPILOT-EDIT] Avoid fetching recursive files on client; server will handle global search.
        const allFiles = files || [];

        container.innerHTML = "";

        // For video container render a compact list (thumbnail left, title right)
        let listEl = null;
        if (containerId === 'video') {
            listEl = document.createElement('div');
            listEl.className = 'video-list';
        }

        (files || []).forEach(file => {
            const div = document.createElement('div');
            const ext = (file.name || '').split('.').pop().toLowerCase();
            const isVideo = (file.mimeType && file.mimeType.startsWith('video')) || ['mp4','webm','ogg','mov'].includes(ext);

            if (file.mimeType === 'application/vnd.google-apps.folder') {
                div.className = 'library-item library-folder';
                div.innerHTML = `
                    <div class="thumb-col">
                        <span class="icon-pill pill-folder">${hi('folder')}</span>
                    </div>
                    <div class="meta-col">
                        <div class="folder-name">${file.name}</div>
                    </div>
                `;
                div.onclick = () => loadFolderCustom(file.id, file.name, false, containerId, breadcrumbId);
                container.appendChild(div);
                return;
            }

            if (containerId === 'video' && isVideo) {
                const thumb = (file.url && file.url.trim()) || file.thumbnailLink || file.webContentLink || file.webViewLink || (file.id ? getDriveImageUrl(file.id) : '');
                const duration = (file.videoMediaMetadata && file.videoMediaMetadata.durationMillis) ? formatDurationMs(file.videoMediaMetadata.durationMillis) : '';

                div.className = 'video-list-item';
                div.innerHTML = `
                    <div class="video-thumb-col">
                        <div class="thumb-small">
                            <img src="${thumb}" alt="${file.name}" class="video-thumb-small" />
                            ${duration ? `<span class="duration-badge">${duration}</span>` : ``}
                        </div>
                    </div>
                    <div class="meta-col">
                        <div class="video-title">${file.name}</div>
                        <div class="video-sub">Video</div>
                    </div>
                    <div class="actions-col">
                        <button class="view-btn small video-open-btn">${hi('play-circle','hi-icon-btn')} <span>Xem</span></button>
                        <a class="download-btn small" href="https://drive.google.com/uc?id=${file.id}&export=download" target="_blank">${hi('arrow-down-tray','hi-icon-btn')} <span>Tải về</span></a>
                    </div>
                `;

                const openBtn = div.querySelector('.video-open-btn');
                if (openBtn) openBtn.addEventListener('click', () => openVideoPlayer(file.id, file.name, thumb, file.webContentLink));

                if (listEl) listEl.appendChild(div);
            } else {
                const iconData = getFileIconData(file.name || '');
                div.className = 'library-item library-file';
                    div.innerHTML = `
                        <div class="thumb-col">
                            <span class="icon-pill ${iconData.pill}">${hi(iconData.slug)}</span>
                        </div>
                        <div class="meta-col">
                            <div class="file-name">${file.name}</div>
                            <div class="file-sub">Tài liệu</div>
                        </div>
                        <div class="actions-col library-actions">
                            <button class="view-btn" onclick="openPreview('${file.id}')">
                                ${hi('eye','hi-icon-btn')} <span>Xem</span>
                            </button>

                            <a class="download-btn" href="https://drive.google.com/uc?id=${file.id}&export=download" target="_blank">
                               ${hi('arrow-down-tray','hi-icon-btn')} <span>Tải về</span>
                            </a>
                        </div>
                    `;

                    container.appendChild(div);
            }
        });

        if (listEl) container.appendChild(listEl);

        // [COPILOT-EDIT] Store only immediate children; server search will be used for global queries
        container._files = allFiles || (files || []);
        setupSearch(containerId, containerId + '-search', breadcrumbId);

        // update per-container navigation history
        try {
            if (!Array.isArray(container._history)) container._history = [];
            if (pushHistory) {
                const curIndex = Number.isInteger(container._historyIndex) ? container._historyIndex : -1;
                if (reset || curIndex === -1) {
                    container._history = [{ folderId, folderName, path: JSON.parse(JSON.stringify(container._pathStack)) }];
                    container._historyIndex = 0;
                } else {
                    container._history = container._history.slice(0, Math.max(0, curIndex + 1));
                    container._history.push({ folderId, folderName, path: JSON.parse(JSON.stringify(container._pathStack)) });
                    container._historyIndex = container._history.length - 1;
                }
            }
        } catch (e) {
            console.warn('Error updating container history', e);
        }

        // render breadcrumb + Prev/Next buttons for this container
        if (breadcrumb) {
            breadcrumb.innerHTML = '';

            const navWrap = document.createElement('div');
            navWrap.style.display = 'flex';
            navWrap.style.alignItems = 'center';
            navWrap.style.gap = '8px';

            const backBtn = document.createElement('button');
            backBtn.className = 'library-nav-btn';
            backBtn.innerHTML = hi('chevron-left','hi-icon-btn');
            const idx = Number.isInteger(container._historyIndex) ? container._historyIndex : -1;
            backBtn.disabled = !Array.isArray(container._history) || idx <= 0;
            backBtn.onclick = () => customGoBack(containerId, breadcrumbId);

            const fwdBtn = document.createElement('button');
            fwdBtn.className = 'library-nav-btn';
            fwdBtn.innerHTML = hi('chevron-right','hi-icon-btn');
            fwdBtn.disabled = !Array.isArray(container._history) || idx >= (container._history.length - 1);
            fwdBtn.onclick = () => customGoForward(containerId, breadcrumbId);

            navWrap.appendChild(backBtn);
            navWrap.appendChild(fwdBtn);

            const crumbContainer = document.createElement('div');
            crumbContainer.style.fontWeight = '600';
            crumbContainer.style.marginLeft = '8px';

            const ps = container._pathStack || [];
            ps.forEach((item, index) => {
                const span = document.createElement('span');
                span.innerText = item.name;
                span.className = 'breadcrumb-item';
                span.onclick = async () => {
                    container._pathStack = (container._pathStack || []).slice(0, index + 1);
                    await loadFolderCustom(item.id, item.name, false, containerId, breadcrumbId);
                };

                crumbContainer.appendChild(span);
                if (index < ps.length - 1) crumbContainer.appendChild(document.createTextNode(' / '));
            });

            navWrap.appendChild(crumbContainer);
            breadcrumb.appendChild(navWrap);
        }

    } catch (err) {
        container.innerHTML = "<p style='padding:20px'>Không tải được dữ liệu.</p>";
    }
}

/* ================= SEARCH UI + LOGIC ================= */
function setupSearch(containerId, searchPlaceholderId, breadcrumbId) {
    const placeholder = document.getElementById(searchPlaceholderId);
    const container = document.getElementById(containerId);
    if (!placeholder || !container) return;

    // If already initialized, do nothing
    if (placeholder._initialized) return;
    placeholder._initialized = true;

    // create search box
    placeholder.innerHTML = `
        <div class="library-search-box">
            <input type="search" class="library-search-input" placeholder="Tìm file theo tên, chữ cái đầu, hoặc số..." />
            <button class="library-search-btn">${hi('magnifying-glass','hi-icon-btn')}</button>
        </div>
        <div class="library-search-hint" style="font-size:15px;color:#c00;margin-top:6px;font-weight:700;">Vui lòng nhập ít nhất 2 từ để tìm kiếm.</div>
        <div class="library-search-results" aria-live="polite"></div>
    `;

    const input = placeholder.querySelector('.library-search-input');
    const btn = placeholder.querySelector('.library-search-btn');
    const resultsBox = placeholder.querySelector('.library-search-results');

    function doSearch() {
        const q = (input.value || '').trim();
        performSearch(containerId, q, resultsBox, breadcrumbId);
    }

    // debounce + IME (composition) handling to support Vietnamese typing
    let t;
    let isComposing = false;

    input.addEventListener('compositionstart', () => { isComposing = true; });
    input.addEventListener('compositionend', (e) => { isComposing = false; clearTimeout(t); doSearch(); });

    input.addEventListener('input', () => {
        if (isComposing) return; // skip interim composition events
        clearTimeout(t);
        t = setTimeout(doSearch, 220);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            clearTimeout(t);
            doSearch();
        }
    });

    // clicking the button still triggers an immediate search
    btn.addEventListener('click', () => { clearTimeout(t); doSearch(); });
}

// [COPILOT-EDIT] performSearch now queries server-side search and scores results locally
async function performSearch(containerId, query, resultsBox, breadcrumbId) {
    resultsBox = resultsBox || document.querySelector('#' + containerId + '-search .library-search-results');
    const container = document.getElementById(containerId);
    if (!container) return;
    const qRaw = (query || '').trim();
    const q = qRaw.toLowerCase();

    resultsBox.innerHTML = '';
    // [COPILOT-EDIT] Require at least 2 words to activate search
    const tokens = qRaw.split(/\s+/).filter(Boolean);
    if (!q || tokens.length < 2) {
        resultsBox.innerHTML = '<p style="padding:8px;color:#666">Vui lòng nhập ít nhất 2 từ để tìm kiếm.</p>';
        return;
    }

    // Attempt server-side batched search first (search only within the current folder)
    let files = [];
    let isServerResults = false;
    try {
        const api = getApiClient();
        const folderId = (containerId === 'library') ? currentFolder : ((container._pathStack && container._pathStack.length) ? container._pathStack[container._pathStack.length - 1].id : '');
        resultsBox.innerHTML = '<p style="padding:8px;color:#666">Đang tìm...</p>';
        // [COPILOT-EDIT] pass batchSize, threshold and timeout to server
        const data = await api.searchDriveFiles(qRaw, folderId, undefined, { batchSize: 50, threshold: 0.6, timeoutMs: 7000, minWords: 2 });
        // Debug: log raw server response so we can inspect ordering and scores
        try { console.log('searchDriveFiles response', data); } catch (e) {}
        if (data && Array.isArray(data.results)) { files = data.results; isServerResults = true; }
        else if (data && Array.isArray(data.files)) { files = data.files; isServerResults = true; }
        else if (Array.isArray(data)) { files = data; isServerResults = true; }
    } catch (err) {
        console.warn('performSearch: server search failed, falling back to client-side list', err);
        files = container._files || [];
    }

    // scoring (same logic as before for client fallback)
    function isSubsequence(a, b) {
        let i = 0, j = 0;
        while (i < a.length && j < b.length) {
            if (a[i] === b[j]) i++; j++;
        }
        return i === a.length;
    }

    function initialsOf(name) {
        return (name.split(/[^a-z0-9]+/i).filter(Boolean).map(s => s[0]).join('')).toLowerCase();
    }

    function levenshtein(a, b) {
        a = a || '';
        b = b || '';
        const m = a.length, n = b.length;
        if (m === 0) return n;
        if (n === 0) return m;
        const dp = Array.from({length: m+1}, () => new Array(n+1));
        for (let i=0;i<=m;i++) dp[i][0]=i;
        for (let j=0;j<=n;j++) dp[0][j]=j;
        for (let i=1;i<=m;i++){
            for (let j=1;j<=n;j++){
                const cost = a[i-1]===b[j-1]?0:1;
                dp[i][j] = Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
            }
        }
        return dp[m][n];
    }

    let list = document.createElement('div');
    list.className = 'library-search-results-list';

    if (isServerResults) {
        // Server already returned filtered matches (with `_score`), sort by score
        if (!files || files.length === 0) {
            resultsBox.innerHTML = '<p style="padding:8px;color:#666">Không tìm thấy kết quả.</p>';
            return;
        }

        files.sort((a,b) => (b._matchExact || 0) - (a._matchExact || 0) || (b._score || 0) - (a._score || 0) || ((a.name||'').localeCompare(b.name||'')));
        const top = files.slice(0, 5);

        top.forEach(f => {
        const row = document.createElement('div');
        const ext = (f.name || '').split('.').pop().toLowerCase();
        const isVideo = (f.mimeType && f.mimeType.startsWith('video')) || ['mp4','webm','ogg','mov'].includes(ext);

        if (containerId === 'video' && isVideo) {
            row.className = 'video-list-item';
            const thumb = (f.url && f.url.trim()) || (f.thumbnailLink && f.thumbnailLink.trim()) || f.webContentLink || f.webViewLink || (f.id ? getDriveImageUrl(f.id) : '') || '';
            const duration = (f.videoMediaMetadata && f.videoMediaMetadata.durationMillis) ? formatDurationMs(f.videoMediaMetadata.durationMillis) : '';
            const matchExact = f._matchExact || 0;
            const scoreVal = Number(f._score || 0);

            row.innerHTML = `
                <div class="video-thumb-col">
                    <div class="thumb-small">
                        <img src="${thumb}" alt="${f.name}" class="video-thumb-small" />
                        ${duration ? `<span class="duration-badge">${duration}</span>` : ``}
                    </div>
                </div>
                <div class="meta-col">
                    <div class="video-title">${f.name}</div>
                    <div class="video-sub">Video <span class="video-debug" style="margin-left:8px;color:#666;font-size:13px">[m:${matchExact} s:${scoreVal.toFixed(2)}]</span></div>
                </div>
                <div class="actions-col">
                    <button class="view-btn small video-open-btn">${hi('play-circle','hi-icon-btn')} <span>Xem</span></button>
                    <a class="download-btn small" href="https://drive.google.com/uc?id=${f.id}&export=download" target="_blank">${hi('arrow-down-tray','hi-icon-btn')} <span>Tải về</span></a>
                </div>
            `;

            const openBtn = row.querySelector('.video-open-btn');
            if (openBtn) openBtn.addEventListener('click', () => openVideoPlayer(f.id, f.name, thumb, f.webContentLink));

            list.appendChild(row);
        } else {
            row.className = 'library-search-result-item';
            const left = document.createElement('div');
            left.className = 'result-left';
            const iconData = getFileIconData(f.name || '');
            const matchExact = f._matchExact || 0;
            const scoreVal = Number(f._score || 0);
            left.innerHTML = `<span class="icon-pill ${iconData.pill}">${hi(iconData.slug)}</span><span class="result-name">${f.name}</span><span class="result-meta" style="margin-left:10px;color:#666;font-size:13px">[m:${matchExact} s:${scoreVal.toFixed(2)}]</span>`;

            const actions = document.createElement('div');
            actions.className = 'result-actions';

            if (f.mimeType === 'application/vnd.google-apps.folder') {
                const openBtn = document.createElement('button');
                openBtn.className = 'view-btn';
                openBtn.innerHTML = `${hi('folder-open','hi-icon-btn')} <span>Mở</span>`;
                openBtn.onclick = () => {
                    if (containerId === 'library') loadFolder(f.id, f.name, false);
                    else loadFolderCustom(f.id, f.name, false, containerId, breadcrumbId);
                };
                actions.appendChild(openBtn);
            } else {
                const viewBtn = document.createElement('button');
                viewBtn.className = 'view-btn';
                viewBtn.innerHTML = `${hi('eye','hi-icon-btn')} <span>Xem</span>`;
                viewBtn.onclick = () => openPreview(f.id);
                actions.appendChild(viewBtn);

                const dl = document.createElement('a');
                dl.className = 'download-btn';
                dl.href = `https://drive.google.com/uc?id=${f.id}&export=download`;
                dl.target = '_blank';
                dl.innerHTML = `${hi('arrow-down-tray','hi-icon-btn')} <span>Tải về</span>`;
                actions.appendChild(dl);
            }

            row.appendChild(left);
            row.appendChild(actions);
            list.appendChild(row);
        }
    });

    resultsBox.appendChild(list);

    return;
    }

    // Client-side fallback scoring (when server didn't return results)
    // helper: count exact token matches (normalize & strip diacritics when possible)
    function stripAccents(s) {
        try { return String(s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, ''); } catch (e) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    }

    function tokenizeForMatch(s) {
        let v = stripAccents(s || '');
        // remove trailing file extensions
        v = v.replace(/\.(?:pdf|mp4|docx|doc|pptx|ppt|xls|xlsx|csv|jpg|jpeg|png|webp|gif|txt|md|zip|rar|7z|mp3|ogg|mov)$/i, '');
        try { v = v.replace(/[^\\p{L}\\p{N}]+/gu, ' '); } catch (e) { v = v.replace(/[^a-z0-9]+/gi, ' '); }
        return v.split(/\s+/).map(t => t.trim()).filter(Boolean);
    }

    function countExactMatches(name, query) {
        const nameTokens = tokenizeForMatch(name || '');
        const queryTokens = tokenizeForMatch(query || '');
        const used = new Array(nameTokens.length).fill(false);
        let exact = 0;
        for (const qt of queryTokens) {
            for (let i = 0; i < nameTokens.length; i++) {
                if (!used[i] && nameTokens[i] === qt) { exact++; used[i] = true; break; }
            }
        }
        return exact;
    }

    const scored = (files || []).map(f => {
        const name = (f.name || '').toLowerCase();
        let score = 0;
        if (name === q) score += 2000;
        if (name.startsWith(q)) score += 900;
        if (name.indexOf(q) !== -1) score += 600;
        const init = initialsOf(f.name || '');
        if (init.startsWith(q)) score += 800;
        if (init.indexOf(q) !== -1) score += 400;
        if (/\d/.test(q) && name.indexOf(q) !== -1) score += 700;
        if (isSubsequence(q, name)) score += 200;
        const lev = levenshtein(q, name);
        const maxLen = Math.max(q.length, name.length);
        const sim = maxLen ? (maxLen - lev) / maxLen : 0;
        score += Math.floor(sim * 150);
        const matchExact = countExactMatches(f.name || '', qRaw);
        return { file: f, score, matchExact };
    }).filter(x => x.score > 0 || (x.matchExact && x.matchExact > 0)).sort((a,b) => (b.matchExact || 0) - (a.matchExact || 0) || b.score - a.score || (a.file.name || '').localeCompare(b.file.name || ''));

    if (!scored || scored.length === 0) {
        resultsBox.innerHTML = '<p style="padding:8px;color:#666">Không tìm thấy kết quả.</p>';
        return;
    }

    const top = scored.slice(0, 5);
    const listFallback = document.createElement('div');
    listFallback.className = 'library-search-results-list';

    top.forEach(item => {
        const f = item.file;
        const row = document.createElement('div');

        const ext = (f.name || '').split('.').pop().toLowerCase();
        const isVideo = (f.mimeType && f.mimeType.startsWith('video')) || ['mp4','webm','ogg','mov'].includes(ext);

        if (containerId === 'video' && isVideo) {
            row.className = 'video-list-item';
            const thumb = (f.url && f.url.trim()) || (f.thumbnailLink && f.thumbnailLink.trim()) || f.webContentLink || f.webViewLink || (f.id ? getDriveImageUrl(f.id) : '') || '';
            const duration = (f.videoMediaMetadata && f.videoMediaMetadata.durationMillis) ? formatDurationMs(f.videoMediaMetadata.durationMillis) : '';
            const matchExact = item.matchExact || 0;
            const scoreVal = Number(item.score || 0);

            row.innerHTML = `
                <div class="video-thumb-col">
                    <div class="thumb-small">
                        <img src="${thumb}" alt="${f.name}" class="video-thumb-small" />
                        ${duration ? `<span class="duration-badge">${duration}</span>` : ``}
                    </div>
                </div>
                <div class="meta-col">
                    <div class="video-title">${f.name}</div>
                    <div class="video-sub">Video <span class="video-debug" style="margin-left:8px;color:#666;font-size:13px">[m:${matchExact} s:${scoreVal.toFixed(2)}]</span></div>
                </div>
                <div class="actions-col">
                    <button class="view-btn small video-open-btn">${hi('play-circle','hi-icon-btn')} <span>Xem</span></button>
                    <a class="download-btn small" href="https://drive.google.com/uc?id=${f.id}&export=download" target="_blank">${hi('arrow-down-tray','hi-icon-btn')} <span>Tải về</span></a>
                </div>
            `;

            const openBtn = row.querySelector('.video-open-btn');
            if (openBtn) openBtn.addEventListener('click', () => openVideoPlayer(f.id, f.name, thumb, f.webContentLink));

            listFallback.appendChild(row);
        } else {
            row.className = 'library-search-result-item';
            const left = document.createElement('div');
            left.className = 'result-left';
            const iconData = getFileIconData(f.name || '');
            const matchExact = item.matchExact || 0;
            const scoreVal = Number(item.score || 0);
            left.innerHTML = `<span class="icon-pill ${iconData.pill}">${hi(iconData.slug)}</span><span class="result-name">${f.name}</span><span class="result-meta" style="margin-left:10px;color:#666;font-size:13px">[m:${matchExact} s:${scoreVal.toFixed(2)}]</span>`;

            const actions = document.createElement('div');
            actions.className = 'result-actions';

            if (f.mimeType === 'application/vnd.google-apps.folder') {
                const openBtn = document.createElement('button');
                openBtn.className = 'view-btn';
                openBtn.innerHTML = `${hi('folder-open','hi-icon-btn')} <span>Mở</span>`;
                openBtn.onclick = () => {
                    if (containerId === 'library') loadFolder(f.id, f.name, false);
                    else loadFolderCustom(f.id, f.name, false, containerId, breadcrumbId);
                };
                actions.appendChild(openBtn);
            } else {
                const viewBtn = document.createElement('button');
                viewBtn.className = 'view-btn';
                viewBtn.innerHTML = `${hi('eye','hi-icon-btn')} <span>Xem</span>`;
                viewBtn.onclick = () => openPreview(f.id);
                actions.appendChild(viewBtn);

                const dl = document.createElement('a');
                dl.className = 'download-btn';
                dl.href = `https://drive.google.com/uc?id=${f.id}&export=download`;
                dl.target = '_blank';
                dl.innerHTML = `${hi('arrow-down-tray','hi-icon-btn')} <span>Tải về</span>`;
                actions.appendChild(dl);
            }

            row.appendChild(left);
            row.appendChild(actions);
            listFallback.appendChild(row);
        }
    });

    resultsBox.appendChild(listFallback);
}


/* ================= NAVIGATION HELPERS (back / forward) ================= */
async function libraryGoBack() {
    if (!Array.isArray(libraryHistory) || libraryHistoryIndex <= 0) return;
    libraryHistoryIndex--;
    const snap = libraryHistory[libraryHistoryIndex];
    if (!snap) return;
    try {
        pathStack = snap.path.slice();
        currentFolder = snap.folderId;
        const files = await fetchFilesInFolder(snap.folderId);
        renderFiles(files);
        const container = document.getElementById('library');
        if (container) {
            // [COPILOT-EDIT] Do not fetch recursive files on navigation; use immediate children only
            container._files = files || [];
        }
        setupSearch('library','library-search','breadcrumb');
        renderBreadcrumb();
    } catch (e) {
        console.warn('libraryGoBack error', e);
    }
}

async function libraryGoForward() {
    if (!Array.isArray(libraryHistory) || libraryHistoryIndex >= libraryHistory.length - 1) return;
    libraryHistoryIndex++;
    const snap = libraryHistory[libraryHistoryIndex];
    if (!snap) return;
    try {
        pathStack = snap.path.slice();
        currentFolder = snap.folderId;
        const files = await fetchFilesInFolder(snap.folderId);
        renderFiles(files);
        const container = document.getElementById('library');
        if (container) {
            // [COPILOT-EDIT] Do not fetch recursive files on navigation; use immediate children only
            container._files = files || [];
        }
        setupSearch('library','library-search','breadcrumb');
        renderBreadcrumb();
    } catch (e) {
        console.warn('libraryGoForward error', e);
    }
}

function customGoBack(containerId, breadcrumbId) {
    const container = document.getElementById(containerId);
    if (!container || !Array.isArray(container._history)) return;
    const cur = Number.isInteger(container._historyIndex) ? container._historyIndex : -1;
    if (cur <= 0) return;
    const newIndex = cur - 1;
    const snap = container._history[newIndex];
    if (!snap) return;
    container._historyIndex = newIndex;
    container._pathStack = snap.path.slice();
    // load without pushing history
    loadFolderCustom(snap.folderId, snap.folderName, false, containerId, breadcrumbId, false);
}

function customGoForward(containerId, breadcrumbId) {
    const container = document.getElementById(containerId);
    if (!container || !Array.isArray(container._history)) return;
    const cur = Number.isInteger(container._historyIndex) ? container._historyIndex : -1;
    if (cur >= container._history.length - 1) return;
    const newIndex = cur + 1;
    const snap = container._history[newIndex];
    if (!snap) return;
    container._historyIndex = newIndex;
    container._pathStack = snap.path.slice();
    loadFolderCustom(snap.folderId, snap.folderName, false, containerId, breadcrumbId, false);
}
