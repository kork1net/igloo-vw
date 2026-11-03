// Increase raster detail without changing Phaser's logical world or input scale.
export function installRenderDensity(game, { width, height }) {
    const canvas = game.canvas;
    const renderer = game.renderer;
    const wrapper = renderer?.glWrapper;
    const context = renderer?.gameContext;
    let scaleX = 1, scaleY = 1;
    let disposed = false;
    const restore = [];

    if (wrapper) {
        const onCanvas = () => {
            const framebuffer = wrapper.state.bindings.framebuffer;
            return !framebuffer || framebuffer.useCanvas;
        };
        const scaleRect = rect => {
            const x = Math.round(rect[0] * scaleX), y = Math.round(rect[1] * scaleY);
            return [x, y, Math.round((rect[0] + rect[2]) * scaleX) - x,
                Math.round((rect[1] + rect[3]) * scaleY) - y];
        };
        for (const [method, property] of [['updateViewport', 'viewport'], ['updateScissorBox', 'scissor']]) {
            const original = wrapper[method];
            wrapper[method] = function (state, force) {
                // The wrapper's own cache is already in physical pixels. A forced
                // cache restore must not scale it a second time. Texture targets
                // retain their original size, filtering and coordinate system.
                if (state !== this.state && onCanvas() && (scaleX !== 1 || scaleY !== 1)) {
                    const value = property === 'viewport' ? scaleRect(state.viewport)
                        : { ...state.scissor, box: scaleRect(state.scissor.box) };
                    state = { ...state, [property]: value };
                }
                return original.call(this, state, force);
            };
            restore.push(() => { wrapper[method] = original; });
        }
    } else if (context) {
        const original = context.setTransform;
        context.setTransform = function (...args) {
            const [a, b, c, d, e, f] = args.length === 1
                ? ['a', 'b', 'c', 'd', 'e', 'f'].map(key => args[0][key]) : args;
            return original.call(this, a * scaleX, b * scaleY, c * scaleX,
                d * scaleY, e * scaleX, f * scaleY);
        };
        restore.push(() => { context.setTransform = original; });
    }

    function update(density) {
        if (disposed || (!wrapper && !context)) return;
        density = Number.isFinite(density) ? Math.max(1, density) : 1;
        if (wrapper) {
            const limits = renderer.gl.getParameter(renderer.gl.MAX_VIEWPORT_DIMS);
            density = Math.min(density, limits[0] / width, limits[1] / height);
        }
        const pixelWidth = Math.ceil(width * density), pixelHeight = Math.ceil(height * density);
        scaleX = pixelWidth / width;
        scaleY = pixelHeight / height;
        if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
        renderer.renderNodes?.finishBatch();
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        if (wrapper) {
            renderer.drawingBufferHeight = renderer.gl.drawingBufferHeight;
            wrapper.update(renderer.baseDrawingContext.state, true);
        } else {
            // Changing a 2D canvas size resets its context state.
            context.imageSmoothingEnabled = !game.config.pixelArt;
            context.setTransform(1, 0, 0, 1, 0, 0);
        }
    }

    return {
        update,
        destroy() {
            if (disposed) return;
            update(1);
            for (const undo of restore) undo();
            disposed = true;
        }
    };
}
