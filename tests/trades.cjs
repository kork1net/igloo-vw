const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { Inventories } = require('../server/inventory.cjs');
const { Trades } = require('../server/trades.cjs');
const { buildCatalog } = require('../scripts/item-catalog.cjs');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vw-trades-'));
try {
    const inventory = new Inventories(directory), catalog = buildCatalog();
    const users = [{ id: 'alice', username: 'Alice' }, { id: 'bob', username: 'Bob' }, { id: 'eve', username: 'Eve' }];
    const shirt = 'shirt/red-shirt', shoes = 'shoes/gray-shoes', extra = 'shirt/green-shirt';
    const seed = (user, items, equipped = {}) => inventory.persist(user, { ...inventory.load(user),
        items: ['body-color/white', ...items], equipped: { bodyColor: 'body-color/white', ...equipped } });
    seed(users[0], [shirt, extra], { shirt }); seed(users[1], [shoes], { shoes });
    const players = new Map(users.map(user => [user.id, { userId: user.id, username: user.username, room: 'Game' }]));
    players.set('elsewhere', { userId: 'elsewhere', username: 'Elsewhere', room: 'Shop' });
    let now = 0;
    const events = [];
    const trades = new Trades({ inventory, getCatalog: () => catalog, getPlayer: id => players.get(id),
        findUser: name => users.find(user => user.username === name), send: (id, event, data) => events.push({ id, event, data }),
        updateInventory() {}, now: () => now });
    assert.throws(() => trades.request('alice', 'alice'));
    assert.throws(() => trades.request('alice', 'elsewhere'));
    let id = trades.request('alice', 'bob');
    assert.throws(() => trades.request('eve', 'bob'));
    assert.throws(() => trades.respond('alice', { id, accept: true }));
    assert.throws(() => trades.respond('eve', { id, accept: true }));
    trades.respond('bob', { id, accept: false });
    assert.equal(trades.sessions.size, 0);
    id = trades.request('alice', 'bob'); now += 30001; trades.expire();
    assert.equal(trades.sessions.size, 0);
    id = trades.request('alice', 'bob'); trades.respond('bob', { id, accept: true });
    let session = trades.sessions.get(id);
    assert.throws(() => trades.offer('alice', { id, revision: session.revision, items: ['body-color/white'] }));
    assert.throws(() => trades.offer('alice', { id, revision: session.revision, items: [shoes] }));
    assert.throws(() => trades.offer('alice', { id, revision: session.revision, items: [shirt, shirt] }));
    trades.offer('alice', { id, revision: session.revision, items: [shirt] });
    trades.offer('bob', { id, revision: session.revision, items: [shoes] });
    const oldRevision = session.revision;
    trades.confirm('alice', { id, revision: oldRevision, accept: true });
    trades.offer('alice', { id, revision: oldRevision, items: [shirt, extra] });
    assert.deepEqual(session.ready, [false, false]);
    assert.throws(() => trades.confirm('bob', { id, revision: oldRevision, accept: true }));
    trades.offer('alice', { id, revision: session.revision, items: [shirt] });
    trades.confirm('alice', { id, revision: session.revision, accept: true });
    trades.confirm('bob', { id, revision: session.revision, accept: true });
    assert.equal(trades.sessions.size, 0);
    assert.throws(() => trades.confirm('bob', { id, revision: session.revision, accept: true }));
    const a = inventory.snapshot(users[0], catalog), b = inventory.snapshot(users[1], catalog);
    assert.ok(a.items.includes(shoes) && !a.items.includes(shirt));
    assert.ok(b.items.includes(shirt) && !b.items.includes(shoes));
    assert.equal(a.equipped.shirt, null); assert.equal(b.equipped.shoes, null);
    assert.ok(events.some(event => event.event === 'trade:closed' && event.data.completed));
    const rename = fs.renameSync;
    let failed = false;
    try {
        fs.renameSync = (from, to) => {
            if (to === inventory.filename(users[1]) && !failed) { failed = true; throw Error('Disk failure'); }
            return rename(from, to);
        };
        assert.throws(() => inventory.exchange(users.slice(0, 2), [[shoes], [shirt]], catalog, 'failed-trade-001'));
    } finally { fs.renameSync = rename; }
    assert.deepEqual(inventory.snapshot(users[0], catalog), a);
    assert.deepEqual(new Inventories(directory).snapshot(users[1], catalog), b);
    const before = users.slice(0, 2).map(user => inventory.load(user));
    const after = before.map((profile, index) => ({ ...profile, currency: profile.currency + index + 1 }));
    const journal = { phase: 'prepared', users: users.slice(0, 2), before, after };
    const journalFile = path.join(directory, 'trade-transactions/crash.json');
    fs.writeFileSync(journalFile, JSON.stringify(journal)); inventory.writeTradeProfile(users[0], after[0]);
    assert.equal(new Inventories(directory).load(users[0]).currency, before[0].currency);
    fs.writeFileSync(journalFile, JSON.stringify({ ...journal, phase: 'committed' }));
    const recovered = new Inventories(directory);
    assert.equal(recovered.load(users[0]).currency, after[0].currency);
    assert.equal(recovered.load(users[1]).currency, after[1].currency);
    id = trades.request('alice', 'bob'); trades.cancelForSocket('alice');
    assert.equal(trades.sessions.size, 0);
    console.log('PASS: invitations, decline/expiry, authorization, ownership, starter protection, approval reset, stale approvals, exchange, unequip, duplicate commits, disconnect and atomic crash recovery');
    const admin = { id: 'admin', username: 'Koko', isAdmin: true };
    users.push(admin); players.set('admin', { userId: admin.id, username: admin.username, room: 'Game' });
    id = trades.request('admin', 'bob'); trades.respond('bob', { id, accept: true });
    session = trades.sessions.get(id);
    trades.offer('admin', { id, revision: session.revision, items: [shirt] });
    trades.confirm('admin', { id, revision: session.revision, accept: true });
    trades.confirm('bob', { id, revision: session.revision, accept: true });
    id = trades.request('admin', 'bob'); trades.respond('bob', { id, accept: true });
    session = trades.sessions.get(id);
    trades.offer('admin', { id, revision: session.revision, items: Array(6).fill(shirt) });
    const view = trades.view(session, 0);
    assert.equal(view.unlimitedItems, true);
    assert.equal(view.available.length, catalog.items.length);
    assert.ok(view.available.includes(shirt) && view.available.includes('body-color/white'));
    assert.equal(view.quantities[shirt], null);
    trades.cancel('admin', id);
    console.log('PASS: admin trade inventory retains every catalog item and unlimited copies after gifting and offering six copies');
} finally {
    const resolved = fs.realpathSync(directory);
    assert.equal(path.dirname(resolved).toLowerCase(), fs.realpathSync(os.tmpdir()).toLowerCase());
    assert.ok(path.basename(resolved).startsWith('vw-trades-'));
    fs.rmSync(resolved, { recursive: true });
}
