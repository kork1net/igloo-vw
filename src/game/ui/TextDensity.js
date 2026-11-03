// Text uses smooth high-resolution glyphs; sprite sheets retain nearest filtering.
export function installTextDensity(game) {
    const originals = new Map();
    let density = 1;

    function restore(text, original) {
        if (!text.scene) return;
        if (text.style.resolution !== original.resolution) text.setResolution(original.resolution);
        text.texture.setFilter(original.filter);
    }

    function visit(children) {
        for (const child of children) {
            if (child.type === 'Text' && child.setResolution) {
                if (!originals.has(child)) originals.set(child, {
                    resolution: child.style.resolution,
                    filter: child.frame.source.scaleMode
                });
                const original = originals.get(child);
                const resolution = Math.max(original.resolution, Math.ceil(density));
                if (child.style.resolution !== resolution) child.setResolution(resolution);
                // Phaser's LINEAR filter is 0. Apply it only to each text texture.
                if (child.frame.source.scaleMode !== 0) child.texture.setFilter(0);
            } else if (Array.isArray(child.list)) visit(child.list);
        }
    }

    function beforeRender() {
        if (density <= 1) return;
        for (const text of originals.keys()) if (!text.scene) originals.delete(text);
        for (const scene of game.scene.getScenes(true)) visit(scene.children.list);
    }

    game.events?.on('prerender', beforeRender);
    return {
        update(value) {
            density = value;
            if (density > 1) return;
            for (const [text, original] of originals) restore(text, original);
            originals.clear();
        },
        destroy() {
            game.events?.off('prerender', beforeRender);
            for (const [text, original] of originals) restore(text, original);
            originals.clear();
        }
    };
}
