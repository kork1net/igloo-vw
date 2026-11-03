const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

(async () => {
    const { installRenderDensity } = await import('../src/game/ui/RenderDensity.js');
    const { installTextDensity } = await import('../src/game/ui/TextDensity.js');
    const canvas = { width: 1280, height: 720 };
    const canvasFramebuffer = { useCanvas: true };
    const wrapper = {
        state: { bindings: { framebuffer: canvasFramebuffer }, viewport: [0, 0, 1280, 720],
            scissor: { box: [0, 0, 1280, 720] } },
        updateViewport(state) { this.state.viewport = [...state.viewport]; },
        updateScissorBox(state) { this.state.scissor.box = [...state.scissor.box]; },
        update(state, force) {
            if (state.bindings) this.state.bindings = { ...state.bindings };
            if (state.viewport) this.updateViewport(state, force);
            if (state.scissor?.box) this.updateScissorBox(state, force);
        }
    };
    const originalViewport = wrapper.updateViewport, originalScissor = wrapper.updateScissorBox;
    const logicalState = { bindings: { framebuffer: canvasFramebuffer },
        viewport: [0, 0, 1280, 720], scissor: { box: [0, 0, 1280, 720] } };
    const game = { canvas, renderer: { width: 1280, height: 720, glWrapper: wrapper,
        baseDrawingContext: { state: logicalState },
        gl: { MAX_VIEWPORT_DIMS: 1, getParameter() { return [8192, 8192]; },
            get drawingBufferHeight() { return canvas.height; } } } };
    const adapter = installRenderDensity(game, { width: 1280, height: 720 });
    adapter.update(1.5);
    assert.deepEqual([canvas.width, canvas.height], [1920, 1080]);
    assert.deepEqual([game.renderer.width, game.renderer.height], [1280, 720]);
    assert.deepEqual(wrapper.state.viewport, [0, 0, 1920, 1080]);
    assert.deepEqual(wrapper.state.scissor.box, [0, 0, 1920, 1080]);
    assert.deepEqual(logicalState.viewport, [0, 0, 1280, 720]);
    assert.deepEqual(logicalState.scissor.box, [0, 0, 1280, 720]);

    // Partial viewport and scissor updates target the currently bound framebuffer.
    const partial = { viewport: [10, 20, 200, 100], scissor: { box: [10, 20, 200, 100] } };
    wrapper.update(partial);
    assert.deepEqual(wrapper.state.viewport, [15, 30, 300, 150]);
    assert.deepEqual(wrapper.state.scissor.box, [15, 30, 300, 150]);
    assert.deepEqual(partial.viewport, [10, 20, 200, 100]);
    wrapper.update(wrapper.state, true);
    assert.deepEqual(wrapper.state.viewport, [15, 30, 300, 150], 'Physical cache must not scale twice');

    const textureFramebuffer = { useCanvas: false };
    wrapper.update({ ...partial, bindings: { framebuffer: textureFramebuffer } });
    assert.deepEqual(wrapper.state.viewport, [10, 20, 200, 100]);
    assert.deepEqual(wrapper.state.scissor.box, [10, 20, 200, 100]);
    wrapper.update({ bindings: { framebuffer: canvasFramebuffer } });
    wrapper.updateViewport({ viewport: [10, 20, 200, 100] });
    wrapper.updateScissorBox({ scissor: { box: [10, 20, 200, 100] } });
    assert.deepEqual(wrapper.state.viewport, [15, 30, 300, 150]);
    assert.deepEqual(wrapper.state.scissor.box, [15, 30, 300, 150]);
    adapter.update(1);
    assert.deepEqual([canvas.width, canvas.height], [1280, 720]);
    adapter.update(2);
    adapter.destroy();
    assert.deepEqual([canvas.width, canvas.height], [1280, 720]);
    assert.equal(wrapper.updateViewport, originalViewport);
    assert.equal(wrapper.updateScissorBox, originalScissor);
    adapter.update(3);
    assert.equal(canvas.width, 1280, 'Disposed adapter must not change the canvas');

    let transform;
    const context = { setTransform(...args) { transform = args; } };
    const originalTransform = context.setTransform;
    const canvasGame = { canvas: { width: 1280, height: 720 }, config: { pixelArt: true },
        renderer: { gameContext: context } };
    const canvasAdapter = installRenderDensity(canvasGame, { width: 1280, height: 720 });
    canvasAdapter.update(1.5);
    assert.deepEqual([canvasGame.canvas.width, canvasGame.canvas.height], [1920, 1080]);
    assert.equal(context.imageSmoothingEnabled, false);
    context.setTransform(1, 2, 3, 4, 5, 6);
    assert.deepEqual(transform, [1.5, 3, 4.5, 6, 7.5, 9]);
    context.setTransform({ a: 1, b: 0, c: 0, d: 1, e: 10, f: 20 });
    assert.deepEqual(transform, [1.5, 0, 0, 1.5, 15, 30]);
    canvasAdapter.destroy();
    assert.equal(context.setTransform, originalTransform);
    assert.deepEqual([canvasGame.canvas.width, canvasGame.canvas.height], [1280, 720]);

    const makeText = (resolution = 2, filter = 1) => {
        const text = { type: 'Text', scene: {}, x: 100, y: 200, width: 80, height: 24,
            style: { resolution }, frame: { source: { scaleMode: filter } },
            setResolution(value) { this.style.resolution = value; } };
        text.texture = { setFilter(value) { text.frame.source.scaleMode = value; } };
        return text;
    };
    const events = new EventEmitter(), text = makeText();
    const sprite = { type: 'Sprite', frame: { source: { scaleMode: 1 } },
        texture: { setFilter() { throw new Error('Pixel-art sprite filter must remain unchanged'); } } };
    const children = [sprite, { type: 'Container', list: [text] }];
    const textGame = { events, scene: { getScenes() { return [{ children: { list: children } }]; } } };
    const textDensity = installTextDensity(textGame);
    textDensity.update(1.5);
    events.emit('prerender');
    assert.equal(text.style.resolution, 2);
    assert.equal(text.frame.source.scaleMode, 0);
    assert.deepEqual([text.x, text.y, text.width, text.height], [100, 200, 80, 24]);
    const freshText = makeText(1, 1);
    children[1].list.push(freshText);
    textDensity.update(2.5);
    events.emit('prerender');
    assert.equal(text.style.resolution, 3);
    assert.equal(freshText.style.resolution, 3);
    assert.equal(freshText.frame.source.scaleMode, 0);
    const destroyed = makeText();
    children[1].list.push(destroyed);
    events.emit('prerender');
    destroyed.scene = null;
    children[1].list.pop();
    events.emit('prerender');
    textDensity.update(1);
    assert.equal(text.style.resolution, 2);
    assert.equal(freshText.style.resolution, 1);
    assert.equal(text.frame.source.scaleMode, 1);
    assert.equal(freshText.frame.source.scaleMode, 1);
    assert.equal(sprite.frame.source.scaleMode, 1);
    textDensity.update(2.5);
    events.emit('prerender');
    textDensity.destroy();
    assert.equal(text.style.resolution, 2);
    assert.equal(text.frame.source.scaleMode, 1);
    assert.equal(events.listenerCount('prerender'), 0);
    console.log('PASS: native backing density, logical coordinates, framebuffer isolation, partial/cache state, Canvas fallback, nested/new text, sprite filters and cleanup');
})().catch(error => { console.error(error); process.exitCode = 1; });
