const { randomUUID } = require('node:crypto');
const { InventoryError } = require('./inventory.cjs');

class Trades {
    constructor({ inventory, getCatalog, getPlayer, findUser, send, updateInventory, now = Date.now }) {
        Object.assign(this, { inventory, getCatalog, getPlayer, findUser, send, updateInventory, now });
        this.sessions = new Map();
        this.byUser = new Map();
    }

    request(socketId, targetId) {
        const a = this.getPlayer(socketId), b = this.getPlayer(targetId);
        if (!a || !b || a.room !== b.room || a.userId === b.userId) throw new InventoryError('בחרו שחקן אחר שנמצא בחדר שלכם.');
        if (a.minigame || b.minigame) throw new InventoryError('אי אפשר להחליף בזמן מיניגיים.');
        if (this.byUser.has(a.userId) || this.byUser.has(b.userId)) throw new InventoryError('אחד השחקנים כבר נמצא בהחלפה או בבקשה אחרת.');
        const users = [this.findUser(a.username), this.findUser(b.username)];
        if (users.some(user => !user)) throw new InventoryError('השחקן לא נמצא.');
        const trade = { id: randomUUID(), sockets: [socketId, targetId], users, room: a.room,
            phase: 'pending', revision: 0, offers: [[], []], ready: [false, false], expiresAt: this.now() + 30000 };
        this.sessions.set(trade.id, trade);
        users.forEach(user => this.byUser.set(user.id, trade.id));
        try { this.broadcast(trade); }
        catch (error) { this.close(trade, 'לא ניתן לפתוח את ההחלפה.'); throw error; }
        return trade.id;
    }

    get(socketId, id) {
        const trade = this.sessions.get(id);
        if (!trade || !trade.sockets.includes(socketId)) throw new InventoryError('ההחלפה אינה זמינה.');
        if (trade.expiresAt <= this.now() || trade.sockets.some((socket, index) => {
            const player = this.getPlayer(socket);
            return !player || player.userId !== trade.users[index].id || player.room !== trade.room || player.minigame;
        })) {
            this.close(trade, 'ההחלפה בוטלה כי אחד השחקנים אינו זמין.');
            throw new InventoryError('ההחלפה כבר אינה זמינה.');
        }
        return trade;
    }

    view(trade, me) {
        const catalog = this.getCatalog();
        const snapshots = trade.users.map(user => this.inventory.snapshot(user, catalog));
        return { id: trade.id, phase: trade.phase, me, revision: trade.revision, expiresAt: trade.expiresAt,
            players: trade.users.map((user, index) => ({ username: user.username, gender: user.gender,
                equipped: snapshots[index].equipped, offer: trade.offers[index], ready: trade.ready[index] })),
            quantities: snapshots[me].quantities, unlimitedItems: snapshots[me].unlimitedItems,
            available: snapshots[me].unlimitedItems ? catalog.items.map(item => item.id) : snapshots[me].items.filter(id => id !== 'body-color/white'
                && id !== (trade.users[me].starterColor || 'body-color/white')) };
    }

    broadcast(trade) {
        try {
            const views = trade.sockets.map((socket, index) => this.view(trade, index));
            trade.sockets.forEach((socket, index) => this.send(socket, 'trade:state', views[index]));
        } catch (error) {
            this.close(trade, 'לא ניתן לעדכן את ההחלפה. ההחלפה בוטלה.');
            throw error;
        }
    }

    respond(socketId, request) {
        const trade = this.get(socketId, request?.id);
        if (trade.phase !== 'pending' || trade.sockets[1] !== socketId || typeof request.accept !== 'boolean') throw new InventoryError('בקשת החלפה לא תקינה.');
        if (!request.accept) { this.close(trade, 'בקשת ההחלפה נדחתה.'); return; }
        trade.phase = 'active'; trade.revision++; trade.expiresAt = this.now() + 600000;
        this.broadcast(trade);
    }

    offer(socketId, request) {
        const trade = this.get(socketId, request?.id), me = trade.sockets.indexOf(socketId);
        this.validateRevision(trade, request);
        this.inventory.validateTradeOffer(trade.users[me], trade.users[1 - me], request.items, this.getCatalog());
        if (JSON.stringify(trade.offers[me]) === JSON.stringify(request.items)) return;
        trade.offers[me] = [...request.items]; trade.ready = [false, false]; trade.revision++;
        trade.expiresAt = this.now() + 600000;
        this.broadcast(trade);
    }

    validateRevision(trade, request) {
        if (trade.phase !== 'active' || request.revision !== trade.revision) throw new InventoryError('ההצעה השתנתה. בדקו את הפריטים לפני האישור.');
    }

    confirm(socketId, request) {
        const trade = this.get(socketId, request?.id), me = trade.sockets.indexOf(socketId);
        this.validateRevision(trade, request);
        if (typeof request.accept !== 'boolean') throw new InventoryError('אישור לא תקין.');
        trade.ready[me] = request.accept;
        if (trade.ready.every(Boolean)) {
            try { this.inventory.exchange(trade.users, trade.offers, this.getCatalog(), trade.id); }
            catch (error) { trade.ready = [false, false]; trade.revision++; this.broadcast(trade); throw error; }
            this.close(trade, 'ההחלפה הושלמה! הפריטים עודכנו בתיק החפצים.', true);
            trade.users.forEach(user => { try { this.updateInventory(user); } catch (error) { console.error('Trade inventory update failed:', error.code || error.name); } });
        } else this.broadcast(trade);
    }

    cancel(socketId, id) { this.close(this.get(socketId, id), 'ההחלפה בוטלה.'); }
    cancelForSocket(socketId) {
        for (const trade of this.sessions.values()) if (trade.sockets.includes(socketId)) this.close(trade, 'ההחלפה בוטלה בעקבות יציאה מהחדר או ניתוק.');
    }
    cancelForUser(userId) {
        const trade = this.sessions.get(this.byUser.get(userId));
        if (trade) this.close(trade, 'ההחלפה בוטלה.');
    }
    expire() { for (const trade of this.sessions.values()) if (trade.expiresAt <= this.now()) this.close(trade, 'זמן ההחלפה הסתיים.'); }
    close(trade, reason, completed = false) {
        if (!this.sessions.has(trade.id)) return;
        this.sessions.delete(trade.id);
        trade.users.forEach(user => this.byUser.delete(user.id));
        trade.sockets.forEach(socket => this.send(socket, 'trade:closed', { id: trade.id, reason, completed }));
    }
}
module.exports = { Trades };
