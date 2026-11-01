import { openHtmlWindow, closeHtmlWindow } from './WindowTransition';
import { applyHtmlRarityEffect } from './ItemRarityEffect';

export async function openRarityManager(scene) {
    if (!scene.registry.get('auth')?.user?.isAdmin || scene.rarityManager) return;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen rarity-screen';
    overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue rarity-dialogue" role="dialog" aria-modal="true" aria-labelledby="rarity-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="rarity-title">ניהול נדירות פריטים</h2>
        <p>בחרו מסגרת לכל פריט. השינוי נשמר לכל השחקנים.</p>
        <input class="rarity-search" type="search" placeholder="חיפוש לפי שם או מזהה פריט" aria-label="חיפוש פריטים" />
        <p class="rarity-status" role="status">טוען פריטים...</p>
        <div class="rarity-list"></div>
    </section>`;
    scene.rarityManager = overlay;
    const keyboardEnabled = scene.input.keyboard.enabled || scene.chatInput?.node === document.activeElement;
    scene.input.keyboard.enabled = false;
    scene.chatInput?.setVisible(false);
    const status = overlay.querySelector('.rarity-status');
    const close = (animate = true) => {
        if (overlay.windowClosing && animate) return;
        if (animate) scene.sound.play('ui-close');
        closeHtmlWindow(overlay, () => {
            scene.events.off('shutdown', shutdown);
            if (scene.rarityManager !== overlay) return;
            scene.rarityManager = null;
            scene.input.keyboard.enabled = keyboardEnabled;
            scene.chatInput?.setVisible(true);
        }, animate);
    };
    const shutdown = () => close(false);
    scene.events.once('shutdown', shutdown);
    overlay.querySelector('button').addEventListener('click', () => close());
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    overlay.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') close();
        if (event.key === 'Tab') {
            const controls = [...overlay.querySelectorAll('button, input, select')].filter(control => !control.disabled && !control.closest('[hidden]'));
            const index = controls.indexOf(document.activeElement);
            if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === controls.length - 1)) {
                event.preventDefault();
                controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
            }
        }
    });
    document.getElementById('game-container').append(overlay);
    openHtmlWindow(overlay);
    overlay.querySelector('.rarity-search').focus();
    scene.input.keyboard.enabled = false;
    try {
        const result = await scene.multiplayer.requestInventory('admin:items', {});
        if (!overlay.isConnected || overlay.windowClosing) return;
        const list = overlay.querySelector('.rarity-list');
        for (const item of result.items) {
            const row = document.createElement('label');
            row.className = 'rarity-row';
            const preview = document.createElement('span');
            preview.className = 'rarity-frame';
            preview.setAttribute('aria-hidden', 'true');
            const name = document.createElement('span');
            name.textContent = item.name;
            const id = document.createElement('small');
            id.textContent = item.id;
            name.append(id);
            const select = document.createElement('select');
            select.setAttribute('aria-label', `נדירות ${item.name}`);
            for (const grade of ['C', 'B', 'A', 'S']) select.add(new Option(grade, grade));
            select.value = item.rarity;
            const updatePreview = () => {
                preview.style.backgroundPositionX = `${-58 * ['C', 'B', 'A', 'S'].indexOf(select.value)}px`;
                applyHtmlRarityEffect(preview, select.value);
            };
            updatePreview();
            select.addEventListener('change', async () => {
                select.disabled = true;
                status.textContent = 'שומר...';
                try {
                    await scene.multiplayer.requestInventory('admin:setItemRarity', { itemId: item.id, rarity: select.value });
                    item.rarity = select.value;
                    updatePreview();
                    status.textContent = 'דרגת הנדירות נשמרה.';
                } catch (error) {
                    select.value = item.rarity;
                    status.textContent = error.message;
                } finally { select.disabled = false; }
            });
            row.append(preview, name, select);
            row.dataset.search = `${item.name} ${item.id}`.toLowerCase();
            list.append(row);
        }
        status.textContent = '';
        overlay.querySelector('.rarity-search').addEventListener('input', event => {
            const query = event.target.value.trim().toLowerCase();
            for (const row of list.children) row.hidden = !row.dataset.search.includes(query);
        });
    } catch (error) { if (overlay.isConnected) status.textContent = error.message; }
}
