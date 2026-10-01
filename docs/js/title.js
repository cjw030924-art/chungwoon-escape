// ===== 배경(밤 캠퍼스 픽셀아트) 그리기 =====
const W = 320, H = 180;
const bg = document.createElement('canvas');
bg.width = W; bg.height = H;
const g = bg.getContext('2d');

let seed = 11;
const rnd = () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const C = (cx, cy, r, c) => {
  g.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    g.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1);
  }
};
const glow = (x, y, r, rgb, a) => {
  const q = g.createRadialGradient(x, y, 0, x, y, r);
  q.addColorStop(0, `rgba(${rgb},${a})`);
  q.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2);
};
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

// 하늘
for (let y = 0; y < H; y++) {
  const c = mix([2, 3, 10], [46, 10, 22], Math.min(1, y / 120));
  R(0, y, W, 1, `rgb(${c})`);
}
// 구름
for (let n = 0; n < 16; n++) {
  const cx = rnd() * W, cy = 6 + rnd() * 64, k = 3 + (rnd() * 4 | 0);
  for (let i = 0; i < k; i++) {
    const ox = (i - k / 2) * 7 + rnd() * 4, r = 5 + rnd() * 5;
    C(cx + ox, cy + rnd() * 3, r, '#120a16');
    C(cx + ox - 1, cy - 2, r - 2, '#1b0f1e');
  }
}
// 달
glow(262, 26, 46, '200,20,40', .35);
C(262, 26, 11, '#a8202c'); C(258, 22, 3, '#7d141f'); C(266, 30, 2, '#7d141f'); C(265, 21, 2, '#8f1a26');

// 건물
function building(x, y, w, h, base, cols, rows, lit, cool) {
  R(x, y, w, h, base); R(x, y, w, 2, '#2a2a3a'); R(x - 1, y - 4, w + 2, 4, '#141420');
  const sx = (w - 4) / cols, sy = (h - 8) / rows;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const on = rnd() < lit * .22;
    const c = on ? (cool || rnd() < .25 ? '#4c6a5a' : '#9a7a3c') : '#0c0c16';
    R(x + 3 + i * sx, y + 5 + j * sy, Math.max(2, sx - 3), Math.max(2, sy - 3), c);
  }
}
building(26, 72, 74, 54, '#16161f', 9, 4, .7);
building(98, 84, 28, 44, '#12121a', 3, 4, .55);
building(220, 72, 74, 54, '#16161f', 9, 4, .7);
building(194, 84, 28, 44, '#12121a', 3, 4, .55);
building(118, 64, 84, 66, '#1c1c28', 9, 6, .5, true);
R(138, 76, 44, 36, '#0a1414');
for (let i = 0; i < 8; i++) for (let j = 0; j < 6; j++) R(139 + i * 5.4, 77 + j * 5.8, 4, 4, rnd() < .12 ? '#3f6a55' : '#0d1c1a');
for (let i = 0; i < 7; i++) R(118 + i * 12, 64, 2, 66, '#15151f');
R(146, 68, 28, 4, '#3a3a4c');
// 입구 + 계단
R(148, 118, 24, 12, '#22222e'); R(152, 120, 16, 10, '#5c1a1a'); R(159, 120, 2, 10, '#6a5a5a');
glow(160, 125, 26, '200,30,30', .3);
for (let i = 0; i < 10; i++) { const w = 22 + i * 1.4; R(160 - w / 2, 130 + i * 1.3, w, 1.3, i % 2 ? '#2c2a3a' : '#363448'); }

// 가로수
for (let x = 50; x < 275; x += 6) C(x + rnd() * 3, 124 + rnd() * 7, 7 + rnd() * 4, rnd() < .5 ? '#060a10' : '#08121a');
for (let i = 0; i < 60; i++) C(96 + rnd() * 130, 118 + rnd() * 14, 2 + rnd() * 2, '#0a1c22');
// 벚꽃나무
const pinks = ['#4a1626', '#2e1024', '#5c1a2c', '#1f0e1c', '#3a1224'];
function sakura(x0, x1, y0, y1, n) {
  for (let i = 0; i < n; i++) C(x0 + rnd() * (x1 - x0), y0 + rnd() * (y1 - y0), 3 + rnd() * 5, pinks[rnd() * pinks.length | 0]);
}
sakura(0, 62, 72, 132, 110); sakura(258, 320, 72, 132, 110);
sakura(64, 118, 102, 134, 30); sakura(202, 258, 102, 134, 30);
for (let i = 0; i < 3; i++) { R(14 + i * 22, 120, 3, 20, '#140c14'); R(268 + i * 22, 120, 3, 20, '#2b1a33'); }
// 모서리 나뭇가지
for (let i = 0; i < 50; i++) { C(rnd() * 30, rnd() * 60, 3 + rnd() * 4, '#020208'); C(320 - rnd() * 34, rnd() * 54, 3 + rnd() * 5, '#07102a'); }

// 바닥
R(0, 138, W, 42, '#120e18');
for (let i = 0; i < 140; i++) R(rnd() * W, 140 + rnd() * 40, 4 + rnd() * 14, 1, rnd() < .5 ? '#1c1524' : '#171120');
R(0, 158, W, 1, '#22182c');
for (let x = 6; x < W; x += 22) R(x, 171, 12, 7, '#4a4650');
R(158, 146, 2, 8, '#363448'); R(158, 158, 2, 6, '#363448');
// 라바콘
for (const x of [104, 112, 246, 254]) { R(x, 131, 3, 5, '#7a2a14'); R(x, 133, 3, 1, '#fff'); }

// 정문
function gate(px, fx0, fx1, wx0, wx1) {
  R(wx0, 124, wx1 - wx0, 30, '#181622'); R(wx0, 124, wx1 - wx0, 2, '#2a2638');
  R(px, 110, 28, 62, '#201c2c'); R(px - 2, 106, 32, 5, '#2e2a40');
  for (let y = 114; y < 170; y += 6) R(px + 1, y, 26, 1, '#141220');
  R(px + 7, 118, 9, 32, '#120e1e');
  for (let x = fx0; x < fx1; x += 3) { R(x, 124, 1, 44, '#0f0c1a'); R(x, 122, 1, 3, '#0f0c1a'); }
  R(fx0, 130, fx1 - fx0, 1, '#0f0c1a'); R(fx0, 158, fx1 - fx0, 1, '#0f0c1a');
}
gate(30, 60, 90, 0, 30); gate(262, 230, 260, 290, 320);
R(0, 154, 32, 20, '#201c2c'); R(288, 154, 32, 20, '#201c2c');

// 가로등
function lamp(x, y) {
  R(x, y, 2, 138 - y + 30, '#14101e'); R(x - 3, y - 5, 8, 5, '#1a1622'); R(x - 2, y - 4, 6, 3, '#b9d99a');
  glow(x + 1, y - 2, 26, '120,190,110', .28); glow(x + 1, y + 12, 12, '120,190,110', .08);
}
lamp(46, 102); lamp(275, 102); lamp(228, 118); lamp(96, 132); lamp(300, 124);
for (const [x, y] of [[10, 66], [312, 66]]) { R(x, y, 1, 50, '#14101e'); R(x - 3, y - 4, 7, 5, '#b9d99a'); glow(x, y, 22, '120,190,110', .25); }

// 비네팅
const v = g.createRadialGradient(W / 2, H / 2, H * .45, W / 2, H / 2, W * .62);
v.addColorStop(0, 'rgba(0,0,0,.05)'); v.addColorStop(1, 'rgba(0,0,0,.85)');
g.fillStyle = v; g.fillRect(0, 0, W, H);

// ===== 애니메이션: 흐린 별 + 떠도는 안개 + 깜빡이는 가로등 + 가끔 나타나는 그림자 =====
const ctx = document.getElementById('c').getContext('2d');
const stars = Array.from({ length: 40 }, () => ({ x: rnd() * W, y: rnd() * 62, p: rnd() * 6 }));
const ash = Array.from({ length: 40 }, () => ({ x: rnd() * W, y: rnd() * H, v: .1 + rnd() * .22, d: rnd() * 6, c: rnd() < .6 ? '#5a5560' : '#7a1522' }));
const fogs = Array.from({ length: 7 }, (_, i) => ({ x: rnd() * W, y: 100 + rnd() * 70, r: 50 + rnd() * 50, v: .05 + rnd() * .08, a: .07 + rnd() * .06 }));
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lamps = [[47, 97], [276, 97], [229, 113], [97, 127], [301, 119], [10, 62], [312, 62]];

// 창가에 서 있는 긴 머리 여자의 실루엣 (가끔 나타났다 사라짐)
function figure(x, y, a) {
  ctx.save(); ctx.globalAlpha = a;
  ctx.fillStyle = '#d9d4dc'; ctx.fillRect(x - 3, y - 12, 6, 14);          // 하얀 옷
  ctx.fillStyle = '#0a0608'; ctx.fillRect(x - 3, y - 20, 6, 9); ctx.fillRect(x - 4, y - 18, 1, 14); ctx.fillRect(x + 3, y - 18, 1, 14);   // 머리카락
  ctx.fillStyle = '#ff1f3a'; ctx.fillRect(x - 2, y - 15, 1, 1); ctx.fillRect(x + 1, y - 15, 1, 1);                   // 눈
  ctx.restore();
}
let flick = 0, glitchT = 0;
function frame(t) {
  ctx.drawImage(bg, 0, 0);
  for (const a of stars) {
    const b = (.15 + .3 * Math.abs(Math.sin(t / 900 + a.p)));
    ctx.fillStyle = `rgba(200,180,190,${b})`; ctx.fillRect(a.x | 0, a.y | 0, 1, 1);
  }
  // 붉은 달이 심장처럼 은은하게 맥동
  const pulse = .1 + .08 * Math.sin(t / 620);
  const mg = ctx.createRadialGradient(262, 26, 4, 262, 26, 60); mg.addColorStop(0, `rgba(210,20,40,${pulse + .1})`); mg.addColorStop(1, 'rgba(210,20,40,0)');
  ctx.fillStyle = mg; ctx.fillRect(200, 0, 120, 90);
  // 가로등: 불규칙하게 깜빡임 (가끔 완전히 꺼짐)
  for (let i = 0; i < lamps.length; i++) {
    const [lx, ly] = lamps[i], ph = Math.sin(t / (230 + i * 90) + i * 2.1) + Math.sin(t / 97 + i * 5.3);
    const on = ph > -1.1 ? 1 : ph > -1.5 ? .35 : 0;
    ctx.fillStyle = `rgba(0,0,0,${.55 * (1 - on)})`; ctx.fillRect(lx - 14, ly - 12, 30, 30);
  }
  // 안개
  for (const f of fogs) {
    if (!still) { f.x += f.v; if (f.x - f.r > W) f.x = -f.r; }
    const q = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    q.addColorStop(0, `rgba(150,120,130,${f.a})`); q.addColorStop(1, 'rgba(150,120,130,0)');
    ctx.fillStyle = q; ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
  }
  // 재/핏방울
  for (const p of ash) {
    if (!still) { p.y += p.v; p.x += Math.sin(t / 900 + p.d) * .12; if (p.y > H) { p.y = -2; p.x = rnd() * W; } }
    ctx.fillStyle = p.c; ctx.fillRect(p.x | 0, p.y | 0, 1, p.c === '#7a1522' ? 2 : 1);
  }
  // 그림자: 약 10초에 한 번, 0.9초 동안 정문 길 한가운데에 서 있다 사라짐
  const cyc = (t / 1000) % 10;
  if (cyc > 7.2 && cyc < 8.1) figure(160, 150, Math.min(1, (cyc - 7.2) * 3) * Math.min(1, (8.1 - cyc) * 3) * .75);
  // 화면 지직거림 + 필름 노이즈
  if (!still) {
    if (Math.random() < .012) glitchT = 4 + (Math.random() * 6 | 0);
    if (glitchT > 0) {
      glitchT--;
      const gy = (Math.random() * (H - 30)) | 0, gh = 4 + (Math.random() * 18 | 0), dx = ((Math.random() - .5) * 14) | 0;
      ctx.drawImage(ctx.canvas, 0, gy, W, gh, dx, gy, W, gh);
      ctx.fillStyle = 'rgba(160,0,20,.12)'; ctx.fillRect(0, gy, W, gh);
    }
    if (Math.random() < .02) flick = 3;
    if (flick > 0) { flick--; ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H); }
    for (let i = 0; i < 46; i++) { ctx.fillStyle = `rgba(255,255,255,${Math.random() * .07})`; ctx.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 1, 1); }
  }
  ctx.fillStyle = 'rgba(20,0,8,.16)'; ctx.fillRect(0, 0, W, H);
  if (!still) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ===== 메뉴 =====
const SAVE_KEY = 'cheongun-escape-progress';
const hasSave = () => {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return !!s && Object.keys(s).length > 0; }
  catch (e) { return false; }
};
const clearSave = () => { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem('cheongun-escape-time'); localStorage.removeItem('cheongun-escape-deaths'); localStorage.removeItem('cheongun-escape-lives'); } catch (e) {} };

const allBtns = [...document.querySelectorAll('nav button')];
allBtns.find(b => b.dataset.a === 'continue').hidden = !hasSave();   // 저장된 진행이 있을 때만 표시
const btns = allBtns.filter(b => !b.hidden);
const msg = document.getElementById('msg');
let cur = 0, timer;

const pick = i => {
  cur = (i + btns.length) % btns.length;
  btns.forEach((b, k) => b.classList.toggle('on', k === cur));
};
const say = text => {
  msg.textContent = text; msg.classList.add('show');
  clearTimeout(timer); timer = setTimeout(() => msg.classList.remove('show'), 2200);
};
const enter = text => { say(text); setTimeout(() => { location.href = 'game.html'; }, 700); };

// ----- 난이도 선택 -----
const MODE_KEY = 'cheongun-escape-mode';
const MODE_NAMES = { easy: 'EASY', hard: 'HARD', extreme: 'EXTREME' };
const getMode = () => { try { const m = localStorage.getItem(MODE_KEY); return MODE_NAMES[m] ? m : 'easy'; } catch (e) { return 'easy'; } };
const modeEl = document.getElementById('mode');
const modeBtns = [...modeEl.querySelectorAll('button[data-m]')];
let modeOpen = false, modeFor = 'new', mcur = 0;

const pickMode = i => {
  mcur = (i + modeBtns.length) % modeBtns.length;
  modeBtns.forEach((b, k) => b.classList.toggle('on', k === mcur));
};
const openMode = forWhat => {
  modeOpen = true; modeFor = forWhat; modeEl.hidden = false;
  pickMode(modeBtns.findIndex(b => b.dataset.m === getMode()));
};
const closeMode = () => { modeOpen = false; modeEl.hidden = true; };
const chooseMode = () => {
  const m = modeBtns[mcur].dataset.m;
  try { localStorage.setItem(MODE_KEY, m); } catch (e) {}
  closeMode();
  clearSave(); enter(`${MODE_NAMES[m]} 모드로 새 게임을 시작합니다...`);
};
modeBtns.forEach((b, i) => {
  b.addEventListener('mouseenter', () => pickMode(i));
  b.addEventListener('click', () => { pickMode(i); chooseMode(); });
});

// ----- 게임 설명 (OPTION) -----
const helpEl = document.getElementById('help');
let helpOpen = false;
const openHelp = () => { helpOpen = true; helpEl.hidden = false; };
const closeHelp = () => { helpOpen = false; helpEl.hidden = true; };
helpEl.addEventListener('click', closeHelp);

const go = () => {
  const action = btns[cur].dataset.a;
  if (action === 'continue') {
    enter(`이어서 시작합니다... (${MODE_NAMES[getMode()]})`);
  } else if (action === 'new') {
    if (hasSave() && !confirm('저장된 진행 상황이 지워집니다.\n새 게임을 시작할까요?')) return;
    openMode('new');
  } else if (action === 'opt') {
    openHelp();
  } else {
    say('브라우저에서는 창을 직접 닫아주세요.');
  }
};

btns.forEach((b, i) => {
  b.addEventListener('mouseenter', () => pick(i));
  b.addEventListener('click', () => { pick(i); go(); });
});
addEventListener('keydown', e => {
  if (helpOpen) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') closeHelp(); e.preventDefault(); return; }
  if (modeOpen) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') pickMode(mcur - 1);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') pickMode(mcur + 1);
    else if (e.key === 'Enter' || e.key === ' ') chooseMode();
    else if (e.key === 'Escape') closeMode();
    e.preventDefault(); return;
  }
  if (e.key === 'ArrowDown') { pick(cur + 1); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { pick(cur - 1); e.preventDefault(); }
  else if (e.key === 'Enter' || e.key === ' ') { go(); e.preventDefault(); }
});
pick(0);
