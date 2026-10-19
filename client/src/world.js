import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
    T, V3, scene, camera, mat, box, aabb, UNIT, solids, triggers, prompts, tickers, texFrom, billboard, NEON_BOOST,
} from './engine.js';
import { S, actions, net } from './state.js';
import { foodBoxMaterials, foodMaterial, themeColor, crackTexture, walkMaterial, netMaterial, waterTexture } from './textures.js';
import { neonBubble, bubbleBurst } from './fx.js';
import { buildPet } from './pets.js';
import {
    WORLD, MUCK, WALLS, FENCE_H, TIERS, STEP_UPG, BOOST_PADS, DOUBLE_STEP_PAD, TRAMPS, TRAMP_TOP, BOXES, BOX_SPOTS, SPOTS, PASSES, PRODUCTS,
    trampOpen, muckOpen, crunchRush, eventLeft, fmt, comma, clock, rngFrom, buxText, petDef,
} from '../../shared/config.js';
import { batchStatic, skinRig } from './batch.js';

export const SPAWN = new V3(WORLD.spawn.x, WORLD.spawn.y, WORLD.spawn.z);
export const MUCK_SPAWN = new V3(MUCK.x, 0.6, MUCK.zMin + 14);
const HX = WORLD.halfX, Z0 = WORLD.zMin;
const MAIN_END = WALLS[0].z + WALLS[0].tiers.length * WALLS[0].depth + 24;
const rng = rngFrom(20261005);
// Shared with weather.js (the sea tint); the floor tiles carry their own colours
export const groundMat = null;
export const seaMat = new T.MeshLambertMaterial({ color: 0xffffff, map: waterTexture });

function texturedBox(sx, sy, sz, x, y, z, material, solid) {
    const m = new T.Mesh(UNIT, material);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    if (solid) solids.push(aabb(x, y, z, sx, sy, sz));
    return m;
}
function neon(sx, sy, sz, x, y, z, color) { return box(sx, sy, sz, x, y, z, color, { neon: true, decor: true }); }

// Rounded sign panel with outlined text, as a flat plane
function panelCanvas(lines, W, H, bg, border) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const x = cv.getContext('2d');
    const r = H * 0.16;
    if (bg !== 'none') {
        x.fillStyle = border || 'rgba(255,255,255,0.85)';
        x.beginPath(); x.roundRect(0, 0, W, H, r); x.fill();
        x.fillStyle = bg || '#1c1a2e';
        x.beginPath(); x.roundRect(H * 0.05, H * 0.05, W - H * 0.1, H - H * 0.1, r * 0.8); x.fill();
    }
    const sum = lines.reduce((a, l) => a + l.px * 1.1, 0);
    const sc = Math.min(W / 512, (H * 0.86) / sum);
    let y = (H - sum * sc) / 2;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    for (const l of lines) {
        const lp = l.px * sc;
        let px = lp;
        x.font = `700 ${px}px Fredoka, "Arial Rounded MT Bold", sans-serif`;
        while (x.measureText(l.t).width > W * 0.9 && px > 10) { px -= 2; x.font = `700 ${px}px Fredoka, sans-serif`; }
        const cy = y + lp * 0.58;
        x.lineWidth = Math.max(4, px * 0.2); x.strokeStyle = '#16121f'; x.strokeText(l.t, W / 2, cy);
        x.fillStyle = l.c || '#ffffff'; x.fillText(l.t, W / 2, cy);
        y += lp * 1.1;
    }
    return cv;
}
function panel(lines, w, h, pos, rotY, opts) {
    opts = opts || {};
    const W = 1024, H = Math.round(W * h / w);
    const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: texFrom(panelCanvas(lines, W, H, opts.bg, opts.border)), transparent: true, toneMapped: false, side: opts.double ? T.DoubleSide : T.FrontSide }));
    m.position.copy(pos); m.rotation.y = rotY || 0;
    scene.add(m);
    m.userData.set = (nl) => { m.material.map.dispose(); m.material.map = texFrom(panelCanvas(nl, W, H, opts.bg, opts.border)); m.material.needsUpdate = true; };
    return m;
}
// Big outlined words floating in the world ("+2 Wins", "x25 Jumps")
function bigWords(lines, worldW, pos, parent) {
    return billboard(lines.map((l) => ({ t: l.t, c: l.c, s: '#16121f', px: l.px || 80 })), worldW, 1024, pos, parent);
}
const SPHERE = new T.SphereGeometry(1, 16, 12);
const CYL = new T.CylinderGeometry(1, 1, 1, 24);
function mesh(geo, material, sx, sy, sz, x, y, z, cast) {
    const m = new T.Mesh(geo, material);
    m.scale.set(sx, sy, sz); m.position.set(x, y, z);
    if (cast) m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false; m.updateMatrix();
    scene.add(m);
    return m;
}

// =====================================================================================
// The crunchy floor: thousands of bevelled tiles (one instanced mesh per island)
// =====================================================================================
const TILE = 6;
const TILE_GEO = new RoundedBoxGeometry(TILE - 0.25, 1.2, TILE - 0.25, 2, 0.45);
const tileFields = []; // { x0, z0, nx, nz, colors: Uint32Array }
function tileField(x0, x1, z0, z1, colorAt) {
    const nx = Math.floor((x1 - x0) / TILE), nz = Math.floor((z1 - z0) / TILE);
    const im = new T.InstancedMesh(TILE_GEO, new T.MeshLambertMaterial({ color: 0xffffff }), nx * nz);
    const m4 = new T.Matrix4(), c = new T.Color();
    const colors = new Uint32Array(nx * nz);
    let i = 0;
    for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const cx = x0 + (a + 0.5) * TILE, cz = z0 + (b + 0.5) * TILE;
        const hex = colorAt(cx, cz, a, b);
        colors[a * nz + b] = hex;
        m4.makeTranslation(cx, -0.6 - (((a * 7 + b * 13) % 5) * 0.02), cz);
        im.setMatrixAt(i, m4);
        c.setHex(hex).offsetHSL(0, 0, (((a * 31 + b * 17) % 7) - 3) * 0.008);
        im.setColorAt(i, c);
        i++;
    }
    im.receiveShadow = true;
    scene.add(im);
    tileFields.push({ x0, z0, nx, nz, colors });
    // One solid slab under the tiles
    solids.push(aabb((x0 + x1) / 2, -2, (z0 + z1) / 2, x1 - x0, 4, z1 - z0));
    box(x1 - x0 + 3, 4, z1 - z0 + 3, (x0 + x1) / 2, -2.6, (z0 + z1) / 2, 0x1f5fd0, { decor: true });
    return im;
}
// The tile colour under a point (for the crunch shards), or null off the floor
export function floorColor(x, z) {
    for (const f of tileFields) {
        const a = Math.floor((x - f.x0) / TILE), b = Math.floor((z - f.z0) / TILE);
        if (a >= 0 && b >= 0 && a < f.nx && b < f.nz) return f.colors[a * f.nz + b];
    }
    return null;
}
// Wall step theme colour under a point (for shards on the wall)
export function surfaceColor(x, y, z) {
    if (y < 1) return floorColor(x, z) || 0x2f86ff;
    for (const t of TIERS) {
        const w = WALLS[t.wall];
        if (Math.abs(y - t.h) < 1 && x > w.x - w.w / 2 && x < w.x + w.w / 2 && z >= t.z0 && z <= t.z0 + w.depth) return new T.Color(themeColor(t.theme)).getHex();
    }
    return 0xffffff;
}

// =====================================================================================
// Crunch! A crack decal and flying shards where your foot lands
// =====================================================================================
const crackMat = new T.MeshBasicMaterial({ map: crackTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false });
const cracks = [];
for (let i = 0; i < 48; i++) {
    const m = new T.Mesh(new T.PlaneGeometry(1, 1), crackMat.clone());
    m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 2;
    scene.add(m);
    cracks.push({ m, t: 0 });
}
let crackI = 0;
const shards = [];
const SHARD_GEO = new T.BoxGeometry(1, 1, 1);
for (let i = 0; i < 90; i++) {
    const m = new T.Mesh(SHARD_GEO, new T.MeshLambertMaterial({ color: 0xffffff }));
    m.visible = false; scene.add(m);
    shards.push({ m, v: new V3(), t: 0 });
}
let shardI = 0;
export function crunchAt(pos, size) {
    const c = cracks[crackI++ % cracks.length];
    const s = (size || 1) * (3.6 + Math.random() * 1.6);
    c.m.position.set(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 0.04, pos.z + (Math.random() - 0.5) * 0.6);
    c.m.rotation.z = Math.random() * Math.PI * 2;
    c.m.scale.set(s, s, 1);
    c.m.visible = true; c.t = 5;
    c.m.material.opacity = 1;
    const col = surfaceColor(pos.x, pos.y, pos.z);
    for (let i = 0; i < 6; i++) {
        const sh = shards[shardI++ % shards.length];
        sh.m.material.color.setHex(i % 3 === 2 ? 0xffffff : col);
        sh.m.position.set(pos.x + (Math.random() - 0.5) * 1.2, pos.y + 0.2, pos.z + (Math.random() - 0.5) * 1.2);
        sh.m.scale.setScalar(0.25 + Math.random() * 0.3);
        sh.v.set((Math.random() - 0.5) * 9, 6 + Math.random() * 7, (Math.random() - 0.5) * 9);
        sh.m.visible = true; sh.t = 0.7 + Math.random() * 0.3;
    }
}
function updateCrunch(dt) {
    for (const c of cracks) {
        if (!c.m.visible) continue;
        c.t -= dt;
        c.m.material.opacity = Math.min(1, c.t / 1.5);
        if (c.t <= 0) c.m.visible = false;
    }
    for (const s of shards) {
        if (!s.m.visible) continue;
        s.t -= dt;
        s.v.y -= 40 * dt;
        s.m.position.addScaledVector(s.v, dt);
        s.m.rotation.x += dt * 9; s.m.rotation.z += dt * 7;
        if (s.t <= 0) s.m.visible = false;
    }
}

// =====================================================================================
// Decorations: clouds, giant food props, palm-free candy island
// =====================================================================================
const clouds = [];
function cloud(x, y, z, s) {
    const g = new T.Group();
    const m = mat(0xffffff);
    for (let i = 0; i < 5; i++) {
        const c = new T.Mesh(SPHERE, m);
        c.scale.set((3 + rng() * 3) * s, (2 + rng() * 1.5) * s, (3 + rng() * 2) * s);
        c.position.set((i - 2) * 3.4 * s, rng() * 1.5 * s, (rng() - 0.5) * 3 * s);
        g.add(c);
    }
    g.position.set(x, y, z);
    scene.add(g);
    skinRig(g); // one mesh per cloud (it drifts as a whole)
    clouds.push({ g, sp: 0.6 + rng() * 0.8 });
}
function burger(x, z, s) {
    mesh(SPHERE, mat(0xe8a050), 4 * s, 1.6 * s, 4 * s, x, 4.6 * s, z, true);
    mesh(CYL, mat(0x46c83a), 4.4 * s, 0.4 * s, 4.4 * s, x, 3.2 * s, z);
    mesh(CYL, mat(0xffc414), 4.3 * s, 0.35 * s, 4.3 * s, x, 2.85 * s, z);
    mesh(CYL, mat(0x6a3a1e), 4.1 * s, 1.1 * s, 4.1 * s, x, 2.2 * s, z, true);
    mesh(CYL, mat(0xe8a050), 4 * s, 1.2 * s, 4 * s, x, 1 * s, z, true);
    solids.push(aabb(x, 3 * s, z, 7 * s, 6 * s, 7 * s));
}
function fries(x, z, s) {
    box(5 * s, 5 * s, 3 * s, x, 2.5 * s, z, 0xe8283c, { cast: true });
    for (let i = 0; i < 9; i++) box(0.7 * s, 4 * s, 0.7 * s, x - 1.8 * s + (i % 5) * 0.9 * s, 5.5 * s + (i % 3) * 0.5 * s, z - 0.6 * s + Math.floor(i / 5) * 1.1 * s, 0xffd23a, { decor: true, cast: true });
}
function hotdog(x, z, s, rot) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rot || 0; scene.add(g);
    const bun = new T.Mesh(new T.CapsuleGeometry(1.6 * s, 7 * s, 6, 12), mat(0xe8a050)); bun.rotation.z = Math.PI / 2; bun.position.y = 1.6 * s; bun.scale.set(1, 1, 1.3); bun.castShadow = true; g.add(bun);
    const dog = new T.Mesh(new T.CapsuleGeometry(1 * s, 8.4 * s, 6, 12), mat(0xc8401e)); dog.rotation.z = Math.PI / 2; dog.position.y = 2.7 * s; g.add(dog);
    const mus = new T.Mesh(new T.TorusGeometry(0.3 * s, 0.25 * s, 6, 12), mat(0xffd028)); mus.position.set(0, 3.7 * s, 0); mus.scale.set(12, 1, 1); g.add(mus);
    skinRig(g);
}
function cornDog(x, z, s) {
    mesh(CYL, mat(0xf0d0a0), 0.25 * s, 6 * s, 0.25 * s, x, 3 * s, z);
    mesh(new T.CapsuleGeometry(1.2 * s, 3.4 * s, 6, 12), mat(0xffb51c), 1, 1, 1, x, 7.4 * s, z, true);
}
function donut(x, y, z, s, rotY) {
    const g = new T.Group(); g.position.set(x, y, z); g.rotation.set(Math.PI / 2 - 0.25, rotY || 0, 0); scene.add(g);
    g.add(new T.Mesh(new T.TorusGeometry(3 * s, 1.5 * s, 12, 28), mat(0xe8a050)));
    const icing = new T.Mesh(new T.TorusGeometry(3 * s, 1.35 * s, 12, 28, Math.PI * 2), mat(0xff8fd0)); icing.position.z = -0.35 * s; icing.scale.z = 0.8; g.add(icing);
    skinRig(g);
}
function cupcake(x, z, s) {
    mesh(new T.CylinderGeometry(2.4, 1.8, 3, 18), mat(0x46b8ff), s, s, s, x, 1.5 * s, z, true);
    mesh(SPHERE, mat(0xfff0f6), 2.6 * s, 1.6 * s, 2.6 * s, x, 3.4 * s, z, true);
    mesh(SPHERE, mat(0xff8fd0), 1.8 * s, 1.3 * s, 1.8 * s, x, 4.6 * s, z, true);
    mesh(SPHERE, mat(0xe8283c), 0.6 * s, 0.6 * s, 0.6 * s, x, 6 * s, z);
    solids.push(aabb(x, 2.5 * s, z, 4.4 * s, 5 * s, 4.4 * s));
}
function lollipop(x, z, s, color) {
    mesh(CYL, mat(0xffffff), 0.35 * s, 9 * s, 0.35 * s, x, 4.5 * s, z, true);
    const g = new T.Mesh(new T.CylinderGeometry(2.6 * s, 2.6 * s, 0.8 * s, 28), mat(color || 0xff3fa0));
    g.rotation.x = Math.PI / 2; g.position.set(x, 10.5 * s, z); g.castShadow = true; scene.add(g);
    const sw = new T.Mesh(new T.TorusGeometry(1.5 * s, 0.35 * s, 6, 24), mat(0xffffff)); sw.position.set(x, 10.5 * s, z + 0.45 * s); scene.add(sw);
    tickers.push((dt) => { g.rotation.y += dt * 0.5; sw.rotation.z += dt * 0.5; });
}

// =====================================================================================
// Islands
// =====================================================================================
function buildSea() {
    const sea = new T.Mesh(new T.PlaneGeometry(9000, 9000), seaMat);
    sea.rotation.x = -Math.PI / 2; sea.position.set(500, -3.4, 200); scene.add(sea);
    tickers.push((dt) => { waterTexture.offset.x += dt * 0.01; waterTexture.offset.y += dt * 0.006; });
}
function buildMainIsland() {
    tileField(-HX, HX, Z0, MAIN_END, (x, z) => {
        if (z > WALLS[0].z - 44) return 0xe8283c;                       // red field by the wall
        if (Math.abs(x) < 9) return 0x7fd0ff;                            // light-blue path to the wall
        if (x < -36 && z < 22) return 0xff8a1e;                          // trampoline yard
        return 0x2f86ff;                                                 // blue crunch
    });
    // Studded walkway rims along the boost pads and the boxes
    texturedBox(14, 0.3, 112, BOOST_PADS[0].x, 0.15, -2, walkMaterial(3, 28), false);
    texturedBox(36, 0.3, 26, 24, 0.15, 14, walkMaterial(9, 6), false);
}
// A closed box of tall blue studded walls with a wavy rounded top (the lobby walls in the reference).
// An invisible barrier goes on far above them so nobody can jump out of the map.
const WAVE_GEO = new T.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
function boundary(x0, x1, z0, z1, color) {
    const H = FENCE_H, TH = 4;
    const sides = [
        [x1 - x0 + TH * 2, (x0 + x1) / 2, z0 - TH / 2, true], [x1 - x0 + TH * 2, (x0 + x1) / 2, z1 + TH / 2, true],
        [z1 - z0, x0 - TH / 2, (z0 + z1) / 2, false], [z1 - z0, x1 + TH / 2, (z0 + z1) / 2, false],
    ];
    const waves = [];
    for (const [len, cx, cz, alongX] of sides) {
        const sx = alongX ? len : TH, sz = alongX ? TH : len;
        texturedBox(sx, H, sz, cx, H / 2, cz, wallMaterial(len, H), false);
        solids.push(aabb(cx, 4000, cz, sx, 8000, sz));
        const n = Math.round(len / 7);
        for (let i = 0; i < n; i++) {
            const k = (i + 0.5) / n - 0.5;
            waves.push([alongX ? cx + k * len : cx, H, alongX ? cz : cz + k * len]);
        }
    }
    const im = new T.InstancedMesh(WAVE_GEO, new T.MeshLambertMaterial({ color }), waves.length);
    const m4 = new T.Matrix4(), q = new T.Quaternion(), sc = new V3();
    waves.forEach(([x, y, z], i) => {
        const r = 3.4 + ((i * 7) % 5) * 0.35;
        sc.set(r, r * 0.9, r);
        m4.compose(new V3(x, y, z), q, sc);
        im.setMatrixAt(i, m4);
    });
    im.castShadow = false; im.receiveShadow = true;
    scene.add(im);
}
const wallMaterial = (w, h) => foodMaterial('wall', w / 6, h / 6);
function buildSpawnPad(p, label) {
    box(12, 0.6, 12, p.x, 0.3, p.z, 0xb9b3c9, { studs: true });
    neon(12.4, 0.3, 0.4, p.x, 0.65, p.z - 6, 0x6fe0ff); neon(12.4, 0.3, 0.4, p.x, 0.65, p.z + 6, 0x6fe0ff);
    neon(0.4, 0.3, 12.4, p.x - 6, 0.65, p.z, 0x6fe0ff); neon(0.4, 0.3, 12.4, p.x + 6, 0.65, p.z, 0x6fe0ff);
    if (label) panel([{ t: label, px: 90, c: '#ffe14a' }], 16, 3.4, new V3(p.x, 6, p.z - 9), Math.PI, { bg: '#1f6bff', border: '#ffd028' });
}

// =====================================================================================
// The escape walls: giant crunchy steps, "N Studs" on each front, a Wins pad on each
// =====================================================================================
const tierItems = [];
function buildWall(w, wi) {
    const n = w.tiers.length;
    const x0 = w.x - w.w / 2;
    let prevH = 0;
    TIERS.forEach((t, ti) => {
        if (t.wall !== wi) return;
        const d = t.last ? w.depth + 10 : w.depth;
        const m = new T.Mesh(UNIT, foodBoxMaterials(t.theme, t.w, t.h, d, t.h > 400 ? 12 : 8));
        m.scale.set(t.w, t.h, d); m.position.set(w.x, t.h / 2, t.z0 + d / 2);
        m.receiveShadow = true; m.castShadow = t.h < 300;
        m.matrixAutoUpdate = false; m.updateMatrix();
        scene.add(m);
        solids.push(aabb(w.x, t.h / 2, t.z0 + d / 2, t.w, t.h, d));
        // Frosting lip on the front edge
        box(t.w + 0.3, 0.9, 1.2, w.x, t.h - 0.2, t.z0 + 0.3, new T.Color(themeColor(t.theme)).lerp(new T.Color(0xffffff), 0.55).getHex(), { decor: true });
        // "20 Studs" on the front face, just under the top
        const sz = Math.min(26, 10 + t.rise * 0.08);
        panel([{ t: comma(t.h) + ' Studs', px: 120, c: '#ffffff' }], sz * 3, sz * 0.75, new V3(w.x, t.h - sz * 0.5 - 1, t.z0 - 0.12), Math.PI, { bg: 'none' });
        // Wins pad at the right end of the step
        const pad = new T.Mesh(CYL, mat(0x46ec50, { neon: true }));
        pad.scale.set(4.2, 0.5, 4.2); pad.position.set(t.x, t.h + 0.25, t.z); scene.add(pad);
        const ring = new T.Mesh(new T.TorusGeometry(4.4, 0.3, 8, 40), mat(0xffffff, { neon: true }));
        ring.rotation.x = Math.PI / 2; ring.position.set(t.x, t.h + 0.55, t.z); scene.add(ring);
        const label = bigWords([{ t: '+' + fmt(t.wins) + ' Wins', c: '#7dff6b', px: 96 }], 12, new V3(t.x, t.h + 6.5, t.z));
        triggers.push({ ...aabb(t.x, t.h + 2.5, t.z, 8.4, 5, 8.4), enter: () => actions.tier(ti) });
        tierItems.push({ t, ti, pad, ring, label, ok: null });
        prevH = t.h;
    });
    // The top: a giant trophy and an ESCAPE! sign
    const top = TIERS.filter((t) => t.wall === wi).pop();
    const tz = top.z0 + w.depth / 2 + 4;
    box(6, 2, 6, w.x, top.h + 1, tz, 0xffc414, { cast: true });
    box(2, 5, 2, w.x, top.h + 4.5, tz, 0xffc414, { decor: true, cast: true });
    const cup = mesh(new T.CylinderGeometry(5, 2.6, 7, 24, 1, true), mat(0xffd028, { neon: true }), 1, 1, 1, w.x, top.h + 10.5, tz);
    cup.material.side = T.DoubleSide;
    panel([{ t: wi === 0 ? 'ESCAPE!' : 'MUCKBANG CHAMPION!', px: 120, c: '#ffe14a' }], 36, 9, new V3(w.x, top.h + 22, tz + 6), Math.PI, { bg: '#e8283c', border: '#ffd028' });
    // Wall name on the ground in front
    panel([{ t: w.name, px: 100, c: '#ffffff' }, { t: 'Climb for Wins!', px: 60, c: '#ffe14a' }], 26, 7.5, new V3(x0 - 4, 9, w.z - 4), Math.PI, { bg: '#e8283c', border: '#ffffff' });
    box(0.8, 6, 0.8, x0 - 4 - 9, 3, w.z - 3.6, 0x2b2546, { decor: true });
    box(0.8, 6, 0.8, x0 - 4 + 9, 3, w.z - 3.6, 0x2b2546, { decor: true });
    void n; void prevH;
}

// =====================================================================================
// Boost pads: "+2/Step · 1 Win Required" (stand on one to switch to it)
// =====================================================================================
const boostItems = [];
function numberTex(n, bg, fg) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = bg; x.beginPath(); x.roundRect(4, 4, 120, 120, 26); x.fill();
    x.font = '700 84px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 10; x.strokeStyle = '#16121f'; x.strokeText(String(n), 64, 70);
    x.fillStyle = fg; x.fillText(String(n), 64, 70);
    return texFrom(c);
}
function buildBoostPads() {
    for (const b of BOOST_PADS) {
        const u = STEP_UPG[b.lv];
        const base = new T.Mesh(new RoundedBoxGeometry(6.4, 0.8, 6.4, 2, 0.3), new T.MeshLambertMaterial({ color: 0x3a3f52 }));
        base.position.set(b.x, 0.5, b.z); base.receiveShadow = true; scene.add(base);
        const top = new T.Mesh(new T.PlaneGeometry(5.6, 5.6), new T.MeshBasicMaterial({ map: numberTex(b.lv, '#4a5068', '#ffffff'), transparent: true }));
        top.rotation.x = -Math.PI / 2; top.rotation.z = -Math.PI / 2; top.position.set(b.x, 0.92, b.z); scene.add(top);
        const label = bigWords([{ t: '+' + fmt(u.per) + '/Step', c: '#ffffff', px: 86 }, { t: comma(u.req) + (u.req === 1 ? ' Win' : ' Wins') + ' Required', c: '#ffe14a', px: 52 }], 9.5, new V3(b.x, 6.2, b.z));
        triggers.push({ ...aabb(b.x, 2, b.z, 5.6, 4, 5.6), enter: () => actions.boostPad(b.lv) });
        boostItems.push({ b, u, base, top, label, state: '' });
    }
    // The 2x Step pass pad at the end of the row
    const d = DOUBLE_STEP_PAD;
    const pad = new T.Mesh(new RoundedBoxGeometry(7, 0.8, 7, 2, 0.3), mat(0x22c73a));
    pad.position.set(d.x, 0.5, d.z); scene.add(pad);
    neon(7.2, 0.15, 7.2, d.x, 0.95, d.z, 0x7dff6b);
    bigWords([{ t: '2x Step', c: '#7dff6b', px: 90 }, { t: buxText(PASSES.DoubleStep.price), c: '#ffe14a', px: 60 }], 8, new V3(d.x, 6.5, d.z));
    triggers.push({ ...aabb(d.x, 2, d.z, 6, 4, 6), enter: () => actions.boostPad(0, true) });
    panel([{ t: 'BOOST PADS', px: 100, c: '#ffe14a' }, { t: 'More Jump per step!', px: 60, c: '#ffffff' }], 16, 5, new V3(BOOST_PADS[0].x - 8, 4, BOOST_PADS[0].z - 7), -Math.PI * 0.75, { bg: '#1f6bff', border: '#ffd028' });
}
function refreshBoostPads() {
    for (const it of boostItems) {
        const state = S.stepLv === it.b.lv ? 'on' : S.totalWins >= it.u.req ? 'open' : 'lock';
        if (state === it.state) continue;
        it.state = state;
        it.base.material.color.setHex(state === 'on' ? 0xffd028 : state === 'open' ? 0xd8dce8 : 0x3a3f52);
        it.top.material.map.dispose();
        it.top.material.map = numberTex(it.b.lv, state === 'on' ? '#ffe14a' : state === 'open' ? '#eef0f8' : '#4a5068', state === 'lock' ? '#9aa0b8' : '#ffffff');
        it.top.material.needsUpdate = true;
    }
}

// =====================================================================================
// Trampolines (x1.5 free, x2 after 8 minutes, the rest are passes)
// =====================================================================================
export const trampLocked = (def) => !trampOpen(def, S);
const trampItems = [];
function trampLabel(def) {
    const big = def.mult >= 100;
    const lines = [{ t: def.name, c: big ? '#ffe14a' : def.mult >= 8 ? '#6fe0ff' : '#ffffff', px: 80 }];
    if (def.pass) lines.push(trampLocked(def) ? { t: buxText(PASSES[def.pass].price), c: '#7dff6b', px: 56 } : { t: '★ OWNED', c: '#7dff6b', px: 46 });
    else if (def.playtime) {
        const left = def.playtime * 60 - (S.playtime || 0) - (performance.now() - playtimeAt) / 1000;
        lines.push(left > 0 ? { t: 'Unlocks in ' + clock(left) + ' of playtime!', c: '#ff6b8a', px: 44 } : { t: '★ UNLOCKED', c: '#7dff6b', px: 46 });
    }
    return lines;
}
let playtimeAt = performance.now();
export function syncPlaytime() { playtimeAt = performance.now(); }
const beamTex = (() => {
    const c = document.createElement('canvas'); c.width = 4; c.height = 128;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.7, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 128);
    return texFrom(c);
})();
function buildTrampoline(def) {
    // Chunky rounded rim like the reference's toy trampolines, on three stubby legs
    const rim = new T.Mesh(new T.TorusGeometry(def.r, 0.75, 10, 36), mat(def.color));
    rim.rotation.x = Math.PI / 2; rim.position.set(def.x, TRAMP_TOP - 0.2, def.z); rim.castShadow = true; scene.add(rim);
    for (let k = 0; k < 3; k++) {
        const a = k / 3 * Math.PI * 2 + 0.5;
        box(1.2, TRAMP_TOP, 1.2, def.x + Math.cos(a) * def.r, TRAMP_TOP / 2 - 0.3, def.z + Math.sin(a) * def.r, new T.Color(def.color).multiplyScalar(0.75).getHex(), { decor: true });
    }
    const netM = new T.Mesh(new T.CircleGeometry(def.r - 0.4, 36), def.mult >= 100 ? mat(def.color, { neon: true }) : netMaterial());
    netM.rotation.x = -Math.PI / 2; netM.position.set(def.x, TRAMP_TOP - 0.1, def.z); netM.receiveShadow = true;
    scene.add(netM);
    const solid = aabb(def.x, TRAMP_TOP / 2, def.z, def.r * 1.7, TRAMP_TOP, def.r * 1.7);
    solid.tramp = def;
    solids.push(solid);
    const label = bigWords(trampLabel(def), 13, new V3(def.x, 10, def.z));
    const lock = billboard([{ t: '🔒', c: '#ffffff', px: 120 }], 4, 256, new V3(def.x, 4.5, def.z));
    const beamMat = new T.MeshBasicMaterial({ map: beamTex, color: new T.Color(def.color).multiplyScalar(1.6), transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const beam = new T.Mesh(new T.CylinderGeometry(def.r - 0.6, def.r - 0.3, 14, 40, 1, true), beamMat);
    beam.position.set(def.x, TRAMP_TOP + 7, def.z); scene.add(beam);
    trampItems.push({ def, label, lock, net: netM, owned: null, sq: 0, beam, bubT: 0, labelKey: '' });
}
export function squashTramp(def) {
    const it = trampItems.find((t) => t.def === def);
    if (!it) return;
    it.sq = 1;
    bubbleBurst(new V3(def.x, TRAMP_TOP, def.z), def.color, def.r);
}

// =====================================================================================
// Boxes (eggs), the Trail Shop, the Win Shop, the Muckbang portal and the event screen
// =====================================================================================
function buildBoxes() {
    for (const spot of BOX_SPOTS) {
        const b = BOXES.find((x) => x.id === spot.id);
        box(7, 1, 7, spot.x, 0.5, spot.z, 0xffffff, { studs: true });
        let model;
        if (b.id === 'Galaxy' || b.id === 'Secret') {
            model = new T.Mesh(new T.SphereGeometry(2.6, 24, 16), new T.MeshLambertMaterial({ color: b.color, emissive: b.id === 'Galaxy' ? 0x4a1c9a : 0x1a1030 }));
            model.position.set(spot.x, 4.2, spot.z);
            const q = billboard([{ t: '?', c: '#ffffff', s: '#16121f', px: 140 }], 3, 256, new V3(spot.x, 4.4, spot.z - 2.7));
            void q;
        } else {
            model = new T.Mesh(new RoundedBoxGeometry(4.6, 3.4, 4.6, 3, 0.7), new T.MeshLambertMaterial({ color: b.color }));
            model.position.set(spot.x, 2.8, spot.z);
            const lid = new T.Mesh(new RoundedBoxGeometry(5, 1, 5, 2, 0.4), new T.MeshLambertMaterial({ color: new T.Color(b.color).multiplyScalar(0.8) }));
            lid.position.y = 1.9; model.add(lid);
        }
        model.castShadow = true;
        scene.add(model);
        const glow = new T.Mesh(new T.TorusGeometry(3.3, 0.18, 8, 40), mat(b.product ? 0xc46bff : 0xffd028, { neon: true }));
        glow.rotation.x = Math.PI / 2; glow.position.set(spot.x, 1.1, spot.z); scene.add(glow);
        const price = b.product ? { t: buxText(PRODUCTS[b.product].price), c: '#7dff6b', px: 64 } : { t: '🏆 ' + fmt(b.cost) + ' Wins', c: '#ffe14a', px: 64 };
        bigWords([{ t: b.name, c: b.id === 'Galaxy' ? '#c46bff' : b.id === 'Secret' ? '#ff6b8a' : '#ffffff', px: 84 }, price], 9, new V3(spot.x, 8.6, spot.z));
        tickers.push((dt, t) => { model.rotation.y = Math.sin(t * 0.8 + spot.x) * 0.3; model.position.y = (b.product ? 4.2 : 2.8) + Math.sin(t * 2 + spot.z) * 0.2; });
        prompts.push({ pos: new V3(spot.x, 0, spot.z), r: 6.5, label: () => 'Open ' + b.name + (b.product ? '' : ' (' + fmt(b.cost) + ' Wins)'), act: () => actions.hatch(b.id) });
    }
    panel([{ t: 'PET BOXES', px: 100, c: '#ffe14a' }, { t: 'Pets boost your Jumps!', px: 60, c: '#ffffff' }], 14, 4.4, new V3(24, 4.5, 1), Math.PI, { bg: '#c428ff', border: '#ffd028' });
}
function npc(x, z, rotY, shirt, ghost) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    const part = (sx, sy, sz, px, py, pz, c) => { const m = new T.Mesh(UNIT, mat(c)); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m; };
    part(1, 2, 1, -0.55, 1, 0, 0x1c1c22); part(1, 2, 1, 0.55, 1, 0, 0x1c1c22);
    part(2.2, 2.2, 1.1, 0, 3.1, 0, shirt);
    part(0.9, 2.1, 0.9, -1.6, 3.1, 0, shirt); part(0.9, 2.1, 0.9, 1.6, 3.1, 0, shirt);
    if (ghost) {
        part(1.8, 1.9, 1.6, 0, 5.1, 0, 0x16121f);
        const face = new T.Mesh(new T.CapsuleGeometry(0.6, 0.7, 4, 10), mat(0xf4f4f4)); face.position.set(0, 5.1, -0.55); face.scale.z = 0.4; g.add(face);
        for (const ex of [-0.25, 0.25]) { const e = new T.Mesh(SPHERE, mat(0x16121f)); e.scale.set(0.14, 0.24, 0.05); e.position.set(ex, 5.35, -0.82); g.add(e); }
        const mo = new T.Mesh(SPHERE, mat(0x16121f)); mo.scale.set(0.16, 0.3, 0.05); mo.position.set(0, 4.75, -0.82); g.add(mo);
    } else {
        part(1.6, 1.6, 1.6, 0, 5, 0, 0xf2d0a0);
        part(1.8, 0.6, 1.8, 0, 5.9, 0, 0x3a2618);
    }
    skinRig(g);
    return g;
}
function booth(x, z, rotY, color, title, sub) {
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    const part = (sx, sy, sz, px, py, pz, c, neonOn) => { const m = new T.Mesh(UNIT, mat(c, { neon: neonOn })); m.scale.set(sx, sy, sz); m.position.set(px, py, pz); m.castShadow = !neonOn; m.receiveShadow = true; g.add(m); return m; };
    part(12, 3.2, 3, 0, 1.6, -1.5, color);
    part(12.4, 0.5, 3.4, 0, 3.4, -1.5, 0xffffff);
    part(12, 10, 1, 0, 5, 5, color);
    part(1, 10, 1, -5.8, 5, 0, 0xffffff); part(1, 10, 1, 5.8, 5, 0, 0xffffff);
    part(13, 1.2, 8, 0, 10.4, 1, color);
    part(13.2, 0.3, 0.3, 0, 9.8, -3.1, 0xffd028, true);
    const sign = panel([{ t: title, px: 110, c: '#ffffff' }].concat(sub ? [{ t: sub, px: 60, c: '#ffe14a' }] : []), 12, 3.6, new V3(0, 12.6, -3.2), Math.PI, { bg: '#16121f', border: '#ffd028' });
    scene.remove(sign); g.add(sign);
    // World-space collision for the counter and the back wall
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const [cx, cz] = at(0, -1.5), [bx, bz] = at(0, 5);
    const along = Math.abs(c) > 0.5;
    solids.push(aabb(cx, 1.6, cz, along ? 12 : 3, 3.2, along ? 3 : 12));
    solids.push(aabb(bx, 5, bz, along ? 12 : 1, 10, along ? 1 : 12));
    skinRig(g);
    return g;
}
function buildShops() {
    // Win Shop: a ghost-mask seller behind a blue counter
    const ws = SPOTS.winShop;
    booth(ws.x + 6, ws.z, Math.PI / 2, 0x2f3fd8, '🏆 Win Shop');
    npc(ws.x + 9, ws.z, Math.PI / 2, 0x16121f, true);
    prompts.push({ pos: new V3(ws.x, 0, ws.z), r: 8, label: () => 'Win Shop', act: () => actions.openPanel('winshop') });
    // Trail Shop: a little blue machine stall
    const ts = SPOTS.trails;
    booth(ts.x - 6, ts.z, -Math.PI / 2, 0x1f6bff, 'TRAIL SHOP', 'x1.15 · x1.25 · x1.4 Jump');
    npc(ts.x - 9, ts.z, -Math.PI / 2, 0x2f7bff, false);
    prompts.push({ pos: new V3(ts.x, 0, ts.z), r: 8, label: () => 'Trail Shop', act: () => actions.openPanel('trails') });
}
let portalLabel = null, portalKey = '';
function buildPortal() {
    const p = SPOTS.portal;
    // Orange horseshoe arch ("MUCKBANG WORLD") with fast food all around it
    const arch = new T.Mesh(new T.TorusGeometry(8, 1.6, 12, 40, Math.PI), mat(0xff7a1e));
    arch.position.set(p.x, 1, p.z); arch.castShadow = true; scene.add(arch);
    for (const sx of [-8, 8]) { box(3.2, 1.6, 3.2, p.x + sx, 0.8, p.z, 0xff7a1e, { cast: true }); }
    const swirl = new T.Mesh(new T.CircleGeometry(6.4, 40, 0, Math.PI), new T.MeshBasicMaterial({ color: new T.Color(0xff3fa0).multiplyScalar(1.4), transparent: true, opacity: 0.6, side: T.DoubleSide }));
    swirl.position.set(p.x, 1, p.z); scene.add(swirl);
    tickers.push((dt, t) => { swirl.material.opacity = 0.45 + Math.sin(t * 3) * 0.15; });
    panel([{ t: 'MUCKBANG', px: 110, c: '#ffe14a' }, { t: 'WORLD', px: 110, c: '#ffffff' }], 14, 7, new V3(p.x, 13.5, p.z - 0.4), Math.PI, { bg: '#e8283c', border: '#ffd028' });
    portalLabel = bigWords([{ t: 'LVL 100 + 4 REBIRTH', c: '#ff6b8a', px: 70 }], 12, new V3(p.x, 18.5, p.z));
    triggers.push({ ...aabb(p.x, 3, p.z, 12, 6, 2), enter: () => actions.portal('muck') });
    burger(p.x - 16, p.z + 4, 1.2); fries(p.x + 15, p.z + 3, 1); hotdog(p.x, p.z + 12, 1.1, 0.4); cornDog(p.x - 11, p.z - 6, 1);
}
let eventScreen = null, eventKey = '';
function buildEventScreen() {
    const e = SPOTS.event;
    box(1.2, 8, 1.2, e.x - 8, 4, e.z, 0x2b2546, { cast: true }); box(1.2, 8, 1.2, e.x + 8, 4, e.z, 0x2b2546, { cast: true });
    box(20, 11, 1.4, e.x, 13, e.z + 0.4, 0x1f6bff, { cast: true });
    eventScreen = panel([{ t: 'Stay Tuned!', px: 100, c: '#ffffff' }], 18, 9.4, new V3(e.x, 13, e.z - 0.35), Math.PI, { bg: '#16121f', border: '#ff3fa0' });
}
function updateEventScreen() {
    const now = net.now(), live = crunchRush(now);
    const key = (live ? 'L' : 'W') + Math.floor(eventLeft(now));
    if (key === eventKey || !eventScreen) return;
    eventKey = key;
    eventScreen.userData.set(live
        ? [{ t: 'CRUNCH RUSH!', px: 90, c: '#7dff6b' }, { t: 'x2 JUMPS', px: 110, c: '#ffe14a' }, { t: 'Ends in ' + clock(eventLeft(now)), px: 60, c: '#ffffff' }]
        : [{ t: 'Stay Tuned!', px: 80, c: '#ffffff' }, { t: 'CRUNCH RUSH', px: 80, c: '#ff8fd0' }, { t: 'STARTS IN ' + clock(eventLeft(now)), px: 70, c: '#ffe14a' }]);
}

// =====================================================================================
// Leaderboards: Most Wins, Highest Playtime, Most JUMPS
// =====================================================================================
const boards = {};
const BOARD_LOOK = {
    wins: { title: 'Most Wins', col: '#ffd028', rim: 0xffb51c, unit: 'WINS' },
    playtime: { title: 'Highest Playtime', col: '#ff6bd5', rim: 0xff3fa0, unit: 'TIME' },
    jumps: { title: 'Most JUMPS', col: '#ff5a5a', rim: 0xe8283c, unit: 'JUMPS' },
};
function leaderboard(kind, x, z, rotY) {
    const L = BOARD_LOOK[kind];
    const g = new T.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
    for (const sx of [-5, 5]) { const p = new T.Mesh(UNIT, mat(0x2b2546)); p.scale.set(1, 6, 1); p.position.set(sx, 3, -0.4); p.castShadow = true; g.add(p); }
    const rim = new T.Mesh(UNIT, mat(L.rim, { neon: true })); rim.scale.set(13, 17, 0.6); rim.position.set(0, 14, -0.5); g.add(rim);
    const back = new T.Mesh(UNIT, mat(0x1d1b3a)); back.scale.set(12, 16, 0.8); back.position.set(0, 14, -0.2); g.add(back);
    const cv = document.createElement('canvas'); cv.width = 384; cv.height = 512;
    const tex = texFrom(cv);
    const scr = new T.Mesh(new T.PlaneGeometry(11.4, 15.2), new T.MeshBasicMaterial({ map: tex, toneMapped: false }));
    scr.position.set(0, 14, 0.25); g.add(scr);
    skinRig(g);
    solids.push(aabb(x, 3, z, 12, 6, 2));
    boards[kind] = { cv, tex, rows: [], kind };
}
let boardsAt = performance.now();
const hours = (s) => (s >= 3600 ? (Math.floor(s / 360) / 10) + 'h' : Math.floor(s / 60) + 'm');
function drawBoard(b) {
    const L = BOARD_LOOK[b.kind];
    const x = b.cv.getContext('2d');
    x.fillStyle = '#1d1b3a'; x.fillRect(0, 0, 384, 512);
    x.fillStyle = L.col; x.fillRect(0, 0, 384, 56);
    x.font = '700 34px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#16121f'; x.strokeText(L.title, 192, 30); x.fillStyle = '#ffffff'; x.fillText(L.title, 192, 30);
    x.font = '700 18px Fredoka, sans-serif'; x.fillStyle = '#9d97d0';
    x.textAlign = 'left'; x.fillText('#', 14, 74); x.fillText('NAME', 50, 74);
    x.textAlign = 'right'; x.fillText(L.unit, 372, 74);
    if (!b.rows.length) { x.textAlign = 'center'; x.fillStyle = '#cfc4f2'; x.font = '700 24px Fredoka, sans-serif'; x.fillText('Be the first!', 192, 250); }
    x.font = '700 23px Fredoka, sans-serif';
    b.rows.forEach((r, i) => {
        const y = 104 + i * 38;
        x.fillStyle = r.you ? 'rgba(70,236,80,0.28)' : i % 2 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)';
        x.fillRect(6, y - 17, 372, 34);
        x.fillStyle = i === 0 ? '#ffd028' : i === 1 ? '#dfe4f0' : i === 2 ? '#e0925a' : '#ffffff';
        x.textAlign = 'left'; x.fillText(String(i + 1), 14, y);
        x.fillStyle = r.you ? '#7dff6b' : '#ffffff'; x.fillText(r.n.slice(0, 14), 50, y);
        x.textAlign = 'right'; x.fillStyle = L.col; x.fillText(b.kind === 'playtime' ? hours(r.v) : fmt(r.v), 372, y);
    });
    const left = Math.max(0, Math.ceil(10 - (performance.now() - boardsAt) / 1000));
    x.font = 'italic 700 18px Fredoka, sans-serif'; x.textAlign = 'center'; x.fillStyle = '#ffd028';
    x.fillText('Refreshing in ' + left + 's', 192, 494);
    b.tex.needsUpdate = true;
}
export function renderBoards(msg) {
    if (!boards.wins || !msg) return;
    boardsAt = performance.now();
    for (const kind of Object.keys(BOARD_LOOK)) {
        const b = boards[kind];
        b.rows = (msg[kind] || []).map((r) => ({ n: r.n, v: r.v, you: r.n === S.name }));
        drawBoard(b);
    }
}
setInterval(() => { for (const k of Object.keys(boards)) drawBoard(boards[k]); }, 1000);

// =====================================================================================
// Muckbang World: a second island far away, with its own giant food wall
// =====================================================================================
function buildMuck() {
    const end = WALLS[1].z + WALLS[1].tiers.length * WALLS[1].depth + 30;
    tileField(MUCK.x - MUCK.halfX, MUCK.x + MUCK.halfX, MUCK.zMin, end, (x, z, a, b) => ((a + b) % 2 ? 0xd81e1e : 0xffc414));
    buildSpawnPad(MUCK_SPAWN, 'MUCKBANG WORLD');
    boundary(MUCK.x - MUCK.halfX, MUCK.x + MUCK.halfX, MUCK.zMin, end, 0xff7a1e);
    const r = SPOTS.muckReturn;
    const arch = new T.Mesh(new T.TorusGeometry(6, 1.3, 12, 40, Math.PI), mat(0x2f86ff));
    arch.position.set(r.x + 30, 1, r.z); arch.rotation.y = Math.PI / 2; scene.add(arch);
    panel([{ t: 'BACK TO SPAWN', px: 100, c: '#ffffff' }], 12, 3, new V3(r.x + 30, 10, r.z), -Math.PI / 2, { bg: '#1f6bff', border: '#ffd028', double: true });
    triggers.push({ ...aabb(r.x + 30, 3, r.z, 2, 6, 10), enter: () => actions.portal('home') });
    for (let i = 0; i < 6; i++) {
        const x = MUCK.x + (i % 2 ? -1 : 1) * (40 + (i * 7) % 20), z = MUCK.zMin + 20 + i * 14;
        [burger, fries, cupcake][i % 3](x, z, 1.6 + (i % 2) * 0.4);
    }
    hotdog(MUCK.x - 30, MUCK.zMin + 70, 2, 0.8); cornDog(MUCK.x + 26, MUCK.zMin + 64, 1.6);
    donut(MUCK.x + 50, 12, MUCK.zMin + 30, 2.2, 0.6); lollipop(MUCK.x - 52, MUCK.zMin + 40, 1.5, 0xffc414);
}

function buildDecor() {
    for (const [x, z] of [[-74, -62], [74, -64], [-76, 60], [72, 76], [-74, 100], [76, 110]]) cupcake(x, z, 1.4 + rng() * 0.6);
    for (const [x, z, c] of [[-68, 40, 0xff3fa0], [64, -10, 0x28c8ff], [-30, -66, 0xffc414], [30, -66, 0x7dff6b]]) lollipop(x, z, 1.1, c);
    donut(-120, 8, 60, 3, 0.4); donut(130, 10, 20, 3.4, -0.6); donut(-140, 6, 260, 4, 1.1); donut(150, 8, 300, 4, 0.2);
    for (let i = 0; i < 26; i++) cloud(-300 + rng() * 600, 80 + rng() * 300, Z0 - 60 + rng() * (MAIN_END - Z0 + 160), 1.6 + rng() * 2.2);
    for (let i = 0; i < 30; i++) cloud(-400 + rng() * 800, 420 + rng() * 1200, rng() * 500, 3 + rng() * 3);
    tickers.push((dt) => { for (const c of clouds) { c.g.position.x += c.sp * dt; if (c.g.position.x > 420) c.g.position.x = -420; } });
}

// =====================================================================================
// Live state: tier labels follow your Jump Height, trampoline locks follow your passes
// =====================================================================================
let lastHeight = -1, lastOpen = null;
export function refreshWorld() {
    if (S.height !== lastHeight) {
        lastHeight = S.height;
        for (const it of tierItems) {
            const ok = S.height + 2 >= it.t.rise;
            if (ok === it.ok) continue;
            it.ok = ok;
            it.pad.material = mat(ok ? 0x46ec50 : 0xff4a5a, { neon: true });
            it.label.userData.set([{ t: '+' + fmt(it.t.wins) + ' Wins', c: ok ? '#7dff6b' : '#ff6b6b', s: '#16121f', px: 96 }]
                .concat(ok ? [] : [{ t: 'Need ' + it.t.rise + ' Jump Height', c: '#ffffff', s: '#16121f', px: 52 }]));
        }
    }
    refreshBoostPads();
    for (const it of trampItems) {
        const owned = !trampLocked(it.def);
        const key = owned + '|' + (it.def.playtime && !owned ? Math.floor(((S.playtime || 0) + (performance.now() - playtimeAt) / 1000)) : '');
        if (key === it.labelKey) continue;
        it.labelKey = key;
        it.owned = owned;
        it.lock.visible = !owned;
        it.label.userData.set(trampLabel(it.def).map((l) => ({ ...l, s: '#16121f' })));
    }
    const open = muckOpen(S);
    if (open !== lastOpen && portalLabel) {
        lastOpen = open;
        portalLabel.userData.set([{ t: open ? 'OPEN!' : 'LVL 100 + 4 REBIRTH', c: open ? '#7dff6b' : '#ff6b8a', s: '#16121f', px: 70 }]);
    }
}
export function updateWorld(dt, t, pp) {
    for (const it of tierItems) it.ring.scale.setScalar(1 + Math.sin(t * 3 + it.t.h) * 0.06);
    for (const it of trampItems) {
        it.sq = Math.max(0, it.sq - dt * 4);
        it.net.position.y = TRAMP_TOP - 0.1 - Math.sin(it.sq * Math.PI) * 0.7;
        if (!it.owned) it.lock.position.y = 4.5 + Math.sin(t * 2 + it.def.x) * 0.3;
        const on = it.owned ? 1 : 0.25;
        it.beam.material.opacity = (0.26 + Math.sin(t * 2.4 + it.def.z) * 0.08 + it.sq * 0.4) * on;
        if (it.owned && (!pp || Math.hypot(pp.x - it.def.x, pp.z - it.def.z) < 120)) {
            it.bubT -= dt * (it.def.mult >= 25 ? 8 : 4);
            while (it.bubT <= 0) { it.bubT += 1; neonBubble(new V3(it.def.x, TRAMP_TOP, it.def.z), it.def.color, it.def.r - 1); }
        }
    }
    updateCrunch(dt);
    updateEventScreen();
}

// Where the Teleport menu sends you
export function teleportSpot(id) {
    if (id === 'boost') return new V3(BOOST_PADS[0].x - 8, 0.6, BOOST_PADS[0].z);
    if (id === 'tramps') return new V3(-38, 0.6, -32);
    if (id === 'boxes') return new V3(24, 0.6, 0);
    if (id === 'wall') return new V3(0, 0.6, WALLS[0].z - 16);
    if (id === 'muck') return MUCK_SPAWN.clone();
    return SPAWN.clone();
}

export function buildWorld() {
    buildSea();
    buildMainIsland();
    boundary(-HX, HX, Z0, MAIN_END, 0x2f6bff);
    buildSpawnPad(SPAWN);
    WALLS.forEach((w, i) => buildWall(w, i));
    buildBoostPads();
    TRAMPS.forEach((d) => buildTrampoline(d));
    panel([{ t: 'TRAMPOLINES', px: 100, c: '#ffe14a' }, { t: 'Bounce for Jumps!', px: 60, c: '#ffffff' }], 14, 4.4, new V3(-53, 4, -50), Math.PI, { bg: '#ff7a1e', border: '#ffffff' });
    buildBoxes();
    buildShops();
    buildPortal();
    buildEventScreen();
    for (const [i, kind] of ['wins', 'playtime', 'jumps'].entries()) leaderboard(kind, -50 + i * 14, 46, Math.PI);
    buildMuck();
    buildDecor();
    for (const k of Object.keys(boards)) drawBoard(boards[k]);
    refreshWorld();
    void foodMaterial; void petDef; void buildPet; void camera; void NEON_BOOST;
    // every box that never moves drawn together with the others that look the same
    batchStatic(scene);
}
