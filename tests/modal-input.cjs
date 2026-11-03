const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

const elements = [];
const document = { activeElement: null,
    querySelectorAll() { return elements.filter(element => element.modal && element.isConnected); },
    getElementById() { return container; } };
class Element {
    constructor(modal = false, cssZ = 20) {
        Object.assign(this, { modal, cssZ, inert: false, connected: false, style: { zIndex: '' },
            listeners: new Map(), focusCount: 0, children: [] });
        elements.push(this);
        if (modal) {
            this.input = new Element(); this.button = new Element();
            this.append(this.input); this.append(this.button);
        }
    }
    get isConnected() { return this.parent ? this.parent.isConnected : this.connected; }
    append(child) { child.parent = this; this.children.push(child); }
    remove() { this.parent = null; this.connected = false; }
    querySelector(selector) { return selector === 'input' ? this.input : this.button; }
    querySelectorAll() { return [this.input, this.button]; }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    closest(selector) {
        if (selector !== '[inert]') return null;
        for (let node = this; node; node = node.parent) if (node.inert) return node;
        return null;
    }
    contains(element) { for (let node = element; node; node = node.parent) if (node === this) return true; return false; }
    focus() { document.activeElement = this; this.focusCount++; }
}
const container = new Element(); container.connected = true;
const pending = [];
const source = fs.readFileSync(path.join(__dirname, '../src/game/ui/AdminGrants.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
const { mountModal } = vm.runInNewContext(source + '\n({ mountModal })', {
    document, getComputedStyle: element => ({ zIndex: element.style.zIndex || String(element.cssZ) }),
    openHtmlWindow() {},
    closeHtmlWindow(overlay, done, animate) {
        if (overlay.windowClosed) return;
        const finish = () => { overlay.windowClosed = true; overlay.remove(); done(); };
        if (animate) { overlay.windowClosing = true; pending.push(finish); }
        else finish();
    }
});
const scene = { input: { enabled: true, keyboard: { enabled: true } },
    chatInput: { visible: true, setVisible(value) { this.visible = value; } },
    player: { moveTarget: { x: 100, y: 100 }, isMoving: true, cursors: {} },
    pendingTransition: {}, events: new EventEmitter() };
const originalFocus = new Element(); container.append(originalFocus); originalFocus.focus();
const residentParent = new Element(true); container.append(residentParent);
const alreadyInertParent = new Element(true); container.append(alreadyInertParent); alreadyInertParent.inert = true;

const rarity = new Element(true, 20), gift = new Element(true, 50);
const closeRarity = mountModal(scene, rarity, () => {}, 'rarityManager');
assert.equal(scene.input.enabled, false);
assert.equal(scene.player.moveTarget, null);
assert.equal(residentParent.inert, true);
const closeGift = mountModal(scene, gift, () => {});
assert.equal(rarity.inert, true);
assert.equal(gift.inert, false);
assert.equal(document.activeElement, gift.input);

// Closing a lower window must not unlock inventory or steal focus from the top.
closeRarity(false);
assert.equal(scene.rarityManager, null);
assert.equal(scene.adminModal, gift);
assert.equal(scene.input.enabled, false);
assert.equal(scene.input.keyboard.enabled, false);
assert.equal(scene.chatInput.visible, false);
assert.equal(document.activeElement, gift.input);
closeGift(true);
assert.equal(scene.input.enabled, false, 'Closing animation must keep the modal lock');
pending.shift()();
assert.equal(scene.input.enabled, true);
assert.equal(scene.input.keyboard.enabled, true);
assert.equal(scene.chatInput.visible, true);
assert.equal(residentParent.inert, false);
assert.equal(alreadyInertParent.inert, true);
assert.equal(document.activeElement, originalFocus);

// A later modal must be visually above the first even with a lower CSS z-index.
const first = new Element(true, 60), second = new Element(true, 20);
const closeFirst = mountModal(scene, first, () => {}, 'tradeModal');
const closeSecond = mountModal(scene, second, () => {}, 'rarityManager');
assert.ok(Number(second.style.zIndex) > 60);
closeSecond(false);
assert.equal(first.inert, false);
assert.equal(scene.input.enabled, false);
assert.equal(document.activeElement, first.input);
closeFirst(false);
assert.equal(scene.input.enabled, true);
assert.equal(second.style.zIndex, '');

// Preserve a lock and hidden chat that existed before these modals were opened.
scene.input.enabled = false; scene.input.keyboard.enabled = false; scene.chatInput.visible = false;
const existingLock = new Element(true);
mountModal(scene, existingLock, () => {});
scene.events.emit('shutdown');
assert.equal(scene.input.enabled, false);
assert.equal(scene.input.keyboard.enabled, false);
assert.equal(scene.chatInput.visible, false);
assert.equal(scene.events.listenerCount('shutdown'), 0);
console.log('PASS: stacked modal input, out-of-order close, animation lock, focus, z-order, inert restoration and shutdown');
