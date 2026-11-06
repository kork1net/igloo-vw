import { mountModal } from './AdminGrants';
import { audioSettings } from './AudioSettings';

export function restoreVolume(sound) {
    audioSettings(sound);
}

export function openSettings(scene) {
    if (scene.settingsModal) return;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen settings-screen';
    overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue settings-dialogue" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="settings-title">הגדרות</h2>
        <div class="settings-audio-buttons"></div>
    </section>`;
    const audio = audioSettings(scene.sound);
    for (const [category, label, icon] of [
        ['music', 'מוזיקת רקע', '<path d="M9 18V6l11-3v12M9 9l11-3"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="17" cy="15" rx="3" ry="2"/>'],
        ['effects', 'אפקטים קוליים', '<path d="M4 9h4l5-4v14l-5-4H4zM17 8q5 4 0 8M20 5q7 7 0 14"/>']
    ]) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'settings-audio-toggle'; button.dataset.audio = category;
        button.innerHTML = `<span class="settings-audio-icon"><svg viewBox="0 0 28 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg></span><span class="settings-audio-label"></span><span class="settings-audio-state"></span>`;
        button.querySelector('.settings-audio-label').textContent = label;
        const render = () => {
            button.setAttribute('aria-pressed', String(audio.preferences[category]));
            button.querySelector('.settings-audio-state').textContent = audio.preferences[category] ? 'פעיל' : 'כבוי';
        };
        button.addEventListener('click', () => {
            audio.toggle(category); render(); scene.sound.play('wood-tap-ui');
        });
        render(); overlay.querySelector('.settings-audio-buttons').append(button);
    }
    let close;
    const dismiss = () => {
        scene.sound.play('ui-close');
        close();
    };
    close = mountModal(scene, overlay, dismiss, 'settingsModal');
    overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
    return overlay;
}
