import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, claimGrants, queueGrant, USE_DB,
} from './profiles.js';
import { verifyBloxityToken, BUX_MODE } from './bloxity.js';
import {
    CFG, WORLD, MUCK, WALLS, TIERS, STEP_UPG, BOOST_PADS, DOUBLE_STEP_PAD, BOXES, BOX_SPOTS, AURAS, TRAILS, PRODUCTS, PASSES,
    QUESTS, FREE, DAILY, CODES, KITS, SKINS,
    dailyStatus, dayKey, xpFor, maxJumpHeight, stepGain, stepBase, rebirthMult, passMult, trampAt, trampOpen, boxDef, rollPet,
    petDef, bestPets, trailIndex, auraIndex, muckOpen, rewardText, fmt, comma, clamp,
} from '../../shared/config.js';

const GREEN = '#7dff6b', RED = '#ff5a5a', GOLD = '#ffd028', BLUE = '#6fe0ff';

// Empty string when the player left the name box blank
function cleanName(name) {
    return String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
}
const randomName = () => 'Player' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
const near = (pl, x, z, r) => Math.abs(pl.x - x) <= r && Math.abs(pl.z - z) <= r;

// Steps are paid as they happen; a token bucket and the distance walked stop scripted spam
const STEP_BURST = 8;

export const liveRooms = new Set();

// One shared world. Movement is client-side; everything that changes progress
// (Jump from steps and bounces, levels, Wins, pets, purchases) is decided here.
export class CrunchRoom extends Room {
    maxClients = CFG.maxPlayers;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.joinCount = 0;

        const on = (type, fn) => this.onMessage(type, (client, m) => {
            const s = this.sessions.get(client.sessionId);
            if (s) fn.call(this, s, m || {}, client);
        });
        on('move', this.onMove);
        on('step', this.onStep);
        on('bounce', this.onBounce);
        on('tier', this.onTier);
        on('boost', this.onBoostPad);
        on('hatch', this.onHatch);
        on('equip', this.onEquip);
        on('equipBest', this.onEquipBest);
        on('deletePet', this.onDeletePet);
        on('aura', this.onAura);
        on('trail', this.onTrail);
        on('rebirth', this.onRebirth);
        on('skip', this.onSkip);
        on('code', this.onCode);
        on('free', this.onFree);
        on('daily', this.onDaily);
        on('buy', this.onBuy);
        on('tutorial', this.onTutorial);
        on('friends', this.onFriends);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        this.onMessage('auth', (client, m) => this.onBloxityLogin(client, m));

        this.setSimulationInterval((dt) => this.tick(dt), 250);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
        // Bux purchases made while the player was on another pod (or offline)
        if (USE_DB) this.clock.setInterval(() => this.applyQueuedGrants(), 5000);
    }

    // A Bloxity token is verified with the Bloxity API; anyone else joins as a guest
    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        const profile = getProfile(uid, name, randomName());
        const player = new PlayerState();
        player.name = profile.name;
        player.av = cleanAvatar(options.av);
        player.x = WORLD.spawn.x; player.y = WORLD.spawn.y; player.z = WORLD.spawn.z; player.ry = 0;
        player.kit = this.joinCount % KITS.length;
        player.skin = (this.joinCount * 3) % SKINS.length;
        this.joinCount++;
        this.state.players.set(client.sessionId, player);
        const s = {
            id: client.sessionId, client, profile, player,
            bucket: STEP_BURST, bucketT: Date.now(), walked: 0, lastMove: null, lastBounce: 0,
            joinedAt: Date.now(), freeClaimed: {}, cooldowns: new Map(), guest, lastChat: 0, friends: 0, skipTier: -1,
        };
        this.sessions.set(client.sessionId, s);
        this.syncPublic(s);
        client.send('hello', { now: Date.now(), bux: BUX_MODE, bloxity: uid.startsWith('legion_') });
        this.payOffline(s);
        this.sendProfile(s);
        this.broadcastBoards(client);
        if (USE_DB) this.applyQueuedGrants();
    }

    // A dropped connection keeps the player in the world for 30 s so the client can reconnect
    onDrop(client) {
        this.allowReconnection(client, 30);
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client;
        client.send('hello', { now: Date.now(), bux: BUX_MODE, bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(s);
        this.broadcastBoards(client);
    }

    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        if (s) s.profile.lastSeen = Date.now();
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        if (s && !isOnline(s.profile.uid)) releaseProfile(s.profile.uid);
    }

    // Colyseus awaits this on SIGTERM, which is how Legion stops a pod on every deploy
    onDispose() {
        for (const s of this.sessions.values()) s.profile.lastSeen = Date.now();
        liveRooms.delete(this);
        markDirty();
        return saveProfiles();
    }

    async applyQueuedGrants() {
        const uids = [...this.sessions.values()].map((s) => s.profile.uid);
        let grants = [];
        try { grants = await claimGrants(uids); } catch (e) { return console.warn('[DB] grants:', e.message); }
        for (const g of grants) {
            const s = [...this.sessions.values()].find((x) => x.profile.uid === g.uid);
            if (s) { this.grant(s, g.kind, g.key); continue; }
            // Left between the query and now: put it back for their next visit
            queueGrant(g.uid, g.name, g.kind, g.key, g.tx).catch(() => {});
        }
        if (grants.length) saveProfiles();
    }

    // ----- helpers -----
    syncPublic(s) {
        const p = s.profile, pl = s.player;
        pl.wins = p.wins; pl.level = p.level; pl.xp = p.xp; pl.jumps = p.jumps; pl.rebirths = p.rebirths;
        pl.height = maxJumpHeight(p.level);
        pl.trail = trailIndex(p.trail);
        pl.aura = auraIndex(p.aura);
        pl.pets = (p.equipped || []).join('|');
    }
    sendProfile(s) {
        const p = s.profile;
        s.client.send('profile', {
            passes: p.passes, quest: p.quest, totalWins: p.totalWins, best: p.best, stepLv: p.stepLv, steps: p.steps,
            bounces: p.bounces, hatched: p.hatched, skips: p.skips, playtime: Math.floor(p.playtime || 0),
            trails: p.trails, trail: p.trail, auras: p.auras, aura: p.aura, pets: p.pets, equipped: p.equipped, codes: p.codes,
            boostUntil: p.boostUntil, claimedPack: p.claimedPack, seenTutorial: p.seenTutorial, firstPlay: p.firstPlay,
            freeClaimed: s.freeClaimed, joinedAt: s.joinedAt, daily: dailyStatus(p, Date.now()), friends: s.friends,
        });
    }
    toast(s, text, color) { s.client.send('toast', { text, color }); }
    cooldown(s, key, seconds) {
        const now = Date.now();
        if ((s.cooldowns.get(key) || 0) > now) return false;
        s.cooldowns.set(key, now + seconds * 1000);
        return true;
    }
    changed(s) {
        this.checkQuest(s);
        this.syncPublic(s); this.sendProfile(s); markDirty();
    }

    // Jump fills the level bar; each level is +5 Jump Height
    addJumps(s, amount) {
        const p = s.profile;
        if (!(amount > 0)) return 0;
        amount = Math.floor(amount);
        const old = p.level;
        p.jumps += amount;
        p.xp += amount;
        while (p.xp >= xpFor(p.level) && p.level < 5000) { p.xp -= xpFor(p.level); p.level++; }
        if (p.level > old) {
            s.client.send('levelUp', { from: old, to: p.level, height: maxJumpHeight(p.level) });
            this.checkQuest(s);
            this.sendProfile(s);
        }
        markDirty();
        return amount;
    }
    addWins(s, n, boosted) {
        if (boosted && s.profile.passes.DoubleWins) n *= 2;
        s.profile.wins += n;
        s.profile.totalWins += n;
        markDirty();
        return n;
    }
    grantReward(s, r) {
        if (r.jumps) this.addJumps(s, r.jumps);
        if (r.wins) this.addWins(s, r.wins, false);
        if (r.box) this.hatch(s, boxDef(r.box), true);
        if (r.boost) s.profile.boostUntil = Math.max(Date.now(), s.profile.boostUntil || 0) + r.boost * 60000;
    }
    // Quest chain: completes automatically and pays its reward
    checkQuest(s) {
        const p = s.profile;
        for (let guard = 0; guard < QUESTS.length; guard++) {
            const q = QUESTS[p.quest];
            if (!q || (p[q.stat] || 0) < q.n) return;
            p.quest++;
            this.grantReward(s, q.reward);
            s.client.send('quest', { text: q.text, reward: rewardText(q.reward), tutorialDone: p.quest === 4 });
            this.sendProfile(s);
        }
    }
    // Earn Jumps offline: one step every 10 s away, up to 8 hours, at your boost x pass x rebirths
    payOffline(s) {
        const p = s.profile, now = Date.now();
        if (!p.lastSeen) return;
        const secs = Math.min(CFG.offlineMaxH * 3600, (now - p.lastSeen) / 1000);
        p.lastSeen = 0;
        if (secs < 120) return;
        const n = Math.floor(secs / CFG.offlineEvery) * stepBase(p) * passMult(p) * rebirthMult(p);
        if (n <= 0) return;
        this.addJumps(s, n);
        s.client.send('offline', { n, secs: Math.floor(secs) });
        this.syncPublic(s);
    }

    // ----- simulation -----
    tick(dt) {
        for (const s of this.sessions.values()) {
            const p = s.profile, before = Math.floor((p.playtime || 0) / 60);
            p.playtime = (p.playtime || 0) + dt / 1000;
            // The x2 trampoline unlocks after 8 minutes of playtime
            if (Math.floor(p.playtime / 60) !== before && before < 10) this.sendProfile(s);
        }
    }

    broadcastBoards(target) {
        const top = (key) => topProfiles(key).map((p) => ({ n: p.name, v: Math.floor(p[key] || 0) }));
        const msg = { wins: top('totalWins'), playtime: top('playtime'), jumps: top('jumps') };
        if (target) target.send('boards', msg); else this.broadcast('boards', msg);
    }

    // ----- movement and earning -----
    onMove(s, m) {
        if (!finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const pl = s.player;
        const x = clamp(m.x, -WORLD.halfX - 60, MUCK.x + MUCK.halfX + 60), y = clamp(m.y, -100, 6000), z = clamp(m.z, WORLD.zMin - 60, 900);
        const anim = clamp(m.a | 0, 0, 2);
        // Distance walked on the ground pays for steps (teleports and falls do not count)
        if (s.lastMove && anim === 1 && Math.abs(y - s.lastMove.y) < 2.5) {
            const d = Math.hypot(x - s.lastMove.x, z - s.lastMove.z);
            if (d < 12) s.walked = Math.min(s.walked + d, CFG.stepDist * 6);
        }
        s.lastMove = { x, y, z };
        pl.x = x; pl.y = y; pl.z = z;
        pl.ry = finite(m.ry) ? m.ry : 0;
        pl.anim = anim;
        // Highest point ever reached ("Climb to 100 Studs" quests)
        const h = Math.floor(y);
        if (h > (s.profile.best || 0) && h < 5000) {
            s.profile.best = h;
            if (this.cooldown(s, 'best', 1)) { this.checkQuest(s); this.sendProfile(s); }
        }
    }

    // One step = (boost per step) x every multiplier
    onStep(s) {
        const now = Date.now(), p = s.profile;
        s.bucket = Math.min(STEP_BURST, s.bucket + (now - s.bucketT) / 1000 * CFG.stepRate);
        s.bucketT = now;
        if (s.bucket < 1 || s.walked < CFG.stepDist * 0.6) return;
        s.bucket -= 1;
        s.walked -= CFG.stepDist * 0.6;
        p.steps = (p.steps || 0) + 1;
        this.addJumps(s, stepGain(p, now, s.friends));
        this.syncPublic(s);
        if (p.steps <= 30 || p.steps % 25 === 0) { this.checkQuest(s); this.sendProfile(s); }
    }

    // Trampoline bounce: checked against where the player is standing
    onBounce(s, m, client) {
        const now = Date.now(), p = s.profile, pl = s.player;
        if (now - s.lastBounce < 450) return;
        const t = trampAt(pl.x, pl.y, pl.z, 14);
        if (!t || !trampOpen(t, p)) return;
        s.lastBounce = now;
        p.bounces = (p.bounces || 0) + 1;
        const got = this.addJumps(s, stepGain(p, now, s.friends) * t.mult);
        this.syncPublic(s);
        client.send('bounced', { n: got, mult: t.mult });
        if (p.bounces <= 20 || p.bounces % 25 === 0) { this.checkQuest(s); this.sendProfile(s); }
    }

    // Wins pad on a wall step: you must be on it, and your Jump Height must clear the step's rise
    onTier(s, m, client) {
        const i = m.i | 0, tier = TIERS[i];
        if (!tier) return;
        const pl = s.player, p = s.profile;
        if (Math.abs(pl.x - tier.x) > 9 || Math.abs(pl.z - tier.z) > 9 || Math.abs(pl.y - tier.y) > 6) return;
        if (tier.wall === 1 && !muckOpen(p)) return;
        const skipped = s.skipTier === i;
        if (!skipped && maxJumpHeight(p.level) + 2 < tier.rise) {
            if (this.cooldown(s, 'tiermsg', 1.5)) this.toast(s, 'You need ' + tier.rise + ' Jump Height for this step!', RED);
            return;
        }
        if (!this.cooldown(s, 'tier', 1.5)) return;
        s.skipTier = -1;
        const got = this.addWins(s, tier.wins, true);
        client.send('wins', { n: got, i });
        this.changed(s);
    }

    // Boost pads: standing on one switches to that boost if you have the Wins it asks for
    onBoostPad(s, m) {
        const p = s.profile, lv = m.lv | 0;
        if (m.double) {
            if (!near(s.player, DOUBLE_STEP_PAD.x, DOUBLE_STEP_PAD.z, 7)) return;
            if (!p.passes.DoubleStep) s.client.send('offer', { kind: 'pass', key: 'DoubleStep' });
            return;
        }
        const pad = BOOST_PADS.find((b) => b.lv === lv);
        if (!pad || !near(s.player, pad.x, pad.z, 6)) return;
        if (!this.cooldown(s, 'boostpad', 0.8)) return;
        const u = STEP_UPG[lv];
        if (p.stepLv === lv) return;
        if (lv < p.stepLv) return this.toast(s, 'You already have a better boost!', BLUE);
        if (p.totalWins < u.req) return this.toast(s, 'You need ' + comma(u.req) + ' Wins for +' + fmt(u.per) + '/Step!', RED);
        p.stepLv = lv;
        s.client.send('boosted', { lv, per: stepBase(p) });
        this.changed(s);
    }

    // ----- pets -----
    // Opens a box. Wins boxes cost Wins and need you next to them; Bux boxes come from purchases.
    onHatch(s, m) {
        const box = boxDef(m.id);
        if (!box || box.product) return;
        const spot = BOX_SPOTS.find((b) => b.id === box.id);
        if (!spot || !near(s.player, spot.x, spot.z, 10)) return;
        if (!this.cooldown(s, 'hatch', 1.2)) return;
        if (s.profile.pets.length >= CFG.petBag) return this.toast(s, 'Your pet bag is full! Delete some pets.', RED);
        if (s.profile.wins < box.cost) return this.toast(s, 'You need ' + comma(box.cost - s.profile.wins) + ' more Wins!', RED);
        s.profile.wins -= box.cost;
        this.hatch(s, box, false);
        this.changed(s);
    }
    hatch(s, box, free) {
        const p = s.profile;
        if (!box) return null;
        if (p.pets.length >= CFG.petBag) { this.toast(s, 'Your pet bag is full!', RED); return null; }
        const id = rollPet(box, Math.random);
        p.pets.push(id);
        p.hatched = (p.hatched || 0) + 1;
        // A new pet better than one you have equipped goes on right away
        const eq = p.equipped;
        if (eq.length < CFG.petSlots) eq.push(id);
        else {
            let worst = 0;
            eq.forEach((e, i) => { if ((petDef(e) || { b: 0 }).b < (petDef(eq[worst]) || { b: 0 }).b) worst = i; });
            if ((petDef(id) || { b: 0 }).b > (petDef(eq[worst]) || { b: 0 }).b) eq[worst] = id;
        }
        s.client.send('hatched', { box: box.id, pet: id, free: !!free });
        markDirty();
        return id;
    }
    // Equip or unequip one copy of a pet you own
    onEquip(s, m) {
        const p = s.profile, id = String(m.id || '');
        if (!petDef(id)) return;
        if (m.on) {
            const owned = p.pets.filter((x) => x === id).length, used = p.equipped.filter((x) => x === id).length;
            if (used >= owned) return;
            if (p.equipped.length >= CFG.petSlots) return this.toast(s, 'Only ' + CFG.petSlots + ' pets can follow you!', RED);
            p.equipped.push(id);
        } else {
            const i = p.equipped.indexOf(id);
            if (i < 0) return;
            p.equipped.splice(i, 1);
        }
        this.changed(s);
    }
    onEquipBest(s) {
        s.profile.equipped = bestPets(s.profile.pets, CFG.petSlots);
        this.changed(s);
    }
    onDeletePet(s, m) {
        const p = s.profile, id = String(m.id || '');
        const i = p.pets.lastIndexOf(id);
        if (i < 0) return;
        p.pets.splice(i, 1);
        // Keep equipped copies no more than owned copies
        const owned = p.pets.filter((x) => x === id).length;
        while (p.equipped.filter((x) => x === id).length > owned) p.equipped.splice(p.equipped.indexOf(id), 1);
        this.changed(s);
    }

    // ----- cosmetics with multipliers -----
    onAura(s, m) {
        const a = AURAS.find((x) => x.id === m.id);
        if (!a) return;
        const p = s.profile;
        const owned = a.id === 'None' || p.auras[a.id] || (a.pass && p.passes[a.pass]);
        if (!owned) {
            if (a.pass) { s.client.send('offer', { kind: 'pass', key: a.pass }); return; }
            if (p.wins < a.cost) return this.toast(s, 'You need ' + comma(a.cost - p.wins) + ' more Wins!', RED);
            p.wins -= a.cost;
            p.auras[a.id] = true;
            this.toast(s, a.id + ' Aura unlocked! x' + a.mult + ' Jumps', GREEN);
        }
        p.aura = a.id;
        this.changed(s);
    }
    onTrail(s, m) {
        const t = TRAILS.find((x) => x.id === m.id);
        if (!t) return;
        const p = s.profile;
        const owned = t.id === 'None' || p.trails[t.id] || (t.pass && p.passes[t.pass]);
        if (!owned) {
            if (t.pass) { s.client.send('offer', { kind: 'pass', key: t.pass }); return; }
            if (p.wins < t.cost) return this.toast(s, 'You need ' + comma(t.cost - p.wins) + ' more Wins!', RED);
            p.wins -= t.cost;
            p.trails[t.id] = true;
            this.toast(s, t.id + ' Trail unlocked! x' + t.mult + ' Jumps', GREEN);
        }
        p.trail = t.id;
        this.changed(s);
    }

    onRebirth(s) {
        const p = s.profile;
        if (p.level < CFG.rebirthLevel) return this.toast(s, 'Reach Level ' + CFG.rebirthLevel + ' to Rebirth!', RED);
        p.rebirths++;
        p.level = 1; p.xp = 0;
        this.toast(s, 'REBIRTH! Jumps are now x' + rebirthMult(p), BLUE);
        s.client.send('fx', { kind: 'rebirth' });
        this.changed(s);
    }

    // Skip Wall: spends a token and lifts you onto the first step your Jump Height can't reach yet
    onSkip(s) {
        if (s.profile.skips <= 0) { s.client.send('offer', { kind: 'product', key: 'SkipWall' }); return; }
        this.useSkip(s);
    }
    useSkip(s) {
        const p = s.profile;
        const inMuck = s.player.x > MUCK.x - MUCK.halfX - 40 && muckOpen(p);
        const wi = inMuck ? 1 : 0;
        const h = maxJumpHeight(p.level) + 2;
        let i = TIERS.findIndex((t) => t.wall === wi && t.rise > h);
        if (i < 0) i = TIERS.findIndex((t) => t.wall === wi && t.last);
        p.skips--;
        s.skipTier = i;
        s.client.send('skipTo', { i });
        this.sendProfile(s);
        markDirty();
    }

    onCode(s, m) {
        if (typeof m.code !== 'string' || !this.cooldown(s, 'code', 1)) return;
        const code = m.code.trim().toUpperCase().slice(0, 24);
        const r = CODES[code];
        if (!r) return this.toast(s, 'Invalid code!', RED);
        if (s.profile.codes[code]) return this.toast(s, 'Code already redeemed!', BLUE);
        s.profile.codes[code] = true;
        this.grantReward(s, r);
        this.toast(s, 'Code redeemed: ' + rewardText(r) + '!', GREEN);
        s.client.send('fx', { kind: 'confetti' });
        this.changed(s);
    }

    onFree(s, m) {
        const i = m.i | 0, r = FREE[i];
        if (!r || s.freeClaimed[i]) return;
        if ((Date.now() - s.joinedAt) / 60000 < r.min) return;
        s.freeClaimed[i] = true;
        this.grantReward(s, r);
        this.toast(s, 'Free gift: ' + rewardText(r) + '!', GREEN);
        s.client.send('fx', { kind: 'confetti' });
        this.changed(s);
    }

    onDaily(s) {
        const p = s.profile, now = Date.now();
        const st = dailyStatus(p, now);
        if (!st.ready) return this.toast(s, 'Come back tomorrow for the next reward!', BLUE);
        const r = DAILY[st.day];
        p.dailyStreak = (p.dailyDay === dayKey(now - 86400000) ? p.dailyStreak : 0) + 1;
        p.dailyDay = dayKey(now);
        this.grantReward(s, r);
        this.toast(s, 'Day ' + (st.day + 1) + ' reward: ' + rewardText(r) + '!', GREEN);
        s.client.send('fx', { kind: 'confetti' });
        this.changed(s);
    }

    onTutorial(s) {
        if (!s.profile.seenTutorial) { s.profile.seenTutorial = true; this.sendProfile(s); markDirty(); }
    }
    // Friend Boost: Bloxity friends in this server, counted by the client and capped here
    onFriends(s, m) {
        const others = this.sessions.size - 1;
        s.friends = clamp(m.n | 0, 0, Math.min(CFG.friendMax, others));
        this.sendProfile(s);
    }

    // Demo mode grants for free. In Bux mode (LEGION_WEBHOOK_SECRET set) only the webhook grants.
    onBuy(s, m) {
        if (BUX_MODE) return this.toast(s, 'Purchases use Bux - log in to Bloxity', BLUE);
        this.grant(s, m.kind, m.key);
    }

    // s is a live session, or a stand-in { profile, client: { send() {} } } for offline players
    grant(s, kind, key) {
        const p = s.profile;
        if (kind === 'pass') {
            const pass = PASSES[key];
            if (!pass) return false;
            if (p.passes[key]) { this.toast(s, pass.name + ' already owned!', BLUE); return true; }
            p.passes[key] = true;
            if (key === 'RainbowTrail') p.trail = 'Rainbow';
            if (key === 'CosmicAura') p.aura = 'Cosmic';
            this.toast(s, pass.name + ' unlocked!', GREEN);
        } else {
            const prod = PRODUCTS[key];
            if (!prod) return false;
            if (key === 'StarterPack') {
                if (p.claimedPack) { this.toast(s, 'Starter Pack already claimed!', BLUE); return true; }
                p.claimedPack = true;
            }
            if (key === 'CrunchBoost') {
                p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + CFG.boostMinutes * 60000;
                this.toast(s, 'x2 Jumps for 15 minutes!', GOLD);
            }
            if (key === 'GalaxyBox') this.hatch(s, boxDef('Galaxy'), true);
            if (key === 'SecretEgg') this.hatch(s, boxDef('Secret'), true);
            if (prod.pet) {
                p.pets.push(prod.pet);
                p.equipped = bestPets(p.pets, CFG.petSlots);
                s.client.send('hatched', { box: 'Store', pet: prod.pet, free: true });
            }
            if (prod.trail) { p.trails[prod.trail] = true; p.trail = prod.trail; this.toast(s, prod.trail + ' Trail unlocked!', GREEN); }
            if (prod.jumps) { this.addJumps(s, prod.jumps); this.toast(s, '+' + fmt(prod.jumps) + ' Jump!', GREEN); }
            if (prod.wins) { this.addWins(s, prod.wins, false); this.toast(s, '+' + comma(prod.wins) + ' Wins!', GOLD); }
            if (key === 'SkipWall') {
                p.skips = (p.skips || 0) + 1;
                if (s.player) this.useSkip(s);
            }
        }
        s.client.send('fx', { kind: 'confetti' });
        if (s.player) this.changed(s); else markDirty();
        return true;
    }

    // ----- Bloxity -----
    // Logged in to Bloxity after joining: move this session onto the Bloxity profile
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile;
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        s.profile = getProfile(uid, name, randomName());
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid);
        s.player.name = s.profile.name;
        this.changed(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(s, m) { s.player.av = cleanAvatar(m.av); }
    // Emote ids are opaque catalogue ids; other players play the same clip
    onEmote(s, m, client) {
        if (typeof m.id !== 'string' || m.id.length > 40) return;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(s, m, client) {
        if (typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
}

function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}

// Grants a Bux purchase confirmed by the Bloxity webhook, whether or not the player is online
export async function grantPurchase(uid, name, kind, key, tx) {
    for (const room of liveRooms) {
        for (const s of room.sessions.values()) {
            if (s.profile.uid === uid) return room.grant(s, kind, key);
        }
    }
    // Not on this pod: the pod hosting them (or their next join) applies it
    if (USE_DB) { await queueGrant(uid, name, kind, key, tx); return true; }
    const profile = getProfile(uid, name, randomName());
    const stub = { profile, client: { send() {} } };
    const proto = CrunchRoom.prototype;
    return proto.grant.call({
        toast() {}, addJumps: proto.addJumps, addWins: proto.addWins, hatch: proto.hatch, checkQuest() {}, sendProfile() {}, changed() {}, useSkip() {},
    }, stub, kind, key);
}
