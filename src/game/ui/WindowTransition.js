const reducedMotion = () => typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function openWindow(scene, panel, overlay, animate = true) {
    panel.windowOverlay = overlay;
    panel.once('destroy', () => panel.windowTween?.stop());
    if (!animate || reducedMotion()) return;
    panel.y = -scene.scale.height;
    overlay.y = scene.scale.height / 2 - panel.y;
    panel.windowTween = scene.tweens.add({
        targets: panel, y: 0, duration: 380, ease: 'Back.Out',
        onUpdate: () => { overlay.y = scene.scale.height / 2 - panel.y; }
    });
}

export function closeWindow(scene, panel, animate = true) {
    if (!panel || panel.windowClosing) return;
    panel.windowClosing = true;
    panel.windowTween?.stop();
    if (!animate || !scene.sys.isActive() || reducedMotion()) {
        panel.destroy();
        return;
    }
    // The backdrop stays in place and blocks clicks until the window has left.
    for (const child of panel.list) {
        if (child !== panel.windowOverlay) child.disableInteractive();
    }
    panel.windowTween = scene.tweens.add({
        targets: panel, y: scene.scale.height, duration: 280, ease: 'Back.In',
        onUpdate: () => {
            if (panel.windowOverlay) panel.windowOverlay.y = scene.scale.height / 2 - panel.y;
        },
        onComplete: () => panel.destroy()
    });
}

export function openHtmlWindow(overlay) {
    // Scroll the contents rather than the frame, so corner buttons can protrude.
    const dialog = overlay.querySelector('[role="dialog"]');
    if (!dialog.querySelector(':scope > .window-content')) {
        const content = document.createElement('div');
        content.className = 'window-content';
        for (const child of [...dialog.childNodes]) {
            if (child.nodeType !== 1 || !child.classList.contains('resident-close')) content.append(child);
        }
        dialog.append(content);
    }
    if (reducedMotion()) return;
    overlay.windowAnimation = overlay.querySelector('[role="dialog"]').animate([
        { transform: 'translateY(-100vh)' },
        { transform: 'translateY(12px)', offset: 0.8 },
        { transform: 'translateY(0)' }
    ], { duration: 380, easing: 'ease-out' });
}

export function closeHtmlWindow(overlay, onComplete, animate = true) {
    const finish = () => {
        if (overlay.windowClosed) return;
        overlay.windowClosed = true;
        overlay.remove();
        onComplete();
    };
    if (!animate || reducedMotion()) {
        overlay.windowAnimation?.cancel();
        finish();
        return;
    }
    if (overlay.windowClosing) return;
    overlay.windowClosing = true;
    const dialog = overlay.querySelector('[role="dialog"]');
    const from = getComputedStyle(dialog).transform;
    overlay.windowAnimation?.cancel();
    dialog.inert = true;
    overlay.windowAnimation = dialog.animate([
        { transform: from },
        { transform: 'translateY(-8px)', offset: 0.2 },
        { transform: 'translateY(100vh)' }
    ], { duration: 280, easing: 'ease-in', fill: 'forwards' });
    overlay.windowAnimation.onfinish = finish;
}
