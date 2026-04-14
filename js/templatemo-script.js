/**
 * Credits
 * CSS3 animation effects for Magnific Popup: https://codepen.io/dimsemenov/pen/GAIkt
 */

$(document).ready(function () {
    $('#inline-popups').magnificPopup({
        delegate: 'a:not(.no-mfp)',
        removalDelay: 500,
        callbacks: {
            beforeOpen: function() {
                this.st.mainClass = this.st.el.attr('data-effect');
            },
            open: function() {
                try {
                    if (window.location && window.location.hash) {
                        history.replaceState(null, '', window.location.pathname + window.location.search);
                    }
                } catch (e) {
                    console.warn('Could not remove hash from URL', e);
                }
            }
        },
        midClick: true,
        showCloseBtn: false
    });

    $('.tm-close-popup').on('click', function(e) {
        e.preventDefault();
        $.magnificPopup.close();
    });

    const popupInstance = $.magnificPopup.instance;
    $('.tm-btn-next').on('click', function() {
        popupInstance.next();
    });

    function adjustIntroImg() {
        // Always use the available intro image; avoids 404 for intro-big.jpg
        $('.tm-intro-img').attr('src', 'img/intro.jpg');
    }

    adjustIntroImg();
    $(window).on('resize', adjustIntroImg);
});


// Rotating images for #gallery2 (quảng cáo) - populate from Drive folder and show 8 images
// Each item keeps a low-res thumb (fast/blurred) and a full URL (sharp, lazy swap).
var imageItems = [];
var galleryStartIndex = 0;
var galleryIntervalId = null;
const GALLERY_WINDOW = 8; // number of images visible at once (4 columns × 2 rows)
const GALLERY_INTERVAL = 3500; // ms between updates
let galleryObserver = null;

// In-memory set of gallery image URLs that have already loaded once.
const galleryLoadedUrls = new Set();
// Pool of currently-displayed slots (wrapper + img) to avoid recreating DOM nodes.
let galleryImagePool = [];
let galleryPoolInitialized = false;

function getGalleryObserver() {
    if (galleryObserver) return galleryObserver;
    galleryObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const full = el.getAttribute('data-full');
            if (!full || el.dataset.upgraded === '1') {
                el.classList.add('img-loaded');
                galleryObserver.unobserve(el);
                return;
            }

            const loader = new Image();
            loader.onload = () => {
                el.src = full;
                el.dataset.upgraded = '1';
                el.classList.add('img-loaded');
                galleryObserver.unobserve(el);
            };
            loader.onerror = () => {
                el.classList.add('img-loaded');
                galleryObserver.unobserve(el);
            };
            loader.src = full;
        });
    }, { rootMargin: '200px 0px' });
    return galleryObserver;
}

function renderGalleryWindow() {
    const gallery = document.getElementById('gallery2');
    if (!gallery) return;
    const len = imageItems.length;
    if (!len) {
        gallery.innerHTML = '<p style="padding:20px;color:#555">Hình ảnh đang lỗi kết nối đến nơi chứa. Vui lòng đợi admin bảo trì</p>';
        return;
    }

    const itemsToShow = Math.min(GALLERY_WINDOW, len);

    // Initialize a fixed pool of wrappers+img elements on first run.
    if (!galleryPoolInitialized) {
        gallery.innerHTML = '';
        galleryImagePool = [];
        for (let i = 0; i < itemsToShow; i++) {
            const wrapper = document.createElement('div');
            wrapper.className = 'gallery-item';
            wrapper.style.position = 'relative';

            const img = document.createElement('img');
            img.loading = 'lazy';
            img.decoding = 'async';
            img.alt = '';
            img.className = 'gallery-current';
            img.style.cursor = 'pointer';
            img.dataset.upgraded = '0';

            // click opens preview
            img.addEventListener('click', () => {
                const full = img.getAttribute('data-full') || img.getAttribute('data-src') || '';
                if (typeof openDirectPreview === 'function') {
                    openDirectPreview(full, 'Ảnh quảng cáo');
                }
            });

            wrapper.appendChild(img);
            gallery.appendChild(wrapper);
            galleryImagePool.push({ wrapper, img });

            const obs = getGalleryObserver();
            if (obs) obs.observe(img);
        }
        galleryPoolInitialized = true;
    }

    // Reuse pool slots and image elements; cache loaded images so we don't re-download the same URL.
    for (let i = 0; i < itemsToShow; i++) {
        const idx = (galleryStartIndex + i) % len;
        const item = imageItems[idx];
        if (!item) continue;

        const url = ((item.thumb && item.thumb.trim()) || (item.full && item.full.trim()) || '');
        if (!url) continue;

        const slot = galleryImagePool[i];
        if (!slot) continue;

        // If this URL has already loaded before, just assign the src (will use browser cache)
        if (galleryLoadedUrls.has(url)) {
            slot.img.setAttribute('data-src', url);
            slot.img.setAttribute('data-full', item.full || item.thumb || '');
            // ensure observer sees data-full so it can swap to high-res when visible
            try { const obs = getGalleryObserver(); if (obs) obs.observe(slot.img); } catch (e) {}
            // Assign src; browsers normally serve from cache so this avoids re-downloading where possible
            try { slot.img.src = url; } catch (e) { slot.img.dataset.upgraded = 'err'; }
            continue;
        }

        // Not cached yet — update the slot's img only if it's different to avoid forcing re-request.
        if (slot.img.getAttribute('data-src') === url || slot.img.src === url) {
            slot.img.setAttribute('data-full', item.full || item.thumb || '');
            continue;
        }

        // Assign new URL and cache the loaded element on first successful load.
        slot.img.dataset.upgraded = '0';
        slot.img.setAttribute('data-src', url);
        slot.img.setAttribute('data-full', item.full || item.thumb || '');
        slot.img.onload = function onLoad() {
            try { slot.img.classList.add('img-loaded'); } catch (e) {}
            slot.img.dataset.upgraded = '1';
            // mark URL as loaded so future cycles reuse browser cache instead of forcing network
            try { galleryLoadedUrls.add(url); } catch (e) {}
            // stop observing once image upgraded
            try { const obs = getGalleryObserver(); if (obs) obs.unobserve(slot.img); } catch (e) {}
            slot.img.removeEventListener('load', onLoad);
        };
        slot.img.onerror = function () {
            slot.img.dataset.upgraded = 'err';
        };
        // set src last so events can attach beforehand
        try { slot.img.src = url; } catch (e) { slot.img.dataset.upgraded = 'err'; }
    }

    // advance start index so next rotation shows the next set
    galleryStartIndex = (galleryStartIndex + 1) % len;
}

function startGalleryRotation() {
    if (galleryIntervalId) clearInterval(galleryIntervalId);
    renderGalleryWindow();
    galleryIntervalId = setInterval(renderGalleryWindow, GALLERY_INTERVAL);
}

async function initQuangCao() {
    try {
        const apiClient =
            (typeof window !== 'undefined' && window.APP_API) ? window.APP_API : null;
        if (!apiClient || !apiClient.getRootFolder) {
            throw new Error('Chua cau hinh APP_API de tai banner');
        }

        const root = await apiClient.getRootFolder('ads');
        // Try loading using raw Drive file metadata so we can test multiple candidate URLs
        const files = await fetchFilesInFolder(root.folderId);
        if (files && files.length) {
            const upgradeThumb = u => u ? u.replace(/=s\d+(?:-c)?$/i, '=s480') : u;
            const collected = [];

            for (const f of files) {
                // only take images or entries that expose a thumbnail/content URL
                if (!(f && (f.mimeType || f.thumbnailLink || f.webContentLink || f.url))) continue;

                const thumb = upgradeThumb(
                    (f.thumbnailLink && f.thumbnailLink.trim()) ||
                    (f.url && f.url.trim())
                );

                const full =
                    (f.webContentLink && f.webContentLink.trim()) ||
                    (f.webViewLink && f.webViewLink.trim()) ||
                    (f.url && f.url.trim()) ||
                    (f.id ? getDriveImageUrl(f.id) : '');

                if (thumb || full) {
                    collected.push({ thumb: thumb || full, full: full || thumb });
                }
            }

            if (collected.length) imageItems = collected;
        }
    } catch (e) {
        console.warn('Failed to load quancao from Drive', e);
    }

    startGalleryRotation();
}

document.addEventListener('DOMContentLoaded', () => {
    initQuangCao();
});
