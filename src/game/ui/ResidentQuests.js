import { openQuestConversation } from './QuestConversation';
const TEXT = { completed: 'המשימה הושלמה. משקפי השמש נוספו לתיק שלכם!',
    available: 'לליאו יש משהו לספר לכם. לחצו כדי לדבר איתו.',
    finished: 'הושלם', speak: 'שיחה עם ליאו', ready: 'השלמתם את הבקשה — חזרו לדבר עם ליאו!' };

export function renderResidentQuests(resident) {
    const overlay = resident.dialogue;
    if (!overlay || overlay.windowClosing) return;
    const list = overlay.querySelector('.resident-quest-list');
    const empty = overlay.querySelector('.resident-quests-empty');
    const ids = resident.definition.questChainIds || [];
    const quests = resident.scene.registry.get('inventory')?.quests || {};
    list.replaceChildren();
    list.hidden = ids.length === 0;
    empty.hidden = ids.length > 0;
    overlay.querySelector('.resident-quests-subtitle').textContent = '';
    for (const id of ids) {
        const chain = quests[id];
        if (!chain) continue;
        const step = chain.started && !chain.completed ? chain.steps[chain.claimedSteps] : null;
        const row = document.createElement('li');
        row.className = 'quest-current';
        const entry = document.createElement('button');
        entry.type = 'button'; entry.className = 'quest-entry'; entry.dataset.questId = id;
        const title = document.createElement('strong'); title.textContent = chain.title;
        const detail = document.createElement('p');
        detail.textContent = chain.completed ? TEXT.completed : !chain.started ? TEXT.available : step.description;
        if (chain.completed) detail.className = 'quest-complete';
        const status = document.createElement('span'); status.className = 'quest-progress';
        status.textContent = chain.completed ? TEXT.finished : !chain.started ? TEXT.speak
            : step.ready ? TEXT.ready : step.progressText;
        if (step) row.dataset.stepId = step.id;
        entry.append(title, detail, status);
        entry.addEventListener('click', () => {
            resident.scene.sound.play('wood-tap-ui');
            openQuestConversation(resident, id);
        });
        row.append(entry); list.append(row);
    }
}
