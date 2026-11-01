// The trim is painted OUTSIDE the canvas, leaving every map pixel unobscured.
export function addGameFrame(scene) {
    const canvas = scene.game.canvas;
    const parent = canvas.parentElement;
    const frame = document.createElement('div');
    frame.className = 'game-screen-frame';
    frame.setAttribute('aria-hidden', 'true');
    parent.append(frame);
    const update = () => {
        const bounds = canvas.getBoundingClientRect();
        const origin = parent.getBoundingClientRect();
        Object.assign(frame.style, {
            left: `${bounds.left - origin.left + parent.scrollLeft - parent.clientLeft}px`,
            top: `${bounds.top - origin.top + parent.scrollTop - parent.clientTop}px`,
            width: `${bounds.width}px`, height: `${bounds.height}px`
        });
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(canvas);
    window.addEventListener('resize', update);
    document.addEventListener('fullscreenchange', update);
    scene.scale.on('resize', update);
    scene.game.events.once('postrender', update);
    update();
    scene.events.once('shutdown', () => {
        observer?.disconnect();
        window.removeEventListener('resize', update);
        document.removeEventListener('fullscreenchange', update);
        scene.scale.off('resize', update);
        scene.game.events.off('postrender', update);
        frame.remove();
    });
    return frame;
}
