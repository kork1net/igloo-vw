import { installRenderDensity } from './RenderDensity.js';
import { installTextDensity } from './TextDensity.js';

// Keep world dimensions fixed while matching fullscreen raster detail to the display.
export function installFullscreen(game, { width, height }) {
    const canvas = game.canvas;
    const parent = canvas.parentElement;
    const renderDensity = installRenderDensity(game, { width, height });
    const textDensity = installTextDensity(game);
    let pending = false;
    let disposed = false;

    function alignCanvas() {
        if (disposed) return;
        const dpr = window.devicePixelRatio || 1;
        const bounds = parent.getBoundingClientRect();
        const display = canvas.getBoundingClientRect();
        // Phaser centers in whole CSS pixels. At fractional Windows scaling that
        // can land between device pixels, so align the canvas origin as well.
        canvas.style.marginLeft = `${Math.round((bounds.left + (bounds.width - display.width) / 2) * dpr) / dpr - bounds.left}px`;
        canvas.style.marginTop = `${Math.round((bounds.top + (bounds.height - display.height) / 2) * dpr) / dpr - bounds.top}px`;
        if (game.domContainer) {
            game.domContainer.style.marginLeft = canvas.style.marginLeft;
            game.domContainer.style.marginTop = canvas.style.marginTop;
        }
        game.scale.updateBounds();
    }

    function updateDisplay() {
        if (disposed) return;
        const dpr = window.devicePixelRatio || 1;
        const bounds = parent.getBoundingClientRect();
        const fitScale = Math.min(bounds.width / width, bounds.height / height);
        const physicalScale = fitScale * dpr;
        if (physicalScale <= 0) return;
        const sharpScale = physicalScale >= 1
            ? Math.floor(physicalScale + 1e-8) : 1 / Math.ceil(1 / physicalScale);
        game.scale.getParentBounds();
        // Fullscreen must grow even when the available space is between integer
        // scales (for example, 1.5x on a 1920x1080 screen). Keep the existing
        // sharp sizing in the normal window and restore it when fullscreen ends.
        const fullscreen = document.fullscreenElement === parent;
        game.scale.setZoom(fullscreen ? fitScale : sharpScale / dpr);
        renderDensity.update(fullscreen ? physicalScale : 1);
        textDensity.update(fullscreen ? physicalScale : 1);
        canvas.style.imageRendering = 'pixelated';
    }

    async function toggleFullscreen(event) {
        if (event.key !== 'F11' || event.ctrlKey || event.altKey || event.metaKey) return;
        // Leave the browser's normal shortcut available if the API is unsupported.
        if (!parent.requestFullscreen || !document.exitFullscreen) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat || pending) return;
        pending = true;
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            // Include Phaser's HTML input and every native game window.
            else await parent.requestFullscreen();
        } catch (error) {
            console.warn('Unable to toggle game fullscreen.', error);
        } finally {
            pending = false;
            updateDisplay();
        }
    }

    // Also run after Phaser's own resize/fullscreen callbacks so input bounds,
    // HTML chat and the decorative frame all follow the same canvas position.
    game.scale.on('resize', alignCanvas);
    document.addEventListener('keydown', toggleFullscreen, true);
    window.addEventListener('resize', updateDisplay);
    document.addEventListener('fullscreenchange', updateDisplay);
    updateDisplay();

    return () => {
        disposed = true;
        game.scale.off('resize', alignCanvas);
        document.removeEventListener('keydown', toggleFullscreen, true);
        window.removeEventListener('resize', updateDisplay);
        document.removeEventListener('fullscreenchange', updateDisplay);
        textDensity.destroy();
        renderDensity.destroy();
    };
}
