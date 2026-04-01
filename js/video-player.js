(function () {
    // Create a reusable modal with an iframe to show Google Drive preview.
    function createModal() {
        if (document.getElementById('videoPlayerModal')) return document.getElementById('videoPlayerModal');

        const modal = document.createElement('div');
        modal.id = 'videoPlayerModal';
        modal.className = 'video-player-modal';
        modal.innerHTML = `
            <div class="video-player-wrap">
                <button class="vp-close" id="vpCloseBtn">✕</button>
                <div class="iframe-container" style="width:100%;">
                    <iframe id="drivePlayerIframe" class="player-fallback" frameborder="0" allow="autoplay; fullscreen; encrypted-media" allowfullscreen style="width:100%; height:76vh; border:0; background:#000;"></iframe>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // close handlers
        const closeBtn = modal.querySelector('#vpCloseBtn');
        closeBtn.addEventListener('click', closeVideoPlayer);

        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeVideoPlayer();
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeVideoPlayer();
        });

        return modal;
    }

    window.openVideoPlayer = function (fileId, fileName, poster, webContentLink) {
        if (!fileId) {
            console.warn('openVideoPlayer: missing fileId');
            return;
        }

        const modal = createModal();
        const iframe = modal.querySelector('#drivePlayerIframe');

        // Use Drive preview URL which embeds the Drive player inside the iframe
        const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;

        // set iframe src and show modal
        iframe.src = previewUrl;
        modal.style.display = 'flex';
    };

    window.closeVideoPlayer = function () {
        const modal = document.getElementById('videoPlayerModal');
        if (!modal) return;
        const iframe = modal.querySelector('#drivePlayerIframe');
        if (iframe) {
            // unset src to stop playback and release resources
            iframe.src = '';
        }
        modal.style.display = 'none';
    };

})();
