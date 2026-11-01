export function createQuestButton(action, callback) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'quest-action';
    button.dataset.questAction = action;
    const label = action === 'claim' ? 'קבלת פרס' : action === 'close' ? 'סיום' : 'אישור';
    button.setAttribute('aria-label', label);
    button.title = label;
    const icon = document.createElement('img');
    icon.src = 'assets/ui/v-button.png';
    icon.alt = '';
    button.append(icon);
    button.addEventListener('click', callback);
    return button;
}
