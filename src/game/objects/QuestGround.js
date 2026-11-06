import config from '../../../shared/quest-ground.json';

export function createQuestGround(scene) {
    const objects = new Map();
    let previous, pending = false, target = null, retryAt = 0, stopped = false, nextPoll = 0;
    const blocked = () => !scene.input.enabled || scene.activeResident || scene.inventoryWindow
        || scene.playerCard || scene.adminModal || scene.tradeModal || scene.snowGame || scene.coffeeGame;
    const render = items => {
        const ids = new Set(items.map(item => item.id));
        for (const [id, object] of objects) if (!ids.has(id)) { object.destroy(); objects.delete(id); }
        for (const item of items) {
            if (objects.has(item.id)) continue;
            const container = scene.add.container(item.x, item.y).setDepth(1).setData('questGroundId', item.id);
            const art = scene.add.graphics();
            art.fillStyle(0x543b30, 0.15).fillEllipse(0, 4, 28, 9);
            if (item.kind === 'parcel') {
                art.fillStyle(0x735036).fillRect(-13, -16, 26, 20);
                art.fillStyle(0xd4a66d).fillRect(-10, -13, 20, 14);
                art.fillStyle(0x649bbc).fillRect(-2, -14, 4, 17).fillRect(-11, -9, 22, 4);
            } else if (item.kind === 'ribbon') {
                art.fillStyle(0x69406e).fillRect(-12, -11, 10, 11).fillRect(2, -11, 10, 11);
                art.fillStyle(0xc994cf).fillRect(-9, -8, 6, 5).fillRect(3, -8, 6, 5);
                art.fillStyle(0x9868ac).fillRect(-3, -8, 6, 12);
            } else {
                art.fillStyle(0x9b9d98).fillRect(-11, -12, 22, 16);
                art.fillStyle(0xfff5da).fillRect(-9, -10, 18, 12);
                art.fillStyle(0xd5c9ac).fillRect(-6, -4, 12, 2);
            }
            const hit = scene.add.rectangle(0, -6, 34, 32, 0xffffff, 0.001)
                .setInteractive({ useHandCursor: true });
            hit.on('pointerover', () => art.setScale(1.12));
            hit.on('pointerout', () => art.setScale(1));
            hit.on('pointerdown', (pointer, x, y, event) => {
                event.stopPropagation();
                if (blocked()) return;
                target = item; retryAt = 0;
                scene.pendingTransition = null;
                scene.player.setMoveTarget(item.x, item.y, false);
                scene.showClickMarker(item.x, item.y);
            });
            container.add([art, hit]); objects.set(item.id, container);
        }
        if (target && !ids.has(target.id)) target = null;
    };
    const refresh = async () => {
        pending = true;
        nextPoll = scene.time.now + config.pollInterval;
        try {
            const result = await scene.multiplayer.requestInventory('quest:ground', {});
            if (!stopped) render(result.ground);
        } catch { previous = null; retryAt = scene.time.now + 1500; }
        finally { pending = false; }
    };
    const tick = async () => {
        if (stopped || pending || !scene.multiplayer?.socket.connected || scene.time.now < retryAt) return;
        const quests = scene.registry.get('inventory')?.quests;
        const active = Object.values(quests || {}).some(chain => chain.started && !chain.completed
            && chain.steps[chain.claimedSteps]?.rule === 'collect' && !chain.steps[chain.claimedSteps].ready);
        if (quests !== previous || active && scene.time.now >= nextPoll) {
            previous = quests; await refresh(); return;
        }
        if (!target || blocked()) return;
        const position = scene.player.container;
        if (scene.player.moveTarget && Math.hypot(scene.player.moveTarget.x - target.x, scene.player.moveTarget.y - target.y) > 2) {
            target = null; return;
        }
        if (Math.hypot(position.x - target.x, position.y - target.y) > 16) return;
        pending = true;
        try {
            const result = await scene.multiplayer.requestInventory('quest:collect', { id: target.id });
            if (!stopped) { render(result.ground); scene.sound.play('inventory-click'); }
            target = null;
        } catch { retryAt = scene.time.now + 500; }
        finally { pending = false; }
    };
    scene.events.on('update', tick);
    scene.events.once('shutdown', () => {
        stopped = true; target = null;
        scene.events.off('update', tick);
        for (const object of objects.values()) object.destroy();
        objects.clear();
    });
}
