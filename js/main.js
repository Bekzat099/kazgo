'use strict';

/* ================= КОНФИГ ================= */
const CELL_M = 40;               // размер клетки спавна, м
const WORLD_RADIUS = 350;        // радиус мира вокруг игрока, м
const COLLECT_RADIUS = 30;       // радиус сбора, м
const RESPAWN_MS = 90 * 1000;    // перезарядка клетки после сбора
const SPAWN_CHANCE = 0.34;       // шанс предмета в клетке
const DEMO_SPEED = 3.0;          // м/с в демо-режиме
const SAVE_KEY = 'kazgo-save-v1';
const START_CENTER = [43.2222, 76.8512]; // Алматы

const LEVEL_NAMES = ['Ушырын','Жигерлі','Білікті','Санақты','Устаз','Жаңаша','Білеу','Батыр'];
const QUESTS = [
  { id:'c5',   stat:'common', goal:5,   text:'Собери 5 ади-предметов',      reward:30  },
  { id:'r2',   stat:'rare',   goal:2,   text:'Собери 2 сәлқән-предмета',    reward:50  },
  { id:'w200', stat:'dist',   goal:200, text:'Пройди 200 м',                reward:30  },
];

/* ================= МАТЕМАТИКА И RNG ================= */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, T = Math.PI / 180;
  const dLa = (lat2 - lat1) * T, dLo = (lng2 - lng1) * T;
  const a = Math.sin(dLa / 2) ** 2 + Math.cos(lat1 * T) * Math.cos(lat2 * T) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
function bearing(lat1, lng1, lat2, lng2) {
  const T = Math.PI / 180;
  const y = Math.sin((lng2 - lng1) * T) * Math.cos(lat2 * T);
  const x = Math.cos(lat1 * T) * Math.sin(lat2 * T) - Math.sin(lat1 * T) * Math.cos(lat2 * T) * Math.cos((lng2 - lng1) * T);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return function () { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rngFor(s) { return mulberry32(xmur3(s)()); }
function dayKey() { return new Date().toISOString().slice(0, 10); }

function levelFromXp(xp) {
  let lvl = 1, need = 100, rest = xp;
  while (rest >= need) { rest -= need; lvl++; need = 100 + (lvl - 1) * 50; }
  return { lvl, cur: rest, need };
}
function levelName(lvl) { return LEVEL_NAMES[Math.min(lvl, LEVEL_NAMES.length) - 1]; }

/* ================= КЛЕТКИ ================= */
const CELL_LAT_DEG = CELL_M / 111320;
function cellLngDeg() { return CELL_M / (111320 * Math.cos(46.8 * Math.PI / 180)); } // широта Казахстана ~46.8
function cellKey(lat, lng) {
  return Math.floor(lat / CELL_LAT_DEG) + ':' + Math.floor(lng / cellLngDeg());
}
function cellsAround(lat, lng, radiusM) {
  const out = [];
  const clg = cellLngDeg();
  const dLat = radiusM / 111320;
  const dLng = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
  for (let i = Math.floor((lat - dLat) / CELL_LAT_DEG); i <= Math.floor((lat + dLat) / CELL_LAT_DEG); i++) {
    for (let j = Math.floor((lng - dLng) / clg); j <= Math.floor((lng + dLng) / clg); j++) {
      const la = (i + 0.5) * CELL_LAT_DEG, ln = (j + 0.5) * clg;
      if (haversine(lat, lng, la, ln) <= radiusM + CELL_M) out.push(i + ':' + j);
    }
  }
  return out;
}
function cellPos(key, r) {
  const p = key.split(':').map(Number);
  return {
    lat: (p[0] + 0.18 + 0.64 * r()) * CELL_LAT_DEG,
    lng: (p[1] + 0.18 + 0.64 * r()) * cellLngDeg(),
  };
}
function pickByRarity(rar, r) {
  const pool = ITEMS.filter(it => it.rarity === rar);
  return pool[Math.floor(r() * pool.length)];
}
function pickItem(r) {
  const total = Object.values(RARITY).reduce((s, x) => s + x.weight, 0);
  let roll = r() * total, rar = 'common';
  for (const k of Object.keys(RARITY)) { roll -= RARITY[k].weight; if (roll < 0) { rar = k; break; } }
  return pickByRarity(rar, r);
}

/* ================= СОХРАНЕНИЕ ================= */
function defaultSave() {
  return {
    xp: 0, counts: {}, cells: {}, origin: null, total: 0,
    quests: { date: dayKey(), p: { common: 0, rare: 0, epic: 0, legendary: 0, dist: 0 }, claimed: {} },
  };
}
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.xp === 'number') {
      s.quests = Object.assign(defaultSave().quests, s.quests || {});
      return s;
    }
  } catch (e) { /* повреждённое сохранение — начинаем заново */ }
  return defaultSave();
}
let save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { } }
function uniqueCollected() { return ITEMS.filter(it => (save.counts[it.id] || 0) > 0).length; }

/* ================= СОСТОЯНИЕ ================= */
let map = null, playerMarker = null, accCircle = null;
const player = { lat: null, lng: null, acc: 25, heading: null };
let mode = 'none';            // none | gps | demo
let visible = {};             // cellKey -> {item, lat, lng, marker}
let lastGpsTick = 0;
let lastTs = performance.now();
let joyVec = { x: 0, y: 0 };
let joyPointer = null;

const $ = id => document.getElementById(id);

/* ================= КАРТА ================= */
function initMap() {
  map = L.map('map', { zoomControl: false }).setView(START_CENTER, 15);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© OpenStreetMap',
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);
}
function ensurePlayerMarker() {
  if (!playerMarker) {
    playerMarker = L.marker([player.lat, player.lng], {
      icon: L.divIcon({
        className: 'player-icon',
        html: '<div class="player-marker"><div class="ring"></div><div class="dot"></div></div>',
        iconSize: [44, 44], iconAnchor: [22, 22],
      }),
      zIndexOffset: 1000, keyboard: false,
    }).addTo(map);
    accCircle = L.circle([player.lat, player.lng], {
      radius: player.acc, color: '#00AFCA', weight: 1, fillOpacity: .08, interactive: false,
    }).addTo(map);
  }
}
function updatePlayerMarker() {
  if (!playerMarker) return;
  playerMarker.setLatLng([player.lat, player.lng]);
  if (accCircle) { accCircle.setLatLng([player.lat, player.lng]); accCircle.setRadius(Math.max(8, player.acc)); }
}

/* ================= СПАВН ================= */
function itemIcon(item) {
  return L.divIcon({
    className: '',
    html: '<div class="item-marker r-' + item.rarity + '"><span>' + item.emoji + '</span></div>',
    iconSize: [36, 36], iconAnchor: [18, 18],
  });
}
function tickSpawns() {
  if (player.lat == null || !map) return;
  const now = Date.now();
  const next = {};
  for (const key of cellsAround(player.lat, player.lng, WORLD_RADIUS)) {
    const meta = save.cells[key];
    if (meta && now - meta.ts < RESPAWN_MS) continue;
    const r = rngFor(key + '|' + dayKey() + '|' + (meta ? meta.c : 0));
    if (r() > SPAWN_CHANCE) continue;
    const item = pickItem(r);
    const pos = cellPos(key, r);
    if (haversine(player.lat, player.lng, pos.lat, pos.lng) > WORLD_RADIUS) continue;
    next[key] = { item, lat: pos.lat, lng: pos.lng };
  }
  // гарантия: хотя бы один предмет в 120 м, чтобы не бродить впустую
  const hasNear = Object.values(next).some(v => haversine(player.lat, player.lng, v.lat, v.lng) < 120);
  if (!hasNear) {
    const r = rngFor('guarantee|' + Math.round(player.lat * 1e4) + '|' + Math.round(player.lng * 1e4) + '|' + dayKey());
    const ang = r() * Math.PI * 2, d = 30 + r() * 70;
    const pos = {
      lat: player.lat + d * Math.cos(ang) / 111320,
      lng: player.lng + d * Math.sin(ang) / (111320 * Math.cos(player.lat * Math.PI / 180)),
    };
    const key = cellKey(pos.lat, pos.lng);
    if (!next[key]) next[key] = { item: pickByRarity('common', r), lat: pos.lat, lng: pos.lng };
  }
  for (const key in visible) if (!next[key]) visible[key].marker.remove();
  for (const key in next) {
    const old = visible[key];
    if (old && old.item.id === next[key].item.id && old.lat === next[key].lat && old.lng === next[key].lng) {
      next[key].marker = old.marker;
    } else {
      next[key].marker = L.marker([next[key].lat, next[key].lng], { icon: itemIcon(next[key].item), keyboard: false })
        .on('click', () => tryCollect(key))
        .addTo(map);
    }
  }
  visible = next;
  renderNearby();
}

/* ================= СБОР / XP / КВЕСТЫ ================= */
function tryCollect(key) {
  const v = visible[key];
  if (!v) return;
  const d = haversine(player.lat, player.lng, v.lat, v.lng);
  if (d > COLLECT_RADIUS) {
    toast('Далеко: ' + Math.round(d) + ' м. Подойди ближе (нужно ≤' + COLLECT_RADIUS + ' м)', 'warn');
    return;
  }
  const it = v.item, xp = RARITY[it.rarity].xp;
  save.cells[key] = { c: (save.cells[key] ? save.cells[key].c : 0) + 1, ts: Date.now() };
  save.counts[it.id] = (save.counts[it.id] || 0) + 1;
  save.total = (save.total || 0) + 1;
  save.quests.p[it.rarity] = (save.quests.p[it.rarity] || 0) + 1;
  v.marker.remove();
  delete visible[key];
  playPluck(it.rarity);
  addXp(xp);
  toast('+' + xp + ' XP · ' + it.emoji + ' ' + it.name, it.rarity === 'legendary' ? 'legend' : 'good');
  checkQuests();
  renderTopbar();
  renderCodex();
  persist();
}
function addXp(n) {
  const before = levelFromXp(save.xp).lvl;
  save.xp += n;
  const after = levelFromXp(save.xp);
  if (after.lvl > before) { showLevelUp(after.lvl); playLevel(); }
}
function checkQuests() {
  const q = save.quests;
  if (q.date !== dayKey()) {
    q.date = dayKey();
    q.p = { common: 0, rare: 0, epic: 0, legendary: 0, dist: 0 };
    q.claimed = {};
  }
  let changed = false;
  for (const qt of QUESTS) {
    if (q.claimed[qt.id]) continue;
    if ((q.p[qt.stat] || 0) >= qt.goal) {
      q.claimed[qt.id] = true;
      changed = true;
      addXp(qt.reward);
      toast('Квест выполнен: ' + qt.text + ' (+' + qt.reward + ' XP)', 'good');
    }
  }
  if (changed) persist();
  renderQuests();
}
function onMove(prevLat, prevLng) {
  if (prevLat != null) {
    const d = haversine(prevLat, prevLng, player.lat, player.lng);
    if (d > 1 && d < 1000) save.quests.p.dist = (save.quests.p.dist || 0) + d;
  }
}

/* ================= GPS / ДЕМО ================= */
function startGps() {
  mode = 'gps';
  updateModeBadge();
  showJoystick(false);
  hideStart();
  if (!navigator.geolocation) { toast('Геолокация недоступна — включён демо-режим', 'warn'); startDemo(); return; }
  navigator.geolocation.watchPosition(pos => {
    const c = pos.coords;
    const prevLat = player.lat, prevLng = player.lng;
    player.lat = c.latitude; player.lng = c.longitude;
    player.acc = c.accuracy || 25; player.heading = c.heading;
    if (!save.origin) { save.origin = { lat: player.lat, lng: player.lng }; persist(); }
    onMove(prevLat, prevLng);
    if (prevLat == null) {
      ensurePlayerMarker();
      map.setView([player.lat, player.lng], 17);
    } else {
      updatePlayerMarker();
    }
    if (Date.now() - lastGpsTick > 1000) { lastGpsTick = Date.now(); tickSpawns(); }
  }, err => {
    if (err.code === 1) toast('Доступ к геолокации запрещён. Попробуй демо-режим', 'warn');
    else if (err.code === 2) toast('Пока не удаётся определить местоположение…', 'warn');
  }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
}
function startDemo() {
  mode = 'demo';
  updateModeBadge();
  showJoystick(true);
  hideStart();
  if (player.lat == null) {
    const c = map.getCenter();
    player.lat = c.lat; player.lng = c.lng; player.acc = 10;
    if (!save.origin) { save.origin = { lat: c.lat, lng: c.lng }; persist(); }
    ensurePlayerMarker();
    map.setView([player.lat, player.lng], 17);
    toast('Демо-режим: двигайтесь джойстиком 🕹', 'info');
  }
}

/* ================= ДЕМО-ЦИКЛ ================= */
function loop(ts) {
  const dt = Math.min(0.1, (ts - lastTs) / 1000);
  lastTs = ts;
  if (mode === 'demo' && player.lat != null) {
    const mag = Math.hypot(joyVec.x, joyVec.y);
    if (mag > 0.05) {
      const prev = { lat: player.lat, lng: player.lng };
      const speed = DEMO_SPEED * Math.min(1, mag);
      player.lat += joyVec.y * speed * dt / 111320;
      player.lng += joyVec.x * speed * dt / (111320 * Math.cos(player.lat * Math.PI / 180));
      onMove(prev.lat, prev.lng);
      updatePlayerMarker();
    }
  }
  requestAnimationFrame(loop);
}

/* ================= ДЖОЙСТИК ================= */
function initJoystick() {
  const joy = $('joystick'), stick = $('stick');
  const R = 38, MAXPX = 34;
  const move = e => {
    const rect = joy.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const mag = Math.hypot(dx, dy) || 1;
    const cl = Math.min(1, mag / R);
    joyVec = { x: (dx / mag) * cl, y: (dy / mag) * cl };
    stick.style.transform = 'translate(' + (dx / mag) * cl * MAXPX + 'px,' + (dy / mag) * cl * MAXPX + 'px)';
  };
  joy.addEventListener('pointerdown', e => {
    if (mode !== 'demo') return;
    joyPointer = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    move(e);
  });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyPointer) move(e); });
  const up = e => {
    if (e.pointerId !== joyPointer) return;
    joyPointer = null;
    joyVec = { x: 0, y: 0 };
    stick.style.transform = '';
  };
  joy.addEventListener('pointerup', up);
  joy.addEventListener('pointercancel', up);
}

/* ================= ЗВУК (синтез домбры) ================= */
let actx = null;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
function pluck(freq, when, dur, vol) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + (when || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol || 0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + (dur || 0.5));
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + (dur || 0.5) + 0.05);
}
function playPluck(rar) {
  if (rar === 'legendary') [329.6, 392, 523.3, 659.3].forEach((f, i) => pluck(f, i * 0.09, 0.6, 0.35));
  else if (rar === 'epic') [220, 330, 440].forEach((f, i) => pluck(f, i * 0.09, 0.5, 0.4));
  else if (rar === 'rare') { pluck(220, 0, 0.45, 0.4); pluck(330, 0.1, 0.5, 0.35); }
  else pluck(196, 0, 0.45, 0.45);
}
function playLevel() { [261.6, 329.6, 392, 523.3].forEach((f, i) => pluck(f, i * 0.12, 0.7, 0.4)); }

/* ================= UI ================= */
function toast(msg, kind) {
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || 'info');
  t.textContent = msg;
  $('toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 2600);
}
function showLevelUp(lvl) {
  const el = $('levelup');
  $('levelup-text').textContent = 'Уровень ' + lvl + ' — ' + levelName(lvl) + '!';
  el.classList.remove('hidden', 'show');
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2700);
}
function updateModeBadge() {
  $('mode-btn').textContent = mode === 'gps' ? '📍 GPS' : mode === 'demo' ? '🕹 демо' : '—';
}
function showJoystick(on) { $('joystick').classList.toggle('hidden', !on); }
function hideStart() { $('start-overlay').classList.add('hidden'); }

function renderTopbar() {
  const { lvl, cur, need } = levelFromXp(save.xp);
  $('level-num').textContent = lvl;
  $('level-name').textContent = levelName(lvl);
  $('xp-fill').style.width = Math.min(100, cur / need * 100) + '%';
  $('count').textContent = uniqueCollected() + '/' + ITEMS.length;
}
function renderNearby() {
  const el = $('tab-nearby');
  if (!el) return;
  if (player.lat == null) { el.innerHTML = '<p class="hint">Ждём локацию…</p>'; return; }
  const list = Object.entries(visible)
    .map(([key, v]) => ({ v, d: haversine(player.lat, player.lng, v.lat, v.lng), b: bearing(player.lat, player.lng, v.lat, v.lng) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 12);
  if (!list.length) { el.innerHTML = '<p class="hint">Рядом пусто. Пройдитесь ещё немного!</p>'; return; }
  el.innerHTML = '<p class="hint">Коснись предмета на карте, если он в ' + COLLECT_RADIUS + ' м. Стрелка — направление на север.</p>' +
    list.map(({ v, d, b }) => {
      const near = d <= COLLECT_RADIUS;
      return '<div class="nearby-row ' + (near ? 'near' : '') + '">' +
        '<span class="near-emoji">' + v.item.emoji + '</span>' +
        '<div class="near-info"><b>' + v.item.name + '</b><span class="dim">' + RARITY[v.item.rarity].name + '</span></div>' +
        '<span class="near-arrow" style="transform:rotate(' + Math.round(b) + 'deg)">➤</span>' +
        '<span class="near-dist ' + (near ? 'ok' : '') + '">' + Math.round(d) + ' м</span>' +
        '</div>';
    }).join('');
}
function renderCodex() {
  const el = $('tab-codex');
  if (!el) return;
  const uniq = uniqueCollected();
  el.innerHTML = '<div class="codex-head">Собрано: <b style="color:var(--text)">' + uniq + '/' + ITEMS.length +
    '</b> · всего собрано: ' + (save.total || 0) + '</div><div class="codex-grid">' +
    ITEMS.map(it => {
      const c = save.counts[it.id] || 0;
      return '<div class="codex-card ' + (c ? '' : 'locked ') + 'r-' + it.rarity + '" title="' + it.desc + '">' +
        '<span class="c-emoji">' + (c ? it.emoji : '❓') + '</span>' +
        '<span class="c-name">' + it.name + '</span>' +
        '<span class="c-count">' + (c ? '×' + c : RARITY[it.rarity].name) + '</span>' +
        '</div>';
    }).join('') + '</div>';
}
function renderQuests() {
  const el = $('tab-quests');
  if (!el) return;
  const q = save.quests;
  el.innerHTML = '<div class="codex-head">Ежедневные квесты — прогресс сбрасывается с новым днём</div>' +
    QUESTS.map(qt => {
      const val = Math.min(qt.goal, q.p[qt.stat] || 0);
      const done = !!q.claimed[qt.id];
      return '<div class="quest ' + (done ? 'done' : '') + '">' +
        '<div class="quest-top"><span>' + (done ? '✅' : '⬜') + ' ' + qt.text + '</span>' +
        '<span>' + Math.round(val) + '/' + qt.goal + (qt.stat === 'dist' ? ' м' : '') + '</span></div>' +
        '<div class="quest-bar"><div class="quest-fill" style="width:' + (val / qt.goal * 100) + '%"></div></div>' +
        '<div class="dim" style="font-size:11px;margin-top:4px">Награда: +' + qt.reward + ' XP</div>' +
        '</div>';
    }).join('');
}
function switchTab(name) {
  document.querySelectorAll('#tabs button').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
  $('tab-' + name).classList.add('active');
  if (name === 'codex') renderCodex();
  if (name === 'quests') renderQuests();
  if (name === 'nearby') renderNearby();
}

/* ================= AR-РЕЖИМ (камера + компас) ================= */
const AR_RANGE = 150;    // м — насколько далеко показывать в AR
const AR_FOV = 60;       // горизонтальное поле обзора камеры, град
let arActive = false;
let arStream = null;
const arHeading = { h: null, t: 0 };
let arItems = {};        // key -> {el}

function arCompassText(deg) {
  if (deg == null) return '🧭 —';
  const dirs = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ'];
  return '🧭 ' + Math.round(deg) + '° ' + dirs[Math.round(deg / 45) % 8];
}
function onDeviceOrientation(e) {
  let h = null, src = null;
  if (e.webkitCompassHeading != null) { h = e.webkitCompassHeading; src = 'webkit'; }
  else if (e.absolute && e.alpha != null) { h = (360 - e.alpha) % 360; src = 'absolute'; }
  else if (e.alpha != null) { h = (360 - e.alpha) % 360; src = 'alpha'; }
  if (h == null) return;
  if (src !== 'webkit' && window.screen && screen.orientation) {
    h = (h + (screen.orientation.angle || 0)) % 360;
  }
  arHeading.h = h;
  arHeading.t = Date.now();
}
async function ensureOrientationPermission() {
  if (arOrientationAsked) return;
  arOrientationAsked = true;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const r = await DeviceOrientationEvent.requestPermission(); // iOS: только по жесту пользователя
      if (r !== 'granted') toast('Доступ к компасу запрещён — направление может быть неточным', 'warn');
    }
  } catch (e) { /* desktop — не критично */ }
}
let arOrientationAsked = false;
function arErrorBox(err) {
  const box = $('ar-error');
  if (!err) { box.classList.add('hidden'); return; }
  let msg;
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
    msg = 'Доступ к камере запрещён. На iPhone: значок 🔒 в адресной строке → «Камера» → «Разрешить» (или Настройки → Safari → Камера). Потом нажмите «Повторить».';
  } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
    msg = 'Камера на этом устройстве не найдена.';
  } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError' || err.name === 'OverconstrainedError') {
    msg = 'Камера занята другим приложением. Закройте его и нажмите «Повторить».';
  } else {
    msg = 'Не удалось запустить камеру: ' + (err && err.name ? err.name : String(err));
  }
  box.innerHTML = '<div class="card"><b>📷 Камера не работает</b><br>' + msg +
    '<div><button id="ar-error-retry">Повторить</button>' +
    '<button id="ar-error-exit" class="ghost">Выйти</button></div></div>';
  box.classList.remove('hidden');
  $('ar-error-retry').onclick = () => arStartCamera();
  $('ar-error-exit').onclick = () => closeAR();
}
async function arStartCamera() {
  try {
    arStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    arErrorBox(null);
    const v = $('ar-video');
    v.srcObject = arStream;
    v.play().catch(() => {});
    if (!arActive) {
      arActive = true;
      window.addEventListener('deviceorientation', onDeviceOrientation);
      requestAnimationFrame(arLoop);
    }
  } catch (e) {
    arErrorBox(e);
  }
}
async function openAR() {
  if (arActive) return;
  if (player.lat == null) { startDemo(); toast('Позиция ещё не готова — включил демо-режим, идите джойстиком', 'info'); }
  $('ar-screen').classList.remove('hidden');
  arErrorBox(null);
  await ensureOrientationPermission();
  await arStartCamera();
}
function closeAR() {
  arActive = false;
  window.removeEventListener('deviceorientation', onDeviceOrientation);
  if (arStream) { arStream.getTracks().forEach(t => t.stop()); arStream = null; }
  const v = $('ar-video');
  if (v) v.srcObject = null;
  $('ar-layer').innerHTML = '';
  arItems = {};
  $('ar-edge-left').classList.add('hidden');
  $('ar-edge-right').classList.add('hidden');
  arErrorBox(null);
  $('ar-screen').classList.add('hidden');
}
function ensureAREl(key, item) {
  if (arItems[key]) return arItems[key].el;
  const el = document.createElement('div');
  el.className = 'ar-item r-' + item.rarity;
  el.innerHTML = '<div class="m">' + item.emoji + '</div><span class="d"></span>';
  el.addEventListener('click', () => tryCollect(key));
  $('ar-layer').appendChild(el);
  arItems[key] = { el };
  return el;
}
function setEdge(id, best) {
  const el = $(id);
  if (!best) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const arrow = id === 'ar-edge-left' ? '‹ ' : '';
  const tail = id === 'ar-edge-right' ? ' ›' : '';
  el.textContent = arrow + best.v.item.name + ' ' + Math.round(best.d) + ' м' + tail;
}
function renderAR() {
  const fresh = arHeading.h != null && Date.now() - arHeading.t < 4000;
  $('ar-compass').textContent = arCompassText(fresh ? arHeading.h : null);
  if (!fresh) {
    $('ar-hint').textContent = 'Ждём компас… (на iPhone разрешите движение и ориентацию)';
    for (const k in arItems) { arItems[k].el.remove(); delete arItems[k]; }
    setEdge('ar-edge-left', null); setEdge('ar-edge-right', null);
    return;
  }
  $('ar-hint').textContent = 'Идите к предмету. Коснитесь предмета, когда рядом (≤' + COLLECT_RADIUS + ' м)';
  const seen = {};
  let leftBest = null, rightBest = null;
  for (const [key, v] of Object.entries(visible)) {
    const d = haversine(player.lat, player.lng, v.lat, v.lng);
    if (d > AR_RANGE) continue;
    seen[key] = true;
    const B = bearing(player.lat, player.lng, v.lat, v.lng);
    const A = (B - arHeading.h + 540) % 360 - 180;
    if (Math.abs(A) > 33) {
      if (A > 0) { if (!rightBest || d < rightBest.d) rightBest = { key, v, d, A }; }
      else if (!leftBest || d < leftBest.d) leftBest = { key, v, d, A };
      continue;
    }
    const el = ensureAREl(key, v.item);
    const scale = 1.9 - Math.min(d, 140) / 140 * 1.5; // близко — крупно
    const size = Math.round(46 * scale);
    el.style.left = (50 + (A / AR_FOV) * 55) + '%';
    el.style.top = (46 + Math.min(d, 110) / 110 * 26) + '%';
    const m = el.querySelector('.m');
    m.style.width = size + 'px';
    m.style.height = size + 'px';
    m.style.fontSize = Math.round(size * 0.52) + 'px';
    const dEl = el.querySelector('.d');
    dEl.textContent = d <= COLLECT_RADIUS ? 'собери сейчас! ' + Math.round(d) + ' м' : Math.round(d) + ' м';
    el.classList.toggle('near', d <= COLLECT_RADIUS);
  }
  for (const key in arItems) if (!seen[key]) { arItems[key].el.remove(); delete arItems[key]; }
  setEdge('ar-edge-left', leftBest);
  setEdge('ar-edge-right', rightBest);
}
function arLoop() {
  if (!arActive) return;
  renderAR();
  requestAnimationFrame(arLoop);
}

/* ================= СТАРТ ================= */
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderTopbar();
  renderCodex();
  renderQuests();
  renderNearby();
  $('btn-gps').onclick = () => { audio(); startGps(); };
  $('btn-demo').onclick = () => { audio(); startDemo(); };
  $('mode-btn').onclick = () => { if (mode === 'demo') startGps(); else if (mode === 'gps') startDemo(); };
  $('btn-ar').onclick = () => openAR();
  $('btn-ar-close').onclick = closeAR;
  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  initJoystick();
  requestAnimationFrame(loop);
  setInterval(() => { if (player.lat != null) { tickSpawns(); checkQuests(); } }, 1500);
});
