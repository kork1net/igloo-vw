const glyphs = {
    '0': ['01110', '11011', '11011', '11011', '11011', '11011', '01110'],
    '1': ['00110', '01110', '00110', '00110', '00110', '00110', '11111'],
    '2': ['01110', '11011', '00011', '00110', '01100', '11000', '11111'],
    '3': ['11110', '00011', '00011', '01110', '00011', '00011', '11110'],
    '4': ['11011', '11011', '11011', '11111', '00011', '00011', '00011'],
    '5': ['11111', '11000', '11000', '11110', '00011', '11011', '01110'],
    '6': ['01110', '11000', '11000', '11110', '11011', '11011', '01110'],
    '7': ['11111', '00011', '00110', '00110', '01100', '01100', '01100'],
    '8': ['01110', '11011', '11011', '01110', '11011', '11011', '01110'],
    '9': ['01110', '11011', '11011', '01111', '00011', '00011', '01110'],
    ':': ['0', '1', '1', '0', '1', '1', '0'],
    ',': ['00', '00', '00', '00', '00', '01', '10']
};

// Integer pixel glyphs stay crisp without relying on an installed system font.
export function setPixelCounter(element, value) {
    if (element.pixelValue === value) return;
    element.pixelValue = value;
    const canvas = element.pixelCanvas || document.createElement('canvas');
    if (!element.pixelCanvas) {
        element.pixelCanvas = canvas;
        element.pixelLabel = element.getAttribute('aria-label') || '';
        canvas.setAttribute('aria-hidden', 'true');
        element.replaceChildren(canvas);
    }
    element.setAttribute('aria-label', `${element.pixelLabel}: ${value}`);
    canvas.textContent = value;
    const characters = [...value].map(character => glyphs[character] || glyphs[',']);
    const unit = 4;
    canvas.width = (characters.reduce((width, rows) => width + rows[0].length + 1, 0) + 1) * unit;
    canvas.height = 9 * unit;
    const context = canvas.getContext('2d');
    let offset = 1;
    for (const rows of characters) {
        rows.forEach((row, y) => [...row].forEach((pixel, x) => {
            if (pixel !== '1') return;
            context.fillStyle = '#173f80';
            context.fillRect((offset + x) * unit + 2, (y + 1) * unit + 2, unit, unit);
            context.fillStyle = '#ffffff';
            context.fillRect((offset + x) * unit, (y + 1) * unit, unit, unit);
        }));
        offset += rows[0].length + 1;
    }
}
