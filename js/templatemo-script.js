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
        gallery.innerHTML = '<p style="padding:20px;color:#555">Không có ảnh quảng cáo từ Drive. Vui lòng kiểm tra quyền chia sẻ thư mục Drive.</p>';
        return;
    }

    const itemsToShow = Math.min(GALLERY_WINDOW, len);

    // Rebuild flat gallery children each cycle to avoid leftover nested rows
    const frag = document.createDocumentFragment();
    for (let i = 0; i < itemsToShow; i++) {
        const wrapper = document.createElement('div');
        wrapper.className = 'gallery-item';
        wrapper.style.position = 'relative';

        const idx = (galleryStartIndex + i) % len;
        const item = imageItems[idx];
        if (!item) continue;

        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = item.thumb || item.full;
        img.setAttribute('data-src', item.thumb || item.full);
        img.setAttribute('data-full', item.full || item.thumb);
        img.alt = '';
        img.className = 'gallery-current';
        img.style.cursor = 'pointer';

        // Mở ảnh ở kích thước gốc trong modal preview khi bấm
        img.addEventListener('click', () => {
            if (typeof openDirectPreview === 'function') {
                openDirectPreview(item.full || item.thumb, 'Ảnh quảng cáo');
            }
        });

        wrapper.appendChild(img);
        frag.appendChild(wrapper);

        // Swap lên ảnh nét khi phần tử vào khung nhìn
        const obs = getGalleryObserver();
        if (obs) obs.observe(img);
    }

    // replace current children with new set
    gallery.innerHTML = '';
    gallery.appendChild(frag);

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
