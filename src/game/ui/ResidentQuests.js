import { openQuestConversation } from './QuestConversation';
const TEXT = { finished: '\u05d4\u05d5\u05e9\u05dc\u05dd' };

export function renderResidentQuests(resident) {
    const overlay = resident.dialogue;
    if (!overlay || overlay.windowClosing) return;
    const list = overlay.querySelector('.resident-quest-list');
    const empty = overlay.querySelector('.resident-quests-empty');
    const quests = resident.scene.registry.get('inventory')?.quests || {};
    const ids = Object.values(quests).filter(chain => chain.residentId === resident.id).map(chain => chain.id);
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
        detail.textContent = chain.completed ? TEXT.finished : !chain.started ? '\u05de\u05e9\u05d9\u05de\u05d4 \u05d7\u05d3\u05e9\u05d4 - \u05dc\u05d7\u05e6\u05d5 \u05dc\u05e9\u05d9\u05d7\u05d4.' : step.description;
        if (chain.completed) detail.className = 'quest-complete';
        const status = document.createElement('span'); status.className = 'quest-progress';
        status.textContent = chain.completed ? TEXT.finished : !chain.started ? resident.definition.name
            : step.ready ? '\u05d4\u05d1\u05e7\u05e9\u05d4 \u05d4\u05d5\u05e9\u05dc\u05de\u05d4 - \u05dc\u05d7\u05e6\u05d5 \u05db\u05d3\u05d9 \u05dc\u05d4\u05de\u05e9\u05d9\u05da' : step.progressText;
        if (step) row.dataset.stepId = step.id;
        entry.append(title, detail, status);
        entry.addEventListener('click', () => {
            resident.scene.sound.play('wood-tap-ui');
            openQuestConversation(resident, id);
        });
        row.append(entry); list.append(row);
    }
}
