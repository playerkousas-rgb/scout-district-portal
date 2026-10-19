/**
 * 徽章融合 QR（v4.21.0）
 * ═══════════════════════════════════════════════════════════════
 * 唔再係「中間貼一個 logo」，而係將 **整個 QR 每一個模組上色**，
 * 令成個 QR 本身睇落就係筲箕灣區章／燈塔：
 *
 *   1. 用程式畫出區章嘅「色圖」（藍底、白色光束、黑白格燈塔、海浪）
 *   2. QR 每個模組按色圖位置取色：深色模組用該位置嘅深色版，
 *      淺色模組用淺色版 —— 保留 QR 嘅黑白結構，同時透出圖案
 *   3. 八個 mask pattern 逐個試，揀最貼近區章嗰個（唔影響解碼）
 *   4. 四邊留足 quiet zone（靜區），再用徽章白邊＋金線外框包住
 *
 * 銀碼一改，QR 內容同 pattern 就跟住變，但個徽章構圖唔變。
 */
import QRCode from 'qrcode';
import * as EC from 'qrcode/lib/core/error-correction-code';
import * as ECLevel from 'qrcode/lib/core/error-correction-level';

export type FusionTemplate = 'districtBadge' | 'beaconSunset' | 'harbourNight' | 'fleur';
export type FusionModuleStyle = 'square' | 'soft';

export interface FusionOptions {
  text: string;
  template: FusionTemplate;
  /** 0–100：顏色跟圖案嘅程度（0 = 純深藍／白，100 = 最跟圖） */
  fusion: number;
  moduleStyle: FusionModuleStyle;
  brandZh: string;
  brandEn: string;
  caption: string;
  /** 徽章主色（用嚟做外框、文字），預設會由 template 提供 */
  accent?: string;
}

interface RGB { r: number; g: number; b: number }

interface ArtTheme {
  id: FusionTemplate;
  name: string;
  hint: string;
  paper: string;
  ink: string;
  accent: string;
  /** 色圖：u,v ∈ [0,1] → 顏色 */
  sample: (u: number, v: number) => RGB;
  /** 構圖圖：0 = 一定深色、1 = 一定淺色、0.5 = 由 QR 自己決定（唔浪費容錯額） */
  structure: (u: number, v: number) => number;
  /** 底紋墨色（例如區章嘅寶藍底）；預設跟 ink */
  field?: string;
}

// ── 顏色工具 ──────────────────────────────────────────────────
function rgb(r: number, g: number, b: number): RGB { return { r, g, b }; }
function fromHex(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function toCss(c: RGB, alpha = 1): string {
  const r = Math.round(c.r), g = Math.round(c.g), b = Math.round(c.b);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return rgb(a.r + (b.r - a.r) * k, a.g + (b.g - a.g) * k, a.b + (b.b - a.b) * k);
}
function luma(c: RGB): number {
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}
/** 保留色相，將顏色調到指定亮度 */
function setLuma(c: RGB, target: number): RGB {
  const L = luma(c);
  const t = Math.max(0, Math.min(1, target));
  if (Math.abs(L - t) < 0.004) return c;
  if (t < L) {
    const k = t / Math.max(L, 0.0001);
    return rgb(c.r * k, c.g * k, c.b * k);
  }
  const k = (t - L) / Math.max(1 - L, 0.0001);
  return mix(c, rgb(255, 255, 255), k);
}
function saturate(c: RGB, k: number): RGB {
  const L = luma(c) * 255;
  return rgb(
    Math.max(0, Math.min(255, L + (c.r - L) * k)),
    Math.max(0, Math.min(255, L + (c.g - L) * k)),
    Math.max(0, Math.min(255, L + (c.b - L) * k)),
  );
}

// ── 幾何工具（畀色圖用）────────────────────────────────────────
type Pt = [number, number];
function inTriangle(p: Pt, a: Pt, b: Pt, c: Pt): boolean {
  const d1 = (p[0] - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (p[1] - b[1]);
  const d2 = (p[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (p[1] - c[1]);
  const d3 = (p[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (p[1] - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function inQuad(p: Pt, a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  return inTriangle(p, a, b, c) || inTriangle(p, a, c, d);
}
function circleDist(p: Pt, c: Pt): number {
  return Math.hypot(p[0] - c[0], p[1] - c[1]);
}
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return Math.hypot(p[0] - (a[0] + vx * t), p[1] - (a[1] + vy * t));
}

// ── 主題色圖 ─────────────────────────────────────────────────
const BLUE = fromHex('#3d40a0');
const BLUE_DEEP = fromHex('#2a2c78');
const WHITE = rgb(255, 255, 255);
const BLACK = rgb(12, 14, 20);
const GOLD = fromHex('#c9a24a');
const CREAM = fromHex('#f6efdd');

/** 筲箕灣區章：藍底 + 白光束 + 黑白格燈塔 + 海浪 */
function drawDistrictBadge(u: number, v: number): RGB {
  const p: Pt = [u, v];
  // 底：皇家藍（上下輕微漸變）
  let color = mix(BLUE, BLUE_DEEP, Math.max(0, (v - 0.55) / 0.45) * 0.55);

  // 光束（由燈塔頂向左右射出的白色三角）
  const apex: Pt = [0.5, 0.275];
  const beamLeft = inTriangle(p, apex, [0.0, 0.185], [0.0, 0.365]);
  const beamRight = inTriangle(p, apex, [1.0, 0.185], [1.0, 0.365]);
  if (beamLeft || beamRight) color = WHITE;

  // 海浪（白色折線，畫喺最底層之上）
  const wave = (base: number, amp: number, thick: number): boolean => {
    if (u < 0.06 || u > 0.94) return false;
    const t = (u - 0.06) / 0.88;              // 0..1
    const zig = Math.abs(((t * 6) % 1) * 2 - 1); // 0..1 三角波
    const y = base + (zig - 0.5) * amp * 2;
    return Math.abs(v - y) < thick;
  };
  if (wave(0.855, 0.021, 0.011) || wave(0.905, 0.021, 0.011) || wave(0.955, 0.021, 0.011)) {
    color = WHITE;
  }

  // 燈塔塔身（白色梯形 + 黑白格）
  const top = 0.295, bottom = 0.86;
  if (v > top && v < bottom) {
    const t = (v - top) / (bottom - top);
    const half = 0.078 + t * 0.088;             // 上窄下闊
    if (Math.abs(u - 0.5) < half) {
      const xr = (u - (0.5 - half)) / (2 * half); // 0..1
      const yr = t;
      const cols = 4, rows = 9;
      const cx = Math.floor(xr * cols);
      const ry = Math.floor(yr * rows);
      const fx = (xr * cols) % 1;
      const fy = (yr * rows) % 1;
      const inset = 0.13;
      const isBlack = (cx + ry) % 2 === 0;
      color = WHITE;
      if (isBlack && fx > inset && fx < 1 - inset && fy > inset && fy < 1 - inset) color = BLACK;
    }
  }

  // 塔頂：黑色頂蓋 + 小圓頂
  const capBottom = 0.30, capTop = 0.205;
  if (v > capTop && v < capBottom) {
    const t = (v - capTop) / (capBottom - capTop);
    const half = 0.045 + t * 0.07;
    if (Math.abs(u - 0.5) < half) color = BLACK;
  }
  if (v > 0.175 && v < 0.21) {
    const half = 0.028 + ((v - 0.175) / 0.035) * 0.02;
    if (Math.abs(u - 0.5) < half) color = BLACK;
  }
  if (circleDist(p, [0.5, 0.168]) < 0.016) color = BLACK;

  // 燈室：黑色頂蓋下一個細白色窗
  if (v > 0.245 && v < 0.295 && Math.abs(u - 0.5) < 0.035) {
    color = (v > 0.252 && v < 0.288 && Math.abs(u - 0.5) < 0.022) ? GOLD : BLACK;
  }

  return color;
}

/** 區章構圖：白光束／白格／海浪 = 淺；黑格／黑頂 = 深；藍底 = 中性 */
function structureDistrictBadge(u: number, v: number): number {
  const p: Pt = [u, v];
  const apex: Pt = [0.5, 0.275];
  if (inTriangle(p, apex, [0.0, 0.185], [0.0, 0.365]) || inTriangle(p, apex, [1.0, 0.185], [1.0, 0.365])) return 1;

  const wave = (base: number, amp: number, thick: number): boolean => {
    if (u < 0.06 || u > 0.94) return false;
    const t = (u - 0.06) / 0.88;
    const zig = Math.abs(((t * 6) % 1) * 2 - 1);
    const y = base + (zig - 0.5) * amp * 2;
    return Math.abs(v - y) < thick;
  };
  if (wave(0.872, 0.024, 0.014) || wave(0.923, 0.024, 0.014) || wave(0.974, 0.024, 0.014)) return 1;

  if (v > 0.175 && v < 0.21 && Math.abs(u - 0.5) < 0.05) return 0;              // 圓頂
  if (v > 0.205 && v < 0.30 && Math.abs(u - 0.5) < 0.045 + ((v - 0.205) / 0.095) * 0.07) return 0; // 頂蓋
  if (v > 0.245 && v < 0.295 && Math.abs(u - 0.5) < 0.035) {
    return (v > 0.252 && v < 0.288 && Math.abs(u - 0.5) < 0.022) ? 1 : 0;       // 燈室
  }

  const top = 0.30, bottom = 0.88;
  if (v > top && v < bottom) {
    const t = (v - top) / (bottom - top);
    const half = 0.072 + t * 0.086;
    if (Math.abs(u - 0.5) < half) {
      const xr = (u - (0.5 - half)) / (2 * half);
      // 塔身底部嘅黑色倒 V 基座
      if (t > 0.86) {
        return Math.abs(u - 0.5) < half * (1 - (t - 0.86) / 0.14) ? 0 : 1;
      }
      const cols = 3, rows = 7;
      const cx = Math.floor(xr * cols);
      const ry = Math.floor(t * rows);
      const fx = (xr * cols) % 1;
      const fy = (t * rows) % 1;
      const inset = 0.13;
      const isBlack = (cx + ry) % 2 === 0;
      if (xr < 0.05 || xr > 0.95 || t < 0.01) return 0;
      if (isBlack && fx > inset && fx < 1 - inset && fy > inset && fy < 1 - inset) return 0;
      return 1;
    }
  }
  return 0.5; // 藍底：留返畀 QR 自己
}

/** 燈塔黃昏：暖色天空 + 太陽 + 海 + 燈塔剪影 */
function drawBeaconSunset(u: number, v: number): RGB {
  const p: Pt = [u, v];
  const skyTop = fromHex('#3c4b70');
  const skyMid = fromHex('#c9704c');
  const skyLow = fromHex('#f3c078');
  let color: RGB;
  if (v < 0.45) color = mix(skyTop, skyMid, v / 0.45);
  else if (v < 0.72) color = mix(skyMid, skyLow, (v - 0.45) / 0.27);
  else color = mix(fromHex('#123043'), fromHex('#0a1c27'), (v - 0.72) / 0.28);

  // 太陽
  if (circleDist(p, [0.7, 0.6]) < 0.095) color = fromHex('#ffe7ae');
  if (circleDist(p, [0.7, 0.6]) < 0.115) color = mix(color, fromHex('#ffd27a'), 0.5);

  // 海面反光
  if (v > 0.72) {
    const refl = Math.abs(((u * 9) % 1) - 0.5);
    if (refl < 0.06 && v < 0.9) color = mix(color, fromHex('#e9b96a'), 0.35);
  }

  // 燈塔（左邊剪影）
  const towerTop = 0.30, towerBottom = 0.74;
  if (v > towerTop && v < towerBottom) {
    const t = (v - towerTop) / (towerBottom - towerTop);
    const half = 0.038 + t * 0.032;
    if (Math.abs(u - 0.30) < half) color = fromHex('#141d29');
  }
  if (v > 0.265 && v < 0.30) {
    const half = 0.05;
    if (Math.abs(u - 0.30) < half) color = fromHex('#0e151f');
  }
  if (v > 0.235 && v < 0.268 && Math.abs(u - 0.30) < 0.024) color = fromHex('#f2cf7d');
  if (circleDist(p, [0.30, 0.225]) < 0.028) color = fromHex('#0e151f');

  // 光束
  if (inTriangle(p, [0.30, 0.25], [0.95, 0.20], [0.95, 0.30])) color = mix(color, WHITE, 0.72);

  // 前方懸崖
  if (v > 0.80 && u < 0.55 + Math.sin(u * 12) * 0.03) color = mix(fromHex('#1a2a2f'), fromHex('#0d171b'), 0.3);

  return color;
}

/** 海港夜色：深藍夜空 + 月亮 + 星 + 光束 + 海 */
function drawHarbourNight(u: number, v: number): RGB {
  const p: Pt = [u, v];
  let color: RGB;
  if (v < 0.7) color = mix(fromHex('#081228'), fromHex('#1b3a63'), v / 0.7);
  else color = mix(fromHex('#0b2136'), fromHex('#061420'), (v - 0.7) / 0.3);

  // 月亮
  if (circleDist(p, [0.76, 0.2]) < 0.075) color = fromHex('#f4ecd2');
  if (circleDist(p, [0.76, 0.2]) < 0.10) color = mix(color, fromHex('#f4ecd2'), 0.16);

  // 星（固定位置）
  const stars: [number, number, number][] = [
    [0.12, 0.12, 0.008], [0.24, 0.2, 0.006], [0.36, 0.09, 0.007], [0.48, 0.17, 0.005],
    [0.58, 0.08, 0.006], [0.66, 0.28, 0.005], [0.88, 0.32, 0.007], [0.18, 0.33, 0.005],
    [0.42, 0.3, 0.006], [0.92, 0.12, 0.006], [0.06, 0.45, 0.005], [0.62, 0.42, 0.004],
  ];
  for (const [sx, sy, sr] of stars) {
    if (circleDist(p, [sx, sy]) < sr) color = fromHex('#e8f0ff');
  }

  // 燈塔剪影
  const top = 0.34, bottom = 0.72;
  if (v > top && v < bottom) {
    const t = (v - top) / (bottom - top);
    const half = 0.034 + t * 0.03;
    if (Math.abs(u - 0.22) < half) color = fromHex('#0a1119');
  }
  if (v > 0.30 && v < 0.34 && Math.abs(u - 0.22) < 0.055) color = fromHex('#070c12');
  if (v > 0.268 && v < 0.302 && Math.abs(u - 0.22) < 0.022) color = fromHex('#ffe6a3');
  if (circleDist(p, [0.22, 0.258]) < 0.03) color = fromHex('#070c12');

  // 光束（射向右邊）
  if (inTriangle(p, [0.24, 0.285], [1.0, 0.19], [1.0, 0.42])) color = mix(color, fromHex('#dfe9ff'), 0.8);

  // 海面波光
  if (v > 0.72) {
    const band = Math.abs(((u * 11 + v * 5) % 1) - 0.5);
    if (band < 0.05) color = mix(color, fromHex('#3a6d94'), 0.45);
  }

  return color;
}

/** 童軍綠：深綠底 + 奶油百合花 + 金環 */
function drawFleur(u: number, v: number): RGB {
  const p: Pt = [u, v];
  let color = mix(fromHex('#0d3520'), fromHex('#1d5c38'), v * 0.9);

  if (circleDist(p, [0.5, 0.52]) < 0.40) color = mix(color, GOLD, 0.18);
  if (circleDist(p, [0.5, 0.52]) > 0.365 && circleDist(p, [0.5, 0.52]) < 0.385) color = GOLD;

  // 百合花（中心 + 左右花瓣）
  const petal = (px: number, py: number, w: number, h: number) => {
    const dx = (u - px) / w;
    const dy = (v - py) / h;
    return dx * dx + dy * dy < 1;
  };
  if (petal(0.5, 0.40, 0.075, 0.20)) color = CREAM;
  if (petal(0.40, 0.47, 0.07, 0.15) || petal(0.60, 0.47, 0.07, 0.15)) color = CREAM;
  if (petal(0.5, 0.66, 0.045, 0.11)) color = CREAM;

  // 金色橫帶
  if (v > 0.55 && v < 0.60 && u > 0.40 && u < 0.60) color = GOLD;

  return color;
}

/** 黃昏構圖：太陽／光束／燈室 = 淺；燈塔、懸崖 = 深；天空海面中性 */
function structureBeaconSunset(u: number, v: number): number {
  const p: Pt = [u, v];
  if (inTriangle(p, [0.30, 0.25], [0.95, 0.20], [0.95, 0.30])) return 1;
  if (circleDist(p, [0.7, 0.6]) < 0.105) return 1;
  if (v > 0.235 && v < 0.268 && Math.abs(u - 0.30) < 0.026) return 1;
  if (v > 0.265 && v < 0.30 && Math.abs(u - 0.30) < 0.052) return 0;
  if (circleDist(p, [0.30, 0.225]) < 0.03) return 0;
  const towerTop = 0.30, towerBottom = 0.74;
  if (v > towerTop && v < towerBottom) {
    const t = (v - towerTop) / (towerBottom - towerTop);
    if (Math.abs(u - 0.30) < 0.038 + t * 0.032) return 0;
  }
  if (v > 0.80 && u < 0.55 + Math.sin(u * 12) * 0.03) return 0.2;
  return 0.5;
}

/** 夜色構圖：月亮／星／光束 = 淺；燈塔 = 深；天空海面中性 */
function structureHarbourNight(u: number, v: number): number {
  const p: Pt = [u, v];
  if (inTriangle(p, [0.24, 0.285], [1.0, 0.19], [1.0, 0.42])) return 1;
  if (circleDist(p, [0.76, 0.2]) < 0.08) return 1;
  const stars: [number, number][] = [
    [0.12, 0.12], [0.24, 0.2], [0.36, 0.09], [0.48, 0.17], [0.58, 0.08],
    [0.66, 0.28], [0.88, 0.32], [0.18, 0.33], [0.42, 0.3], [0.92, 0.12],
  ];
  for (const [sx, sy] of stars) if (circleDist(p, [sx, sy]) < 0.014) return 1;
  if (v > 0.268 && v < 0.302 && Math.abs(u - 0.22) < 0.024) return 1;
  if (v > 0.30 && v < 0.34 && Math.abs(u - 0.22) < 0.057) return 0;
  if (circleDist(p, [0.22, 0.258]) < 0.032) return 0;
  const top = 0.34, bottom = 0.72;
  if (v > top && v < bottom) {
    const t = (v - top) / (bottom - top);
    if (Math.abs(u - 0.22) < 0.034 + t * 0.03) return 0;
  }
  return 0.5;
}

/** 百合構圖：花、金環 = 淺；綠底中性 */
function structureFleur(u: number, v: number): number {
  const p: Pt = [u, v];
  const petal = (px: number, py: number, w: number, h: number) => {
    const dx = (u - px) / w;
    const dy = (v - py) / h;
    return dx * dx + dy * dy < 1;
  };
  if (petal(0.5, 0.40, 0.075, 0.20)) return 1;
  if (petal(0.40, 0.47, 0.07, 0.15) || petal(0.60, 0.47, 0.07, 0.15)) return 1;
  if (petal(0.5, 0.66, 0.045, 0.11)) return 1;
  const d = circleDist(p, [0.5, 0.52]);
  if (d > 0.365 && d < 0.385) return 1;
  return 0.5;
}

export const FUSION_THEMES: ArtTheme[] = [
  {
    id: 'districtBadge', name: '筲箕灣區章', hint: '藍底 · 白光束 · 黑白格燈塔 · 海浪',
    paper: '#f3ead6', ink: '#14172b', field: '#3a3fa4', accent: '#c9a24a',
    sample: drawDistrictBadge, structure: structureDistrictBadge,
  },
  {
    id: 'beaconSunset', name: '燈塔黃昏', hint: '暖色天空 · 太陽 · 海面反光 · 燈塔剪影',
    paper: '#f6ecd9', ink: '#2a2118', accent: '#cf8a3e',
    sample: drawBeaconSunset, structure: structureBeaconSunset,
  },
  {
    id: 'harbourNight', name: '海港夜色', hint: '深藍夜空 · 月亮星宿 · 光束 · 海',
    paper: '#eef1f6', ink: '#101c2e', accent: '#9db6d8',
    sample: drawHarbourNight, structure: structureHarbourNight,
  },
  {
    id: 'fleur', name: '童軍百合', hint: '深綠底 · 奶油百合花 · 金環',
    paper: '#f2efdf', ink: '#153d25', accent: '#b8892f',
    sample: drawFleur, structure: structureFleur,
  },
];

export function getFusionTheme(id: FusionTemplate): ArtTheme {
  return FUSION_THEMES.find(t => t.id === id) || FUSION_THEMES[0];
}

// ── QR 矩陣 + QArt 式融合 ──────────────────────────────────────
export interface QrGrid {
  count: number;
  version: number;
  mask: number;
  data: Uint8Array;
  reserved: Uint8Array;
}

function createGrid(text: string, mask: number): QrGrid {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H', maskPattern: mask as 0 });
  const modules = qr.modules as unknown as { size: number; data: Uint8Array; reservedBit: Uint8Array };
  return {
    count: modules.size,
    version: qr.version,
    mask,
    data: Uint8Array.from(modules.data),
    reserved: Uint8Array.from(modules.reservedBit),
  };
}

export function isDark(grid: QrGrid, r: number, c: number): boolean {
  return grid.data[r * grid.count + c] === 1;
}

/** 標準 QR 資料模組排列次序（由右下角開始之字型），跳過功能圖案 */
function placementOrder(n: number, reserved: Uint8Array): number[] {
  const order: number[] = [];
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // 跳過 timing 直行
    for (let i = 0; i < n; i++) {
      const r = upward ? n - 1 - i : i;
      for (const c of [right, right - 1]) {
        const idx = r * n + c;
        if (!reserved[idx]) order.push(idx);
      }
    }
    upward = !upward;
  }
  return order;
}

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0;
    case 1: return r % 2 === 0;
    case 2: return c % 3 === 0;
    case 3: return (r + c) % 3 === 0;
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    default: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

/**
 * 將色圖「畫」入 QR 嘅資料模組：
 * QR 有 H 級容錯，每個 RS block 可以修正 floor(EC/2) 個 codeword 錯誤。
 * 我哋逐個 codeword（8 個模組）比較「原值」同「色圖想要嘅深淺」，
 * 喺容錯上限內改成色圖嘅樣 —— 解碼器會當係污損，自動修正返原本內容。
 * 改完之後 QR 照樣解到原本嘅 FPS 字串，但圖案就浮現出嚟。
 */
function applyArtToGrid(grid: QrGrid, theme: ArtTheme, strength: number) {
  const n = grid.count;
  const order = placementOrder(n, grid.reserved);

  const blocks = EC.getBlocksCount(grid.version, ECLevel.H) || 1;
  const ecTotal = EC.getTotalCodewordsCount(grid.version, ECLevel.H) || 0;
  const perBlock = Math.max(1, Math.floor(ecTotal / blocks));
  // 留 2 個 codeword 走盞：印刷污損／反光都仲有容錯
  const capPerBlock = Math.max(1, Math.floor(perBlock / 2) - 3);
  const budgetScale = Math.max(0.15, Math.min(1, strength));

  const structures = order.map(idx => {
    const r = Math.floor(idx / n), c = idx % n;
    return theme.structure((c + 0.5) / n, (r + 0.5) / n);
  });

  const codewords = Math.floor(order.length / 8);
  const items: { w: number; gain: number; weight: number; bits: number[] | null }[] = [];

  for (let w = 0; w < codewords; w++) {
    const bits: number[] = [];
    let gain = 0;
    let weight = 0;
    let hasTarget = false;
    for (let b = 0; b < 8; b++) {
      const idx = order[w * 8 + b];
      const sVal = structures[w * 8 + b];
      // 只強制「深色」結構（燈塔黑格、頂蓋、剪影）：
      // 淺色位本身已經靠半色調縮細模組變淺，唔使再花容錯額。
      const want = sVal <= 0.38 ? 1 : -1;
      bits.push(want);
      if (want >= 0) {
        hasTarget = true;
        if (grid.data[idx] !== want) gain++;
        weight += Math.abs(sVal - 0.5) * (want === 1 ? 1.5 : 1);
      }
    }
    items.push({ w, gain: hasTarget ? gain : 0, weight, bits: hasTarget ? bits : null });
  }

  // 揀「改得最抵」嘅 codeword：改動多 + 附近構圖對比高
  items.sort((a, b) => b.gain * (0.4 + b.weight) - a.gain * (0.4 + a.weight));

  const used = new Array(blocks).fill(0);
  for (const item of items) {
    if (item.gain === 0 || !item.bits) break;
    const block = item.w % blocks;
    if (used[block] >= Math.floor(capPerBlock * budgetScale)) continue;
    for (let b = 0; b < 8; b++) {
      const want = item.bits[b];
      if (want < 0) continue;            // 中性位：保留原值
      const idx = order[item.w * 8 + b];
      grid.data[idx] = want;
    }
    used[block]++;
  }
}

/** 揀最貼近色圖嘅 mask，然後將色圖寫入去 */
function prepareGrid(text: string, theme: ArtTheme, strength: number): QrGrid {
  let best: QrGrid | null = null;
  let bestScore = -Infinity;

  for (let mask = 0; mask < 8; mask++) {
    let grid: QrGrid;
    try { grid = createGrid(text, mask); } catch { continue; }
    applyArtToGrid(grid, theme, strength);

    const n = grid.count;
    let score = 0;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (grid.reserved[r * n + c]) continue;
        const st = theme.structure((c + 0.5) / n, (r + 0.5) / n);
        if (st < 0.4) score += grid.data[r * n + c] ? 2 : 0;
        else if (st > 0.6) score += grid.data[r * n + c] ? 0 : 2;
      }
    }
    if (score > bestScore) { bestScore = score; best = grid; }
  }
  if (!best) throw new Error('未能生成 QR');
  return best;
}

// ── 版面 ──────────────────────────────────────────────────────
const D = 1000;
const CARD_X = 58;
const CARD_Y = 46;
const CARD_W = 884;
const CARD_H = 884;
const TITLE_Y = 30;
const CAPTION_Y = 972;
const FOOTER_Y = 994;

const FONT_ZH = '"PingFang HK", "Microsoft JhengHei", "Noto Sans TC", "Noto Sans CJK TC", system-ui, sans-serif';
const FONT_EN = '"Avenir Next", "Helvetica Neue", Arial, "PingFang HK", "Microsoft JhengHei", system-ui, sans-serif';

function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function trackedText(
  ctx: CanvasRenderingContext2D, text: string, cx: number, y: number,
  spacing: number, font: string, color: string,
) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const chars = Array.from(text);
  const widths = chars.map(c => ctx.measureText(c).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
  let x = cx - total / 2;
  chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + spacing; });
}

function fitFont(
  ctx: CanvasRenderingContext2D, text: string, maxWidth: number,
  build: (px: number) => string, startPx: number, minPx: number,
): string {
  let px = startPx;
  while (px > minPx) {
    ctx.font = build(px);
    if (ctx.measureText(text).width <= maxWidth) break;
    px -= 1;
  }
  return build(px);
}

// ── 主繪圖 ────────────────────────────────────────────────────
export function drawFusionQr(ctx: CanvasRenderingContext2D, px: number, o: FusionOptions) {
  const theme = getFusionTheme(o.template);
  const probe = QRCode.create(o.text, { errorCorrectionLevel: 'H' });
  const nProbe = probe.modules.size;
  // 每個模組喺實際輸出有幾多 device pixel；太細就自動收斂融合度，
  // 保證細圖／超長內容都仲掃得到。
  const modulePx = (px / D) * (CARD_W / (nProbe + 12));
  const sizeGuard = Math.min(1, Math.max(0.35, modulePx / 13));
  const fusionEff = Math.max(0, Math.min(1, (o.fusion / 100) * sizeGuard));
  const grid = prepareGrid(o.text, theme, fusionEff);
  const n = grid.count;

  // QR 區：卡片內留 4 個模組 quiet zone
  const module = CARD_W / (n + 12);
  const qrSize = module * n;
  const qrX = CARD_X + module * 6;
  const qrY = CARD_Y + module * 6;

  ctx.save();
  ctx.scale(px / D, px / D);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const accent = o.accent ? fromHex(o.accent) : fromHex(theme.accent);
  const ink = fromHex(theme.ink);
  const field = fromHex(theme.field ?? theme.ink);
  const paper = fromHex(theme.paper);

  // 紙底
  const bg = ctx.createLinearGradient(0, 0, 0, D);
  bg.addColorStop(0, toCss(paper));
  bg.addColorStop(1, toCss(mix(paper, accent, 0.1)));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, D, D);

  // 頂部標題
  drawTitle(ctx, o, ink, accent);

  // 徽章卡片（白邊 = quiet zone 嘅一部分）
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,0.16)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  rrPath(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 18);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // 卡面底色（如果模板色圖有透明位，凸顯紙色）
  ctx.save();
  rrPath(ctx, CARD_X, CARD_Y, CARD_W, CARD_H, 18);
  ctx.clip();

  // QR 底色：用色圖平均色做底，令縫隙唔會太白
  ctx.fillStyle = toCss(averageArt(theme));
  ctx.fillRect(qrX, qrY, qrSize, qrSize);

  // 每個模組：先鋪「圖案淺色」底，再按圖案深淺畫深色模組（半色調）
  // 深色模組中心永遠係深色 → 解碼器照樣讀到；但大細按圖案收放 → 圖案浮現。
  const fusion = fusionEff;
  const plainDark = fromHex('#0a2340');
  const plainLight = rgb(255, 255, 255);
  // Canvas 用縮放繪圖時，相鄰 fillRect 之間會有抗鋸齒白線；
  // 加少少 bleed 令每格微微重疊，避免 QR 出現「格仔網」影響解碼。
  const bleed = 1.2 * (D / px); // ≈ 1.2 device px
  const cellSize = module + bleed;

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const dark = isDark(grid, r, c);
      const u = (c + 0.5) / n;
      const v = (r + 0.5) / n;
      const art = sampleArt(theme, u, v, n);
      const sVal = theme.structure(u, v);

      const x = qrX + c * module;
      const y = qrY + r * module;

      // 淺色底：構圖深色位（藍底）用淡藍，構圖淺色位（光柱／海浪）用近白
      const paleTint = setLuma(art, 0.90);
      const lightBase = sVal >= 0.62 ? plainLight : mix(plainLight, paleTint, fusion * 0.85);
      const cellColor = mix(plainLight, lightBase, fusion);
      ctx.fillStyle = toCss(cellColor);
      ctx.fillRect(x, y, cellSize, cellSize);

      if (!dark) continue;

      // 半色調：構圖深色位 → 模組全大；淺色位 → 縮成細點（遠看就係白色）
      const reserved = grid.reserved[r * n + c] === 1;
      const darkWeight = 1 - Math.max(0, Math.min(1, sVal));
      const shrink = 0.45 + 0.55 * Math.pow(darkWeight, 0.35);  // 0.45（光柱）→ 0.88（藍底）→ 1.00（黑格）
      const scale = fusion > 0.01 ? 1 - fusion * (1 - shrink) : 1;
      const scaleFinal = reserved ? 1 : scale;                   // 定位眼等功能圖案保持原size

      // 構圖深色（塔身黑格／頂蓋）用墨黑；其餘用底紋色（寶藍）
      const baseDark = sVal <= 0.45 ? ink : field;
      const tintedDark = setLuma(mix(baseDark, art, 0.25), Math.min(0.30, luma(baseDark)));
      const darkColor = mix(plainDark, tintedDark, fusion);

      const size = module * scaleFinal + bleed;
      const cx = x + module / 2;
      const cy = y + module / 2;
      ctx.fillStyle = toCss(darkColor);
      if (o.moduleStyle === 'soft') {
        rrPath(ctx, cx - size / 2, cy - size / 2, size, size, size * 0.08);
        ctx.fill();
      } else {
        ctx.fillRect(cx - size / 2, cy - size / 2, size, size);
      }
    }
  }

  // 用圖案再畫一次淡淡嘅底層（補色塊），唔郁模組中心
  // 疊一層薄薄嘅圖案光，令構圖更清楚（只係色相，唔會破壞對比）
  ctx.globalAlpha = 0.05 * fusion;
  ctx.globalCompositeOperation = 'multiply';
  drawArtOverlay(ctx, theme, qrX, qrY, qrSize, n);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  ctx.restore();

  // 卡片外框（喺 quiet zone 外面）
  rrPath(ctx, CARD_X - 6, CARD_Y - 6, CARD_W + 12, CARD_H + 12, 22);
  ctx.strokeStyle = toCss(accent, 0.9);
  ctx.lineWidth = 2;
  ctx.stroke();
  rrPath(ctx, CARD_X - 12, CARD_Y - 12, CARD_W + 24, CARD_H + 24, 26);
  ctx.strokeStyle = toCss(ink, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();

  // 底部說明
  drawCaptionBar(ctx, o, ink, accent);

  ctx.restore();
}

function averageArt(theme: ArtTheme): RGB {
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = 0; y < 9; y++) {
    for (let x = 0; x < 9; x++) {
      const c = theme.sample((x + 0.5) / 9, (y + 0.5) / 9);
      r += c.r; g += c.g; b += c.b; n++;
    }
  }
  return rgb(r / n, g / n, b / n);
}

/** 每格抽 3×3 樣本，避免細線／尖角漏色 */
function sampleArt(theme: ArtTheme, u: number, v: number, n: number): RGB {
  const step = 1 / (n * 3);
  let r = 0, g = 0, b = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const c = theme.sample(
        Math.max(0, Math.min(1, u + dx * step)),
        Math.max(0, Math.min(1, v + dy * step)),
      );
      r += c.r; g += c.g; b += c.b;
    }
  }
  return rgb(r / 9, g / 9, b / 9);
}

/** 用色圖再畫一次淡淡嘅底層圖案（補形狀） */
function drawArtOverlay(
  ctx: CanvasRenderingContext2D, theme: ArtTheme,
  x: number, y: number, size: number, n: number,
) {
  const step = size / Math.min(n * 2, 160);
  for (let py = 0; py < size; py += step) {
    for (let px = 0; px < size; px += step) {
      const c = theme.sample((px + step / 2) / size, (py + step / 2) / size);
      ctx.fillStyle = toCss(c);
      ctx.fillRect(x + px, y + py, step + 0.6, step + 0.6);
    }
  }
}

function drawTitle(ctx: CanvasRenderingContext2D, o: FusionOptions, ink: RGB, accent: RGB) {
  const title = (o.brandZh || '筲箕灣區').trim();
  const sub = (o.brandEn || '').trim();

  const font = fitFont(ctx, title, 620, px => `800 ${px}px ${FONT_ZH}`, 26, 16);
  ctx.font = font;
  ctx.fillStyle = toCss(ink);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, D / 2, TITLE_Y);

  const half = ctx.measureText(title).width / 2;
  ctx.strokeStyle = toCss(accent, 0.8);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(D / 2 - half - 46, TITLE_Y); ctx.lineTo(D / 2 - half - 16, TITLE_Y);
  ctx.moveTo(D / 2 + half + 16, TITLE_Y); ctx.lineTo(D / 2 + half + 46, TITLE_Y);
  ctx.stroke();

  if (sub) {
    trackedText(ctx, sub, D / 2, TITLE_Y + 21, 2.4, `600 9.5px ${FONT_EN}`, toCss(mix(ink, accent, 0.5)));
  }
}

function drawCaptionBar(ctx: CanvasRenderingContext2D, o: FusionOptions, ink: RGB, accent: RGB) {
  const caption = (o.caption || '').trim();
  if (caption) {
    const font = fitFont(ctx, caption, 640, px => `700 ${px}px ${FONT_ZH}`, 17, 11);
    ctx.font = font;
    ctx.fillStyle = toCss(ink);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(caption, D / 2, CAPTION_Y);

    const half = ctx.measureText(caption).width / 2;
    ctx.fillStyle = toCss(accent, 0.9);
    [[D / 2 - half - 16, CAPTION_Y], [D / 2 + half + 16, CAPTION_Y]].forEach(([x, y]) => {
      ctx.beginPath();
      ctx.moveTo(x, y - 3.4); ctx.lineTo(x + 3.4, y); ctx.lineTo(x, y + 3.4); ctx.lineTo(x - 3.4, y);
      ctx.closePath(); ctx.fill();
    });
  }
  trackedText(ctx, 'SKWSCOUT.ORG.HK', D / 2, FOOTER_Y, 2, `600 8.5px ${FONT_EN}`, toCss(ink, 0.5));
}

/** 融合模式嘅安全提示（同證書版分開評分） */
export function fusionSafety(o: FusionOptions, modules: number): { score: number; label: string; tone: 'good' | 'ok' | 'warn' } {
  let score = 100;
  if (o.fusion > 92) score -= 6;
  if (modules > 61) score -= 8;
  if (o.text.length > 220) score -= 8;
  if (o.template === 'harbourNight') score -= 3;
  score = Math.max(0, Math.min(100, Math.round(score)));
  if (score >= 88) return { score, label: '高：手機一般掃得，記得試掃', tone: 'good' };
  if (score >= 70) return { score, label: '中：印刷請放大到 4cm 以上', tone: 'ok' };
  return { score, label: '偏低：降低「融合強度」或改回圓角方塊', tone: 'warn' };
}

/** 畀 UI 用：預覽矩陣資料（唔使重覆生成） */
export function fusionMatrixInfo(text: string, template: FusionTemplate) {
  const theme = getFusionTheme(template);
  const grid = prepareGrid(text, theme, 1);
  return { count: grid.count, version: grid.version };
}
