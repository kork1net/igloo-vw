// Optional smoke test: requires Chrome and the development/game servers running.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const economy = require('../server/economy.json');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-menu-check-'));
const browser = spawn(process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--window-size=1280,800', `--user-data-dir=${profile}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let ws;
let launchError;
let inventoryServer;
if (process.argv.includes('--inventory')) {
    process.env.VW_PORT = '0';
    process.env.VW_ACCOUNTS_FILE = path.join(profile, 'test-accounts.json');
    inventoryServer = require('../server/index.cjs').io;
}
browser.on('error', error => { launchError = error; });

(async () => {
    let port;
    for (let i = 0; i < 100; i++) {
        if (launchError) throw launchError;
        const filename = path.join(profile, 'DevToolsActivePort');
        if (fs.existsSync(filename)) { port = fs.readFileSync(filename, 'utf8').split('\n')[0]; break; }
        await sleep(100);
    }
    assert.ok(port, 'Browser debugging did not start');
    const targets = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json());
    ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    let sequence = 0;
    const pending = new Map();
    ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (!message.id) return;
        const callback = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) callback.reject(new Error(message.error.message));
        else callback.resolve(message.result);
    };
    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++sequence;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async function evaluate(expression) {
        const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
        window.browserTestErrors = [];
        window.addEventListener('error', event => browserTestErrors.push(event.message));
        window.addEventListener('unhandledrejection', event => browserTestErrors.push(String(event.reason)));
    ` });
    if (inventoryServer) {
        const testPort = inventoryServer.httpServer.address().port;
        await send('Page.addScriptToEvaluateOnNewDocument', { source: `
            const rewrite = url => String(url).replace('localhost:3001', 'localhost:${testPort}');
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url, ...args) {
                return originalOpen.call(this, method, rewrite(url), ...args);
            };
            const NativeSocket = window.WebSocket;
            window.WebSocket = class extends NativeSocket {
                constructor(url, protocols) {
                    if (protocols === undefined) super(rewrite(url));
                    else super(rewrite(url), protocols);
                }
            };
        ` });
    }
    await send('Page.navigate', { url: 'http://localhost:8080/' });
    let loaded = false;
    for (let i = 0; i < 100; i++) {
        if (await evaluate('!!document.querySelector(".account-panel")')) { loaded = true; break; }
        await sleep(100);
    }
    assert.ok(loaded, 'Account menu did not appear: ' + (loaded ? '' : await evaluate(`JSON.stringify({
        errors: window.browserTestErrors, ready: document.readyState,
        fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })),
        text: document.body.innerText.slice(0, 300)
    })`)));
    assert.equal(await evaluate('document.querySelector(".account-confirm").hidden'), true);
    await evaluate('document.querySelector("[data-mode=register]").click()');
    assert.equal(await evaluate('document.querySelector(".account-confirm").hidden'), false);
    assert.equal(await evaluate('document.querySelectorAll(".starter-color").length'), 4);
    assert.equal(await evaluate('document.querySelectorAll("input[name=gender]").length'), 2);
    await evaluate('document.querySelector("input[name=gender][value=female]").click()');
    assert.equal(await evaluate('document.querySelector("input[name=gender][value=female]").checked'), true);
    await evaluate(`(() => {
        const input = document.querySelector('input[name=username]');
        input.value = 'LivePreview';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        document.querySelector('[data-starter-color="body-color/mint"]').click();
    })()`);
    assert.equal(await evaluate('document.querySelector(".registration-preview-name").textContent'), 'LivePreview');
    assert.equal(await evaluate('document.querySelector("[data-starter-color=\\"body-color/mint\\"]").getAttribute("aria-pressed")'), 'true');
    await evaluate(`(() => {
        const form = document.querySelector('.account-panel form');
        form.elements.username.value = 'BrowserTest';
        form.elements.password.value = 'password-123';
        form.elements.confirm.value = 'password-456';
        form.requestSubmit();
    })()`);
    assert.equal(await evaluate('document.querySelector(".account-status").textContent'), 'הסיסמאות אינן תואמות.');
    await evaluate('document.querySelector("[data-mode=login]").click()');
    await evaluate(`(() => {
        const form = document.querySelector('.account-panel form');
        form.elements.username.value = '__missing__';
        form.elements.password.value = 'wrong-password';
        form.requestSubmit();
    })()`);
    for (let i = 0; i < 60; i++) {
        if (await evaluate('!!document.querySelector(".account-status").textContent')) break;
        await sleep(100);
    }
    assert.equal(await evaluate('document.querySelector(".account-status").textContent'), 'שם המשתמש או הסיסמה שגויים.');
    await evaluate('document.querySelector("[data-mode=register]").click()');
    await evaluate(`(() => {
        const input = document.querySelector('input[name=username]');
        input.value = 'LivePreview';
        input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    if (process.argv.includes('--inventory')) {
        await evaluate(`(async () => {
            const roomSource = await fetch('/src/game/rooms/BaseRoom.js').then(response => response.text());
            const phaserUrl = roomSource.split('"').find(part => part.startsWith('/node_modules/.vite/deps/phaser.js'));
            const PhaserModule = await import(phaserUrl);
            const Phaser = PhaserModule.default || PhaserModule;
            const { BaseRoom } = await import('/src/game/rooms/BaseRoom.js');
            const { Player } = await import('/src/game/objects/Player.js');
            const { requestAccount } = await import('/src/game/network/Auth.js');
            const auth = await requestAccount('register', { username: 'BrowserShopper', password: 'test-password-123', gender: 'female' });
            document.querySelector('.account-screen').remove();
            const host = document.createElement('div');
            host.id = 'inventory-test';
            host.style.cssText = 'position:absolute;inset:0;z-index:5';
            document.getElementById('game-container').append(host);
            class InventoryPreview extends BaseRoom {
                constructor() { super('Shop'); }
                preload() {
                    super.preload();
                    this.load.audio('wood-tap-ui', 'assets/ui/wood-tap-ui.mp3');
                }
                create() {
                    this.registry.set('auth', auth);
                    this.registry.set('inventory', auth.inventory);
                    this.createPlayer(100, 160);
                    this.openInventory();
                    window.inventoryTestScene = this;
                }
            }
            window.inventoryTestGame = new Phaser.Game({ type: Phaser.AUTO, width: 1280, height: 720,
                parent: host, backgroundColor: '#d8f1ff', scene: InventoryPreview,
                dom: { createContainer: true },
                scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH } });
        })()`);
        for (let i = 0; i < 100; i++) {
            if (await evaluate('!!window.inventoryTestScene')) break;
            await sleep(100);
        }
        assert.equal(await evaluate('window.inventoryTestScene.inventoryCategory'), 'bodyColor');
        assert.deepEqual(await evaluate(`window.inventoryTestScene.inventoryWindow.list
            .filter(child => child.getData('categoryId'))
            .map(child => [child.getData('categoryId'), Number(child.frame.name)])`),
            [['bodyColor', 0], ['hat', 1], ['hair', 2], ['accessory', 3], ['shirt', 4], ['pants', 5], ['shoes', 6]]);
        assert.equal(await evaluate('window.inventoryTestScene.registry.get("inventory").items.length'), 1);
        assert.equal(await evaluate('window.inventoryTestScene.player.clothing.eyelashes.texture.key'), 'eyelashes');
        assert.equal(await evaluate('window.inventoryTestScene.inventoryWindow.list.filter(child => child.texture?.key === "eyelashes").length'), 1);
        for (let i = 0; i < 50; i++) {
            if (await evaluate('window.inventoryTestScene.multiplayer.socket.connected')) break;
            await sleep(100);
        }
        await evaluate('window.inventoryTestScene.openShopCatalog()');
        const catalogState = await evaluate(`(() => {
            const scene = window.inventoryTestScene;
            return { open: scene.catalogOpen, notice: scene.itemNotice?.text,
                active: scene.sys.isActive(), key: scene.sys.settings.key };
        })()`);
        assert.equal(catalogState.open, true, JSON.stringify(catalogState));
        await evaluate(`(() => {
            const scene = window.inventoryTestScene;
            const hats = scene.catalogItems.filter(item => item.id.startsWith('hat/green-hat1'));
            if (hats.length !== 4) throw Error('Shop did not return all four hats');
            scene.inventoryWindow.list.find(child => child.getData('categoryId') === 'hat')
                .emit('pointerdown', null, 0, 0, { stopPropagation() {} });
            const visible = scene.inventoryWindow.list.filter(child => child.getData('itemId')?.startsWith('hat/green-hat1'));
            if (visible.length !== 4) throw Error('Hat category did not display all four hats');
            scene.inventoryWindow.list.find(child => child.getData('categoryId') === 'bodyColor')
                .emit('pointerdown', null, 0, 0, { stopPropagation() {} });
        })()`);
        await evaluate(`(() => {
            const scene = window.inventoryTestScene;
            const slot = scene.inventoryWindow.list.find(child => child.getData('itemId') === 'body-color/blue');
            slot.emit('pointerdown', null, 0, 0, { stopPropagation() {} });
        })()`);
        assert.equal(await evaluate('window.inventoryTestScene.registry.get("inventory").items.length'), 1);
        assert.equal(await evaluate('window.inventoryTestScene.registry.get("inventory").currency'), economy.startingCurrency);
        assert.equal(await evaluate('window.inventoryTestScene.player.body.tintTopLeft'), 0xffffff);
        assert.equal(await evaluate(`window.inventoryTestScene.inventoryWindow.list
            .find(child => child.texture?.key === 'player').tintTopLeft`), 0x91ceff);
        await evaluate(`(async () => {
            const scene = window.inventoryTestScene;
            const button = scene.inventoryWindow.list.find(child => child.getData('purchaseItemId') === 'body-color/blue');
            button.emit('pointerdown', null, 0, 0, { stopPropagation() {} });
            for (let i = 0; i < 100 && scene.inventoryActionPending; i++) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
        })()`);
        assert.equal(await evaluate('window.inventoryTestScene.registry.get("inventory").currency'), economy.startingCurrency - economy.itemPrice);
        assert.equal(await evaluate('window.inventoryTestScene.player.body.tintTopLeft'), 0xffffff);
        await evaluate(`(() => {
            const scene = window.inventoryTestScene;
            scene.toggleInventory();
            scene.toggleInventory();
        })()`);
        await evaluate('window.inventoryTestScene.toggleItem("body-color/blue")');
        assert.equal(await evaluate('window.inventoryTestScene.player.body.tintTopLeft'), 0x91ceff);
        assert.equal(await evaluate(`window.inventoryTestScene.inventoryWindow.list
            .find(child => child.texture?.key === 'player').tintTopLeft`), 0x91ceff);
        await evaluate(`(() => {
            const scene = window.inventoryTestScene;
            const button = scene.inventoryWindow.list.find(child => child.getData('categoryId') === 'pants');
            button.emit('pointerdown', null, 0, 0, { stopPropagation() {} });
        })()`);
        assert.equal(await evaluate('window.inventoryTestScene.inventoryCategory'), 'pants');
        await evaluate(`(async () => {
            const scene = window.inventoryTestScene;
            await scene.openShopCatalog();
            const { clothingItems } = await import('/src/game/items/Clothing.js');
            const shirt = clothingItems.find(item => item.slot === 'shirt');
            await scene.buyItem(shirt.id);
            scene.toggleInventory();
            scene.toggleInventory();
            await scene.toggleItem(shirt.id);
            const { requestAccount } = await import('/src/game/network/Auth.js');
            const restored = await requestAccount('login', { username: 'BrowserShopper', password: 'test-password-123' });
            if (restored.inventory.equipped.shirt !== shirt.id
                || restored.inventory.equipped.bodyColor !== 'body-color/blue'
                || restored.inventory.currency !== ${economy.startingCurrency - 2 * economy.itemPrice}) throw Error('Saved outfit or balance not restored');
            await scene.openShopCatalog();
            scene.inventoryWindow.destroy();
            scene.inventoryCategory = 'shoes';
            scene.openInventory();
        })()`);
        await sleep(1200);
        await evaluate(`(async () => {
            const scene = window.inventoryTestScene;
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            const closing = scene.inventoryWindow;
            scene.toggleInventory();
            if (!closing.active || !closing.windowClosing) throw Error('Window skipped closing animation');
            await wait(400);
            if (closing.active) throw Error('Closed window was not destroyed');
            scene.toggleInventory();
            if (scene.inventoryWindow.y >= 0) throw Error('Window did not enter from above');
            await wait(500);
            if (Math.abs(scene.inventoryWindow.y) > 0.01) throw Error('Window did not settle');

            const remote = { username: 'TransitionTest', gender: 'female',
                equipped: scene.registry.get('inventory').equipped };
            scene.multiplayer.remotePlayers.set('transition-test', remote);
            scene.openPlayerCard(remote);
            const card = scene.playerCard.panel;
            if (card.y >= 0) throw Error('Player card did not animate');
            scene.closePlayerCard();
            await wait(400);
            if (card.active) throw Error('Player card did not close');
            scene.multiplayer.remotePlayers.delete('transition-test');

            const { Resident } = await import('/src/game/objects/Resident.js');
            const { residents } = await import('/src/game/residents/residents.js');
            const resident = Object.assign(Object.create(Resident.prototype), { scene, definition: residents[0] });
            const keyboardEnabled = scene.input.keyboard.enabled;
            resident.openDialogue();
            const dialogue = resident.dialogue;
            if (!dialogue.windowAnimation) throw Error('Resident window did not animate');
            await wait(450);
            resident.closeDialogue();
            if (!dialogue.isConnected) throw Error('Resident skipped closing animation');
            await wait(400);
            if (dialogue.isConnected || scene.activeResident || scene.input.keyboard.enabled !== keyboardEnabled) {
                throw Error('Resident window did not clean up');
            }
            await scene.openShopCatalog();
        })()`);
        console.log('PASS browser: starter inventory, shop catalog, purchases, equip, preview, categories and restored outfit/balance');
        console.log('PASS browser: inventory, player card and resident window entrance, interrupted entrance, exit and cleanup');
        await evaluate(`(async () => {
            const scene = window.inventoryTestScene;
            const { requestAccount } = await import('/src/game/network/Auth.js');
            const admin = await requestAccount('register', { username: 'Koko', password: 'test-password-123' });
            scene.multiplayer.disconnect();
            scene.registry.set('auth', admin);
            scene.multiplayer.connect();
            await new Promise((resolve, reject) => {
                scene.multiplayer.socket.once('currentPlayers', resolve);
                scene.multiplayer.socket.once('connect_error', reject);
            });
            scene.inventoryWindow?.destroy();
            scene.inventoryWindow = null;
            scene.catalogOpen = false;
            scene.inventoryCategory = 'bodyColor';
            scene.openInventory(0, false);
            const original = scene.inventoryWindow.list.find(child => child.getData('itemId') === 'body-color/blue');
            if (original.texture.key !== 'items-frames' || Number(original.frame.name) !== 0) throw Error('Default C frame missing');
            const { openRarityManager } = await import('/src/game/ui/RarityManager.js');
            await openRarityManager(scene);
            const overlay = scene.rarityManager;
            const row = [...overlay.querySelectorAll('.rarity-row')].find(row => row.querySelector('small').textContent === 'body-color/blue');
            if (!row) throw Error('Admin item list missing');
            const select = row.querySelector('select');
            select.value = 'S';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            for (let i = 0; i < 100 && select.disabled; i++) await new Promise(resolve => setTimeout(resolve, 20));
            if (scene.registry.get('itemRarities')['body-color/blue'] !== 'S') throw Error('Rarity update did not sync');
            const updated = scene.inventoryWindow.list.find(child => child.getData('itemId') === 'body-color/blue');
            if (Number(updated.frame.name) !== 3) throw Error('S frame did not render');
            overlay.querySelector('.resident-close').click();
            await new Promise(resolve => setTimeout(resolve, 400));
            if (scene.rarityManager) throw Error('Admin window did not close');
        })()`);
        console.log('PASS browser: default C frames, admin rarity manager, saving S, live frame update and window cleanup');
        await evaluate(`(async () => {
            const scene = window.inventoryTestScene;
            const saved = scene.registry.get('itemRarities');
            const ids = scene.inventoryWindow.list.filter(child => child.getData('itemId')).slice(0, 4).map(child => child.getData('itemId'));
            if (ids.length !== 4) throw Error('Rarity effect fixtures missing');
            const grades = ['C', 'B', 'A', 'S'];
            scene.registry.set('itemRarities', { ...saved, ...Object.fromEntries(ids.map((id, i) => [id, grades[i]])) });
            scene.inventoryWindow.destroy(); scene.openInventory(0, false);
            const animated = [];
            for (let i = 0; i < 4; i++) {
                const effect = scene.inventoryWindow.list.find(child => child.getData('rarityItemId') === ids[i]);
                if (i === 0 ? !!effect : effect?.list.length !== 1 + i * 2) throw Error('Rarity effect strength/star count mismatch: ' + grades[i]);
                if (effect) animated.push(...effect.list);
            }
            scene.inventoryWindow.destroy();
            if (scene.tweens.getTweensOf(animated).some(tween => tween.isPlaying())) throw Error('Rarity tweens survived inventory destruction');
            scene.registry.set('itemRarities', saved); scene.openInventory(0, false);
            const { applyHtmlRarityEffect } = await import('/src/game/ui/ItemRarityEffect.js');
            const preview = document.createElement('button'); preview.className = 'trade-slot trade-item';
            document.body.append(preview);
            try {
                for (const grade of grades) {
                    applyHtmlRarityEffect(preview, grade);
                    if (preview.classList.contains('item-rarity-effect') !== (grade !== 'C')) throw Error('HTML rarity effect mismatch');
                    if (grade !== 'C' && getComputedStyle(preview, '::after').animationName !== 'item-rarity-pulse') throw Error('HTML rarity animation missing');
                }
                applyHtmlRarityEffect(preview, 'C');
                if (preview.classList.contains('item-rarity-effect')) throw Error('HTML rarity effect not cleared');
            } finally { preview.remove(); }
        })()`);
        console.log('PASS browser: C has no effect, B/A/S increase sparkle counts, HTML rarity animation and tween cleanup');
        await evaluate(`(async () => {
            const scene = window.inventoryTestScene;
            if (!scene.inventoryWindow.list.some(child => child.text === 'איפוס שחקן')) throw Error('Admin reset control missing');
            const { requestAccount } = await import('/src/game/network/Auth.js');
            const credentials = { username: 'ResetUITarget', password: 'reset-ui-password-123' };
            await requestAccount('register', { ...credentials, starterColor: 'body-color/blue', gender: 'female' });
            await scene.multiplayer.requestInventory('admin:grant', { username: credentials.username, id: 'reset-ui-gift-001', kind: 'both', amount: 100, rankingAmount: 200 });
            const { openAdminReset } = await import('/src/game/ui/AdminReset.js');
            openAdminReset(scene);
            const modal = scene.adminModal, form = modal.querySelector('form');
            if (scene.input.enabled || scene.chatInput.visible) throw Error('Reset modal did not block world input');
            form.elements.username.value = credentials.username;
            form.requestSubmit();
            if (form.querySelector('.admin-reset-confirm').hidden || !form.elements.username.readOnly) throw Error('Reset confirmation step missing');
            form.elements.confirmation.value = 'WrongPlayer'; form.requestSubmit();
            if (!modal.querySelector('[role="status"]').textContent.includes('אינו תואם')) throw Error('Wrong reset name accepted');
            const before = await requestAccount('login', credentials);
            if (before.inventory.rankingPoints !== 200) throw Error('Reset happened before confirmation');
            form.elements.confirmation.value = credentials.username; form.requestSubmit();
            for (let i = 0; i < 100 && !modal.querySelector('[role="status"]').textContent.includes('בהצלחה'); i++) await new Promise(resolve => setTimeout(resolve, 20));
            if (!modal.querySelector('[role="status"]').textContent.includes('בהצלחה')) throw Error('Reset UI failed');
            const after = await requestAccount('login', credentials);
            if (after.inventory.rankingPoints !== 0 || after.inventory.items.join() !== 'body-color/blue') throw Error('Reset UI did not clear target');
            if (after.user.gender !== 'female') throw Error('Reset changed account identity');
            modal.querySelector('.resident-close').click();
            await new Promise(resolve => setTimeout(resolve, 400));
            if (scene.adminModal || !scene.input.enabled || !scene.chatInput.visible) throw Error('Reset modal did not restore world input');
        })()`);
        console.log('PASS browser: admin reset control, two-step named confirmation, rejected mismatch, offline reset and modal input cleanup');
        await evaluate(`(async () => {
            const scene = window.inventoryTestScene;
            await scene.toggleItem('accessory/golden-necklace');
            await scene.toggleItem('accessory/black-sun-glasses');
            const equipped = scene.registry.get('inventory').equipped;
            if (equipped.necklace !== 'accessory/golden-necklace' || equipped.glasses !== 'accessory/black-sun-glasses') throw Error('Accessories replaced each other');
            if (!scene.player.clothing.sprites.get('necklace')?.visible || !scene.player.clothing.sprites.get('glasses')?.visible) throw Error('Accessories did not render together');
            const { requestAccount } = await import('/src/game/network/Auth.js');
            const restored = await requestAccount('login', { username: 'Koko', password: 'test-password-123' });
            if (restored.inventory.equipped.necklace !== equipped.necklace || restored.inventory.equipped.glasses !== equipped.glasses) throw Error('Accessories did not persist');
        })()`);
        console.log('PASS browser: necklace and sunglasses equip, render and persist together');
        if (process.argv.includes('--world')) {
            await evaluate(`(async () => {
                const { Game } = await import('/src/game/scenes/Game.js');
                const { Cafe } = await import('/src/game/scenes/Cafe.js');
                const scene = window.inventoryTestScene;
                scene.scene.add('Cafe', Cafe, false);
                scene.scene.add('Game', Game, false);
                scene.scene.start('Game', { fromRoom: 'MainMenu' });
            })()`);
            for (let i = 0; i < 100; i++) {
                if (await evaluate('!!window.inventoryTestGame.scene.getScene("Game")?.shopDoorOutline')) break;
                await sleep(100);
            }
            await evaluate(`(async () => {
                const scene = window.inventoryTestGame.scene.getScene('Game');
                const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
                const wall = scene.colliders[0];
                const x = (wall.left + wall.right) / 2;
                scene.player.container.setPosition(x, scene.shopBuilding.y + 50);
                scene.player.setMoveTarget(x, 250, true);
                scene.player.update(1000);
                if (scene.player.container.y < scene.shopBuilding.y - 20) throw Error('Player passed through shop wall');
                scene.player.moveTarget = null;
                scene.shopEntrance.emit('pointerover');
                await wait(250);
                if (scene.shopDoorOutline.alpha < 0.99) throw Error('Door outline did not appear');
                scene.shopEntrance.emit('pointerout');
                await wait(250);
                if (scene.shopDoorOutline.alpha > 0.01) throw Error('Door outline did not fade');
                const leo = scene.residents.get('leo');
                if (!leo.hoverOutline || leo.hoverOutline.parentContainer !== leo.container) throw Error('Leo outline missing');
                const body = leo.container.list.find(child => child.texture?.key === leo.definition.texture);
                body.emit('pointerover');
                await wait(250);
                if (leo.hoverOutline.alpha < 0.99) throw Error('Leo outline did not appear');
                body.emit('pointerout');
                const inputEnabled = scene.input.enabled;
                leo.openDialogue();
                await wait(450);
                if (scene.input.enabled || scene.input.keyboard.enabled) throw Error('Resident window did not block world input');
                scene.input.emit('pointerdown', { worldX: 900, worldY: 500 }, []);
                scene.shopEntrance.emit('pointerdown');
                scene.updateRoom(100);
                if (scene.player.moveTarget || scene.pendingTransition) throw Error('Resident window allowed walking or entering shop');
                leo.dialogue.querySelector('.quest-entry').click();
                await wait(450);
                if (scene.input.enabled) throw Error('Quest conversation restored world input too early');
                leo.questConversation.close();
                await wait(350);
                if (scene.input.enabled) throw Error('Closing child conversation restored world input');
                leo.closeDialogue();
                if (scene.input.enabled) throw Error('World input restored during closing animation');
                await wait(350);
                if (scene.input.enabled !== inputEnabled || !scene.input.keyboard.enabled) throw Error('World input did not restore after Leo window closed');
                scene.moveToRoom('Shop', scene.shopEntrancePoint.x, scene.shopEntrancePoint.y);
                if (!scene.pendingTransition || !scene.player.moveTarget) throw Error('Shop interaction stayed blocked');
                scene.pendingTransition = null; scene.player.moveTarget = null;
            })()`);
            console.log('PASS browser: shop collision stops running player; white outlines on shop door and Leo fade on hover');
            if (process.argv.includes('--snow')) {
                await evaluate(`(async () => {
                    const scene = window.inventoryTestGame.scene.getScene('Game');
                    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
                    const balance = scene.registry.get('inventory').currency;
                    const snowman = scene.snowGameEntry.list.find(child => child.texture?.key === 'snow-game-snowman');
                    snowman.emit('pointerdown', null, 0, 0, { stopPropagation() {} });
                    if (!scene.snowGame) throw Error('Snow game did not open');
                    const overlay = document.querySelector('.snow-catch-screen');
                    await wait(450);
                    if (!scene.player.minigameBadge.visible) throw Error('Local minigame badge missing');
                    const { requestAccount, SERVER_URL } = await import('/src/game/network/Auth.js');
                    const observerAuth = await requestAccount('register', { username: 'SnowObserver', password: 'test-password-123' });
                    const multiplayerSource = await fetch('/src/game/network/Multiplayer.js').then(response => response.text());
                    const socketUrl = multiplayerSource.split('"').find(part => part.includes('/node_modules/.vite/deps/') && part.includes('socket'));
                    const { io } = await import(socketUrl);
                    const observer = io(SERVER_URL, { auth: { token: observerAuth.token, room: 'Game', player: { x: 1100, y: 600 } } });
                    const joined = await new Promise(resolve => observer.once('currentPlayers', resolve));
                    if (joined[scene.multiplayer.socket.id].minigame !== 'snow-catch') throw Error('New room observer did not see minigame presence');
                    await new Promise(resolve => observer.emit('minigame:presence', { game: 'snow-catch', active: true }, resolve));
                    await wait(100);
                    if (!scene.multiplayer.remotePlayers.get(observer.id)?.minigameBadge.visible) throw Error('Remote minigame badge missing');
                    await new Promise(resolve => observer.emit('minigame:presence', { game: 'snow-catch', active: false }, resolve));
                    await wait(100);
                    if (scene.multiplayer.remotePlayers.get(observer.id)?.minigameBadge.visible) throw Error('Remote badge did not clear');
                    observer.disconnect();
                    overlay.querySelector('.snow-start').click();
                    for (let i = 0; i < 50 && !overlay.querySelector('.snow-start').hidden; i++) await wait(50);
                    let status = await scene.multiplayer.requestInventory('snow:state', {});
                    if (status.state.phase !== 'playing') throw Error('Round did not start');
                    const canvas = overlay.querySelector('canvas');
                    const bounds = canvas.getBoundingClientRect();
                    canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: bounds.right - 20, clientY: bounds.bottom - 30, bubbles: true }));
                    for (let i = 0; i < 10; i++) {
                        await new Promise(requestAnimationFrame);
                        const x = scene.snowGame.basketX;
                        scene.snowGame.applyState({ ...status.state, basketX: 50 });
                        if (Math.abs(scene.snowGame.basketX - x) > 0.01) throw Error('Server snapshot rewound basket');
                    }
                    await wait(600);
                    status = await scene.multiplayer.requestInventory('snow:state', {});
                    if (status.state.basketX < 500) throw Error('Mouse input did not move basket');
                    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
                    await wait(350);
                    canvas.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
                    const moved = await scene.multiplayer.requestInventory('snow:state', {});
                    if (moved.state.basketX >= status.state.basketX) throw Error('Arrow input did not move basket');
                    if (scene.input.keyboard.enabled) throw Error('World keyboard was not blocked');
                    overlay.querySelector('.resident-close').click();
                    await wait(400);
                    if (scene.snowGame || document.querySelector('.snow-catch-screen')) throw Error('Snow game did not clean up');
                    if (!scene.input.keyboard.enabled) throw Error('World keyboard was not restored');
                    if (scene.player.minigameBadge.visible) throw Error('Local minigame badge did not clear');
                    if (scene.registry.get('inventory').currency !== balance) throw Error('Cancelled round granted rewards');
                    if ((await scene.multiplayer.requestInventory('snow:state', {}).catch(() => null))) throw Error('Cancelled round remained active');
                })()`);
                console.log('PASS browser: snowman entry, snow game start, mouse/arrows, world input isolation, cancellation and cleanup');
                if (process.argv.includes('--snow-full')) {
                    await evaluate(`(async () => {
                        const scene = window.inventoryTestGame.scene.getScene('Game');
                        const { openSnowCatch } = await import('/src/game/minigames/SnowCatch.js');
                        const { requestAccount } = await import('/src/game/network/Auth.js');
                        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
                        const leo = scene.residents.get('leo');
                        const questState = () => scene.registry.get('inventory').quests['leo-welcome'];
                        const waitForQuest = async count => {
                            for (let i = 0; i < 50 && questState().claimedSteps !== count; i++) await wait(40);
                            if (questState().claimedSteps !== count) throw Error('Quest claim did not update');
                        };
                        const rewardModal = async cards => {
                            for (let i = 0; i < 50 && !document.querySelector('.quest-rewards-screen'); i++) await wait(40);
                            const modal = document.querySelector('.quest-rewards-screen');
                            if (!modal || modal.querySelectorAll('.quest-prize').length !== cards) throw Error('Reward cards missing');
                            if ([...document.querySelectorAll('[data-quest-action]')].some(button => !button.querySelector('img[src="assets/ui/v-button.png"]') || !button.getAttribute('aria-label'))) throw Error('Quest buttons must use the accessible V icon');
                            return modal;
                        };
                        const dismissRewards = async () => {
                            const modal = await rewardModal(2);
                            modal.querySelector('[data-quest-action=rewards-done]').click();
                            await wait(350);
                            if (document.querySelector('.quest-rewards-screen')) throw Error('Reward window did not close');
                        };
                        leo.openDialogue();
                        await wait(450);
                        const beforeQuest = scene.registry.get('inventory').currency;
                        if (leo.dialogue.querySelectorAll('.quest-entry').length !== 1 || leo.dialogue.querySelector('[data-quest-action]')) throw Error('Quest list should only contain one rolling quest');
                        leo.dialogue.querySelector('.quest-entry').click();
                        let talk = document.querySelector('.quest-conversation-screen');
                        if (!talk || !talk.querySelector('.quest-story').textContent.includes('Koko')) throw Error('Personalized Leo conversation missing');
                        talk.querySelector('[data-quest-action=accept]').click();
                        for (let i = 0; i < 50 && !questState().started; i++) await wait(40);
                        if (!questState().started) throw Error('Leo quest did not start');
                        if (!leo.questReadyBadge.visible) throw Error('Ready quest did not mark Leo');
                        talk.querySelector('[data-quest-action=claim]').click();
                        await waitForQuest(1);
                        if (scene.registry.get('inventory').currency !== beforeQuest + 5) throw Error('First quest reward missing');
                        if (!leo.dialogue.querySelector('[data-step-id=snow-catch]')) throw Error('Next quest step missing');
                        if (leo.questReadyBadge.visible) throw Error('Leo marker did not clear for unfinished next step');
                        await dismissRewards();
                        if (leo.dialogue.querySelectorAll('.quest-current').length !== 1) throw Error('Future quest steps leaked into list');
                        leo.closeDialogue();
                        await wait(350);
                        const before = scene.registry.get('inventory');
                        openSnowCatch(scene);
                        await wait(450);
                        const overlay = document.querySelector('.snow-catch-screen');
                        overlay.querySelector('.snow-start').click();
                        let latest;
                        const end = performance.now() + 49000;
                        while (performance.now() < end) {
                            await wait(150);
                            latest = (await scene.multiplayer.requestInventory('snow:state', {})).state;
                            if (latest.phase === 'finished') break;
                            const target = latest.flakes.filter(flake => flake.type !== 'ice' && flake.y > 60)
                                .sort((a, b) => b.y - a.y)[0];
                            if (target) {
                                const canvas = overlay.querySelector('canvas');
                                const rect = canvas.getBoundingClientRect();
                                canvas.dispatchEvent(new PointerEvent('pointermove', {
                                    clientX: rect.left + target.x / 760 * rect.width,
                                    clientY: rect.top + 100, bubbles: true
                                }));
                            }
                        }
                        if (latest?.phase !== 'finished' || !latest.result) throw Error('Full round did not finish');
                        await wait(250);
                        if (!leo.questReadyBadge.visible) throw Error('Completing minigame did not mark Leo');
                        const earned = latest.result;
                        if (earned.coins < 2 || earned.coins > 8 || earned.rankingPoints < 5 || earned.rankingPoints > 20) throw Error('Invalid round rewards');
                        if (overlay.querySelector('.snow-start').hidden || !overlay.querySelector('.snow-result').textContent.includes('הרווחתם')) throw Error('Result screen missing');
                        const after = scene.registry.get('inventory');
                        if (after.currency !== before.currency + earned.coins) throw Error('Round money was not applied');
                        if (after.rankingPoints !== before.rankingPoints + earned.rankingPoints) throw Error('Round ranking was not applied');
                        await scene.multiplayer.requestInventory('snow:state', {});
                        if (scene.registry.get('inventory').currency !== after.currency) throw Error('Reward paid twice');
                        const restored = await requestAccount('login', { username: 'Koko', password: 'test-password-123' });
                        if (restored.inventory.currency !== after.currency || restored.inventory.snowBest !== earned.best) throw Error('Round did not persist');
                        overlay.querySelector('.resident-close').click();
                        await wait(400);
                        leo.openDialogue();
                        await wait(450);
                        leo.dialogue.querySelector('.quest-entry').click();
                        talk = document.querySelector('.quest-conversation-screen');
                        talk.querySelector('[data-quest-action=claim]').click();
                        await waitForQuest(2);
                        await dismissRewards();
                        if (talk.querySelector('[data-quest-action=claim]') || leo.questReadyBadge.visible) throw Error('Previous record incorrectly completed new snow challenge');
                        leo.closeDialogue();
                        await wait(350);
                        openSnowCatch(scene);
                        const secondOverlay = document.querySelector('.snow-catch-screen');
                        await wait(450);
                        secondOverlay.querySelector('.snow-start').click();
                        let secondRound;
                        const secondEnd = performance.now() + 49000;
                        while (performance.now() < secondEnd) {
                            await wait(150);
                            secondRound = (await scene.multiplayer.requestInventory('snow:state', {})).state;
                            if (secondRound.phase === 'finished') break;
                            const target = secondRound.flakes.filter(flake => flake.type !== 'ice' && flake.y > 60).sort((a, b) => b.y - a.y)[0];
                            if (target) {
                                const canvas = secondOverlay.querySelector('canvas'), rect = canvas.getBoundingClientRect();
                                canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: rect.left + target.x / 760 * rect.width, clientY: rect.top + 100, bubbles: true }));
                            }
                        }
                        if (secondRound?.phase !== 'finished' || secondRound.score < 400) throw Error('Fresh round did not satisfy snow champion');
                        secondOverlay.querySelector('.resident-close').click();
                        await wait(400);
                        leo.openDialogue();
                        await wait(450);
                        leo.dialogue.querySelector('.quest-entry').click();
                        talk = document.querySelector('.quest-conversation-screen');
                        const challengeClaim = talk.querySelector('[data-quest-action=claim]');
                        if (!challengeClaim) throw Error('Snow champion needs a fresh 400-point round');
                        challengeClaim.click();
                        await waitForQuest(3);
                        await dismissRewards();
                        const finalClaim = talk.querySelector('[data-quest-action=claim]');
                        if (finalClaim.disabled) throw Error('Final quest should be ready with admin items and equipped accessories');
                        finalClaim.click();
                        await waitForQuest(4);
                        await rewardModal(3);
                        if (!questState().completed || !leo.dialogue.querySelector('.quest-complete')) throw Error('Final quest screen missing');
                        if (leo.questReadyBadge.visible) throw Error('Completed chain left a quest marker');
                        const finishedQuest = scene.registry.get('inventory');
                        if (finishedQuest.currency !== after.currency + 38 + secondRound.result.coins || finishedQuest.rankingPoints !== after.rankingPoints + 50 + secondRound.result.rankingPoints) throw Error('Quest step rewards incorrect');
                        if (!finishedQuest.items.includes('accessory/black-sun-glasses')) throw Error('Final sunglasses missing');
                        const relog = await requestAccount('login', { username: 'Koko', password: 'test-password-123' });
                        if (!relog.inventory.quests['leo-welcome'].completed) throw Error('Quest completion was not saved');
                    })()`);
                    console.log('PASS browser: two real 45-second rounds, fresh quest scores, bounded rewards, duplicate protection and persisted money/ranking/best');
                    console.log('PASS browser: Leo quest acceptance, sequential rewards, real minigame requirement, final sunglasses and persisted completion');
                }
            }
        }
    }
    for (let i = 0; i < 30; i++) {
        if (await evaluate('!document.querySelector(".loading-screen")')) break;
        await sleep(100);
    }
    if (await evaluate('!!document.querySelector(".quest-rewards-screen")')) await sleep(900);
    if (process.argv.includes('--trade')) {
        await evaluate(`(async () => {
            const { requestAccount, SERVER_URL } = await import('/src/game/network/Auth.js');
            const { io } = await import('/node_modules/.vite/deps/socket__io-client.js');
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            const until = async test => { for (let i = 0; i < 100; i++) { if (test()) return; await wait(50); } throw Error('Trade UI timed out'); };
            const rpc = (socket, event, data) => new Promise((resolve, reject) => socket.timeout(4000).emit(event, data, (error, reply) => error || !reply?.ok ? reject(Error(reply?.error || 'Trade RPC timeout')) : resolve(reply)));
            const owned = async (username, itemId, copies = 1, extra = []) => {
                const auth = await requestAccount('register', { username, password: 'test-password-123', gender: 'female' });
                const shop = io(SERVER_URL, { auth: { token: auth.token, room: 'Shop' } });
                await until(() => shop.connected);
                for (const id of [...Array(copies).fill(itemId), ...extra]) await rpc(shop, 'shop:purchase', { itemId: id });
                const result = await rpc(shop, 'inventory:equip', { itemId, equip: true });
                shop.disconnect(); return { ...auth, inventory: result.inventory };
            };
            const a = await owned('TradeAlice', 'shirt/red-shirt', 2);
            const b = await owned('TradeBob', 'shoes/gray-shoes', 1, ['shirt/red-shirt']);
            let scene = window.inventoryTestGame.scene.getScene('Game');
            scene.openInventory();
            if (!scene.inventoryWindow.list.some(object => object.getData?.('itemQuantityId') && object.text === '∞')) throw Error('Admin quantities must show infinity');
            scene.toggleInventory(); await wait(350);
            const adminPeer = io(SERVER_URL, { auth: { token: b.token, room: 'Game', player: { x: 900, y: 500 } } });
            let adminPeerState;
            adminPeer.on('trade:state', state => { adminPeerState = state; });
            try {
                await until(() => adminPeer.connected && scene.multiplayer.remotePlayers.has(adminPeer.id));
                const inviteAdmin = async () => {
                    const reply = await scene.multiplayer.requestInventory('trade:request', { targetId: adminPeer.id });
                    await until(() => adminPeerState?.id === reply.id);
                    await rpc(adminPeer, 'trade:respond', { id: reply.id, accept: true });
                    await until(() => scene.tradeWindow?.state.phase === 'active');
                };
                await inviteAdmin();
                const { clothingItems } = await import('/src/game/items/Clothing.js');
                const allAdminItems = () => document.querySelectorAll('.trade-inventory .trade-item').length;
                if (allAdminItems() !== clothingItems.length) throw Error('Admin trade inventory must show every item');
                for (let copy = 1; copy <= 6; copy++) {
                    await until(() => !document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"]').disabled);
                    document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"]').click();
                    await until(() => adminPeerState.players[1 - adminPeerState.me].offer.length === copy);
                    if (allAdminItems() !== clothingItems.length || document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"] .trade-quantity')?.textContent !== '∞') throw Error('Offering admin copies hid an item or changed infinity');
                }
                await rpc(adminPeer, 'trade:confirm', { id: adminPeerState.id, revision: adminPeerState.revision, accept: true });
                await wait(100); document.querySelector('[data-quest-action=trade-confirm]').click();
                await until(() => !scene.tradeModal);
                await inviteAdmin();
                if (allAdminItems() !== clothingItems.length || !document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"]')) throw Error('Giving items removed them from next admin trade');
                document.querySelector('.trade-screen .resident-close').click(); await until(() => !scene.tradeModal);
            } finally { adminPeer.disconnect(); }
            const previousSocketId = scene.multiplayer.socket.id;
            scene.registry.set('auth', a); scene.registry.set('inventory', a.inventory); scene.scene.restart();
            await until(() => window.inventoryTestGame.scene.isActive('Game')
                && window.inventoryTestGame.scene.getScene('Game').player?.username === a.user.username
                && window.inventoryTestGame.scene.getScene('Game').multiplayer?.socket.connected
                && window.inventoryTestGame.scene.getScene('Game').multiplayer.socket.id !== previousSocketId);
            await until(() => !document.querySelector('.loading-screen'));
            scene = window.inventoryTestGame.scene.getScene('Game');
            const peer = io(SERVER_URL, { auth: { token: b.token, room: 'Game', player: { x: 900, y: 500 } } });
            let peerState, completed;
            peer.on('trade:state', state => { peerState = state; });
            peer.on('trade:closed', result => { completed = result; });
            try {
                await until(() => peer.connected && scene.multiplayer.remotePlayers.has(peer.id));
                const invite = async () => {
                    scene.openPlayerCard(scene.multiplayer.remotePlayers.get(peer.id));
                    await wait(450);
                    const button = scene.playerCard.panel.list.find(object => object.getData?.('tradeRequest'));
                    button.emit('pointerdown', null, 0, 0, { stopPropagation() {} });
                    await until(() => scene.tradeWindow?.state.phase === 'pending' && peerState?.id === scene.tradeWindow.state.id);
                    if (scene.tradeModal || !scene.input.enabled || !scene.input.keyboard.enabled) throw Error('Pending trade blocked game input');
                    const request = document.querySelector('.trade-request-screen');
                    if (!request || getComputedStyle(request).pointerEvents !== 'none' || request.querySelector('.trade-request-hint')) throw Error('Pending trade must be a nonblocking corner card without the old hint');
                    const rect = scene.game.canvas.getBoundingClientRect();
                    const hit = document.elementFromPoint(rect.left + rect.width * 0.65, rect.top + rect.height * 0.65);
                    if (hit !== scene.game.canvas) throw Error('Pending request intercepted map clicks: ' + hit?.outerHTML.slice(0, 300));
                    const beforeX = scene.player.container.x;
                    scene.input.emit('pointerdown', { worldX: beforeX + 20, worldY: scene.player.container.y }, []);
                    scene.updateRoom(80);
                    if (scene.player.container.x === beforeX) throw Error('Player could not move while trade request was pending');
                    scene.moveToRoom('Shop', scene.shopEntrancePoint.x, scene.shopEntrancePoint.y);
                    if (scene.pendingTransition?.sceneKey !== 'Shop') throw Error('Pending request blocked environment interactions');
                    scene.pendingTransition = null; scene.player.moveTarget = null;
                };
                await invite();
                await rpc(peer, 'trade:respond', { id: peerState.id, accept: false });
                await until(() => !scene.tradeModal);
                peerState = null;
                await invite();
                await rpc(peer, 'trade:respond', { id: peerState.id, accept: true });
                await until(() => scene.tradeWindow?.state.phase === 'active');
                if (scene.input.enabled || document.querySelectorAll('.trade-avatar').length !== 2) throw Error('Trade window did not show both avatars or block input');
                document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"]').click();
                await until(() => peerState.players[1 - peerState.me].offer.includes('shirt/red-shirt'));
                await until(() => document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"]')
                    && !document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"]').disabled);
                if (document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"] .trade-quantity')) throw Error('Single-copy badge must be hidden');
                document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"]').click();
                await until(() => peerState.players[1 - peerState.me].offer.length === 2);
                if (document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"]')) throw Error('Exhausted item still available');
                await rpc(peer, 'trade:offer', { id: peerState.id, revision: peerState.revision, items: ['shoes/gray-shoes'] });
                await until(() => document.querySelector('.trade-offer[data-side=other] [data-item-id="shoes/gray-shoes"]'));
                await rpc(peer, 'trade:confirm', { id: peerState.id, revision: peerState.revision, accept: true });
                document.querySelector('.trade-offer[data-side=own] [data-item-id="shirt/red-shirt"]').click();
                await until(() => peerState.players.every(player => !player.ready));
                document.querySelector('.trade-inventory [data-item-id="shirt/red-shirt"]').click();
                await until(() => peerState.players[1 - peerState.me].offer.length === 2);
                await rpc(peer, 'trade:confirm', { id: peerState.id, revision: peerState.revision, accept: true });
                await wait(100);
                document.querySelector('[data-quest-action=trade-confirm]').click();
                await until(() => completed?.completed && !scene.tradeModal);
                const final = scene.registry.get('inventory');
                if (!final.items.includes('shoes/gray-shoes') || final.items.includes('shirt/red-shirt') || final.equipped.shirt) throw Error('Local inventory did not exchange/unequip');
                const peerLogin = await requestAccount('login', { username: 'TradeBob', password: 'test-password-123' });
                if (!peerLogin.inventory.items.includes('shirt/red-shirt') || peerLogin.inventory.items.includes('shoes/gray-shoes')) throw Error('Peer inventory did not persist exchange');
                if (peerLogin.inventory.quantities['shirt/red-shirt'] !== 9) throw Error('Recipient did not keep its original copy plus six admin copies and both received copies');
                scene.inventoryCategory = 'shoes'; scene.openInventory();
                const quantity = scene.inventoryWindow.list.find(object => object.getData?.('itemQuantityId') === 'shoes/gray-shoes');
                if (quantity) throw Error('Single-copy inventory label must be hidden');
            } finally { peer.disconnect(); }
        })()`);
        console.log('PASS browser: complete admin trade inventory after gifting six copies, persistent infinity, hidden single counts, ordinary multi-copy exchange and persisted quantities');
    }
    if (process.argv.includes('--hair')) {
        await evaluate(`(async () => {
            const scene = window.inventoryTestGame.scene.getScenes(true)[0];
            const { getClothingItem, getClothingTexture } = await import('/src/game/items/Clothing.js');
            await scene.openShopCatalog();
            const hair = scene.catalogItems.filter(item => getClothingItem(item.id).slot === 'hair');
            if (hair.length !== 6) throw Error('Shop must contain exactly the six requested hairstyles');
            scene.inventoryCategory = 'hair'; scene.inventoryWindow.destroy(); scene.openInventory();
            for (const base of ['eye-cover-girl-hair', 'short-hair']) {
                for (const [suffix, expected] of [['', 0x7d534c], ['--blonde', 0xe5c36c], ['--black', 0x303541]]) {
                    const item = getClothingItem('hair/' + base + suffix);
                    if (!hair.some(entry => entry.id === item.id)) throw Error('Hair variant missing from shop');
                    const key = getClothingTexture(scene, item);
                    if (getClothingTexture(scene, item) !== key) throw Error('Palette texture did not cache');
                    const source = scene.textures.get(key).getSourceImage();
                    const canvas = document.createElement('canvas'); canvas.width = source.width; canvas.height = source.height;
                    const ctx = canvas.getContext('2d'); ctx.drawImage(source, 0, 0);
                    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                    let found = false;
                    for (let i = 0; i < data.length; i += 4) if (data[i + 3] && ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) === expected) found = true;
                    if (!found) throw Error('Hair variant did not render its expected color: ' + item.id);
                    await scene.toggleItem(item.id);
                    if (scene.player.clothing.equipped.hair !== item.id) throw Error('Hair variant did not equip');
                }
            }
        })()`);
        console.log('PASS browser: six shop hairstyles, original/blonde/black pixels, texture cache and equipping');
    }
    if (process.argv.includes('--grants')) {
        await evaluate(`(async () => {
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            const scene = window.inventoryTestGame.scene.getScene('Game');
            const { openAdminGrants } = await import('/src/game/ui/AdminGrants.js');
            const initial = scene.registry.get('inventory');
            scene.openInventory();
            await wait(450);
            if (!scene.inventoryWindow.list.some(object => object.text === 'מתנות לשחקנים')) throw Error('Admin grant entry missing');
            const give = async (kind, amount, asset, rankingAmount, room = false) => {
                openAdminGrants(scene);
                const form = document.querySelector('.admin-grant-form');
                if (!form || scene.input.enabled) throw Error('Admin form did not lock world input');
                form.elements.username.value = 'Koko';
                form.elements.kind.value = kind;
                form.elements.kind.dispatchEvent(new Event('change', { bubbles: true }));
                if (room) {
                    form.elements.scope.value = 'room';
                    form.elements.scope.dispatchEvent(new Event('change', { bubbles: true }));
                    if (!form.elements.username.disabled) throw Error('Room grant still requires a username');
                }
                form.elements.amount.value = amount;
                if (rankingAmount) form.elements.rankingAmount.value = rankingAmount;
                form.requestSubmit();
                for (let i = 0; i < 80; i++) {
                    if (document.querySelector('.admin-grant-status')?.textContent.includes('המתנה נשלחה')) break;
                    await wait(50);
                }
                if (!document.querySelector('.admin-grant-status')?.textContent.includes('המתנה נשלחה')) throw Error('Admin grant failed');
                document.querySelector('.admin-grant-screen .resident-close').click();
                for (let i = 0; i < 80 && !document.querySelector('.admin-gift-notification'); i++) await wait(50);
                const notice = document.querySelector('.admin-gift-notification');
                if (!notice || !notice.querySelector('h2').textContent.includes('Koko')) throw Error('Sender notice missing');
                if (notice.querySelector('.admin-gift-amount strong').textContent !== String(amount)) throw Error('Incorrect gift amount');
                if (!notice.querySelector('.admin-gift-amount img').src.endsWith(asset)) throw Error('Incorrect reward icon');
                if (rankingAmount) {
                    const rewards = notice.querySelectorAll('.admin-gift-amount');
                    if (rewards.length !== 2 || rewards[1].querySelector('strong').textContent !== String(rankingAmount)
                        || !rewards[1].querySelector('img').src.endsWith('levelup-symbol.png')) throw Error('Combined gift notification missing ranking reward');
                }
                if (scene.input.enabled) throw Error('Gift notification allowed world interactions');
                notice.querySelector('[data-quest-action=ack-admin-gift]').click();
                for (let i = 0; i < 80 && document.querySelector('.admin-gift-notification'); i++) await wait(50);
                if (document.querySelector('.admin-gift-notification')) throw Error('Gift acknowledgement did not close notice');
                if (scene.registry.get('inventory').adminGifts.length) throw Error('Gift notice was not acknowledged');
                if (!scene.input.enabled) throw Error('Gift acknowledgement did not restore input');
            };
            await give('currency', 23, 'coin-symbol.png');
            await give('rankingPoints', 40, 'levelup-symbol.png');
            await give('both', 17, 'coin-symbol.png', 25, true);
            const after = scene.registry.get('inventory');
            if (after.currency !== initial.currency + 40 || after.rankingPoints !== initial.rankingPoints + 65) throw Error('Grant totals incorrect');
        })()`);
        console.log('PASS browser: individual and room grants, combined money/ranking, sender/amount/icons, acknowledgement and input restoration');
    }
    if (process.argv.includes('--cafe')) {
        await evaluate(`(async () => {
            const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
            const game = window.inventoryTestGame;
            let square = game.scene.getScene('Game');
            if (square.cafeBuilding.texture.key !== 'coffee-building' || !square.cafeDoorOutline) throw Error('Cafe artwork or outline missing');
            square.cafeEntrance.emit('pointerdown');
            if (square.pendingTransition?.sceneKey !== 'Cafe') throw Error('Cafe door did not start entrance movement');
            square.player.container.setPosition(square.cafeEntrancePoint.x, square.cafeEntrancePoint.y);
            square.player.moveTarget = null;
            square.updateRoom(0);
            for (let i = 0; i < 100; i++) {
                if (game.scene.isActive('Cafe') && game.scene.getScene('Cafe').multiplayer?.socket.connected) break;
                await wait(100);
            }
            const cafe = game.scene.getScene('Cafe');
            if (!game.scene.isActive('Cafe') || !cafe.multiplayer?.socket.connected) throw Error('Cafe scene did not connect');
            const cafeAuth = await new Promise(resolve => cafe.multiplayer.socket.auth(resolve));
            if (cafeAuth.room !== 'Cafe') throw Error('Cafe connected to wrong multiplayer room');
            const mia = cafe.residents?.get('mia');
            const miaBody = mia?.container.list.find(child => child.texture?.key === 'resident:mia');
            if (!miaBody || Math.abs(miaBody.displayHeight - 148) > 0.01) throw Error('Mia artwork or resident missing');
            miaBody.emit('pointerdown', null, 0, 0, { stopPropagation() {} });
            if (mia.dialogue?.querySelector('h2').textContent !== 'מיה'
                || mia.dialogue.querySelector('.resident-label').textContent !== 'בעלת בית הקפה') throw Error('Mia profile missing');
            if (cafe.input.enabled || mia.dialogue.querySelector('.resident-quests-empty').hidden) throw Error('Mia dialogue input lock or empty quests missing');
            mia.dialogue.querySelector('.resident-close').click();
            await wait(400);
            if (cafe.activeResident || !cafe.input.enabled) throw Error('Mia dialogue did not restore world interactions');
            cafe.exit.emit('pointerdown');
            cafe.player.container.setPosition(cafe.exitPoint.x, cafe.exitPoint.y);
            cafe.player.moveTarget = null;
            cafe.updateRoom(0);
            for (let i = 0; i < 100; i++) {
                if (game.scene.isActive('Game') && game.scene.getScene('Game').multiplayer?.socket.connected) break;
                await wait(100);
            }
            square = game.scene.getScene('Game');
            if (!game.scene.isActive('Game')) throw Error('Cafe exit failed');
            if (Math.hypot(square.player.container.x - square.cafeEntrancePoint.x, square.player.container.y - square.cafeEntrancePoint.y) > 2) throw Error('Returning player did not spawn outside cafe');
            await wait(1200);
        })()`);
        console.log('PASS browser: cafe artwork, door interaction, multiplayer room, interior and return beside cafe door');
    }
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    const filename = path.join(os.tmpdir(), process.argv.includes('--snow-full') ? 'vw-snow-catch.png' : process.argv.includes('--inventory') ? 'vw-inventory.png' : 'vw-account-menu.png');
    fs.writeFileSync(filename, Buffer.from(screenshot.data, 'base64'));
    console.log(`PASS browser: menu, registration tab, confirmation mismatch, failed login; screenshot: ${filename}`);
    await send('Browser.close');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
    ws?.close();
    browser.kill();
    if (inventoryServer) await inventoryServer.close();
    await sleep(500);
    const resolved = fs.realpathSync(profile);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('vw-menu-check-'));
    try { fs.rmSync(resolved, { recursive: true }); } catch { /* Browser may still be closing. */ }
});
