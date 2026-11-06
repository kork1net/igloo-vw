import { mountModal } from './AdminGrants';
import { createQuestButton } from './QuestButton';
import { getClothingItem } from '../items/Clothing';

export function showSecretReward(scene, reward) {
    if (scene.adminModal) return;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen'; overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue quest-rewards" role="dialog" aria-modal="true" aria-labelledby="secret-reward-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="secret-reward-title"></h2><p></p><div class="quest-prizes"></div><div class="quest-reward-actions"></div>
    </section>`;
    overlay.querySelector('h2').textContent = reward.claimed ? 'מצאתם הפתעה!' : 'כבר מצאתם את הספל הסודי';
    overlay.querySelector('p').textContent = reward.claimed ? 'הספל מהתמונה נוסף לתיק החפצים שלכם!' : 'הפרס הזה ניתן פעם אחת לכל שחקן.';
    const item = getClothingItem(reward.itemId);
    if (item && scene.textures.exists(item.texture)) {
        const frame = scene.textures.getFrame(item.texture, 0);
        const sample = document.createElement('canvas'); sample.width = frame.cutWidth; sample.height = frame.cutHeight;
        const context = sample.getContext('2d', { willReadFrequently: true });
        context.drawImage(frame.source.image, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, sample.width, sample.height);
        const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
        let left = sample.width, top = sample.height, right = -1, bottom = -1;
        for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) {
            if (pixels[(y * sample.width + x) * 4 + 3] > 8) {
                left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
            }
        }
        if (right >= left) {
            const icon = document.createElement('canvas'); icon.width = 128; icon.height = 128;
            icon.setAttribute('aria-label', item.name); icon.setAttribute('role', 'img');
            const draw = icon.getContext('2d'); draw.imageSmoothingEnabled = false;
            const w = right - left + 1, h = bottom - top + 1, scale = Math.min(104 / w, 104 / h);
            draw.drawImage(sample, left, top, w, h, (128 - w * scale) / 2, (128 - h * scale) / 2, w * scale, h * scale);
            overlay.querySelector('.quest-prizes').append(icon);
        }
    }
    const close = () => { scene.sound.play('ui-close'); dismiss(); };
    overlay.querySelector('.quest-reward-actions').append(createQuestButton('close', close));
    const dismiss = mountModal(scene, overlay, close);
}
