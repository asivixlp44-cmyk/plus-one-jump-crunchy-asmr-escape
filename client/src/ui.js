import { $ } from './engine.js';
import { S, net, actions } from './state.js';
import * as BX from './bloxity.js';
import { sfx, getVolumes, setVolume } from './audio.js';
import { QUALITIES, getQuality, setQuality } from './fx.js';
import { fillIcons } from './icons.js';
import {
    CFG, PRODUCTS, PASSES, QUESTS, TUTORIAL_STEPS, FREE, DAILY, TRAILS, AURAS, PETS, BOXES, RARITY, TELEPORTS, STEP_UPG,
    xpFor, maxJumpHeight, passMult, rebirthMult, auraDef, trailDef, petDef, petMult, stepGain, crunchRush, eventLeft, muckOpen,
    rewardText, boxDef, fmt, fmtMult, comma, clock,
} from '../../shared/config.js';

// Bux coin + amount (our own strings only; never user text)
const bux = (n) => '<i class="bx" aria-hidden="true"></i>' + fmt(n);
const trophy = '<i data-icon="trophy"></i>';
function setHtml(node, html) { if (node && node.innerHTML !== html) node.innerHTML = html; }
function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }

const el = {
    wins: $('#winsVal'), jump: $('#jumpCount'), lvlName: $('#lvlName'), lvlXp: $('#lvlXp'), lvlFill: $('#lvlFill'),
    multPass: $('#multPass'), multAura: $('#multAura'), multReb: $('#multReb'),
    topText: $('#topText'), rush: $('#rushPill'), rushTxt: $('#rushTxt'), boost: $('#boostPill'), boostTxt: $('#boostTxt'),
    rebBadge: $('#rebBadge'), giftBadge: $('#giftBadge'), dailyBadge: $('#dailyBadge'),
    customIn: $('#customIn'), customMax: $('#customMax'), friend: $('#friendVal'), skip: $('#skipWall'),
    prompt: $('#promptBtn'), promptTxt: $('#promptTxt'),
};
export const promptEl = el.prompt, promptTxtEl = el.promptTxt;
fillIcons();

// ----- HUD -----
const shown = { wins: null, jumps: null };
function bump(node) { const s = node.closest('.bump-me'); if (!s) return; s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
// Wins and Jump count up smoothly to their new values
function ease(key, target, node, dt, suffix) {
    if (shown[key] === null) shown[key] = target;
    if (shown[key] === target) return;
    if (target > shown[key] && key === 'wins') bump(node);
    const diff = target - shown[key];
    shown[key] = Math.abs(diff) < 1 ? target : shown[key] + diff * Math.min(1, dt * 9);
    if (Math.abs(target - shown[key]) < Math.max(1, target * 0.001)) shown[key] = target;
    setText(node, (shown[key] < 1e6 ? comma(shown[key]) : fmt(shown[key])) + (suffix || ''));
}
export function animateCounters(dt) {
    ease('wins', S.wins, el.wins, dt);
    ease('jumps', S.jumps, el.jump, dt, ' Jump');
}

const statValue = (stat) => (stat === 'level' ? S.level : S[stat]) || 0;
const giftsReady = () => {
    const mins = (net.now() - S.joinedAt) / 60000;
    return FREE.filter((r, i) => mins >= r.min && !S.freeClaimed[i]).length;
};
// The Jump Height you actually jump: Custom Jump (if set) up to your max
export function jumpHeight() {
    const max = S.height;
    return S.custom > 0 ? Math.min(S.custom, max) : max;
}
let tutDoneUntil = 0;
export function tutorialComplete() { tutDoneUntil = performance.now() + 6000; }
export function updateHud(info) {
    const now = net.now();
    setText(el.lvlName, 'Level ' + S.level);
    const need = xpFor(S.level);
    el.lvlFill.style.width = Math.min(100, S.xp / need * 100) + '%';
    setText(el.lvlXp, (need < 1e6 ? comma(S.xp) + ' / ' + comma(need) : fmt(S.xp) + ' / ' + fmt(need)));
    setText(el.multPass, 'Multiplier: ' + fmtMult(passMult(S)) + ' (Gamepass)');
    setText(el.multAura, 'Multiplier: ' + fmtMult(auraDef(S.aura).mult) + ' (Aura)');
    setText(el.multReb, 'Multiplier: ' + fmtMult(rebirthMult(S)) + ' (Rebirth)');
    // Top line: the tutorial step, then the current quest
    const q = QUESTS[S.quest];
    if (performance.now() < tutDoneUntil) setText(el.topText, 'Tutorial Complete! Enjoy the game');
    else if (q) {
        const v = Math.min(statValue(q.stat), q.n);
        const tut = S.quest < TUTORIAL_STEPS;
        setHtml(el.topText, q.text.replace(/[<>&]/g, '') + (tut && q.n > 1 ? ' <small>(' + comma(v) + '/' + comma(q.n) + ')</small>' : !tut ? ' <small>Quest: ' + comma(v) + '/' + comma(q.n) + '</small>' : ''));
    } else setText(el.topText, '');
    // Event and boost pills
    const live = crunchRush(now);
    el.rush.hidden = !live;
    if (live) setText(el.rushTxt, 'CRUNCH RUSH x2 JUMPS ' + clock(eventLeft(now)));
    const b = (S.boostUntil - now) / 1000;
    el.boost.hidden = b <= 0;
    if (b > 0) setText(el.boostTxt, 'x2 JUMPS ' + clock(b));
    // Custom Jump: the box shows your setting, the label your max
    setText(el.customMax, 'Max: ' + S.height);
    if (document.activeElement !== el.customIn) {
        const v = String(S.custom > 0 ? Math.min(S.custom, S.height) : S.height);
        if (el.customIn.value !== v) el.customIn.value = v;
    }
    setText(el.friend, '+' + Math.round(Math.min(CFG.friendMax, S.friends || 0) * CFG.friendBoost * 100) + '%');
    el.skip.hidden = !info.nearWall;
    // Badges
    const gifts = giftsReady();
    el.rebBadge.hidden = S.level < CFG.rebirthLevel;
    el.giftBadge.hidden = gifts === 0; setText(el.giftBadge, String(gifts));
    el.dailyBadge.hidden = !(S.daily && S.daily.ready);
    document.querySelectorAll('[data-pass]').forEach((n) => {
        const k = n.dataset.pass;
        const pv = n.querySelector('.pv');
        if (pv) setHtml(pv, S.passes[k] ? 'OWNED' : bux(PASSES[k].price));
        n.classList.toggle('owned', !!S.passes[k]);
    });
    if (!$('#modal').hidden && LIVE.has(modalKind)) liveRefresh();
}
el.customIn.addEventListener('change', () => {
    const v = Math.floor(Number(el.customIn.value) || 0);
    S.custom = v >= S.height || v <= 0 ? 0 : Math.max(1, v);
    try { localStorage.setItem('jce_custom', String(S.custom)); } catch (e) { /* private mode */ }
    el.customIn.blur();
});
el.customIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') el.customIn.blur(); });
try { S.custom = Math.max(0, parseInt(localStorage.getItem('jce_custom'), 10) || 0); } catch (e) { /* default */ }

export function toast(text, color) {
    const d = document.createElement('div');
    d.className = 'toast o'; d.textContent = text; d.style.color = color || '#fff';
    const box = $('#toasts');
    box.appendChild(d);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 2400);
}
// "👟+1" popups that float up next to your character
export function popGain(text, kind, x, y) {
    const box = $('#gains');
    if (box.children.length > 14) box.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'gain o' + (kind ? ' ' + kind : '');
    d.innerHTML = '<i data-icon="shoe"></i><span></span>';
    d.lastChild.textContent = text;
    fillIcons(d);
    d.style.left = (x !== undefined ? x : 40 + Math.random() * 20) + '%';
    d.style.top = (y !== undefined ? y : 40 + Math.random() * 14) + '%';
    box.appendChild(d);
    setTimeout(() => d.remove(), 950);
}
export function bigText(text, color) {
    const d = $('#bigText');
    d.textContent = text; d.style.color = color || '#fff';
    d.classList.remove('show'); void d.offsetWidth; d.classList.add('show');
}
// Red strip under the top text: "You need 25 Jump Height for this step!"
let noticeTimer;
export function notice(text) {
    const n = $('#notice');
    n.textContent = text;
    n.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { n.hidden = true; }, 2600);
}
function flash(kind) {
    const f = $('#flash');
    f.classList.remove('show', 'gold'); void f.offsetWidth; f.classList.add('show');
    if (kind) f.classList.add(kind);
}
export function showWin(n) {
    const w = $('#winTop');
    w.textContent = '+' + comma(n) + (n === 1 ? ' WIN!' : ' WINS!');
    w.classList.remove('show'); void w.offsetWidth; w.classList.add('show');
    flash('gold');
}
// "Level Up! (1 -> 2)  Jump Height: 20" across the top, like the reference
export function levelUp(from, to, height) {
    flash();
    $('#lvlUpA').textContent = 'Level Up! (' + from + ' -> ' + to + ')';
    $('#lvlUpB').textContent = 'Jump Height: ' + height;
    const d = $('#lvlUpTxt');
    d.classList.remove('show'); void d.offsetWidth; d.classList.add('show');
}
export function showOffline(n, secs) {
    $('#offAmount').textContent = '+' + fmt(n) + ' Jump';
    const h = Math.floor(secs / 3600), m = Math.floor(secs / 60) % 60;
    $('#offNote').textContent = 'You were away for ' + (h ? h + 'h ' : '') + m + 'm. Your shoes kept crunching!';
    $('#offlinePop').hidden = false;
}
$('#offOk').addEventListener('click', () => { $('#offlinePop').hidden = true; sfx('buy'); });

// Box opening: the box shakes, then the pet card pops out
let hatchQueue = [], hatching = false;
export function showHatch(boxId, petId) {
    hatchQueue.push({ boxId, petId });
    if (!hatching) nextHatch();
}
function nextHatch() {
    const h = hatchQueue.shift();
    if (!h) { hatching = false; $('#hatch').hidden = true; return; }
    hatching = true;
    const d = petDef(h.petId) || PETS[0];
    const box = boxDef(h.boxId);
    $('#hatch').hidden = false;
    $('#hatchBox').hidden = false; $('#hatchCard').hidden = true;
    $('#hatchBox').textContent = box && box.id === 'Secret' ? '🥚' : box && box.id === 'Galaxy' ? '🔮' : '📦';
    sfx('shake');
    setTimeout(() => {
        $('#hatchBox').hidden = true; $('#hatchCard').hidden = false;
        $('#hatchIc').textContent = d.ic;
        $('#hatchName').textContent = d.id;
        $('#hatchRar').textContent = d.r; $('#hatchRar').style.color = RARITY[d.r];
        $('#hatchBoost').textContent = '+' + d.b + 'x Jumps';
        sfx('hatch');
        flash(d.b >= 2 ? 'gold' : '');
        setTimeout(nextHatch, 1900);
    }, 1100);
}
$('#hatch').addEventListener('pointerdown', () => { if (!$('#hatchCard').hidden) nextHatch(); });

// ----- purchases (free in the web demo; the server grants them) -----
let pendingBuy = null;
export function buy(kind, key) {
    if (kind === 'pass' && S.passes[key]) { toast(PASSES[key].name + ' already owned!', '#6fe0ff'); return; }
    const item = kind === 'pass' ? PASSES[key] : PRODUCTS[key];
    if (!item) return;
    if (net.bux) { buyBux(kind, key); return; }
    pendingBuy = { kind, key };
    $('#buyItem').textContent = item.name;
    setHtml($('#buyCost'), bux(item.price) + ' Bux');
    $('#buy').hidden = false;
}
async function buyBux(kind, key) {
    const r = await BX.buyWithBux(kind, key);
    if (r.success) { toast('Purchase complete!', '#7dff6b'); return; }
    if (r.error && !/cancel/i.test(r.error)) toast(r.error, '#ff5a5a');
}
$('#buyOk').addEventListener('click', () => {
    $('#buy').hidden = true;
    if (pendingBuy) net.send('buy', pendingBuy);
    pendingBuy = null;
});
$('#buyCancel').addEventListener('click', () => { $('#buy').hidden = true; pendingBuy = null; });
document.querySelectorAll('[data-pass]').forEach((b) => b.addEventListener('click', () => buy('pass', b.dataset.pass)));
document.querySelectorAll('[data-product]').forEach((b) => b.addEventListener('click', () => buy('product', b.dataset.product)));
el.skip.addEventListener('click', () => net.send('skip'));

// ----- panels -----
let modalKind = null;
export function openModal(kind) { modalKind = kind; renderModal(); $('#modal').hidden = false; }
export function closeModal() { $('#modal').hidden = true; modalKind = null; }
export function refreshModal() { if (!$('#modal').hidden) renderModal(); }
export const modalOpen = () => !$('#modal').hidden || !$('#hatch').hidden;
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });
document.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openModal(b.dataset.open)));
$('#btnShop').addEventListener('click', () => openModal('shop'));
document.addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('.btn')) sfx('click'); });

function rowCard(ic, name, desc, btnText, btnClass, onClick, disabled) {
    const d = document.createElement('div');
    d.className = 'row-card';
    d.innerHTML = '<div class="ic"></div><div><div class="nm o1"></div><div class="ds"></div></div><button class="btn o1"></button>';
    d.querySelector('.ic').textContent = ic;
    d.querySelector('.nm').textContent = name;
    d.querySelector('.ds').textContent = desc;
    const b = d.querySelector('button');
    b.classList.add(btnClass);
    setHtml(b, btnText); b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    return d;
}
function sec(text) { const d = document.createElement('div'); d.className = 'sec'; d.textContent = text; return d; }
function para(text) { const p = document.createElement('p'); p.className = 'desc'; p.textContent = text; return p; }
// Reference-style shop card: rarity, big icon, "x1.15 Jump", price buttons
function shopCard(o) {
    const c = document.createElement('div');
    c.className = 'card' + (o.on ? ' on' : '');
    c.style.background = o.bg || '';
    c.innerHTML = '<span class="rar o1"></span><span class="art"></span><span class="mx o1"></span>';
    c.querySelector('.rar').textContent = o.rarity || '';
    c.querySelector('.rar').style.color = RARITY[o.rarity] || '#ffffff';
    c.querySelector('.art').textContent = o.art;
    c.querySelector('.mx').textContent = o.mx;
    for (const b of o.btns) {
        const btn = document.createElement('button');
        btn.className = 'btn o1 ' + b.cls;
        setHtml(btn, b.html); btn.disabled = !!b.disabled;
        btn.addEventListener('click', b.fn);
        c.appendChild(btn);
    }
    return c;
}

const TITLES = {
    shop: 'SHOP', auras: 'AURAS', free: 'FREE!', pets: 'PETS', teleport: 'TELEPORT', inventory: 'INVENTORY', daily: 'Daily Rewards',
    quests: 'QUESTS', codes: 'CODES', settings: 'SETTINGS', rebirth: 'REBIRTH', trails: 'TRAILS SHOP', winshop: 'WIN SHOP', friends: 'FRIENDS',
};
const LIVE = new Set(['free', 'rebirth', 'pets', 'auras', 'trails']);
function renderModal() {
    const body = $('#modalBody');
    $('#modalTitle').textContent = TITLES[modalKind] || '';
    body.innerHTML = '';
    const fn = {
        shop: renderShop, auras: renderAuras, free: renderFree, pets: renderPets, teleport: renderTeleport, inventory: renderInventory,
        daily: renderDaily, quests: renderQuests, codes: renderCodes, settings: renderSettings, rebirth: renderRebirth,
        trails: renderTrails, winshop: renderWinShop, friends: renderFriends,
    }[modalKind];
    if (fn) fn(body);
    fillIcons(body);
}
// Panels with timers or prices redraw in place without losing focus
let liveKey = '';
function liveRefresh() {
    const key = modalKind + '|' + S.wins + '|' + S.level + '|' + S.pets.length + '|' + S.equipped.join(',') + '|' + S.trail + '|' + S.aura
        + '|' + Math.floor((net.now() - S.joinedAt) / 1000) + '|' + JSON.stringify(S.freeClaimed);
    if (key === liveKey) return;
    liveKey = key;
    const focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fid : null;
    renderModal();
    if (focusId) { const f = $('#modalBody [data-fid="' + focusId + '"]'); if (f) f.focus(); }
}

function renderShop(body) {
    body.appendChild(sec('Jump'));
    for (const k of ['Jump100K', 'Jump1M', 'Jump10M', 'Jump100M']) body.appendChild(rowCard('👟', PRODUCTS[k].name, 'Fills your level bar instantly', bux(PRODUCTS[k].price), 'g-green', () => buy('product', k)));
    body.appendChild(sec('Game passes'));
    for (const k of Object.keys(PASSES)) {
        const p = PASSES[k], owned = !!S.passes[k];
        body.appendChild(rowCard(p.ic, p.name, p.desc, owned ? 'OWNED' : bux(p.price), owned ? 'g-grey' : 'g-pink', () => buy('pass', k), owned));
    }
    body.appendChild(sec('Boosts & boxes'));
    for (const k of ['SkipWall', 'CrunchBoost', 'GalaxyBox', 'SecretEgg', 'UnicornDumpling']) {
        const p = PRODUCTS[k];
        const desc = { SkipWall: 'Lifts you onto the next step you cannot reach yet', CrunchBoost: 'x2 Jumps from every step for 15 minutes', GalaxyBox: 'Jelly Dragon, Galaxy Owl or Nebula Bat', SecretEgg: 'Galaxy Owl, Nebula Bat or the Void Kitty!', UnicornDumpling: 'Limited pet: +50x Jumps' }[k];
        body.appendChild(rowCard(p.ic, p.name, desc, bux(p.price), 'g-purple', () => buy('product', k)));
    }
    body.appendChild(sec('Wins'));
    for (const k of ['Wins1K', 'Wins10K', 'Wins100K']) body.appendChild(rowCard('🏆', PRODUCTS[k].name, 'Spend them on boxes, trails and auras', bux(PRODUCTS[k].price), 'g-yellow', () => buy('product', k)));
    if (!S.claimedPack) body.appendChild(rowCard('🎁', 'Starter Pack', '+50 Wins and +5,000 Jump, once', bux(PRODUCTS.StarterPack.price), 'g-pink', () => buy('product', 'StarterPack')));
}
function renderWinShop(body) {
    body.appendChild(para('Need Wins fast? The Win Shop has you covered.'));
    const g = document.createElement('div'); g.className = 'cards';
    for (const [k, art] of [['Wins1K', '🏆'], ['Wins10K', '💰'], ['Wins100K', '👑']]) {
        g.appendChild(shopCard({ art, mx: PRODUCTS[k].name, bg: 'linear-gradient(#ffe36b,#ff9a1e)', btns: [{ cls: 'g-green', html: bux(PRODUCTS[k].price), fn: () => buy('product', k) }] }));
    }
    body.appendChild(g);
}
// Trails Shop: x1.15 / x1.25 / x1.4 ... with a Wins price and a Bux price on each card
function renderTrails(body) {
    body.appendChild(para('Trails follow you everywhere and multiply your Jumps!'));
    const g = document.createElement('div'); g.className = 'cards';
    for (const t of TRAILS) {
        if (t.id === 'None') continue;
        const owned = S.trails[t.id] || (t.pass && S.passes[t.pass]);
        const on = S.trail === t.id;
        const btns = [];
        if (owned) btns.push({ cls: on ? 'g-grey' : 'g-green', html: on ? 'EQUIPPED' : 'EQUIP', disabled: on, fn: () => net.send('trail', { id: t.id }) });
        else {
            if (t.cost) btns.push({ cls: 'g-green', html: trophy + fmt(t.cost) + ' WINS', disabled: S.wins < t.cost, fn: () => net.send('trail', { id: t.id }) });
            if (t.product) btns.push({ cls: 'g-purple', html: bux(PRODUCTS[t.product].price), fn: () => buy('product', t.product) });
            if (t.pass) btns.push({ cls: 'g-purple', html: bux(PASSES[t.pass].price), fn: () => buy('pass', t.pass) });
        }
        const c = shopCard({ rarity: t.rarity, art: { Swoosh: '💨', Wave: '🌊', Blaze: '🔥', Toxic: '☢️', Galaxy: '🌌', Rainbow: '🌈' }[t.id], mx: 'x' + t.mult + ' Jump', on, btns, bg: 'linear-gradient(#ffffff,#dfe4f4)' });
        g.appendChild(c);
    }
    body.appendChild(g);
    if (S.trail !== 'None') {
        const off = document.createElement('button'); off.className = 'btn g-grey o1'; off.style.cssText = 'font-size:1rem;padding:0.35rem';
        off.textContent = 'Unequip trail'; off.addEventListener('click', () => net.send('trail', { id: 'None' }));
        body.appendChild(off);
    }
}
function renderAuras(body) {
    body.appendChild(para('Auras glow around you and multiply your Jumps!'));
    const g = document.createElement('div'); g.className = 'cards';
    for (const a of AURAS) {
        if (a.id === 'None') continue;
        const owned = S.auras[a.id] || (a.pass && S.passes[a.pass]);
        const on = S.aura === a.id;
        const btn = owned ? { cls: on ? 'g-grey' : 'g-green', html: on ? 'EQUIPPED' : 'EQUIP', disabled: on, fn: () => net.send('aura', { id: a.id }) }
            : a.pass ? { cls: 'g-purple', html: bux(PASSES[a.pass].price), fn: () => buy('pass', a.pass) }
                : { cls: 'g-green', html: trophy + fmt(a.cost), disabled: S.wins < a.cost, fn: () => net.send('aura', { id: a.id }) };
        const col = '#' + a.color.toString(16).padStart(6, '0');
        g.appendChild(shopCard({ art: '🔮', mx: a.id + ' x' + a.mult, on, btns: [btn], bg: a.id === 'Rainbow' ? 'linear-gradient(135deg,#ff5a5a,#ffd028,#46ec50,#28c8ff,#c46bff)' : 'linear-gradient(#ffffff,' + col + ')' }));
    }
    body.appendChild(g);
    if (S.aura !== 'None') {
        const off = document.createElement('button'); off.className = 'btn g-grey o1'; off.style.cssText = 'font-size:1rem;padding:0.35rem';
        off.textContent = 'Unequip aura'; off.addEventListener('click', () => net.send('aura', { id: 'None' }));
        body.appendChild(off);
    }
}
// Pets: grouped by kind, click to equip/unequip; boxes are in the world (or the Shop)
function renderPets(body) {
    const eq = S.equipped || [];
    body.appendChild(para('Pets: ' + S.pets.length + '/' + CFG.petBag + ' · Equipped ' + eq.length + '/' + CFG.petSlots + ' · Total x' + (Math.round(petMult(S) * 100) / 100) + ' Jumps'));
    const acts = document.createElement('div'); acts.className = 'pet-acts';
    acts.innerHTML = '<button class="btn g-green o1" data-fid="best">Equip Best</button><button class="btn g-blue o1" data-fid="boxes">Find Boxes</button>';
    acts.children[0].addEventListener('click', () => net.send('equipBest'));
    acts.children[1].addEventListener('click', () => { closeModal(); actions.teleport('boxes'); });
    body.appendChild(acts);
    if (!S.pets.length) { body.appendChild(para('No pets yet! Open a Common Box near the spawn (100 Wins).')); return; }
    const counts = new Map();
    for (const id of S.pets) counts.set(id, (counts.get(id) || 0) + 1);
    const ids = [...counts.keys()].sort((a, b) => (petDef(b) || { b: 0 }).b - (petDef(a) || { b: 0 }).b);
    const g = document.createElement('div'); g.className = 'petgrid';
    for (const id of ids) {
        const d = petDef(id); if (!d) continue;
        const nEq = eq.filter((x) => x === id).length, n = counts.get(id);
        const c = document.createElement('div');
        c.className = 'pet' + (nEq ? ' eq' : '');
        c.dataset.fid = 'p' + id;
        c.tabIndex = 0;
        c.innerHTML = '<span class="cnt o1"></span><span class="pi"></span><span class="pn o1"></span><span class="pb o1"></span><button class="btn g-red del o1" aria-label="Delete one">✕</button>';
        c.querySelector('.cnt').textContent = (nEq ? nEq + '/' : '') + 'x' + n;
        c.querySelector('.pi').textContent = d.ic;
        c.querySelector('.pn').textContent = d.id; c.querySelector('.pn').style.color = RARITY[d.r];
        c.querySelector('.pb').textContent = '+' + d.b + 'x';
        c.addEventListener('click', (e) => {
            if (e.target.closest('.del')) return;
            net.send('equip', { id, on: nEq < n && eq.length < CFG.petSlots ? true : !nEq ? true : false });
        });
        c.querySelector('.del').addEventListener('click', () => net.send('deletePet', { id }));
        g.appendChild(c);
    }
    body.appendChild(g);
}
function renderInventory(body) {
    body.appendChild(sec('Your boosts'));
    const m = stepGain(S, net.now(), S.friends);
    body.appendChild(rowCard('👟', '+' + fmt(STEP_UPG[S.stepLv].per) + '/Step boost', 'Each step gives ' + fmt(m) + ' Jump right now', 'Boost Pads', 'g-blue', () => { closeModal(); actions.teleport('boost'); }));
    body.appendChild(rowCard('🌈', 'Trail: ' + S.trail, 'x' + trailDef(S.trail).mult + ' Jumps', 'Trails', 'g-green', () => openModal('trails')));
    body.appendChild(rowCard('🔮', 'Aura: ' + S.aura, 'x' + auraDef(S.aura).mult + ' Jumps', 'Auras', 'g-purple', () => openModal('auras')));
    body.appendChild(rowCard('🐾', 'Pets: ' + S.equipped.length + ' equipped', 'x' + (Math.round(petMult(S) * 100) / 100) + ' Jumps', 'Pets', 'g-pink', () => openModal('pets')));
    body.appendChild(rowCard('⏭️', 'Skip Wall tokens: ' + S.skips, 'Use one by the wall', 'Shop', 'g-yellow', () => openModal('shop')));
    body.appendChild(sec('Game passes'));
    const owned = Object.keys(PASSES).filter((k) => S.passes[k]);
    if (!owned.length) body.appendChild(para('No game passes yet.'));
    for (const k of owned) body.appendChild(rowCard(PASSES[k].ic, PASSES[k].name, PASSES[k].desc, 'OWNED', 'g-grey', () => {}, true));
}
function renderTeleport(body) {
    const g = document.createElement('div'); g.className = 'tp-grid';
    for (const t of TELEPORTS) {
        const locked = t.lock && !muckOpen(S);
        const b = document.createElement('button');
        b.className = 'btn o1 ' + (locked ? 'g-grey' : 'g-purple');
        b.textContent = t.ic + ' ' + t.name + (locked ? ' 🔒' : '');
        b.addEventListener('click', () => {
            if (locked) { toast('Needs Level 100 + 4 Rebirths!', '#ff5a5a'); return; }
            closeModal(); actions.teleport(t.id);
        });
        g.appendChild(b);
    }
    body.appendChild(g);
}
function renderFree(body) {
    const mins = (net.now() - S.joinedAt) / 60000;
    body.appendChild(para('Free gifts for playing! Keep crunching to unlock them all.'));
    FREE.forEach((r, i) => {
        const claimed = !!S.freeClaimed[i];
        const ready = mins >= r.min;
        const btn = claimed ? 'Claimed' : ready ? 'CLAIM' : clock(r.min * 60 - mins * 60);
        const card = rowCard(r.box ? '🎁' : r.wins ? '🏆' : '👟', rewardText(r), 'Play for ' + r.min + ' min', btn,
            claimed ? 'g-grey' : ready ? 'g-green' : 'g-blue', () => { if (!claimed && ready) net.send('free', { i }); }, claimed || !ready);
        card.querySelector('button').dataset.fid = 'g' + i;
        body.appendChild(card);
    });
}
function renderDaily(body) {
    const d = S.daily || { ready: false, day: 0 };
    const w = document.createElement('div');
    w.className = 'daily';
    w.innerHTML = '<p class="desc">Log in every day! Miss a day and the streak starts over.</p><div class="grid"></div>';
    const grid = w.querySelector('.grid');
    DAILY.forEach((r, i) => {
        const done = d.ready ? i < d.day : i <= d.day;
        const today = d.ready && i === d.day;
        const c = document.createElement('div');
        c.className = 'day' + (done ? ' done' : '') + (today ? ' today' : '') + (i === DAILY.length - 1 ? ' big' : '');
        c.innerHTML = '<b class="o1"></b><span class="di"></span><small class="o1"></small>' + (done ? '<i>✔</i>' : '');
        c.querySelector('b').textContent = 'Day ' + (i + 1);
        c.querySelector('.di').textContent = r.box ? '🎁' : r.wins && r.jumps ? '🏆' : r.wins ? '🏆' : '👟';
        c.querySelector('small').textContent = rewardText(r).replace(' & ', ' + ');
        grid.appendChild(c);
    });
    const claim = document.createElement('button');
    claim.className = 'btn o1 ' + (d.ready ? 'g-green' : 'g-grey');
    claim.textContent = d.ready ? 'CLAIM DAY ' + (d.day + 1) : 'Come back tomorrow!';
    claim.disabled = !d.ready;
    claim.addEventListener('click', () => net.send('daily'));
    w.appendChild(claim);
    body.appendChild(w);
}
function renderQuests(body) {
    QUESTS.forEach((q, i) => {
        if (i < S.quest - 2 || i > S.quest + 4) return;
        const done = i < S.quest, cur = i === S.quest;
        const v = Math.min(statValue(q.stat), q.n);
        const r = document.createElement('div');
        r.className = 'quest-row' + (done ? ' done' : '') + (cur ? ' cur' : '');
        r.innerHTML = '<span></span><span class="o1"></span><small class="o1"></small>' + (cur ? '<div class="qbar"><div></div></div>' : '');
        r.children[0].textContent = done ? '✅' : cur ? '⭐' : '🔒';
        r.children[1].textContent = q.text + (cur ? ' (' + comma(v) + '/' + comma(q.n) + ')' : '');
        r.children[2].textContent = rewardText(q.reward);
        if (cur) r.querySelector('.qbar div').style.width = (v / q.n * 100) + '%';
        body.appendChild(r);
    });
    if (S.quest >= QUESTS.length) body.appendChild(para('All quests done. You escaped everything!'));
}
function renderCodes(body) {
    body.appendChild(para('Got a code? Type it in for free rewards!'));
    const row = document.createElement('div');
    row.className = 'code-row';
    row.innerHTML = '<input id="codeIn" maxlength="24" placeholder="ENTER CODE" aria-label="Code" autocomplete="off"><button class="btn g-green o1" id="codeGo">Redeem</button>';
    const go = () => { const v = row.querySelector('input').value.trim(); if (v) net.send('code', { code: v }); row.querySelector('input').value = ''; };
    row.querySelector('button').addEventListener('click', go);
    row.querySelector('input').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); e.stopPropagation(); });
    body.appendChild(row);
    body.appendChild(para('Try: RELEASE · CRUNCH · ASMR · LEGION · BLOXITY'));
}
function renderRebirth(body) {
    const cur = rebirthMult(S), next = cur + 1;
    const ready = S.level >= CFG.rebirthLevel;
    const w = document.createElement('div');
    w.className = 'rebirth-box';
    w.innerHTML = `<div class="big o">🔄 ${comma(S.rebirths)} Rebirths</div>
        <div class="mult o"><span style="color:#ff5a5a">x${cur} Jumps</span><span>➜</span><span style="color:#7dff6b">x${next} Jumps</span></div>
        <p>Each rebirth adds +1x to every step's Jump. Your level (and Jump Height) goes back to 1. You keep your Wins, boosts, pets, trails and auras.</p>
        <p style="color:${ready ? '#7dff6b' : '#ffb51c'};font-weight:700">${ready ? 'Ready to rebirth!' : 'Reach Level ' + CFG.rebirthLevel + ' to rebirth (now Level ' + S.level + ')'}</p>`;
    const b = document.createElement('button');
    b.className = 'btn o ' + (ready ? 'g-green' : 'g-grey');
    b.textContent = 'REBIRTH';
    b.disabled = !ready;
    b.addEventListener('click', () => net.send('rebirth'));
    w.appendChild(b);
    body.appendChild(w);
}
function renderSettings(body) {
    const vols = getVolumes();
    const w = document.createElement('div');
    w.className = 'settings';
    w.innerHTML = `
        <label class="set-row o1" for="volMusic"><span>🎵 Music</span><input id="volMusic" type="range" min="0" max="100" value="${Math.round(vols.music * 100)}"></label>
        <label class="set-row o1" for="volSfx"><span>🔊 Crunch sounds</span><input id="volSfx" type="range" min="0" max="100" value="${Math.round(vols.sfx * 100)}"></label>
        <div class="set-row o1"><span>✨ Graphics</span><div class="seg" role="radiogroup" aria-label="Graphics quality"></div></div>
        <p class="set-note">Low turns off glow and shadows for older phones.</p>`;
    w.querySelector('#volMusic').addEventListener('input', (e) => setVolume('music', e.target.value / 100));
    w.querySelector('#volSfx').addEventListener('input', (e) => setVolume('sfx', e.target.value / 100));
    const seg = w.querySelector('.seg');
    for (const [key, q] of Object.entries(QUALITIES)) {
        const b = document.createElement('button');
        b.className = 'btn o1 ' + (getQuality() === key ? 'g-green' : 'g-grey');
        b.textContent = q.label;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(getQuality() === key));
        b.addEventListener('click', () => { setQuality(key); renderModal(); });
        seg.appendChild(b);
    }
    body.appendChild(w);
    if (BX.bloxity.ready) {
        const f = document.createElement('button');
        f.className = 'btn g-blue o1';
        f.style.cssText = 'font-size:1.1rem;padding:0.45rem';
        f.textContent = '👥 Friends & invites';
        f.addEventListener('click', () => openModal('friends'));
        body.appendChild(f);
    }
}
// Bloxity friends with presence, a shareable invite link and per-friend invites
function renderFriends(body) {
    const note = (text) => { const p = document.createElement('p'); p.className = 'set-note'; p.textContent = text; body.appendChild(p); return p; };
    if (!BX.bloxity.ready) { note('Bloxity is not available right now.'); return; }
    const id = BX.identity();
    note('Every Bloxity friend in your server gives +10% Jumps (up to +50%).');
    const link = document.createElement('div');
    link.className = 'invite-row';
    link.innerHTML = '<input id="inviteLink" readonly aria-label="Invite link"><button class="btn g-green o1" id="copyInvite">Copy link</button>';
    body.appendChild(link);
    const input = link.querySelector('input');
    input.value = BX.getInviteLink();
    link.querySelector('button').addEventListener('click', async () => {
        input.select();
        try { await navigator.clipboard.writeText(input.value); toast('Invite link copied!', '#7dff6b'); }
        catch (e) { toast('Select the link and copy it', '#ffb51c'); }
    });
    if (!id.loggedIn) {
        note('Log in with Bloxity to see your friends and invite them into this server.');
        const b = document.createElement('button');
        b.className = 'btn g-blue o1'; b.textContent = 'Log in with Bloxity';
        b.addEventListener('click', () => BX.login());
        body.appendChild(b);
        return;
    }
    const loading = note('Loading friends…');
    BX.getFriends().then((friends) => {
        if (modalKind !== 'friends') return;
        loading.remove();
        if (!friends.length) { note('No friends yet. Share the invite link above!'); return; }
        const order = { 'in-game': 0, online: 1, away: 2, offline: 3 };
        friends.sort((a, b) => (order[a.presence && a.presence.status] ?? 4) - (order[b.presence && b.presence.status] ?? 4));
        for (const f of friends) {
            const st = (f.presence && f.presence.status) || 'offline';
            const where = st === 'in-game' && f.presence.gameName ? 'Playing ' + f.presence.gameName : st;
            const dot = st === 'offline' ? '⚫' : st === 'away' ? '🟡' : '🟢';
            body.appendChild(rowCard(dot, f.displayName || f.username, where, 'Invite', 'g-green', async (e) => {
                e.currentTarget.disabled = true;
                const ok = await BX.inviteFriend(f._id);
                toast(ok ? 'Invite sent to ' + (f.displayName || f.username) : 'Could not send the invite', ok ? '#7dff6b' : '#ff5a5a');
            }));
        }
    });
}
void BOXES; void maxJumpHeight;
