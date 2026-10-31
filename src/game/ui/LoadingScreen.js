let currentLoading = null;
const minimumDisplayMs = 1000;

export function showLoadingScreen(scene, title = 'מכינים את העולם שלכם…') {
    // Boot and Preloader share the same minimum display time.
    const startedAt = currentLoading?.startedAt ?? performance.now();
    currentLoading?.cleanup();
    let timer;
    const overlay = document.createElement('div');
    overlay.className = 'loading-screen';
    overlay.dir = 'rtl';
    overlay.innerHTML = `
        <section class="loading-card" role="status" aria-live="polite">
            <div class="loading-snow" aria-hidden="true">✦</div>
            <img class="loading-logo" src="assets/logo.png" alt="IGLOO" />
            <h2></h2>
            <div class="loading-track" role="progressbar" aria-label="התקדמות הטעינה"
                aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div class="loading-fill"></div>
            </div>
            <span class="loading-percent">0%</span>
            <div class="loading-dots" aria-hidden="true"><i></i><i></i><i></i></div>
        </section>`;
    overlay.querySelector('h2').textContent = title;
    document.getElementById('game-container').append(overlay);
    const track = overlay.querySelector('.loading-track');
    const fill = overlay.querySelector('.loading-fill');
    const percent = overlay.querySelector('.loading-percent');
    const progress = value => {
        const amount = Math.round(Math.min(1, Math.max(0, value)) * 100);
        fill.style.width = `${amount}%`;
        track.setAttribute('aria-valuenow', String(amount));
        percent.textContent = `${amount}%`;
    };
    const complete = () => progress(1);
    const cleanup = () => {
        clearTimeout(timer);
        scene.load.off('progress', progress);
        scene.load.off('complete', complete);
        scene.events.off('create', onCreate);
        scene.events.off('shutdown', cleanup);
        overlay.remove();
        if (currentLoading?.overlay === overlay) currentLoading = null;
    };
    const onCreate = () => {
        // The next scene may start immediately; keep this overlay until its minimum expires.
        scene.events.off('shutdown', cleanup);
        timer = setTimeout(cleanup, Math.max(0, minimumDisplayMs - (performance.now() - startedAt)));
    };
    currentLoading = { overlay, startedAt, cleanup };
    scene.load.on('progress', progress);
    scene.load.once('complete', complete);
    // Leave the overlay up until the room and its UI have actually been created.
    scene.events.once('create', onCreate);
    scene.events.once('shutdown', cleanup);
}
