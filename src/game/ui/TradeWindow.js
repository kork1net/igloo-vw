import { mountModal } from './AdminGrants';
import { applyHtmlRarityEffect } from './ItemRarityEffect';
import { openHtmlWindow, closeHtmlWindow } from './WindowTransition';
import { createQuestButton } from './QuestButton';
import { createTradeAvatar, createTradeItemImage } from './TradeImages';
import { clothingItems, getClothingItem, inventoryCategories } from '../items/Clothing';

export function receiveTradeState(scene, state) {
    if (scene.tradeModal && !scene.tradeWindow) {
        scene.queuedTradeState = state;
        scene.time.delayedCall(300, () => {
            if (scene.queuedTradeState !== state || !scene.sys.isActive()) return;
            scene.queuedTradeState = null; receiveTradeState(scene, state);
        });
        return;
    }
    if (scene.tradeWindow?.state.id === state.id) {
        if (scene.tradeWindow.state.phase === 'pending' && state.phase === 'active') {
            scene.tradeWindow.close(false);
            receiveTradeState(scene, state);
            return;
        }
        scene.tradeWindow.state = state; scene.tradeWindow.render(); return;
    }
    scene.tradeWindow?.close(false);
    if (state.phase !== 'pending') scene.closePlayerCard(false);
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen trade-screen'; overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue trade-dialogue" role="dialog" aria-modal="true" aria-labelledby="trade-title">
        <button class="resident-close" type="button" aria-label="ביטול החלפה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="trade-title">החלפת פריטים</h2><div class="trade-content"></div>
        <p class="trade-message" role="status" aria-live="polite"></p>
    </section>`;
    const content = overlay.querySelector('.trade-content'), message = overlay.querySelector('.trade-message');
    let busy = false, category = 'all';
    const inventoryScroll = new Map();
    let cleanupChat = () => {};
    const bubbles = new Map(), bubbleTimers = new Map();
    const refreshBubbles = () => {
        for (const avatar of overlay.querySelectorAll('[data-trade-speaker]')) {
            const bubble = avatar.querySelector('.trade-speech');
            const text = bubbles.get(avatar.dataset.tradeSpeaker);
            bubble.textContent = text || ''; bubble.hidden = !text;
        }
    };
    const showBubble = (name, text) => {
        if (!window.state.players.some(player => player.username === name)) return;
        bubbleTimers.get(name)?.remove(); bubbles.set(name, text);
        bubbleTimers.set(name, scene.time.delayedCall(5500, () => {
            bubbles.delete(name); bubbleTimers.delete(name); refreshBubbles();
        }));
        refreshBubbles();
    };
    const window = { state, render, close: animate => {
        if (scene.tradeWindow !== window) return;
        scene.tradeWindow = null;
        scene.events.off('shutdown', shutdown);
        cleanupChat();
        closeModal(animate);
    } };
    scene.tradeWindow = window;
    const send = async (action, request = {}) => {
        if (busy) return;
        busy = true; render(); message.textContent = '';
        try { await scene.multiplayer.requestInventory(`trade:${action}`, { id: window.state.id, revision: window.state.revision, ...request }); }
        catch (error) { if (overlay.isConnected) message.textContent = error.message; }
        finally { busy = false; if (scene.tradeWindow === window) render(); }
    };
    const cancel = () => send('cancel');
    if (state.phase !== 'pending') {
        const chat = document.createElement('section'); chat.className = 'trade-chat';
        chat.innerHTML = `<form class="trade-chat-form"><input type="text" maxlength="100" placeholder="כתבו הודעה..." aria-label="הודעה בצ׳אט" autocomplete="off" />
            <button type="submit">שליחה</button></form>`;
        overlay.querySelector('.trade-dialogue').append(chat);
        const input = chat.querySelector('input');
        const receive = data => {
            if (typeof data?.message !== 'string') return;
            const player = scene.multiplayer.remotePlayers.get(data.id);
            if (player) showBubble(player.username, data.message);
        };
        scene.multiplayer.socket.on('chatMessage', receive);
        cleanupChat = () => {
            scene.multiplayer.socket.off('chatMessage', receive);
            for (const timer of bubbleTimers.values()) timer.remove();
            bubbleTimers.clear(); bubbles.clear();
        };
        chat.querySelector('form').addEventListener('submit', event => {
            event.preventDefault();
            const text = input.value.trim().slice(0, 100);
            if (!text || !scene.multiplayer.socket.connected) return;
            scene.player.showMessage(text);
            scene.multiplayer.sendChatMessage(text);
            showBubble(scene.player.username, text); input.value = ''; input.focus();
        });
    }
    const closeModal = state.phase === 'pending' ? mountRequest(overlay, cancel)
        : mountModal(scene, overlay, cancel, 'tradeModal');
    const shutdown = () => { if (scene.tradeWindow === window) window.close(false); };
    scene.events.once('shutdown', shutdown);

    function itemButton(id, disabled, action, quantity) {
        const button = document.createElement('button'); button.type = 'button';
        button.className = `trade-slot${id ? ' trade-item' : ''}`; button.disabled = disabled || busy;
        if (id) {
            button.dataset.itemId = id; button.title = getClothingItem(id).name;
            button.setAttribute('aria-label', button.title);
            const rarity = Math.max(0, ['C', 'B', 'A', 'S'].indexOf(scene.registry.get('itemRarities')?.[id] || 'C'));
            button.style.backgroundPosition = `${-rarity * 76}px 0`;
            applyHtmlRarityEffect(button, ['C', 'B', 'A', 'S'][rarity]);
            button.append(createTradeItemImage(scene, id));
            if (quantity === null || quantity > 1) {
                const count = document.createElement('span'); count.className = 'trade-quantity';
                count.textContent = quantity === null ? '∞' : `×${quantity}`;
                button.append(count);
            }
        } else button.setAttribute('aria-label', 'משבצת ריקה');
        if (action) button.addEventListener('click', action);
        return button;
    }

    function render() {
        const state = window.state;
        const previousInventory = content.querySelector('.trade-inventory');
        if (previousInventory) inventoryScroll.set(previousInventory.dataset.category, previousInventory.scrollTop);
        content.replaceChildren();
        overlay.querySelector('.trade-dialogue').classList.toggle('trade-request-dialogue', state.phase === 'pending');
        overlay.querySelector('h2').textContent = state.phase === 'pending' ? 'בקשת החלפה' : 'החלפת פריטים';
        if (state.phase === 'pending') {
            const portraits = document.createElement('div'); portraits.className = 'trade-request-portraits';
            for (const [position, index] of [state.me, 1 - state.me].entries()) {
                if (position) {
                    const arrows = document.createElement('span'); arrows.className = 'trade-request-arrows';
                    arrows.textContent = '⇄'; arrows.setAttribute('aria-hidden', 'true'); portraits.append(arrows);
                }
                const portrait = document.createElement('div'); portrait.className = 'trade-request-person';
                const name = document.createElement('strong'); name.textContent = state.players[index].username;
                portrait.append(createTradeAvatar(scene, state.players[index]), name); portraits.append(portrait);
            }
            content.append(portraits);
            const text = document.createElement('p'); text.className = 'trade-invitation';
            text.textContent = state.me === 1 ? `${state.players[0].username} רוצה להחליף איתכם פריטים. מאשרים?`
                : `בקשת החלפה נשלחה ל־${state.players[1].username}. ממתינים לאישור…`;
            content.append(text);
            const actions = document.createElement('div'); actions.className = 'trade-request-actions';
            if (state.me === 1) {
                const accept = createQuestButton('trade-accept', () => send('respond', { accept: true }));
                accept.setAttribute('aria-label', 'אישור בקשת ההחלפה'); accept.title = 'אישור בקשת ההחלפה';
                accept.disabled = busy;
                const reject = document.createElement('button'); reject.className = 'trade-reject trade-decline'; reject.type = 'button';
                reject.setAttribute('aria-label', 'דחיית בקשת ההחלפה'); reject.title = 'דחיית בקשת ההחלפה'; reject.disabled = busy;
                const icon = document.createElement('img'); icon.src = 'assets/ui/x-button.png'; icon.alt = ''; reject.append(icon);
                reject.addEventListener('click', () => send('respond', { accept: false }));
                for (const [button, caption] of [[accept, 'אישור'], [reject, 'דחייה']]) {
                    const action = document.createElement('div');
                    const label = document.createElement('span'); label.textContent = caption;
                    action.append(button, label); actions.append(action);
                }
            } else {
                const waiting = document.createElement('span'); waiting.className = 'trade-request-waiting';
                waiting.textContent = 'ממתינים לתשובה'; actions.append(waiting);
            }
            content.append(actions);
            return;
        }
        const sides = document.createElement('div'); sides.className = 'trade-sides';
        const own = state.players[state.me];
        for (const index of [state.me, 1 - state.me]) {
            const player = state.players[index], mine = index === state.me;
            const side = document.createElement('section'); side.className = 'trade-side';
            side.dataset.side = mine ? 'own' : 'other';
            const name = document.createElement('h3'); name.textContent = `${player.username}${mine ? ' (אתם)' : ''}`;
            const body = document.createElement('div'); body.className = 'trade-side-body';
            const slots = document.createElement('div'); slots.className = 'trade-offer'; slots.dataset.side = mine ? 'own' : 'other';
            for (let i = 0; i < 6; i++) {
                const id = player.offer[i];
                slots.append(itemButton(id, !mine || !id, mine && id ? () => send('offer', { items: own.offer.filter((item, position) => position !== i) }) : null));
            }
            const avatar = document.createElement('div'); avatar.className = 'trade-avatar-wrap';
            avatar.dataset.tradeSpeaker = player.username;
            const bubble = document.createElement('div'); bubble.className = 'trade-speech';
            bubble.setAttribute('role', 'status'); bubble.setAttribute('aria-live', 'polite'); bubble.hidden = true;
            avatar.append(bubble, createTradeAvatar(scene, player));
            body.append(avatar, slots);
            const status = document.createElement('p'); status.className = 'trade-ready';
            status.textContent = player.ready ? '✓ ההצעה אושרה' : 'ממתין לאישור';
            status.classList.toggle('is-ready', player.ready);
            side.append(name, body, status); sides.append(side);
        }
        content.append(sides);
        refreshBubbles();
        const toolbar = document.createElement('div'); toolbar.className = 'trade-toolbar';
        const label = document.createElement('label'); label.textContent = 'הפריטים שלכם ';
        const select = document.createElement('select'); select.setAttribute('aria-label', 'קטגוריית פריטים');
        for (const entry of [{ id: 'all', name: 'הכול' }, ...inventoryCategories]) {
            const option = document.createElement('option'); option.value = entry.id; option.textContent = entry.name; select.append(option);
        }
        select.value = category; select.addEventListener('change', () => { category = select.value; render(); }); label.append(select);
        const confirm = createQuestButton('trade-confirm', () => send('confirm', { accept: !own.ready }));
        confirm.disabled = busy || !state.players.some(player => player.offer.length);
        confirm.setAttribute('aria-label', own.ready ? 'ביטול האישור' : 'אישור הצעת ההחלפה');
        confirm.title = confirm.getAttribute('aria-label'); confirm.setAttribute('aria-pressed', String(own.ready));
        toolbar.append(label, confirm); content.append(toolbar);
        const inventory = document.createElement('div'); inventory.className = 'trade-inventory';
        inventory.dataset.category = category;
        const slots = inventoryCategories.find(entry => entry.id === category)?.slots;
        const unlimited = state.unlimitedItems || scene.registry.get('inventory')?.unlimitedItems || scene.registry.get('auth')?.user?.isAdmin;
        const available = unlimited ? clothingItems.map(item => item.id) : state.available;
        for (const id of available.filter(id => !slots || slots.includes(getClothingItem(id)?.slot))) {
            const remaining = unlimited ? null : (state.quantities?.[id] || 1) - own.offer.filter(item => item === id).length;
            if (remaining === 0) continue;
            inventory.append(itemButton(id, own.offer.length >= 6, () => send('offer', { items: [...own.offer, id] }), remaining));
        }
        if (!inventory.children.length) inventory.textContent = 'אין פריטים זמינים בקטגוריה זו להחלפה.';
        content.append(inventory);
        inventory.scrollTop = inventoryScroll.get(category) || 0;
    }
    render();
}

function mountRequest(overlay, dismiss) {
    overlay.classList.add('trade-request-screen');
    overlay.querySelector('[role="dialog"]').setAttribute('aria-modal', 'false');
    overlay.querySelector('.resident-close').addEventListener('click', dismiss);
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    overlay.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    });
    document.getElementById('game-container').append(overlay);
    openHtmlWindow(overlay);
    return (animate = true) => closeHtmlWindow(overlay, () => {}, animate);
}

export function closeTradeWindow(scene, result) {
    if (!result.id || scene.queuedTradeState?.id === result.id) scene.queuedTradeState = null;
    if (!scene.tradeWindow || (result.id && scene.tradeWindow.state.id !== result.id)) return;
    scene.tradeWindow.close(scene.sys.isActive());
    if (scene.sys.isActive()) scene.showItemNotice(result.reason);
}
