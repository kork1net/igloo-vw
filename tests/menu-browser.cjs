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
    }
    for (let i = 0; i < 30; i++) {
        if (await evaluate('!document.querySelector(".loading-screen")')) break;
        await sleep(100);
    }
    const screenshot = await send('Page.captureScreenshot', { format: 'png' });
    const filename = path.join(os.tmpdir(), process.argv.includes('--inventory') ? 'vw-inventory.png' : 'vw-account-menu.png');
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
