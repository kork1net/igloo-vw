const { randomUUID } = require('node:crypto');
const config = require('../shared/snow-catch.json');

function rewards(score, catches) {
    if (catches <= 0 || score <= 0) return { coins: 0, rankingPoints: 0 };
    return { coins: 1 + Math.floor(score / 110),
        rankingPoints: 2 + Math.floor(score / 60) };
}

class SnowRound {
    constructor(owner, clock = Date.now, random = Math.random) {
        this.id = randomUUID();
        this.owner = owner;
        this.clock = clock;
        this.startedAt = clock();
        this.elapsed = 0;
        this.x = config.width / 2;
        this.targetX = this.x;
        this.score = 0;
        this.catches = 0;
        this.hits = [];
        this.result = null;
        this.flakes = [];
        for (let at = 500; at < config.duration - 1500; at += Math.max(380, 760 - at / 100)) {
            const roll = random();
            this.flakes.push({ id: this.flakes.length, x: 24 + random() * (config.width - 48),
                at, speed: 130 + at / config.duration * 110 + random() * 35,
                type: roll < 0.12 ? 'gold' : roll < 0.34 ? 'ice' : 'snow', resolved: false });
        }
    }

    input(x) {
        this.advance();
        if (!Number.isFinite(x) || this.elapsed >= config.duration) return;
        this.targetX = Math.max(config.basketWidth / 2, Math.min(config.width - config.basketWidth / 2, x));
    }

    advance() {
        if (this.finishedEarly) return;
        const end = Math.min(config.duration, Math.max(this.elapsed, this.clock() - this.startedAt));
        // Fixed small steps prevent missing catches after a delayed timer/background tab.
        while (this.elapsed < end) {
            const next = Math.min(end, this.elapsed + 20);
            const step = config.basketSpeed * (next - this.elapsed) / 1000;
            this.x += Math.sign(this.targetX - this.x) * Math.min(step, Math.abs(this.targetX - this.x));
            for (const flake of this.flakes) {
                if (flake.resolved) continue;
                const crossing = flake.at + (config.basketY + 16) / flake.speed * 1000;
                if (crossing > next) continue;
                flake.resolved = true;
                if (Math.abs(flake.x - this.x) <= config.basketWidth / 2 + 9) {
                    // Preserve each catch identity, including ice hits at zero score.
                    // There is at most one entry per spawned item in this round.
                    this.hits.push({ id: flake.id, type: flake.type, at: next });
                    this.score = Math.max(0, this.score + config.points[flake.type]);
                    if (flake.type !== 'ice') this.catches++;
                }
            }
            this.elapsed = next;
        }
    }

    finish() {
        this.advance();
        if (this.elapsed < config.duration) this.finishedEarly = true;
    }

    snapshot() {
        this.advance();
        return { id: this.id, phase: this.finishedEarly || this.elapsed >= config.duration ? 'finished' : 'playing',
            remaining: this.finishedEarly ? 0 : Math.max(0, config.duration - this.elapsed), score: this.score,
            catches: this.catches, basketX: this.x, result: this.result,
            hits: this.hits.map(hit => ({ ...hit })),
            flakes: this.flakes.filter(flake => !flake.resolved && flake.at <= this.elapsed)
                .map(flake => ({ id: flake.id, x: flake.x,
                    y: -16 + (this.elapsed - flake.at) / 1000 * flake.speed,
                    speed: flake.speed, type: flake.type })) };
    }
}

class SnowGames {
    constructor(clock = Date.now, random = Math.random) {
        this.rounds = new Map();
        this.clock = clock;
        this.random = random;
    }
    start(userId, owner) {
        const previous = this.rounds.get(userId);
        if (previous && !previous.result) {
            if (previous.owner !== owner) throw new Error('כבר מתנהל סיבוב בחלון אחר של החשבון.');
            return previous;
        }
        const round = new SnowRound(owner, this.clock, this.random);
        this.rounds.set(userId, round);
        return round;
    }
    get(userId, owner) {
        const round = this.rounds.get(userId);
        if (!round || round.owner !== owner) throw new Error('אין סיבוב פעיל בחלון הזה.');
        return round;
    }
    cancel(userId, owner) {
        if (this.rounds.get(userId)?.owner === owner) this.rounds.delete(userId);
    }
}
module.exports = { SnowGames, SnowRound, rewards, config };
