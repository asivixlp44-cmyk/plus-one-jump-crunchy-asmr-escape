// Local mirror of this player's progress. The server owns the real values:
// public stats arrive through the room state, private ones in "profile" messages.
export const S = {
    wins: 0, totalWins: 0, jumps: 0, level: 1, xp: 0, rebirths: 0, height: 15, best: 0,
    stepLv: 0, steps: 0, bounces: 0, hatched: 0, skips: 0, playtime: 0,
    passes: {}, quest: 0, trails: {}, trail: 'None', auras: {}, aura: 'None', pets: [], equipped: [], codes: {},
    boostUntil: 0, claimedPack: false, seenTutorial: true, firstPlay: Date.now(),
    freeClaimed: {}, joinedAt: Date.now(), name: '', daily: null, friends: 0,
    custom: 0, // Custom Jump height (0 = max)
};

// Game actions that world objects (pads, shops, portals) trigger; filled in by main.js
export const actions = {};

export const net = {
    room: null,
    offset: 0,
    send(type, msg) { if (this.room) this.room.send(type, msg || {}); },
    // Server clock in ms
    now() { return Date.now() + this.offset; },
};
