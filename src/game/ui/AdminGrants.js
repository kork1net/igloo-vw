import { openHtmlWindow, closeHtmlWindow } from './WindowTransition';
import { createQuestButton } from './QuestButton';
import { createCoinIcon } from './CoinIcon';
import { createRankingIcon } from './RankingIcon';

function createOverlay(title, extraClass = '') {
    const overlay = document.createElement('div');
    overlay.className = `resident-screen admin-grant-screen ${extraClass}`;
    overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue admin-grant-dialogue" role="dialog" aria-modal="true" aria-labelledby="admin-grant-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="admin-grant-title"></h2><div class="admin-grant-content"></div>
        <p class="admin-grant-status" role="status" aria-live="polite"></p>
    </section>`;
    overlay.querySelector('h2').textContent = title;
    return overlay;
}

export function mountModal(scene, overlay, dismiss, ownerKey = 'adminModal') {
    const pointerEnabled = scene.input.enabled;
    const keyboardEnabled = scene.input.keyboard.enabled || scene.chatInput?.node === document.activeElement;
    const chatVisible = scene.chatInput?.visible;
    const focus = document.activeElement;
    const parents = [...document.querySelectorAll('.resident-screen')].map(element => [element, element.inert]);
    parents.forEach(([element]) => { element.inert = true; });
    scene[ownerKey] = overlay;
    scene.player.moveTarget = null;
    scene.player.isMoving = false;
    scene.pendingTransition = null;
    Object.values(scene.player.cursors || {}).forEach(key => key.reset?.());
    scene.input.enabled = false;
    scene.input.keyboard.enabled = false;
    scene.chatInput?.setVisible(false);
    const close = (animate = true) => closeHtmlWindow(overlay, () => {
        scene.events.off('shutdown', shutdown);
        parents.forEach(([element, inert]) => { if (element.isConnected) element.inert = inert; });
        if (scene[ownerKey] !== overlay) return;
        scene[ownerKey] = null;
        scene.input.enabled = pointerEnabled;
        scene.input.keyboard.enabled = keyboardEnabled;
        scene.chatInput?.setVisible(chatVisible ?? true);
        if (focus?.isConnected && !focus.closest('[inert]')) focus.focus();
    }, animate);
    const shutdown = () => close(false);
    scene.events.once('shutdown', shutdown);
    overlay.dismiss = close;
    overlay.querySelector('.resident-close').addEventListener('click', dismiss);
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    overlay.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
        if (event.key === 'Tab') {
            const controls = [...overlay.querySelectorAll('button, input, select')].filter(element => !element.disabled);
            const index = controls.indexOf(document.activeElement);
            if ((event.shiftKey && index <= 0) || (!event.shiftKey && index === controls.length - 1)) {
                event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
            }
        }
    });
    document.getElementById('game-container').append(overlay);
    openHtmlWindow(overlay);
    (overlay.querySelector('input') || overlay.querySelector('.resident-close')).focus();
    return close;
}

export function openAdminGrants(scene) {
    if (!scene.registry.get('auth')?.user?.isAdmin || scene.adminModal) return;
    const overlay = createOverlay('הענקת מתנות לשחקנים');
    const content = overlay.querySelector('.admin-grant-content');
    content.innerHTML = `<form class="admin-grant-form">
        <label>למי לשלוח?<select name="scope"><option value="player">שחקן מסוים</option><option value="room">כל השחקנים בחדר</option></select></label>
        <label class="admin-recipient">שם השחקן<input name="username" required maxlength="20" autocomplete="off" /></label>
        <label>סוג המתנה<select name="kind"><option value="currency">כסף</option><option value="rankingPoints">נקודות דירוג</option><option value="both">כסף ונקודות דירוג</option></select></label>
        <label class="admin-primary-amount"><span class="admin-amount-label">סכום כסף</span><input name="amount" type="number" min="1" max="1000000" step="1" required /></label>
        <label class="admin-ranking-amount" hidden>נקודות דירוג<input name="rankingAmount" type="number" min="1" max="1000000" step="1" disabled /></label>
        <p class="admin-grant-hint"></p>
    </form>`;
    const form = content.querySelector('form');
    const status = overlay.querySelector('.admin-grant-status');
    const submit = createQuestButton('admin-grant', () => {});
    submit.type = 'submit'; submit.setAttribute('aria-label', 'שליחת מתנה'); submit.title = 'שליחת מתנה';
    form.append(submit);
    let busy = false, requestId;
    const syncControls = () => {
        const room = form.elements.scope.value === 'room';
        const both = form.elements.kind.value === 'both';
        form.dataset.combined = String(both);
        form.querySelector('.admin-recipient').hidden = room;
        form.elements.username.disabled = room;
        form.elements.username.required = !room;
        form.querySelector('.admin-ranking-amount').hidden = !both;
        form.elements.rankingAmount.disabled = !both;
        form.elements.rankingAmount.required = both;
        form.querySelector('.admin-amount-label').textContent = form.elements.kind.value === 'rankingPoints' ? 'נקודות דירוג' : 'סכום כסף';
        form.querySelector('.admin-grant-hint').textContent = room
            ? 'כל מי שבחדר הנוכחי יקבל את הכמות שציינתם, כולל המנהל. כל משתמש מקבל פעם אחת. עד 1,000,000 מכל סוג.'
            : 'אפשר להעניק גם לשחקן שאינו מחובר. עד 1,000,000 מכל סוג.';
    };
    syncControls();
    const close = mountModal(scene, overlay, () => { if (!busy) close(); });
    form.addEventListener('input', () => { if (!busy) requestId = null; });
    form.addEventListener('change', () => { if (!busy) { requestId = null; syncControls(); } });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const username = form.elements.username.value.trim();
        const kind = form.elements.kind.value;
        const amount = Number(form.elements.amount.value);
        const scope = form.elements.scope.value;
        const rankingAmount = kind === 'both' ? Number(form.elements.rankingAmount.value) : undefined;
        requestId ||= crypto.randomUUID();
        busy = true;
        const controls = [...form.querySelectorAll('input, select, button')];
        controls.forEach(element => { element.disabled = true; });
        status.textContent = 'שולח מתנה…';
        try {
            const result = await scene.multiplayer.requestInventory('admin:grant', { id: requestId, scope, username, kind, amount, rankingAmount });
            if (!overlay.isConnected) return;
            status.textContent = scope === 'room'
                ? `המתנה נשלחה ל־${result.recipientCount} שחקנים בחדר.`
                : `המתנה נשלחה ל־${result.username}.`;
            form.elements.amount.value = ''; form.elements.rankingAmount.value = ''; requestId = null;
            scene.sound.play('wood-tap-ui');
        } catch (error) { if (overlay.isConnected) status.textContent = error.message; }
        finally { busy = false; controls.forEach(element => { element.disabled = false; }); syncControls(); }
    });
}

export function showPendingAdminGift(scene) {
    if (scene.tradeModal) return;
    if (!scene.sys.isActive() || !scene.multiplayer?.socket?.connected) return;
    const gifts = scene.registry.get('inventory')?.adminGifts || [];
    if (scene.adminModal) {
        const { giftId, senderId } = scene.adminModal.dataset;
        if (giftId && !gifts.some(gift => gift.id === giftId && gift.senderId === senderId)) scene.adminModal.dismiss();
        return;
    }
    const gift = gifts[0];
    if (!gift) return;
    const overlay = createOverlay(`קיבלתם מהמנהל ${gift.senderName}`, 'admin-gift-notification');
    overlay.dataset.giftId = gift.id; overlay.dataset.senderId = gift.senderId;
    const content = overlay.querySelector('.admin-grant-content');
    const money = gift.currency ?? (gift.kind === 'currency' ? gift.amount : 0);
    const points = gift.rankingPoints ?? (gift.kind === 'rankingPoints' ? gift.amount : 0);
    for (const [value, icon] of [[money, createCoinIcon], [points, createRankingIcon]]) {
        if (!value) continue;
        const amount = document.createElement('div'); amount.className = 'admin-gift-amount';
        const number = document.createElement('strong'); number.textContent = value.toLocaleString();
        amount.append(icon(64), number); content.append(amount);
    }
    const explanation = document.createElement('p'); explanation.textContent = 'המתנה נוספה ליתרה שלכם!';
    content.append(explanation);
    let busy = false;
    const acknowledge = async () => {
        if (busy) return;
        busy = true; confirm.disabled = true;
        try {
            await scene.multiplayer.requestInventory('admin:ackGift', { id: gift.id, senderId: gift.senderId });
            if (overlay.isConnected) close();
        } catch (error) {
            if (overlay.isConnected) overlay.querySelector('.admin-grant-status').textContent = error.message;
        } finally { busy = false; confirm.disabled = false; }
    };
    const confirm = createQuestButton('ack-admin-gift', acknowledge);
    content.append(confirm);
    const close = mountModal(scene, overlay, acknowledge);
}
