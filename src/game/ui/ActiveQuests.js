import { mountModal } from './AdminGrants';
import { residents } from '../residents/residents';

export function openActiveQuests(scene) {
    if (scene.activeQuestsModal) return;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen active-quests-screen';
    overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue active-quests-dialogue" role="dialog" aria-modal="true" aria-labelledby="active-quests-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="active-quests-title">המשימות שלי</h2>
        <section class="resident-quests">
            <ul class="resident-quest-list"></ul>
            <p class="resident-quests-empty">אין כרגע משימות פעילות. דברו עם תושבי הקבע כדי להתחיל משימה.</p>
        </section>
    </section>`;
    const list = overlay.querySelector('.resident-quest-list');
    const render = () => {
        const quests = Object.values(scene.registry.get('inventory')?.quests || {})
            .filter(chain => chain.started && !chain.completed);
        list.replaceChildren();
        list.hidden = !quests.length;
        overlay.querySelector('.resident-quests-empty').hidden = Boolean(quests.length);
        for (const chain of quests) {
            const step = chain.steps[chain.claimedSteps];
            if (!step) continue;
            const row = document.createElement('li');
            const card = document.createElement('article');
            card.className = 'quest-entry';
            const title = document.createElement('strong');
            title.textContent = chain.title;
            const detail = document.createElement('p');
            detail.textContent = step.description;
            const resident = residents.find(entry => entry.id === chain.residentId);
            const contact = document.createElement('p');
            contact.className = 'active-quest-contact';
            contact.textContent = resident ? `תושב: ${resident.name}` : '';
            const status = document.createElement('span');
            status.className = 'quest-progress';
            status.textContent = step.ready
                ? `השלב הושלם - חזרו אל ${resident?.name || 'תושב הקבע'} כדי להמשיך.`
                : step.progressText;
            card.append(title, detail, contact, status);
            row.append(card);
            list.append(row);
        }
    };
    render();
    let close;
    const cleanup = () => scene.registry.events.off('changedata-inventory', render);
    const dismiss = () => {
        scene.sound.play('ui-close');
        cleanup();
        scene.events.off('shutdown', cleanup);
        close();
    };
    close = mountModal(scene, overlay, dismiss, 'activeQuestsModal');
    scene.registry.events.on('changedata-inventory', render);
    scene.events.once('shutdown', cleanup);
    overlay.addEventListener('click', event => { if (event.target === overlay) dismiss(); });
    return overlay;
}
