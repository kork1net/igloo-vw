const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { chain } = require('./quests.cjs');
const { chains } = require('./resident-quests.cjs');
const fields = { chain: ['title', 'introduction', 'ending'],
    step: ['title', 'story', 'description', 'completion', 'reminder'] };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

class QuestEditor {
    constructor(directory = path.join(__dirname, '../shared')) {
        this.documents = [
            { filename: path.join(directory, 'leo-quests.json'), data: chain, array: false },
            { filename: path.join(directory, 'resident-quests.json'), data: chains, array: true }
        ];
    }

    read(document) {
        const value = JSON.parse(fs.readFileSync(document.filename, 'utf8'));
        return { value, revision: digest(value) };
    }

    publish(document, value) {
        if (document.array) document.data.splice(0, document.data.length, ...value);
        else { for (const key of Object.keys(document.data)) delete document.data[key]; Object.assign(document.data, value); }
    }

    list(residentId) {
        if (!['leo', 'mia', 'rani'].includes(residentId)) throw Error('תושב לא קיים.');
        return this.documents.flatMap(document => {
            const { value, revision } = this.read(document);
            this.publish(document, value);
            return (document.array ? value : [value])
                .filter(entry => entry.residentId === residentId || entry.steps.some(step => (step.residentId || entry.residentId) === residentId))
                .map(entry => ({ ...entry, level: entry.level || 1, revision }));
        });
    }

    save(residentId, request) {
        const available = this.list(residentId);
        const entry = available.find(value => value.id === request?.chainId);
        if (!entry) throw Error('השרשרת אינה שייכת לתושב הזה.');
        if (request.revision !== entry.revision) throw Error('המשימות עודכנו מאז פתיחת החלון. טענו מחדש לפני השמירה.');
        const document = this.documents.find(doc => (doc.array ? doc.data : [doc.data]).some(value => value.id === entry.id));
        const { value } = this.read(document);
        const edited = (document.array ? value : [value]).find(value => value.id === entry.id);
        const isStep = request.stepId !== undefined;
        const target = isStep ? edited.steps.find(step => step.id === request.stepId) : edited;
        if (!target) throw Error('השלב אינו קיים.');
        const allowed = fields[isStep ? 'step' : 'chain'];
        if (!request.changes || typeof request.changes !== 'object' || Array.isArray(request.changes)
            || !Object.keys(request.changes).length || Object.keys(request.changes).some(key => !allowed.includes(key))) {
            throw Error('בחרו שדות תוכן תקינים לעריכה.');
        }
        for (const [key, text] of Object.entries(request.changes)) {
            if (typeof text !== 'string' || text.length > (key === 'title' ? 120 : 6000)
                || (key !== 'reminder' && !text.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) {
                throw Error('בדקו את שדות התוכן. כותרת עד 120 תווים וטקסט עד 6,000 תווים.');
            }
            target[key] = text.trim();
        }
        const temporary = document.filename + '.' + randomUUID() + '.tmp';
        try {
            fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
            fs.renameSync(temporary, document.filename);
        } catch (error) {
            if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
            throw error;
        }
        this.publish(document, value);
        return this.list(residentId);
    }
}
module.exports = { QuestEditor };
