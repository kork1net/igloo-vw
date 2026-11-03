import { adminStyle } from '../ui/AdminStyle';

// The same bubble renderer is used by local and remote players.
export function showChatMessage(owner, message) {
    if (typeof message !== 'string') return;
    const text = message.trim().slice(0, 100);
    if (!text) return;

    if (!owner.chatCleanupRegistered) {
        owner.container.once('destroy', () => clearChatMessage(owner));
        owner.chatCleanupRegistered = true;
    }

    clearChatMessage(owner);
    const isAdmin = owner.adminBadge?.visible === true;

    const bubbleText = owner.scene.add.text(0, 0, text, {
        fontFamily: 'Rubik, Arial, sans-serif', resolution: 2,
        fontSize: '16px',
        color: isAdmin ? adminStyle.text : '#17324d',
        align: 'center',
        wordWrap: { width: 200, useAdvancedWrap: true }
    }).setOrigin(0.5);

    const bubbleWidth = Math.ceil((bubbleText.width + 28) / 2) * 2;
    const bubbleHeight = Math.ceil((bubbleText.height + 20) / 2) * 2;

    const bubbleBackground = owner.scene.add.graphics();
    const fillColor = isAdmin ? adminStyle.bubbleFill : owner.chatBubbleFill ?? 0xffffff;
    const borderColor = isAdmin ? adminStyle.color : owner.chatBubbleBorder ?? 0x8db7d7;

    bubbleBackground.fillStyle(fillColor, 0.96);
    bubbleBackground.lineStyle(2, borderColor, 1);

    bubbleBackground.fillRoundedRect(
        -bubbleWidth / 2,
        -bubbleHeight / 2,
        bubbleWidth,
        bubbleHeight,
        12
    );

    if (isAdmin) {
        // One-pixel gradient bands keep the same rounded silhouette in both renderers.
        const radius = 12;
        for (let y = 0; y < bubbleHeight; y++) {
            const t = y / (bubbleHeight - 1);
            const channel = shift => Math.round(
                ((adminStyle.bubbleFill >> shift) & 255) * (1 - t)
                + ((adminStyle.bubbleFillBottom >> shift) & 255) * t);
            const color = (channel(16) << 16) | (channel(8) << 8) | channel(0);
            const edge = Math.min(y + 0.5, bubbleHeight - y - 0.5);
            const inset = edge < radius
                ? radius - Math.sqrt(radius * radius - (radius - edge) ** 2) : 0;
            bubbleBackground.fillStyle(color, 0.96);
            bubbleBackground.fillRect(-bubbleWidth / 2 + inset,
                -bubbleHeight / 2 + y, bubbleWidth - inset * 2, 1);
        }
    }

    bubbleBackground.strokeRoundedRect(
        -bubbleWidth / 2,
        -bubbleHeight / 2,
        bubbleWidth,
        bubbleHeight,
        12
    );

    // Speech bubble tail matches the bottom of the gradient.
    bubbleBackground.fillStyle(isAdmin ? adminStyle.bubbleFillBottom : fillColor, 0.96);
    bubbleBackground.fillTriangle(
        -8, bubbleHeight / 2 - 1,
        8, bubbleHeight / 2 - 1,
        0, bubbleHeight / 2 + 12
    );
    // Outline only the exposed sides, keeping the tail joined to the bubble.
    bubbleBackground.beginPath();
    bubbleBackground.moveTo(-8, bubbleHeight / 2);
    bubbleBackground.lineTo(0, bubbleHeight / 2 + 12);
    bubbleBackground.lineTo(8, bubbleHeight / 2);
    bubbleBackground.strokePath();

    // Position above the player
    const bubbleY = -(owner.chatBubbleTop ?? 73) - bubbleHeight / 2;
    owner.bubbleOffsetY = bubbleY;

    owner.chatBubble = owner.scene.add.container(
        Math.round(owner.container.x),
        Math.round(owner.container.y + bubbleY),
        [bubbleBackground, bubbleText]
    );

    owner.chatBubble.setDepth(20);

    // Automatically hide after 4 seconds
    owner.chatTimer = owner.scene.time.delayedCall(4000, () => {
        if (owner.chatBubble) {
            owner.chatBubble.destroy();
            owner.chatBubble = null;
        }

        owner.chatTimer = null;
    });
}

export function updateChatMessage(owner) {
    if (!owner.chatBubble) return;
    owner.chatBubble.setPosition(
        Math.round(owner.container.x),
        Math.round(owner.container.y + owner.bubbleOffsetY)
    );
}

export function clearChatMessage(owner) {
    owner.chatTimer?.remove();
    owner.chatTimer = null;
    owner.chatBubble?.destroy();
    owner.chatBubble = null;
}
