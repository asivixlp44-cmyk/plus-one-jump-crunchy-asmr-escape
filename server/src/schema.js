import { schema, t } from '@colyseus/schema';

// Public, synced to every client. Private progress (passes, pets bag, quests...)
// is sent only to its owner with the "profile" message.
export const PlayerState = schema({
    name: t.string().default(''),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    ry: t.angle(),
    anim: t.uint8().default(0), // 0 idle, 1 run, 2 air
    wins: t.number().default(0),
    level: t.uint16().default(1),
    xp: t.number().default(0),
    jumps: t.number().default(0),    // lifetime Jump
    rebirths: t.uint16().default(0),
    height: t.uint16().default(15),  // max Jump Height in studs
    trail: t.uint8().default(0),     // index into TRAILS
    aura: t.uint8().default(0),      // index into AURAS
    pets: t.string().default(''),    // equipped pet ids, "|" separated
    kit: t.uint8().default(0),
    skin: t.uint8().default(0),
    av: t.string().default(''), // packed Bloxity avatar (equipped ids + proportions)
}, 'PlayerState');

export const GameState = schema({
    players: t.map(PlayerState),
}, 'GameState');
