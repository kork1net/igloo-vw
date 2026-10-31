const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID, scrypt, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const deriveKey = promisify(scrypt);
const hashOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const { starterColors } = require('../shared/registration.json');
const adminNames = new Set(require('./admins.json').map(name => name.normalize('NFKC').toLowerCase()));
function publicUser(user) {
    return { id: user.id, username: user.username, gender: user.gender === 'female' ? 'female' : 'male', starterColor: user.starterColor || starterColors[0],
        isAdmin: adminNames.has(user.username.normalize('NFKC').toLowerCase()) };
}

class AccountError extends Error {}

class Accounts {
    constructor(filename = path.join(__dirname, 'data/accounts.json')) {
        this.filename = filename;
        this.users = new Map();
        this.sessions = new Map();
        this.attempts = new Map();
        if (fs.existsSync(filename)) {
            const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
            for (const user of data.users) this.users.set(user.key, user);
        }
    }

    credentials(data) {
        if (!data || typeof data.username !== 'string' || typeof data.password !== 'string') {
            throw new AccountError('יש להזין שם משתמש וסיסמה.');
        }
        const username = data.username.normalize('NFKC').trim();
        if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(username)) {
            throw new AccountError('שם המשתמש צריך להכיל 3–20 אותיות, ספרות, מקף או קו תחתון.');
        }
        if (data.password.length < 8 || data.password.length > 128) {
            throw new AccountError('הסיסמה צריכה להכיל 8–128 תווים.');
        }
        return { username, key: username.toLowerCase(), password: data.password };
    }

    limit(address) {
        const now = Date.now();
        for (const [key, attempt] of this.attempts) {
            if (attempt.until <= now) this.attempts.delete(key);
        }
        const attempt = this.attempts.get(address) || { count: 0, until: now + 60000 };
        if (++attempt.count > 20) throw new AccountError('יותר מדי ניסיונות. נסו שוב בעוד דקה.');
        this.attempts.set(address, attempt);
    }

    async register(data) {
        const { username, key, password } = this.credentials(data);
        const starterColor = data.starterColor ?? starterColors[0];
        const gender = data.gender ?? 'male';
        if (!['male', 'female'].includes(gender)) throw new AccountError('יש לבחור זכר או נקבה.');
        if (!starterColors.includes(starterColor)) throw new AccountError('יש לבחור אחד מארבעת צבעי הפתיחה.');
        if (this.users.has(key)) throw new AccountError('שם המשתמש כבר קיים. בחרו שם אחר.');
        const salt = randomBytes(16).toString('hex');
        const hash = (await deriveKey(password, salt, 64, hashOptions)).toString('hex');
        // Recheck after hashing so simultaneous registrations cannot share a name.
        if (this.users.has(key)) throw new AccountError('שם המשתמש כבר קיים. בחרו שם אחר.');
        const user = { id: randomUUID(), username, key, salt, hash, starterColor, gender };
        this.users.set(key, user);
        try {
            fs.mkdirSync(path.dirname(this.filename), { recursive: true });
            fs.writeFileSync(this.filename + '.tmp', JSON.stringify({ users: [...this.users.values()] }, null, 2));
            fs.renameSync(this.filename + '.tmp', this.filename);
        } catch (error) { this.users.delete(key); throw error; }
        return this.session(user);
    }

    async login(data) {
        const { key, password } = this.credentials(data);
        const user = this.users.get(key);
        const hash = await deriveKey(password, user?.salt || '0'.repeat(32), 64, hashOptions);
        if (!user || !timingSafeEqual(hash, Buffer.from(user.hash, 'hex'))) {
            throw new AccountError('שם המשתמש או הסיסמה שגויים.');
        }
        return this.session(user);
    }

    session(user) {
        const token = randomBytes(32).toString('hex');
        const now = Date.now();
        for (const [key, session] of this.sessions) {
            if (session.expires <= now) this.sessions.delete(key);
        }
        this.sessions.set(token, { user, expires: now + 24 * 60 * 60 * 1000 });
        return { token, user: publicUser(user) };
    }

    authenticate(token) {
        if (typeof token !== 'string') return null;
        const session = this.sessions.get(token);
        if (!session || session.expires <= Date.now()) {
            this.sessions.delete(token);
            return null;
        }
        return publicUser(session.user);
    }

    logout(token) { this.sessions.delete(token); }
}

function handleAccountSocket(socket, accounts, inventoryForUser = () => undefined) {
    for (const action of ['register', 'login']) {
        socket.on(`auth:${action}`, async (data, reply) => {
            if (typeof reply !== 'function') return;
            try {
                accounts.limit(socket.handshake.address);
                const result = await accounts[action](data);
                reply({ ok: true, ...result, inventory: inventoryForUser(result.user) });
            } catch (error) {
                if (!(error instanceof AccountError)) console.error('Account operation failed:', error.code || error.name);
                reply({ ok: false, error: error instanceof AccountError ? error.message : 'אירעה תקלה בשמירת החשבון. נסו שוב.' });
            }
        });
    }
    socket.on('auth:resume', (token, reply) => {
        if (typeof reply !== 'function') return;
        const user = accounts.authenticate(token);
        if (!user) { reply({ ok: false, error: 'החיבור פג. יש להתחבר שוב.' }); return; }
        try { reply({ ok: true, token, user, inventory: inventoryForUser(user) }); }
        catch { reply({ ok: false, error: 'לא ניתן לטעון את תיק החפצים. נסו שוב.' }); }
    });
}

module.exports = { Accounts, AccountError, handleAccountSocket };
