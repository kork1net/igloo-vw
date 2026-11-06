const { randomUUID, randomInt } = require('node:crypto');
const config = require('../shared/quest-ground.json');

// Room changes clear positions, but never create an instant batch to farm.
class QuestGround {
    constructor(colliders, resolveMovement, clock = Date.now) {
        this.colliders = colliders; this.resolve = resolveMovement;
        this.clock = clock;
        this.batches = new Map();
    }

    list(quests) {
        const active = Object.values(quests).flatMap(chain => {
            const step = chain.started && !chain.completed && chain.steps[chain.claimedSteps];
            return step?.rule === 'collect' && !step.ready ? [{ chain, step }] : [];
        });
        const keys = new Set(active.map(({ chain, step }) => `${chain.id}:${step.id}`));
        for (const key of this.batches.keys()) if (!keys.has(key)) this.batches.delete(key);
        for (const { chain, step } of active) {
            const key = `${chain.id}:${step.id}`;
            let batch = this.batches.get(key);
            if (!batch) {
                batch = { items: [], nextAt: this.clock() + randomInt(config.minSpawnDelay, config.maxSpawnDelay + 1) };
                this.batches.set(key, batch);
            }
            if (this.clock() < batch.nextAt) continue;
            // No catch-up burst after a background tab or while the floor is full.
            batch.nextAt = this.clock() + randomInt(config.minSpawnDelay, config.maxSpawnDelay + 1);
            if (batch.items.length >= config.maxVisiblePerStage) continue;
            for (let attempt = 0; attempt < 150; attempt++) {
                const position = { x: randomInt(115, 1165), y: randomInt(345, 610) };
                const resolved = this.resolve(position, position, this.colliders);
                if (Math.hypot(position.x - resolved.x, position.y - resolved.y) > 1) continue;
                const others = [...this.batches.values()].flatMap(entry => entry.items);
                if (others.some(item => Math.hypot(item.x - position.x, item.y - position.y) < 48)) continue;
                batch.items.push({ id: randomUUID(), ...position, chainId: chain.id, stepId: step.id, kind: step.collectible });
                break;
            }
        }
        return [...this.batches.values()].flatMap(batch => batch.items);
    }

    collect(id, player, quests, save) {
        const item = this.list(quests).find(entry => entry.id === id);
        if (!item || !player || player.minigame || Math.hypot(player.x - item.x, player.y - item.y) > 38) {
            throw new Error('התקרבו לחפץ כדי לאסוף אותו.');
        }
        save(item); // Keep the item if persistence failed.
        const batch = this.batches.get(`${item.chainId}:${item.stepId}`).items;
        batch.splice(batch.indexOf(item), 1);
    }
}
module.exports = { QuestGround };
