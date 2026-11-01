const fs = require('node:fs');
const path = require('node:path');
const { normalizeEquipment } = require('../scripts/item-catalog.cjs');
const economy = require('./economy.json');
const shopCatalogFile = path.join(__dirname, 'shop-catalog.json');
const { starterColors } = require('../shared/registration.json');
const WHITE = 'body-color/white';
const { maxItemQuantity } = require('../shared/inventory-rules.json');
const { rewards, config: snowConfig } = require('./snow-game.cjs');
const { rankForPoints } = require('./ranks.cjs');
const { chain, questView, activeQuestStep } = require('./quests.cjs');

class InventoryError extends Error {}

class Inventories {
    constructor(directory = path.join(__dirname, 'data/players')) {
        this.directory = path.resolve(directory);
        this.profiles = new Map();
        this.tradeRecoveryNeeded = true;
        this.recoverTrades();
    }

    filename(user) {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(user.id)) throw new Error('Invalid player ID');
        return path.join(this.directory, `${user.id}.json`);
    }

    newProfile(user, revision = 0) {
        const starterColor = starterColors.includes(user.starterColor) ? user.starterColor : WHITE;
        return { version: 2, items: [starterColor], quantities: { [starterColor]: 1 },
            equipped: { bodyColor: starterColor }, currency: economy.startingCurrency,
            purchasedItems: [], revision };
    }

    resetPlayer(user, admin, request, catalog) {
        if (!admin.isAdmin) throw new InventoryError('הפעולה זמינה למנהלים בלבד.');
        if (typeof request?.id !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(request.id)) {
            throw new InventoryError('בקשת איפוס לא תקינה.');
        }
        if (typeof request.confirmUsername !== 'string'
            || request.confirmUsername.normalize('NFKC').trim().toLowerCase() !== user.username.normalize('NFKC').toLowerCase()) {
            throw new InventoryError('לאישור האיפוס יש להקליד את שם השחקן שנבחר.');
        }
        const previous = this.load(user);
        const history = previous.adminResetHistory || [];
        if (history.some(entry => entry.id === request.id && entry.adminId === admin.id)) {
            return { reset: false, inventory: this.snapshot(user, catalog) };
        }
        const profile = this.newProfile(user, (previous.revision || 0) + 1);
        // Keep receipts without pending notices so retrying an old gift cannot restore wiped balances.
        profile.adminGrants = (previous.adminGrants || []).map(gift => ({ ...gift, acknowledged: true }));
        profile.adminResetHistory = [...history, { id: request.id, adminId: admin.id, at: Date.now() }];
        this.persist(user, profile);
        return { reset: true, inventory: this.snapshot(user, catalog) };
    }

    load(user) {
        if (this.tradeRecoveryNeeded) this.recoverTrades();
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
            profile = this.newProfile(user);
            this.persist(user, profile);
        }
        this.profiles.set(user.id, profile);
        return profile;
    }

    persist(user, profile) {
        if (this.tradeRecoveryNeeded) this.recoverTrades();
        const filename = this.filename(user);
        fs.mkdirSync(this.directory, { recursive: true });
        fs.writeFileSync(filename + '.tmp', JSON.stringify(profile, null, 2));
        fs.renameSync(filename + '.tmp', filename);
        // Publish only after the atomic file replacement succeeds.
        this.profiles.set(user.id, profile);
    }

    quantities(profile) {
        const legacy = {};
        for (const id of profile.items) legacy[id] = (legacy[id] || 0) + 1;
        return Object.fromEntries(Object.entries(legacy).map(([id, count]) => {
            const quantity = profile.quantities?.[id] ?? count;
            if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Invalid item quantity');
            return [id, quantity];
        }));
    }

    addItem(profile, itemId) {
        const quantities = this.quantities(profile);
        quantities[itemId] = (quantities[itemId] || 0) + 1;
        if (quantities[itemId] > maxItemQuantity) throw new InventoryError(`אפשר להחזיק עד ${maxItemQuantity} עותקים מכל פריט.`);
        if (!Number.isSafeInteger(quantities[itemId])) throw new InventoryError('כמות הפריט חורגת מהמותר.');
        return { version: 2, items: Object.keys(quantities), quantities };
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
        const quantities = this.quantities(profile);
        return { items, quantities: Object.fromEntries(items.map(id => [id, user.isAdmin ? null : quantities[id]])),
            unlimitedItems: user.isAdmin === true, maxItemQuantity, equipped, currency: profile.currency, revision: profile.revision || 0,
            rankingPoints, ...rankForPoints(rankingPoints, user.isAdmin), snowBest: profile.snowBest || 0,
            adminGifts: (profile.adminGrants || []).filter(gift => !gift.acknowledged),
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
        if (user.isAdmin) throw new InventoryError('למנהלים כבר יש כמות אינסופית מכל הפריטים.');
        if (inventory.currency < economy.itemPrice) throw new InventoryError('אין לך מספיק מטבעות.');
        const profile = this.load(user);
        const previousPurchases = profile.purchasedItems || profile.items.filter(id => id !== (user.starterColor || WHITE));
        this.persist(user, { ...profile, ...this.addItem(profile, itemId),
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
            ...(step.itemReward && !user.isAdmin ? this.addItem(profile, step.itemReward) : {}),
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

    recoverTrades() {
        const directory = path.join(this.directory, 'trade-transactions');
        if (fs.existsSync(directory)) for (const entry of fs.readdirSync(directory).filter(name => name.endsWith('.json'))) {
            const filename = path.join(directory, entry);
            const saved = JSON.parse(fs.readFileSync(filename, 'utf8'));
            if (!['prepared', 'committed'].includes(saved.phase) || saved.users.length !== 2) throw new Error('Invalid trade journal');
            const profiles = saved.phase === 'committed' ? saved.after : saved.before;
            saved.users.forEach((user, index) => {
                this.writeTradeProfile(user, profiles[index]);
                this.profiles.delete(user.id);
            });
            fs.unlinkSync(filename);
        }
        this.tradeRecoveryNeeded = false;
    }

    writeTradeProfile(user, profile) {
        const filename = this.filename(user);
        fs.writeFileSync(filename + '.tmp', JSON.stringify(profile, null, 2));
        fs.renameSync(filename + '.tmp', filename);
    }

    validateTradeOffer(user, recipient, items, catalog) {
        if (!Array.isArray(items) || items.length > 6
            || items.some(id => typeof id !== 'string')) throw new InventoryError('אפשר להציע עד שישה עותקים בהחלפה.');
        const inventory = this.snapshot(user, catalog);
        const owned = new Set(inventory.items);
        const offered = {};
        for (const id of items) {
            if (!owned.has(id)) throw new InventoryError('אחד הפריטים אינו בבעלותכם.');
            if (!user.isAdmin && (id === WHITE || id === (user.starterColor || WHITE))) throw new InventoryError('אי אפשר להחליף את צבע ההתחלה.');
            offered[id] = (offered[id] || 0) + 1;
            if (!user.isAdmin && offered[id] > inventory.quantities[id]) throw new InventoryError('אין ברשותכם מספיק עותקים מהפריט.');
        }
    }

    exchange(users, offers, catalog, id) {
        if (users.length !== 2 || users[0].id === users[1].id || !/^[a-zA-Z0-9_-]{8,80}$/.test(id)) throw new InventoryError('החלפה לא תקינה.');
        users.forEach((user, index) => this.validateTradeOffer(user, users[1 - index], offers[index], catalog));
        if (!offers.some(items => items.length)) throw new InventoryError('בחרו לפחות פריט אחד להחלפה.');
        const before = users.map(user => this.load(user));
        const after = before.map((profile, index) => {
            if (users[index].isAdmin) return { ...profile, revision: (profile.revision || 0) + 1 };
            const quantities = this.quantities(profile);
            for (const item of offers[index]) quantities[item]--;
            for (const item of offers[1 - index]) {
                quantities[item] = (quantities[item] || 0) + 1;
                if (quantities[item] > maxItemQuantity) throw new InventoryError(`לא ניתן להשלים את ההחלפה: ${users[index].username} יכול להחזיק עד ${maxItemQuantity} עותקים מכל פריט.`);
                if (!Number.isSafeInteger(quantities[item])) throw new InventoryError('כמות הפריט חורגת מהמותר.');
            }
            for (const item of Object.keys(quantities)) if (!quantities[item]) delete quantities[item];
            return { ...profile,
                version: 2, items: Object.keys(quantities), quantities,
                equipped: Object.fromEntries(Object.entries(profile.equipped).map(([slot, item]) => [slot, item && !quantities[item] ? null : item])),
                revision: (profile.revision || 0) + 1
            };
        });
        const directory = path.join(this.directory, 'trade-transactions');
        const filename = path.join(directory, `${id}.json`);
        const journal = { phase: 'prepared', users: users.map(user => ({ id: user.id })), before, after };
        fs.mkdirSync(directory, { recursive: true });
        const writeJournal = () => {
            fs.writeFileSync(filename + '.tmp', JSON.stringify(journal));
            fs.renameSync(filename + '.tmp', filename);
        };
        writeJournal();
        this.tradeRecoveryNeeded = true;
        try {
            users.forEach((user, index) => this.writeTradeProfile(user, after[index]));
            journal.phase = 'committed'; writeJournal();
        } catch (error) {
            // A prepared journal restores BOTH original inventories, even after a crash.
            try { this.recoverTrades(); } catch { /* Keep the journal; block reads until recovery succeeds. */ }
            throw error;
        }
        users.forEach((user, index) => this.profiles.set(user.id, after[index]));
        try { fs.unlinkSync(filename); this.tradeRecoveryNeeded = false; } catch { /* Replay committed state before the next read. */ }
    }

    validateGrant(sender, request) {
        if (sender.isAdmin !== true) throw new InventoryError('הפעולה זמינה למנהלים בלבד.');
        if (!request || typeof request.id !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(request.id)
            || !['currency', 'rankingPoints', 'both'].includes(request.kind)
            || !Number.isSafeInteger(request.amount) || request.amount < 1 || request.amount > 1000000
            || (request.kind === 'both' && (!Number.isSafeInteger(request.rankingAmount)
                || request.rankingAmount < 1 || request.rankingAmount > 1000000))) {
            throw new InventoryError('בחרו סוג מתנה וסכום שלם בין 1 ל־1,000,000.');
        }
    }

    grant(user, sender, request) {
        this.validateGrant(sender, request);
        const rankingAmount = request.kind === 'both' ? request.rankingAmount : 0;
        const profile = this.load(user);
        const history = profile.adminGrants || [];
        const previous = history.find(gift => gift.id === request.id && gift.senderId === sender.id);
        if (previous) {
            if (previous.kind !== request.kind || previous.amount !== request.amount
                || (previous.rankingAmount || 0) !== rankingAmount) throw new InventoryError('מזהה הבקשה כבר שימש למתנה אחרת.');
            return previous;
        }
        const currency = request.kind === 'rankingPoints' ? 0 : request.amount;
        const rankingPoints = request.kind === 'both' ? rankingAmount : request.kind === 'rankingPoints' ? request.amount : 0;
        const moneyTotal = profile.currency + currency;
        const rankingTotal = (profile.rankingPoints || 0) + rankingPoints;
        if (!Number.isSafeInteger(moneyTotal) || !Number.isSafeInteger(rankingTotal)) throw new InventoryError('היתרה חורגת מהסכום המותר.');
        const gift = { id: request.id, senderId: sender.id, senderName: sender.username,
            kind: request.kind, amount: request.amount, rankingAmount, currency, rankingPoints,
            createdAt: Date.now(), acknowledged: false };
        this.persist(user, { ...profile, currency: moneyTotal, rankingPoints: rankingTotal, adminGrants: [...history, gift],
            revision: (profile.revision || 0) + 1 });
        return gift;
    }

    grantRoom(sender, room, request, recipients, onGranted) {
        this.validateGrant(sender, request);
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(sender.id)) throw new InventoryError('מנהל לא תקין.');
        const directory = path.join(this.directory, 'admin-grant-batches');
        const filename = path.join(directory, `${sender.id}-${request.id}.json`);
        const details = { room, kind: request.kind, amount: request.amount,
            rankingAmount: request.kind === 'both' ? request.rankingAmount : 0 };
        let batch;
        if (fs.existsSync(filename)) {
            batch = JSON.parse(fs.readFileSync(filename, 'utf8'));
            if (JSON.stringify(batch.details) !== JSON.stringify(details)) throw new InventoryError('מזהה הבקשה כבר שימש למתנה אחרת.');
        } else {
            batch = { details, recipients: [...new Map(recipients.map(user => [user.id, user])).values()] };
            // Freeze room membership before crediting anyone, including across restarts/retries.
            fs.mkdirSync(directory, { recursive: true });
            fs.writeFileSync(filename + '.tmp', JSON.stringify(batch));
            fs.renameSync(filename + '.tmp', filename);
        }
        for (const recipient of batch.recipients) {
            const gift = this.grant(recipient, sender, request);
            onGranted?.(recipient, gift);
        }
        return batch.recipients.length;
    }

    acknowledgeGift(user, id, senderId) {
        const profile = this.load(user);
        const gifts = profile.adminGrants || [];
        const gift = gifts.find(entry => entry.id === id && entry.senderId === senderId);
        if (!gift) throw new InventoryError('המתנה לא נמצאה.');
        if (gift.acknowledged) return;
        this.persist(user, { ...profile,
            adminGrants: gifts.map(entry => entry === gift ? { ...entry, acknowledged: true } : entry),
            revision: (profile.revision || 0) + 1 });
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
