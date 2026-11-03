

const { Server } = require('socket.io');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const { Accounts, handleAccountSocket } = require('./accounts.cjs');
const accounts = new Accounts(process.env.VW_ACCOUNTS_FILE);
const { getSquareColliders, getShopInteriorColliders, resolveMovement } = require('../shared/collision.js');
const square = require('../shared/square.json');
const emojiConfig = require('../shared/emojis.json');
const squareColliders = getSquareColliders(square);
const shopInteriorColliders = getShopInteriorColliders();
const { SnowGames } = require('./snow-game.cjs');
const snowGames = new SnowGames();
const { CoffeeGames } = require('./coffee-game.cjs');
const coffeeGames = new CoffeeGames();
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
const vanishedAdmins = new Set();
function broadcastPlayer(player, event = 'playerMoved', sender = null) {
    if (player.vanished) {
        if (event === 'playerMoved') io.to(player.id).emit(event, { ...player });
        return;
    }
    (sender ? sender.to(player.room) : io.to(player.room)).emit(event, { ...player });
}
const adminItemSets = new Map();
const { Trades } = require('./trades.cjs');
const trades = new Trades({ inventory: inventories, getCatalog, getPlayer: id => players.get(id),
    findUser: name => accounts.findUser(name), send: (id, event, data) => io.to(id).emit(event, data),
    updateInventory: pushInventory });
const tradeTimer = setInterval(() => trades.expire(), 1000);
tradeTimer?.unref?.();
io.httpServer?.once('close', () => clearInterval(tradeTimer));

function pushInventory(user) {
    const inventory = inventories.snapshot(user, getCatalog());
    if (user.isAdmin) adminItemSets.set(user.id, inventory.items.join('|'));
    io.to(`user:${user.id}`).emit('inventoryUpdated', inventory);
    for (const player of players.values()) {
        if (player.userId !== user.id) continue;
        player.equipped = inventory.equipped;
        player.shirt = inventory.equipped.shirt;
        player.level = inventory.level;
        player.rankingPoints = inventory.rankingPoints;
        player.pointsToNextLevel = inventory.pointsToNextLevel;
        broadcastPlayer(player);
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

    const room = ['Shop', 'Cafe'].includes(socket.handshake.auth?.room) ? socket.handshake.auth.room : 'Game';
    const roomColliders = room === 'Game' ? squareColliders : room === 'Shop' ? shopInteriorColliders : [];
    socket.join(room);
    socket.join(`user:${user.id}`);
    const initial = socket.handshake.auth?.player || {};
    let startingPosition = {
        x: Number.isFinite(initial.x) ? initial.x : 640,
        y: Number.isFinite(initial.y) ? initial.y : 360
    };
    if (roomColliders.length) startingPosition = resolveMovement(startingPosition, startingPosition, roomColliders);
    let inventory;
    try {
        inventories.rememberRoom(user, room);
        inventory = inventories.snapshot(user, getCatalog());
    }
    catch (error) {
        console.error('Cannot load player inventory:', error.code || error.name);
        socket.emit('inventoryError', 'לא ניתן לטעון את תיק החפצים.');
        socket.disconnect(true);
        return;
    }
    players.set(socket.id, {
        id: socket.id,
        room,
        x: startingPosition.x,
        y: startingPosition.y,
        userId: user.id,
        username: user.username,
        gender: user.gender === 'female' ? 'female' : 'male',
        isAdmin: user.isAdmin === true,
        vanished: user.isAdmin === true && vanishedAdmins.has(user.id),
        equipped: inventory.equipped,
        level: inventory.level,
        rankingPoints: inventory.rankingPoints,
        pointsToNextLevel: inventory.pointsToNextLevel,
        shirt: inventory.equipped.shirt,
        direction: 0,
        facingLeft: false,
        isRunning: false,
        isMoving: false,
        minigame: null
    });
    socket.emit('inventoryUpdated', inventory);
    socket.emit('itemRaritiesUpdated', rarities.snapshot());
    const setMinigame = game => {
        const player = players.get(socket.id);
        if (!player || player.minigame === game) return;
        player.minigame = game;
        if (game) trades.cancelForUser(user.id);
        broadcastPlayer(player);
    };
    socket.on('minigame:presence', (request, reply) => {
        if (typeof reply !== 'function') return;
        const validGame = room === 'Game' && request?.game === 'snow-catch'
            || room === 'Cafe' && request?.game === 'coffee-memory';
        if (!validGame || typeof request.active !== 'boolean') {
            reply({ ok: false, error: 'משחקון לא תקין.' }); return;
        }
        setMinigame(request.active ? request.game : null);
        reply({ ok: true });
    });
    let snowTimer = null;
    const stopSnowTimer = () => { if (snowTimer) clearInterval(snowTimer); snowTimer = null; };
    const snowState = () => {
        const round = snowGames.get(user.id, socket.id);
        let state = round.snapshot();
        if (state.phase === 'finished') {
            if (!round.result) {
                round.result = inventories.rewardSnow(user, round);
                pushInventory(user);
            }
            state = round.snapshot();
            stopSnowTimer();
        }
        return state;
    };
    for (const action of ['snow:start', 'snow:state', 'snow:finish', 'snow:cancel']) {
        socket.on(action, (request, reply) => {
            if (typeof reply !== 'function') return;
            if (room !== 'Game') { reply({ ok: false, error: 'המשחק זמין בכיכר הראשית בלבד.' }); return; }
            try {
                if (action === 'snow:finish') {
                    const round = snowGames.get(user.id, socket.id);
                    if (request?.id !== round.id) throw new Error('הסיבוב אינו פעיל.');
                    round.finish();
                    stopSnowTimer();
                }
                if (action === 'snow:cancel') {
                    if (request?.id && snowGames.get(user.id, socket.id).id !== request.id) {
                        reply({ ok: true }); return;
                    }
                    snowGames.cancel(user.id, socket.id);
                    stopSnowTimer();
                    setMinigame(null);
                    reply({ ok: true });
                    return;
                }
                if (action === 'snow:start') {
                    const round = snowGames.start(user.id, socket.id);
                    if (round.questStepId === undefined) round.questStepId = inventories.currentQuestStep(user);
                    setMinigame('snow-catch');
                    stopSnowTimer();
                    snowTimer = setInterval(() => {
                        try { socket.emit('snow:update', snowState()); }
                        catch { socket.emit('snow:error', 'לא ניתן לשמור את התוצאה. לחצו על בדיקת תוצאה כדי לנסות שוב.'); stopSnowTimer(); }
                    }, 100);
                    snowTimer.unref?.();
                }
                reply({ ok: true, state: snowState() });
            } catch (error) { reply({ ok: false, error: error.code ? 'לא ניתן לשמור את התוצאה. נסו שוב.' : error.message }); }
        });
    }
    socket.on('snow:input', request => {
        try {
            const round = snowGames.get(user.id, socket.id);
            if (request?.id === round.id) round.input(request.x);
        } catch { /* A stale input from a closed round is ignored. */ }
    });
    socket.on('disconnect', () => { stopSnowTimer(); snowGames.cancel(user.id, socket.id); });
    for (const action of ['coffee:start', 'coffee:state', 'coffee:choose', 'coffee:clear', 'coffee:finish', 'coffee:cancel']) {
        socket.on(action, (request, reply) => {
            if (typeof reply !== 'function') return;
            if (room !== 'Cafe') { reply({ ok: false, error: 'המשחק זמין בבית הקפה בלבד.' }); return; }
            try {
                if (action === 'coffee:cancel') {
                    coffeeGames.cancel(user.id, socket.id); setMinigame(null);
                    reply({ ok: true }); return;
                }
                const round = action === 'coffee:start' ? coffeeGames.start(user.id, socket.id)
                    : coffeeGames.get(user.id, socket.id);
                if (action !== 'coffee:start' && request?.id !== round.id) throw new Error('המשחק אינו פעיל.');
                if (action === 'coffee:choose') round.choose(request.ingredient);
                if (action === 'coffee:clear') round.clear();
                if (action === 'coffee:finish') round.finish();
                let state = round.snapshot();
                if (state.phase === 'finished' && !round.result) {
                    round.result = inventories.rewardCoffee(user, round); pushInventory(user);
                    state = round.snapshot();
                }
                setMinigame(state.phase === 'finished' ? null : 'coffee-memory');
                reply({ ok: true, state });
            } catch (error) { reply({ ok: false, error: error.code ? 'לא ניתן לשמור את התוצאה. נסו שוב.' : error.message }); }
        });
    }
    socket.on('disconnect', () => coffeeGames.cancel(user.id, socket.id));
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
                    io.to('Cafe').emit('itemRaritiesUpdated', values);
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

    for (const action of ['request', 'respond', 'offer', 'confirm', 'cancel']) {
        socket.on(`trade:${action}`, (request, reply) => {
            if (typeof reply !== 'function') return;
            try {
                let id;
                if (action === 'request') id = trades.request(socket.id, request?.targetId);
                else if (action === 'cancel') trades.cancel(socket.id, request?.id);
                else trades[action](socket.id, request);
                reply({ ok: true, ...(id ? { id } : {}) });
            } catch (error) {
                reply({ ok: false, error: error instanceof InventoryError ? error.message : 'לא ניתן לשמור את ההחלפה. הפריטים לא הועברו. נסו שוב.' });
            }
        });
    }

    socket.on('admin:resetPlayer', (request, reply) => {
        if (typeof reply !== 'function') return;
        const manager = accounts.authenticate(token);
        if (!manager?.isAdmin) { reply({ ok: false, error: 'הפעולה זמינה למנהלים בלבד.' }); return; }
        try {
            const recipient = accounts.findUser(request?.username);
            if (!recipient) throw new InventoryError('לא נמצא שחקן בשם הזה.');
            const result = inventories.resetPlayer(recipient, manager, request, getCatalog());
            if (result.reset) {
                trades.cancelForUser(recipient.id);
                accounts.revokeUserSessions(recipient.id);
            }
            reply({ ok: true, username: recipient.username });
            if (result.reset) {
                io.to(`user:${recipient.id}`).emit('accountReset');
                io.in(`user:${recipient.id}`).disconnectSockets(true);
            }
        } catch (error) {
            reply({ ok: false, error: error instanceof InventoryError ? error.message : 'לא ניתן לשמור את האיפוס. נסו שוב.' });
        }
    });

    socket.on('admin:grant', (request, reply) => {
        if (typeof reply !== 'function') return;
        if (!accounts.authenticate(token)?.isAdmin) { reply({ ok: false, error: 'הפעולה זמינה למנהלים בלבד.' }); return; }
        try {
            if (request?.scope === 'room') {
                const recipients = [...players.values()].filter(player => player.room === room)
                    .map(player => accounts.findUser(player.username)).filter(Boolean);
                const recipientCount = inventories.grantRoom(user, room, request, recipients, recipient => pushInventory(recipient));
                reply({ ok: true, scope: 'room', recipientCount });
                return;
            }
            if (request?.scope && request.scope !== 'player') throw new InventoryError('בחרו למי לשלוח את המתנה.');
            const recipient = accounts.findUser(request?.username);
            if (!recipient) throw new InventoryError('לא נמצא שחקן בשם הזה.');
            const gift = inventories.grant(recipient, user, request);
            pushInventory(recipient);
            reply({ ok: true, gift, username: recipient.username });
        } catch (error) {
            reply({ ok: false, error: error instanceof InventoryError ? error.message : 'לא ניתן לשמור את המתנה. נסו שוב.' });
        }
    });

    const inventoryAction = (action, acknowledge) => {
        if (typeof acknowledge !== 'function') return;
        try {
            action();
            acknowledge({ ok: true, inventory: pushInventory(user) });
        } catch (error) {
            if (!(error instanceof InventoryError)) console.error('Inventory save failed:', error.code || error.name);
            acknowledge({ ok: false, code: error instanceof InventoryError ? error.code : undefined, error: error instanceof InventoryError
                ? error.message : 'לא ניתן לשמור את השינוי. נסו שוב.' });
        }
    };
    socket.on('admin:ackGift', (request, reply) => inventoryAction(
        () => inventories.acknowledgeGift(user, request?.id, request?.senderId), reply));

    for (const action of ['quest:accept', 'quest:claim']) {
        socket.on(action, (request, reply) => {
            if (typeof reply !== 'function') return;
            let questReward;
            inventoryAction(() => {
                if (room !== 'Game') throw new InventoryError('חזרו לשוטר ליאו בכיכר כדי לקבל את הפרס.');
                if (action === 'quest:accept') inventories.acceptQuest(user, request?.chainId, getCatalog());
                else {
                    const step = inventories.snapshot(user, getCatalog()).quests?.[request?.chainId]?.steps?.find(entry => entry.id === request?.stepId);
                    inventories.claimQuest(user, request?.chainId, request?.stepId, getCatalog());
                    questReward = { coins: step.coins, rankingPoints: step.rankingPoints, itemId: step.itemReward || null };
                }
            }, result => reply({ ...result, ...(result.ok && questReward ? { questReward } : {}) }));
        });
    }
    socket.on('inventory:equip', (request, acknowledge) => inventoryAction(() => {
        if (!request || typeof request.itemId !== 'string' || typeof request.equip !== 'boolean') {
            throw new InventoryError('בקשת לבישה לא תקינה.');
        }
        inventories.equip(user, request.itemId, request.equip, getCatalog());
    }, acknowledge));
    socket.on('shop:purchase', (request, acknowledge) => inventoryAction(() => {
        if (room !== 'Shop') throw new InventoryError('אפשר לרכוש פריטים רק מתוך החנות.');
        if (typeof request?.itemId !== 'string') throw new InventoryError('פריט לא תקין.');
        inventories.purchase(user, request.itemId, getCatalog(), request?.catalogId ?? 'main');
    }, acknowledge));
    socket.on('shop:catalog', (request, acknowledge) => {
        if (typeof acknowledge !== 'function') return;
        if (room !== 'Shop') { acknowledge({ ok: false, error: 'הקטלוג זמין מתוך החנות בלבד.' }); return; }
        try {
            const catalogId = request?.catalogId ?? 'main';
            acknowledge({ ok: true, catalogId, items: inventories.shopCatalog(getCatalog(), catalogId),
                inventory: inventories.snapshot(user, getCatalog()) });
        } catch { acknowledge({ ok: false, error: 'לא ניתן לטעון את הקטלוג.' }); }
    });

    socket.emit('currentPlayers', Object.fromEntries(
        [...players].filter(([id, player]) => player.room === room && (!player.vanished || id === socket.id))
    ));

    broadcastPlayer(players.get(socket.id), 'playerJoined', socket);

    socket.on('admin:vanish', (request, reply) => {
        if (typeof reply !== 'function') return;
        if (!accounts.authenticate(token)?.isAdmin || typeof request?.active !== 'boolean') {
            reply({ ok: false, error: 'הפעולה זמינה למנהלים בלבד.' }); return;
        }
        if (request.active) vanishedAdmins.add(user.id);
        else vanishedAdmins.delete(user.id);
        for (const player of players.values()) {
            if (player.userId !== user.id || player.vanished === request.active) continue;
            player.vanished = request.active;
            if (request.active) io.to(player.room).emit('playerLeft', player.id);
            else broadcastPlayer(player, 'playerJoined');
            io.to(player.id).emit('vanishState', { active: request.active });
        }
        if (request.active) trades.cancelForUser(user.id);
        reply({ ok: true, active: request.active });
    });

    socket.on('playerProfile', (profile = {}) => {
        if (!profile || typeof profile !== 'object') return;
        const player = players.get(socket.id);
        if (!player) return;

        broadcastPlayer(player, 'playerMoved', socket);
    });

    let lastEmojiAt = -Infinity;
    socket.on('playerEmoji', request => {
        if (players.get(socket.id)?.vanished) return;
        if (!players.has(socket.id) || !Number.isInteger(request?.emoji)
            || request.emoji < 0 || request.emoji >= emojiConfig.frames.length) return;
        const now = Date.now();
        if (now - lastEmojiAt < emojiConfig.cooldown) return;
        lastEmojiAt = now;
        io.to(room).emit('playerEmoji', { id: socket.id, emoji: request.emoji });
    });

    socket.on('chatMessage', (message) => {
        if (players.get(socket.id)?.vanished) return;
        if (typeof message !== 'string' || !players.has(socket.id)) return;
        const text = message.trim().slice(0, 100);
        if (!text) return;
        socket.to(room).emit('chatMessage', { id: socket.id, message: text });
    });

    const updatePosition = (position) => {
        const player = players.get(socket.id);
        if (!player) return;

        if (!Number.isFinite(position?.x) || !Number.isFinite(position?.y)) return;

        const margin = room === 'Game' ? 25 : 65;
        const destination = roomColliders.length ? resolveMovement(player, {
            x: Math.max(margin, Math.min(1280 - margin, position.x)),
            y: Math.max(margin, Math.min(720 - margin, position.y))
        }, roomColliders) : position;
        player.x = destination.x;
        player.y = destination.y;
        player.direction = Number.isInteger(position.direction) && position.direction >= 0 && position.direction <= 6 ? position.direction : player.direction;
        player.facingLeft = Boolean(position.facingLeft);
        player.isMoving = Boolean(position.isMoving);
        player.isRunning = Boolean(position.isRunning);

        broadcastPlayer(player, 'playerMoved', socket);
    };

    let background = null;
    const advanceBackground = () => {
        if (!background) return;
        const player = players.get(socket.id);
        const now = performance.now();
        const delta = Math.max(0, now - background.updatedAt) / 1000;
        background.updatedAt = now;
        const target = background.target;
        const previous = { x: player.x, y: player.y };
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
        if (roomColliders.length) {
            const resolved = resolveMovement(previous, player, roomColliders);
            player.x = resolved.x;
            player.y = resolved.y;
            if (target && delta > 0 && Math.hypot(player.x - previous.x, player.y - previous.y) < 0.01) {
                background.target = null;
                player.isMoving = false;
                player.isRunning = false;
            }
        }
        broadcastPlayer(player, 'playerMoved', socket);
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
        trades.cancelForSocket(socket.id);
        clearInterval(backgroundTimer);
        players.delete(socket.id);
        if (![...players.values()].some(player => player.userId === user.id)) adminItemSets.delete(user.id);
        if (!vanishedAdmins.has(user.id)) io.to(room).emit('playerLeft', socket.id);

        console.log('Player disconnected:', socket.id);
    });

    socket.on('auth:logout', (acknowledge) => {
        trades.cancelForSocket(socket.id);
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
