(() => {
'use strict';

// ===== 기본 설정 =====
const COLS = 32, ROWS = 18, T = 24;            // 가로 32칸 x 세로 18칸, 한 칸 24px
const W = COLS * T, H = ROWS * T;
const MIN_FLOOR = 3, MAX_FLOOR = 8, TOTAL_ROOMS = 12;
const LOW = 2;                                          // 귀신이 돌아다니는 가장 낮은 층(2층 = 추격 전용 층)
const SAVE_KEY = 'cheongun-escape-progress';
const MODE_KEY = 'cheongun-escape-mode';
const TIME_KEY = 'cheongun-escape-time', DEATH_KEY = 'cheongun-escape-deaths';
// 난이도: 시작 화면에서 고른 값(easy/hard). 테스트할 때는 game.html?mode=hard 로도 열 수 있어요.
const MODE = (() => {
  const q = new URLSearchParams(location.search).get('mode');
  if (q) return q;
  try { return localStorage.getItem(MODE_KEY) || 'easy'; } catch (e) { return 'easy'; }
})();
const EXTREME = MODE === 'extreme';                     // 익스트림: 하드(어둠) + 귀신이 더 빠름
const HARD = MODE === 'hard' || EXTREME;
// ★ EXTREME = 못 깨라고 만든 장난 난이도 (아래 숫자를 낮추면 순해져요)
const EX = { chase: 130, wander: 80, sight: 1000, catchR: 18, follow: .7, hopMin: 1.2, hopMax: 2.4,
             hideSec: 12, quizSec: 8, penalty: 15, light: 58 };
const UI_FONT = "'Noto Sans KR','Malgun Gothic',sans-serif";

const $ = id => document.getElementById(id);
const canvas = $('game'); canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');
const stat = document.createElement('canvas'); stat.width = W; stat.height = H;   // 맵(안 변하는 부분)
const sctx = stat.getContext('2d');
const vig = document.createElement('canvas'); vig.width = W; vig.height = H;       // 어두운 테두리
{
  const v = vig.getContext('2d');
  const g = v.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, W * .62);
  g.addColorStop(0, 'rgba(0,0,14,0)'); g.addColorStop(1, 'rgba(0,0,14,.6)');
  v.fillStyle = g; v.fillRect(0, 0, W, H);
}

// ===== 진행 상황 (푼 문제는 브라우저에 저장) =====
let solved = {};
try { solved = JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) {}
const saveProgress = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(solved)); } catch (e) {} };

// 클리어 기록용: 플레이 시간(초)과 잡힌 횟수
let playSec = 0, deaths = 0, saveAcc = 0;
try { playSec = Number(localStorage.getItem(TIME_KEY)) || 0; deaths = Number(localStorage.getItem(DEATH_KEY)) || 0; } catch (e) {}
// 목숨: HARD 5개 / EXTREME 3개 (EASY는 없음). 죽을 때마다 하트가 검게 변하고, 다 잃으면 시작 화면으로 돌아감
const LIVES_KEY = 'cheongun-escape-lives';
const MAX_LIVES = EXTREME ? 3 : HARD ? 5 : 0;
let lives = MAX_LIVES;
try { const v = localStorage.getItem(LIVES_KEY); if (MAX_LIVES && v !== null) lives = Math.max(0, Math.min(MAX_LIVES, Number(v))); } catch (e) {}
const saveLives = () => { try { localStorage.setItem(LIVES_KEY, String(lives)); } catch (e) {} };
const savePlay = () => { try { localStorage.setItem(TIME_KEY, String(Math.floor(playSec))); localStorage.setItem(DEATH_KEY, String(deaths)); } catch (e) {} };

// 시작 층: 기본 8층. 테스트할 때는 game.html?floor=5 처럼 열면 그 층에서 시작해요.
let floor = MAX_FLOOR;
const qs = Number(new URLSearchParams(location.search).get('floor'));
if ((qs >= MIN_FLOOR && qs <= MAX_FLOOR) || qs === 1 || qs === 2) floor = qs;

// 한 층은 화면 2개(왼쪽 0 / 오른쪽 1). 강의실 번호 n(1~8): 1~4는 왼쪽, 5~8은 오른쪽 화면.
// 층마다 과가 2개 → FLOORS[층]의 첫 번째는 왼쪽 화면, 두 번째는 오른쪽 화면에 있어요.
let screen = 0;
if (new URLSearchParams(location.search).get('screen') === '1') screen = 1;

const rooms = () => FLOORS[floor] || [];
const locate = r => { const n = r - floor * 100; return { screen: n > 4 ? 1 : 0, idx: ((n - 1) % 4) + 1 }; };
const roomAt = idx => rooms().find(r => { const l = locate(r.room); return l.screen === screen && l.idx === idx; });
const screenDept = () => { if (floor === 1) return '로비'; if (floor === 2) return '비상 복도';
   const r = rooms().find(r => locate(r.room).screen === screen); return r ? r.dept : ''; };
const VALID_ROOMS = new Set(Object.values(FLOORS).flat().map(r => r.room));

// ===== 맵 만들기 =====
// '#' 벽, ',' 강의실 바닥, '.' 복도 바닥, 'd' 책상, 'b' 칠판
// '1'~'4' 강의실 문, 'U' 위층 계단, 'D' 아래층 계단
const ROOM_X = [1, 8, 15, 22];
let map = [];
let safe2 = false, lobbyBack = 0, gateOpen = false, gateTx = 15, failT = 0, won = false, winT = 0, winShown = false;
const CODE = Object.values(FLOORS).flat().reduce((a, r) => a + r.answer, 0);
function buildMap() {
  const m = Array.from({ length: ROWS }, () => Array(COLS).fill('#'));
  if (floor === 1) {                                     // 1층 로비: 정문 'G' 두 칸, 계단은 왼쪽
    for (let y = 8; y <= 14; y++) for (let x = 1; x <= 30; x++) m[y][x] = '.';
    m[7][15] = m[7][16] = 'G';
    m[10][1] = m[10][2] = 'U';
    return m;
  }
  if (floor !== 2) ROOM_X.forEach((x0, i) => {
    for (let y = 1; y <= 6; y++) for (let x = x0; x < x0 + 6; x++) m[y][x] = ',';
    for (let x = x0 + 1; x <= x0 + 4; x++) m[1][x] = 'b';
    for (const y of [3, 5]) for (const x of [x0 + 1, x0 + 4]) m[y][x] = 'd';
    m[7][x0 + 2] = String(i + 1);
  });
  for (let y = 8; y <= 14; y++) for (let x = 1; x <= 30; x++) m[y][x] = '.';
  if (floor === 2) {                        // 2층: 왼쪽 화면에는 위층 계단, 오른쪽 화면에는 아래층 계단만 있음
    if (screen === 0) { m[9][1] = m[9][2] = 'U'; for (let y = 8; y <= 14; y++) m[y][31] = '.'; }
    else { m[13][29] = m[13][30] = 'D'; for (let y = 8; y <= 14; y++) m[y][0] = '.'; }
  } else if (screen === 0) {                       // 왼쪽 화면: 계단은 왼쪽, 오른쪽 끝은 다음 화면으로 열림
    m[9][1] = m[9][2] = 'U';
    m[13][1] = m[13][2] = 'D';
    for (let y = 8; y <= 14; y++) m[y][31] = '.';
  } else {                                  // 오른쪽 화면: 계단은 오른쪽, 왼쪽 끝은 이전 화면으로 열림
    m[9][29] = m[9][30] = 'U';
    m[13][29] = m[13][30] = 'D';
    for (let y = 8; y <= 14; y++) m[y][0] = '.';
  }
  if (floor !== 1) for (const ct of CAB_TILES) m[13][ct] = m[14][ct] = 'C';   // 캐비닛은 복도 안에 서 있는 장애물
  return m;
}
const tileAt = (tx, ty) => (map[ty] && map[ty][tx]) || '#';
const isDoor = ch => ch >= '1' && ch <= '4' && ch.length === 1;

function solidChar(ch) {
  if (ch === '#' || ch === 'd' || ch === 'b' || ch === 'C') return true;
  if (ch === 'U') return floor >= MAX_FLOOR;
  if (ch === 'D') return false;                         // 3층 아래 계단은 1층 로비로 이어짐
  return false;
}
function blockMessage(ch) {
  if (ch === 'U') return '옥상으로 가는 문은 잠겨 있다.';
  return null;
}

// ===== 맵 그리기 =====
const FONT_PX = "'DotGothic16'," + UI_FONT;
const rect = (x, y, w, h, c) => { sctx.fillStyle = c; sctx.fillRect(x, y, w, h); };
const lin = (x0, y0, x1, y1, stops) => {
  const g = sctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  return g;
};
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const disc = (cx, cy, r, c) => {
  sctx.fillStyle = c;
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y));
    sctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
};
function label(text, cx, cy, size, color, font) {
  sctx.font = `700 ${size}px ${font || UI_FONT}`;
  sctx.textAlign = 'center'; sctx.textBaseline = 'middle';
  sctx.fillStyle = color; sctx.fillText(text, cx, cy);
}
function chip(text, cx, cy, color, border) {
  sctx.font = `700 11px ${FONT_PX}`;
  const w = Math.ceil(sctx.measureText(text).width) + 12, h = 15;
  const x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
  rect(x, y, w, h, 'rgba(10,6,28,.85)');
  rect(x, y, w, 1, border); rect(x, y + h - 1, w, 1, border);
  rect(x, y, 1, h, border); rect(x + w - 1, y, 1, h, border);
  label(text, cx, cy + 1, 11, color, FONT_PX);
}

// --- 바닥 ---
function corridorTile(tx, ty) {
  const x = tx * T, y = ty * T;
  rect(x, y, T, T, (tx + ty) % 2 ? '#2a2552' : '#2f2a5a');
  sctx.fillStyle = lin(x, y, x + T, y + T, [[0, 'rgba(255,255,255,.06)'], [1, 'rgba(0,0,0,.10)']]);
  sctx.fillRect(x, y, T, T);
  rect(x, y, T, 1, '#1b1738'); rect(x, y, 1, T, '#1b1738');
  rect(x + 1, y + 1, T - 1, 1, 'rgba(255,255,255,.05)');
}
function woodTile(tx, ty) {
  const x = tx * T, y = ty * T;
  const cols = ['#4d3a3d', '#54403f', '#493639', '#5a4442'];
  for (let i = 0; i < 4; i++) {
    const py = y + i * 6, row = ty * 4 + i;
    rect(x, py, T, 6, cols[(row * 3 + (tx >> 1)) % 4]);
    rect(x, py, T, 1, '#33262a');
    rect(x, py + 1, T, 1, 'rgba(255,255,255,.04)');
    if ((tx * 5 + row * 7) % 9 === 0) rect(x + 9, py, 1, 6, '#33262a');
  }
}

// --- 벽 ---
function wallTop(tx, ty) {
  const x = tx * T, y = ty * T;
  rect(x, y, T, T, '#17132f');
  const open = (dx, dy) => tileAt(tx + dx, ty + dy) !== '#';
  if (open(0, -1)) rect(x, y, T, 2, '#403a86');
  if (open(-1, 0)) rect(x, y, 2, T, '#2c2766');
  if (open(1, 0)) rect(x + T - 2, y, 2, T, '#2c2766');
}
function wallFace(tx, ty) {
  const x = tx * T, y = ty * T;
  sctx.fillStyle = lin(x, y, x, y + T, [[0, '#2e2968'], [1, '#231f50']]);
  sctx.fillRect(x, y, T, T);
  rect(x, y + 12, T, 1, '#4b45a3');
  rect(x + 1, y + 14, T - 2, 7, '#292463');
  rect(x + 1, y + 14, T - 2, 1, 'rgba(255,255,255,.09)');
  rect(x, y + T - 3, T, 3, '#151130');
  rect(x, y, 1, 12, 'rgba(0,0,0,.18)');
  if (ty === 7) rect(x, y + 9, T, 1, 'rgba(255,90,140,.55)');   // 복도 쪽 네온 라인
}
function classWindow(x, y) {
  rect(x + 3, y + 1, 18, 16, '#120e2a');
  sctx.fillStyle = lin(x, y + 2, x, y + 16, [[0, '#33449f'], [1, '#161c5c']]);
  sctx.fillRect(x + 4, y + 2, 16, 14);
  rect(x + 6, y + 5, 1, 1, '#fff'); rect(x + 9, y + 3, 1, 1, '#cfd4ff'); rect(x + 7, y + 11, 1, 1, '#cfd4ff');
  rect(x + 15, y + 3, 4, 4, '#e3e2ff');
  rect(x + 11, y + 2, 2, 14, '#120e2a'); rect(x + 4, y + 8, 16, 2, '#120e2a');
  rect(x + 2, y + 17, 20, 3, '#5d57a8'); rect(x + 2, y + 17, 20, 1, '#8781d4');
}
function bigWindow(x, y, w, h, moon) {
  rect(x - 2, y - 2, w + 4, h + 4, '#120e2a');
  sctx.fillStyle = lin(x, y, x, y + h, [[0, '#3a4cae'], [1, '#171d63']]);
  sctx.fillRect(x, y, w, h);
  for (let i = 0; i < 9; i++) rect((x + 4 + hash(i, x) * (w - 8)) | 0, (y + 3 + hash(x, i) * (h - 12)) | 0, 1, 1, '#dfe3ff');
  if (moon) { disc(x + w - 22, y + 12, 6, '#e6e4ff'); disc(x + w - 24, y + 10, 2, '#c9c6f2'); }
  rect(x + w / 2 - 1, y, 2, h, '#120e2a'); rect(x, y + h / 2 - 1, w, 2, '#120e2a');
  rect(x - 4, y + h + 2, w + 8, 4, '#5d57a8'); rect(x - 4, y + h + 2, w + 8, 1, '#8781d4');
}

// --- 문 ---
function doorTile(tx, ty, ch) {
  const x = tx * T, y = ty * T, info = roomAt(Number(ch));
  const no = floor * 100 + Number(ch) + screen * 4;
  woodTile(tx, ty);
  if (info) {                                       // 문제가 있는 강의실: 반짝이는 문
    const done = !!solved[info.room];
    const fr = done ? '#3fbf7f' : '#e0a04a', dk = done ? '#1f7a4d' : '#9a6526';
    sctx.fillStyle = lin(x, y, x, y + T, [[0, done ? 'rgba(120,255,180,.40)' : 'rgba(255,214,140,.60)'], [1, 'rgba(0,0,0,0)']]);
    sctx.fillRect(x, y, T, T);
    rect(x, y, 3, T, fr); rect(x + T - 3, y, 3, T, fr);
    rect(x, y, 1, T, dk); rect(x + T - 1, y, 1, T, dk);
    rect(x, y, T, 4, fr); rect(x, y + 3, T, 1, dk);
    rect(x + 4, y + 5, T - 8, 8, '#14102c');
    label(String(no), x + T / 2, y + 9.5, 8, done ? '#9dffc8' : '#fff');
  } else {                                          // 그냥 강의실: 열려 있는 평범한 문
    sctx.fillStyle = lin(x, y, x, y + T, [[0, 'rgba(255,240,210,.22)'], [1, 'rgba(0,0,0,0)']]);
    sctx.fillRect(x, y, T, T);
    rect(x, y, 3, T, '#6d5a4a'); rect(x + T - 3, y, 3, T, '#6d5a4a');
    rect(x, y, 1, T, '#3d3026'); rect(x + T - 1, y, 1, T, '#3d3026');
    rect(x, y, T, 4, '#6d5a4a'); rect(x, y + 3, T, 1, '#3d3026');
    rect(x + 4, y + 5, T - 8, 8, '#14102c');
    label(String(no), x + T / 2, y + 9.5, 8, '#a9a4cc');
  }
}

// --- 계단 ---
function stairTile(tx, ty, ch) {
  const x = tx * T, y = ty * T, up = ch === 'U';
  const usable = up ? floor < MAX_FLOOR : true;
  corridorTile(tx, ty);
  rect(x, y, T, T, usable ? '#1f1b45' : '#191637');
  for (let i = 0; i < 5; i++) {
    const yy = y + 1 + i * 4;
    rect(x + 1, yy, T - 2, 3, usable ? '#7a72b8' : '#48446e');
    rect(x + 1, yy + 3, T - 2, 1, '#14112b');
    rect(x + 1, yy, T - 2, 1, usable ? '#a7a0dc' : '#5c5888');
  }
  if (tx === 1) rect(x, y, 2, T, usable ? '#ffcf7a' : '#4b4570');   // 난간
  if (tx === 30) rect(x + T - 2, y, 2, T, usable ? '#ffcf7a' : '#4b4570');
  label(up ? '▲' : '▼', x + T / 2 + (tx === 1 ? 1 : tx === 30 ? -1 : 0), y + T / 2, 11, usable ? '#ffd27a' : '#6a6690');
}

// --- 가구 ---
function desk(tx, ty) {
  const x = tx * T, y = ty * T, r = hash(tx, ty);
  rect(x + 3, y + 17, 3, 5, '#33241a'); rect(x + T - 6, y + 17, 3, 5, '#33241a');
  rect(x + 5, y + 18, T - 10, 4, '#343a86'); rect(x + 5, y + 21, T - 10, 2, '#262b66');
  rect(x + 2, y + 4, T - 4, 13, '#b58a55'); rect(x + 2, y + 4, T - 4, 2, '#d3a86c');
  rect(x + 2, y + 15, T - 4, 2, '#7a5734');
  if (r < .5) { rect(x + 6, y + 8, 7, 5, '#eae7f7'); rect(x + 6, y + 8, 7, 1, '#b7b2dd'); rect(x + 15, y + 9, 1, 4, '#e8c24a'); }
  else if (r < .8) { rect(x + 7, y + 6, 10, 7, '#2b2f55'); rect(x + 8, y + 7, 8, 5, '#6aa0ff'); }
}
function board(x0, info) {
  const bx = (x0 + 1) * T - 3, by = T + 2, bw = 4 * T + 6, bh = 20;
  rect(bx, by, bw, bh, '#5f4426');
  rect(bx + 2, by + 2, bw - 4, bh - 6, '#0c3b34');
  sctx.fillStyle = lin(bx, by, bx + bw, by + bh, [[0, 'rgba(255,255,255,.12)'], [.5, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.05)']]);
  sctx.fillRect(bx + 2, by + 2, bw - 4, bh - 6);
  rect(bx + 2, by + bh - 4, bw - 4, 3, '#b58a4c');
  rect(bx + 14, by + bh - 6, 5, 2, '#f1f1f1'); rect(bx + 22, by + bh - 6, 4, 2, '#f7a7c4');
  label(info ? info.dept : '자습', bx + bw / 2, by + 8, 11, info ? 'rgba(240,245,240,.92)' : 'rgba(200,215,205,.55)', FONT_PX);
}

// --- 빛 효과 ---
function beam(x0, x1, y0, dx, len, a) {
  const g = sctx.createLinearGradient(0, y0, 0, y0 + len);
  g.addColorStop(0, `rgba(170,175,255,${a})`); g.addColorStop(1, 'rgba(170,175,255,0)');
  sctx.fillStyle = g; sctx.beginPath();
  sctx.moveTo(x0, y0); sctx.lineTo(x1, y0); sctx.lineTo(x1 + dx, y0 + len); sctx.lineTo(x0 + dx, y0 + len);
  sctx.closePath(); sctx.fill();
}
function pool(x, y, r, rgb, a) {
  const g = sctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
  sctx.fillStyle = g; sctx.fillRect(x - r, y - r, r * 2, r * 2);
}

const CAB_TILES = [5, 16, 26];          // 복도 남쪽 벽에 있는 숨을 수 있는 캐비닛 위치(칸)
function drawCabinet(tile) {                             // 복도 안으로 튀어나온 사물함(숨는 곳): 타일 13~14행을 차지함
  const x = tile * T - 1, y = 13 * T - 8, w = T + 2, h = 2 * T + 8;
  sctx.fillStyle = 'rgba(0,0,0,.35)'; sctx.fillRect(x - 2, y + h - 3, w + 4, 6);       // 그림자
  rect(x - 1, y - 1, w + 2, h + 1, '#22112b');
  sctx.fillStyle = lin(x, y, x + w, y, [[0, '#7a4870'], [.5, '#663a5e'], [1, '#4a2846']]); sctx.fillRect(x, y, w, h);
  rect(x, y, w, 3, '#a56a98');                                                        // 윗면 하이라이트
  for (let k = 0; k < 4; k++) rect(x + 4, y + 9 + k * 4, w - 8, 2, '#1b0d22');         // 환기구 살
  rect(x + w / 2 - 1, y + 28, 2, h - 34, '#3b1f39');                                  // 문 틈
  rect(x + w / 2 - 5, y + 34, 2, 6, '#ffb3c9'); rect(x + w / 2 + 3, y + 34, 2, 6, '#ffb3c9');   // 손잡이
  rect(x, y + h - 3, w, 3, '#22112b');
}
function drawCabinets() {
  for (const ct of CAB_TILES) {
    drawCabinet(ct);
    chip('E 숨기', (ct + .5) * T, 13 * T - 18, '#ffe2ec', '#ff3d6e');
  }
}

let beacons = [], lights = [], exitEdge = null;

function drawSouthWall() {
  sctx.fillStyle = lin(0, 15 * T, 0, H, [[0, '#28235c'], [1, '#181435']]);
  sctx.fillRect(0, 15 * T, W, 3 * T);
  rect(0, 15 * T, W, 2, 'rgba(255,61,110,.6)');
  rect(0, 15 * T + 2, W, 3, '#3b3580');
  for (const [lx0, n] of [[3 * T, 12], [23 * T, 12]]) for (let k = 0; k < n; k++) {
    const x = lx0 + k * 12;
    rect(x, 368, 12, 46, k % 2 ? '#34448a' : '#3b4d94');
    rect(x, 368, 12, 1, '#6c7ed0'); rect(x + 11, 368, 1, 46, '#1f2a5c');
    for (let v = 0; v < 3; v++) rect(x + 3, 373 + v * 3, 6, 1, '#1b2350');
    rect(x + 8, 394, 2, 5, '#c9cff0');
  }
  bigWindow(264, 368, 96, 38, false);
  bigWindow(408, 368, 96, 38, true);
  rect(372, 366, 24, 12, '#0d6b3e'); rect(372, 366, 24, 1, '#5ef0a0');
  label('EXIT', 384, 372.5, 8, '#eafff3');
  rect(0, 418, W, 14, '#15112b'); rect(0, 418, W, 1, '#3a3478');
}

// --- 1층 로비 ---
function drawLobby() {
  const allDone = Object.keys(solved).filter(k => VALID_ROOMS.has(Number(k))).length >= TOTAL_ROOMS;
  // 붉은 카펫
  rect(14 * T + 4, 8 * T, 4 * T - 8, 7 * T, '#4d1029');
  rect(14 * T + 4, 8 * T, 2, 7 * T, '#c9a25a'); rect(18 * T - 6, 8 * T, 2, 7 * T, '#c9a25a');
  rect(14 * T + 8, 8 * T, 1, 7 * T, '#7a1c3f'); rect(18 * T - 9, 8 * T, 1, 7 * T, '#7a1c3f');
  for (let k = 0; k < 7; k++) { rect(16 * T - 5, 8 * T + 6 + k * T, 10, 2, '#7a1c3f'); rect(16 * T - 2, 8 * T + 10 + k * T, 4, 4, '#a1284f'); }

  // 창밖 풍경
  sctx.save(); sctx.beginPath(); sctx.rect(T, 14, 30 * T, 154); sctx.clip();
  sctx.fillStyle = lin(0, 14, 0, 168, [[0, '#070a26'], [.55, '#241a4f'], [1, '#402b6b']]); sctx.fillRect(T, 14, 30 * T, 154);
  for (let i = 0; i < 70; i++) rect((T + hash(i, 5) * 30 * T) | 0, (16 + hash(i, 6) * 80) | 0, 1, 1, hash(i, 8) > .8 ? '#fff' : '#b9beff');
  disc(600, 50, 15, '#c9c5f8'); disc(595, 46, 3, '#aaa6e4'); disc(606, 56, 2, '#aaa6e4');
  pool(600, 50, 90, '150,140,255', .25);
  for (const [bx, bw, bh] of [[60, 90, 50], [176, 70, 36], [520, 80, 44], [644, 100, 56]]) {
    rect(bx, 142 - bh, bw, bh, '#141238'); rect(bx, 142 - bh, bw, 2, '#2c2a66');
    for (let wy = 5; wy < bh - 6; wy += 9) for (let wx = 5; wx < bw - 6; wx += 10) if (hash(bx + wx, wy) > .4) rect(bx + wx, 142 - bh + wy, 5, 5, hash(wx, wy + bx) > .5 ? '#f6c77a' : '#63b8ff');
  }
  rect(T, 142, 30 * T, 26, '#1b1536'); rect(T, 142, 30 * T, 2, '#2d2560');
  rect(330, 142, 108, 26, '#2a2250');
  const pk = ['#d1608f', '#9c4394', '#e888ab', '#63306f', '#b24f8f'];
  for (const [x0, x1] of [[24, 150], [612, 744]]) {
    for (let i = 0; i < 46; i++) disc((x0 + hash(i, x0) * (x1 - x0)) | 0, (78 + hash(x0, i) * 62) | 0, 4 + (hash(i, 2) * 6 | 0), pk[(hash(i, 9) * 5) | 0]);
    for (let k = 0; k < 3; k++) rect(x0 + 20 + k * 40, 130, 3, 14, '#2b1a33');
  }
  for (const lx of [300, 470]) { rect(lx, 96, 2, 46, '#14101e'); rect(lx - 3, 91, 8, 5, '#ffb95e'); pool(lx + 1, 94, 34, '255,170,80', .5); }
  sctx.restore();
  rect(T, 8, 30 * T, 8, '#1a1640'); rect(T, 166, 30 * T, 4, '#4b45a3');
  for (let x = T; x <= 31 * T; x += 84) if (x < 350 || x > 418) rect(x - 2, 14, 4, 154, '#0e0b25');
  rect(T, 62, 30 * T, 4, '#0e0b25');

  // 정문: 유리 이중문 + 쇠사슬 + 자물쇠 + 번호 패널
  rect(354, 66, 60, 126, '#1c1c44'); rect(354, 66, 60, 3, '#6a6fb0');
  for (const lx of [358, 385]) {
    sctx.fillStyle = lin(lx, 72, lx + 24, 190, [[0, '#4a5cae'], [1, '#1a2258']]); sctx.fillRect(lx, 72, 25, 120);
    sctx.fillStyle = 'rgba(255,255,255,.12)'; sctx.beginPath(); sctx.moveTo(lx + 4, 72); sctx.lineTo(lx + 12, 72); sctx.lineTo(lx + 2, 130); sctx.lineTo(lx - 2, 130); sctx.closePath(); sctx.fill();
    rect(lx, 72, 25, 2, '#8a90c8'); rect(lx, 120, 25, 2, '#12123a');
  }
  rect(383, 72, 2, 120, '#0c0c2a'); rect(379, 128, 3, 12, '#c9cff0'); rect(386, 128, 3, 12, '#c9cff0');
  for (let i = 0; i < 12; i++) { rect(360 + i * 4, 94 + i * 5, 4, 2, i % 2 ? '#9aa0c8' : '#6d7299'); rect(408 - i * 4, 94 + i * 5, 4, 2, i % 2 ? '#9aa0c8' : '#6d7299'); }
  rect(376, 118, 16, 14, allDone ? '#d9c46a' : '#c9a25a'); rect(379, 110, 2, 8, '#a8a0b8'); rect(387, 110, 2, 8, '#a8a0b8'); rect(379, 108, 10, 2, '#a8a0b8');
  rect(383, 122, 2, 5, '#3a2a10');
  rect(420, 110, 26, 44, '#141838'); rect(420, 110, 26, 2, '#4b4f9a');
  rect(424, 116, 18, 8, '#04160f'); label('* * *', 433, 120.5, 7, '#7dffb0');
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) rect(424 + c * 6, 128 + r * 6, 4, 4, '#3a3f7a');
  rect(431, 112, 4, 2, allDone ? '#3ddc84' : '#ff3d5e');
  rect(366, 50, 36, 12, '#0d6b3e'); rect(366, 50, 36, 1, '#5ef0a0'); label('EXIT', 384, 56.5, 8, '#eafff3');
  chip('정문', 384, 8 * T + 11, '#ffa9c3', '#ff3d6e');

  // 달빛
  sctx.save(); sctx.beginPath(); sctx.rect(T, 8 * T, 30 * T, 7 * T); sctx.clip();
  for (const wx of [70, 150, 500, 610]) beam(wx, wx + 40, 170, 34, 150, .17);
  sctx.restore();

  drawSouthWall();

  sctx.globalCompositeOperation = 'lighter';
  [[8, 11], [16, 11], [24, 11]].forEach(([tx, ty], i) => {
    const px = (tx + .5) * T, py = (ty + .5) * T;
    pool(px, py, 130, '255,214,150', .13);
    lights.push({ x: px, y: py, r: 180, a: .95, flick: i === 2 });
  });
  pool(16 * T, 8 * T, 90, '160,190,255', .2); lights.push({ x: 16 * T, y: 8.5 * T, r: 120, a: .8 });
  pool(2 * T, 10.5 * T, 60, '255,205,130', .12); lights.push({ x: 2 * T, y: 10.5 * T, r: 80, a: .6 });
  sctx.globalCompositeOperation = 'source-over';
  beacons.push({ x: 16 * T, y: 7.5 * T, done: false, room: 'gate' });
  exitEdge = null;
}

function buildStatic() {
  beacons = []; lights = [];
  rect(0, 0, W, H, '#0a0a1a');

  // 1) 타일
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
    const ch = map[ty][tx];
    if (ch === '#') {
      if (ty >= 15) rect(tx * T, ty * T, T, T, '#17132f');
      else if (tileAt(tx, ty + 1) !== '#') wallFace(tx, ty);
      else wallTop(tx, ty);
      if (ty === 0) ROOM_X.forEach(x0 => { if (tx === x0 || tx === x0 + 5) classWindow(tx * T, 0); });
    } else if (ch === ',' || ch === 'd' || ch === 'b') woodTile(tx, ty);
    else if (ch === '.') corridorTile(tx, ty);
    else if (ch === 'U' || ch === 'D') stairTile(tx, ty, ch);
    else if (isDoor(ch)) doorTile(tx, ty, ch);
    else if (ch === 'G' || ch === 'C') corridorTile(tx, ty);
  }
  if (floor === 1) { drawLobby(); return; }

  if (floor === 2) { drawChaseFloor(); return; }

  // 2) 강의실 안: 러너 카펫, 칠판, 책상
  ROOM_X.forEach((x0, i) => {
    board(x0, roomAt(i + 1) || null);
  });
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) if (map[ty][tx] === 'd') desk(tx, ty);

  // 3) 복도 벽 포스터
  const pc = ['#ff5c8a', '#5cc8ff', '#ffd15c', '#8f7bff'];
  ROOM_X.forEach((x0, i) => {
    const px = (x0 + 4) * T + 5, py = 7 * T + 1;
    rect(px, py, 14, 10, '#0e0b22'); rect(px + 1, py + 1, 12, 8, pc[(i + floor + screen * 2) % 4]);
    rect(px + 3, py + 3, 8, 1, 'rgba(0,0,0,.35)'); rect(px + 3, py + 5, 6, 1, 'rgba(0,0,0,.35)');
  });

  // 4) 복도 바닥 광택
  sctx.save(); sctx.beginPath(); sctx.rect(T, 8 * T, 30 * T, 7 * T); sctx.clip();
  for (let i = 0; i < 6; i++) {
    const gx = 60 + i * 130;
    sctx.fillStyle = 'rgba(255,255,255,.035)'; sctx.beginPath();
    sctx.moveTo(gx, 8 * T); sctx.lineTo(gx + 34, 8 * T); sctx.lineTo(gx - 30, 15 * T); sctx.lineTo(gx - 64, 15 * T);
    sctx.closePath(); sctx.fill();
  }
  sctx.restore();

  drawSouthWall();
  drawCabinets();

  // 6) 달빛 (강의실 창 → 바닥, 복도 창 → 바닥)
  ROOM_X.forEach(x0 => {
    sctx.save(); sctx.beginPath(); sctx.rect(x0 * T, T, 6 * T, 6 * T); sctx.clip();
    for (const wx of [x0 * T, (x0 + 5) * T]) beam(wx + 4, wx + 20, 22, 46, 130, .20);
    sctx.restore();
  });
  sctx.save(); sctx.beginPath(); sctx.rect(T, 8 * T, 30 * T, 7 * T); sctx.clip();
  beam(264, 360, 366, -44, -105, .13); beam(408, 504, 366, -44, -105, .16);
  sctx.restore();

  // 7) 조명 빛무리 + 조명/신호등 목록
  sctx.globalCompositeOperation = 'lighter';
  [[5, 11], [12, 11], [19, 11], [26, 11]].forEach(([tx, ty], i) => {
    const px = (tx + .5) * T, py = (ty + .5) * T;
    pool(px, py, 120, '255,214,150', .15);
    lights.push({ x: px, y: py, r: 170, a: .95, flick: i === 1 });
  });
  ROOM_X.forEach((x0, i) => {
    const on = !!roomAt(i + 1), cx = (x0 + 3) * T;
    if (on) pool(cx, 4 * T, 110, '205,210,255', .10);
    lights.push({ x: cx, y: 4 * T, r: on ? 140 : 110, a: on ? .85 : .55 });
    if (on) beacons.push({ x: (x0 + 2.5) * T, y: 7.5 * T, done: !!solved[roomAt(i + 1).room], room: roomAt(i + 1).room });
  });
  const stx = (screen === 0 ? 2 : 30) * T;
  for (const ty of [9.5, 13.5]) { pool(stx, ty * T, 60, '255,205,130', .12); lights.push({ x: stx, y: ty * T, r: 80, a: .6 }); }
  exitEdge = { x: screen === 0 ? W - 14 : 14, y: 11.5 * T, dir: screen === 0 ? 1 : -1 };
  sctx.globalCompositeOperation = 'source-over';

  // 8) 문제 있는 강의실에는 과 이름표
  ROOM_X.forEach((x0, i) => {
    const info = roomAt(i + 1);
    if (!info) return;
    const done = !!solved[info.room], cx = (x0 + 2) * T + T / 2, cy = 8 * T + 11;
    chip(done ? '✔ ' + info.dept : info.dept, cx, cy, done ? '#8dffbd' : '#ffa9c3', done ? '#2f8f5a' : '#ff3d6e');
  });
}

// --- 2층: 추격 전용 비상 복도 ---
function drawChaseFloor() {
  // 벽 전체를 어둡고 붉게 (강의실 문은 모두 막혀 있음)
  ROOM_X.forEach((x0, i) => {
    rect(x0 * T, T, 6 * T, 6 * T, '#120a1c');
    for (let k = 0; k < 6; k++) rect(x0 * T + k * T + 4, T + 8, 3, 6 * T - 20, 'rgba(255,255,255,.02)');
    const cx = (x0 + 3) * T;
    rect(cx - 26, 7 * T - 2, 52, 5, '#2a1024');                       // 판자로 막힌 문
    rect(cx - 30, 7 * T - 14, 60, 4, '#3b1a2b'); rect(cx - 30, 7 * T - 24, 60, 4, '#3b1a2b');
    for (let k = 0; k < 6; k++) { rect(cx - 30 + k * 11, 7 * T - 24, 1, 14, '#180912'); }
    chip('출입금지', cx, 7 * T + 8, '#ffb0b0', '#c02040');
  });
  // 복도 바닥: 붉은 비상등 얼룩
  sctx.save(); sctx.beginPath(); sctx.rect(T, 8 * T, 30 * T, 7 * T); sctx.clip();
  for (let i = 0; i < 9; i++) {
    const gx = 40 + i * 92 + hash(i, screen) * 30, gy = 8 * T + hash(i + 9, screen) * 6 * T;
    sctx.fillStyle = 'rgba(120,0,20,.20)'; sctx.beginPath(); sctx.ellipse(gx, gy, 14 + hash(i, 3) * 20, 5 + hash(i, 5) * 6, 0, 0, 7); sctx.fill();
  }
  sctx.fillStyle = 'rgba(255,255,255,.03)'; sctx.fillRect(T, 8 * T, 30 * T, 7 * T);
  sctx.restore();
  // 방향 표시: 아래층 계단 쪽으로 향하는 화살표 (비상구 유도등)
  const dirX = screen === 0 ? W - 90 : 90;
  rect(dirX - 30, 8 * T - 4, 60, 12, '#0d6b3e'); rect(dirX - 30, 8 * T - 4, 60, 1, '#5ef0a0');
  label(screen === 0 ? '비상구 →' : (screen === 1 ? '↓ 1F  비상구' : ''), dirX, 8 * T + 2, 8, '#eafff3');
  drawSouthWall();
  drawCabinets();
  sctx.globalCompositeOperation = 'lighter';
  [[5, 11], [12, 11], [19, 11], [26, 11]].forEach(([tx, ty], i) => {
    const px = (tx + .5) * T, py = (ty + .5) * T;
    pool(px, py, 115, '255,60,70', .17);
    lights.push({ x: px, y: py, r: 135, a: .55, flick: i % 2 === 1 });
  });
  const stx = (screen === 0 ? 2 : 30) * T, sty = (screen === 0 ? 9.5 : 13.5) * T;
  pool(stx, sty, 60, '255,205,130', .12); lights.push({ x: stx, y: sty, r: 80, a: .6 });
  exitEdge = { x: screen === 0 ? W - 14 : 14, y: 11.5 * T, dir: screen === 0 ? 1 : -1 };
  sctx.globalCompositeOperation = 'source-over';
}

// --- 실시간 조명 / 먼지 / 문 신호 ---
const lightSpr = document.createElement('canvas'); lightSpr.width = lightSpr.height = 256;
{
  const c = lightSpr.getContext('2d'), g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.55, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 256, 256);
}
const lm = document.createElement('canvas'); lm.width = W; lm.height = H;
const lctx = lm.getContext('2d');
const dust = Array.from({ length: 40 }, (_, i) => ({ x: hash(i, 1) * W, y: 28 + hash(i, 2) * (H - 60), s: .15 + hash(i, 3) * .3, p: hash(i, 4) * 6 }));

function drawDust(t) {
  ctx.fillStyle = 'rgba(255,238,205,.4)';
  for (const d of dust) {
    const x = (d.x + t * d.s * .01 + Math.sin(t / 1500 + d.p) * 6) % W;
    ctx.fillRect(x | 0, (d.y + Math.sin(t / 1900 + d.p * 2) * 5) | 0, 1, 1);
  }
}
function drawLightmap(t) {
  lctx.globalCompositeOperation = 'source-over';
  lctx.clearRect(0, 0, W, H);
  lctx.fillStyle = HARD ? 'rgba(2,1,9,.975)' : 'rgba(7,4,28,.62)'; lctx.fillRect(0, 0, W, H);
  lctx.globalCompositeOperation = 'destination-out';
  for (const l of HARD ? [] : lights) {                 // 하드: 복도 조명 없음, 내 주변만 밝음
    let f = 1;
    if (l.flick) { f = .9 + .1 * Math.sin(t / 61) * Math.sin(t / 173); if (Math.sin(t / 1170) > .97) f = .35; }
    lctx.globalAlpha = l.a * f;
    lctx.drawImage(lightSpr, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
  }
  if (ghost.on && !HARD) { lctx.globalAlpha = .4 * ghost.fade; lctx.drawImage(lightSpr, ghost.x - 55, ghost.y - 55, 110, 110); }
  lctx.globalAlpha = HARD ? 1 : .6;
  const lr = EXTREME ? EX.light : HARD ? 92 : 80;
  lctx.drawImage(lightSpr, p.x - lr, p.y - lr, lr * 2, lr * 2);
  lctx.globalAlpha = 1; lctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(lm, 0, 0);
}
function drawBeacons(t) {
  if (exitEdge && !HARD) {                           // 화면 끝의 이동 표시
    const a = .35 + .35 * Math.sin(t / 300), off = Math.round(Math.sin(t / 300) * 2) * exitEdge.dir;
    ctx.save(); ctx.font = `700 14px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,140,175,${a})`;
    ctx.fillText(exitEdge.dir > 0 ? '▶' : '◀', exitEdge.x + off, exitEdge.y);
    ctx.restore();
  }
  const now = performance.now();
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const b of beacons) {
    if (HARD || (lockUntil[b.room] || 0) > now) continue;   // 하드 모드·페널티 중에는 신호를 끔
    const pulse = b.done ? .5 : .6 + .4 * Math.sin(t / 380), rgb = b.done ? '90,255,170' : '255,110,150';
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 44);
    g.addColorStop(0, `rgba(${rgb},${.28 * pulse})`); g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g; ctx.fillRect(b.x - 44, b.y - 44, 88, 88);
  }
  ctx.restore();
  for (const b of beacons) {                           // 오답 페널티 카운트다운
    const left = ((lockUntil[b.room] || 0) - now) / 1000;
    if (left <= 0) continue;
    const label = `${Math.ceil(left)}초`, cx = b.x, cy = 9.6 * T;
    ctx.save(); ctx.font = `700 12px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = Math.ceil(ctx.measureText(label).width) + 14;
    ctx.fillStyle = 'rgba(30,4,12,.88)'; ctx.fillRect(Math.round(cx - w / 2), cy - 8, w, 16);
    ctx.strokeStyle = '#d0173d'; ctx.lineWidth = 1; ctx.strokeRect(Math.round(cx - w / 2) + .5, cy - 8 + .5, w - 1, 15);
    ctx.fillStyle = '#ff6b86'; ctx.fillText(label, cx, cy + 1);
    ctx.restore();
  }
}

// ===== 플레이어 =====
const HW = 6, HH = 5, SPEED = 120;                   // 충돌 상자 12x10, 속도(px/초)
const p = { x: 0, y: 0, dir: 'down', step: 0, moving: false };
const keys = { up: false, down: false, left: false, right: false };
let curTile = '';

function placeAtTile(tx, ty) {
  p.x = (tx + .5) * T; p.y = (ty + .5) * T;
  curTile = tx + ',' + ty;
}
function collides(x, y) {
  for (const [cx, cy] of [[x - HW, y - HH], [x + HW, y - HH], [x - HW, y + HH], [x + HW, y + HH]]) {
    const ch = tileAt(Math.floor(cx / T), Math.floor(cy / T));
    if (solidChar(ch)) return ch;
  }
  return null;
}

let lastBump = 0;
function bump(ch) {
  const msg = blockMessage(ch), now = performance.now();
  if (msg && now - lastBump > 1500) { lastBump = now; toast(msg); }
}

function update(dt) {
  if (quizOpen || dead || gateOpen || won || failT > 0) { p.moving = false; setPrompt(''); return; }
  if (hiding !== null) {                               // 캐비닛 안: 움직이지 못함
    p.moving = false;
    setPrompt(ghost.on && Math.hypot(ghost.x - p.x, ghost.y - p.y) < 340 ? '숨죽이는 중… 귀신이 근처에 있다   [E] 나가기' : '[E] 캐비닛에서 나가기');
    return;
  }
  setPrompt(nearCabinet() >= 0 ? '[E] 캐비닛에 숨기' : '');
  let dx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  let dy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  p.moving = !!(dx || dy);
  if (!p.moving) return;
  if (dx && dy) { dx *= .7071; dy *= .7071; }
  if (Math.abs(dx) >= Math.abs(dy)) p.dir = dx > 0 ? 'right' : 'left'; else p.dir = dy > 0 ? 'down' : 'up';
  p.step += dt * 8;

  const nx = p.x + dx * SPEED * dt;
  const hx = collides(nx, p.y);
  if (!hx) p.x = nx; else bump(hx);
  const ny = p.y + dy * SPEED * dt;
  const hy = collides(p.x, ny);
  if (!hy) p.y = ny; else bump(hy);

  checkTile();

  // 복도 끝으로 가면 옆 구역으로 이동
  if (screen === 0 && p.x >= W - 10) switchScreen(1);
  else if (screen === 1 && p.x <= 10) switchScreen(0);
}

function switchScreen(s) {
  const of = floor, os = screen;
  screen = s;
  startFloor();
  p.x = s === 1 ? 16 : W - 16;
  curTile = Math.floor(p.x / T) + ',' + Math.floor(p.y / T);
  onNodeChange(of, os, s === 1 ? 'edgeL' : 'edgeR');
  toast(`${floor}층 · ${screenDept()}`);
}

// 밟고 있는 칸이 바뀌면: 문제방 문이면 퀴즈, 계단이면 층 이동
function checkTile() {
  const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), key = tx + ',' + ty;
  if (key === curTile) return;
  curTile = key;
  const ch = tileAt(tx, ty);
  if (isDoor(ch)) {
    const info = roomAt(Number(ch));
    if (!info) return;
    if (solved[info.room]) toast(`${info.room}호 · 이미 푼 문제다 (기록된 번호 ${solved[info.room]})`);
    else if ((lockUntil[info.room] || 0) > performance.now()) toast(`틀린 지 얼마 안 됐다. ${Math.ceil((lockUntil[info.room] - performance.now()) / 1000)}초 뒤에 다시 도전할 수 있다.`);
    else openQuiz(info, tx);
  } else if (ch === 'U') changeFloor(1);
  else if (ch === 'D') changeFloor(-1);
  else if (ch === 'G') openGate(tx);
}

function changeFloor(delta) {
  const of = floor, os = screen;
  if (floor === MIN_FLOOR && delta < 0) { lobbyBack = screen; floor = 2; screen = 0; }   // 3층 아래 계단 → 2층(왼쪽 화면)
  else if (floor === 2 && delta > 0) { safe2 = false; floor = MIN_FLOOR; screen = lobbyBack; }
  else if (floor === 2 && delta < 0) { floor = 1; screen = 0; }                       // 2층 → 1층 로비
  else if (floor === 1 && delta > 0) { floor = 2; screen = 1; }                       // 로비 → 2층(오른쪽 화면)
  else floor += delta;
  startFloor();
  const ax = screen === 0 ? 3 : 28;
  if (floor === 1) placeAtTile(3, 10);
  else if (floor === 2) placeAtTile(screen === 0 ? 3 : 28, screen === 0 ? 9 : 13);
  else if (delta > 0) placeAtTile(ax, 13); else placeAtTile(ax, 9);   // 올라오면 아래계단 옆, 내려오면 위계단 옆
  onNodeChange(of, os, delta > 0 ? 'stairD' : 'stairU');
  if (floor === 2 && delta > 0) {                       // 로비에서 올라올 때는 귀신 없음: 귀신을 위층으로 치워 둠
    safe2 = true;
    Object.assign(ghost, { on: false, f: 4, s: lobbyBack, arrive: 0, hop: 14, cool: 25, state: 'wander' });
    toast('2층 · 귀신의 기척이 없다… 서둘러 위층으로 올라가자.');
  } else if (floor === 2) { safe2 = false; ambush(); }
  else toast(floor === 1 ? '1층 로비 · 정문에 모든 정답 번호의 합을 입력하자.' : `${floor}층 · ${screenDept()}`);
}

function drawPlayer() {
  const x = Math.round(p.x), fy = Math.round(p.y) + HH;
  const w = p.moving ? Math.floor(p.step) % 2 : 0;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(x - 7, fy - 1, 14, 3);
  ctx.fillStyle = '#2b2a55';                                      // 다리
  ctx.fillRect(x - 5, fy - 5, 4, 5 - w); ctx.fillRect(x + 1, fy - 5, 4, 4 + w);
  ctx.fillStyle = '#e2557f'; ctx.fillRect(x - 6, fy - 13, 12, 9); // 몸
  ctx.fillStyle = '#c1416a'; ctx.fillRect(x - 6, fy - 6, 12, 2);
  ctx.fillStyle = '#f2c9a0'; ctx.fillRect(x - 5, fy - 22, 10, 9); // 머리
  ctx.fillStyle = '#2a1f3a';                                      // 머리카락
  if (p.dir === 'up') ctx.fillRect(x - 5, fy - 23, 10, 10);
  else { ctx.fillRect(x - 5, fy - 23, 10, 4); if (p.dir === 'left') ctx.fillRect(x + 2, fy - 20, 3, 4); if (p.dir === 'right') ctx.fillRect(x - 5, fy - 20, 3, 4); }
  ctx.fillStyle = '#1a1030';                                      // 눈
  if (p.dir === 'down') { ctx.fillRect(x - 3, fy - 18, 2, 2); ctx.fillRect(x + 1, fy - 18, 2, 2); }
  else if (p.dir === 'left') ctx.fillRect(x - 4, fy - 18, 2, 2);
  else if (p.dir === 'right') ctx.fillRect(x + 2, fy - 18, 2, 2);
}

function render(t) {
  ctx.save();
  if (dead && deadT < .6) ctx.translate((Math.random() - .5) * 6, (Math.random() - .5) * 6);
  else if (ghost.spot > 0) ctx.translate((Math.random() - .5) * 5, (Math.random() - .5) * 5);
  ctx.drawImage(stat, 0, 0);
  if (hiding === null) drawPlayer();
  drawDust(t);
  if (HARD) { drawGhost(t); drawLightmap(t); drawGhostEyes(t); }   // 하드: 어둠 속에서는 귀신도 불빛이 닿아야 보임
  else { drawLightmap(t); drawGhost(t); }
  drawHidden(t);
  drawBeacons(t);
  ctx.drawImage(vig, 0, 0);
  drawDanger(t);
  if (ghost.spot > 0 && !dead) { ctx.fillStyle = `rgba(255,40,70,${ghost.spot * .5})`; ctx.fillRect(0, 0, W, H); }
  drawJumpScare(t);
  if (failT > 0) drawFail(t);
  if (won) drawWin();
  ctx.restore();
}

// ===== 알림 / 수첩(HUD) =====
const toastEl = $('toast'); let toastTimer;
function toast(text) {
  toastEl.textContent = text; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1900);
}
function updateHud() {
  $('floor').textContent = `${floor}층 · ${screenDept()}`;
  $('count').textContent = `${Object.keys(solved).filter(k => VALID_ROOMS.has(Number(k))).length}/${TOTAL_ROOMS}`;
  const ul = $('notelist'); ul.innerHTML = '';
  for (let f = MAX_FLOOR; f >= MIN_FLOOR; f--) {          // 8층부터 3층까지 한 번에
    const li = document.createElement('li');
    if (f === floor) li.className = 'here';
    const fl = document.createElement('span'); fl.className = 'fl'; fl.textContent = `${f}층`;
    li.append(fl);
    for (const r of FLOORS[f] || []) {
      const d = document.createElement('span'); d.className = 'd';
      d.textContent = solved[r.room] ? `${r.dept} ✔ ${solved[r.room]}` : `${r.dept} ?`;
      if (solved[r.room]) d.classList.add('done');
      li.append(d);
    }
    ul.append(li);
  }
}
const noteEl = $('note'), noteBtn = $('notehint');
function toggleNote(force) {
  const open = force === undefined ? noteEl.hidden : force;
  noteEl.hidden = !open;
  noteBtn.setAttribute('aria-expanded', String(open));
}
noteBtn.addEventListener('click', () => { toggleNote(); noteBtn.blur(); });

// ===== 퀴즈 =====
const quizEl = $('quiz'), qfeed = $('qfeed'), qchoices = $('qchoices');
let quizOpen = false, quizInfo = null, quizDoorTx = 0, quizLock = false;

let quizTimer = 0;
function openQuiz(info, doorTx) {
  quizOpen = true; quizInfo = info; quizDoorTx = doorTx; quizLock = false;
  Object.keys(keys).forEach(k => keys[k] = false);
  $('qroom').textContent = `${info.room}호 · ${info.dept}`;
  $('qtext').textContent = info.q;
  qfeed.textContent = ''; qfeed.className = '';
  qchoices.innerHTML = '';
  info.choices.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    const no = document.createElement('span'); no.className = 'no'; no.textContent = i + 1;
    const tx = document.createElement('span'); tx.textContent = c;
    b.append(no, tx);
    b.addEventListener('click', () => answer(i + 1));
    qchoices.append(b);
  });
  quizEl.hidden = false;
  clearInterval(quizTimer);
  if (EXTREME) {                                        // 제한 시간 안에 못 풀면 자동 오답
    let left = EX.quizSec; qfeed.className = 'bad'; qfeed.textContent = `남은 시간 ${left}초`;
    quizTimer = setInterval(() => {
      if (quizLock) return;
      left--; qfeed.textContent = `남은 시간 ${Math.max(0, left)}초`;
      if (left <= 0) { clearInterval(quizTimer); answer(0); }
    }, 1000);
  }
}

const PENALTY_SEC = EXTREME ? EX.penalty : 10;                                // 오답 페널티(초)
const lockUntil = {};                                  // 방 번호 → 다시 도전할 수 있는 시각

function answer(n) {
  if (!quizOpen || quizLock || n > quizInfo.choices.length) return;
  clearInterval(quizTimer);
  const btn = qchoices.children[n - 1];
  if (n === quizInfo.answer) {
    quizLock = true;
    solved[quizInfo.room] = n; saveProgress();
    btn.classList.add('ok');
    qfeed.className = 'ok'; qfeed.textContent = `정답! 수첩에 번호 ${n}을(를) 기록했다.`;
    buildStatic(); updateHud();
    setTimeout(closeQuiz, 1100);
  } else {
    quizLock = true;
    lockUntil[quizInfo.room] = performance.now() + (PENALTY_SEC + 1.2) * 1000;   // 창이 닫히는 시간을 더해 정확히 10초
    if (btn) btn.classList.add('bad');
    qfeed.className = 'bad'; qfeed.textContent = n ? `틀렸다! ${PENALTY_SEC}초 뒤에 다시 도전할 수 있다.` : `시간 초과! ${PENALTY_SEC}초 뒤에 다시 도전할 수 있다.`;
    setTimeout(() => { closeQuiz(); summonGhost(); }, 1200);
  }
}
// 오답 패널티: 틀린 소리를 듣고 귀신이 이 복도로 찾아온다
function summonGhost() {
  const g = ghost;
  if (dead || floor < MIN_FLOOR) return;
  if (g.on && g.f === floor && g.s === screen) { g.state = 'chase'; g.lostT = 0; g.lastSeen = { x: p.x, y: p.y }; g.freeze = 0; }
  else Object.assign(g, { on: false, f: floor, s: screen, arrive: EXTREME ? 1 : 3.2, entry: screen === 0 ? 'edgeR' : 'edgeL', hop: 30 });
  toast('오답 소리가 복도에 울렸다… 무언가가 다가온다!');
}

function closeQuiz() {
  if (!quizOpen) return;
  clearInterval(quizTimer); quizOpen = false; quizEl.hidden = true;
  if (document.activeElement) document.activeElement.blur();
  placeAtTile(quizDoorTx, 8);                         // 문 앞 복도로 내보내기
  if (!EXTREME) ghost.freeze = Math.max(ghost.freeze, 1.3);         // 문제를 푼 직후 잠깐은 귀신이 멈춰 있음
}

// ===== 귀신 & 숨기 =====
// 귀신은 12개 구역(6개 층 x 왼쪽/오른쪽)을 혼자 돌아다녀요.
//  - 다른 구역에 있을 때는 몇 초마다 옆 구역으로 옮겨 다니고(플레이어 쪽으로 다가오는 경향),
//  - 플레이어와 같은 구역에 오면 화면에 나타나서 복도를 배회해요.
//  - 눈에 띄면 쫓아오고, 잡히면 게임 오버. 캐비닛(E)에 숨으면 못 잡아요.
//  - 숨은 걸 놓친 귀신은 캐비닛 앞을 살피다가 결국 다른 구역으로 떠나요.
//  - 문제를 푸는 동안(퀴즈 창)에는 귀신도 완전히 멈춰요.
const rnd = (a, b) => a + Math.random() * (b - a);
const NODE_DIST = (f1, s1, f2, s2) => Math.abs(f1 - f2) + (s1 !== s2 ? 1 : 0);
const G_WANDER = 50, G_CHASE = 98, G_SIGHT = 320, G_CATCH = 13;
const gWander = () => EXTREME ? EX.wander : (floor === 2 ? 66 : G_WANDER), gChase = () => EXTREME ? EX.chase : (floor === 2 ? 110 : G_CHASE), gSight = () => EXTREME ? EX.sight : (floor === 2 ? 520 : G_SIGHT);
// 2층 진입: 잠시 뒤 계단 쪽(플레이어 뒤)에서 귀신이 나타나 끝까지 쫓아옴
function ambush() {
  Object.assign(ghost, { on: false, f: 2, s: screen, arrive: EXTREME ? 1 : 2.6, entry: screen === 0 ? 'stairU' : 'edgeL', hop: 99, cool: 0, state: 'wander' });
  toast('2층 · 뒤에서 무언가가 쫓아온다! 반대편 계단까지 달려!');
}

const ghost = {
  f: LOW + 1, s: 1, on: false, x: 0, y: 0, state: 'wander',
  hop: 28, cool: 20, arrive: 0, entry: 'edgeL', fade: 1, bob: 0, freeze: 0, warned: 0,
  path: [], pathT: 0, stay: 0, wt: null, wtT: 0, spot: 0, _prev: null,
  lastSeen: null, lostT: 0, tgt: null, searchT: 0, searchMax: 0, searchArrived: false, exit: null
};
if (EXTREME) Object.assign(ghost, { hop: 3, cool: 0 });
let hiding = null, dead = false, deadT = 0, overShown = false;

const cabX = i => (CAB_TILES[i] + .5) * T;
function nearCabinet() {
  if (floor === 1 || p.y < 11.6 * T) return -1;
  for (let i = 0; i < CAB_TILES.length; i++) if (Math.abs(p.x - cabX(i)) < 30) return i;
  return -1;
}
let hideT = 0;
function toggleHide() {
  if (quizOpen || dead) return;
  if (hiding !== null) { hiding = null; p.y = 12.5 * T; return; }
  const i = nearCabinet();
  if (i < 0) return;
  hideT = 0; hiding = i; p.x = cabX(i); p.y = 13.6 * T; p.moving = false;
  Object.keys(keys).forEach(k => keys[k] = false);
}

// --- 길찾기 / 시야 ---
const gTile = () => [Math.floor(ghost.x / T), Math.floor(ghost.y / T)];
function walkableG(tx, ty, tgt) {
  const ch = tileAt(tx, ty);
  if (ch === 'U' || ch === 'D') return !!tgt && tgt[0] === tx && tgt[1] === ty;   // 계단은 목적지일 때만
  return !solidChar(ch);
}
function bfsPath(sx, sy, gx, gy) {
  if (sx === gx && sy === gy) return [];
  const tgt = [gx, gy], start = sy * COLS + sx, prev = new Map([[start, -1]]), q = [[sx, sy]];
  for (let h = 0; h < q.length; h++) {
    const [cx, cy] = q[h];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = ny * COLS + nx;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || prev.has(k) || !walkableG(nx, ny, tgt)) continue;
      prev.set(k, cy * COLS + cx);
      if (nx === gx && ny === gy) {
        const path = [];
        for (let c = k; c !== start; c = prev.get(c)) path.push({ x: ((c % COLS) + .5) * T, y: (Math.floor(c / COLS) + .5) * T });
        return path.reverse();
      }
      q.push([nx, ny]);
    }
  }
  return null;
}
function los(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
  for (let i = 1; i < n; i++) {
    const t = i / n, ch = tileAt(Math.floor((x0 + (x1 - x0) * t) / T), Math.floor((y0 + (y1 - y0) * t) / T));
    if (ch !== 'U' && ch !== 'D' && solidChar(ch)) return false;
  }
  return true;
}
function gMove(tx, ty, sp, dt) {
  const dx = tx - ghost.x, dy = ty - ghost.y, d = Math.hypot(dx, dy);
  if (d < 1.5) return true;
  const st = Math.min(d, sp * dt);
  ghost.x += dx / d * st; ghost.y += dy / d * st;
  return st >= d;
}
function gGoto(tx, ty, sp, dt) {           // 직선이 뚫려 있으면 곧장, 막혀 있으면 길을 찾아서
  const g = ghost;
  if (los(g.x, g.y, tx, ty)) { g.path = []; return gMove(tx, ty, sp, dt); }
  g.pathT -= dt;
  if (g.pathT <= 0 || !g.path.length) {
    const [sx, sy] = gTile();
    g.path = bfsPath(sx, sy, Math.floor(tx / T), Math.floor(ty / T)) || [];
    g.pathT = .35;
  }
  while (g.path.length && Math.hypot(g.path[0].x - g.x, g.path[0].y - g.y) < 3) g.path.shift();
  if (g.path.length) gMove(g.path[0].x, g.path[0].y, sp, dt);
  return false;
}

// --- 등장 / 퇴장 ---
function entryPoint(entry) {
  const sx = (screen === 0 ? 3.6 : 28.4) * T, y = rnd(9.5, 13.5) * T;
  if (entry === 'edgeL') return { x: 44, y };
  if (entry === 'edgeR') return { x: W - 44, y };
  return { x: sx, y: (entry === 'stairD' ? 13.5 : 9.5) * T };
}
function ghostSpawn(entry, far) {
  const g = ghost;
  Object.assign(g, { f: floor, s: screen, on: true, state: 'wander', fade: 0, path: [], lostT: 0, exit: null, wt: null, stay: rnd(14, 22), freeze: 0, arrive: 0 });
  if (far) {                                            // 플레이어가 귀신이 있는 구역으로 들어온 경우: 먼 곳에서
    let best = { x: 20 * T, y: 11.5 * T }, bd = -1;
    for (let k = 0; k < 14; k++) {
      const x = rnd(3, 28) * T, y = rnd(9, 12.9) * T, d = Math.hypot(x - p.x, y - p.y);
      if (d > bd) { bd = d; best = { x, y }; }
    }
    g.x = best.x; g.y = best.y; g.fade = .4;
  } else { const e = entryPoint(entry); g.x = e.x; g.y = e.y; }
}
function exitPoints() {
  const list = [{ x: screen === 0 ? W - 10 : 10, y: 11.5 * T, via: 'edge' }];
  const sx = (screen === 0 ? 2 : 30) * T;
  if (floor < MAX_FLOOR) list.push({ x: sx, y: 9.5 * T, via: 'up' });
  if (floor > MIN_FLOOR) list.push({ x: sx, y: 13.5 * T, via: 'down' });
  if (floor === 2) return list.slice(0, 1);
  return list;
}
function startLeave() {
  if (EXTREME && ghost.on) { ghost.state = 'wander'; ghost.wt = null; ghost.stay = rnd(8, 12); return; }   // 익스트림: 절대 떠나지 않음
  if (floor === 2 && ghost.on) { ghost.state = 'wander'; ghost.wt = null; ghost.stay = rnd(10, 16); return; }   // 2층에서는 떠나지 않고 계속 순찰
  const list = exitPoints();
  ghost.state = 'leave'; ghost.exit = list[Math.floor(Math.random() * list.length)]; ghost.path = [];
}
function ghostExit(via) {                               // 화면 밖으로 나가서 옆 구역으로
  const g = ghost;
  g.on = false; g.state = 'wander'; g.exit = null;
  if (via === 'edge') g.s = 1 - g.s; else if (via === 'up') g.f++; else g.f--;
  g.hop = rnd(8, 12); g.cool = rnd(18, 26);
  if (EXTREME) { g.hop = rnd(EX.hopMin, EX.hopMax); g.cool = 0; }
  if (g.f === 2) { g.hop = rnd(3, 5); g.cool = 0; }     // cool: 한동안은 플레이어를 찾아오지 않음
}
function ghostHop() {                                   // 화면 밖에서 옆 구역으로 한 칸 이동
  const g = ghost, opts = [{ f: g.f, s: 1 - g.s, via: 'edge' }];
  if (g.f < MAX_FLOOR) opts.push({ f: g.f + 1, s: g.s, via: 'up' });
  if (g.f > LOW && !(g.f === MIN_FLOOR && safe2)) opts.push({ f: g.f - 1, s: g.s, via: 'down' });
  let pick = opts[Math.floor(Math.random() * opts.length)];
  if (g.cool <= 0 && Math.random() < (EXTREME ? 1 : .68)) {
    const cur = NODE_DIST(g.f, g.s, floor, screen), better = opts.filter(o => NODE_DIST(o.f, o.s, floor, screen) < cur);
    if (better.length) pick = better[Math.floor(Math.random() * better.length)];
  }
  g.f = pick.f; g.s = pick.s; g.hop = EXTREME ? rnd(EX.hopMin, EX.hopMax) : rnd(6, 10);
  if (g.f === floor && g.s === screen) {
    ghostSpawn(pick.via === 'edge' ? (g.s === 0 ? 'edgeR' : 'edgeL') : pick.via === 'up' ? 'stairD' : 'stairU', false);
    if (g.warned <= 0) { toast('……복도 어딘가에서 소리가 난다.'); g.warned = 8; }
  }
}
function onNodeChange(of, os, entry) {                  // 플레이어가 다른 구역으로 넘어갔을 때
  const g = ghost;
  if (floor < LOW) { g.on = false; g.arrive = 0; g.f = of; g.s = os; g.hop = rnd(8, 12); g.state = 'wander'; return; }   // 1층 로비에는 귀신이 없음
  if (g.on) {
    g.on = false;
    if (g.state === 'chase' && hiding === null) { g.f = floor; g.s = screen; g.arrive = EXTREME ? EX.follow : 2.2; g.entry = entry; }   // 쫓아옴
    else { g.f = of; g.s = os; g.hop = rnd(5, 9); g.state = 'wander'; }
  } else if (g.arrive > 0) { g.f = floor; g.s = screen; g.arrive = EXTREME ? EX.follow : 2.2; g.entry = entry; }
  else if (g.f === floor && g.s === screen) ghostSpawn(entry, true);
}

function pickWanderTarget() {
  if (floor !== 2 && Math.random() < .3) {              // 가끔 강의실 안으로
    const x0 = ROOM_X[Math.floor(Math.random() * 4)], tx = x0 + 1 + Math.floor(Math.random() * 4), ty = 2 + Math.floor(Math.random() * 5);
    if (!solidChar(tileAt(tx, ty))) return { x: (tx + .5) * T, y: (ty + .5) * T };
  }
  return { x: rnd(3, 28) * T, y: rnd(9, 12.9) * T };
}
function caught() { if (dead) return; deaths++; if (MAX_LIVES) { lives = Math.max(0, lives - 1); saveLives(); renderLives(true); if (lives <= 0) wipeSave(); } savePlay(); dead = true; deadT = 0; overShown = false; Object.keys(keys).forEach(k => keys[k] = false); }

function ghostTick(dt) {
  if (quizOpen || gateOpen || won) return;              // 문제를 풀거나 정문을 만지는 동안 정지
  const g = ghost;
  if (failT > 0) { failT -= dt; if (failT <= 0) caught(); return; }
  if (dead) { deadT += dt; if (deadT > .9 && !overShown) showOver(); return; }
  if (floor < LOW) return;                              // 로비에서는 귀신이 움직이지 않음
  g.bob += dt;
  if (EXTREME && hiding !== null) { hideT += dt; if (hideT > EX.hideSec) { hiding = null; toast('캐비닛 문이 벌컥 열렸다!'); caught(); return; } }
  if (g.spot > 0) g.spot -= dt;
  if (g.on && g.state === 'chase' && g._prev !== 'chase') g.spot = .45;   // 들키는 순간 화면이 흔들림
  g._prev = g.on ? g.state : null;
  if (g.warned > 0) g.warned -= dt;
  if (g.cool > 0) g.cool -= dt;

  if (!g.on) {
    if (g.arrive > 0) {
      g.arrive -= dt;
      if (g.arrive <= 0) { ghostSpawn(g.entry, false); g.state = 'chase'; g.fade = .5; g.lastSeen = { x: p.x, y: p.y }; }
    } else { g.hop -= dt; if (g.hop <= 0) ghostHop(); }
    return;
  }
  if (g.freeze > 0) { g.freeze -= dt; return; }
  if (g.fade < 1) g.fade = Math.min(1, g.fade + dt * 1.2);
  const lethal = g.fade >= 1, dP = Math.hypot(p.x - g.x, p.y - g.y);
  const sees = lethal && hiding === null && dP < gSight() && los(g.x, g.y, p.x, p.y);
  if (lethal && hiding === null && dP < (EXTREME ? EX.catchR : G_CATCH)) { caught(); return; }

  if (g.state === 'wander') {
    if (sees) { g.state = 'chase'; g.lostT = 0; g.lastSeen = { x: p.x, y: p.y }; return; }
    if (!g.wt) { g.wt = pickWanderTarget(); g.wtT = 8; }
    const arrived = gGoto(g.wt.x, g.wt.y, gWander(), dt);
    g.wtT -= dt;
    if (arrived || g.wtT <= 0) g.wt = null;
    g.stay -= dt;
    if (g.stay <= 0) startLeave();
  } else if (g.state === 'chase') {
    if (hiding !== null) {                              // 눈앞에서 숨었다 → 캐비닛 앞을 살핀다
      g.state = 'search'; g.tgt = { x: cabX(hiding), y: 12.3 * T }; g.searchT = rnd(4, 6); g.searchMax = 12; g.searchArrived = false; g.path = [];
      return;
    }
    if (sees) { g.lastSeen = { x: p.x, y: p.y }; g.lostT = 0; } else g.lostT += dt;
    gGoto(g.lastSeen.x, g.lastSeen.y, gChase(), dt);
    if (g.lostT > 3.5) { g.state = 'search'; g.tgt = g.lastSeen; g.searchT = 3; g.searchMax = 8; g.searchArrived = false; g.path = []; }
  } else if (g.state === 'search') {
    if (sees) { g.state = 'chase'; g.lostT = 0; g.lastSeen = { x: p.x, y: p.y }; return; }
    const arrived = gGoto(g.tgt.x, g.tgt.y, gWander() + 20, dt);
    if (arrived || Math.hypot(g.x - g.tgt.x, g.y - g.tgt.y) < 12) g.searchArrived = true;
    g.searchMax -= dt;
    if (g.searchArrived) g.searchT -= dt;
    if (g.searchT <= 0 || g.searchMax <= 0) startLeave();
  } else if (g.state === 'leave') {
    const done = gGoto(g.exit.x, g.exit.y, gWander() + 25, dt);
    if (done || Math.hypot(g.x - g.exit.x, g.y - g.exit.y) < 12) { ghostExit(g.exit.via); return; }
    if (sees && dP < 130) { g.state = 'chase'; g.lostT = 0; g.lastSeen = { x: p.x, y: p.y }; }
  }
}

// --- 1층 정문 (번호 입력 → 탈출 / 실패) ---
const gateEl = $('gate'), gdisp = $('gdisp'), gpad = $('gpad'), gsolved = $('gsolved'), winEl = $('win');
let gateCode = '';
[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '확인'].forEach(k => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = k;
  b.addEventListener('click', () => gateInput(String(k)));
  gpad.appendChild(b);
});
function gateShow() { gdisp.textContent = gateCode.padEnd(3, '_').split('').join(' '); }
function openGate(tx) {
  if (gateOpen || won || failT > 0) return;
  gateOpen = true; gateTx = tx; gateCode = ''; gateShow();
  Object.keys(keys).forEach(k => keys[k] = false);
  gsolved.textContent = `푼 문제 ${Object.keys(solved).length} / ${TOTAL_ROOMS}`;
  gateEl.hidden = false; setPrompt('');
}
function closeGate() { gateOpen = false; gateEl.hidden = true; placeAtTile(gateTx, 9); }
function gateInput(k) {
  if (k === '⌫') gateCode = gateCode.slice(0, -1);
  else if (k === '확인') { if (gateCode) gateSubmit(); return; }
  else if (/^\d$/.test(k) && gateCode.length < 3) gateCode += k;
  gateShow();
}
function gateSubmit() {
  if (Number(gateCode) === CODE) win();
  else {                                               // 틀린 번호 → 실패 연출
    gateOpen = false; gateEl.hidden = true; failT = 1.3; hiding = null;
    toast('삑— 잘못된 번호다… 등 뒤로 차가운 숨결이 느껴진다.');
  }
}
function gateKey(e) {
  if (e.key === 'Escape') closeGate();
  else if (e.key === 'Enter') { if (gateCode) gateSubmit(); }
  else if (e.key === 'Backspace') gateInput('⌫');
  else if (/^\d$/.test(e.key)) gateInput(e.key);
  else return;
  e.preventDefault();
}
function win() {
  gateOpen = false; gateEl.hidden = true; won = true; winT = 0; savePlay();
  const m = Math.floor(playSec / 60), sec = Math.floor(playSec % 60);
  $('wtime').textContent = `${m}분 ${String(sec).padStart(2, '0')}초`;
  $('wdeaths').textContent = `${deaths}번`;
  $('wmode').textContent = EXTREME ? 'EXTREME' : HARD ? 'HARD' : 'EASY';
}
function drawWin() {
  const a = Math.min(1, winT / 2.2);
  const g = ctx.createRadialGradient(384, 170, 10, 384, 170, 120 + a * 520);
  g.addColorStop(0, `rgba(255,255,240,${a})`); g.addColorStop(1, `rgba(255,240,200,${a * .85})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function drawFail(t) {
  const a = Math.min(1, (1.3 - failT) / 1.3);
  ctx.fillStyle = `rgba(120,0,20,${a * .35 * (.6 + .4 * Math.sin(t / 60))})`; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgba(0,0,0,${a * .5})`; ctx.fillRect(0, 0, W, H);
}

// --- 게임 오버 ---
const overEl = $('over'), retryBtn = $('retry');
const livesEl = $('lives');
function renderLives(hit) {
  if (!MAX_LIVES) return;
  livesEl.hidden = false; document.getElementById('stage').classList.add('has-lives');
  livesEl.innerHTML = '';
  for (let i = 0; i < MAX_LIVES; i++) { const h = document.createElement('i'); h.textContent = '♥'; if (i >= lives) h.className = 'lost'; livesEl.append(h); }
  if (hit) { livesEl.classList.remove('hit'); void livesEl.offsetWidth; livesEl.classList.add('hit'); }
}
renderLives(false);
function wipeSave() {                                    // 목숨을 모두 잃으면 기록 삭제
  try { [SAVE_KEY, TIME_KEY, DEATH_KEY, LIVES_KEY].forEach(k => localStorage.removeItem(k)); } catch (e) {}
}
function showOver() {
  overShown = true; overEl.hidden = false;
  if (MAX_LIVES && lives <= 0) { $('overt').textContent = '목숨을 모두 잃었다…'; overEl.querySelector('p').textContent = '모든 기록이 사라집니다. 시작 화면으로 돌아가요.'; retryBtn.textContent = '시작 화면으로 (Enter)'; }
  retryBtn.focus();
}
function retry() {
  if (MAX_LIVES && lives <= 0) { location.href = 'index.html'; return; }
  overEl.hidden = true; dead = false; overShown = false; hiding = null;
  failT = 0;
  if (floor === 1) placeAtTile(3, 10); else placeAtTile(screen === 0 ? 4 : 27, 11);
  let best = [MIN_FLOOR, 1], bd = -1;                   // 귀신은 가장 먼 구역으로 보냄
  for (let f = LOW; f <= MAX_FLOOR; f++) for (let s = 0; s < 2; s++) {
    const d = NODE_DIST(f, s, Math.max(floor, LOW), screen);
    if (d > bd) { bd = d; best = [f, s]; }
  }
  Object.assign(ghost, { f: best[0], s: best[1], on: false, arrive: 0, hop: 14, cool: 22, state: 'wander', freeze: 0 });
  toast('숨을 고르고 다시 일어났다…');
  if (floor === 2 && !safe2) ambush();
}
retryBtn.addEventListener('click', () => { retry(); retryBtn.blur(); });

// --- 화면 표시 ---
const promptEl = $('prompt'); let lastPrompt = '';
function setPrompt(text) {
  if (text === lastPrompt) return;
  lastPrompt = text; promptEl.textContent = text; promptEl.hidden = !text;
}
const redVig = document.createElement('canvas'); redVig.width = W; redVig.height = H;
{
  const v = redVig.getContext('2d'), g = v.createRadialGradient(W / 2, H / 2, H * .3, W / 2, H / 2, W * .62);
  g.addColorStop(0, 'rgba(160,0,30,0)'); g.addColorStop(1, 'rgba(190,10,40,.85)');
  v.fillStyle = g; v.fillRect(0, 0, W, H);
}
function dangerLevel() {
  if (dead) return 0;
  const g = ghost;
  if (g.on) {
    const d = Math.hypot(g.x - p.x, g.y - p.y), near = Math.max(0, (320 - d) / 320);
    return Math.min(1, (g.state === 'chase' ? .5 : .16) + near * .45);
  }
  if (g.arrive > 0) return .3;
  return NODE_DIST(g.f, g.s, floor, screen) === 1 ? .14 : 0;
}
function drawDanger(t) {
  if (dead) {
    const a = Math.max(0, .55 - deadT * .6);
    if (a > 0) { ctx.fillStyle = `rgba(200,0,30,${a})`; ctx.fillRect(0, 0, W, H); }
    return;
  }
  const lv = dangerLevel();
  if (lv <= 0) return;
  ctx.globalAlpha = lv * (.55 + .45 * Math.sin(t / (ghost.on && ghost.state === 'chase' ? 110 : 420)));
  ctx.drawImage(redVig, 0, 0);
  ctx.globalAlpha = 1;
}
function drawHidden(t) {
  if (hiding === null) return;
  const x = cabX(hiding);
  if (Math.sin(t / 1100) > -.92) { ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(x - 5, 13 * T + 4, 3, 2); ctx.fillRect(x + 2, 13 * T + 4, 3, 2); }
  ctx.fillStyle = 'rgba(255,90,140,.28)'; ctx.fillRect(x - 10, 13 * T, 20, 14);
}
// 귀신 스프라이트: 머리카락이 얼굴을 덮은 처녀귀신. 쫓아올 때는 머리카락 사이로 얼굴이 드러난다.
// (ox, oy) = 발끝 기준점, 머리는 위쪽(-y)으로 약 46px.
function ghostSprite(ox, oy, bob, chase, mouth) {
  const baseA = ctx.globalAlpha;
  const R = (x, y, w, h, c, a) => { ctx.globalAlpha = baseA * (a === undefined ? 1 : a); ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, w, h); };
  const line = (x0, y0, x1, y1, w, c) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) R(Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n), w, w, c);
  };
  const sw1 = Math.round(Math.sin(bob * 2.4) * 1.5), sw2 = Math.sin(bob * 3.3 + 1.7);
  const hx = 2 + Math.round(Math.sin(bob * 1.1)) + (chase && Math.floor(bob * 13) % 2 ? 1 : 0);   // 고개가 기울어져 있고, 쫓을 땐 부들부들 떨림

  // 치마(수의): 위는 하얗고 아래로 갈수록 때가 타고 흐려짐
  for (let y = -27; y <= -3; y++) {
    const k = (y + 27) / 24, half = Math.round(5 + k * 6), cx = Math.round(sw1 * k * .8);
    R(cx - half, y, half * 2, 1, k < .45 ? '#d6d0dc' : k < .8 ? '#b8b1c4' : '#8f889f', 1 - k * .25);
    R(cx - half, y, 1, 1, '#5d5670'); R(cx + half - 1, y, 1, 1, '#5d5670');
    if (y % 2) { R(cx + Math.round(-5 * (.4 + k)), y, 1, 1, '#6e6683', .6); R(cx + Math.round(4 * (.4 + k)), y, 1, 1, '#6e6683', .6); }
  }
  for (let i = 0; i < 11; i++) {                                                  // 너덜너덜한 밑단
    const len = 3 + Math.floor(hash(i, 7) * 5) + Math.round(Math.sin(bob * 3 + i) * 1.6);
    for (let j = 0; j < len; j++) R(-11 + i * 2 + Math.round(sw1 * .8), -3 + j, 2, 1, j > 2 ? '#7d768e' : '#948da3', 1 - j / (len + 1));
  }
  R(-3, -20, 2, 6, '#5b0d16'); R(4, -14, 1, 8, '#6a1019'); R(-7, -9, 3, 2, '#4a0a12'); R(1, -22, 3, 2, '#4a0a12');   // 핏자국

  // 팔: 늘어진 긴 팔. 쫓을 때는 앞으로 뻗음
  for (const d of [-1, 1]) {
    const hxp = d * (chase ? 12 : 9 + Math.round(sw2 * d)), hyp = chase ? -19 + Math.round(sw2 * 2) : -6 + Math.round(sw2 * 1.5 * d);
    line(d * 5, -26, d * 8, -16 + (chase ? -3 : 0), 2, '#c9c2cf');
    line(d * 8, -16 + (chase ? -3 : 0), hxp, hyp, 2, '#bdb5c5');
    for (const f of [-2, 0, 2]) line(hxp + f * .5, hyp + 1, hxp + f, hyp + 6 + (f === 0 ? 2 : 0), 1, '#a89fb2');     // 손가락
    R(hxp - 2, hyp + 8, 1, 1, '#2a1622'); R(hxp, hyp + 9, 1, 1, '#2a1622'); R(hxp + 2, hyp + 8, 1, 1, '#2a1622');     // 손톱
  }

  // 목 · 얼굴
  line(0, -27, hx, -31, 3, '#bdb6c3');
  for (let y = -45; y <= -29; y++) {
    const t = (y + 37) / 8, hw = Math.round(6.5 * Math.sqrt(Math.max(0, 1 - t * t)));
    if (hw > 0) { R(hx - hw, y, hw * 2, 1, '#e0dae4'); R(hx + hw - 2, y, 2, 1, '#b9b2c2'); }
  }
  if (chase) {
    R(hx - 5, -40, 4, 6, '#06020a'); R(hx + 1, -40, 4, 6, '#06020a');                                       // 텅 빈 눈구멍
    const glow = Math.floor(bob * 9) % 2 ? '#ff2a48' : '#c4142c';
    R(hx - 4, -38, 2, 2, glow); R(hx + 2, -38, 2, 2, glow); R(hx - 4, -38, 1, 1, '#ffd0d8'); R(hx + 2, -38, 1, 1, '#ffd0d8');
    for (const e of [-4, 2]) {                                                                              // 피눈물
      const len = 6 + Math.round((Math.sin(bob * 4 + e) + 1) * 3);
      R(hx + e, -34, 2, len, '#7a0c1c'); R(hx + e, -34 + len, 1, 2, '#a01226');
    }
    R(hx, -34, 1, 2, '#a59cae'); R(hx - 5, -36, 1, 3, '#7b5a80'); R(hx + 4, -35, 1, 3, '#7b5a80');
    R(hx - 4, -31, 9, mouth, '#05020a');                                                                   // 찢어진 입
    for (let k = 0; k < 9; k += 2) R(hx - 4 + k, -31, 1, 2, '#f1eef3');
    for (let k = 1; k < 9; k += 2) R(hx - 4 + k, -31 + mouth - 2, 1, 2, '#d8d3dc');
  } else {
    R(hx - 3, -38, 2, 4, '#f6f1f8'); R(hx - 3, -37, 1, 2, '#e0142f');                                       // 머리카락 틈으로 보이는 눈 하나
  }

  // 머리카락
  for (let y = -47; y <= -41; y++) { const w = y < -45 ? 6 : y < -43 ? 8 : 9; R(hx - w, y, w * 2, 1, '#0a0610'); }
  for (let i = 0; i < 18; i++) {
    const x0 = hx - 9 + i, len = 18 + Math.floor(hash(i, 3) * 15);
    const top = chase ? (i >= 3 && i <= 14 ? -28 : -44) : -44;
    for (let y = top; y < -44 + len; y++) {
      if (!chase && i >= 8 && i <= 9 && y >= -39 && y <= -33) continue;                                    // 눈 틈
      const off = Math.round(Math.sin(bob * 2.6 + i * .7) * 1.6 * Math.max(0, (y + 44) / 30));
      R(x0 + off, y, 1, 1, hash(i, y) > .86 ? '#241a30' : '#0a0610');
    }
  }
}

function drawGhost(t) {
  const g = ghost;
  if (!g.on) return;
  const x = Math.round(g.x), y = Math.round(g.y + Math.sin(g.bob * 3) * 2 - 3), chase = g.state === 'chase';
  const mouth = 5 + Math.round((Math.sin(g.bob * 7) + 1) * 2);
  ctx.save();
  ctx.globalAlpha = g.fade * .4; ctx.fillStyle = '#000'; ctx.fillRect(x - 9, Math.round(g.y) + 4, 18, 3);   // 그림자
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g.fade * (chase ? .5 : .2);
  const gl = ctx.createRadialGradient(x, y - 22, 0, x, y - 22, 58);
  gl.addColorStop(0, chase ? 'rgba(255,40,80,1)' : 'rgba(110,150,255,1)'); gl.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gl; ctx.fillRect(x - 58, y - 80, 116, 116);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = g.fade * .95;
  const glitch = (t % 2300) < 120 || (chase && (t % 700) < 60);                                            // 가끔 지지직
  if (glitch) {
    ctx.globalAlpha = g.fade * .5; ctx.globalCompositeOperation = 'lighter';
    ghostSprite(x + 4, y, g.bob, chase, mouth); ghostSprite(x - 4, y, g.bob, chase, mouth);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = g.fade * .95;
  }
  ghostSprite(x, y, g.bob, chase, mouth);
  ctx.restore();
}
function drawGhostEyes(t) {                                            // 하드 모드: 어둠 속에서 번뜩이는 붉은 눈
  const g = ghost;
  if (!g.on || g.fade <= 0) return;
  const x = Math.round(g.x), y = Math.round(g.y + Math.sin(g.bob * 3) * 2 - 3) - 38;
  ctx.save(); ctx.globalAlpha = g.fade * (.55 + .45 * Math.sin(t / 130));
  ctx.fillStyle = '#ff2a48';
  if (g.state === 'chase') { ctx.fillRect(x - 2, y, 2, 2); ctx.fillRect(x + 4, y, 2, 2); } else ctx.fillRect(x - 1, y + 1, 2, 2);
  ctx.restore();
}
function drawJumpScare(t) {                                                                                // 잡히는 순간 얼굴이 확 커짐
  if (!dead || deadT > 1) return;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${deadT < .08 ? .5 : .88})`; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 + (Math.random() - .5) * 12, 760 + (Math.random() - .5) * 12); ctx.scale(15, 15);
  ctx.globalAlpha = 1;
  ghostSprite(0, 0, deadT * 7, true, 9);
  ctx.restore();
  ctx.fillStyle = `rgba(190,0,25,${Math.max(0, .3 - deadT * .3)})`; ctx.fillRect(0, 0, W, H);
}

// 테스트용 (주소 끝에 ?debug 를 붙였을 때만)
if (new URLSearchParams(location.search).has('debug')) window.__g = { ghost, p, ghostSpawn, toggleHide, retry, caught, get state() { return { dead, hiding, floor, screen, won, gateOpen, failT, CODE }; } };

// ===== 키보드 =====
const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
addEventListener('keydown', e => {
  if (dead) { if (overShown && (e.key === 'Enter' || e.code === 'Space' || e.code === 'KeyR')) { retry(); e.preventDefault(); } return; }
  if (won) return;
  if (e.code === 'Tab') { e.preventDefault(); if (!quizOpen) toggleNote(); return; }
  if (gateOpen) { gateKey(e); return; }
  if (failT > 0) return;
  if (e.code === 'KeyE') { toggleHide(); e.preventDefault(); return; }
  if (e.code === 'Tab') { e.preventDefault(); if (!quizOpen) toggleNote(); return; }
  if (e.key === 'Escape' && !quizOpen && !noteEl.hidden) { toggleNote(false); return; }
  if (quizOpen) {
    if (e.key === 'Escape') closeQuiz();
    else if (/^[1-4]$/.test(e.key)) answer(Number(e.key));
    return;
  }
  const k = KEYMAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));

// ===== 시작 =====
function startFloor() {
  map = buildMap();
  buildStatic();
  updateHud();
}
startFloor();
placeAtTile(screen === 0 ? 4 : 27, 11);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(buildStatic);

let last = performance.now();
function loop(t) {
  const dt = Math.min(.05, (t - last) / 1000); last = t;
  if (!won) { playSec += dt; saveAcc += dt; if (saveAcc > 3) { saveAcc = 0; savePlay(); } }
  else { winT += dt; if (winT > 2.4 && !winShown) { winShown = true; winEl.hidden = false; $('wback').focus(); } }
  update(dt); ghostTick(dt); render(t);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
})();
