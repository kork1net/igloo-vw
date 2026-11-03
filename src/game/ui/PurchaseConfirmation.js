import { mountModal } from './AdminGrants';
import { createQuestButton } from './QuestButton';
import { createCoinIcon } from './CoinIcon';
import { createTradeItemImage } from './TradeImages';

export function openPurchaseConfirmation(scene, item, price, onConfirm) {
    if (scene.purchaseModal) return scene.purchaseModal;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen purchase-confirm-screen';
    overlay.dir = 'rtl';
    overlay.dataset.itemId = item.id;
    overlay.dataset.price = String(price);
    overlay.innerHTML = `<section class="resident-dialogue purchase-confirm-dialogue" role="dialog" aria-modal="true" aria-labelledby="purchase-confirm-title">
        <h2 id="purchase-confirm-title">אישור רכישה</h2>
        <p class="purchase-confirm-question">בטוחים שברצונכם לרכוש את הפריט?</p>
        <div class="purchase-confirm-item"></div>
        <div class="purchase-confirm-price"></div>
        <div class="purchase-confirm-actions"></div>
        <p class="purchase-confirm-status" role="status" aria-live="polite"></p>
    </section>`;
    overlay.querySelector('.purchase-confirm-item').append(createTradeItemImage(scene, item.id));
    const amount = document.createElement('strong');
    amount.textContent = price.toLocaleString();
    overlay.querySelector('.purchase-confirm-price').append(createCoinIcon(32), amount);

    let busy = false, closeModal;
    const status = overlay.querySelector('.purchase-confirm-status');
    const cancel = () => {
        if (busy || overlay.windowClosing) return;
        scene.sound.play('ui-close');
        closeModal();
    };
    const confirm = createQuestButton('purchase-confirm', async () => {
        if (busy || overlay.windowClosing || !overlay.isConnected) return;
        busy = true;
        overlay.setAttribute('aria-busy', 'true');
        const buttons = [...overlay.querySelectorAll('button')];
        buttons.forEach(button => { button.disabled = true; });
        status.textContent = 'רוכשים…';
        try {
            await onConfirm();
            if (overlay.isConnected) closeModal();
        } catch (error) {
            if (overlay.isConnected && !overlay.windowClosing) {
                if (error.code === 'INSUFFICIENT_FUNDS') scene.sound.play('hurt-sfx');
                status.textContent = error.message || 'הרכישה נכשלה. נסו שוב.';
            }
        } finally {
            busy = false;
            if (overlay.isConnected && !overlay.windowClosing) {
                overlay.setAttribute('aria-busy', 'false');
                buttons.forEach(button => { button.disabled = false; });
            }
        }
    });
    confirm.dataset.purchaseAction = 'confirm';
    confirm.setAttribute('aria-label', 'אישור רכישה');
    confirm.title = 'אישור רכישה';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'quest-action';
    cancelButton.dataset.purchaseAction = 'cancel';
    cancelButton.setAttribute('aria-label', 'ביטול רכישה');
    cancelButton.title = 'ביטול רכישה';
    cancelButton.innerHTML = '<img src="assets/ui/x-button.png" alt="" />';
    cancelButton.addEventListener('click', cancel);
    const actions = overlay.querySelector('.purchase-confirm-actions');
    for (const [button, label] of [[confirm, 'קנייה'], [cancelButton, 'ביטול']]) {
        const action = document.createElement('div');
        const caption = document.createElement('span');
        caption.textContent = label;
        action.append(button, caption);
        actions.append(action);
    }
    overlay.addEventListener('click', event => { if (event.target === overlay) cancel(); });
    closeModal = mountModal(scene, overlay, cancel, 'purchaseModal');
    // Enter should not accidentally purchase while the question first appears.
    cancelButton.focus();
    return overlay;
}
