const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { QuestEditor } = require('../server/quest-editor.cjs');
const { chains } = require('../server/resident-quests.cjs');
const { chain } = require('../server/quests.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-quest-editor-'));
const originals = {};
try {
    for (const file of ['leo-quests.json', 'resident-quests.json']) {
        originals[file] = fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8');
        fs.writeFileSync(path.join(directory, file), originals[file]);
    }
    const editor = new QuestEditor(directory);
    assert.throws(() => editor.list('__proto__'));
    const quests = editor.list('leo');
    const delivery = quests.find(chain => chain.id === 'lost-delivery');
    assert.equal(delivery.steps.length, 3);
    assert.ok(editor.list('rani').some(chain => chain.id === 'lost-delivery'), 'Cross-resident chains included');
    const request = { chainId: delivery.id, stepId: 'parcels', revision: delivery.revision,
        changes: { title: 'Edited title', story: '<b>Plain text</b> {username}' } };
    assert.throws(() => editor.save('mia', request));
    assert.throws(() => editor.save('leo', { ...request, changes: { target: 1 } }));
    assert.throws(() => editor.save('leo', { ...request, changes: { id: 'changed' } }));
    assert.throws(() => editor.save('leo', { ...request, changes: { title: '' } }));
    assert.throws(() => editor.save('leo', { ...request, changes: { story: 'x'.repeat(6001) } }));
    const updated = editor.save('leo', request).find(chain => chain.id === delivery.id);
    assert.equal(updated.steps[0].title, 'Edited title');
    assert.equal(chains.find(chain => chain.id === delivery.id).steps[0].title, 'Edited title');
    assert.equal(updated.steps[0].target, delivery.steps[0].target);
    assert.notEqual(updated.revision, delivery.revision);
    assert.throws(() => editor.save('leo', request), /עודכנו/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'resident-quests.json')))[0].steps[0].title, 'Edited title');
    const tutorial = editor.list('leo').find(value => value.id === 'leo-welcome');
    editor.save('leo', { chainId: tutorial.id, revision: tutorial.revision, changes: { introduction: 'New introduction' } });
    assert.equal(chain.introduction, 'New introduction');
    // A failed disk replacement must not publish uncommitted edits.
    const current = editor.list('leo').find(value => value.id === delivery.id);
    const rename = fs.renameSync;
    try {
        fs.renameSync = () => { throw Error('disk failure'); };
        assert.throws(() => editor.save('leo', { ...request, revision: current.revision, changes: { title: 'Must not publish' } }), /disk failure/);
    } finally { fs.renameSync = rename; }
    assert.equal(chains.find(chain => chain.id === delivery.id).steps[0].title, 'Edited title');
    assert.equal(fs.readdirSync(directory).filter(file => file.endsWith('.tmp')).length, 0);
    for (const [file, original] of Object.entries(originals)) {
        assert.equal(fs.readFileSync(path.join(__dirname, '../shared', file), 'utf8'), original);
    }
    console.log('PASS quest editor: full chains, text validation, live updates, atomic persistence, stale edits, no progression changes');
} finally {
    assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(directory, { recursive: true });
}
