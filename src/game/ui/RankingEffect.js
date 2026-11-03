export function addLevelBadgePulse(scene, badge) {
    if (typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const pulse = scene.tweens.add({
        targets: badge,
        scaleX: badge.scaleX * 1.08,
        scaleY: badge.scaleY * 1.08,
        duration: 1100,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1
    });
    badge.once('destroy', () => pulse.stop());
}

export function addRankingEffect(scene, panel, x, y, level) {
    const tweens = [];
    const color = level >= 3 ? 0xd4b8ff : 0xb5eaff;
    const halo = scene.add.graphics().setPosition(x - 84, y + 224);
    halo.fillStyle(color, 0.16);
    halo.fillRect(-46, -34, 92, 68);
    halo.fillRect(-34, -46, 68, 92);
    halo.fillStyle(0xe5f8ff, 0.12);
    halo.fillRect(-34, -34, 68, 68);
    panel.add(halo);

    const pointsHalo = scene.add.graphics().setPosition(x + 45, y + 210);
    pointsHalo.fillStyle(0xc5efff, 0.16);
    pointsHalo.fillRect(-58, -18, 116, 36);
    pointsHalo.fillRect(-48, -24, 96, 48);
    panel.add(pointsHalo);

    const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    tweens.push(scene.tweens.add({
        targets: [halo, pointsHalo], alpha: 0.35,
        duration: 1300, ease: 'Sine.easeInOut', yoyo: true, repeat: -1
    }));
    const positions = [[-127, 185], [-42, 188], [-126, 263], [-40, 270], [8, 181], [128, 185], [137, 227]];
    positions.forEach(([dx, dy], index) => {
        const star = scene.add.graphics().setPosition(x + dx, y + dy).setAlpha(0);
        star.fillStyle(index % 2 ? color : 0xf3fbff, 1);
        star.fillRect(-1, -5, 2, 10);
        star.fillRect(-5, -1, 10, 2);
        panel.add(star);
        tweens.push(scene.tweens.add({
            targets: star, alpha: 0.85, y: star.y - 5,
            duration: 650 + index * 90, delay: index * 180, repeatDelay: 400,
            ease: 'Sine.easeInOut', yoyo: true, repeat: -1
        }));
    });
    // Inventory is rebuilt on category changes and server updates as well as closed.
    panel.once('destroy', () => tweens.forEach(tween => tween.stop()));
}
