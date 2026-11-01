export function createMinigameBadge(scene, container) {
    const badge = scene.add.image(0, -62, 'in-minigame-symbol').setOrigin(0.5, 1).setVisible(false);
    badge.setScale(40 / badge.width);
    container.add(badge);
    return badge;
}
