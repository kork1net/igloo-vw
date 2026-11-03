const { randomUUID } = require('node:crypto');
const config = require('../shared/coffee-memory.json');

function coffeeRewards(score, orders) {
    return orders > 0 ? { coins: 1 + Math.floor(score / 100), rankingPoints: 2 + Math.floor(score / 60) }
        : { coins: 0, rankingPoints: 0 };
}

class CoffeeRound {
    constructor(owner, clock = Date.now, random = Math.random) {
        this.id = randomUUID(); this.owner = owner; this.clock = clock; this.random = random;
        this.startedAt = clock(); this.orders = 0; this.score = 0; this.lives = config.lives;
        this.finished = false; this.result = null; this.tickets = []; this.serial = 0; this.choices = [];
        this.feedbackId = 0; this.spawn(this.startedAt);
        this.nextArrivalAt = this.startedAt + this.difficulty(this.startedAt).interval;
    }
    difficulty(at) {
        const level = Math.floor(Math.max(0, at - this.startedAt) / config.difficultyStep);
        return { capacity: Math.min(config.maxTickets, 1 + level),
            interval: Math.max(config.minArrivalInterval, config.arrivalInterval - level * 800),
            lifetime: Math.max(config.minOrderTime, config.orderTime - level * 1500) };
    }
    spawn(at) {
        const difficulty = this.difficulty(at);
        if (this.tickets.length >= difficulty.capacity) return;
        const length = Math.min(config.maxIngredients, 2 + Math.floor(this.orders / 3));
        const ticket = { id: ++this.serial, recipe: Array.from({ length }, () =>
            config.ingredients[Math.floor(this.random() * config.ingredients.length)].id),
            expiresAt: at + difficulty.lifetime, lifetime: difficulty.lifetime };
        // Auto-delivery must not make a longer order impossible to prepare.
        const conflicts = () => this.tickets.some(other => other.recipe.length !== length
            && other.recipe.slice(0, Math.min(length, other.recipe.length))
                .every((ingredient, index) => ingredient === ticket.recipe[index]));
        if (conflicts()) {
            const pairs = config.ingredients.flatMap(a => config.ingredients.map(b => [a.id, b.id]));
            const pair = pairs.find(([a, b]) => !this.tickets.some(other => other.recipe[0] === a && other.recipe[1] === b));
            ticket.recipe[0] = pair[0]; ticket.recipe[1] = pair[1];
        }
        this.tickets.push(ticket);
    }
    feedback(type, at) { this.lastFeedback = type; this.feedbackAt = at; this.feedbackId++; }
    advance() {
        if (this.finished) return;
        const now = this.clock();
        // Process arrivals and expirations chronologically, including background tabs.
        while (!this.finished) {
            const expiry = Math.min(...this.tickets.map(ticket => ticket.expiresAt));
            const at = Math.min(expiry, this.nextArrivalAt);
            if (at > now) break;
            if (expiry <= this.nextArrivalAt) {
                const expired = this.tickets.filter(ticket => ticket.expiresAt <= at);
                this.tickets = this.tickets.filter(ticket => ticket.expiresAt > at);
                this.lives = Math.max(0, this.lives - expired.length);
                this.feedback('expired', at);
                if (!this.lives) this.finished = true;
            } else {
                this.spawn(at);
                this.nextArrivalAt = at + this.difficulty(at).interval;
            }
        }
    }
    finish() { this.advance(); this.finished = true; }
    snapshot() {
        this.advance();
        const now = this.clock();
        return { id: this.id, phase: this.finished ? 'finished' : 'prepare', score: this.score,
            orders: this.orders, lives: this.lives, choices: [...this.choices],
            tickets: this.tickets.map(ticket => ({ ...ticket, recipe: [...ticket.recipe],
                remaining: Math.max(0, ticket.expiresAt - now) })),
            nextArrival: Math.max(0, this.nextArrivalAt - now),
            feedback: now - this.feedbackAt < 1000 ? this.lastFeedback : null,
            feedbackId: this.feedbackId, result: this.result };
    }
    clear() {
        this.advance();
        if (this.finished) return;
        this.choices = [];
    }
    choose(ingredient) {
        this.advance();
        if (this.finished) return;
        if (!config.ingredients.some(entry => entry.id === ingredient)) throw new Error('מרכיב לא תקין.');
        if (this.choices.length >= config.maxIngredients) return;
        this.choices.push(ingredient);
        this.completeMatchingOrder();
    }
    completeMatchingOrder() {
        const ticket = this.tickets.filter(entry => entry.recipe.length === this.choices.length
            && entry.recipe.every((ingredient, index) => ingredient === this.choices[index]))
            .sort((a, b) => a.expiresAt - b.expiresAt)[0];
        if (!ticket) return;
        this.feedback('correct', this.clock());
        this.choices = [];
        this.orders++; this.score += ticket.recipe.length * 10;
        this.tickets = this.tickets.filter(entry => entry !== ticket);
        if (!this.tickets.length) this.spawn(this.clock());
    }
}

class CoffeeGames {
    constructor(clock = Date.now, random = Math.random) { this.rounds = new Map(); this.clock = clock; this.random = random; }
    start(userId, owner) {
        const previous = this.rounds.get(userId);
        if (previous && !previous.result) {
            if (previous.owner !== owner) throw new Error('כבר מתנהל משחק בחלון אחר של החשבון.');
            return previous;
        }
        const round = new CoffeeRound(owner, this.clock, this.random);
        this.rounds.set(userId, round); return round;
    }
    get(userId, owner) {
        const round = this.rounds.get(userId);
        if (!round || round.owner !== owner) throw new Error('אין משחק פעיל בחלון הזה.');
        return round;
    }
    cancel(userId, owner) { if (this.rounds.get(userId)?.owner === owner) this.rounds.delete(userId); }
}
module.exports = { CoffeeGames, CoffeeRound, coffeeRewards, config };
