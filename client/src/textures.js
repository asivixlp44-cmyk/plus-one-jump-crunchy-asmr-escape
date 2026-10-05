import { T, texFrom } from './engine.js';

// Canvas-generated surface textures: crunchy food tiles for the floor and the wall steps
// (chocolate bars, cheese with holes, butter packs, lego bricks, waffles ...), the crack
// decal that appears under your feet, studded walkways and the trampoline net.

function canvas(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h || w;
    draw(c.getContext('2d'), c.width, c.height);
    return c;
}

const cache = new Map();
function repeated(img, key, rx, ry) {
    rx = Math.max(1, Math.round(rx)); ry = Math.max(1, Math.round(ry));
    const id = key + rx + 'x' + ry;
    if (cache.has(id)) return cache.get(id);
    const t = texFrom(img);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    cache.set(id, t);
    return t;
}
function lambert(id, color, map) {
    id = 'mat:' + id;
    if (cache.has(id)) return cache.get(id);
    const m = new T.MeshLambertMaterial({ color, map });
    cache.set(id, m);
    return m;
}
const shade = (hex, k) => {
    const c = new T.Color(hex);
    if (k > 0) c.lerp(new T.Color(0xffffff), k); else c.multiplyScalar(1 + k);
    return '#' + c.getHexString();
};

// A raised, bevelled segment: light top-left edge, dark bottom-right edge (chocolate bar look)
function segment(x, x0, y0, w, h, base, bev) {
    x.fillStyle = shade(base, -0.35); x.fillRect(x0, y0, w, h);
    x.fillStyle = shade(base, 0.32);
    x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + w, y0); x.lineTo(x0 + w - bev, y0 + bev); x.lineTo(x0 + bev, y0 + h - bev); x.lineTo(x0, y0 + h); x.closePath(); x.fill();
    x.fillStyle = shade(base, -0.18);
    x.beginPath(); x.moveTo(x0 + w, y0); x.lineTo(x0 + w, y0 + h); x.lineTo(x0, y0 + h); x.lineTo(x0 + bev, y0 + h - bev); x.lineTo(x0 + w - bev, y0 + bev); x.closePath(); x.fill();
    x.fillStyle = base; x.fillRect(x0 + bev, y0 + bev, w - bev * 2, h - bev * 2);
    x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(x0 + bev + 3, y0 + bev + 3, (w - bev * 2) * 0.5, 4);
}
function legoStuds(x, base, n, S) {
    const s = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const cx = s * (i + 0.5), cy = s * (j + 0.5), r = s * 0.3;
        x.fillStyle = shade(base, -0.22); x.beginPath(); x.arc(cx + 2, cy + 3, r, 0, Math.PI * 2); x.fill();
        x.fillStyle = shade(base, 0.12); x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.arc(cx - r * 0.3, cy - r * 0.3, r * 0.35, 0, Math.PI * 2); x.fill();
    }
}
const THEMES = {
    choco: ['#e8283c', 'bar'], orange: ['#ff7a1e', 'bar'], caramel: ['#e89a3a', 'lego'], butter: ['#f6e7a8', 'butter'],
    cheese: ['#ffdc3a', 'cheese'], lemon: ['#f0e43a', 'lego'], lime: ['#bdf07a', 'lego'], mint: ['#6ff0c8', 'bar'],
    cookie: ['#c8904a', 'cookie'], waffle: ['#e8b860', 'waffle'], candy: ['#ff6bd5', 'stripes'], jelly: ['#b04aff', 'bar'],
    gum: ['#ff8fd0', 'bar'], icecream: ['#bfe8ff', 'lego'], cake: ['#fff0f6', 'sprinkles'], macaron: ['#ffb0c8', 'bar'],
    galaxy: ['#3a1c8a', 'stars'], gold: ['#ffc414', 'bar'],
    bun: ['#e8a050', 'sesame'], lettuce: ['#5ad44a', 'bar'], cheddar: ['#ffb51c', 'cheese'], patty: ['#6a3a1e', 'grill'],
    fries: ['#ffd23a', 'fries'], donut: ['#ff8fd0', 'sprinkles'],
    blue: ['#2f86ff', 'bar'], wall: ['#2f6bff', 'lego'], sky: ['#7fd0ff', 'bar'], red: ['#e8283c', 'bar'], ketchup: ['#d81e1e', 'bar'], mustard: ['#ffc414', 'bar'],
};
export const themeColor = (theme) => (THEMES[theme] || THEMES.choco)[0];

const tileCache = new Map();
function tileImg(theme) {
    if (tileCache.has(theme)) return tileCache.get(theme);
    const [base, style] = THEMES[theme] || THEMES.choco;
    const S = 128;
    const img = canvas(S, S, (x) => {
        x.fillStyle = base; x.fillRect(0, 0, S, S);
        if (style === 'bar' || style === 'stripes' || style === 'sprinkles' || style === 'stars' || style === 'sesame' || style === 'grill') {
            segment(x, 0, 0, S, S, base, 14);
            if (style === 'stripes') {
                x.save(); x.beginPath(); x.rect(14, 14, S - 28, S - 28); x.clip();
                x.strokeStyle = 'rgba(255,255,255,0.75)'; x.lineWidth = 12;
                for (let i = -S; i < S * 2; i += 34) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke(); }
                x.restore();
            }
            if (style === 'sprinkles') {
                const cols = ['#ff3a3a', '#28c8ff', '#ffe14a', '#46ec50', '#c46bff', '#ffffff'];
                for (let i = 0; i < 22; i++) {
                    x.save(); x.translate(20 + ((i * 37) % 88), 20 + ((i * 53) % 88)); x.rotate(i * 1.3);
                    x.fillStyle = cols[i % cols.length]; x.fillRect(-7, -2.5, 14, 5); x.restore();
                }
            }
            if (style === 'stars') {
                for (let i = 0; i < 26; i++) { x.fillStyle = i % 4 ? '#ffffff' : '#ffd6ff'; const r = 1 + (i % 3); x.fillRect(16 + ((i * 41) % 96), 16 + ((i * 29) % 96), r, r); }
            }
            if (style === 'sesame') {
                x.fillStyle = '#fff4d0';
                for (let i = 0; i < 12; i++) { x.save(); x.translate(22 + ((i * 37) % 84), 22 + ((i * 59) % 84)); x.rotate(i); x.beginPath(); x.ellipse(0, 0, 6, 3, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
            }
            if (style === 'grill') {
                x.strokeStyle = 'rgba(30,14,6,0.55)'; x.lineWidth = 8;
                for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(18, 36 + i * 28); x.lineTo(S - 18, 30 + i * 28); x.stroke(); }
            }
        } else if (style === 'lego') {
            x.strokeStyle = shade(base, -0.25); x.lineWidth = 4; x.strokeRect(2, 2, S - 4, S - 4);
            legoStuds(x, base, 4, S);
        } else if (style === 'cheese') {
            x.fillStyle = shade(base, 0.12); x.fillRect(0, 0, S, 6);
            const holes = [[30, 34, 13], [86, 26, 9], [70, 78, 16], [22, 96, 8], [108, 104, 10], [104, 60, 6]];
            for (const [cx, cy, r] of holes) {
                x.fillStyle = shade(base, -0.3); x.beginPath(); x.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2); x.fill();
                x.fillStyle = shade(base, -0.12); x.beginPath(); x.ellipse(cx + r * 0.2, cy + r * 0.25, r * 0.75, r * 0.55, 0, 0, Math.PI * 2); x.fill();
            }
        } else if (style === 'butter') {
            segment(x, 0, 0, S, S, base, 6);
            x.font = '700 30px Fredoka, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
            x.fillStyle = '#2f6bd8'; x.fillText('BUTTER', S / 2, S / 2 - 8);
            x.font = '700 13px Fredoka, sans-serif'; x.fillText('4 OZ · SALTED', S / 2, S / 2 + 20);
        } else if (style === 'cookie') {
            segment(x, 0, 0, S, S, base, 10);
            x.fillStyle = '#4a2a14';
            for (const [cx, cy, r] of [[34, 30, 8], [84, 40, 7], [56, 76, 9], [100, 92, 7], [26, 98, 6], [92, 18, 5]]) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); }
        } else if (style === 'waffle') {
            const n = 4, s = S / n;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) segment(x, i * s + 4, j * s + 4, s - 8, s - 8, shade(base, -0.12), 5);
            x.fillStyle = shade(base, 0.1);
            for (let i = 0; i <= n; i++) { x.fillRect(i * s - 4, 0, 8, S); x.fillRect(0, i * s - 4, S, 8); }
        } else if (style === 'fries') {
            for (let i = 0; i < 6; i++) segment(x, i * 21 + 2, 0, 18, S, i % 2 ? base : shade(base, -0.08), 4);
        }
        x.strokeStyle = 'rgba(0,0,0,0.18)'; x.lineWidth = 2; x.strokeRect(1, 1, S - 2, S - 2);
    });
    tileCache.set(theme, img);
    return img;
}
// Crunchy food surface, one tile per `size` studs
export const foodMaterial = (theme, rx, ry) => lambert('food' + theme + Math.max(1, Math.round(rx)) + 'x' + Math.max(1, Math.round(ry)), 0xffffff, repeated(tileImg(theme), 'food' + theme, rx, ry));
// Box faces: [px, nx, py, ny, pz, nz] with each face tiled at its own size
export function foodBoxMaterials(theme, w, h, d, size) {
    const s = size || 6;
    const side = foodMaterial(theme, d / s, h / s), front = foodMaterial(theme, w / s, h / s), top = foodMaterial(theme, w / s, d / s);
    return [side, side, top, top, front, front];
}

// The white crack star that appears where you step ("crunch!")
export const crackTexture = (() => {
    const S = 256;
    const img = canvas(S, S, (x) => {
        x.lineCap = 'round'; x.lineJoin = 'round';
        const arms = 7, paths = [];
        for (let a = 0; a < arms; a++) {
            let ang = a / arms * Math.PI * 2 + (a % 2) * 0.3, px = S / 2, py = S / 2;
            const pts = [[px, py]];
            const len = 70 + (a * 37) % 50;
            for (let k = 1; k <= 5; k++) {
                ang += ((a * 13 + k * 7) % 10 - 5) * 0.07;
                px = S / 2 + Math.cos(ang) * len * k / 5; py = S / 2 + Math.sin(ang) * len * k / 5;
                pts.push([px, py]);
                if (k === 2 || k === 4) {
                    const b = ang + (k === 2 ? 0.7 : -0.6), bl = 22 + k * 4;
                    paths.push([[px, py], [px + Math.cos(b) * bl, py + Math.sin(b) * bl]]);
                }
            }
            paths.push(pts);
        }
        const draw = (w, col) => {
            x.strokeStyle = col; x.lineWidth = w;
            for (const pts of paths) { x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) x.lineTo(p[0], p[1]); x.stroke(); }
        };
        draw(9, 'rgba(40,30,60,0.35)');
        draw(4.5, 'rgba(255,255,255,0.95)');
        x.fillStyle = 'rgba(255,255,255,0.9)';
        x.beginPath(); x.arc(S / 2, S / 2, 9, 0, Math.PI * 2); x.fill();
    });
    return texFrom(img);
})();

// Light-blue studded walkway plates (the paths between the tile fields in the reference)
const studPlate = canvas(64, 64, (x) => {
    x.fillStyle = '#9fdcff'; x.fillRect(0, 0, 64, 64);
    for (const [cx, cy] of [[16, 16], [48, 16], [16, 48], [48, 48]]) {
        x.fillStyle = 'rgba(30,90,160,0.25)'; x.beginPath(); x.arc(cx + 1.5, cy + 2, 7.5, 0, Math.PI * 2); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.arc(cx, cy, 7, 0, Math.PI * 2); x.fill();
    }
    x.strokeStyle = 'rgba(30,90,160,0.18)'; x.lineWidth = 2; x.strokeRect(1, 1, 62, 62);
});
export const walkMaterial = (rx, ry) => lambert('walk' + Math.round(rx) + 'x' + Math.round(ry), 0xffffff, repeated(studPlate, 'walk', rx, ry));
// Trampoline net: dark mat with a faint grid
const netImg = canvas(64, 64, (x) => {
    x.fillStyle = '#23263a'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 2;
    for (let i = 0; i <= 64; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 64); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(64, i); x.stroke(); }
});
export const netMaterial = () => lambert('net', 0xffffff, repeated(netImg, 'net', 3, 3));
// Water: soft wavy stripes, scrolled by world.js
export const waterTexture = (() => {
    const t = texFrom(canvas(256, 256, (x) => {
        x.fillStyle = '#2aa8ff'; x.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 9; i++) {
            x.strokeStyle = i % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(20,90,200,0.25)'; x.lineWidth = 7;
            x.beginPath();
            for (let px = 0; px <= 256; px += 8) { const py = i * 30 + 12 + Math.sin(px / 256 * Math.PI * 4 + i) * 7; if (px) x.lineTo(px, py); else x.moveTo(px, py); }
            x.stroke();
        }
    }));
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(60, 60);
    return t;
})();
