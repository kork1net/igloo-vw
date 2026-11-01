const fs = require('node:fs');
const path = require('node:path');
const { normalizeEquipment } = require('../scripts/item-catalog.cjs');
const economy = require('./economy.json');
const shopCatalogFile = path.join(__dirname, 'shop-catalog.json');
const { starterColors } = require('../shared/registration.json');
const WHITE = 'body-color/white';
const { rewards, config: snowConfig } = require('./snow-game.cjs');
const { rankForPoints } = require('./ranks.cjs');
const { chain, questView, activeQuestStep } = require('./quests.cjs');

class InventoryError extends Error {}

class Inventories {
    constructor(directory = path.join(__dirname, 'data/players')) {
        this.directory = path.resolve(directory);
        this.profiles = new Map();
    }

    filename(user) {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(user.id)) throw new Error('Invalid player ID');
        return path.join(this.directory, `${user.id}.json`);
    }

    load(user) {
        if (this.profiles.has(user.id)) return this.profiles.get(user.id);
        const filename = this.filename(user);
        let profile;
        if (fs.existsSync(filename)) {
            profile = JSON.parse(fs.readFileSync(filename, 'utf8'));
            if (!Array.isArray(profile.items) || !profile.equipped
                || !Number.isSafeInteger(profile.currency) || profile.currency < 0) {
                throw new Error('Invalid saved player inventory');
            }
        } else {
            const starterColor = starterColors.includes(user.starterColor) ? user.starterColor : WHITE;
            profile = { version: 1, items: [starterColor], equipped: { bodyColor: starterColor },
                currency: economy.startingCurrency, purchasedItems: [], revision: 0 };
            this.persist(user, profile);
        }
        this.profiles.set(user.id, profile);
        return profile;
    }

    persist(user, profile) {
        const filename = this.filename(user);
        fs.mkdirSync(this.directory, { recursive: true });
        fs.writeFileSync(filename + '.tmp', JSON.stringify(profile, null, 2));
        fs.renameSync(filename + '.tmp', filename);
        // Publish only after the atomic file replacement succeeds.
        this.profiles.set(user.id, profile);
    }

    snapshot(user, catalog) {
        const profile = this.load(user);
        const known = new Set(catalog.items.map(item => item.id));
        const items = user.isAdmin ? [...known]
            : [...new Set(profile.items)].filter(id => known.has(id));
        const owned = new Set(items);
        const equipped = normalizeEquipment(profile.equipped, catalog);
        for (const slot of Object.keys(equipped)) {
            if (!owned.has(equipped[slot])) equipped[slot] = null;
        }
        if (!equipped.bodyColor) {
            equipped.bodyColor = owned.has(WHITE) ? WHITE
                : catalog.items.find(item => item.slot === 'bodyColor' && owned.has(item.id))?.id || null;
        }
        const rankingPoints = profile.rankingPoints || 0;
        return { items, equipped, currency: profile.currency, revision: profile.revision || 0,
            rankingPoints, ...rankForPoints(rankingPoints, user.isAdmin), snowBest: profile.snowBest || 0,
            quests: { [chain.id]: questView(profile, user, catalog, equipped) } };
    }

    equip(user, itemId, shouldEquip, catalog) {
        const item = catalog.items.find(item => item.id === itemId);
        const inventory = this.snapshot(user, catalog);
        if (!item || !inventory.items.includes(itemId)) {
            throw new InventoryError('הפריט אינו בבעלותך.');
        }
        const equipped = { ...inventory.equipped,
            [item.slot]: shouldEquip ? itemId : item.slot === 'bodyColor' ? inventory.equipped.bodyColor : null };
        if (JSON.stringify(equipped) === JSON.stringify(inventory.equipped)) return inventory;
        const profile = this.load(user);
        this.persist(user, { ...profile, equipped, revision: inventory.revision + 1 });
        return this.snapshot(user, catalog);
    }

    purchase(user, itemId, catalog) {
        if (!this.shopCatalog(catalog).some(item => item.id === itemId)) {
            throw new InventoryError('הפריט אינו זמין לרכישה.');
        }
        const inventory = this.snapshot(user, catalog);
        if (inventory.items.includes(itemId)) throw new InventoryError('הפריט כבר נמצא בתיק שלך.');
        if (inventory.currency < economy.itemPrice) throw new InventoryError('אין לך מספיק מטבעות.');
        const profile = this.load(user);
        const previousPurchases = profile.purchasedItems || profile.items.filter(id => id !== (user.starterColor || WHITE));
        this.persist(user, { ...profile, items: [...new Set([...profile.items, itemId])],
            purchasedItems: [...new Set([...previousPurchases, itemId])],
            currency: inventory.currency - economy.itemPrice, revision: inventory.revision + 1 });
        return this.snapshot(user, catalog);
    }

    acceptQuest(user, chainId, catalog) {
        if (chainId !== chain.id) throw new InventoryError('שרשרת משימות לא קיימת.');
        const profile = this.load(user);
        if (profile.quests?.[chain.id]?.started) return this.snapshot(user, catalog);
        this.persist(user, { ...profile, quests: { ...profile.quests,
            [chain.id]: { started: true, claimed: 0, claimedIds: [], completed: false } }, revision: (profile.revision || 0) + 1 });
        return this.snapshot(user, catalog);
    }

    claimQuest(user, chainId, stepId, catalog) {
        if (chainId !== chain.id) throw new InventoryError('שרשרת משימות לא קיימת.');
        const inventory = this.snapshot(user, catalog);
        const view = inventory.quests[chain.id];
        const step = view.steps[view.claimedSteps];
        if (!view.started || !step || step.id !== stepId || !step.ready) {
            throw new InventoryError('יש להשלים את המשימה הנוכחית לפני קבלת הפרס.');
        }
        if (step.itemReward && !catalog.items.some(item => item.id === step.itemReward)) {
            throw new InventoryError('פריט הפרס אינו זמין כרגע. נסו שוב מאוחר יותר.');
        }
        const profile = this.load(user);
        this.persist(user, { ...profile,
            currency: profile.currency + step.coins,
            rankingPoints: (profile.rankingPoints || 0) + step.rankingPoints,
            items: step.itemReward ? [...new Set([...profile.items, step.itemReward])] : profile.items,
            quests: { ...profile.quests, [chain.id]: { ...profile.quests?.[chain.id], started: true, claimed: view.claimedSteps + 1,
                claimedIds: [...view.claimedIds, step.id], completed: view.claimedSteps + 1 === chain.steps.length } },
            revision: inventory.revision + 1 });
        return this.snapshot(user, catalog);
    }

    currentQuestStep(user) {
        return activeQuestStep(this.load(user))?.id || null;
    }

    rewardSnow(user, round) {
        if (round.elapsed < snowConfig.duration) throw new InventoryError('הסיבוב עדיין לא הסתיים.');
        const profile = this.load(user);
        if (profile.lastSnowRound?.id === round.id) return profile.lastSnowRound;
        const earned = rewards(round.score, round.catches);
        const step = activeQuestStep(profile);
        let quests = profile.quests;
        if (step?.rule === 'snow' && round.questStepId === step.id) {
            const progress = profile.quests[chain.id];
            quests = { ...profile.quests, [chain.id]: { ...progress, snowScores: {
                ...progress.snowScores, [step.id]: Math.max(progress.snowScores?.[step.id] || 0, round.score)
            } } };
        }
        const rankingPoints = (profile.rankingPoints || 0) + earned.rankingPoints;
        const result = { id: round.id, score: round.score, ...earned,
            totalRankingPoints: rankingPoints, ...rankForPoints(rankingPoints, user.isAdmin),
            best: Math.max(profile.snowBest || 0, round.score) };
        this.persist(user, { ...profile, currency: profile.currency + earned.coins,
            rankingPoints, snowBest: result.best, lastSnowRound: result, quests,
            revision: (profile.revision || 0) + 1 });
        return result;
    }

    shopCatalog(catalog) {
        // Read the explicit allowlist again so newly approved items do not wait
        // for a server restart. Unlisted assets still never go on sale.
        const shopItems = JSON.parse(fs.readFileSync(shopCatalogFile, 'utf8'));
        return catalog.items.filter(item => shopItems.includes(item.id))
            .map(item => ({ id: item.id, price: economy.itemPrice }));
    }
}

module.exports = { Inventories, InventoryError };
