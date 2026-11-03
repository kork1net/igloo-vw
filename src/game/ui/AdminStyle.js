// Shared administrator colors. Change these here to update every player.
export const adminStyle = {
    color: 0x173f80,
    text: '#173f80',
    bubbleFill: 0xd8efff,
    bubbleFillBottom: 0x79b8f0
};

// Rebuild only when the glyph canvas changes size/density (including fullscreen).
export function stylePlayerName(text, isAdmin) {
    text.adminName = isAdmin === true;
    if (!text.refreshAdminName) {
        let previous;
        text.refreshAdminName = () => {
            const state = `${text.adminName}:${text.height}:${text.style.resolution}`;
            if (state === previous) return;
            previous = state;
            if (!text.adminName) { text.setColor('#17324d'); return; }
            const gradient = text.context.createLinearGradient(0, 0, 0,
                Math.max(1, text.height * text.style.resolution));
            gradient.addColorStop(0, adminStyle.text);
            gradient.addColorStop(0.45, '#387bc4');
            gradient.addColorStop(1, '#79b8f0');
            text.setFill(gradient);
        };
        const events = text.scene.events;
        events.on('prerender', text.refreshAdminName);
        text.once('destroy', () => events.off('prerender', text.refreshAdminName));
    }
    text.refreshAdminName();
}
