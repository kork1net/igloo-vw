export function createAdminBadge(scene, container, isAdmin) {
    const badge = scene.add.image(0, 61, 'admin-symbol');
    badge.setScale(22 / badge.height);
    badge.setVisible(isAdmin === true);
    container.add(badge);
    return badge;
}
