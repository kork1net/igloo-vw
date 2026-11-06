import { mountModal } from './AdminGrants';

const names = { leo: 'ליאו', rani: 'רני', mia: 'מיה' };
const labels = { title: 'כותרת', introduction: 'שיחת פתיחה', ending: 'סיום השרשרת',
    story: 'השיחה בזמן המשימה', description: 'הדרישה שמופיעה בלוח',
    completion: 'השיחה בהשלמת השלב', reminder: 'תזכורת' };

export async function openQuestEditor(resident) {
    const scene = resident.scene;
    if (!scene.registry.get('auth')?.user?.isAdmin || scene.questEditor) return;
    const overlay = document.createElement('div');
    overlay.className = 'resident-screen quest-editor-screen'; overlay.dir = 'rtl';
    overlay.innerHTML = `<section class="resident-dialogue quest-editor-dialogue" role="dialog" aria-modal="true" aria-labelledby="quest-editor-title">
        <button class="resident-close" type="button" aria-label="סגירה"><img src="assets/ui/x-button.png" alt="" /></button>
        <h2 id="quest-editor-title"></h2>
        <p>כל שלבי השרשראות זמינים כאן, כולל שלבים שממשיכים אצל תושב אחר. העריכה משנה את הטקסטים לכל השחקנים.</p>
        <div class="quest-editor-selectors"><label>שרשרת<select class="quest-editor-chain"></select></label>
        <label>שלב בשרשרת<select class="quest-editor-step"></select></label></div>
        <p class="quest-editor-details"></p>
        <form class="quest-editor-form"><div class="quest-editor-fields"></div>
        <div class="quest-editor-actions"><button type="submit">שמירת השינויים</button>
        <button type="button" class="quest-editor-reload">טעינה מחדש</button></div></form>
        <p class="quest-editor-status" role="status" aria-live="polite"></p>
    </section>`;
    overlay.querySelector('h2').textContent = `ניהול המשימות של ${resident.definition.name}`;
    const chainSelect = overlay.querySelector('.quest-editor-chain');
    const stepSelect = overlay.querySelector('.quest-editor-step');
    const form = overlay.querySelector('form');
    const fields = overlay.querySelector('.quest-editor-fields');
    const status = overlay.querySelector('.quest-editor-status');
    const save = form.querySelector('[type=submit]');
    const drafts = new Map();
    let quests = [], busy = false;
    const close = (animate = true) => {
        if (busy && animate) return;
        if (animate) scene.sound.play('ui-close');
        dismiss(animate);
    };
    const dismiss = mountModal(scene, overlay, () => close(), 'questEditor');
    const current = () => quests.find(chain => chain.id === chainSelect.value);
    const key = () => `${chainSelect.value}:${stepSelect.value}`;
    const render = () => {
        fields.replaceChildren();
        const chain = current();
        if (!chain) { save.disabled = true; return; }
        const step = chain.steps.find(step => step.id === stepSelect.value);
        const target = step || chain;
        const selectedFields = step ? ['title', 'story', 'description', 'completion', 'reminder'] : ['title', 'introduction', 'ending'];
        if (!drafts.has(key())) drafts.set(key(), { revision: chain.revision, base: { ...target }, values: {} });
        const draft = drafts.get(key());
        overlay.querySelector('.quest-editor-details').textContent = step
            ? `תושב: ${names[step.residentId || chain.residentId]} | דרגה: ${chain.level} | יעד: ${step.target} | פרס: ${step.coins} מטבעות, ${step.rankingPoints} נקודות דירוג`
            : `דרגה: ${chain.level} | ${chain.steps.length} שלבים`;
        for (const field of selectedFields) {
            const label = document.createElement('label'); label.textContent = labels[field];
            const input = document.createElement(field === 'title' ? 'input' : 'textarea');
            input.name = field; input.maxLength = field === 'title' ? 120 : 6000;
            input.value = draft.values[field] ?? draft.base[field] ?? '';
            input.required = field !== 'reminder';
            if (field !== 'title') input.rows = field === 'description' ? 2 : 4;
            input.addEventListener('input', () => {
                draft.values[field] = input.value;
                save.disabled = !Object.entries(draft.values).some(([key, value]) => value !== (draft.base[key] || ''));
            });
            label.append(input); fields.append(label);
        }
        save.disabled = !Object.entries(draft.values).some(([key, value]) => value !== (draft.base[key] || ''));
    };
    const steps = (selected = '') => {
        stepSelect.replaceChildren(new Option('פתיחה וסיום השרשרת', ''));
        current()?.steps.forEach((step, index) => stepSelect.add(new Option(
            `${index + 1}. ${step.title} - ${names[step.residentId || current().residentId]}`, step.id)));
        stepSelect.value = [...stepSelect.options].some(option => option.value === selected) ? selected : '';
        render();
    };
    const populate = (values, selectedChain = chainSelect.value, selectedStep = stepSelect.value) => {
        quests = values; chainSelect.replaceChildren();
        for (const chain of quests) chainSelect.add(new Option(`${chain.title} (דרגה ${chain.level})`, chain.id));
        if (quests.some(chain => chain.id === selectedChain)) chainSelect.value = selectedChain;
        steps(selectedStep);
    };
    const lock = value => {
        busy = value;
        overlay.querySelectorAll('input, textarea, select, button').forEach(control => { control.disabled = value; });
        if (!value) render();
    };
    const load = async () => {
        lock(true); status.textContent = 'טוען את שרשראות המשימות...';
        try {
            const result = await scene.multiplayer.requestInventory('admin:quests', { residentId: resident.id });
            if (!overlay.isConnected) return;
            drafts.clear(); populate(result.quests);
            status.textContent = quests.length ? '' : 'אין שרשראות משימות לתושב הזה.';
        } catch (error) { status.textContent = error.message; }
        finally { if (overlay.isConnected) lock(false); }
    };
    chainSelect.addEventListener('change', () => { status.textContent = ''; steps(); });
    stepSelect.addEventListener('change', () => { status.textContent = ''; render(); });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (busy || save.disabled) return;
        const draftKey = key(), draft = drafts.get(draftKey);
        const changes = Object.fromEntries(Object.entries(draft.values).filter(([key, value]) => value !== (draft.base[key] || '')));
        const selectedChain = chainSelect.value, selectedStep = stepSelect.value;
        lock(true); status.textContent = 'שומר...'; scene.sound.play('wood-tap-ui');
        try {
            const result = await scene.multiplayer.requestInventory('admin:saveQuest', {
                residentId: resident.id, chainId: selectedChain, ...(selectedStep ? { stepId: selectedStep } : {}),
                revision: draft.revision, changes
            });
            if (!overlay.isConnected) return;
            drafts.delete(draftKey); populate(result.quests, selectedChain, selectedStep);
            status.textContent = 'השינויים נשמרו והוחלו במשחק.';
        } catch (error) { status.textContent = error.message; scene.sound.play('hurt-sfx'); }
        finally { if (overlay.isConnected) lock(false); }
    });
    overlay.querySelector('.quest-editor-reload').addEventListener('click', load);
    await load();
}
