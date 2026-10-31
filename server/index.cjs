

const { Server } = require('socket.io');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const { Accounts, handleAccountSocket } = require('./accounts.cjs');
const accounts = new Accounts(process.env.VW_ACCOUNTS_FILE);
const { Rarities } = require('./rarities.cjs');
const rarities = new Rarities(process.env.VW_RARITIES_FILE
    || (process.env.VW_ACCOUNTS_FILE ? process.env.VW_ACCOUNTS_FILE + '.rarities.json' : undefined));
const { Inventories, InventoryError } = require('./inventory.cjs');
const inventories = new Inventories(process.env.VW_PLAYERS_DIR
    || (process.env.VW_ACCOUNTS_FILE ? process.env.VW_ACCOUNTS_FILE + '.players' : undefined));

let clothingCatalog = buildCatalog();
let catalogUpdatedAt = Date.now();
function getCatalog() {
    // Refresh validation after assets are added while the development server runs.
    if (Date.now() - catalogUpdatedAt > 1000) {
        try { clothingCatalog = buildCatalog(); }
        catch (error) { console.error(error.message); }
        catalogUpdatedAt = Date.now();
    }
    return clothingCatalog;
}

const port = Number(process.env.VW_PORT || 3001);
const io = new Server(port, {
    cors: {
        origin: true
    }
});

const players = new Map();
const adminItemSets = new Map();

function pushInventory(user) {
    const inventory = inventories.snapshot(user, getCatalog());
    if (user.isAdmin) adminItemSets.set(user.id, inventory.items.join('|'));
    io.to(`user:${user.id}`).emit('inventoryUpdated', inventory);
    for (const player of players.values()) {
        if (player.userId !== user.id) continue;
        player.equipped = inventory.equipped;
        player.shirt = inventory.equipped.shirt;
        io.to(player.room).emit('playerMoved', { ...player });
    }
    return inventory;
}

io.on('connection', (socket) => {
    if (socket.handshake.auth?.account === true) {
        handleAccountSocket(socket, accounts, user => inventories.snapshot(user, getCatalog()));
        return;
    }
    const token = socket.handshake.auth?.token;
    const user = accounts.authenticate(token);
    if (!user) {
        socket.emit('authRequired');
        socket.disconnect(true);
        return;
    }
    socket.use((packet, next) => {
        if (!accounts.authenticate(token)) {
            socket.emit('authRequired');
            socket.disconnect(true);
            return;
        }
        next();
    });
    console.log('Player connected:', socket.id);

    const room = socket.handshake.auth?.room === 'Shop' ? 'Shop' : 'Game';
    socket.join(room);
    socket.join(`user:${user.id}`);
    const initial = socket.handshake.auth?.player || {};
    let inventory;
    try { inventory = inventories.snapshot(user, getCatalog()); }
    catch (error) {
        console.error('Cannot load player inventory:', error.code || error.name);
        socket.emit('inventoryError', 'לא ניתן לטעון את תיק החפצים.');
        socket.disconnect(true);
        return;
    }
    players.set(socket.id, {
        id: socket.id,
        room,
        x: Number.isFinite(initial.x) ? initial.x : 640,
        y: Number.isFinite(initial.y) ? initial.y : 360,
        userId: user.id,
        username: user.username,
        gender: user.gender === 'female' ? 'female' : 'male',
        isAdmin: user.isAdmin === true,
        equipped: inventory.equipped,
        shirt: inventory.equipped.shirt,
        direction: 0,
        facingLeft: false,
        isRunning: false,
        isMoving: false
    });
    socket.emit('inventoryUpdated', inventory);
    socket.emit('itemRaritiesUpdated', rarities.snapshot());
    for (const action of ['admin:items', 'admin:setItemRarity']) {
        socket.on(action, (request, reply) => {
            if (typeof reply !== 'function') return;
            if (!accounts.authenticate(token)?.isAdmin) {
                reply({ ok: false, error: 'הפעולה זמינה למנהלים בלבד.' });
                return;
            }
            try {
                const catalog = getCatalog();
                if (action === 'admin:setItemRarity') {
                    const values = rarities.set(request?.itemId, request?.rarity, catalog);
                    io.to('Game').emit('itemRaritiesUpdated', values);
                    io.to('Shop').emit('itemRaritiesUpdated', values);
                    reply({ ok: true, rarities: values });
                } else {
                    const values = rarities.snapshot();
                    reply({ ok: true, items: catalog.items.map(item => ({
                        id: item.id, name: item.name, rarity: values[item.id] || 'C'
                    })) });
                }
            } catch (error) {
                reply({ ok: false, error: error.code ? 'לא ניתן לשמור את השינוי. נסו שוב.' : error.message });
            }
        });
    }
    if (user.isAdmin) adminItemSets.set(user.id, inventory.items.join('|'));

    const inventoryAction = (action, acknowledge) => {
        if (typeof acknowledge !== 'function') return;
        try {
            action();
            acknowledge({ ok: true, inventory: pushInventory(user) });
        } catch (error) {
            if (!(error instanceof InventoryError)) console.error('Inventory save failed:', error.code || error.name);
            acknowledge({ ok: false, error: error instanceof InventoryError
                ? error.message : 'לא ניתן לשמור את השינוי. נסו שוב.' });
        }
    };
    socket.on('inventory:equip', (request, acknowledge) => inventoryAction(() => {
        if (!request || typeof request.itemId !== 'string' || typeof request.equip !== 'boolean') {
            throw new InventoryError('בקשת לבישה לא תקינה.');
        }
        inventories.equip(user, request.itemId, request.equip, getCatalog());
    }, acknowledge));
    socket.on('shop:purchase', (request, acknowledge) => inventoryAction(() => {
        if (room !== 'Shop') throw new InventoryError('אפשר לרכוש פריטים רק מתוך החנות.');
        if (typeof request?.itemId !== 'string') throw new InventoryError('פריט לא תקין.');
        inventories.purchase(user, request.itemId, getCatalog());
    }, acknowledge));
    socket.on('shop:catalog', (request, acknowledge) => {
        if (typeof acknowledge !== 'function') return;
        if (room !== 'Shop') { acknowledge({ ok: false, error: 'הקטלוג זמין מתוך החנות בלבד.' }); return; }
        try {
            acknowledge({ ok: true, items: inventories.shopCatalog(getCatalog()),
                inventory: inventories.snapshot(user, getCatalog()) });
        } catch { acknowledge({ ok: false, error: 'לא ניתן לטעון את הקטלוג.' }); }
    });

    socket.emit('currentPlayers', Object.fromEntries(
        [...players].filter(([, player]) => player.room === room)
    ));

    socket.to(room).emit('playerJoined', {
        id: socket.id,
        ...players.get(socket.id)
    });

    socket.on('playerProfile', (profile = {}) => {
        if (!profile || typeof profile !== 'object') return;
        const player = players.get(socket.id);
        if (!player) return;

        socket.to(room).emit('playerMoved', {
            id: socket.id,
            ...player
        });
    });

    socket.on('chatMessage', (message) => {
        if (typeof message !== 'string' || !players.has(socket.id)) return;
        const text = message.trim().slice(0, 100);
        if (!text) return;
        socket.to(room).emit('chatMessage', { id: socket.id, message: text });
    });

    const updatePosition = (position) => {
        const player = players.get(socket.id);
        if (!player) return;

        if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return;

        player.x = position.x;
        player.y = position.y;
        player.direction = Number.isInteger(position.direction) && position.direction >= 0 && position.direction <= 6 ? position.direction : player.direction;
        player.facingLeft = Boolean(position.facingLeft);
        player.isMoving = Boolean(position.isMoving);
        player.isRunning = Boolean(position.isRunning);

        socket.to(room).emit('playerMoved', {
            id: socket.id,
            ...player
        });
    };

    let background = null;
    const advanceBackground = () => {
        if (!background) return;
        const player = players.get(socket.id);
        const now = performance.now();
        const delta = Math.max(0, now - background.updatedAt) / 1000;
        background.updatedAt = now;
        const target = background.target;
        if (target) {
            const dx = target.x - player.x;
            const dy = target.y - player.y;
            const distance = Math.hypot(dx, dy);
            const step = (player.isRunning ? 380 : 220) * delta;
            if (distance <= step) {
                player.x = target.x;
                player.y = target.y;
                background.target = null;
                player.isMoving = false;
                player.isRunning = false;
            } else {
                player.x += dx / distance * step;
                player.y += dy / distance * step;
                player.isMoving = true;
            }
        } else {
            player.isMoving = false;
            player.isRunning = false;
        }
        socket.to(room).emit('playerMoved', { ...player });
        socket.emit('backgroundState', { ...player });
    };

    socket.on('playerMove', position => {
        if (!background) updatePosition(position);
    });

    socket.on('playerBackground', (request, acknowledge) => {
        if (!request || typeof request.hidden !== 'boolean') return;
        if (request.hidden) {
            if (!Number.isFinite(request.state?.x) || !Number.isFinite(request.state?.y)) return;
            updatePosition(request.state);
            const target = request.target;
            const movementMargin = room === 'Game' ? 25 : 65;
            background = {
                updatedAt: performance.now(),
                target: Number.isFinite(target?.x) && Number.isFinite(target?.y)
                    ? { x: Math.max(movementMargin, Math.min(1280 - movementMargin, target.x)),
                        y: Math.max(movementMargin, Math.min(720 - movementMargin, target.y)) } : null
            };
            advanceBackground();
        } else {
            advanceBackground();
            background = null;
            if (typeof acknowledge === 'function') acknowledge({ ...players.get(socket.id) });
        }
    });

    const backgroundTimer = setInterval(() => {
        if (background?.target) advanceBackground();
    }, 50);

    socket.on('disconnect', () => {
        clearInterval(backgroundTimer);
        players.delete(socket.id);
        if (![...players.values()].some(player => player.userId === user.id)) adminItemSets.delete(user.id);
        io.to(room).emit('playerLeft', socket.id);

        console.log('Player disconnected:', socket.id);
    });

    socket.on('auth:logout', (acknowledge) => {
        accounts.logout(token);
        if (typeof acknowledge === 'function') acknowledge();
        else socket.disconnect(true);
    });
});

// Admin ownership is derived from the current catalog, never copied into every account file.
const catalogTimer = setInterval(() => {
    const checked = new Set();
    for (const player of players.values()) {
        if (!player.isAdmin || checked.has(player.userId)) continue;
        checked.add(player.userId);
        const user = { id: player.userId, username: player.username, isAdmin: true };
        try {
            const inventory = inventories.snapshot(user, getCatalog());
            if (inventory.items.join('|') !== adminItemSets.get(user.id)) pushInventory(user);
        } catch (error) { console.error('Cannot refresh admin inventory:', error.code || error.name); }
    }
}, 1000);
catalogTimer?.unref?.();

console.log(`Multiplayer server running on port ${port}`);
module.exports = { io };
