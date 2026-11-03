import { mountModal } from './AdminGrants';

const VOLUME_KEY = 'vw.volume';

export function restoreVolume(sound) {
    try {
        const saved = localStorage.getItem(VOLUME_KEY);
        const volume = saved === null ? 1 : Number(saved);
        if (Number.isFinite(volume) && volume >= 0 && volume <= 1) sound.setVolume(volume);
    } catch { /* Volume still works when browser storage is unavailable. */ }
}

export function openSettings(scene) {
    if (scene.settingsModal) return;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen settings-screen';
    overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue settings-dialogue" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="settings-title">הגדרות</h2>
        <label for="game-volume">עוצמת קול <output id="game-volume-value"></output></label>
        <input id="game-volume" type="range" min="0" max="100" step="1" aria-label="עוצמת קול" />
    </section>`;
    const slider = overlay.querySelector('input');
    const output = overlay.querySelector('output');
    slider.value = String(Math.round(scene.sound.volume * 100));
    const update = () => {
        const volume = Number(slider.value) / 100;
        scene.sound.setVolume(volume);
        output.textContent = `${slider.value}%`;
        try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* Optional persistence. */ }
    };
    slider.addEventListener('input', update);
    update();
    let close;
    const dismiss = () => {
        scene.sound.play('ui-close');
        close();
    };
    close = mountModal(scene, overlay, dismiss, 'settingsModal');
    overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
    return overlay;
}
