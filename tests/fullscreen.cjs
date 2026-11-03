const assert = require('node:assert/strict');

class Events {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }
    removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
    async dispatch(type, event = {}) {
        await Promise.all([...this.listeners.get(type) || []].map(listener => listener(event)));
        await Promise.resolve();
    }
    get listenerCount() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}

(async () => {
    const { installFullscreen } = await import('../src/game/ui/Fullscreen.js');
    const previousWindow = global.window, previousDocument = global.document;
    const window = new Events(), document = new Events();
    Object.assign(window, { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1 });
    document.fullscreenElement = null;
    let enters = 0, exits = 0, rejectNext = false;
    const parent = {
        style: {}, clientLeft: 0, clientTop: 0,
        get clientWidth() { return window.innerWidth; },
        get clientHeight() { return window.innerHeight; },
        getBoundingClientRect() { return { left: 0, top: 0, width: this.clientWidth, height: this.clientHeight }; },
        async requestFullscreen() {
            enters++;
            if (rejectNext) { rejectNext = false; throw new Error('Fullscreen request denied'); }
            document.fullscreenElement = parent;
            await document.dispatch('fullscreenchange');
        }
    };
    document.exitFullscreen = async () => {
        exits++;
        document.fullscreenElement = null;
        await document.dispatch('fullscreenchange');
    };
    document.getElementById = () => parent;
    const canvas = {
        width: 1280, height: 720, style: {}, parentElement: parent,
        getBoundingClientRect() {
            return { left: parseFloat(this.style.marginLeft) || 0, top: parseFloat(this.style.marginTop) || 0,
                width: parseFloat(this.style.width) || 1280, height: parseFloat(this.style.height) || 720 };
        }
    };
    const domContainer = { style: {} };
    const scaleEvents = new Events();
    const game = {
        canvas, domContainer,
        scale: {
            zoom: 1, width: 1280, height: 720,
            on(type, listener) { scaleEvents.addEventListener(type, listener); },
            off(type, listener) { scaleEvents.removeEventListener(type, listener); },
            getParentBounds() {},
            setZoom(zoom) {
                this.zoom = zoom;
                Object.assign(canvas.style, { width: `${1280 * zoom}px`, height: `${720 * zoom}px`,
                    marginLeft: `${Math.floor((parent.clientWidth - 1280 * zoom) / 2)}px`,
                    marginTop: `${Math.floor((parent.clientHeight - 720 * zoom) / 2)}px` });
                for (const listener of scaleEvents.listeners.get('resize') || []) listener();
                return this;
            },
            updateBounds() {}, refresh() { return this; }
        }
    };
    global.window = window;
    global.document = document;
    let cleanup;
    const key = (code = 'F11', repeat = false) => ({ code, key: code, repeat, prevented: false,
        preventDefault() { this.prevented = true; }, stopPropagation() {} });
    const assertDisplayScale = expectedScale => {
        assert.equal(game.scale.zoom * window.devicePixelRatio, expectedScale);
        assert.equal(canvas.width, 1280);
        assert.equal(canvas.height, 720);
        assert.equal(game.scale.width, 1280);
        assert.equal(game.scale.height, 720);
        const bounds = canvas.getBoundingClientRect();
        for (const offset of [bounds.left, bounds.top]) {
            assert.ok(Math.abs(offset * window.devicePixelRatio - Math.round(offset * window.devicePixelRatio)) < 0.0001);
        }
        assert.ok(bounds.width <= window.innerWidth && bounds.height <= window.innerHeight);
    };
    try {
        cleanup = installFullscreen(game, { width: 1280, height: 720 });
        assert.equal(typeof cleanup, 'function');
        assertDisplayScale(1);
        const other = key('KeyA'); await document.dispatch('keydown', other);
        assert.equal(other.prevented, false); assert.equal(enters, 0);
        const modified = Object.assign(key(), { ctrlKey: true });
        await document.dispatch('keydown', modified);
        assert.equal(modified.prevented, false); assert.equal(enters, 0);
        const first = key(); await document.dispatch('keydown', first);
        assert.equal(first.prevented, true); assert.equal(enters, 1);
        assert.equal(document.fullscreenElement, parent);
        assertDisplayScale(1.5); // Fullscreen must enlarge even when only a fractional scale fits.
        assert.equal(canvas.getBoundingClientRect().width, 1920);
        assert.equal(canvas.getBoundingClientRect().height, 1080);
        await document.dispatch('keydown', key('F11', true));
        assert.equal(exits, 0);
        await document.dispatch('keydown', key());
        assert.equal(exits, 1); assert.equal(document.fullscreenElement, null);
        assertDisplayScale(1); // Restore the ordinary window sizing.

        Object.assign(window, { innerWidth: 2560, innerHeight: 1440 });
        await window.dispatch('resize');
        await document.dispatch('keydown', key());
        assertDisplayScale(2);
        Object.assign(window, { innerWidth: 3840, innerHeight: 2160 });
        await window.dispatch('resize'); assertDisplayScale(3);
        Object.assign(window, { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1.5 });
        await window.dispatch('resize'); assertDisplayScale(2.25);
        Object.assign(window, { innerWidth: 1536, innerHeight: 864, devicePixelRatio: 1.25 });
        await window.dispatch('resize'); assertDisplayScale(1.5);
        Object.assign(window, { innerWidth: 2560, innerHeight: 1080, devicePixelRatio: 1 });
        await window.dispatch('resize'); assertDisplayScale(1.5);
        assert.equal(canvas.getBoundingClientRect().width, 1920);
        assert.equal(canvas.getBoundingClientRect().left, 320);
        assert.equal(domContainer.style.marginLeft, canvas.style.marginLeft);
        assert.equal(domContainer.style.marginTop, canvas.style.marginTop);
        document.fullscreenElement = null; // Escape also restores the normal state.
        await document.dispatch('fullscreenchange');
        assertDisplayScale(1);

        rejectNext = true;
        const originalWarn = console.warn;
        const warnings = [];
        try {
            console.warn = (...args) => warnings.push(args);
            await document.dispatch('keydown', key());
        } finally { console.warn = originalWarn; }
        assert.equal(warnings.length, 1);
        assert.equal(document.fullscreenElement, null);
        await document.dispatch('keydown', key());
        assert.equal(document.fullscreenElement, parent); // A denied request must remain retryable.
        cleanup(); cleanup = null;
        assert.equal(window.listenerCount, 0);
        assert.equal(document.listenerCount, 0);
        assert.equal(scaleEvents.listenerCount, 0);
        const before = enters;
        await document.dispatch('keydown', key());
        assert.equal(enters, before);
        console.log('PASS: F11 toggle, fixed resolution, fullscreen fit scaling and restored normal zoom, DPR alignment, Escape, failed request retry and cleanup');
    } finally {
        cleanup?.();
        global.window = previousWindow;
        global.document = previousDocument;
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
