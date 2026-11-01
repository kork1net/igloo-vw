import { openHtmlWindow, closeHtmlWindow } from './WindowTransition';
import { createQuestButton } from './QuestButton';
import { getClothingItem } from '../items/Clothing';
import { createCoinIcon } from './CoinIcon';
import { createRankingIcon } from './RankingIcon';

export function showQuestRewards(scene, parent, earned, onDone) {
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen quest-rewards-screen'; overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue quest-rewards" role="dialog" aria-modal="true" aria-labelledby="quest-rewards-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="quest-rewards-title">כל הכבוד!</h2><p>השלמתם את הבקשה וקיבלתם:</p>
        <div class="quest-prizes"></div><div class="quest-reward-actions"></div>
    </section>`;
    const prizes = overlay.querySelector('.quest-prizes');
    const card = (symbol, value, label) => {
        const element = document.createElement('div'); element.className = 'quest-prize';
        element.style.setProperty('--reward-delay', `${prizes.children.length * 90}ms`);
        const icon = document.createElement('span'); icon.className = 'quest-prize-symbol'; icon.textContent = symbol;
        const amount = document.createElement('strong'); amount.textContent = String(value);
        const title = document.createElement('span'); title.textContent = label;
        element.append(icon, amount, title); prizes.append(element); return element;
    };
    const coins = card('', earned.coins, '');
    coins.classList.add('quest-prize-coins');
    coins.querySelector('.quest-prize-symbol').replaceWith(createCoinIcon(56));
    card('', earned.rankingPoints, '').querySelector('.quest-prize-symbol').replaceWith(createRankingIcon(56));
    if (earned.itemId) {
        const item = getClothingItem(earned.itemId);
        const element = card('✦', '', item?.name || 'פריט חדש');
        if (item && scene.textures.exists(item.texture)) {
            const frame = scene.textures.getFrame(item.texture, 0);
            const source = frame.source.image;
            const sample = document.createElement('canvas'); sample.width = frame.cutWidth; sample.height = frame.cutHeight;
            const context = sample.getContext('2d', { willReadFrequently: true });
            context.drawImage(source, frame.cutX, frame.cutY, sample.width, sample.height, 0, 0, sample.width, sample.height);
            const pixels = context.getImageData(0, 0, sample.width, sample.height).data;
            let left = sample.width, top = sample.height, right = -1, bottom = -1;
            for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) {
                if (pixels[(y * sample.width + x) * 4 + 3] > 8) {
                    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
                }
            }
            if (right >= left) {
                const image = document.createElement('canvas'); image.width = 96; image.height = 96;
                const draw = image.getContext('2d'); draw.imageSmoothingEnabled = false;
                const width = right - left + 1, height = bottom - top + 1;
                const scale = Math.min(80 / width, 80 / height);
                draw.drawImage(sample, left, top, width, height, (96 - width * scale) / 2, (96 - height * scale) / 2, width * scale, height * scale);
                element.querySelector('.quest-prize-symbol').replaceWith(image);
            }
        }
    }
    let closed = false;
    const close = (animate = true, notify = true) => {
        if (closed || (overlay.windowClosing && animate)) return;
        closeHtmlWindow(overlay, () => {
            closed = true; parent.inert = false;
            if (notify && parent.isConnected && !parent.windowClosing) onDone();
        }, animate);
    };
    overlay.querySelector('.resident-close').addEventListener('click', () => close());
    const done = createQuestButton('rewards-done', () => close());
    overlay.querySelector('.quest-reward-actions').append(done);
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    overlay.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') close();
        if (event.key === 'Tab') {
            event.preventDefault();
            const controls = [...overlay.querySelectorAll('button')];
            const index = controls.indexOf(document.activeElement);
            controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length].focus();
        }
    });
    parent.inert = true;
    document.getElementById('game-container').append(overlay);
    openHtmlWindow(overlay); done.focus();
    return { close };
}
