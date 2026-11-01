import { mountModal } from './AdminGrants';
import { createQuestButton } from './QuestButton';

export function openAdminReset(scene) {
    if (!scene.registry.get('auth')?.user?.isAdmin || scene.adminModal) return;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen admin-grant-screen';
    overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue admin-grant-dialogue" role="dialog" aria-modal="true" aria-labelledby="admin-reset-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="admin-reset-title">איפוס שחקן</h2>
        <form class="admin-grant-form admin-reset-form">
            <label>שם השחקן לאיפוס<input name="username" required maxlength="20" autocomplete="off" /></label>
            <p class="admin-reset-warning" hidden></p>
            <label class="admin-reset-confirm" hidden>לאישור, הקלידו שוב את שם השחקן<input name="confirmation" required maxlength="20" autocomplete="off" disabled /></label>
        </form>
        <p class="admin-grant-status" role="status" aria-live="polite"></p>
    </section>`;
    const form = overlay.querySelector('form');
    const status = overlay.querySelector('[role="status"]');
    const submit = createQuestButton('admin-reset', () => {});
    submit.type = 'submit';
    submit.setAttribute('aria-label', 'המשך לאישור איפוס');
    submit.title = 'המשך לאישור איפוס';
    form.append(submit);
    let confirming = false, busy = false, requestId;
    const close = mountModal(scene, overlay, () => { if (!busy) close(); });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy) return;
        const username = form.elements.username.value.trim();
        if (!confirming) {
            confirming = true;
            form.elements.username.readOnly = true;
            const warning = form.querySelector('.admin-reset-warning');
            warning.textContent = `לאפס את ${username}? כל הפריטים, הלבוש, הכסף, הניקוד, השיאים והמשימות יוחזרו למצב של שחקן חדש, עם כסף התחלתי וצבע ההתחלה בלבד. שם המשתמש, הסיסמה והמגדר יישמרו. שחקן מחובר ינותק. אין אפשרות לבטל את האיפוס.`;
            warning.hidden = false;
            form.querySelector('.admin-reset-confirm').hidden = false;
            form.elements.confirmation.disabled = false;
            submit.setAttribute('aria-label', 'אישור איפוס השחקן');
            submit.title = 'אישור איפוס השחקן';
            form.elements.confirmation.focus();
            return;
        }
        if (form.elements.confirmation.value.normalize('NFKC').trim().toLowerCase() !== username.normalize('NFKC').toLowerCase()) {
            status.textContent = 'שם האישור אינו תואם לשחקן שנבחר.';
            return;
        }
        busy = true; submit.disabled = true;
        requestId ||= crypto.randomUUID();
        status.textContent = 'מאפס את השחקן...';
        try {
            const result = await scene.multiplayer.requestInventory('admin:resetPlayer', {
                username, confirmUsername: form.elements.confirmation.value, id: requestId
            });
            if (!overlay.isConnected) return;
            status.textContent = `השחקן ${result.username} אופס בהצלחה.`;
            form.elements.confirmation.disabled = true;
        } catch (error) {
            if (overlay.isConnected) { status.textContent = error.message; submit.disabled = false; }
        } finally { busy = false; }
    });
}
