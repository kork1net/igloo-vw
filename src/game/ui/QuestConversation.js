import { openHtmlWindow, closeHtmlWindow } from './WindowTransition';
import { createQuestButton } from './QuestButton';
import { showQuestRewards } from './QuestRewards';

export function openQuestConversation(resident, chainId) {
    if (resident.questConversation || !resident.dialogue) return;
    const scene = resident.scene;
    const parent = resident.dialogue;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen quest-conversation-screen'; overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue quest-conversation" role="dialog" aria-modal="true" aria-labelledby="quest-talk-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <div class="quest-speaker"><img alt="" /><div><h2 id="quest-talk-title"></h2><p class="quest-talk-title"></p></div></div>
        <p class="quest-story"></p><p class="quest-objective"></p>
        <p class="quest-talk-feedback" role="status" aria-live="polite"></p><div class="quest-talk-actions"></div>
    </section>`;
    overlay.querySelector('.quest-speaker img').src = resident.definition.image;
    overlay.querySelector('h2').textContent = resident.definition.name;
    const story = overlay.querySelector('.quest-story');
    const objective = overlay.querySelector('.quest-objective');
    const feedback = overlay.querySelector('.quest-talk-feedback');
    const actions = overlay.querySelector('.quest-talk-actions');
    const name = scene.registry.get('auth')?.user?.username || scene.player.username;
    const personalize = value => (value || '').replaceAll('{username}', name);
    let busy = false, celebration = false, rewardWindow;
    const current = () => scene.registry.get('inventory')?.quests?.[chainId];
    const button = (action, callback) => {
        const control = createQuestButton(action, callback); actions.append(control);
        return control;
    };
    const render = () => {
        if (!overlay.isConnected || overlay.windowClosing || busy || celebration) return;
        const chain = current();
        if (!chain) return;
        const step = chain.steps[chain.claimedSteps];
        overlay.querySelector('.quest-talk-title').textContent = chain.title;
        actions.replaceChildren(); feedback.textContent = '';
        objective.textContent = '';
        if (chain.completed) {
            story.textContent = personalize(chain.ending);
            button('close', () => close());
        } else if (!chain.started) {
            story.textContent = personalize(chain.introduction);
            button('accept', () => submit('quest:accept'));
        } else {
            story.textContent = personalize(step.ready ? step.completion : step.story);
            objective.textContent = `${step.description}\n${step.progressText}`;
            if (step.ready) button('claim', () => submit('quest:claim', step));
            else {
                button('close', () => close());
            }
        }
    };
    const submit = async (event, step) => {
        if (busy) return;
        busy = true;
        actions.querySelectorAll('button').forEach(control => { control.disabled = true; });
        feedback.textContent = 'רק רגע...';
        scene.sound.play('wood-tap-ui');
        try {
            const result = await scene.multiplayer.requestInventory(event, { chainId, ...(step ? { stepId: step.id } : {}) });
            busy = false;
            if (!overlay.isConnected || overlay.windowClosing) return;
            if (!step) { render(); return; }
            celebration = true;
            const chain = current();
            story.textContent = personalize(chain.completed ? chain.ending : step.completion);
            objective.textContent = '';
            feedback.textContent = ''; actions.replaceChildren();
            const continueQuest = () => {
                if (chain.completed) close();
                else { celebration = false; render(); }
            };
            button(chain.completed ? 'close' : 'continue', continueQuest);
            rewardWindow = showQuestRewards(scene, overlay, result.questReward || {
                coins: step.coins, rankingPoints: step.rankingPoints, itemId: step.itemReward
            }, () => {
                rewardWindow = null;
                if (!chain.completed) { celebration = false; render(); }
                actions.querySelector('button')?.focus();
            });
        } catch (error) {
            busy = false; render(); feedback.textContent = error.message;
        }
    };
    const close = (animate = true) => {
        if (overlay.windowClosing && animate) return;
        rewardWindow?.close(false, false); rewardWindow = null;
        closeHtmlWindow(overlay, () => {
            if (resident.questConversation === controller) resident.questConversation = null;
            parent.inert = false;
            if (parent.isConnected && !parent.windowClosing) parent.querySelector('.quest-entry')?.focus();
        }, animate);
        if (animate) scene.sound.play('ui-close');
    };
    const controller = { close, refresh: render };
    resident.questConversation = controller;
    parent.inert = true;
    overlay.querySelector('.resident-close').addEventListener('click', () => close());
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('pointerdown', event => event.stopPropagation());
    overlay.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') close();
        if (event.key === 'Tab') {
            const controls = [...overlay.querySelectorAll('button')].filter(control => !control.disabled);
            event.preventDefault();
            const index = controls.indexOf(document.activeElement);
            controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
        }
    });
    document.getElementById('game-container').append(overlay);
    render(); openHtmlWindow(overlay);
    actions.querySelector('button')?.focus();
}
