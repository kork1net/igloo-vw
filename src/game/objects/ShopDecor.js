import { setWorldDepth } from './WorldDepth';

function croppedProp(scene, key, bounds, x, y, width) {
    const texture = scene.textures.get(key);
    if (!texture.has('prop')) texture.add('prop', 0, ...bounds);
    return scene.add.image(x, y, key, 'prop').setOrigin(0.5, 1).setScale(width / bounds[2]);
}

export function createShopDecor(scene) {
    const { width, height } = scene.scale;
    const shopWindow = scene.add.image(width * 0.5, height * 0.14, 'shop-window').setDepth(-0.5);
    shopWindow.setScale(440 / shopWindow.width);
    const shelves = [0.18, 0.82].flatMap((ratio, column) => [
        croppedProp(scene, 'shop-wall-shelf', [34, 158, 1877, 514], width * ratio, height * 0.25, 280)
            .setDepth(0).setFlipX(column === 1),
        croppedProp(scene, 'shop-wall-shelf', [34, 158, 1877, 514], width * ratio, height * 0.125, 280)
            .setDepth(0).setFlipX(column === 0)
    ]);
    const tableX = width * 0.15, tableY = height * 0.68;
    const shadow = scene.add.ellipse(tableX - 4, tableY - 9, 225, 25, 0x62452d, 0.15).setDepth(0);
    const table = scene.add.image(tableX, tableY, 'shop-table').setOrigin(0.5, 1);
    table.setScale(200 / table.width);
    setWorldDepth(table, tableY, height);
    const hairStandPosition = { x: tableX, y: tableY - table.displayHeight * 0.82 + 3 };
    return { shopWindow, shelves, table, shadow, hairStandPosition };
}
