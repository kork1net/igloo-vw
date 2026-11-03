import config from '../../../shared/emojis.json';
import { registerEmojiFrames } from '../objects/PlayerEmoji';
import { addButtonHover } from './ButtonHover';

export function createEmojiMenu(scene, button, x, y) {
    registerEmojiFrames(scene);
    const menu = scene.add.container(x, y).setDepth(150).setScrollFactor(0).setVisible(false);
    menu.add(scene.add.nineslice(0, 0, 'window-frame', undefined, 254, 174, 16, 16, 16, 16)
        .setInteractive().on('pointerdown', (pointer, localX, localY, event) => event.stopPropagation()));
    const backdrop = scene.add.graphics();
    [0xe5f4ff, 0xdeeffb, 0xd1e7f4, 0xbfdcf0].forEach((color, band) => {
        backdrop.fillStyle(color, 1);
        backdrop.fillRect(-111, -71 + band * 36, 222, Math.min(36, 142 - band * 36));
    });
    menu.add(backdrop);
    config.frames.forEach((frame, index) => {
        const row = Math.floor(index / 4);
        const columns = Math.min(4, config.frames.length - row * 4);
        const px = ((index % 4) - (columns - 1) / 2) * 56, py = -28 + row * 56;
        const tile = scene.add.nineslice(px, py, 'quest-entry-frame', undefined, 48, 48, 4, 4, 4, 4)
            .setInteractive({ useHandCursor: true });
        tile.setData('emojiChoice', index);
        const icon = scene.add.image(px, py, 'emojis', String(index));
        menu.add([tile, icon]);
        addButtonHover(scene, tile, [tile, icon]);
        tile.on('pointerover', () => tile.setTint(0xc8edff));
        tile.on('pointerout', () => tile.clearTint());
        tile.on('pointerdown', (pointer, localX, localY, event) => {
            event.stopPropagation();
            scene.multiplayer?.sendEmoji(index);
            scene.sound.play('inventory-click');
            menu.setVisible(false);
        });
    });
    button.on('pointerdown', (pointer, localX, localY, event) => {
        event.stopPropagation();
        scene.sound.play('wood-tap-ui');
        menu.setVisible(!menu.visible);
    });
    const outside = (pointer, objects) => {
        if (!objects.some(object => object === button || object.parentContainer === menu)) menu.setVisible(false);
    };
    const hideForModal = () => {
        if (menu.visible && (scene.inventoryWindow || scene.playerCard || scene.activeResident
            || scene.adminModal || scene.tradeModal || scene.snowGame || scene.rarityManager)) menu.setVisible(false);
    };
    scene.input.on('pointerdown', outside);
    scene.events.on('preupdate', hideForModal);
    scene.events.once('shutdown', () => {
        scene.input.off('pointerdown', outside);
        scene.events.off('preupdate', hideForModal);
    });
    return menu;
}
