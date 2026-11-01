const effects = {
    B: { color: 0x70d7ff, strength: 0.6, stars: 2, duration: 1600 },
    A: { color: 0xd5a2ff, strength: 0.8, stars: 4, duration: 1200 },
    S: { color: 0xffd36a, strength: 1, stars: 6, duration: 850 }
};

export function addItemRarityEffect(scene, panel, slot, rarity) {
    const effect = effects[rarity];
    if (!effect) return null;
    const root = scene.add.container(slot.x, slot.y)
        .setData('itemRarity', rarity).setData('rarityItemId', slot.getData('itemId'));
    panel.add(root);
    const halo = scene.add.graphics();
    halo.lineStyle(12, effect.color, effect.strength * 0.2);
    halo.strokeRect(-59, -59, 118, 118);
    halo.lineStyle(6, effect.color, effect.strength * 0.45);
    halo.strokeRect(-59, -59, 118, 118);
    halo.lineStyle(2, effect.color, effect.strength);
    halo.strokeRect(-59, -59, 118, 118);
    root.add(halo);
    const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tweens = [];
    if (!reducedMotion) tweens.push(scene.tweens.add({
        targets: halo, alpha: 0.65, duration: effect.duration,
        ease: 'Sine.easeInOut', yoyo: true, repeat: -1
    }));
    const positions = [[-48, -48], [48, 48], [48, -48], [-48, 48], [0, -56], [0, 56]];
    positions.slice(0, effect.stars).forEach(([x, y], index) => {
        const star = scene.add.graphics().setPosition(x, y).setAlpha(reducedMotion ? 0.85 : 0.35);
        const radius = 4 + effect.stars / 2;
        star.fillStyle(effect.color, 1);
        star.fillRect(-1, -radius, 2, radius * 2);
        star.fillRect(-radius, -1, radius * 2, 2);
        star.fillStyle(0xffffff, 1);
        star.fillRect(-1, -1, 2, 2);
        root.add(star);
        if (!reducedMotion) tweens.push(scene.tweens.add({
            targets: star, alpha: 1, duration: effect.duration * 0.6,
            delay: index * 160, repeatDelay: 240, ease: 'Sine.easeInOut', yoyo: true, repeat: -1
        }));
    });
    root.once('destroy', () => tweens.forEach(tween => tween.stop()));
    return root;
}

export function applyHtmlRarityEffect(element, rarity) {
    const effect = effects[rarity];
    element.classList.toggle('item-rarity-effect', !!effect);
    element.dataset.rarity = effect ? rarity : 'C';
    if (!effect) return;
    element.style.setProperty('--rarity-color', `#${effect.color.toString(16).padStart(6, '0')}`);
    element.style.setProperty('--rarity-strength', effect.strength);
    element.style.setProperty('--rarity-duration', `${effect.duration}ms`);
}
