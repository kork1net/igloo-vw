export function createCoinIcon(size = 24) {
    const icon = document.createElement('img');
    icon.src = 'assets/ui/coin-symbol.png';
    icon.alt = 'מטבעות';
    icon.className = 'coin-icon';
    icon.width = size;
    icon.height = Math.round(size * 50 / 48);
    return icon;
}
