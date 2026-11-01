// Decoration stays inside the window trim and moves with the modal container.
export function addInventoryBackdrop(scene, panel, centerX, centerY) {
    const art = scene.add.graphics();
    panel.add(art);
    const left = centerX - 414;
    const top = centerY - 294;

    // Stepped ice shading rather than a smooth gradient or a stretched texture.
    const shades = [0x9bc4df, 0x94bddb, 0x8bb5d5, 0x83adce, 0x7da6c8, 0x769fc2];
    shades.forEach((color, index) => {
        art.fillStyle(color, 1);
        art.fillRect(left, top + index * 98, 828, 98);
    });

    return art;
}
