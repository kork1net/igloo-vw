export function createRankingIcon(size = 24) {
    const icon = document.createElement('img');
    icon.src = 'assets/ui/levelup-symbol.png';
    icon.alt = 'נקודות דירוג';
    icon.className = 'coin-icon';
    icon.width = size;
    icon.height = Math.round(size * 56 / 51);
    return icon;
}
