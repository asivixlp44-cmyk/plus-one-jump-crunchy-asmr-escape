// Game data shared by the client and the Colyseus server.
// Clone target: Roblox "[UPDATE] +1 Jump Crunchy ASMR Escape!" (reference/Gameplay.mp4).
//
// The loop: every step you walk on the crunchy tiles is +Jump (x your boost and multipliers).
// Jumps fill the level bar; every level adds +5 Jump Height. Climb the giant food wall,
// touch the Wins pad on the highest step you can reach, spend Wins on boxes, trails and auras,
// and stand on the boost pads to earn more Jump per step.

export const CFG = {
    walkSpeed: 22,
    gravity: 150,
    stepDist: 6.5,          // studs walked on the ground for one "step"
    stepRate: 6,            // most steps a second the server pays
    bounceV: 52,            // trampoline bounce (~9 studs)
    rebirthLevel: 25,
    boostMinutes: 15,
    maxPlayers: 24,
    voidY: -40,
    petSlots: 3,
    petBag: 60,
    // Global CRUNCH RUSH event: every 30 minutes, the last 5 are x2 Jumps for everyone
    eventCycle: 30 * 60,
    eventLive: 5 * 60,
    // Earn Jumps offline: one step every 10 s while away, up to 8 hours
    offlineEvery: 10,
    offlineMaxH: 8,
    friendBoost: 0.1,       // +10% per Bloxity friend in the server
    friendMax: 5,
};

// XP to finish level L: 85, 155, 250 (like the reference), then steeper
export const xpFor = (L) => Math.floor((12.5 * L * L + 32.5 * L + 40) * Math.pow(1.07, Math.max(0, L - 6)));
// Jump Height in studs: 15 at Level 1, +5 each level (Level 2 = 20, Level 3 = 25)
export const maxJumpHeight = (level) => 10 + 5 * Math.max(1, level || 1);

// Boost pads: stand on one to use that boost. Needs that many Wins (not spent).
export const STEP_UPG = [
    { per: 1, req: 0 },
    { per: 2, req: 1 },
    { per: 5, req: 5 },
    { per: 10, req: 25 },
    { per: 25, req: 125 },
    { per: 60, req: 600 },
    { per: 150, req: 3000 },
    { per: 350, req: 15000 },
    { per: 800, req: 75000 },
    { per: 2000, req: 400000 },
    { per: 4500, req: 2000000 },
    { per: 10000, req: 10000000 },
];
export const stepBase = (p) => STEP_UPG[Math.max(0, Math.min(STEP_UPG.length - 1, p.stepLv | 0))].per * (p.passes && p.passes.DoubleStep ? 2 : 1);

// ---------------------------------------------------------------------------------
// Pets, auras and trails all multiply the Jump you get per step
// ---------------------------------------------------------------------------------
export const RARITY = {
    Common: '#c8d0e0', Uncommon: '#7dff6b', Rare: '#28c8ff', Epic: '#c46bff', Legendary: '#ffd028', Mythic: '#ff4a6a', Limited: '#ff8fd0',
};
export const PETS = [
    { id: 'Choco Cat', r: 'Common', b: 0.1, c: 0x7a4426, ic: '🐱' },
    { id: 'Cookie Dog', r: 'Common', b: 0.15, c: 0xd09a5a, ic: '🐶' },
    { id: 'Gummy Bear', r: 'Uncommon', b: 0.25, c: 0xff4a6a, ic: '🐻' },
    { id: 'Butter Bunny', r: 'Uncommon', b: 0.35, c: 0xffe27a, ic: '🐰' },
    { id: 'Slime Pup', r: 'Rare', b: 0.6, c: 0x46ec50, ic: '🐶' },
    { id: 'Jelly Fox', r: 'Rare', b: 1, c: 0xff8a1e, ic: '🦊' },
    { id: 'Jelly Dragon', r: 'Epic', b: 2, c: 0xb04aff, ic: '🐲' },
    { id: 'Galaxy Owl', r: 'Epic', b: 4, c: 0x5a3cff, ic: '🦉' },
    { id: 'Nebula Bat', r: 'Legendary', b: 8, c: 0x2a1c6a, ic: '🦇' },
    { id: 'Void Kitty', r: 'Mythic', b: 20, c: 0x16121f, ic: '😼' },
    { id: 'Unicorn Dumpling', r: 'Limited', b: 50, c: 0xffd6f0, ic: '🦄' },
];
export const petDef = (id) => PETS.find((p) => p.id === id) || null;
// Boxes (eggs): Wins boxes stand by the spawn, Bux boxes are sold in the Store
export const BOXES = [
    { id: 'Common', name: 'Common Box', cost: 100, color: 0xb87a3a, odds: [['Choco Cat', 60], ['Cookie Dog', 35], ['Gummy Bear', 5]] },
    { id: 'Slime', name: 'Slime Box', cost: 15000, color: 0x46ec50, odds: [['Gummy Bear', 50], ['Butter Bunny', 35], ['Slime Pup', 14], ['Jelly Fox', 1]] },
    { id: 'Jelly', name: 'Jelly Box', cost: 150000, color: 0xb04aff, odds: [['Slime Pup', 55], ['Jelly Fox', 35], ['Jelly Dragon', 9.5], ['Galaxy Owl', 0.5]] },
    { id: 'Galaxy', name: 'Galaxy Box', product: 'GalaxyBox', color: 0x3a1c8a, odds: [['Jelly Dragon', 60], ['Galaxy Owl', 35], ['Nebula Bat', 5]] },
    { id: 'Secret', name: 'Secret Egg', product: 'SecretEgg', color: 0x16121f, odds: [['Galaxy Owl', 60], ['Nebula Bat', 35], ['Void Kitty', 5]] },
];
export const boxDef = (id) => BOXES.find((b) => b.id === id) || null;
export function rollPet(box, rnd) {
    const total = box.odds.reduce((a, o) => a + o[1], 0);
    let r = rnd() * total;
    for (const [id, w] of box.odds) { r -= w; if (r <= 0) return id; }
    return box.odds[box.odds.length - 1][0];
}
// Equipped pets add their boosts together: x1 + 0.6 + 0.25 ...
export function petMult(p) {
    let m = 1;
    for (const id of p.equipped || []) { const d = petDef(id); if (d) m += d.b; }
    return m;
}
// The best pets in the bag, for "Equip Best"
export function bestPets(pets, n) {
    return (pets || []).slice().sort((a, b) => (petDef(b) ? petDef(b).b : 0) - (petDef(a) ? petDef(a).b : 0)).slice(0, n);
}

export const AURAS = [
    { id: 'None', cost: 0, mult: 1, color: 0xffffff },
    { id: 'Sugar', cost: 500, mult: 1.25, color: 0xffffff },
    { id: 'Candy', cost: 5000, mult: 1.5, color: 0xff6bd5 },
    { id: 'Lava', cost: 50000, mult: 2, color: 0xff6a14 },
    { id: 'Frost', cost: 500000, mult: 3, color: 0x7fe8ff },
    { id: 'Cosmic', pass: 'CosmicAura', mult: 5, color: 0xa04aff },
    { id: 'Rainbow', cost: 5000000, mult: 8, color: 0xffffff },
];
export const auraDef = (id) => AURAS.find((a) => a.id === id) || AURAS[0];
export const auraIndex = (id) => Math.max(0, AURAS.findIndex((a) => a.id === id));

export const TRAILS = [
    { id: 'None', cost: 0, mult: 1, colors: [] },
    { id: 'Swoosh', cost: 1000, product: 'TrailSwoosh', mult: 1.15, rarity: 'Uncommon', colors: [0xffffff, 0xeef4ff] },
    { id: 'Wave', cost: 7500, product: 'TrailWave', mult: 1.25, rarity: 'Uncommon', colors: [0x7fe8ff, 0x28a8ff, 0xffffff] },
    { id: 'Blaze', cost: 40000, product: 'TrailBlaze', mult: 1.4, rarity: 'Rare', colors: [0xff3a3a, 0xffffff, 0xff8a1e] },
    { id: 'Toxic', cost: 200000, mult: 1.6, rarity: 'Epic', colors: [0x7dff3a, 0x2fd84a] },
    { id: 'Galaxy', cost: 1000000, mult: 2, rarity: 'Legendary', colors: [0xc28cff, 0x6a3cff, 0xffffff] },
    { id: 'Rainbow', pass: 'RainbowTrail', mult: 2.5, rarity: 'Mythic', colors: [0xff3a3a, 0xff9a1e, 0xffe14a, 0x46ec50, 0x28c8ff, 0x8a5cff] },
];
export const trailDef = (id) => TRAILS.find((t) => t.id === id) || TRAILS[0];
export const trailIndex = (id) => Math.max(0, TRAILS.findIndex((t) => t.id === id));

// The three multipliers on the HUD, plus trail, pets, event and friends
export const passMult = (p) => (p.passes && p.passes.DoubleJump ? 2 : 1);
export const rebirthMult = (p) => 1 + (p.rebirths || 0);
export const crunchRush = (now) => ((now / 1000) % CFG.eventCycle) >= CFG.eventCycle - CFG.eventLive;
export function eventLeft(now) {
    const ph = (now / 1000) % CFG.eventCycle, start = CFG.eventCycle - CFG.eventLive;
    return ph >= start ? CFG.eventCycle - ph : start - ph;
}
export function jumpMult(p, now, friends) {
    let m = passMult(p) * auraDef(p.aura).mult * rebirthMult(p) * trailDef(p.trail).mult * petMult(p);
    if (crunchRush(now)) m *= 2;
    if (now < (p.boostUntil || 0)) m *= 2;
    m *= 1 + Math.min(CFG.friendMax, friends || 0) * CFG.friendBoost;
    return m;
}
// Jump for one step (before the trampoline multiplier)
export const stepGain = (p, now, friends) => Math.max(1, Math.floor(stepBase(p) * jumpMult(p, now, friends)));

// ---------------------------------------------------------------------------------
// World layout (studs). +z is "forward" from spawn toward the wall.
// ---------------------------------------------------------------------------------
export const WORLD = {
    halfX: 84, zMin: -72, zMax: 128,
    spawn: { x: 0, y: 0.6, z: -50 },
};
// Tall studded walls around each island (the lobby is a closed blue box like the reference)
export const FENCE_H = 34;
export const MUCK = { x: 1100, z: 0, halfX: 70, zMin: -60, zMax: 90, req: { level: 100, rebirths: 4 } };
export const muckOpen = (p) => (p.level || 1) >= MUCK.req.level && (p.rebirths || 0) >= MUCK.req.rebirths;

// The escape walls: giant steps of crunchy food. h = height of the step top (the "Studs"
// label), wins = what its pad pays. You need Jump Height >= the rise from the step below.
export const WALLS = [
    {
        id: 'main', name: 'CRUNCHY WALL', x: 0, z: WORLD.zMax, w: 120, depth: 14,
        tiers: [
            [10, 1, 'choco'], [20, 2, 'red'], [35, 3, 'orange'], [55, 5, 'caramel'], [75, 8, 'butter'], [100, 15, 'cheese'],
            [130, 30, 'lemon'], [160, 60, 'lime'], [200, 125, 'mint'], [250, 250, 'cookie'], [310, 500, 'waffle'],
            [380, 1000, 'candy'], [460, 2500, 'jelly'], [550, 6000, 'gum'], [650, 15000, 'icecream'], [800, 40000, 'cake'],
            [1000, 100000, 'macaron'], [1250, 300000, 'galaxy'], [1500, 1000000, 'gold'],
        ],
    },
    {
        id: 'muck', name: 'MUCKBANG WALL', x: MUCK.x, z: MUCK.z + MUCK.zMax, w: 110, depth: 16,
        tiers: [
            [500, 2000000, 'bun'], [1100, 6000000, 'lettuce'], [1800, 20000000, 'cheddar'], [2600, 75000000, 'patty'],
            [3500, 250000000, 'fries'], [4500, 1000000000, 'donut'],
        ],
    },
];
// Flat list of tiers (index = id the client sends) with the Wins pad position on each step.
// The wall is a pyramid: every step is a little narrower than the one below (like the reference).
export const TIERS = [];
for (const [wi, w] of WALLS.entries()) {
    let prev = 0;
    w.tiers.forEach(([h, wins, theme], k) => {
        const z0 = w.z + k * w.depth;
        const tw = Math.max(44, w.w - k * 5);
        TIERS.push({ wall: wi, k, h, rise: h - prev, wins, theme, z0, w: tw, x: w.x + tw / 2 - 7, y: h, z: z0 + w.depth / 2, last: k === w.tiers.length - 1 });
        prev = h;
    });
}

// Boost pads: a row of numbered pads along the right side of the spawn plaza
export const BOOST_PADS = STEP_UPG.slice(1).map((u, i) => ({ lv: i + 1, x: 46, z: -46 + i * 8.5 }));
export const DOUBLE_STEP_PAD = { x: 46, z: -46 + STEP_UPG.length * 8.5 - 2 };

// Trampolines: stand on one and you bounce for Jumps by yourself
export const TRAMPS = [
    { id: 't15', name: 'x1.5 Jumps', x: -46, z: -40, r: 5, mult: 1.5, color: 0xff6bd5 },
    { id: 't2', name: 'x2 Jumps', x: -60, z: -40, r: 5, mult: 2, playtime: 8, color: 0x46ec50 },
    { id: 't4', name: '4x Jumps', x: -46, z: -24, r: 5, mult: 4, pass: 'Tramp4', color: 0xffc414 },
    { id: 't8', name: '8x Jumps', x: -60, z: -24, r: 5, mult: 8, pass: 'Tramp8', color: 0x28c8ff },
    { id: 't25', name: 'Bubblegum x25', x: -46, z: -8, r: 5.5, mult: 25, pass: 'Tramp25', color: 0xff3fa0 },
    { id: 't100', name: 'VOID x100', x: -60, z: -8, r: 5.5, mult: 100, pass: 'Tramp100', color: 0x6a3cff },
    { id: 't500', name: 'IMMORTAL x500', x: -46, z: 8, r: 6, mult: 500, pass: 'Tramp500', color: 0x1f6bff },
    { id: 't1000', name: 'HEAVEN x1000', x: -60, z: 8, r: 6, mult: 1000, pass: 'Tramp1000', color: 0xffd028 },
];
export const TRAMP_TOP = 1.4;
export function trampAt(x, y, z, slack) {
    if (y < TRAMP_TOP - 1 || y > TRAMP_TOP + (slack || 0.6)) return null;
    for (const t of TRAMPS) if ((x - t.x) ** 2 + (z - t.z) ** 2 <= (t.r + 0.4) ** 2) return t;
    return null;
}
// Unlocked by a pass, by total playtime, or free
export const trampOpen = (t, p) => (t.pass ? !!(p.passes && p.passes[t.pass]) : t.playtime ? (p.playtime || 0) >= t.playtime * 60 : true);

// Shops and stations around the plaza (x, z of the spot you stand on)
export const SPOTS = {
    boxes: { x: 22, z: 14 },
    trails: { x: -22, z: 34 },
    winShop: { x: 22, z: -20 },
    portal: { x: -26, z: 70 },
    event: { x: 24, z: 60 },
    muckReturn: { x: MUCK.x, z: MUCK.zMin + 22 },
};
export const BOX_SPOTS = BOXES.map((b, i) => ({ id: b.id, x: 14 + (i % 3) * 10, z: 8 + Math.floor(i / 3) * 12 }));

// Places in the Teleport menu
export const TELEPORTS = [
    { id: 'spawn', name: 'Spawn', ic: '🏠' },
    { id: 'boost', name: 'Boost Pads', ic: '👟' },
    { id: 'tramps', name: 'Trampolines', ic: '🤸' },
    { id: 'boxes', name: 'Boxes', ic: '🎁' },
    { id: 'wall', name: 'Crunchy Wall', ic: '🧱' },
    { id: 'muck', name: 'Muckbang World', ic: '🍔', lock: true },
];

// ---------------------------------------------------------------------------------
// Store (Bux)
// ---------------------------------------------------------------------------------
export const PRODUCTS = {
    Jump100K: { name: '+100K Jump', price: 9, jumps: 100000, ic: '👟' },
    Jump1M: { name: '+1M Jump', price: 29, jumps: 1000000, ic: '👟' },
    Jump10M: { name: '+10M Jump', price: 99, jumps: 10000000, ic: '👟' },
    Jump100M: { name: '+100M Jump', price: 299, jumps: 100000000, ic: '👟' },
    Wins1K: { name: '+1K Wins', price: 25, wins: 1000, ic: '🏆' },
    Wins10K: { name: '+10K Wins', price: 79, wins: 10000, ic: '🏆' },
    Wins100K: { name: '+100K Wins', price: 249, wins: 100000, ic: '🏆' },
    SkipWall: { name: 'Skip Wall', price: 19, ic: '⏭️' },
    CrunchBoost: { name: 'x2 Jumps (15 min)', price: 15, ic: '⚡' },
    GalaxyBox: { name: 'Galaxy Box', price: 39, ic: '🌌' },
    SecretEgg: { name: 'Secret Egg', price: 79, ic: '🥚' },
    UnicornDumpling: { name: 'Unicorn Dumpling (Limited)', price: 149, pet: 'Unicorn Dumpling', ic: '🦄' },
    StarterPack: { name: 'Starter Pack', price: 9, wins: 50, jumps: 5000, ic: '🎁' },
    TrailSwoosh: { name: 'Swoosh Trail', price: 5, trail: 'Swoosh', ic: '💨' },
    TrailWave: { name: 'Wave Trail', price: 9, trail: 'Wave', ic: '🌊' },
    TrailBlaze: { name: 'Blaze Trail', price: 19, trail: 'Blaze', ic: '🔥' },
};
export const PASSES = {
    DoubleJump: { name: 'x2 Jump', price: 5, ic: '👟', desc: 'x2 Jump from every step, forever' },
    DoubleStep: { name: '2x Step', price: 49, ic: '🦶', desc: 'Every boost pad gives double per step' },
    DoubleWins: { name: 'x2 Wins', price: 59, ic: '🏆', desc: 'Double the Wins from every wall pad' },
    Tramp4: { name: '4x Jumps Trampoline', price: 15, ic: '🟡', desc: 'Unlocks the 4x trampoline' },
    Tramp8: { name: '8x Jumps Trampoline', price: 35, ic: '🔵', desc: 'Unlocks the 8x trampoline' },
    Tramp25: { name: 'Bubblegum x25 Trampoline', price: 59, ic: '🩷', desc: 'Unlocks the Bubblegum x25 trampoline' },
    Tramp100: { name: 'VOID x100 Trampoline', price: 149, ic: '🟣', desc: 'Unlocks the VOID x100 trampoline' },
    Tramp500: { name: 'IMMORTAL x500 Trampoline', price: 299, ic: '💠', desc: 'Unlocks the IMMORTAL x500 trampoline' },
    Tramp1000: { name: 'HEAVEN x1000 Trampoline', price: 499, ic: '👼', desc: 'Unlocks the HEAVEN x1000 trampoline' },
    CosmicAura: { name: 'Cosmic Aura', price: 29, ic: '🔮', desc: 'x5 Jumps aura with a purple glow' },
    RainbowTrail: { name: 'Rainbow Trail', price: 39, ic: '🌈', desc: 'x2.5 Jumps rainbow trail' },
};
// Bloxity Bux SKUs: create these in the game's IAP catalog on bloxity.io (prices live there)
export const SKUS = {
    product: {
        Jump100K: 'jump_100k', Jump1M: 'jump_1m', Jump10M: 'jump_10m', Jump100M: 'jump_100m',
        Wins1K: 'wins_1k', Wins10K: 'wins_10k', Wins100K: 'wins_100k', SkipWall: 'skip_wall', CrunchBoost: 'crunch_boost',
        GalaxyBox: 'galaxy_box', SecretEgg: 'secret_egg', UnicornDumpling: 'unicorn_dumpling', StarterPack: 'starter_pack',
        TrailSwoosh: 'trail_swoosh', TrailWave: 'trail_wave', TrailBlaze: 'trail_blaze',
    },
    pass: {
        DoubleJump: 'pass_double_jump', DoubleStep: 'pass_double_step', DoubleWins: 'pass_double_wins',
        Tramp4: 'pass_tramp_4', Tramp8: 'pass_tramp_8', Tramp25: 'pass_tramp_25', Tramp100: 'pass_tramp_100',
        Tramp500: 'pass_tramp_500', Tramp1000: 'pass_tramp_1000', CosmicAura: 'pass_cosmic_aura', RainbowTrail: 'pass_rainbow_trail',
    },
};
export const buxText = (n) => fmt(n) + ' Bux';
export function skuLookup(sku) {
    for (const kind of ['product', 'pass']) for (const [key, s] of Object.entries(SKUS[kind])) if (s === sku) return { kind, key };
    return null;
}

// Quest chain. The first four are the tutorial; the text shows across the top of the screen.
export const TUTORIAL_STEPS = 4;
export const QUESTS = [
    { text: 'Walk on the crunchy floor to earn Jumps!', stat: 'steps', n: 25, reward: { jumps: 100 }, goal: 'walk' },
    { text: 'Climb the wall and touch a Wins pad!', stat: 'totalWins', n: 1, reward: { jumps: 200 }, goal: 'wall' },
    { text: 'Upgrade your boost to jump higher!', stat: 'stepLv', n: 1, reward: { wins: 2 }, goal: 'boost' },
    { text: 'Bounce on a trampoline!', stat: 'bounces', n: 10, reward: { wins: 3 }, goal: 'tramp' },
    { text: 'Reach Level 5!', stat: 'level', n: 5, reward: { wins: 10 } },
    { text: 'Climb to 100 Studs!', stat: 'best', n: 100, reward: { wins: 15 } },
    { text: 'Open a Common Box!', stat: 'hatched', n: 1, reward: { jumps: 2000 } },
    { text: 'Get 125 Wins for the +25/Step pad!', stat: 'totalWins', n: 125, reward: { jumps: 10000 } },
    { text: 'Walk 1,000 steps!', stat: 'steps', n: 1000, reward: { wins: 50 } },
    { text: 'Reach Level 25 and Rebirth!', stat: 'rebirths', n: 1, reward: { wins: 200 } },
    { text: 'Climb to 310 Studs!', stat: 'best', n: 310, reward: { wins: 500 } },
    { text: 'Get 15K Wins for the Slime Box!', stat: 'totalWins', n: 15000, reward: { jumps: 1000000 } },
    { text: 'Climb to 800 Studs!', stat: 'best', n: 800, reward: { wins: 20000 } },
    { text: 'Rebirth 4 times!', stat: 'rebirths', n: 4, reward: { wins: 100000 } },
    { text: 'ESCAPE! Reach the top at 1,500 Studs!', stat: 'best', n: 1500, reward: { wins: 1000000 } },
    { text: 'Open the Muckbang World (Level 100)!', stat: 'level', n: 100, reward: { wins: 5000000 } },
];

// Daily login streak: claim once per (UTC) day; missing a day starts over at Day 1
export const DAILY = [
    { jumps: 500 }, { box: 'Common' }, { wins: 25 }, { jumps: 25000 }, { wins: 250 }, { box: 'Slime' }, { jumps: 1000000, wins: 2500 },
];
export const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
export function dailyStatus(p, now) {
    const today = dayKey(now), yesterday = dayKey(now - 86400000);
    if (p.dailyDay === today) return { ready: false, day: (p.dailyStreak - 1) % DAILY.length };
    const streak = p.dailyDay === yesterday ? p.dailyStreak : 0;
    return { ready: true, day: streak % DAILY.length };
}

// Free! gifts: session playtime rewards (minutes since joining)
export const FREE = [
    { min: 1, jumps: 200 }, { min: 3, wins: 3 }, { min: 6, jumps: 5000 }, { min: 10, box: 'Common' },
    { min: 15, wins: 50 }, { min: 25, jumps: 100000 }, { min: 40, box: 'Slime' }, { min: 60, wins: 1000 },
];

// Redeem codes (case-insensitive, once per player)
export const CODES = {
    RELEASE: { wins: 10 },
    CRUNCH: { jumps: 1000 },
    ASMR: { box: 'Common' },
    LEGION: { wins: 25 },
    BLOXITY: { boost: 5 },
};

// Fallback blocky look (before the Bloxity body loads): black tee, dark jeans, orange hair
export const KITS = [
    { shirt: 0x1c1c22, shorts: 0x26302a, socks: 0x26302a, hair: 0xa8521e, skin: 0xf2efe6 },
    { shirt: 0x2f7bff, shorts: 0x2b3340, socks: 0x2b3340, hair: 0x3a2618 },
    { shirt: 0xe82434, shorts: 0x1c1c22, socks: 0x1c1c22, hair: 0x1a1410 },
    { shirt: 0x28c43c, shorts: 0x2b3340, socks: 0x2b3340, hair: 0xe6c878 },
    { shirt: 0x8a1cff, shorts: 0x1c1c22, socks: 0x1c1c22, hair: 0x3a2618 },
    { shirt: 0xf5f5f5, shorts: 0x2b3340, socks: 0x2b3340, hair: 0xd8641e },
];
export const SKINS = [0xf5d29a, 0xe1af87, 0xc88c5f, 0x8c5a3c, 0xf0c8a0];

// Reward text shared by toasts and panels ({ jumps, wins, box, boost })
export function rewardText(r) {
    return [r.jumps ? '+' + fmt(r.jumps) + ' Jump' : '', r.wins ? '+' + fmt(r.wins) + ' Wins' : '', r.box ? (boxDef(r.box) || {}).name : '',
        r.boost ? r.boost + ' min x2 Jumps' : ''].filter(Boolean).join(' & ');
}

const SUF = ['K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp'];
// 2700 -> "2.7K", 1000000 -> "1M", 950 -> "950"
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    let i = -1, s = v;
    while (s >= 1000 && i < SUF.length - 1) { s /= 1000; i++; }
    const t = s >= 100 ? String(Math.floor(s)) : (Math.floor(s * 10) / 10).toFixed(1).replace(/\.0$/, '');
    return t + SUF[i];
}
// Multipliers: 1 -> "1x", 1.5 -> "1.5x", 2400 -> "2.4Kx"
export const fmtMult = (m) => (m < 1000 ? String(Math.round(m * 100) / 100) : fmt(m)) + 'x';
export const comma = (v) => Math.floor(v || 0).toLocaleString('en-US');
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function rngFrom(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
// Seasons kept for weather.js: this island is always summer
export const SEASONS = [{ id: 'summer', name: 'SUMMER', ic: '☀️' }];
export function seasonAt() { return { i: 0, next: 0, k: 0, left: 0 }; }
