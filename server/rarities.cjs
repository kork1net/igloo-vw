const fs = require('node:fs');
const path = require('node:path');
const grades = ['C', 'B', 'A', 'S'];

class Rarities {
    constructor(filename = path.join(__dirname, 'data/item-rarities.json')) {
        this.filename = filename;
        this.values = fs.existsSync(filename) ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
    }

    snapshot() {
        return Object.fromEntries(Object.entries(this.values).filter(([, grade]) => grades.includes(grade)));
    }

    set(itemId, grade, catalog) {
        if (!grades.includes(grade) || !catalog.items.some(item => item.id === itemId)) {
            throw new Error('פריט או דרגת נדירות לא תקינים.');
        }
        const next = { ...this.values, [itemId]: grade };
        fs.mkdirSync(path.dirname(this.filename), { recursive: true });
        fs.writeFileSync(this.filename + '.tmp', JSON.stringify(next, null, 2));
        fs.renameSync(this.filename + '.tmp', this.filename);
        this.values = next;
        return this.snapshot();
    }
}

module.exports = { Rarities };
