'use strict';
/* DP Plans — top-down lighting, camera & shot planner. All data stays on the device (IndexedDB). */

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r2 = v => Math.round(v * 100) / 100;
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const normDeg = d => ((d % 360) + 360) % 360;
const clone = o => JSON.parse(JSON.stringify(o));
const FONT = `Anuphan, 'IBM Plex Sans Thai', Thonburi, 'Noto Sans Thai', system-ui, sans-serif`;
const PAPER = '#F1F2F4', INK = '#2B2B2E', SETF = '#ebe7df', SETS = '#4a4a50';
const CAM_COLORS = ['#e5484d', '#2f7cf6', '#30a46c', '#8e4ec6', '#f76b15', '#0894b3'];
const PEN_COLORS = ['#e5484d', '#2f7cf6', '#1c1c1f', '#f5a524', '#30a46c'];
const PERSON_COLORS = ['#FF7A1A', '#2F6BFF', '#2B2B2E', '#FFFFFF', '#F5C400', '#22B07D', '#E5484D', '#8E6BE8', '#00A3C4', '#FF5FA2', '#8B5E3C', '#7A8B99'];
const SENSORS = { ff: ['Full Frame', 36], s35: ['Super 35', 24.9], apsc: ['APS-C', 23.5], mft: ['Micro 4/3', 17.3], phone: ['มือถือ (ระยะเทียบ FF)', 36] };
const SHOT_SIZES = ['EWS', 'WS', 'FS', 'MS', 'MCU', 'CU', 'ECU', 'OTS', 'POV', '2-Shot', 'Insert'];
const ANGLES = ['ระดับสายตา', 'มุมสูง', 'มุมต่ำ', 'Top shot', 'Dutch'];
const MOVES = ['Static', 'Pan', 'Tilt', 'Dolly in', 'Dolly out', 'Truck / Slide', 'Handheld', 'Gimbal', 'Crane / Jib', 'Zoom', 'Orbit'];
const MODIFIERS = ['—', 'Softbox', 'Lantern', 'Dome', 'Grid', 'Umbrella', 'Fresnel lens', 'Diffusion', 'Barn doors'];
const TIMES = ['กลางวัน', 'กลางคืน', 'เช้า', 'เย็น / Golden hour', 'Blue hour', 'ในสตูดิโอ'];
const K_PRESETS = [2700, 3200, 4300, 5600, 6500];
const K_RAMP = [[2000, [255, 112, 36]], [2700, [255, 146, 54]], [3200, [255, 176, 88]], [4300, [255, 214, 130]], [5000, [214, 228, 214]], [5600, [150, 204, 255]], [6500, [118, 178, 255]], [10000, [96, 140, 255]]];
function kColor(k) {
  k = clamp(+k || 5600, 2000, 10000);
  for (let i = 1; i < K_RAMP.length; i++) if (k <= K_RAMP[i][0]) {
    const [k0, a] = K_RAMP[i - 1], [k1, b] = K_RAMP[i], t = (k - k0) / (k1 - k0);
    return '#' + a.map((v, j) => Math.round(v + (b[j] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  return '#608cff';
}

// ---------- item library (top view, front faces +x) ----------
const st = (w = .025) => `stroke="${SETS}" stroke-width="${w}"`;
const SHAPES = {
  fresnel: () => `<rect x="-.22" y="-.16" width=".34" height=".32" rx=".05" fill="${INK}"/><path d="M.12-.15L.27-.25V.25L.12.15z" fill="#5a5a62"/><rect x=".1" y="-.11" width=".04" height=".22" fill="#ffe7a8"/>`,
  hmi: () => `<g transform="scale(1.3)">${SHAPES.fresnel()}</g><text x="-.12" y=".07" font-size=".2" font-weight="700" fill="#fff" font-family="sans-serif">H</text>`,
  par: () => `<circle r=".18" fill="${INK}"/><rect x=".1" y="-.14" width=".1" height=".28" rx=".03" fill="#5a5a62"/><rect x=".18" y="-.1" width=".03" height=".2" fill="#ffe7a8"/>`,
  cob: () => `<rect x="-.34" y="-.09" width=".2" height=".18" rx=".03" fill="${INK}"/><path d="M-.14-.1L.1-.44H.14V.44H.1L-.14.1z" fill="#3c3c43"/><rect x=".12" y="-.45" width=".06" height=".9" rx=".02" fill="#fff" stroke="${INK}" stroke-width=".02"/>`,
  lantern: () => `<circle r=".32" fill="#fff" stroke="${INK}" stroke-width=".03"/><circle r=".2" fill="none" stroke="#c9c5bc" stroke-width=".015"/><circle r=".08" fill="${INK}"/>`,
  panel: () => `<rect x="-.06" y="-.3" width=".11" height=".6" rx=".02" fill="${INK}"/><rect x=".05" y="-.28" width=".035" height=".56" fill="#ffe7a8"/>`,
  tube: () => `<rect x="-.035" y="-.6" width=".07" height="1.2" rx=".035" fill="#fff" stroke="${INK}" stroke-width=".02"/>`,
  practical: () => `<circle r=".2" fill="#fff6d6" stroke="${INK}" stroke-width=".03"/><circle r=".07" fill="#f5a524"/>`,
  camera: it => { const c = it.color || CAM_COLORS[0]; return `<circle cx="-.13" cy="-.2" r=".1" fill="#fff" stroke="${c}" stroke-width=".04"/><circle cx=".05" cy="-.2" r=".1" fill="#fff" stroke="${c}" stroke-width=".04"/><rect x="-.26" y="-.11" width=".34" height=".24" rx=".05" fill="${c}"/><path d="M.08-.06L.28-.15V.17L.08.08z" fill="${c}"/><circle cx="-.09" cy=".01" r=".04" fill="#fff" fill-opacity=".7"/>`; },
  monitor: () => `<rect x="-.05" y="-.26" width=".1" height=".52" rx=".02" fill="${INK}"/><rect x=".05" y="-.23" width=".02" height=".46" fill="#7fb8ff"/><circle cx="-.18" r=".06" fill="${INK}"/>`,
  talent: it => { const c = it.color || '#FF7A1A', light = /^#f{6}$/i.test(c); return `<ellipse rx=".17" ry=".32" fill="${c}" opacity=".35"/><circle r=".2" fill="${c}" stroke="${light ? '#2B2B2E' : '#fff'}" stroke-width="${light ? .02 : .03}"/><path d="M.18-.09L.34 0L.18.09z" fill="${light ? '#2B2B2E' : c}"/>`; },
  crew: it => SHAPES.talent({ color: it.color || '#8b8d98' }),
  softpanel: () => `<rect x="-.1" y="-.62" width=".14" height="1.24" rx=".03" fill="${INK}"/><rect x=".04" y="-.58" width=".04" height="1.16" fill="#eef2ff"/>`,
  mat: () => `<rect x="-.03" y="-.6" width=".06" height="1.2" rx=".02" fill="#fff" stroke="${INK}" stroke-width=".02"/><path d="M-.03-.3H.03M-.03 0H.03M-.03.3H.03" stroke="${INK}" stroke-width=".01"/>`,
  pocket: () => `<rect x="-.05" y="-.13" width=".09" height=".26" rx=".03" fill="${INK}"/><rect x=".04" y="-.11" width=".025" height=".22" fill="#ffe7a8"/>`,
  bulb: () => `<circle r=".12" fill="#fff6d6" stroke="${INK}" stroke-width=".025"/><circle r=".05" fill="#FF7A1A"/>`,
  balloon: () => `<circle r=".6" fill="#fff" fill-opacity=".85" stroke="${INK}" stroke-width=".025" stroke-dasharray=".08 .05"/><circle r=".12" fill="${INK}"/>`,
  spacelight: () => `<circle r=".36" fill="#fff" stroke="${INK}" stroke-width=".03"/><circle r=".24" fill="none" stroke="${INK}" stroke-width=".015" stroke-dasharray=".04 .03"/><circle r=".06" fill="${INK}"/>`,
  reflector: () => `<rect x="-.03" y="-.5" width=".06" height="1" rx=".02" fill="#fff" stroke="#8a8a90" stroke-width=".025"/><rect x=".03" y="-.48" width=".02" height=".96" fill="#d9d9de"/>`,
  bounce: it => frameShape(it), flag: it => frameShape(it), diffusion: it => frameShape(it),
  neg: it => frameShape(it), net: it => frameShape(it), overhead: it => frameShape(it),
  hazer: () => `<circle r=".75" fill="#c9c6c0" fill-opacity=".18" stroke="#8a8780" stroke-width=".015" stroke-dasharray=".06 .05"/><rect x="-.18" y="-.12" width=".3" height=".24" rx=".04" fill="${INK}"/><path d="M.12-.05h.12M.12.05h.12" stroke="${INK}" stroke-width=".03"/>`,
  cstand: () => `<path d="M0 0L.3 0M0 0L-.15.26M0 0L-.15-.26" stroke="${INK}" stroke-width=".035" stroke-linecap="round"/><circle r=".05" fill="${INK}"/>`,
  door: () => `<rect x="-.06" y="-.45" width=".12" height=".9" fill="${PAPER}"/><path d="M-.05-.45h.1M-.05.45h.1" stroke="${INK}" stroke-width=".03"/><rect x="0" y="-.47" width=".9" height=".04" fill="${SETS}"/><path d="M.9-.45A.9.9 0 0 1 0 .45" fill="none" stroke="${SETS}" stroke-width=".015" stroke-dasharray=".05 .04"/><path d="M0-.45V.45" stroke="${SETS}" stroke-width=".02"/>`,
  window: () => `<rect x="-.06" y="-.6" width=".12" height="1.2" fill="${PAPER}"/><path d="M-.025-.6V.6M.025-.6V.6" stroke="#2F6BFF" stroke-width=".018"/><path d="M-.05-.6h.1M-.05.6h.1" stroke="${INK}" stroke-width=".03"/>`,
  chair: () => `<rect x="-.22" y="-.22" width=".44" height=".44" rx=".06" fill="${SETF}" ${st()}/><rect x="-.27" y="-.22" width=".09" height=".44" rx=".03" fill="${SETS}"/>`,
  armchair: () => `<rect x="-.4" y="-.4" width=".8" height=".8" rx=".1" fill="${SETF}" ${st()}/><rect x="-.4" y="-.4" width=".2" height=".8" rx=".06" fill="#d4cfc4" ${st()}/><rect x="-.3" y="-.4" width=".7" height=".14" rx=".05" fill="#d4cfc4" ${st()}/><rect x="-.3" y=".26" width=".7" height=".14" rx=".05" fill="#d4cfc4" ${st()}/>`,
  sofa: () => `<rect x="-.45" y="-1" width=".9" height="2" rx=".1" fill="${SETF}" ${st()}/><rect x="-.45" y="-1" width=".22" height="2" rx=".07" fill="#d4cfc4" ${st()}/><rect x="-.25" y="-1" width=".7" height=".18" rx=".06" fill="#d4cfc4" ${st()}/><rect x="-.25" y=".82" width=".7" height=".18" rx=".06" fill="#d4cfc4" ${st()}/><path d="M-.23 0H.45" ${st(.015)}/>`,
  table: () => `<rect x="-.45" y="-.75" width=".9" height="1.5" rx=".03" fill="#e2d6c3" ${st()}/>`,
  roundtable: () => `<circle r=".45" fill="#e2d6c3" ${st()}/>`,
  coffee: () => `<rect x="-.3" y="-.55" width=".6" height="1.1" rx=".08" fill="#e2d6c3" ${st()}/>`,
  desk: () => `<rect x="-.35" y="-.7" width=".7" height="1.4" rx=".03" fill="#e2d6c3" ${st()}/><rect x="-.3" y="-.2" width=".08" height=".4" fill="${SETS}"/>`,
  bed: () => `<rect x="-1" y="-.8" width="2" height="1.6" rx=".06" fill="#fff" ${st()}/><rect x="-.92" y="-.7" width=".3" height=".62" rx=".08" fill="${SETF}" ${st(.02)}/><rect x="-.92" y=".08" width=".3" height=".62" rx=".08" fill="${SETF}" ${st(.02)}/><rect x="-.45" y="-.8" width="1.45" height="1.6" rx=".04" fill="#dfe6ee" ${st(.02)}/>`,
  plant: () => `<circle r=".28" fill="#cfe3c2" stroke="#5a7d4a" stroke-width=".02"/><circle cx="-.08" cy="-.06" r=".11" fill="#a8cc93"/><circle cx=".1" cy=".05" r=".1" fill="#a8cc93"/><circle cx="-.02" cy=".12" r=".08" fill="#8dbb76"/>`,
  tv: () => `<rect x="-.04" y="-.6" width=".08" height="1.2" rx=".02" fill="#141416"/><rect x="-.16" y="-.15" width=".12" height=".3" fill="${SETS}"/>`,
  cabinet: () => `<rect x="-.25" y="-.5" width=".5" height="1" rx=".02" fill="${SETF}" ${st()}/><path d="M.25 0H-.25" ${st(.015)}/>`,
  lamp: () => SHAPES.practical(),
};
const LIB = [
  { cat: 'light', type: 'cob', name: 'Softbox (COB)', r: .48, d: { beam: 100, reach: 4.5, watt: 300, mode: 'bicolor', k: 5600, dim: 100, mod: 'Softbox' } },
  { cat: 'light', type: 'fresnel', name: 'Fresnel / Spot', r: .3, d: { beam: 30, reach: 7, watt: 300, mode: 'bicolor', k: 3200, dim: 100, mod: 'Fresnel lens' } },
  { cat: 'light', type: 'lantern', name: 'Lantern', r: .34, d: { beam: 360, reach: 3, watt: 300, mode: 'bicolor', k: 3200, dim: 100, mod: 'Lantern' } },
  { cat: 'light', type: 'panel', name: 'LED Panel', r: .32, d: { beam: 70, reach: 4, watt: 100, mode: 'bicolor', k: 5600, dim: 100, mod: '—' } },
  { cat: 'light', type: 'tube', name: 'Tube 4ft', r: .62, d: { beam: 150, reach: 2.5, watt: 30, mode: 'rgb', k: 3200, color: '#c86bff', dim: 100, mod: '—' } },
  { cat: 'light', type: 'par', name: 'PAR', r: .24, d: { beam: 25, reach: 9, watt: 575, mode: 'daylight', k: 5600, dim: 100, mod: '—' } },
  { cat: 'light', type: 'hmi', name: 'HMI', r: .4, d: { beam: 40, reach: 12, watt: 1800, mode: 'daylight', k: 5600, dim: 100, mod: 'Fresnel lens' } },
  { cat: 'light', type: 'practical', name: 'Practical (โคมในฉาก)', r: .22, d: { beam: 360, reach: 1.6, watt: 40, mode: 'bicolor', k: 2700, dim: 100, mod: '—' } },
  { cat: 'camera', type: 'camera', name: 'กล้อง', r: .32, d: { body: '', sensor: 'ff', lens: 35, reach: 4, height: 1.5 } },
  { cat: 'camera', type: 'monitor', name: 'มอนิเตอร์ / Video village', r: .27, d: {} },
  { cat: 'person', type: 'talent', name: 'นักแสดง / ตัวแบบ', r: .36, d: { role: 'talent', color: '#f5a524' } },
  { cat: 'person', type: 'crew', name: 'ทีมงาน', r: .36, d: { role: 'crew', color: '#8b8d98' } },
  { cat: 'light', type: 'softpanel', name: 'Soft panel (แบบ SkyPanel)', r: .64, d: { beam: 110, reach: 5, watt: 450, mode: 'bicolor', k: 5600, dim: 100, mod: '—' } },
  { cat: 'light', type: 'mat', name: 'Flex mat (แผ่นไฟอ่อน)', r: .62, d: { beam: 120, reach: 3, watt: 200, mode: 'bicolor', k: 3200, dim: 100, mod: 'Softbox' } },
  { cat: 'light', type: 'spacelight', name: 'Space light / China ball', r: .38, d: { beam: 360, reach: 3.5, watt: 300, mode: 'bicolor', k: 3200, dim: 100, mod: 'Lantern' } },
  { cat: 'light', type: 'pocket', name: 'ไฟจิ๋ว / Pocket LED', r: .16, d: { beam: 100, reach: 1.8, watt: 10, mode: 'rgb', k: 4300, color: '#FF7A1A', dim: 100, mod: '—' } },
  { cat: 'light', type: 'bulb', name: 'หลอด RGB / Bulb', r: .14, d: { beam: 360, reach: 1.4, watt: 7, mode: 'rgb', k: 2700, color: '#FFB067', dim: 100, mod: '—' } },
  { cat: 'light', type: 'balloon', name: 'Balloon light', r: .62, d: { beam: 360, reach: 9, watt: 2000, mode: 'bicolor', k: 4300, dim: 100, mod: '—' } },
  { cat: 'grip', type: 'diffusion', name: 'Diffusion frame', r: .62, d: { size: '8×8', fabric: '¼ Grid' } },
  { cat: 'grip', type: 'overhead', name: 'Butterfly / Overhead (แนวนอน)', r: 1.9, d: { size: '12×12', fabric: 'Full Silk' } },
  { cat: 'grip', type: 'bounce', name: 'Bounce frame', r: .52, d: { size: '4×4', fabric: 'Ultrabounce' } },
  { cat: 'grip', type: 'neg', name: 'Neg fill', r: .62, d: { size: '4×8', fabric: 'Solid / Duvetyne' } },
  { cat: 'grip', type: 'flag', name: 'Flag / Cutter', r: .52, d: { size: '24×36 in', fabric: 'Solid / Duvetyne' } },
  { cat: 'grip', type: 'net', name: 'Net (หรี่แสง)', r: .52, d: { size: '24×36 in', fabric: 'Double net' } },
  { cat: 'grip', type: 'reflector', name: 'Reflector', r: .52, d: {} },
  { cat: 'grip', type: 'cstand', name: 'C-stand', r: .32, d: {} },
  { cat: 'grip', type: 'hazer', name: 'Hazer / Fog', r: .75, d: {} },
  { cat: 'set', type: 'door', name: 'ประตู', r: .95, d: {} },
  { cat: 'set', type: 'window', name: 'หน้าต่าง (แสงธรรมชาติ)', r: .62, d: { sun: true, k: 5600, beam: 110, reach: 4 } },
  { cat: 'set', type: 'chair', name: 'เก้าอี้', r: .32, d: {} },
  { cat: 'set', type: 'armchair', name: 'อาร์มแชร์', r: .56, d: {} },
  { cat: 'set', type: 'sofa', name: 'โซฟา', r: 1.08, d: {} },
  { cat: 'set', type: 'table', name: 'โต๊ะ', r: .86, d: {} },
  { cat: 'set', type: 'roundtable', name: 'โต๊ะกลม', r: .47, d: {} },
  { cat: 'set', type: 'coffee', name: 'โต๊ะกาแฟ', r: .62, d: {} },
  { cat: 'set', type: 'desk', name: 'โต๊ะทำงาน', r: .78, d: {} },
  { cat: 'set', type: 'bed', name: 'เตียง', r: 1.26, d: {} },
  { cat: 'set', type: 'plant', name: 'ต้นไม้', r: .3, d: {} },
  { cat: 'set', type: 'tv', name: 'ทีวี', r: .62, d: {} },
  { cat: 'set', type: 'cabinet', name: 'ตู้ / ชั้น', r: .56, d: {} },
];
const LIBMAP = Object.fromEntries(LIB.map(d => [d.type, d]));
const FRAME_TYPES = ['diffusion', 'overhead', 'bounce', 'neg', 'flag', 'net'];
const FRAME_SIZES = ['18×24 in', '24×36 in', '24×72 in', '4×4', '4×8', '6×6', '8×8', '12×12', '12×20', '20×20'];
const FABRICS = {
  diff: ['Half Soft Frost', 'Hilight', 'Light Grid', '¼ Grid', '½ Grid', 'Full Grid', 'Full Silk', 'Magic Cloth'],
  bounce: ['Ultrabounce', 'Muslin (bleached)', 'Muslin (unbleached)', 'Silver lamé', 'Gold lamé', 'Griffolyn'],
  neg: ['Solid / Duvetyne', 'Black Ultrabounce'],
  net: ['Single net', 'Double net', 'Silk net', 'Lavender net'],
};
const FABRIC_STYLE = { diff: ['#C59BE8', .35, '#8E6BE8'], bounce: ['#ffffff', .95, '#FF8A2B'], neg: ['#1C1C1F', 1, '#1C1C1F'], net: ['#6b6866', .25, '#4a4846'] };
const fabricCat = f => Object.keys(FABRICS).find(k => FABRICS[k].includes(f)) || 'diff';
function frameDims(size) {
  const m = String(size || '4×4').match(/([\d.]+)\s*[×x]\s*([\d.]+)\s*(in)?/);
  if (!m) return [1.22, 1.22];
  const u = m[3] ? .0254 : .3048;
  return [+m[1] * u, +m[2] * u];
}
function frameShape(it) {
  const [a, b] = frameDims(it.size), [f, op, s] = FABRIC_STYLE[fabricCat(it.fabric)];
  const dash = f === '#1C1C1F' || f === '#ffffff' ? '' : 'stroke-dasharray=".08 .05"';
  if (it.type === 'overhead') return `<rect x="${-b / 2}" y="${-a / 2}" width="${b}" height="${a}" fill="${f}" fill-opacity="${op}" stroke="${s}" stroke-width=".04" ${dash}/><path d="M${-b / 2} ${-a / 2}L${b / 2} ${a / 2}M${b / 2} ${-a / 2}L${-b / 2} ${a / 2}" stroke="${s}" stroke-width=".015" opacity=".5"/>`;
  return `<rect x="-.045" y="${-a / 2}" width=".09" height="${a}" fill="${f}" fill-opacity="${op}" stroke="${s}" stroke-width=".03" ${dash}/>`;
}
function itemR(it) {
  if (FRAME_TYPES.includes(it.type)) { const [a, b] = frameDims(it.size); return (it.type === 'overhead' ? Math.hypot(a, b) : a) / 2 + .05; }
  return (LIBMAP[it.type]?.r || .4) * (it.s || 1);
}
const GELS = [['—', 0], ['¼ CTO', 42], ['½ CTO', 81], ['Full CTO', 159], ['¼ CTB', -30], ['½ CTB', -68], ['Full CTB', -131], ['Plus Green', 0], ['Minus Green', 0], ['ND .3', 0], ['ND .6', 0], ['ND .9', 0], ['Deep Blue', null], ['Red / Magenta', null]];
function effK(it) {
  const base = it.mode === 'daylight' ? 5600 : (+it.k || 5600);
  const g = GELS.find(x => x[0] === it.gel);
  return g && g[1] ? Math.round(1e6 / (1e6 / base + g[1]) / 50) * 50 : base;
}
// Brand presets by production size. Wattages are approximate (power draw / class) - verify specs before a real job.
const PRESETS = [
  // จิ๋ว · พกพา (pocket, on-camera, tiny tubes and bulbs)
  ['mini', 'Ulanzi', 'VL49', 'pocket', 5, 'bicolor'], ['mini', 'Ulanzi', 'VL49 RGB', 'pocket', 5, 'rgb'], ['mini', 'Ulanzi', 'VL120', 'pocket', 9, 'bicolor'], ['mini', 'Ulanzi', 'VL200', 'pocket', 10, 'bicolor'],
  ['mini', 'Aputure', 'MC', 'pocket', 5, 'rgb'], ['mini', 'Aputure', 'MC Pro', 'pocket', 8, 'rgb'], ['mini', 'Aputure', 'MT Pro (tube 1ft)', 'tube', 7, 'rgb', { s: .3 }], ['mini', 'Aputure', 'Accent B7c (bulb)', 'bulb', 7, 'rgb'],
  ['mini', 'Aputure amaran', 'Ace 25c', 'pocket', 25, 'rgb'], ['mini', 'Aputure amaran', 'PT1c (tube 1ft)', 'tube', 10, 'rgb', { s: .3 }], ['mini', 'Aputure amaran', 'PT2c (tube 2ft)', 'tube', 20, 'rgb', { s: .5 }],
  ['mini', 'Godox', 'R1 (round mini)', 'pocket', 5, 'rgb'], ['mini', 'Godox', 'M1 (mini RGB)', 'pocket', 8, 'rgb'], ['mini', 'Godox', 'ML30Bi', 'fresnel', 30, 'bicolor'], ['mini', 'Godox', 'TL30 (tube)', 'tube', 10, 'rgb', { s: .5 }], ['mini', 'Godox', 'LC30Bi (Litemons)', 'pocket', 30, 'bicolor'],
  ['mini', 'Zhiyun', 'Fiveray M20', 'pocket', 20, 'bicolor'], ['mini', 'Zhiyun', 'Fiveray M40', 'pocket', 40, 'bicolor'], ['mini', 'Zhiyun', 'Fiveray F100 (stick)', 'tube', 100, 'rgb', { s: .6 }],
  ['mini', 'SmallRig', 'RM75', 'pocket', 7, 'rgb'], ['mini', 'SmallRig', 'RC 30B', 'fresnel', 30, 'bicolor'],
  ['mini', 'Nanlite', 'Litolite 5C', 'pocket', 5, 'rgb'], ['mini', 'Nanlite', 'PavoTube II 6C', 'tube', 7, 'rgb', { s: .3 }], ['mini', 'Nanlite', 'PavoBulb 10C', 'bulb', 10, 'rgb'],
  ['mini', 'Astera', 'NYX Bulb', 'bulb', 10, 'rgb'], ['mini', 'Astera', 'PixelBrick', 'pocket', 15, 'rgb'], ['mini', 'Rotolight', 'NEO 3', 'pocket', 15, 'rgb'],
  ['mini', 'Lume Cube', 'Panel Mini', 'pocket', 5, 'bicolor'], 
  // เล็ก · Creator
  ['small', 'Aputure amaran', '60x S', 'cob', 60, 'bicolor'], ['small', 'Aputure amaran', '100x S', 'cob', 100, 'bicolor'], ['small', 'Aputure amaran', '200x S', 'cob', 200, 'bicolor'],
  ['small', 'Aputure amaran', '150c', 'cob', 150, 'rgb'], ['small', 'Aputure amaran', '300c', 'cob', 300, 'rgb'], ['small', 'Aputure amaran', 'PT4c', 'tube', 50, 'rgb'], ['small', 'Aputure amaran', 'F21c (mat)', 'mat', 100, 'rgb'], ['small', 'Aputure amaran', 'F22c (mat)', 'mat', 200, 'rgb'],
  ['small', 'SmallRig', 'RC 60B', 'cob', 60, 'bicolor'], ['small', 'SmallRig', 'RC 120B', 'cob', 120, 'bicolor'], ['small', 'SmallRig', 'RC 220B', 'cob', 220, 'bicolor'], ['small', 'SmallRig', 'RC 350B', 'cob', 350, 'bicolor'], ['small', 'SmallRig', 'RC 450B', 'cob', 450, 'bicolor'], ['small', 'SmallRig', 'RM120 (panel)', 'panel', 12, 'rgb'],
  ['small', 'Godox', 'ML60IIBi', 'fresnel', 60, 'bicolor'], ['small', 'Godox', 'SL60IIBi', 'cob', 60, 'bicolor'], ['small', 'Godox', 'UL150 II', 'cob', 150, 'daylight'], ['small', 'Godox', 'SL150 III', 'cob', 150, 'daylight'], ['small', 'Godox', 'TL60 (tube)', 'tube', 20, 'rgb'],
  ['small', 'Nanlite', 'Forza 60B II', 'fresnel', 60, 'bicolor'], ['small', 'Nanlite', 'FS-150B', 'cob', 150, 'bicolor'], ['small', 'Nanlite', 'FS-200B', 'cob', 200, 'bicolor'], ['small', 'Nanlite', 'PavoTube II 15X', 'tube', 18, 'rgb', { s: .5 }], ['small', 'Nanlite', 'PavoTube II 30X', 'tube', 36, 'rgb'],
  ['small', 'Zhiyun', 'Molus X100', 'cob', 100, 'bicolor'], ['small', 'Zhiyun', 'Molus G200', 'cob', 200, 'bicolor'], ['small', 'Zhiyun', 'Molus G300', 'cob', 300, 'bicolor'],
  ['small', 'Neewer', 'CB60', 'cob', 70, 'bicolor'], ['small', 'Neewer', 'RGB660 PRO (panel)', 'panel', 50, 'rgb'],
  // กลาง · โฆษณา
  ['mid', 'Aputure', 'LS 300d II', 'cob', 300, 'daylight'], ['mid', 'Aputure', 'LS 600d Pro', 'cob', 600, 'daylight'], ['mid', 'Aputure', 'LS 600x Pro', 'cob', 600, 'bicolor'], ['mid', 'Aputure', 'LS 600c Pro II', 'cob', 600, 'rgb'],
  ['mid', 'Aputure', 'LS 1200d Pro', 'cob', 1200, 'daylight'], ['mid', 'Aputure', 'STORM 1200x', 'cob', 1200, 'bicolor'], ['mid', 'Aputure', 'STORM 1000c', 'cob', 1000, 'rgb'],
  ['mid', 'Aputure', 'Nova P300c', 'softpanel', 300, 'rgb'], ['mid', 'Aputure', 'Nova P600c', 'softpanel', 600, 'rgb'], ['mid', 'Aputure', 'INFINIBAR PB6', 'tube', 50, 'rgb', { s: .5 }], ['mid', 'Aputure', 'INFINIBAR PB12', 'tube', 100, 'rgb'],
  ['mid', 'Nanlite', 'Forza 300B II', 'fresnel', 300, 'bicolor'], ['mid', 'Nanlite', 'Forza 500B II', 'fresnel', 500, 'bicolor'], ['mid', 'Nanlite', 'Forza 720B', 'fresnel', 720, 'bicolor'], ['mid', 'Nanlite', 'FC-720B', 'cob', 750, 'bicolor'], ['mid', 'Nanlite', 'FC-720C', 'cob', 750, 'rgb'],
  ['mid', 'Nanlux', 'Evoke 150C', 'fresnel', 150, 'rgb'], ['mid', 'Nanlux', 'Evoke 600C', 'cob', 600, 'rgb'], ['mid', 'Nanlux', 'Evoke 900C', 'cob', 900, 'rgb'],
  ['mid', 'Godox Knowled', 'M600Bi', 'cob', 600, 'bicolor'], ['mid', 'Godox Knowled', 'F600Bi (flex)', 'mat', 600, 'bicolor'], ['mid', 'Godox Knowled', 'P600Bi (panel)', 'softpanel', 600, 'bicolor'],
  ['mid', 'Astera', 'Titan Tube', 'tube', 72, 'rgb'], ['mid', 'Astera', 'Helios Tube', 'tube', 36, 'rgb', { s: .5 }], ['mid', 'Astera', 'Hyperion Tube', 'tube', 100, 'rgb'],
  ['mid', 'Quasar Science', 'Rainbow 2 (4ft)', 'tube', 50, 'rgb'], ['mid', 'Quasar Science', 'Double Rainbow 4ft', 'tube', 100, 'rgb'],
  ['mid', 'Litepanels', 'Gemini 2×1 Soft', 'softpanel', 350, 'rgb'], ['mid', 'Litepanels', 'Gemini 2×1 Hard', 'fresnel', 350, 'rgb'], ['mid', 'Rotolight', 'AEOS 2', 'panel', 100, 'rgb'], ['mid', 'Rotolight', 'Titan X2', 'softpanel', 500, 'rgb'],
  ['mid', 'DMG Lumière', 'SL1 Mix', 'softpanel', 200, 'rgb'], ['mid', 'Prolycht', 'Orion 675 FS', 'fresnel', 675, 'rgb'], ['mid', 'LiteGear', 'LiteMat Spectrum 4', 'mat', 200, 'rgb'],
  // ใหญ่ · Studio
  ['big', 'ARRI', 'SkyPanel S30-C', 'softpanel', 400, 'rgb'], ['big', 'ARRI', 'SkyPanel S60-C', 'softpanel', 450, 'rgb'], ['big', 'ARRI', 'SkyPanel S120-C', 'softpanel', 800, 'rgb'], ['big', 'ARRI', 'SkyPanel S360-C', 'softpanel', 1500, 'rgb'],
  ['big', 'ARRI', 'SkyPanel X', 'softpanel', 1600, 'rgb'], ['big', 'ARRI', 'Orbiter', 'fresnel', 500, 'rgb'], ['big', 'ARRI', 'L5-C', 'fresnel', 115, 'rgb'], ['big', 'ARRI', 'L7-C', 'fresnel', 220, 'rgb'], ['big', 'ARRI', 'L10-C', 'fresnel', 510, 'rgb'],
  ['big', 'ARRI', 'M8 HMI', 'hmi', 800, 'daylight'], ['big', 'ARRI', 'M18 HMI', 'hmi', 1800, 'daylight'], ['big', 'ARRI', 'M40 HMI', 'hmi', 4000, 'daylight'], ['big', 'ARRI', 'M90 HMI', 'hmi', 9000, 'daylight'], ['big', 'ARRI', 'ARRIMAX 18/12', 'hmi', 18000, 'daylight'],
  ['big', 'ARRI', 'True Blue T12 (tungsten)', 'fresnel', 12000, 'tungsten'],
  ['big', 'Aputure', 'Electro Storm XT26', 'fresnel', 2600, 'bicolor'], ['big', 'Aputure', 'Electro Storm CS15', 'fresnel', 1500, 'rgb'], ['big', 'Aputure', 'Electro Storm XT52', 'fresnel', 5200, 'bicolor'],
  ['big', 'Nanlux', 'Evoke 1200', 'cob', 1200, 'daylight'], ['big', 'Nanlux', 'Evoke 2400B', 'fresnel', 2400, 'bicolor'], ['big', 'Godox Knowled', 'MG1200Bi', 'cob', 1200, 'bicolor'],
  ['big', 'Creamsource', 'Vortex4', 'softpanel', 650, 'rgb'], ['big', 'Creamsource', 'Vortex8', 'softpanel', 650, 'rgb'], ['big', 'Creamsource', 'Vortex24', 'softpanel', 1300, 'rgb'],
  ['big', 'Kino Flo', 'Celeb 850', 'softpanel', 400, 'rgb'], ['big', 'Kino Flo', 'FreeStyle 41', 'tube', 200, 'rgb'],
  ['big', 'Mole-Richardson', '2K Junior', 'fresnel', 2000, 'tungsten'], ['big', 'Mole-Richardson', '5K Senior', 'fresnel', 5000, 'tungsten'], ['big', 'Mole-Richardson', '10K Tener', 'fresnel', 10000, 'tungsten'], ['big', 'Mole-Richardson', '20K Tener', 'fresnel', 20000, 'tungsten'],
  ['big', 'Mole-Richardson', 'Molebeam 10K', 'par', 10000, 'tungsten'], ['big', 'Mole-Richardson', 'Maxi Brute (9-light)', 'par', 9000, 'tungsten'],
  ['big', 'Airstar', 'Balloon 4K', 'balloon', 4000, 'bicolor'], ['big', 'Airstar', 'Balloon 8K', 'balloon', 8000, 'bicolor'],
].map(([scale, brand, model, type, watt, mode, extra], i) => ({ id: 'p' + i, scale, brand, model, type, watt, extra: extra || {}, mode: mode === 'tungsten' ? 'bicolor' : mode, tungsten: mode === 'tungsten', k: mode === 'tungsten' ? 3200 : mode === 'daylight' ? 5600 : LIBMAP[type].d.k }));
const BRANDS = [...new Set(PRESETS.map(p => p.brand))].sort((a, b) => a.localeCompare(b));
const SCALES = [['mini', 'จิ๋ว'], ['small', 'เล็ก'], ['mid', 'กลาง'], ['big', 'ใหญ่']];
const LIB_TABS = [['brands', 'รุ่นไฟตามขนาดกอง'], ['light', 'ประเภทไฟ'], ['kit', 'ชุดไฟของฉัน'], ['grip', 'กริป & ผ้า'], ['camera', 'กล้อง'], ['person', 'คน'], ['set', 'ฉาก / พร็อพ']];
const DEFAULT_KIT = [
  { id: 'k1', model: 'Aputure 600d', type: 'cob', watt: 600, mode: 'daylight' },
  { id: 'k2', model: 'Amaran 200x', type: 'cob', watt: 200, mode: 'bicolor' },
  { id: 'k3', model: 'Nanlite Forza 300B', type: 'fresnel', watt: 300, mode: 'bicolor' },
  { id: 'k4', model: 'Nanlite PavoTube II 30X', type: 'tube', watt: 30, mode: 'rgb' },
];

// ---------- storage ----------
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('dpplans', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('projects', { keyPath: 'id' }); r.result.createObjectStore('meta'); };
      r.onsuccess = () => { DB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      if (!DB.db) return res(null);
      try { const q = fn(DB.db.transaction(store, mode).objectStore(store)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); } catch (e) { rej(e); }
    });
  },
  all: () => DB.req('projects', 'readonly', s => s.getAll()),
  put: p => DB.req('projects', 'readwrite', s => s.put(p)),
  del: id => DB.req('projects', 'readwrite', s => s.delete(id)),
  getMeta: k => DB.req('meta', 'readonly', s => s.get(k)),
  setMeta: (k, v) => DB.req('meta', 'readwrite', s => s.put(v, k)),
};

// ---------- state ----------
const S = {
  projects: [], kit: clone(DEFAULT_KIT), proj: null, scene: null,
  sel: null, tool: 'select', view: { x: 0, y: 0, z: 60 }, tab: 'shots', labels: true,
  activeShot: null, labelMode: 'short', pen: PEN_COLORS[0], preview: null, undo: [], redo: [],
  snaps: { ends: true, angle: true, openings: true, furniture: true },
};
let saveTimer = null;
function save() {
  if (!S.proj) return;
  S.proj.updated = Date.now();
  clearTimeout(saveTimer);
  const p = S.proj;
  saveTimer = setTimeout(() => DB.put(p).catch(() => toast('บันทึกไม่สำเร็จ (พื้นที่เครื่องอาจเต็ม)')), 350);
}
function snap() {
  if (!S.scene) return;
  S.undo.push(JSON.stringify({ plan: S.scene.plan, shots: S.scene.shots }));
  if (S.undo.length > 80) S.undo.shift();
  S.redo = [];
  updateUndo();
}
function undoRedo(dir) {
  const from = dir < 0 ? S.undo : S.redo, to = dir < 0 ? S.redo : S.undo;
  if (!from.length) return;
  to.push(JSON.stringify({ plan: S.scene.plan, shots: S.scene.shots }));
  const s = JSON.parse(from.pop());
  S.scene.plan = s.plan; S.scene.shots = s.shots;
  if (S.sel && !findSel()) S.sel = null;
  save(); render(); renderPanel(); updateUndo();
}
function updateUndo() { $('#btnUndo').disabled = !S.undo.length; $('#btnRedo').disabled = !S.redo.length; }

const newScene = (n, name) => ({ id: uid(), number: String(n), name: name || 'ซีนใหม่', location: '', time: TIMES[0], notes: '', plan: { walls: [], items: [], draws: [], bg: null }, shots: [] });
const newProject = (name, client, date) => ({ id: uid(), name: name || 'โปรเจกต์ใหม่', client: client || '', date: date || '', created: Date.now(), updated: Date.now(), scenes: [newScene(1, 'ซีนแรก')], photos: {} });
const P = () => S.scene.plan;
const items = () => P().items;
const getItem = id => items().find(i => i.id === id);
function findSel() {
  if (!S.sel) return null;
  const { t, id } = S.sel;
  return t === 'item' ? getItem(id) : t === 'wall' ? P().walls.find(w => w.id === id) : P().draws.find(d => d.id === id);
}
const cams = (sc = S.scene) => sc.plan.items.filter(i => i.type === 'camera');
const lights = (sc = S.scene) => sc.plan.items.filter(i => i.cat === 'light');
const hfov = it => 2 * deg(Math.atan((SENSORS[it.sensor] || SENSORS.ff)[1] / (2 * Math.max(4, +it.lens || 35))));
function lightColor(it) {
  if (it.gel === 'Deep Blue') return '#4a63f0';
  if (it.gel === 'Red / Magenta') return '#ff4f9a';
  return it.mode === 'rgb' ? (it.color || '#c86bff') : kColor(effK(it));
}
const kText = it => it.mode === 'rgb' ? 'RGB' : effK(it) + 'K';
// Aim lock: a light or camera with `aim` keeps pointing at that item
function applyAims(sc) {
  for (const it of sc.plan.items) {
    if (!it.aim) continue;
    const t = sc.plan.items.find(x => x.id === it.aim);
    if (!t) { delete it.aim; continue; }
    if (Math.hypot(t.x - it.x, t.y - it.y) > .05) it.rot = Math.round(normDeg(deg(Math.atan2(t.y - it.y, t.x - it.x))));
  }
}
function itemName(it) {
  if (it.cat === 'light') return it.label || it.model || LIBMAP[it.type].name;
  if (it.type === 'camera') return (it.label || 'Cam') + (it.body ? ' · ' + it.body : '');
  if (it.cat === 'person') return it.label || LIBMAP[it.type].name;
  return it.label || LIBMAP[it.type]?.name || it.type;
}
function nextCamLabel(sc) {
  const used = new Set(cams(sc).map(c => c.label));
  for (const L of 'ABCDEFGHIJ') if (!used.has(L)) return L;
  return 'X';
}
function makeItem(type, x, y, extra = {}) {
  const def = LIBMAP[type];
  const it = { id: uid(), cat: def.cat, type, x: r2(x), y: r2(y), rot: 0, s: 1, label: '', ...clone(def.d), ...extra };
  if (type === 'camera' && !extra.label) {
    it.label = nextCamLabel(S.scene);
    it.color = CAM_COLORS[cams(S.scene).length % CAM_COLORS.length];
  }
  if (type === 'tube' && !extra.s) it.s = 1;
  return it;
}

// ---------- plan rendering (SVG, world units = meters) ----------
function wedge(x, y, dir, ang, r) {
  if (ang >= 359) return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
  const a0 = rad(dir - ang / 2), a1 = rad(dir + ang / 2);
  const p0 = [x + r * Math.cos(a0), y + r * Math.sin(a0)], p1 = [x + r * Math.cos(a1), y + r * Math.sin(a1)];
  return `M${x} ${y}L${p0[0].toFixed(3)} ${p0[1].toFixed(3)}A${r} ${r} 0 ${ang > 180 ? 1 : 0} 1 ${p1[0].toFixed(3)} ${p1[1].toFixed(3)}Z`;
}
function smoothPath(pts) {
  if (pts.length < 3) return 'M' + pts.map(p => p.map(v => v.toFixed(3)).join(' ')).join('L');
  let d = `M${pts[0][0].toFixed(3)} ${pts[0][1].toFixed(3)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    d += `Q${pts[i][0].toFixed(3)} ${pts[i][1].toFixed(3)} ${mx.toFixed(3)} ${my.toFixed(3)}`;
  }
  const l = pts[pts.length - 1];
  return d + `L${l[0].toFixed(3)} ${l[1].toFixed(3)}`;
}
const txt = (x, y, s, size, extra = '') => `<text x="${x.toFixed(3)}" y="${y.toFixed(3)}" font-size="${size}" font-family="${FONT}" text-anchor="middle" ${/\bfill=/.test(extra) ? '' : `fill="${INK}"`} stroke="${PAPER}" stroke-width="${size * .28}" paint-order="stroke" stroke-linejoin="round" ${extra}>${esc(s)}</text>`;


// ---------- occlusion: cast rays from a light / camera, stop at walls (minus door & window openings) and solid flags ----------
function occluders(p) {
  const out = [], openings = p.items.filter(i => i.type === 'door' || i.type === 'window');
  for (const w of p.walls) {
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L = Math.hypot(dx, dy); if (L < .01) continue;
    const ux = dx / L, uy = dy / L, cuts = [];
    for (const o of openings) {
      const t = (o.x - w.a[0]) * ux + (o.y - w.a[1]) * uy, d = Math.abs((o.x - w.a[0]) * uy - (o.y - w.a[1]) * ux);
      if (d < .2 && t > -.6 && t < L + .6) { const h = (o.type === 'door' ? .45 : .6) * (o.s || 1); cuts.push([t - h, t + h]); }
    }
    cuts.sort((a, b) => a[0] - b[0]);
    let s0 = 0;
    for (const [c0, c1] of cuts) { if (c0 > s0) out.push([w.a[0] + ux * s0, w.a[1] + uy * s0, w.a[0] + ux * Math.min(c0, L), w.a[1] + uy * Math.min(c0, L)]); s0 = Math.max(s0, c1); }
    if (s0 < L) out.push([w.a[0] + ux * s0, w.a[1] + uy * s0, w.b[0], w.b[1]]);
  }
  for (const f of p.items) {
    if (!FRAME_TYPES.includes(f.type) || f.type === 'overhead' || fabricCat(f.fabric) !== 'neg') continue;
    const [a] = frameDims(f.size), c = Math.cos(rad(f.rot || 0)), s = Math.sin(rad(f.rot || 0));
    out.push([f.x + s * a / 2, f.y - c * a / 2, f.x - s * a / 2, f.y + c * a / 2]);
  }
  return out;
}
function segDist(x, y, s) {
  const dx = s[2] - s[0], dy = s[3] - s[1], L2 = dx * dx + dy * dy || 1, t = clamp(((x - s[0]) * dx + (y - s[1]) * dy) / L2, 0, 1);
  return Math.hypot(x - s[0] - dx * t, y - s[1] - dy * t);
}
function castRay(x, y, ax, ay, r, segs) {
  let best = r;
  for (const [x1, y1, x2, y2] of segs) {
    const sx = x2 - x1, sy = y2 - y1, den = ax * sy - ay * sx;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((x1 - x) * sy - (y1 - y) * sx) / den, u = ((x1 - x) * ay - (y1 - y) * ax) / den;
    if (t > 1e-4 && u >= 0 && u <= 1 && t < best) best = t;
  }
  return best;
}
function visPath(segs, x, y, dir, ang, r) {
  const near = segs.filter(s => segDist(x, y, s) < r);
  if (!near.length) return wedge(x, y, dir, ang, r);
  const full = ang >= 359, a0 = full ? dir - 180 : dir - ang / 2, a1 = full ? dir + 180 : dir + ang / 2, angs = [];
  for (let a = a0; a < a1; a += 2) angs.push(a);
  angs.push(a1);
  for (const s of near) for (const [px, py] of [[s[0], s[1]], [s[2], s[3]]]) {
    if (Math.hypot(px - x, py - y) > r) continue;
    const a = deg(Math.atan2(py - y, px - x));
    for (const d of [-.04, .04]) { let b = a + d; while (b < a0) b += 360; while (b > a0 + 360) b -= 360; if (b <= a1) angs.push(b); }
  }
  angs.sort((p, q) => p - q);
  const pts = angs.map(a => { const ax = Math.cos(rad(a)), ay = Math.sin(rad(a)), t = castRay(x, y, ax, ay, r, near); return (x + ax * t).toFixed(3) + ' ' + (y + ay * t).toFixed(3); });
  return (full ? 'M' : `M${x} ${y}L`) + pts.join('L') + 'Z';
}

function pill(x, y, s, size, bg, fg) {
  s = String(s); const w = s.length * size * .56 + size * 1.1, h = size * 1.7;
  return `<rect x="${(x - w / 2).toFixed(3)}" y="${(y - h / 2).toFixed(3)}" width="${w.toFixed(3)}" height="${h.toFixed(3)}" rx="${(h / 2).toFixed(3)}" fill="${bg}"/><text x="${x.toFixed(3)}" y="${(y + size * .36).toFixed(3)}" font-size="${size}" font-family="${FONT}" text-anchor="middle" fill="${fg}" font-weight="500">${esc(s)}</text>`;
}
function planSVG(sc, o) {
  applyAims(sc);
  const p = sc.plan, px = o.px, edit = !!o.edit;
  let defs = PEN_COLORS.map(c => `<marker id="ar${c.slice(1)}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('');
  let out = '';
  if (o.grid) {
    const g = o.grid;
    defs += `<pattern id="gm" width=".5" height=".5" patternUnits="userSpaceOnUse"><path d="M.5 0H0V.5" fill="none" stroke="#e9e5dc" stroke-width="${px}"/></pattern><pattern id="gM" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="url(#gm)"/><path d="M1 0H0V1" fill="none" stroke="#dcd7cb" stroke-width="${px * 1.3}"/></pattern>`;
    out += `<rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="url(#gM)"/>`;
  }
  if (p.bg && !o.noBg) {
    const src = (o.photos || S.proj?.photos || {})[p.bg.ph];
    if (src) out += `<image href="${src}" x="${p.bg.x}" y="${p.bg.y}" width="${p.bg.w}" height="${p.bg.h}" opacity="${p.bg.op ?? .6}" preserveAspectRatio="none"/>`;
  }
  // light & camera cones (blocked by walls, through openings)
  let cones = '';
  const segs = occluders(p);
  for (const it of p.items) {
    if (it.off) continue;
    if (it.cat === 'light' || (it.type === 'window' && it.sun)) {
      const c = it.type === 'window' ? kColor(it.k) : lightColor(it), dim = (it.dim ?? 100) / 100, r = +it.reach || 3;
      defs += `<radialGradient id="lg${it.id}" gradientUnits="userSpaceOnUse" cx="${it.x}" cy="${it.y}" r="${r}"><stop offset="0" stop-color="${c}" stop-opacity="${(.62 * dim).toFixed(2)}"/><stop offset=".55" stop-color="${c}" stop-opacity="${(.3 * dim).toFixed(2)}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
      cones += `<path d="${visPath(segs, it.x, it.y, it.rot || 0, +it.beam || 60, r)}" fill="url(#lg${it.id})"/>`;
    } else if (it.type === 'camera') {
      const on = o.activeCam ? o.activeCam === it.id : true, r = +it.reach || 4, c = it.color || CAM_COLORS[0];
      cones += `<path d="${visPath(segs, it.x, it.y, it.rot || 0, hfov(it), r)}" fill="${c}" fill-opacity="${on ? (o.activeCam ? .16 : .08) : .03}" stroke="${c}" stroke-opacity="${on ? .75 : .2}" stroke-width="${Math.max(.012, px * 1.3)}" stroke-dasharray="${on && o.activeCam ? 'none' : '.08 .06'}"/>`;
    }
  }
  out += cones;
  // walls
  const block = (o.wallStyle || S.proj?.wallStyle) === 'block';
  for (const w of p.walls) {
    const t = w.t || .12;
    if (block) out += `<line x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="#6A6866" stroke-width="${t * .8}" stroke-linecap="square"/><line x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="${PAPER}" stroke-width="${t * .4}" stroke-dasharray=".32 .05"/>`;
    else out += `<line x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="${INK}" stroke-width="${Math.min(t, .06)}" stroke-linecap="round"/>`;
  }
  // items
  for (const it of p.items) {
    const def = LIBMAP[it.type]; if (!def) continue;
    const hitR = Math.max(itemR(it), 20 * px);
    let hit = '';
    if (edit) {
      if (FRAME_TYPES.includes(it.type)) { const [a, b2] = frameDims(it.size), tw = it.type === 'overhead' ? b2 : Math.max(.3, 28 * px); hit = `<rect x="${-tw / 2}" y="${-a / 2}" width="${tw}" height="${a}" fill="transparent"/>`; }
      else hit = `<circle r="${hitR / (it.s || 1)}" fill="transparent"/>`;
    }
    out += `<g data-id="${it.id}" transform="translate(${it.x} ${it.y}) rotate(${it.rot || 0}) scale(${it.s || 1})">${hit}${SHAPES[it.type](it)}</g>`;
  }
  // drawings
  for (const d of p.draws) {
    if (d.type === 'text') { out += `<g data-draw="${d.id}">${txt(d.pts[0][0], d.pts[0][1], d.text, .26 * (d.s || 1), `fill="${d.color || INK}" font-weight="600"`)}</g>`; continue; }
    if (d.type === 'dim') {
      const [a, b] = d.pts, len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const nx = -Math.sin(ang) * .08, ny = Math.cos(ang) * .08, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      let ta = deg(ang); if (ta > 90 || ta < -90) ta += 180;
      out += `<g data-draw="${d.id}"><path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}M${a[0] + nx} ${a[1] + ny}L${a[0] - nx} ${a[1] - ny}M${b[0] + nx} ${b[1] + ny}L${b[0] - nx} ${b[1] - ny}" stroke="#6b6860" stroke-width=".02" stroke-dasharray=".07 .04"/>${txt(mx, my - .06, len.toFixed(2) + ' m', .2, `transform="rotate(${ta.toFixed(1)} ${mx} ${my})" fill="#55524b" font-weight="600"`)}</g>`;
      continue;
    }
    const c = d.color || PEN_COLORS[0];
    out += `<g data-draw="${d.id}"><path d="${smoothPath(d.pts)}" fill="none" stroke="transparent" stroke-width="${Math.max(.2, 22 * px)}"/><path d="${smoothPath(d.pts)}" fill="none" stroke="${c}" stroke-width="${d.type === 'arrow' ? .045 : .03}" stroke-linecap="round" stroke-linejoin="round" ${d.type === 'arrow' ? `marker-end="url(#ar${c.slice(1)})"` : ''}/></g>`;
  }
  // labels: DP diagram style (role, model in a dark pill, then K · W), placed so they don't overlap
  if (o.labels) out += placeLabels(p, px);
  // edit overlays: selection + previews
  if (edit) {
    const ac = '#7B5CE0', sw = 2 * px;
    const s = S.sel && findSel();
    if (s && S.sel.t === 'item') {
      const r = itemR(s) + .12, hr = r + .32, a = rad(s.rot || 0);
      const hx = s.x + Math.cos(a) * hr, hy = s.y + Math.sin(a) * hr;
      out += `<circle cx="${s.x}" cy="${s.y}" r="${r}" fill="none" stroke="${ac}" stroke-width="${sw}" stroke-dasharray="${6 * px} ${4 * px}"/>`;
      out += `<line x1="${s.x + Math.cos(a) * r}" y1="${s.y + Math.sin(a) * r}" x2="${hx}" y2="${hy}" stroke="${ac}" stroke-width="${sw}"/>`;
      out += `<circle data-handle="rot" cx="${hx}" cy="${hy}" r="${11 * px}" fill="#fff" stroke="${ac}" stroke-width="${sw * 1.2}"/><circle data-handle="rot" cx="${hx}" cy="${hy}" r="${22 * px}" fill="transparent"/>`;
    } else if (s && S.sel.t === 'wall') {
      const mx = (s.a[0] + s.b[0]) / 2, my = (s.a[1] + s.b[1]) / 2;
      out += `<line x1="${s.a[0]}" y1="${s.a[1]}" x2="${s.b[0]}" y2="${s.b[1]}" stroke="${ac}" stroke-width="${(s.t || .12) + 4 * px}" stroke-opacity=".45" stroke-linecap="square"/>`;
      for (const k of ['a', 'b']) out += `<circle data-handle="w${k}" cx="${s[k][0]}" cy="${s[k][1]}" r="${10 * px}" fill="#fff" stroke="${ac}" stroke-width="${sw}"/><circle data-handle="w${k}" cx="${s[k][0]}" cy="${s[k][1]}" r="${22 * px}" fill="transparent"/>`;
      out += txt(mx, my - .2, Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]).toFixed(2) + ' m', 15 * px, `fill="${ac}" font-weight="700"`);
    } else if (s && S.sel.t === 'draw') {
      const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]), pad = .15;
      out += `<rect x="${Math.min(...xs) - pad}" y="${Math.min(...ys) - pad - (s.type === 'text' ? .2 : 0)}" width="${Math.max(...xs) - Math.min(...xs) + pad * 2}" height="${Math.max(...ys) - Math.min(...ys) + pad * 2 + (s.type === 'text' ? .2 : 0)}" fill="none" stroke="${ac}" stroke-width="${sw}" stroke-dasharray="${6 * px} ${4 * px}" rx="${6 * px}"/>`;
    }
    for (const w of p.walls) out += `<line data-wall="${w.id}" x1="${w.a[0]}" y1="${w.a[1]}" x2="${w.b[0]}" y2="${w.b[1]}" stroke="transparent" stroke-width="${Math.max(w.t || .12, 22 * px)}"/>`;
    const pv = S.preview;
    if (pv) {
      if (pv.type === 'wall' || pv.type === 'calib' || pv.type === 'dim') {
        const c = pv.type === 'calib' ? '#2f7cf6' : pv.type === 'dim' ? '#6b6860' : INK;
        const len = Math.hypot(pv.b[0] - pv.a[0], pv.b[1] - pv.a[1]);
        out += `<line x1="${pv.a[0]}" y1="${pv.a[1]}" x2="${pv.b[0]}" y2="${pv.b[1]}" stroke="${c}" stroke-width="${pv.type === 'wall' ? .12 : 3 * px}" stroke-opacity="${pv.type === 'wall' ? .55 : 1}" stroke-linecap="square"/>`;
        out += `<circle cx="${pv.a[0]}" cy="${pv.a[1]}" r="${5 * px}" fill="${ac}"/><circle cx="${pv.b[0]}" cy="${pv.b[1]}" r="${5 * px}" fill="${ac}"/>`;
        out += txt((pv.a[0] + pv.b[0]) / 2, (pv.a[1] + pv.b[1]) / 2 - 16 * px, len.toFixed(2) + ' m', 15 * px, `fill="${ac}" font-weight="700"`);
      } else if (pv.type === 'stroke' && pv.pts.length > 1) {
        out += `<path d="${smoothPath(pv.pts)}" fill="none" stroke="${pv.color}" stroke-width="${pv.arrow ? .045 : .03}" stroke-linecap="round" ${pv.arrow ? `marker-end="url(#ar${pv.color.slice(1)})"` : ''}/>`;
      }
      if (pv.snapPt) {
        out += `<circle cx="${pv.snapPt[0]}" cy="${pv.snapPt[1]}" r="${16 * px}" fill="#E5D6FF" fill-opacity=".55" stroke="${ac}" stroke-width="${sw}"/><circle cx="${pv.snapPt[0]}" cy="${pv.snapPt[1]}" r="${4 * px}" fill="${ac}"/>`;
        if (pv.snapKind) out += txt(pv.snapPt[0], pv.snapPt[1] - 26 * px, pv.snapKind, 13 * px, `fill="${ac}" font-weight="700"`);
      }
      if (pv.type === 'wall' && pv.ang != null) out += txt(pv.b[0] + 18 * px, pv.b[1] + 30 * px, pv.ang + '°', 12 * px, 'fill="#5b5a55" font-weight="600"');
    }
  }
  return `<defs>${defs}</defs>` + out;
}


// ---------- label layout: try below / above / right / left of each item, keep the spot with least overlap ----------
const LW = (s, size) => String(s).length * size * .56;
function labelLines(it) {
  const def = LIBMAP[it.type]; if (!def) return null;
  if (S.labelMode !== 'full') {
    const dot = it.cat === 'light' ? lightColor(it) : null;
    if (it.cat === 'light') return [{ t: `${it.label ? it.label + ' ' : ''}${kText(it)}`, size: .15, h: .29, kind: 'pill', bg: '#2B2B2E', fg: '#fff', dot }];
    if (it.type === 'camera') return [{ t: `${it.label || 'Cam'} ${it.lens || 35}`, size: .15, h: .29, kind: 'pill', bg: it.color || '#2B2B2E', fg: '#fff' }];
    if (FRAME_TYPES.includes(it.type)) return [{ t: it.size, size: .13, h: .19, kind: 'txt', extra: `fill="${FABRIC_STYLE[fabricCat(it.fabric)][2]}" font-weight="600"` }];
    if (it.cat === 'person' && it.label) return [{ t: it.label, size: .15, h: .21, kind: 'txt', extra: 'font-weight="600"' }];
    return null;
  }
  if (it.cat === 'light') {
    const L = [];
    if (it.label) L.push({ t: it.label, size: .15, h: .2, kind: 'txt', extra: 'fill="#5b5a55" font-weight="500"' });
    L.push({ t: it.model || def.name, size: .15, h: .29, kind: 'pill', bg: '#2B2B2E', fg: '#fff' });
    L.push({ t: `${kText(it)} · ${it.watt || 0}W${(it.dim ?? 100) < 100 ? ' · ' + it.dim + '%' : ''}${it.gel && it.gel !== '—' ? ' · ' + it.gel : ''}`, size: .13, h: .18, kind: 'txt', extra: 'fill="#5b5a55"' });
    return L;
  }
  if (it.type === 'camera') return [{ t: `${it.label || 'Cam'}${it.body ? ' · ' + it.body : ''} · ${it.lens || 35}mm`, size: .15, h: .29, kind: 'pill', bg: it.color || '#E5D6FF', fg: '#fff' }];
  if (FRAME_TYPES.includes(it.type)) return [{ t: `${it.label ? it.label + ' · ' : ''}${it.size} · ${it.fabric}`, size: .14, h: .2, kind: 'txt', extra: `fill="${FABRIC_STYLE[fabricCat(it.fabric)][2]}" font-weight="600"` }];
  if (it.cat === 'person' || it.label) return [{ t: itemName(it), size: .17, h: .23, kind: 'txt', extra: 'font-weight="600"' }];
  return null;
}
function placeLabels(p, px) {
  const placed = [], obst = [];
  const ov = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  for (const it of p.items) {
    if (it.type === 'overhead' || it.type === 'hazer') continue;
    const r = it.cat === 'set' && !BACK[it.type] ? itemR(it) * .7 : itemR(it) * .85;
    obst.push({ id: it.id, x0: it.x - r, x1: it.x + r, y0: it.y - r, y1: it.y + r });
  }
  for (const w of p.walls) {
    const t = (w.t || .12) / 2 + .02;
    obst.push({ id: 'w', x0: Math.min(w.a[0], w.b[0]) - t, x1: Math.max(w.a[0], w.b[0]) + t, y0: Math.min(w.a[1], w.b[1]) - t, y1: Math.max(w.a[1], w.b[1]) + t, wall: 1 });
  }
  for (const d of p.draws) {
    if (d.type === 'dim') { const [a, b] = d.pts, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; obst.push({ id: 'd', x0: mx - .5, x1: mx + .5, y0: my - .3, y1: my + .08 }); }
    else if (d.type === 'text') { const sz = .26 * (d.s || 1), w = LW(d.text, sz) / 2; obst.push({ id: 'd', x0: d.pts[0][0] - w, x1: d.pts[0][0] + w, y0: d.pts[0][1] - sz, y1: d.pts[0][1] + sz * .3 }); }
  }
  let out = '';
  Object.defineProperty(p, '_labels', { value: placed, writable: true, configurable: true, enumerable: false });
  for (const it of p.items) {
    const L = labelLines(it); if (!L) continue;
    const w = Math.max(...L.map(l => LW(l.t, l.size) + (l.kind === 'pill' ? l.size * 1.1 : 0) + (l.dot ? .22 : 0))) + .06, h = L.reduce((s, l) => s + l.h, 0);
    const r = itemR(it), g = .1;
    const cands = [
      [it.x - w / 2, it.y + r + g], [it.x - w / 2, it.y - r - g - h], [it.x + r + g, it.y - h / 2], [it.x - r - g - w, it.y - h / 2],
      [it.x - w / 2, it.y + r + g + .45], [it.x - w / 2, it.y - r - g - h - .45], [it.x + r + g + .4, it.y - h / 2], [it.x - r - g - w - .4, it.y - h / 2],
      [it.x + r * .7 + g, it.y + r * .7 + g], [it.x - r * .7 - g - w, it.y + r * .7 + g], [it.x + r * .7 + g, it.y - r * .7 - g - h], [it.x - r * .7 - g - w, it.y - r * .7 - g - h],
    ];
    let best = null;
    cands.forEach(([x0, y0], i) => {
      const R = { x0, y0, x1: x0 + w, y1: y0 + h };
      let sc = i * .015 + (i >= 4 ? .03 : 0);
      for (const q of placed) sc += ov(R, q) * 6;
      for (const q of obst) if (q.id !== it.id) sc += ov(R, q) * (q.wall ? .25 : 2);
      if (!best || sc < best.sc) best = { sc, R, i };
    });
    const R = best.R;
    placed.push(R);
    if (best.i >= 4 || best.i === 1 && false) {
      // displaced label: draw a leader back to the item
      const cx = clamp(it.x, R.x0, R.x1), cy = clamp(it.y, R.y0, R.y1), d = Math.hypot(cx - it.x, cy - it.y) || 1;
      out += `<path d="M${(it.x + (cx - it.x) / d * r).toFixed(3)} ${(it.y + (cy - it.y) / d * r).toFixed(3)}L${cx.toFixed(3)} ${cy.toFixed(3)}" stroke="#9a968e" stroke-width="${Math.max(.01, px)}"/>`;
    }
    let y = R.y0, cx = (R.x0 + R.x1) / 2;
    for (const l of L) {
      if (l.kind === 'pill') { out += pill(cx, y + l.h / 2, l.t, l.size, l.bg, l.fg); if (l.dot) out += `<circle cx="${(cx - (LW(l.t, l.size) + l.size * 1.1) / 2 - .05).toFixed(3)}" cy="${(y + l.h / 2).toFixed(3)}" r="${(l.size * .42).toFixed(3)}" fill="${l.dot}" stroke="#fff" stroke-width="${(l.size * .12).toFixed(3)}"/>`; }
      else out += txt(cx, y + l.size * .95, l.t, l.size, l.extra);
      y += l.h;
    }
  }
  return out;
}

function sceneBBox(sc, pad = .6) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y, r = 0) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
  const p = sc.plan;
  p.walls.forEach(w => { add(...w.a, .1); add(...w.b, .1); });
  p.items.forEach(it => {
    add(it.x, it.y, itemR(it) + .5);
  });
  p.draws.forEach(d => d.pts.forEach(pt => add(pt[0], pt[1], .3)));
  (p._labels || []).forEach(R => { add(R.x0, R.y0); add(R.x1, R.y1); });
  if (p.bg) { add(p.bg.x, p.bg.y); add(p.bg.x + p.bg.w, p.bg.y + p.bg.h); }
  if (!isFinite(x0)) return { x: -3, y: -2.5, w: 6, h: 5 };
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  const w = Math.max(3, x1 - x0), h = Math.max(2.5, y1 - y0);
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}


// ---------- device layout: iPad + iPhone Duo poses. Regular iPhones get no class and keep the phone layout ----------
function layoutCalc() {
  const w = innerWidth, h = innerHeight, c = document.documentElement.classList, sw = Math.min(screen.width, screen.height), sh = Math.max(screen.width, screen.height);
  // Every screen 600px+ wide (iPad, Duo inner screen, either orientation) and phones held sideways get the
  // full-screen plan with floating popover + panel. Phones upright keep the bottom sheet; the Duo outer screen splits top/bottom.
  const short = h < 520 && w > h;                                   // phone in landscape
  const outer = !short && w >= 440 && w < 600 && h <= 760;         // Duo outer screen: wide but short
  const flt = !outer && (w >= 600 || short);
  const book = flt && w >= 820 && w < 1100 && w > h && !short;     // Duo opened flat in landscape (home screen uses two halves)
  const big = flt && w >= 1100;
  const prev = c.value;
  c.toggle('float-ui', flt); c.toggle('lay-short', short);
  c.toggle('lay-book', book); c.toggle('lay-lap', outer); c.toggle('lay-fold', false); c.toggle('lay-outer', outer); c.toggle('lay-big', big);
  const top = document.querySelector('.ed-top');
  if (top && top.offsetHeight) document.documentElement.style.setProperty('--topH', top.offsetHeight + 'px');
  return prev !== c.value;
}
layoutCalc();
let layT = null;
addEventListener('resize', () => { clearTimeout(layT); layT = setTimeout(() => { if (layoutCalc() && S.scene) requestAnimationFrame(() => fitView()); }, 150); });
const isFloat = () => document.documentElement.classList.contains('float-ui');
// small popover instead of the big form: floating layouts and phones held upright
const quickMode = () => isFloat() || (innerWidth <= 820 && !document.documentElement.matches('.lay-lap,.float-ui'));
const overlayPanel = () => innerWidth <= 820 && !document.documentElement.matches('.lay-lap,.float-ui');

// ---------- editor render ----------
const svg = $('#plan'), stage = $('#stage');
let rafPending = false;
function render() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; renderNow(); });
}
function renderNow() {
  if (!S.scene) return;
  const { x, y, z } = S.view, W = stage.clientWidth, H = stage.clientHeight;
  const grid = { x: -x / z - 1, y: -y / z - 1, w: W / z + 2, h: H / z + 2 };
  grid.x = Math.floor(grid.x); grid.y = Math.floor(grid.y);
  const activeCam = S.activeShot ? S.scene.shots.find(s => s.id === S.activeShot)?.cam : null;
  svg.innerHTML = `<g transform="translate(${x} ${y}) scale(${z})">${planSVG(S.scene, { edit: true, px: 1 / z, grid, labels: S.labels, activeCam })}</g>`;
  placeQuick();
}
function fitView(sc = S.scene) {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H) return;
  const narrow = overlayPanel(), horizTools = document.documentElement.matches('.lay-lap,.lay-short');
  const tw = $('#tools')?.offsetWidth || 50, padL = document.documentElement.matches('.lay-short') ? (panel.classList.contains('min') ? panel.offsetWidth + 30 : 20) : horizTools ? 20 : tw + 24, padB = narrow ? 70 : horizTools ? 76 : isFloat() ? 70 : 20, padT = document.documentElement.matches('.lay-short') ? 14 : isFloat() ? Math.max(56, (panel.classList.contains('min') ? panel.getBoundingClientRect().bottom - stage.getBoundingClientRect().top : 0) + 16) : 56;
  if (!sc.plan._labels && S.labels) planSVG(sc, { px: .02, labels: true });
  const bb = sceneBBox(sc, .3);
  const z = clamp(Math.min((W - padL - 20) / bb.w, (H - padT - padB) / bb.h), 10, 400);
  S.view = { z, x: padL + (W - padL - 20) / 2 - (bb.x + bb.w / 2) * z, y: padT + (H - padT - padB) / 2 - (bb.y + bb.h / 2) * z };
  render();
}
function zoomAt(f, cx, cy) {
  const v = S.view, nz = clamp(v.z * f, 8, 600);
  v.x = cx - (cx - v.x) * nz / v.z; v.y = cy - (cy - v.y) * nz / v.z; v.z = nz;
  render();
}
function viewCenter() {
  const W = stage.clientWidth, H = stage.clientHeight * (overlayPanel() ? .42 : .5);
  return [r2((W / 2 - S.view.x) / S.view.z), r2((H - S.view.y) / S.view.z)];
}

// ---------- tools ----------
const IC = {
  select: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  room: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 13h6v7M14 4v6h6"/>',
  wall: '<path d="M4 20L20 4" stroke-width="4"/>',
  arrow: '<path d="M4 18c4-1 6-8 14-11"/><path d="M13 6l5 1-2 5"/>',
  pen: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
  dim: '<path d="M3 15l12-12 6 6L9 21z"/><path d="M7 11l2 2M10 8l2 2M13 5l2 2"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  labels: '<path d="M4 7h16M4 12h10M4 17h13"/>',
  door: '<path d="M6 21V3h10v18M3 21h18M13 12h.5"/>',
  window: '<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/>',
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0012 3z"/>',
  camera: '<path d="M3 10h11v9H3zM14 13l6-3v9l-6-3"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="11.5" cy="6.5" r="2.5"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
};
const TOOLS = [
  { id: 'select', t: 'เลือก' },
  { id: 'room', t: 'ห้องสำเร็จรูป', act: () => openRoom() },
  { id: 'wall', t: 'ผนัง' },
  { id: 'door', t: 'ประตู (แตะบนผนัง)' },
  { id: 'window', t: 'หน้าต่าง (แตะบนผนัง)' },
  { sep: 1 },
  { id: 'light', t: 'ไฟ' },
  { id: 'camera', t: 'กล้อง' },
  { id: 'person', t: 'คน' },
  { id: 'add', t: 'คลังอุปกรณ์ทั้งหมด', act: () => openLibrary() },
  { sep: 1 },
  { id: 'arrow', t: 'ลูกศร' },
  { id: 'dim', t: 'วัดระยะ' },
  { id: 'text', t: 'ข้อความ' },
  { id: 'color', t: 'สีเส้น', act: () => { S.pen = PEN_COLORS[(PEN_COLORS.indexOf(S.pen) + 1) % PEN_COLORS.length]; renderTools(); } },
  { id: 'labels', t: 'ป้าย: ย่อ / เต็ม / ซ่อน', act: () => { const m = ['short', 'full', 'off'], n = m[(m.indexOf(S.labelMode || 'short') + 1) % 3]; S.labelMode = n; S.labels = n !== 'off'; delete S.scene.plan._labels; renderTools(); render(); toast({ short: 'ป้ายแบบย่อ', full: 'ป้ายแบบเต็ม', off: 'ซ่อนป้าย' }[n]); } },
];
const PLACE = { light: 'cob', camera: 'camera', person: 'talent', door: 'door', window: 'window' };
const HINTS = {
  wall: 'ลากเพื่อวาด · ลากกลับจุดเริ่ม = ปิดห้อง',
  door: 'แตะบนเส้นผนัง', window: 'แตะบนเส้นผนัง',
  light: 'แตะเพื่อวาง', camera: 'แตะเพื่อวาง', person: 'แตะเพื่อวาง',
  arrow: 'ลากเส้นการเคลื่อนไหว',
  pen: 'วาดอิสระ',
  dim: 'ลากเพื่อวัด',
  text: 'แตะเพื่อพิมพ์',
  calib: 'ลากเส้นทับระยะที่รู้ความยาวจริงบนภาพ เช่น ความกว้างผนัง',
};
function renderTools() {
  $('#tools').innerHTML = TOOLS.map(t => {
    if (t.sep) return '<div class="tsep"></div>';
    const on = S.tool === t.id;
    const inner = t.id === 'color' ? `<span class="dot" style="background:${S.pen}"></span>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[t.id]}</svg>`;
    return `<button class="tool${on ? ' on' : ''}" data-tool="${t.id}" title="${t.t}" aria-label="${t.t}">${inner}</button>`;
  }).join('');
  $('#hint').textContent = HINTS[S.tool] || '';
  fitTools();
}
function fitTools() {
  const t = $('#tools'), root = document.documentElement;
  if (!t || !stage.clientHeight) return;
  t.classList.remove('two');
  const setW = () => document.documentElement.style.setProperty('--toolsW', (t.offsetLeft + t.offsetWidth + 14) + 'px');
  if (root.matches('.lay-lap,.lay-short') || overlayPanel()) return;
  if (t.scrollHeight > stage.clientHeight - 20) t.classList.add('two');
  setW();
}
new ResizeObserver(() => fitTools()).observe(document.querySelector('#stage'));
$('#tools').addEventListener('click', e => {
  const b = e.target.closest('[data-tool]'); if (!b) return;
  const t = TOOLS.find(x => x.id === b.dataset.tool);
  if (t.act) return t.act();
  setTool(t.id);
});
function setTool(id) { S.tool = id; S.preview = null; renderTools(); render(); }

// ---------- pointer interaction ----------
const ptrs = new Map();
let op = null, pinch = null;
function toWorld(cx, cy) { const r = svg.getBoundingClientRect(); return [(cx - r.left - S.view.x) / S.view.z, (cy - r.top - S.view.y) / S.view.z]; }
function local(cx, cy) { const r = svg.getBoundingClientRect(); return [cx - r.left, cy - r.top]; }
function wallEnds(exclude) { const pts = []; P().walls.forEach(w => { if (w.id !== exclude) pts.push(w.a, w.b); }); return pts; }
const BACK = { chair: .27, armchair: .4, sofa: .45, desk: .35, bed: 1, cabinet: .25, tv: .16, table: .45 };
function wallDegree(p) { return P().walls.reduce((n, w) => n + (Math.hypot(w.a[0] - p[0], w.a[1] - p[1]) < .01 || Math.hypot(w.b[0] - p[0], w.b[1] - p[1]) < .01 ? 1 : 0), 0); }
function nearestOnWall(p, exclude) {
  let best = null;
  for (const w of P().walls) {
    if (w.id === exclude) continue;
    const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], L2 = dx * dx + dy * dy || 1;
    const t = clamp(((p[0] - w.a[0]) * dx + (p[1] - w.a[1]) * dy) / L2, 0, 1);
    const q = [w.a[0] + dx * t, w.a[1] + dy * t], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (!best || d < best.d) best = { w, q, d, t, ang: deg(Math.atan2(dy, dx)) };
  }
  return best;
}
let lastSnapKey = '';
function buzz(key) { if (key && key !== lastSnapKey) { try { navigator.vibrate && navigator.vibrate(8); } catch { } } lastSnapKey = key || ''; }
// Magnet for wall points: endpoints first, then T-junction on a wall, then grid + angle lock
function snapPoint(w, from, exclude) {
  const tol = 16 / S.view.z, M = S.snaps;
  if (M.ends) {
    let best = null, bd = tol;
    for (const p of wallEnds(exclude)) { const d = Math.hypot(p[0] - w[0], p[1] - w[1]); if (d < bd) { bd = d; best = p; } }
    if (best) {
      const closes = from && wallDegree(best) === 1 && wallDegree(from) >= 1 && Math.hypot(best[0] - from[0], best[1] - from[1]) > .05;
      buzz('e' + best);
      return { pt: [best[0], best[1]], snapped: true, kind: closes ? 'ปิดห้อง ✓' : 'ดูดติด' };
    }
    const n = nearestOnWall(w, exclude);
    if (n && n.d < tol * .8 && n.t > .02 && n.t < .98) { buzz('t' + n.w.id); return { pt: [r2(n.q[0]), r2(n.q[1])], snapped: true, kind: 'ต่อผนัง (T)' }; }
  }
  buzz('');
  let p = [Math.round(w[0] * 20) / 20, Math.round(w[1] * 20) / 20];
  if (from && M.angle) {
    const ang = deg(Math.atan2(p[1] - from[1], p[0] - from[0])), len = Math.hypot(p[0] - from[0], p[1] - from[1]);
    const near = Math.round(ang / 45) * 45;
    if (Math.abs(ang - near) < 7) p = [r2(from[0] + Math.cos(rad(near)) * Math.round(len * 20) / 20), r2(from[1] + Math.sin(rad(near)) * Math.round(len * 20) / 20)];
  }
  return { pt: p, snapped: false };
}
// Magnet for items: doors/windows sit in the wall, furniture backs onto it
function magnetItem(it) {
  const M = S.snaps, opening = it.type === 'door' || it.type === 'window';
  if (opening ? !M.openings : !(M.furniture && BACK[it.type])) return null;
  const n = nearestOnWall([it.x, it.y]); if (!n) return null;
  const t = n.w.t || .12;
  if (opening) {
    if (n.d > .45) return null;
    const c1 = normDeg(n.ang - 90), c2 = normDeg(n.ang + 90), cur = normDeg(it.rot || 0);
    const dd = a => Math.min(Math.abs(a - cur), 360 - Math.abs(a - cur));
    // swing towards the side of the wall the finger is on (inside the room); on the line itself keep the current side
    const sx = it.x - n.q[0], sy = it.y - n.q[1], side = a => Math.cos(rad(a)) * sx + Math.sin(rad(a)) * sy;
    it.x = r2(n.q[0]); it.y = r2(n.q[1]);
    it.rot = n.d > .03 ? (side(c1) > side(c2) ? c1 : c2) : (dd(c1) <= dd(c2) ? c1 : c2);
    return { pt: n.q, kind: 'เข้าผนัง' };
  }
  const back = BACK[it.type] * (it.s || 1);
  if (n.d > back + .35 || n.d < .01) return null;
  const nx = (it.x - n.q[0]) / n.d, ny = (it.y - n.q[1]) / n.d;
  it.rot = Math.round(normDeg(deg(Math.atan2(ny, nx))));
  it.x = r2(n.q[0] + nx * (back + t / 2)); it.y = r2(n.q[1] + ny * (back + t / 2));
  return { pt: n.q, kind: 'ชิดผนัง' };
}
function selectThing(sel) {
  const changed = JSON.stringify(sel) !== JSON.stringify(S.sel);
  S.sel = sel;
  if (changed) {
    S.qpos = null; S.qpanFor = null;
    if (!sel) S.fullInspect = false;
    if (sel && quickMode() && sel.t !== 'item') S.fullInspect = true;
    renderPanel();
    if (sel && (!quickMode() || S.fullInspect)) openPanel();
    if (sel && sel.t === 'item' && !S.fullInspect && overlayPanel()) panel.classList.add('min');
    // popover wins when the open floating panel leaves no room beside it
    if (sel && isFloat() && sel.t === 'item' && !S.fullInspect && !panel.classList.contains('min')) {
      const t = $('#tools'), free = stage.clientWidth - (t.offsetLeft + t.offsetWidth) - panel.offsetWidth;
      if (free < 292 + 60) panel.classList.add('min');
    }
  }
  render();
  renderQuick();
}
svg.addEventListener('pointerdown', e => {
  if (e.button > 0) return;
  svg.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    if (op && op.kind === 'stroke') S.preview = null;
    op = null;
    const [a, b] = [...ptrs.values()];
    const m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), m, v: { ...S.view } };
    return;
  }
  if (ptrs.size > 2) return;
  const w = toWorld(e.clientX, e.clientY), t = e.target;
  const start = { cx: e.clientX, cy: e.clientY, w };
  const tool = S.tool;
  if (tool === 'select') {
    const h = t.closest('[data-handle]'), g = t.closest('[data-id]'), wl = t.closest('[data-wall]'), dr = t.closest('[data-draw]');
    if (h) {
      const hd = h.dataset.handle;
      op = hd === 'rot' ? { kind: 'rot', ...start } : { kind: 'wallEnd', end: hd[1], ...start };
    } else if (g) {
      const it = getItem(g.dataset.id);
      selectThing({ t: 'item', id: it.id });
      op = { kind: 'move', off: [w[0] - it.x, w[1] - it.y], ...start };
    } else if (dr) {
      const d = P().draws.find(x => x.id === dr.dataset.draw);
      selectThing({ t: 'draw', id: d.id });
      op = { kind: 'moveDraw', orig: clone(d.pts), ...start };
    } else if (wl) {
      const wa = P().walls.find(x => x.id === wl.dataset.wall);
      selectThing({ t: 'wall', id: wa.id });
      op = { kind: 'moveWall', orig: { a: [...wa.a], b: [...wa.b] }, ...start };
    } else {
      if (S.sel) selectThing(null);
      if (S.activeShot) { S.activeShot = null; renderPanel(); }
      op = { kind: 'pan', v: { ...S.view }, ...start };
    }
  } else if (tool === 'wall' || tool === 'dim' || tool === 'calib') {
    const a = snapPoint(w).pt;
    op = { kind: tool, a, ...start };
    S.preview = { type: tool, a, b: a };
  } else if (tool === 'arrow' || tool === 'pen') {
    op = { kind: 'stroke', ...start };
    S.preview = { type: 'stroke', pts: [w], color: S.pen, arrow: tool === 'arrow' };
  } else if (tool === 'text') {
    op = { kind: 'text', ...start };
  } else if (PLACE[tool]) {
    op = { kind: 'place', ...start };
  }
  render();
});
svg.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), m = local((a.x + b.x) / 2, (a.y + b.y) / 2);
    const z = clamp(pinch.v.z * d / pinch.d, 8, 600);
    const wx = (pinch.m[0] - pinch.v.x) / pinch.v.z, wy = (pinch.m[1] - pinch.v.y) / pinch.v.z;
    S.view = { z, x: m[0] - wx * z, y: m[1] - wy * z };
    render(); return;
  }
  if (!op) return;
  const w = toWorld(e.clientX, e.clientY);
  const moved = Math.hypot(e.clientX - op.cx, e.clientY - op.cy) > 3;
  if (!moved && !op.moved) return;
  const first = !op.moved; op.moved = true;
  const s = findSel();
  switch (op.kind) {
    case 'pan': S.view.x = op.v.x + e.clientX - op.cx; S.view.y = op.v.y + e.clientY - op.cy; break;
    case 'move': {
      if (first) snap();
      s.x = r2(w[0] - op.off[0]); s.y = r2(w[1] - op.off[1]);
      const m = magnetItem(s);
      S.preview = m ? { type: 'none', snapPt: m.pt, snapKind: m.kind } : null;
      buzz(m ? m.kind + s.id : '');
      break;
    }
    case 'rot': {
      if (first) snap();
      delete s.aim;
      let a = deg(Math.atan2(w[1] - s.y, w[0] - s.x));
      const n = Math.round(a / 15) * 15; if (Math.abs(a - n) < 4) a = n;
      s.rot = Math.round(normDeg(a)); break;
    }
    case 'wallEnd': {
      if (first) snap();
      const other = op.end === 'a' ? s.b : s.a, r = snapPoint(w, other, s.id);
      s[op.end] = r.pt; S.preview = r.snapped ? { type: 'none', snapPt: r.pt, snapKind: r.kind } : null; break;
    }
    case 'moveWall': {
      if (first) snap();
      const dx = Math.round((w[0] - op.w[0]) * 20) / 20, dy = Math.round((w[1] - op.w[1]) * 20) / 20;
      s.a = [r2(op.orig.a[0] + dx), r2(op.orig.a[1] + dy)]; s.b = [r2(op.orig.b[0] + dx), r2(op.orig.b[1] + dy)]; break;
    }
    case 'moveDraw': {
      if (first) snap();
      const dx = w[0] - op.w[0], dy = w[1] - op.w[1];
      s.pts = op.orig.map(p => [r2(p[0] + dx), r2(p[1] + dy)]); break;
    }
    case 'wall': case 'dim': case 'calib': {
      const r = snapPoint(w, op.a);
      const ang = Math.round(normDeg(deg(Math.atan2(r.pt[1] - op.a[1], r.pt[0] - op.a[0]))));
      S.preview = { type: op.kind, a: op.a, b: r.pt, snapPt: r.snapped ? r.pt : null, snapKind: r.kind, ang: op.kind === 'wall' ? ang : null }; break;
    }
    case 'stroke': {
      const pts = S.preview.pts, l = pts[pts.length - 1];
      if (Math.hypot(w[0] - l[0], w[1] - l[1]) > 4 / S.view.z) pts.push([r2(w[0]), r2(w[1])]);
      break;
    }
  }
  render();
  if (op.kind === 'move' || op.kind === 'rot') syncInspectorPos();
});
function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (pinch) { if (ptrs.size < 2) pinch = null; op = null; return; }
  if (!op) return;
  const o = op; op = null;
  const pv = S.preview;
  if (o.kind === 'wall' && pv) {
    if (Math.hypot(pv.b[0] - pv.a[0], pv.b[1] - pv.a[1]) >= .1) { snap(); P().walls.push({ id: uid(), a: pv.a, b: pv.b, t: .12 }); save(); if (pv.snapKind === 'ปิดห้อง ✓') toast('ปิดห้องแล้ว'); }
    S.preview = null;
  } else if (o.kind === 'dim' && pv) {
    if (Math.hypot(pv.b[0] - pv.a[0], pv.b[1] - pv.a[1]) >= .1) { snap(); P().draws.push({ id: uid(), type: 'dim', pts: [pv.a, pv.b] }); save(); }
    S.preview = null;
  } else if (o.kind === 'calib' && pv) {
    S.preview = null;
    const len = Math.hypot(pv.b[0] - pv.a[0], pv.b[1] - pv.a[1]);
    setTool('select');
    if (len > .05) calibrate(pv.a, len);
  } else if (o.kind === 'stroke' && pv) {
    if (pv.pts.length > 1) { snap(); P().draws.push({ id: uid(), type: S.tool === 'arrow' ? 'arrow' : 'pen', pts: simplify(pv.pts), color: pv.color }); save(); }
    S.preview = null;
  } else if (o.kind === 'place') {
    const type = PLACE[S.tool], opening = type === 'door' || type === 'window';
    const it = makeItem(type, r2(o.w[0]), r2(o.w[1]));
    if (opening) {
      const n = nearestOnWall([it.x, it.y]);
      if (!n || n.d > 1.2) { toast('แตะบนเส้นผนัง'); render(); return; }
      if (n.d > .4) { it.x = r2(n.q[0] + (it.x - n.q[0]) / n.d * .3); it.y = r2(n.q[1] + (it.y - n.q[1]) / n.d * .3); }
      const keep = S.snaps.openings; S.snaps.openings = true; magnetItem(it); S.snaps.openings = keep;
    }
    if (type === 'talent') { const used = new Set(P().items.filter(i => i.cat === 'person').map(i => i.color)); it.color = PERSON_COLORS.find(c => !used.has(c)) || PERSON_COLORS[0]; it.label = String.fromCharCode(65 + P().items.filter(i => i.cat === 'person').length % 26); }
    snap(); P().items.push(it); save();
    if (!opening) setTool('select');
    selectThing({ t: 'item', id: it.id });
  } else if (o.kind === 'text') {
    const t = prompt('ข้อความบนแปลน');
    if (t && t.trim()) { snap(); const d = { id: uid(), type: 'text', pts: [[r2(o.w[0]), r2(o.w[1])]], text: t.trim(), color: S.pen === PEN_COLORS[0] ? INK : S.pen }; P().draws.push(d); save(); setTool('select'); selectThing({ t: 'draw', id: d.id }); }
  } else if (o.moved && ['move', 'rot', 'wallEnd', 'moveWall', 'moveDraw'].includes(o.kind)) {
    if (o.kind === 'wallEnd' || o.kind === 'move') S.preview = null;
    save(); renderPanel();
  }
  render();
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);
svg.addEventListener('wheel', e => {
  e.preventDefault();
  const [cx, cy] = local(e.clientX, e.clientY);
  if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * .01), cx, cy);
  else if (e.deltaMode === 0 && Math.abs(e.deltaY) < 50 && !Number.isInteger(e.deltaY) || e.shiftKey) { S.view.x -= e.deltaX; S.view.y -= e.deltaY; render(); }
  else zoomAt(Math.exp(-e.deltaY * .0015), cx, cy);
}, { passive: false });
function simplify(pts) {
  const out = [pts[0]];
  for (const p of pts) { const l = out[out.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > .08) out.push(p); }
  const last = pts[pts.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
$('#zoom').addEventListener('click', e => {
  const z = e.target.closest('[data-z]')?.dataset.z; if (!z) return;
  if (z === 'fit') return fitView();
  zoomAt(z === 'in' ? 1.25 : .8, stage.clientWidth / 2, stage.clientHeight / 2);
});
addEventListener('keydown', e => {
  if ($('#editor').hidden || e.target.closest('input,textarea,select') || $('.mback')) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey ? 1 : -1); }
  else if (mod && e.key.toLowerCase() === 'd' && S.sel?.t === 'item') { e.preventDefault(); duplicateSel(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { e.preventDefault(); deleteSel(); }
  else if (e.key === 'Escape') { setTool('select'); selectThing(null); }
  else if (e.key.toLowerCase() === 'r' && S.sel?.t === 'item') { snap(); findSel().rot = normDeg((findSel().rot || 0) + (e.shiftKey ? -15 : 15)); save(); render(); syncInspectorPos(); }
  else if (!mod) { const m = { v: 'select', w: 'wall', a: 'arrow', p: 'pen', m: 'dim', t: 'text' }[e.key.toLowerCase()]; if (m) setTool(m); }
});
new ResizeObserver(() => render()).observe(stage);

function deleteSel() {
  const s = S.sel; if (!s) return;
  snap();
  if (s.t === 'item') {
    P().items = P().items.filter(i => i.id !== s.id);
    S.scene.shots.forEach(sh => { if (sh.cam === s.id) sh.cam = null; });
  } else if (s.t === 'wall') P().walls = P().walls.filter(w => w.id !== s.id);
  else P().draws = P().draws.filter(d => d.id !== s.id);
  S.sel = null; save(); render(); renderPanel();
}
function duplicateSel() {
  const it = findSel(); if (!it || S.sel.t !== 'item') return;
  snap();
  const n = { ...clone(it), id: uid(), x: r2(it.x + .5), y: r2(it.y + .5) };
  if (n.type === 'camera') { n.label = nextCamLabel(S.scene); n.color = CAM_COLORS[cams().length % CAM_COLORS.length]; }
  P().items.push(n); save(); selectThing({ t: 'item', id: n.id });
}


// ---------- quick popover (iPad / Duo): small card next to the selected item, draggable ----------
const ICQ = {
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0012 3z',
  cam: 'M3 10h11v9H3zM14 13l6-3v9l-6-3M4 6.5a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0M9 6.5a2.5 2.5 0 105 0 2.5 2.5 0 10-5 0',
  person: 'M12 11a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', box: 'M4 4h16v16H4z',
  gel: 'M12 3c4 5 6 8 6 11a6 6 0 01-12 0c0-3 2-6 6-11z', beam: 'M4 12l16-7v14z',
  aim: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 100 8 4 4 0 000-8z', more: 'M5 12h.01M12 12h.01M19 12h.01',
  rot: 'M21 12a9 9 0 11-3-6.7M21 4v5h-5', dup: 'M8 8h12v12H8zM4 16V4h12', del: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
};
const qbtn = (act, d, label, on) => `<button type="button" class="qb${on ? ' on' : ''}" data-qa="${act}" aria-label="${label}" title="${label}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg></button>`;
const QGELS = ['—', '¼ CTO', '½ CTO', 'Full CTO', '¼ CTB', '½ CTB', 'Full CTB', 'Deep Blue'];
const QBEAMS = [15, 30, 45, 60, 90, 120];
function renderQuick() {
  const q = $('#qpop'), it = S.sel?.t === 'item' && quickMode() && !S.fullInspect && !(overlayPanel() && !panel.classList.contains('min')) ? findSel() : null;
  if (!it) { q.hidden = true; return; }
  const def = LIBMAP[it.type];
  const head = (ico, color, title, sub, extra = '') => `<div class="qhead" data-qdrag><span class="qico" style="color:${color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ico}"/></svg></span><div class="qt"><b>${esc(title)}</b><small>${esc(sub)}</small></div>${extra}</div>`;
  const tail = `<div class="qrow">${qbtn('rot', ICQ.rot, 'หมุน 90°')}${qbtn('dup', ICQ.dup, 'ทำซ้ำ')}${qbtn('del', ICQ.del, 'ลบ')}${qbtn('more', ICQ.more, 'รายละเอียดทั้งหมด')}</div>`;
  let h = '';
  if (it.cat === 'light') {
    const kv = it.mode === 'rgb' ? 'RGB' : effK(it);
    h = head(ICQ.bulb, lightColor(it), it.label || def.name, it.model || def.name, `<label class="qsw" title="เปิด / ปิด"><input type="checkbox" data-q="on"${it.off ? '' : ' checked'} aria-label="เปิดไฟ"><i></i></label>`)
      + `<div class="qbig"><span data-qo="k">${kv}</span>${it.mode === 'rgb' ? '' : '<small>K</small>'}<span class="sp"></span><em data-qo="dim">${it.dim ?? 100}%</em></div>`
      + (it.mode === 'bicolor' ? `<input class="qk" type="range" min="2700" max="6500" step="100" value="${it.k}" data-q="k" aria-label="อุณหภูมิสี">` : it.mode === 'rgb' ? `<input class="qcol" type="color" value="${it.color || '#ff7a1a'}" data-q="color" aria-label="สี">` : '')
      + `<input class="qd" type="range" min="0" max="100" value="${it.dim ?? 100}" data-q="dim" aria-label="Dimmer">`
      + `<div class="qrow">${qbtn('gel', ICQ.gel, 'เจล: ' + (it.gel || '—'), it.gel && it.gel !== '—')}${it.beam < 359 ? qbtn('beam', ICQ.beam, 'มุมลำแสง ' + it.beam + '°') : ''}${qbtn('aim', ICQ.aim, it.aim ? 'เลิกเล็ง' : 'เล็งไปที่คนใกล้สุด', !!it.aim)}${qbtn('more', ICQ.more, 'รายละเอียดทั้งหมด')}</div>`
      + `<div class="qrow">${qbtn('rot', ICQ.rot, 'หมุน 90°')}${qbtn('dup', ICQ.dup, 'ทำซ้ำ')}${qbtn('del', ICQ.del, 'ลบ')}</div>`;
  } else if (it.type === 'camera') {
    h = head(ICQ.cam, it.color, it.label || 'Cam', it.body || 'กล้อง', `<span class="qfov">FOV ${hfov(it).toFixed(0)}°</span>`)
      + `<div class="qchips">${[18, 24, 35, 50, 85, 135].map(l => `<button type="button" data-ql="${l}" class="${+it.lens === l ? 'on' : ''}">${l}</button>`).join('')}</div>`
      + `<div class="qrow">${qbtn('aim', ICQ.aim, it.aim ? 'เลิกเล็ง' : 'เล็งไปที่คนใกล้สุด', !!it.aim)}${qbtn('shot', 'M12 5v14M5 12h14', 'เพิ่มช็อตจากกล้องนี้')}${qbtn('rot', ICQ.rot, 'หมุน 90°')}${qbtn('more', ICQ.more, 'รายละเอียดทั้งหมด')}</div>`
      + `<div class="qrow">${qbtn('dup', ICQ.dup, 'ทำซ้ำ')}${qbtn('del', ICQ.del, 'ลบ')}</div>`;
  } else if (it.cat === 'person') {
    h = head(ICQ.person, it.color === '#FFFFFF' ? '#2B2B2E' : it.color, it.label || 'คน', def.name)
      + `<div class="swgrid">${PERSON_COLORS.map(c => `<button type="button" data-qc="${c}" class="${c === it.color ? 'on' : ''}" style="background:${c}" aria-label="สี ${c}"></button>`).join('')}</div>` + tail;
  } else if (FRAME_TYPES.includes(it.type)) {
    h = head(ICQ.box, FABRIC_STYLE[fabricCat(it.fabric)][2], it.size + ' · ' + it.fabric, def.name)
      + `<div class="qchips">${['4×4', '6×6', '8×8', '12×12', '20×20'].map(z => `<button type="button" data-qs="${z}" class="${it.size === z ? 'on' : ''}">${z}</button>`).join('')}</div>` + tail;
  } else {
    h = head(ICQ.box, '#2B2B2E', itemName(it), def.name) + tail;
  }
  q.innerHTML = h;
  q.hidden = false;
  let snapped = false;
  const once = () => { if (!snapped) { snap(); snapped = true; } };
  $$('[data-q]', q).forEach(el => {
    el.addEventListener('pointerdown', once);
    el.addEventListener('change', () => { snapped = false; });
    el.addEventListener('input', () => {
      once();
      const k = el.dataset.q;
      if (k === 'on') it.off = !el.checked; else if (k === 'color') it.color = el.value; else it[k] = +el.value;
      const ok = $('[data-qo="k"]', q); if (ok && it.mode !== 'rgb') ok.textContent = effK(it);
      const od = $('[data-qo="dim"]', q); if (od) od.textContent = (it.dim ?? 100) + '%';
      $('.qico', q).style.color = lightColor(it);
      save(); render();
    });
  });
  $$('[data-ql]', q).forEach(b => b.onclick = () => { snap(); it.lens = +b.dataset.ql; save(); render(); renderQuick(); });
  $$('[data-qc]', q).forEach(b => b.onclick = () => { snap(); it.color = b.dataset.qc; save(); render(); renderQuick(); });
  $$('[data-qs]', q).forEach(b => b.onclick = () => { snap(); it.size = b.dataset.qs; save(); render(); renderQuick(); });
  $$('[data-qa]', q).forEach(b => b.onclick = () => {
    const a = b.dataset.qa;
    if (a === 'del') return deleteSel();
    if (a === 'dup') return duplicateSel();
    if (a === 'more') { S.fullInspect = true; renderQuick(); renderPanel(); openPanel(); return; }
    if (a === 'shot') return addShot(it.id);
    snap();
    if (a === 'rot') { it.rot = normDeg((it.rot || 0) + 90); delete it.aim; }
    if (a === 'gel') { it.gel = QGELS[(QGELS.indexOf(it.gel || '—') + 1) % QGELS.length]; toast('เจล: ' + it.gel); }
    if (a === 'beam') { const i = QBEAMS.findIndex(v => v >= it.beam); it.beam = QBEAMS[(i + 1) % QBEAMS.length]; toast('มุมลำแสง ' + it.beam + '°'); }
    if (a === 'aim') {
      if (it.aim) delete it.aim;
      else { const ps = P().items.filter(x => x.cat === 'person'); const t = ps.sort((p1, p2) => Math.hypot(p1.x - it.x, p1.y - it.y) - Math.hypot(p2.x - it.x, p2.y - it.y))[0]; if (t) { it.aim = t.id; toast('เล็งไปที่ ' + itemName(t)); } else toast('ยังไม่มีคนบนแปลน'); }
    }
    save(); render(); renderQuick();
  });
  placeQuick();
}
function placeQuick() {
  const q = $('#qpop'); if (!q || q.hidden) return;
  const it = findSel(); if (!it) { q.hidden = true; return; }
  const W = stage.clientWidth, H = stage.clientHeight, w = q.offsetWidth, h = q.offsetHeight;
  let x, y;
  if (S.qpos) [x, y] = S.qpos;
  else {
    const sx = S.view.x + it.x * S.view.z, sy = S.view.y + it.y * S.view.z, gap = itemR(it) * S.view.z + 26;
    x = sx + gap + w < W - 10 ? sx + gap : sx - gap - w;
    y = sy - h / 2;
  }
  const tl = $('#tools'), minX = (isFloat() || overlayPanel()) && !document.documentElement.matches('.lay-short') ? tl.offsetLeft + tl.offsetWidth + 10 : 10;
  if (overlayPanel()) {
    // phone upright: dock above the tab bar, right of the toolbar
    q.style.width = Math.min(300, W - minX - 10) + 'px';
    q.style.left = minX + 'px';
    const top = Math.max(10, H - panel.offsetHeight - q.offsetHeight - 12);
    q.style.top = top + 'px';
    // keep the selected item visible above the docked popover (once per selection)
    if (S.qpanFor !== it.id) {
      S.qpanFor = it.id;
      const sy = S.view.y + it.y * S.view.z, r = itemR(it) * S.view.z;
      if (sy + r > top - 16) { S.view.y -= sy - Math.max(100, top * .55); render(); }
    }
    return;
  }
  if (!S.qpos && (!panel.classList.contains('min') || document.documentElement.matches('.lay-short'))) {
    // keep clear of the open floating panel: try left of it, else above / below the item
    const pr = panel.getBoundingClientRect(), sr = stage.getBoundingClientRect(), pl = pr.left - sr.left, pt = pr.top - sr.top, pb = pr.bottom - sr.top;
    const hits = (x1, y1) => x1 + w > pl - 10 && y1 < pb && y1 + h > pt;
    if (hits(x, y)) {
      const sx = S.view.x + it.x * S.view.z, sy = S.view.y + it.y * S.view.z, gap = itemR(it) * S.view.z + 20;
      const prr = pr.right - sr.left;
      if (pl - w - 14 >= minX) x = pl - w - 14;
      else if (prr + 14 + w <= W - 10) x = prr + 14;
      else if (sy - gap - h >= 10) { x = Math.min(sx - w / 2, pl - w - 14); y = sy - gap - h; }
      else { x = Math.min(sx - w / 2, pl - w - 14); y = sy + gap; }
    }
  }
  q.style.left = clamp(x, minX, Math.max(minX, W - w - 10)) + 'px';
  q.style.top = clamp(y, 10, Math.max(10, H - h - (isFloat() ? 70 : 10))) + 'px';
}
// drag a floating window by its handle
function dragBy(el, handleSel, store) {
  el.addEventListener('pointerdown', e => {
    const hnd = e.target.closest(handleSel); if (!hnd || e.target.closest('button,input,label')) return;
    e.preventDefault();
    const r = el.getBoundingClientRect(), pr = el.offsetParent?.getBoundingClientRect() || { left: 0, top: 0 }, ox = e.clientX - r.left, oy = e.clientY - r.top;
    hnd.setPointerCapture(e.pointerId);
    const mv = ev => { const x = ev.clientX - ox - pr.left, y = ev.clientY - oy - pr.top; store([x, y]); };
    const up = () => { hnd.removeEventListener('pointermove', mv); hnd.removeEventListener('pointerup', up); hnd.removeEventListener('pointercancel', up); };
    hnd.addEventListener('pointermove', mv); hnd.addEventListener('pointerup', up); hnd.addEventListener('pointercancel', up);
  });
}
dragBy($('#qpop'), '[data-qdrag]', p => { S.qpos = p; placeQuick(); });
dragBy($('#panel'), '.grab', ([x, y]) => {
  if (!isFloat()) return;
  const w = panel.offsetWidth, h = panel.offsetHeight;
  S.ppos = [clamp(x, 8, innerWidth - w - 8), clamp(y, 8, innerHeight - Math.min(h, 120))];
  panel.style.left = S.ppos[0] + 'px'; panel.style.top = S.ppos[1] + 'px'; panel.style.right = 'auto';
});

// ---------- panel ----------
const panel = $('#panel'), pbody = $('.pbody');
function openPanel() { panel.classList.remove('min'); }
$('.ptabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (!b) { panel.classList.toggle('min'); renderQuick(); return; }
  if ((overlayPanel() || isFloat()) && S.tab === b.dataset.tab && !(S.sel && S.fullInspect) && !panel.classList.contains('min')) { panel.classList.add('min'); renderQuick(); return; }
  S.tab = b.dataset.tab;
  if (quickMode()) S.fullInspect = false; else S.sel = null;
  openPanel(); renderPanel(); render(); renderQuick();
});
function fieldHTML(f, v) {
  const u = f.unit ? ` ${f.unit}` : '';
  const lab = `<span>${f.label}${f.type === 'range' ? ` <b data-out="${f.k}">${v ?? ''}${u}</b>` : ''}</span>`;
  switch (f.type) {
    case 'select': return `<label class="fld">${lab}<select data-k="${f.k}">${f.opts.map(o => { const [val, name] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(val)}"${String(val) === String(v) ? ' selected' : ''}>${esc(name)}</option>`; }).join('')}</select></label>`;
    case 'range': return `<label class="fld">${lab}<input type="range" data-k="${f.k}" data-unit="${f.unit || ''}" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${v ?? f.min}"></label>`;
    case 'textarea': return `<label class="fld">${lab}<textarea data-k="${f.k}" placeholder="${esc(f.ph || '')}">${esc(v)}</textarea></label>`;
    case 'swatch': return `<div class="fld"><span>${f.label}</span><div class="swgrid" role="radiogroup" aria-label="${f.label}">${f.opts.map(c => `<button type="button" role="radio" aria-checked="${c === v}" aria-label="${f.label} ${c}" data-sw="${f.k}" data-v="${c}" class="${c === v ? 'on' : ''}" style="background:${c}"></button>`).join('')}</div></div>`;
    case 'check': return `<label class="fld chk"><input type="checkbox" data-k="${f.k}"${v ? ' checked' : ''}><span style="color:var(--text)">${f.label}</span></label>`;
    case 'color': return `<label class="fld">${lab}<input type="color" data-k="${f.k}" value="${esc(v || '#ffffff')}" style="height:40px;padding:4px"></label>`;
    default: return `<label class="fld">${lab}<input type="${f.type || 'text'}" data-k="${f.k}" value="${esc(v)}" ${f.type === 'number' ? `step="${f.step || 'any'}" inputmode="decimal"` : ''} placeholder="${esc(f.ph || '')}"></label>`;
  }
}
function bindFields(root, obj, onChange, undoable = true) {
  $$('[data-sw]', root).forEach(b => b.onclick = () => {
    if (undoable) snap();
    obj[b.dataset.sw] = b.dataset.v;
    $$(`[data-sw="${b.dataset.sw}"]`, root).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    onChange && onChange(b.dataset.sw, b.dataset.v); save(); render();
  });
  $$('[data-k]', root).forEach(el => {
    let snapped = false;
    const start = () => { if (!snapped && undoable) { snap(); snapped = true; } };
    el.addEventListener('focus', start);
    el.addEventListener('pointerdown', start);
    el.addEventListener('blur', () => { snapped = false; });
    el.addEventListener('change', () => { snapped = false; });
    el.addEventListener('input', () => {
      start();
      let v = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? parseFloat(el.value) : el.value;
      if (typeof v === 'number' && Number.isNaN(v)) return;
      obj[el.dataset.k] = v;
      const out = $(`[data-out="${el.dataset.k}"]`, root);
      if (out) out.textContent = v + (el.dataset.unit ? ' ' + el.dataset.unit : '');
      onChange && onChange(el.dataset.k, v);
      save(); render();
    });
  });
}
function miniIcon(type, it) {
  const d = LIBMAP[type], k = .62 / d.r;
  const obj = it || { ...d.d, color: type === 'camera' ? CAM_COLORS[0] : d.d.color };
  return `<svg viewBox="-.75 -.75 1.5 1.5" xmlns="http://www.w3.org/2000/svg"><g transform="scale(${k})${['tube', 'reflector', 'bounce', 'flag', 'diffusion', 'tv', 'sofa', 'table', 'desk', 'cabinet', 'window', 'door'].includes(type) ? ' rotate(0)' : ''}">${SHAPES[type](obj)}</g></svg>`;
}
function renderPanel() {
  if (!S.scene) return;
  $$('.ptabs [data-tab]').forEach(b => b.classList.toggle('on', !S.sel && b.dataset.tab === S.tab));
  const s = findSel();
  if (s && (!quickMode() || S.fullInspect)) return renderInspector(s);
  if (S.tab === 'shots') return renderShots();
  if (S.tab === 'lights') return renderLights();
  if (S.tab === 'refs') return renderRefs();
  return renderSceneTab();
}
function syncInspectorPos() {
  const s = findSel(); if (!s || S.sel.t !== 'item') return;
  const r = $('[data-k="rot"]', pbody); if (r && document.activeElement !== r) r.value = s.rot;
}
function inspectorFields(it) {
  const base = [];
  if (it.cat === 'light') {
    base.push(
      { k: 'label', label: 'ชื่อ / หน้าที่', ph: 'เช่น Key, Fill, Back light' },
      { k: 'model', label: 'ยี่ห้อ / รุ่น', ph: 'เช่น Aputure 300x' },
      { row: [{ k: 'watt', label: 'วัตต์', type: 'number', unit: 'W' }, { k: 'mode', label: 'ประเภทสี', type: 'select', opts: [['daylight', 'Daylight'], ['bicolor', 'Bi-color'], ['rgb', 'RGB']] }] },
    );
    if (it.mode === 'bicolor') base.push({ k: 'k', label: 'อุณหภูมิสี', type: 'range', min: 2700, max: 6500, step: 100, unit: 'K', chips: true });
    if (it.mode === 'rgb') base.push({ row: [{ k: 'color', label: 'สี', type: 'color' }, { k: 'k', label: 'หรือ CCT (K)', type: 'number' }] });
    base.push(
      { k: 'dim', label: 'Dimmer', type: 'range', min: 0, max: 100, unit: '%' },
      { row: [{ k: 'gel', label: 'เจล', type: 'select', opts: GELS.map(g => g[0]) }, { k: 'mod', label: 'Modifier', type: 'select', opts: MODIFIERS }] },
      { row: [{ k: 'beam', label: 'มุมลำแสง', type: 'range', min: 10, max: 360, step: 5, unit: '°' }, { k: 'reach', label: 'ระยะแสง', type: 'range', min: .5, max: 15, step: .5, unit: 'm' }] },
    );
  } else if (it.type === 'camera') {
    base.push(
      { row: [{ k: 'label', label: 'ชื่อกล้อง', ph: 'A' }, { k: 'body', label: 'บอดี้', ph: 'เช่น FX3, BMPCC 6K' }] },
      { row: [{ k: 'sensor', label: 'เซนเซอร์', type: 'select', opts: Object.entries(SENSORS).map(([k, v]) => [k, v[0]]) }, { k: 'lens', label: 'เลนส์', type: 'number', unit: 'mm' }] },
      { k: 'reach', label: 'ระยะแสดง FOV', type: 'range', min: 1, max: 12, step: .5, unit: 'm' },
      { k: 'height', label: 'ความสูงกล้อง', type: 'number', unit: 'm', step: .1 },
      { k: 'color', label: 'สีกล้อง', type: 'swatch', opts: CAM_COLORS },
    );
  } else if (FRAME_TYPES.includes(it.type)) {
    const cats = it.type === 'diffusion' ? ['diff'] : it.type === 'bounce' ? ['bounce'] : it.type === 'net' ? ['net'] : it.type === 'flag' || it.type === 'neg' ? ['neg', 'net'] : ['diff', 'bounce', 'neg', 'net'];
    base.push({ k: 'label', label: 'ชื่อ / ป้าย', ph: 'เช่น Key diffusion' },
      { row: [{ k: 'size', label: 'ขนาดเฟรม (ฟุต / นิ้ว)', type: 'select', opts: FRAME_SIZES }, { k: 'fabric', label: 'ผ้า', type: 'select', opts: cats.flatMap(c => FABRICS[c]) }] });
  } else if (it.cat === 'person') {
    base.push({ k: 'label', label: 'ชื่อ / บทบาท', ph: 'เช่น แขกรับเชิญ, Director' }, { k: 'color', label: 'สี', type: 'swatch', opts: PERSON_COLORS });
  } else if (it.type === 'window') {
    base.push({ k: 'label', label: 'ชื่อ', ph: 'เช่น หน้าต่างทิศตะวันตก' }, { k: 'sun', label: 'แสดงแสงที่เข้ามาจากหน้าต่าง', type: 'check' }, { k: 'k', label: 'อุณหภูมิแสง', type: 'range', min: 2700, max: 7500, step: 100, unit: 'K', chips: true }, { row: [{ k: 'beam', label: 'มุมแสง', type: 'range', min: 30, max: 180, step: 5, unit: '°' }, { k: 'reach', label: 'ระยะ', type: 'range', min: 1, max: 10, step: .5, unit: 'm' }] });
  } else {
    base.push({ k: 'label', label: 'ชื่อ / ป้าย', ph: 'แสดงบนแปลน (ถ้าใส่)' });
  }
  if (it.cat === 'light' || it.type === 'camera') {
    const targets = S.scene.plan.items.filter(x => x.id !== it.id && (x.cat === 'person' || FRAME_TYPES.includes(x.type) || x.cat === 'set'));
    base.push({ k: 'aim', label: 'เล็งไปที่ (ล็อกทิศตามเป้า)', type: 'select', opts: [['', '— หมุนเอง —'], ...targets.map(x => [x.id, itemName(x) + (x.cat === 'person' ? '' : ' · ' + LIBMAP[x.type].name)])] });
  }
  base.push({ row: [{ k: 'rot', label: 'หมุน', type: 'number', unit: '°' }, FRAME_TYPES.includes(it.type) ? { k: 'y', label: 'ตำแหน่ง Y', type: 'number', unit: 'm', step: .1 } : { k: 's', label: it.type === 'tube' ? 'ความยาว (×1.2 m)' : 'ขนาด (เท่า)', type: 'number', step: .1 }] });
  if (it.cat === 'light' || it.type === 'camera') base.push({ k: 'notes', label: 'โน้ต', type: 'textarea' });
  return base;
}
function renderInspector(s) {
  const t = S.sel.t;
  if (t === 'wall') {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    pbody.innerHTML = `<div class="insp-head"><div class="grow"><b>ผนัง</b><small class="muted">ยาว ${len.toFixed(2)} m · ลากจุดปลายเพื่อปรับ</small></div></div>
      <div class="grid2">${fieldHTML({ k: 'len', label: 'ความยาว', type: 'number', unit: 'm', step: .05 }, r2(len))}${fieldHTML({ k: 't', label: 'ความหนา', type: 'number', unit: 'm', step: .01 }, s.t || .12)}</div>
      <div class="acts"><button class="btn danger" data-act="del">ลบผนัง</button><button class="btn" data-act="done">เสร็จ</button></div>`;
    const proxy = { len: r2(len), t: s.t || .12 };
    bindFields(pbody, proxy, (k, v) => {
      if (k === 't') s.t = clamp(v, .02, .6);
      else if (v > .05) { const a = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]); s.b = [r2(s.a[0] + Math.cos(a) * v), r2(s.a[1] + Math.sin(a) * v)]; }
    });
  } else if (t === 'draw') {
    const name = { arrow: 'ลูกศรการเคลื่อนไหว', pen: 'เส้นปากกา', dim: 'เส้นวัดระยะ', text: 'ข้อความ' }[s.type];
    pbody.innerHTML = `<div class="insp-head"><div class="grow"><b>${name}</b><small class="muted">ลากเพื่อย้าย</small></div></div>
      ${s.type === 'text' ? fieldHTML({ k: 'text', label: 'ข้อความ' }, s.text) + fieldHTML({ k: 's', label: 'ขนาดตัวอักษร (เท่า)', type: 'number', step: .1 }, s.s || 1) : ''}
      ${s.type !== 'dim' ? `<div class="fld"><span>สี</span><div class="chipk">${PEN_COLORS.map(c => `<button data-color="${c}" style="${s.color === c ? 'border-color:' + c : ''}"><i style="background:${c}"></i>${c === s.color ? '✓' : ''}</button>`).join('')}</div></div>` : ''}
      <div class="acts"><button class="btn danger" data-act="del">ลบ</button><button class="btn" data-act="done">เสร็จ</button></div>`;
    bindFields(pbody, s);
    $$('[data-color]', pbody).forEach(b => b.onclick = () => { snap(); s.color = b.dataset.color; save(); render(); renderPanel(); });
  } else {
    const def = LIBMAP[s.type];
    const fields = inspectorFields(s);
    let html = `<div class="insp-head"><div class="ico">${miniIcon(s.type, s)}</div><div class="grow"><b>${esc(itemName(s))}</b><small class="muted">${def.name}</small></div><button class="ib" data-act="done" aria-label="ปิด"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
    for (const f of fields) {
      if (f.row) html += `<div class="grid2">${f.row.map(x => fieldHTML(x, s[x.k])).join('')}</div>`;
      else {
        html += fieldHTML(f, s[f.k]);
        if (f.chips) html += `<div class="chipk">${K_PRESETS.map(k => `<button data-kset="${k}"><i style="background:${kColor(k)}"></i>${k}K</button>`).join('')}</div>`;
      }
    }
    if (s.type === 'camera') {
      const linked = S.scene.shots.filter(sh => sh.cam === s.id);
      html += `<div class="note">มุมรับภาพแนวนอน ≈ <b style="color:var(--text)">${hfov(s).toFixed(1)}°</b> (${SENSORS[s.sensor]?.[0] || ''}, ${s.lens}mm)</div>
        <h4>ช็อตจากกล้องตัวนี้ (${linked.length})</h4><div class="list">${linked.map(shotCard).join('') || '<small class="muted">ยังไม่มีช็อต</small>'}</div>
        <div class="acts"><button class="btn primary" data-act="addshot">+ เพิ่มช็อตจากกล้องนี้</button></div>`;
    }
    html += `<h4>จัดการ</h4><div class="acts"><button class="btn" data-act="rot90">หมุน 90°</button><button class="btn" data-act="dup">ทำซ้ำ</button>${s.cat === 'light' ? '<button class="btn" data-act="tokit">บันทึกลงชุดไฟ</button>' : ''}<button class="btn danger" data-act="del">ลบ</button></div>`;
    pbody.innerHTML = html;
    bindFields(pbody, s, k => {
      if (k === 'mode' || k === 'sun') renderPanel();
      if (k === 'aim') { if (!s.aim) delete s.aim; else { applyAims(S.scene); syncInspectorPos(); } }
      if (k === 'rot') delete s.aim;
      if (k === 's') s.s = clamp(s.s, .2, 8);
      if (['label', 'body', 'lens', 'sensor'].includes(k)) {
        const hb = $('.insp-head b', pbody); if (hb) hb.textContent = itemName(s);
        if (k === 'lens' || k === 'sensor') { const n = $('.note b', pbody); if (n) n.textContent = hfov(s).toFixed(1) + '°'; }
      }
    });
    $$('[data-kset]', pbody).forEach(b => b.onclick = () => { snap(); s.k = +b.dataset.kset; save(); render(); renderPanel(); });
    bindShotCards(pbody);
  }
  $$('[data-act]', pbody).forEach(b => b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'del') deleteSel();
    else if (a === 'done') { if (quickMode() && S.sel?.t === 'item') { S.fullInspect = false; panel.classList.add('min'); renderPanel(); renderQuick(); } else selectThing(null); }
    else if (a === 'dup') duplicateSel();
    else if (a === 'rot90') { snap(); s.rot = normDeg((s.rot || 0) + 90); save(); render(); renderPanel(); }
    else if (a === 'addshot') addShot(s.id);
    else if (a === 'tokit') { S.kit.push({ id: uid(), model: s.model || s.label || LIBMAP[s.type].name, type: s.type, watt: s.watt, mode: s.mode }); DB.setMeta('kit', S.kit); toast('บันทึกลงชุดไฟของฉันแล้ว'); }
  });
}

// shots
function shotCard(sh) {
  const cam = getItem(sh.cam), src = sh.photo && S.proj.photos[sh.photo];
  const c = cam?.color || '#8b8d98';
  return `<div class="li shot${S.activeShot === sh.id ? ' on' : ''}" data-shot="${sh.id}" role="button" tabindex="0">
    <div class="th" style="${src ? `background-image:url(${src})` : `background:${c}`}"><em>${esc(sh.num)}</em>${src ? '' : esc(cam ? cam.label : '—')}</div>
    <div class="grow"><b><span class="sw" style="background:${c}"></span>${esc(sh.num)} · ${esc(sh.size)}${sh.lens ? ' · ' + sh.lens + 'mm' : ''}</b><small>${esc([sh.move, sh.angle, cam ? 'กล้อง ' + cam.label : 'ยังไม่ผูกกล้อง'].filter(Boolean).join(' · '))}</small>${sh.desc ? `<p>${esc(sh.desc)}</p>` : ''}</div>
    <button class="ib" data-editshot="${sh.id}" aria-label="แก้ไขช็อต"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1L19 8l-3-3L5 16z"/></svg></button></div>`;
}
function bindShotCards(root) {
  $$('[data-shot]', root).forEach(el => el.addEventListener('click', e => {
    if (e.target.closest('[data-editshot]')) return openShot(el.dataset.shot);
    S.activeShot = S.activeShot === el.dataset.shot ? null : el.dataset.shot;
    $$('[data-shot]', root).forEach(x => x.classList.toggle('on', x.dataset.shot === S.activeShot));
    render();
  }));
}
function renderShots() {
  const sc = S.scene, list = sc.shots;
  pbody.innerHTML = `<h3>Shot list <small class="muted">${list.length} ช็อต</small><span class="sp"></span><button class="btn primary sm" id="addShot">+ ช็อต</button></h3>
    ${list.length ? `<div class="list">${list.map(shotCard).join('')}</div><p class="muted" style="font-size:12px;margin-top:12px">แตะการ์ดเพื่อไฮไลต์มุมกล้องบนแปลน · แตะดินสอเพื่อแก้ไข ใส่ภาพบล็อก / reference</p>`
      : `<div class="note">ยังไม่มีช็อตในซีนนี้<br>วางกล้องบนแปลน แล้วกด <b>+ ช็อต</b> ช็อตจะผูกกับกล้อง เลนส์ และมุมที่วางไว้ แนบภาพบล็อกช็อตหรือภาพ reference ได้</div>`}`;
  $('#addShot').onclick = () => addShot();
  bindShotCards(pbody);
}
function addShot(camId) {
  const sc = S.scene;
  const cam = camId ? getItem(camId) : (S.sel?.t === 'item' && findSel()?.type === 'camera' ? findSel() : cams()[0]);
  snap();
  const letter = String.fromCharCode(65 + (sc.shots.length % 26));
  const sh = { id: uid(), num: `${sc.number || ''}${letter}`, size: 'MS', angle: ANGLES[0], move: 'Static', lens: cam ? cam.lens : 35, cam: cam ? cam.id : null, subject: '', desc: '', setup: '', notes: '', photo: null };
  sc.shots.push(sh); save();
  S.activeShot = sh.id;
  renderPanel(); render();
  openShot(sh.id, true);
}

function renderLights() {
  const sc = S.scene, L = lights(), total = L.reduce((a, l) => a + (+l.watt || 0), 0);
  const draw = L.reduce((a, l) => a + (+l.watt || 0) * (l.dim ?? 100) / 100, 0);
  const others = sc.plan.items.filter(i => i.cat !== 'light' && i.cat !== 'set');
  pbody.innerHTML = `<h3>ไฟในซีนนี้</h3>
    <div class="stat"><div><b>${total.toLocaleString()} W</b><small>รวมวัตต์ทั้งหมด (${L.length} ดวง)</small></div><div><b>${(draw / 220).toFixed(1)} A</b><small>กระแสโดยประมาณที่ 220V (ตาม dimmer)</small></div></div>
    <div class="list">${L.map(l => `<button class="li" data-pick="${l.id}"><span class="sw" style="background:${lightColor(l)};box-shadow:0 0 0 1px #0002"></span><span class="grow"><b>${esc(itemName(l))}</b><small>${esc([l.model && l.label ? l.model : '', LIBMAP[l.type].name, l.watt + 'W', kText(l), l.gel && l.gel !== '—' ? l.gel : '', (l.dim ?? 100) + '%', l.mod !== '—' ? l.mod : ''].filter(Boolean).join(' · '))}</small></span></button>`).join('') || '<div class="note">ยังไม่มีไฟ กด + ที่แถบเครื่องมือเพื่อเพิ่มไฟ หรือเลือกจากชุดไฟของคุณ</div>'}</div>
    <div class="acts" style="margin-top:10px"><button class="btn primary sm" id="addLight">+ เพิ่มไฟ</button><button class="btn sm" id="editKit">ชุดไฟของฉัน (${S.kit.length})</button></div>
    <h4>กล้อง คน และกริป</h4>
    <div class="list">${others.map(o => `<button class="li" data-pick="${o.id}"><span class="sw" style="background:${o.color || '#8b8d98'}"></span><span class="grow"><b>${esc(itemName(o))}</b><small>${esc(LIBMAP[o.type].name)}${o.type === 'camera' ? ' · ' + o.lens + 'mm · FOV ' + hfov(o).toFixed(0) + '°' : ''}</small></span></button>`).join('') || '<small class="muted">—</small>'}</div>`;
  $$('[data-pick]', pbody).forEach(b => b.onclick = () => selectThing({ t: 'item', id: b.dataset.pick }));
  $('#addLight').onclick = () => openLibrary('brands');
  $('#editKit').onclick = openKit;
}
function renderSceneTab() {
  const sc = S.scene, bg = sc.plan.bg;
  pbody.innerHTML = `<h3>รายละเอียดซีน</h3>
    <div class="grid2" style="grid-template-columns:90px 1fr">${fieldHTML({ k: 'number', label: 'ซีนที่' }, sc.number)}${fieldHTML({ k: 'name', label: 'ชื่อซีน' }, sc.name)}</div>
    <div class="grid2">${fieldHTML({ k: 'location', label: 'โลเคชัน / ห้อง', ph: 'เช่น บ้าน · ห้องนั่งเล่น' }, sc.location)}${fieldHTML({ k: 'time', label: 'ช่วงเวลา', type: 'select', opts: TIMES }, sc.time)}</div>
    ${fieldHTML({ k: 'notes', label: 'โน้ตซีน', type: 'textarea', ph: 'โทนภาพ, mood, สิ่งที่ทีมต้องรู้' }, sc.notes)}
    <h4>แปลนห้อง</h4>
    <div class="acts"><button class="btn sm" id="sRoom">สร้างห้อง / นำเข้าแปลน</button>${bg ? '<button class="btn sm" id="sCalib">ตั้งสเกลภาพ</button><button class="btn sm danger" id="sBgDel">ลบภาพพื้นหลัง</button>' : ''}</div>
    ${bg ? `<div style="margin-top:10px">${fieldHTML({ k: 'op', label: 'ความชัดภาพพื้นหลัง', type: 'range', min: .1, max: 1, step: .05 }, bg.op ?? .6)}</div>` : ''}
    <h4>แม่เหล็ก</h4>
    <div class="snaps">${[['ends', 'ปลายผนังดูดติดกัน / ต่อผนังแบบ T'], ['angle', 'ล็อกมุม 45° / 90°'], ['openings', 'ประตู หน้าต่าง ดูดเข้าผนัง'], ['furniture', 'เฟอร์นิเจอร์ชิดผนัง']].map(([k, n]) => `<label class="fld chk"><input type="checkbox" data-snap="${k}"${S.snaps[k] ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div>
    <label class="fld"><span>รูปแบบผนัง</span><select id="sWall"><option value="solid">เส้นทึบ</option><option value="block"${S.proj.wallStyle === 'block' ? ' selected' : ''}>บล็อก (แบบ diagram DP)</option></select></label>
    <h4>ซีน</h4>
    <div class="acts"><button class="btn sm" id="sDup">ทำซ้ำซีนนี้ (คัดลอกแปลน)</button><button class="btn sm danger" id="sDel">ลบซีน</button></div>`;
  bindFields(pbody, sc, k => { if (k === 'name' || k === 'number') updateTitle(); });
  if (bg) {
    const opEl = $('[data-k="op"]', pbody);
    opEl.oninput = () => { sc.plan.bg.op = +opEl.value; $('[data-out="op"]', pbody).textContent = opEl.value; save(); render(); };
    $('#sCalib').onclick = startCalib;
    $('#sBgDel').onclick = () => { snap(); sc.plan.bg = null; save(); render(); renderPanel(); };
  }
  $$('[data-snap]', pbody).forEach(el => el.onchange = () => { S.snaps[el.dataset.snap] = el.checked; DB.setMeta('snaps', S.snaps); });
  $('#sWall').onchange = e => { S.proj.wallStyle = e.target.value; save(); render(); };
  $('#sRoom').onclick = openRoom;
  $('#sDup').onclick = () => duplicateScene(sc);
  $('#sDel').onclick = () => deleteScene(sc);
}

// ---------- modals ----------
function modal(html, { wide, onClose, cls } = {}) {
  const back = document.createElement('div');
  back.className = 'mback';
  back.innerHTML = `<div class="modal${wide ? ' wide' : ''}${cls ? ' ' + cls : ''}" role="dialog">${html}</div>`;
  if (cls) back.classList.add('mb-' + cls);
  document.body.appendChild(back);
  const m = back.firstChild;
  const close = () => { back.remove(); onClose && onClose(); };
  back.addEventListener('pointerdown', e => { if (e.target === back) back.dataset.down = 1; });
  back.addEventListener('click', e => { if (e.target === back && back.dataset.down) close(); delete back.dataset.down; });
  $$('[data-close]', m).forEach(b => b.onclick = close);
  m.close = close;
  return m;
}
const closeX = '<button class="ib x" data-close aria-label="ปิด"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 2200); }
function pickFiles(accept) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = true; i.style.display = 'none';
    i.onchange = () => { res([...i.files]); i.remove(); };
    document.body.appendChild(i); i.click();
  });
}
// Dominant colours of an image, dark to light (for the ref palette strip)
async function extractPalette(src, n = 12) {
  const img = await loadImg(src), c = document.createElement('canvas'), k = 72 / Math.max(img.width, img.height);
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data, bins = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const key = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
    const b = bins.get(key) || [0, 0, 0, 0]; b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++; bins.set(key, b);
  }
  const cols = [...bins.values()].sort((a, b) => b[3] - a[3]).map(b => [b[0] / b[3], b[1] / b[3], b[2] / b[3]]);
  const out = [];
  for (const c of cols) { if (out.every(o => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) > 38)) out.push(c); if (out.length >= n) break; }
  return out.sort((a, b) => (a[0] * .3 + a[1] * .59 + a[2] * .11) - (b[0] * .3 + b[1] * .59 + b[2] * .11)).map(c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join(''));
}
const marksSVG = (r, cls = '') => r.marks?.length ? `<svg class="${cls}" viewBox="0 0 1000 ${Math.round(1000 * r.h / r.w)}" preserveAspectRatio="none" aria-hidden="true">${r.marks.map(m => `<path d="${smoothPath(m.pts)}" fill="none" stroke="${m.c}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"${m.arrow ? ` marker-end="url(#rm${m.c.slice(1)})"` : ''}/>`).join('')}<defs>${REF_COLORS.map(c => `<marker id="rm${c.slice(1)}" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3" markerHeight="3" orient="auto"><path d="M0 0L10 5L0 10z" fill="${c}"/></marker>`).join('')}</defs></svg>` : '';
const REF_COLORS = ['#FF8A2B', '#2F6BFF', '#ffffff', '#C59BE8'];
function renderRefs() {
  const sc = S.scene; sc.refs = sc.refs || [];
  pbody.innerHTML = `<h3>Ref board <small class="muted">${sc.refs.length} ภาพ</small><span class="sp"></span><button class="btn primary sm" id="addRef">+ แปะภาพ</button></h3>
    ${sc.refs.length ? '' : '<div class="note">แปะภาพเรฟของซีน (still จากหนัง, mood, ภาพหน้างาน) แอปจะดึงพาเลตสีให้ และขีดทิศแสงทับภาพได้ ภาพแรกจะขึ้นหัว PDF</div>'}
    <div class="refs">${sc.refs.map((r, i) => `<div class="ref" data-ref="${r.id}">
      <div class="ref-img"><img src="${S.proj.photos[r.ph] || ''}" alt="ภาพเรฟ ${i + 1}">${marksSVG(r, 'ref-marks')}${i === 0 ? '<span class="ref-main">ภาพหลัก</span>' : ''}</div>
      <div class="pal">${(r.pal || []).map(c => `<i style="background:${c}"></i>`).join('')}</div>
      <input class="ref-note" data-note="${r.id}" value="${esc(r.note || '')}" placeholder="โน้ต เช่น Key ผ่านหน้าต่าง, rim สีส้ม">
      <div class="acts"><button class="btn sm" data-ra="mark">ขีดทิศแสง</button>${i ? '<button class="btn sm" data-ra="main">ตั้งเป็นภาพหลัก</button>' : ''}<button class="btn sm danger" data-ra="del">ลบ</button></div></div>`).join('')}</div>`;
  $('#addRef').onclick = async () => {
    const files = await pickFiles('image/*'); if (!files.length) return;
    toast('กำลังเพิ่มภาพ…');
    for (const f of files) {
      const img = await fileToJPEG(f, 1600, .85);
      const pal = await extractPalette(img.src).catch(() => []);
      sc.refs.push({ id: uid(), ph: addPhoto(img.src), w: img.w, h: img.h, pal, marks: [], note: '' });
    }
    save(); renderPanel();
  };
  $$('[data-note]', pbody).forEach(el => el.oninput = () => { sc.refs.find(r => r.id === el.dataset.note).note = el.value; save(); });
  $$('[data-ra]', pbody).forEach(b => b.onclick = () => {
    const id = b.closest('[data-ref]').dataset.ref, i = sc.refs.findIndex(r => r.id === id), a = b.dataset.ra;
    if (a === 'del') { if (!confirm('ลบภาพเรฟนี้?')) return; sc.refs.splice(i, 1); }
    else if (a === 'main') sc.refs.unshift(sc.refs.splice(i, 1)[0]);
    else return openMarks(sc.refs[i]);
    save(); renderPanel();
  });
}
function openMarks(r) {
  let color = REF_COLORS[0], arrow = true, cur = null;
  const H = Math.round(1000 * r.h / r.w);
  const m = modal(`<h3>ขีดทิศแสงบนภาพ ${closeX}</h3>
    <div class="mark-wrap"><img src="${S.proj.photos[r.ph]}" alt=""><svg id="mk" viewBox="0 0 1000 ${H}" preserveAspectRatio="none"></svg></div>
    <div class="acts" style="margin-top:10px">${REF_COLORS.map(c => `<button class="swb" data-c="${c}" aria-label="สี ${c}" style="background:${c}"></button>`).join('')}<button class="btn sm" id="mkArrow">ลูกศร: เปิด</button><button class="btn sm" id="mkUndo">ย้อนเส้นล่าสุด</button><span class="sp"></span><button class="btn primary" data-close>เสร็จ</button></div>`, { wide: true, onClose: () => { save(); renderPanel(); } });
  const sv = $('#mk', m);
  const draw = () => { sv.innerHTML = (marksSVG({ ...r, marks: cur ? [...r.marks, cur] : r.marks }).replace(/^<svg[^>]*>|<\/svg>$/g, '')); };
  const pt = e => { const b = sv.getBoundingClientRect(); return [Math.round((e.clientX - b.left) / b.width * 1000), Math.round((e.clientY - b.top) / b.height * H)]; };
  sv.addEventListener('pointerdown', e => { sv.setPointerCapture(e.pointerId); cur = { c: color, arrow, pts: [pt(e)] }; draw(); });
  sv.addEventListener('pointermove', e => { if (!cur) return; const p = pt(e), l = cur.pts[cur.pts.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > 8) { cur.pts.push(p); draw(); } });
  const end = () => { if (cur && cur.pts.length > 1) r.marks.push(cur); cur = null; draw(); };
  sv.addEventListener('pointerup', end); sv.addEventListener('pointercancel', end);
  $$('[data-c]', m).forEach(b => b.onclick = () => { color = b.dataset.c; $$('[data-c]', m).forEach(x => x.classList.toggle('on', x === b)); });
  $$('[data-c]', m)[0].classList.add('on');
  $('#mkArrow', m).onclick = e => { arrow = !arrow; e.target.textContent = 'ลูกศร: ' + (arrow ? 'เปิด' : 'ปิด'); };
  $('#mkUndo', m).onclick = () => { r.marks.pop(); draw(); };
  draw();
}
function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.style.display = 'none';
    i.onchange = () => { res(i.files[0] || null); i.remove(); };
    document.body.appendChild(i); i.click();
  });
}
async function fileToJPEG(file, max = 1400, q = .82) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return { src: c.toDataURL('image/jpeg', q), w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}
function addPhoto(src) { const id = uid(); S.proj.photos[id] = src; return id; }

function openLibrary(tab = 'brands') {
  const m = modal(`<h3>เพิ่มลงแปลน ${closeX}</h3><div class="libtabs">${LIB_TABS.map(([k, n]) => `<button data-lt="${k}">${n}</button>`).join('')}</div><div class="libtop"></div><div class="libgrid"></div>`, { wide: true });
  const grid = $('.libgrid', m), top = $('.libtop', m);
  let q = '';
  const showBrands = () => {
    const sc = S.libScale || 'mid', ql = q.toLowerCase();
    const list = PRESETS.filter(p => S.libBrand ? p.brand === S.libBrand : ql ? (p.brand + ' ' + p.model).toLowerCase().includes(ql) : p.scale === sc);
    grid.innerHTML = list.map(p => `<button data-preset="${p.id}">${miniIcon(p.type)}<b>${esc(p.model)}</b><small>${esc(p.brand)} · ${p.watt >= 1000 ? (p.watt / 1000) + 'kW' : p.watt + 'W'} · ${p.tungsten ? 'Tungsten' : p.mode === 'rgb' ? 'RGB' : p.mode === 'daylight' ? 'Daylight' : 'Bi-color'}</small></button>`).join('') || '<p class="muted">ไม่พบรุ่นนี้ ลองเพิ่มเองในชุดไฟของฉัน</p>';
  };
  const show = t => {
    $$('[data-lt]', m).forEach(b => b.classList.toggle('on', b.dataset.lt === t));
    top.innerHTML = '';
    if (t === 'brands') {
      top.innerHTML = `<div class="seg" id="libScale">${SCALES.map(([k, n]) => `<button data-sc="${k}" class="${!S.libBrand && (S.libScale || 'mid') === k ? 'on' : ''}">${n}</button>`).join('')}</div><input class="libq" type="search" aria-label="ค้นหารุ่นไฟ" placeholder="ค้นหา เช่น Ulanzi, SkyPanel" value="${esc(q)}">
        <div class="brandrow" role="group" aria-label="ยี่ห้อ">${BRANDS.map(b => `<button type="button" data-br="${esc(b)}" class="${S.libBrand === b ? 'on' : ''}">${esc(b)}</button>`).join('')}</div>`;
      const sync = () => { $$('#libScale button', m).forEach(x => x.classList.toggle('on', !S.libBrand && !q && x.dataset.sc === (S.libScale || 'mid'))); $$('[data-br]', m).forEach(x => x.classList.toggle('on', x.dataset.br === S.libBrand)); showBrands(); };
      $('#libScale', m).onclick = e => { const b = e.target.closest('[data-sc]'); if (!b) return; S.libScale = b.dataset.sc; S.libBrand = null; q = ''; $('.libq', m).value = ''; sync(); };
      $('.libq', m).oninput = e => { q = e.target.value.trim(); S.libBrand = null; sync(); };
      $('.brandrow', m).onclick = e => { const b = e.target.closest('[data-br]'); if (!b) return; S.libBrand = S.libBrand === b.dataset.br ? null : b.dataset.br; q = ''; $('.libq', m).value = ''; sync(); };
      return showBrands();
    }
    if (t === 'kit') {
      grid.innerHTML = S.kit.map(k => `<button data-kit="${k.id}">${miniIcon(k.type)}${esc(k.model)}<small>${k.watt}W · ${k.mode}</small></button>`).join('') + `<button data-kitedit>${'<svg viewBox="0 0 24 24" fill="none" stroke="#8a8780" stroke-width="1.6"><path d="M12 5v14M5 12h14"/></svg>'}แก้ไขชุดไฟ<small>เพิ่มไฟที่มีจริง</small></button>`;
    } else grid.innerHTML = LIB.filter(d => d.cat === t).map(d => `<button data-add="${d.type}">${miniIcon(d.type)}${d.name}${d.cat === 'light' ? `<small>${d.d.watt}W · ${d.d.beam === 360 ? 'รอบทิศ' : d.d.beam + '°'}</small>` : d.d.size ? `<small>${d.d.size} · ${d.d.fabric}</small>` : ''}</button>`).join('');
  };
  $('.libtabs', m).onclick = e => { const b = e.target.closest('[data-lt]'); if (b) show(b.dataset.lt); };
  grid.onclick = e => {
    const a = e.target.closest('[data-add]'), k = e.target.closest('[data-kit]'), pr = e.target.closest('[data-preset]');
    if (e.target.closest('[data-kitedit]')) { m.close(); return openKit(); }
    if (!a && !k && !pr) return;
    const [x, y] = viewCenter();
    let it;
    if (a) it = makeItem(a.dataset.add, x, y);
    else if (pr) {
      const p = PRESETS.find(z => z.id === pr.dataset.preset);
      it = makeItem(p.type, x, y, { model: p.brand + ' ' + p.model, watt: p.watt, mode: p.mode, k: p.k, ...p.extra });
    } else {
      const kd = S.kit.find(z => z.id === k.dataset.kit);
      it = makeItem(kd.type, x, y, { model: kd.model, watt: kd.watt, mode: kd.mode, k: kd.mode === 'daylight' ? 5600 : LIBMAP[kd.type].d.k });
    }
    snap(); P().items.push(it); save();
    m.close(); setTool('select'); selectThing({ t: 'item', id: it.id });
  };
  show(tab);
}
function openKit() {
  const m = modal(`<h3>ชุดไฟของฉัน ${closeX}</h3><p class="muted" style="margin-top:-6px">ใส่ไฟที่มีจริง แล้วเลือกวางบนแปลนได้ทันทีจากแท็บ “ชุดไฟของฉัน”</p>
    <div class="kitrow kithead"><span>ยี่ห้อ / รุ่น</span><span>ประเภท</span><span>วัตต์</span><span>สี</span><span></span></div><div id="kitRows"></div>
    <div class="acts"><button class="btn" id="kitAdd">+ เพิ่มไฟ</button><span class="sp"></span><button class="btn primary" data-close>เสร็จ</button></div>`, { wide: true, onClose: () => { DB.setMeta('kit', S.kit); if (S.scene) renderPanel(); } });
  const rows = $('#kitRows', m);
  const draw = () => {
    rows.innerHTML = S.kit.map(k => `<div class="kitrow" data-row="${k.id}"><input data-f="model" value="${esc(k.model)}" placeholder="เช่น Aputure 300x"><select data-f="type">${LIB.filter(d => d.cat === 'light').map(d => `<option value="${d.type}"${d.type === k.type ? ' selected' : ''}>${d.name}</option>`).join('')}</select><input data-f="watt" type="number" inputmode="numeric" value="${k.watt}"><select data-f="mode">${[['daylight', 'Daylight'], ['bicolor', 'Bi-color'], ['rgb', 'RGB']].map(([v, n]) => `<option value="${v}"${v === k.mode ? ' selected' : ''}>${n}</option>`).join('')}</select><button class="ib" data-rm aria-label="ลบ">✕</button></div>`).join('');
  };
  rows.addEventListener('input', e => { const r = e.target.closest('[data-row]'), k = S.kit.find(z => z.id === r.dataset.row), f = e.target.dataset.f; k[f] = f === 'watt' ? +e.target.value : e.target.value; });
  rows.addEventListener('click', e => { if (!e.target.closest('[data-rm]')) return; const id = e.target.closest('[data-row]').dataset.row; S.kit = S.kit.filter(z => z.id !== id); draw(); });
  $('#kitAdd', m).onclick = () => { S.kit.push({ id: uid(), model: '', type: 'cob', watt: 100, mode: 'bicolor' }); draw(); $('#kitRows input:last-of-type', m); rows.lastElementChild?.querySelector('input')?.focus(); };
  draw();
}

const ROOMS = [
  ['rect', 'สี่เหลี่ยม', 'M3 3h24v18H3z', (W, L) => [[0, 0], [W, 0], [W, L], [0, L]]],
  ['L', 'ตัว L', 'M3 3h14v8h10v10H3z', (W, L) => [[0, 0], [W * .6, 0], [W * .6, L * .45], [W, L * .45], [W, L], [0, L]]],
  ['U', 'ตัว U', 'M3 3h7v10h10V3h7v18H3z', (W, L) => [[0, 0], [W * .3, 0], [W * .3, L * .55], [W * .7, L * .55], [W * .7, 0], [W, 0], [W, L], [0, L]]],
  ['T', 'ตัว T', 'M3 3h24v7h-8v11h-8V10H3z', (W, L) => [[0, 0], [W, 0], [W, L * .4], [W * .67, L * .4], [W * .67, L], [W * .33, L], [W * .33, L * .4], [0, L * .4]]],
  ['hall', 'โถงยาว', 'M2 7h26v10H2z', (W, L) => [[0, 0], [W, 0], [W, L * .4], [0, L * .4]]],
];
function openRoom() {
  const m = modal(`<h3>ห้อง ${closeX}</h3>
    <div class="roomgrid">${ROOMS.map(([k, n, d]) => `<button type="button" data-room="${k}" aria-label="${n}" title="${n}"><svg viewBox="0 0 30 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg><small>${n}</small></button>`).join('')}
      <button type="button" data-room="img" aria-label="นำเข้าแปลน" title="นำเข้าแปลน / สแกน"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg><small>ภาพแปลน</small></button></div>
    <div class="grid2" style="margin-top:12px">${fieldHTML({ k: 'w', label: 'กว้าง (m)', type: 'number', step: .1 }, 6)}${fieldHTML({ k: 'h', label: 'ยาว (m)', type: 'number', step: .1 }, 5)}</div>`, { cls: 'pop' });
  $('.roomgrid', m).onclick = async e => {
    const b = e.target.closest('[data-room]'); if (!b) return;
    if (b.dataset.room === 'img') {
      const f = await pickFile('image/*'); if (!f) return;
      const img = await fileToJPEG(f, 2200, .85);
      snap();
      const w = 8, h = w * img.h / img.w, [cx, cy] = viewCenter();
      P().bg = { ph: addPhoto(img.src), x: r2(cx - w / 2), y: r2(cy - h / 2), w, h: r2(h), op: .6 };
      save(); m.close(); fitView(); renderPanel(); toast('ลากเส้นทับระยะที่รู้ขนาดเพื่อตั้งสเกล'); startCalib(); return;
    }
    const W = parseFloat($('[data-k="w"]', m).value) || 6, L = parseFloat($('[data-k="h"]', m).value) || 5;
    const pts = ROOMS.find(r => r[0] === b.dataset.room)[3](W, L).map(([x, y]) => [r2(x - W / 2), r2(y - L / 2)]);
    snap();
    P().walls = pts.map((a, i) => ({ id: uid(), a, b: pts[(i + 1) % pts.length], t: .12 }));
    save(); m.close(); fitView(); if (P().items.length) toast('เปลี่ยนห้องแล้ว · ย้อนกลับได้');
  };
}
function startCalib() { selectThing(null); setTool('calib'); }
function calibrate(a, len) {
  const real = parseFloat(prompt(`เส้นนี้ยาว ${len.toFixed(2)} m บนภาพ\nความยาวจริงคือกี่เมตร?`, len.toFixed(2)));
  if (!(real > 0)) return;
  const bg = P().bg; if (!bg) return;
  snap();
  const f = real / len;
  bg.x = r2(a[0] + (bg.x - a[0]) * f); bg.y = r2(a[1] + (bg.y - a[1]) * f); bg.w = r2(bg.w * f); bg.h = r2(bg.h * f);
  save(); fitView(); toast('ตั้งสเกลแล้ว ใช้เครื่องมือผนังลากตามแนวผนังในภาพได้');
}

function openShot(id, isNew) {
  const sh = S.scene.shots.find(s => s.id === id); if (!sh) return;
  const camOpts = [['', '— ไม่ผูกกล้อง —'], ...cams().map(c => [c.id, `กล้อง ${c.label}${c.body ? ' · ' + c.body : ''} (${c.lens}mm)`])];
  const m = modal(`<h3>ช็อต ${esc(sh.num)} ${closeX}</h3>
    <div class="photo-box" id="phBox"><span class="muted" id="phEmpty">ภาพบล็อกช็อต / reference / สตอรีบอร์ด</span><div class="row"><button class="btn sm" id="phPick">${sh.photo ? 'เปลี่ยนภาพ' : 'ถ่าย / เลือกภาพ'}</button>${sh.photo ? '<button class="btn sm danger" id="phDel">ลบภาพ</button>' : ''}</div></div>
    <div class="grid3">${fieldHTML({ k: 'num', label: 'เลขช็อต' }, sh.num)}${fieldHTML({ k: 'size', label: 'ขนาดภาพ', type: 'select', opts: SHOT_SIZES }, sh.size)}${fieldHTML({ k: 'lens', label: 'เลนส์', type: 'number', unit: 'mm' }, sh.lens)}</div>
    <div class="grid2">${fieldHTML({ k: 'angle', label: 'มุมกล้อง', type: 'select', opts: ANGLES }, sh.angle)}${fieldHTML({ k: 'move', label: 'การเคลื่อนกล้อง', type: 'select', opts: MOVES }, sh.move)}</div>
    ${fieldHTML({ k: 'cam', label: 'กล้องบนแปลน', type: 'select', opts: camOpts }, sh.cam || '')}
    ${fieldHTML({ k: 'subject', label: 'ตัวแบบ / สิ่งที่อยู่ในเฟรม', ph: 'เช่น แขกรับเชิญ, มือถือแก้วกาแฟ' }, sh.subject)}
    ${fieldHTML({ k: 'desc', label: 'คำอธิบายช็อต / แอ็กชัน', type: 'textarea', ph: 'เกิดอะไรในช็อตนี้' }, sh.desc)}
    <div class="grid2">${fieldHTML({ k: 'setup', label: 'ชุดไฟ / Lighting setup', ph: 'เช่น Setup A: Key + Fill' }, sh.setup)}${fieldHTML({ k: 'notes', label: 'โน้ตเพิ่มเติม', ph: 'เสียง, props, wardrobe' }, sh.notes)}</div>
    <div class="acts"><button class="btn" id="shUp">เลื่อนขึ้น</button><button class="btn" id="shDown">เลื่อนลง</button><button class="btn danger" id="shDel">ลบช็อต</button><span class="sp"></span><button class="btn primary" data-close>เสร็จ</button></div>`,
    { onClose: () => { renderPanel(); render(); } });
  const box = $('#phBox', m);
  const showPh = () => { const src = sh.photo && S.proj.photos[sh.photo]; box.style.backgroundImage = src ? `url(${src})` : ''; $('#phEmpty', m).hidden = !!src; };
  showPh();
  bindFields(m, sh, k => {
    if (k === 'cam') { const c = getItem(sh.cam); if (c && isNew) { sh.lens = c.lens; $('[data-k="lens"]', m).value = c.lens; } if (!sh.cam) sh.cam = null; }
    if (k === 'lens') { const c = getItem(sh.cam); if (c && cams().length) { /* keep plan in sync: shot lens drives its camera */ c.lens = sh.lens; } }
    if (k === 'num') $('h3', m).firstChild.textContent = 'ช็อต ' + sh.num + ' ';
  });
  $('#phPick', m).onclick = async () => {
    const f = await pickFile('image/*'); if (!f) return;
    const img = await fileToJPEG(f);
    snap(); sh.photo = addPhoto(img.src); save(); showPh(); $('#phPick', m).textContent = 'เปลี่ยนภาพ';
  };
  const del = $('#phDel', m); if (del) del.onclick = () => { snap(); sh.photo = null; save(); showPh(); del.remove(); };
  const move = d => { const L = S.scene.shots, i = L.indexOf(sh), j = i + d; if (j < 0 || j >= L.length) return; snap(); [L[i], L[j]] = [L[j], L[i]]; save(); toast(`ย้ายไปลำดับ ${j + 1}`); };
  $('#shUp', m).onclick = () => move(-1);
  $('#shDown', m).onclick = () => move(1);
  $('#shDel', m).onclick = () => { if (!confirm('ลบช็อตนี้?')) return; snap(); S.scene.shots = S.scene.shots.filter(s => s.id !== sh.id); if (S.activeShot === sh.id) S.activeShot = null; save(); m.close(); };
}

// ---------- scenes & projects ----------
function sceneTitle(sc) { return `${sc.number ? sc.number + ' · ' : ''}${sc.name}`; }
function updateTitle() { $('#projName').textContent = S.proj.name + (S.proj.client ? ' · ' + S.proj.client : ''); $('#sceneName').textContent = sceneTitle(S.scene) + ' ▾'; }
function openScenes() {
  const p = S.proj;
  const m = modal(`<h3>ซีนทั้งหมด ${closeX}</h3>
    <div class="list" id="scList">${p.scenes.map((sc, i) => `<div class="li${sc === S.scene ? ' on' : ''}" data-sc="${sc.id}" role="button"><span class="grow"><b>${esc(sceneTitle(sc))}</b><small>${esc([sc.location, sc.time, sc.shots.length + ' ช็อต', lights(sc).length + ' ไฟ'].filter(Boolean).join(' · '))}</small></span><button class="ib" data-mv="-1" aria-label="ขึ้น"${i === 0 ? ' disabled' : ''}>↑</button><button class="ib" data-mv="1" aria-label="ลง"${i === p.scenes.length - 1 ? ' disabled' : ''}>↓</button></div>`).join('')}</div>
    <div class="acts" style="margin-top:12px"><button class="btn primary" id="scNew">+ ซีนใหม่</button></div>
    <h4>โปรเจกต์</h4>
    <div class="grid2">${fieldHTML({ k: 'name', label: 'ชื่อโปรเจกต์' }, p.name)}${fieldHTML({ k: 'client', label: 'ลูกค้า' }, p.client)}</div>
    ${fieldHTML({ k: 'date', label: 'วันถ่าย', type: 'date' }, p.date)}`, { onClose: updateTitle });
  bindFields($$('.grid2', m)[0].parentNode, p, null, false);
  $('#scList', m).onclick = e => {
    const row = e.target.closest('[data-sc]'); if (!row) return;
    const mv = e.target.closest('[data-mv]');
    const i = p.scenes.findIndex(s => s.id === row.dataset.sc);
    if (mv) { const j = i + +mv.dataset.mv; [p.scenes[i], p.scenes[j]] = [p.scenes[j], p.scenes[i]]; save(); m.close(); return openScenes(); }
    m.close(); switchScene(p.scenes[i]);
  };
  $('#scNew', m).onclick = () => {
    const n = Math.max(0, ...p.scenes.map(s => parseInt(s.number) || 0)) + 1;
    const sc = newScene(n, 'ซีน ' + n);
    const last = S.scene;
    if (last.plan.walls.length && confirm('ใช้แปลนห้องเดิม (ผนัง) จากซีนปัจจุบันไหม?')) sc.plan.walls = clone(last.plan.walls).map(w => ({ ...w, id: uid() }));
    p.scenes.push(sc); save(); m.close(); switchScene(sc);
  };
}
function duplicateScene(sc) {
  const p = S.proj, n = Math.max(0, ...p.scenes.map(s => parseInt(s.number) || 0)) + 1;
  const c = clone(sc); c.id = uid(); c.number = String(n); c.name = sc.name + ' (สำเนา)';
  const map = {};
  c.plan.items.forEach(it => { const o = it.id; it.id = uid(); map[o] = it.id; });
  c.plan.walls.forEach(w => w.id = uid()); c.plan.draws.forEach(d => d.id = uid());
  c.shots = c.shots.map((s, i) => ({ ...s, id: uid(), cam: map[s.cam] || null, num: `${n}${String.fromCharCode(65 + i)}` }));
  p.scenes.splice(p.scenes.indexOf(sc) + 1, 0, c); save(); switchScene(c); toast('ทำซ้ำซีนแล้ว');
}
function deleteScene(sc) {
  const p = S.proj;
  if (p.scenes.length === 1) return toast('ต้องมีอย่างน้อย 1 ซีน');
  if (!confirm(`ลบซีน “${sceneTitle(sc)}” ?`)) return;
  const i = p.scenes.indexOf(sc); p.scenes.splice(i, 1); save(); switchScene(p.scenes[Math.max(0, i - 1)]);
}
function switchScene(sc) {
  S.scene = sc; S.sel = null; S.activeShot = null; S.undo = []; S.redo = []; S.preview = null;
  updateTitle(); updateUndo(); renderPanel(); requestAnimationFrame(() => fitView());
}
function openProject(p) {
  S.proj = p; p.photos = p.photos || {};
  $('#home').hidden = true; $('#editor').hidden = false;
  S.tool = 'select'; renderTools();
  switchScene(p.scenes[0]);
  layoutCalc();
  if (!overlayPanel() && !isFloat()) openPanel();
  if (isFloat()) panel.classList.add('min');
}
function gcPhotos(p) {
  const used = new Set();
  p.scenes.forEach(sc => { sc.shots.forEach(s => s.photo && used.add(s.photo)); if (sc.plan.bg) used.add(sc.plan.bg.ph); (sc.refs || []).forEach(r => used.add(r.ph)); });
  Object.keys(p.photos).forEach(k => { if (!used.has(k)) delete p.photos[k]; });
}
async function goHome() {
  if (S.proj) { gcPhotos(S.proj); clearTimeout(saveTimer); await DB.put(S.proj).catch(() => { }); }
  S.proj = null; S.scene = null;
  $('#editor').hidden = true; $('#home').hidden = false;
  await loadProjects();
}
async function loadProjects() {
  S.projects = (await DB.all().catch(() => null)) || S.projects;
  S.projects.sort((a, b) => b.updated - a.updated);
  renderHome();
}
function coverOf(p) {
  for (const sc of p.scenes) for (const s of sc.shots) if (s.photo && p.photos[s.photo]) return p.photos[s.photo];
  return null;
}
function renderHome() {
  const L = S.projects, el = $('#projList');
  if (!L.length) {
    el.innerHTML = `<div class="empty"><h2>วางแผนการถ่ายจากมุมบน</h2><p class="muted" style="max-width:560px;margin:0 auto">สร้างห้อง วางไฟ กล้อง และนักแสดง ผูกภาพบล็อกช็อตเข้ากับ Shot list แล้วส่งออกเป็น PDF หรือภาพให้ทีมงานในคลิกเดียว</p>
      <div class="feat"><div><b>ห้อง & แปลน</b>สร้างห้องตามขนาดจริง หรือนำเข้าภาพแปลนจากการสแกนแล้วตั้งสเกล</div><div><b>ไฟ & ชุดไฟของคุณ</b>ลำแสงตามมุม ระยะ อุณหภูมิสี และ dimmer รวมวัตต์ให้อัตโนมัติ</div><div><b>กล้อง & FOV</b>มุมรับภาพคำนวณจากเซนเซอร์และเลนส์จริง</div><div><b>Shot list + ภาพบล็อก</b>ทุกช็อตผูกกับกล้องบนแปลน แนบภาพ reference ได้</div><div><b>ส่งออกให้ทีม</b>PDF breakdown, PNG, CSV, รายการอุปกรณ์</div></div>
      <div class="row" style="justify-content:center;margin-top:16px"><button class="btn" id="demo">เปิดโปรเจกต์ตัวอย่าง</button><button class="btn primary" id="new2">+ เริ่มโปรเจกต์ใหม่</button></div></div>`;
    $('#demo').onclick = async () => { const p = demoProject(); await DB.put(p); S.projects.push(p); openProject(p); };
    $('#new2').onclick = newProjectFlow;
    return;
  }
  el.innerHTML = `<div class="proj-grid">${L.map(p => {
    const cov = coverOf(p), shots = p.scenes.reduce((a, s) => a + s.shots.length, 0);
    return `<div class="pcard" data-p="${p.id}">${cov ? `<img class="cover" src="${cov}" alt="">` : (() => { const bb = sceneBBox(p.scenes[0], .3); return `<svg class="cover" viewBox="${bb.x} ${bb.y} ${bb.w} ${bb.h}" preserveAspectRatio="xMidYMid meet" style="padding:10px">${planSVG(p.scenes[0], { px: bb.w / 300, labels: false, photos: p.photos })}</svg>`; })()}
      <div class="meta"><b>${esc(p.name)}</b><small class="muted">${esc([p.client, p.date, p.scenes.length + ' ซีน', shots + ' ช็อต'].filter(Boolean).join(' · '))}</small></div>
      <div class="acts"><button class="btn sm primary" data-open>เปิด</button><button class="btn sm" data-dup>ทำซ้ำ</button><button class="btn sm danger" data-del>ลบ</button></div></div>`;
  }).join('')}</div><p class="muted" style="font-size:12px;margin-top:18px">ข้อมูลทั้งหมดเก็บในเครื่องนี้เท่านั้น · ส่งต่อให้ทีมด้วยไฟล์โปรเจกต์ (เมนูส่งออก)</p>`;
  $$('[data-p]').forEach(c => {
    const p = L.find(x => x.id === c.dataset.p);
    c.querySelector('.cover').onclick = () => openProject(p);
    c.querySelector('[data-open]').onclick = () => openProject(p);
    c.querySelector('[data-dup]').onclick = async () => { const n = clone(p); n.id = uid(); n.name += ' (สำเนา)'; n.updated = Date.now(); await DB.put(n); loadProjects(); };
    c.querySelector('[data-del]').onclick = async () => { if (!confirm(`ลบโปรเจกต์ “${p.name}” ? กู้คืนไม่ได้`)) return; await DB.del(p.id); S.projects = S.projects.filter(x => x !== p); loadProjects(); };
  });
}
function newProjectFlow() {
  const m = modal(`<h3>โปรเจกต์ใหม่ ${closeX}</h3>${fieldHTML({ k: 'name', label: 'ชื่อโปรเจกต์', ph: 'เช่น สัมภาษณ์ CEO, MV เพลงใหม่' }, '')}<div class="grid2">${fieldHTML({ k: 'client', label: 'ลูกค้า' }, '')}${fieldHTML({ k: 'date', label: 'วันถ่าย', type: 'date' }, '')}</div><div class="acts"><span class="sp"></span><button class="btn primary" id="npGo">สร้าง</button></div>`);
  const v = {}; bindFields(m, v, null, false);
  setTimeout(() => $('[data-k="name"]', m).focus(), 50);
  $('#npGo', m).onclick = async () => {
    const p = newProject(v.name, v.client, v.date);
    const sc = p.scenes[0];
    [[[-2.5, -2], [2.5, -2]], [[2.5, -2], [2.5, 2]], [[2.5, 2], [-2.5, 2]], [[-2.5, 2], [-2.5, -2]]].forEach(([a, b]) => sc.plan.walls.push({ id: uid(), a, b, t: .12 }));
    await DB.put(p); S.projects.push(p); m.close(); openProject(p);
  };
}
$('#btnNew').onclick = newProjectFlow;
$('#btnHome').onclick = goHome;
$('#btnScenes').onclick = openScenes;
$('#btnUndo').onclick = () => undoRedo(-1);
$('#btnRedo').onclick = () => undoRedo(1);
$('#btnExport').onclick = () => openExport();
$('#btnImport').onclick = async () => {
  const f = await pickFile('.json,.dpplans,application/json'); if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const p = data.project || data;
    if (!p.scenes) throw new Error('bad');
    if (S.projects.some(x => x.id === p.id)) { p.id = uid(); p.name += ' (นำเข้า)'; }
    p.updated = Date.now(); p.photos = p.photos || {};
    await DB.put(p); S.projects.push(p); renderHome(); toast('นำเข้าโปรเจกต์แล้ว');
  } catch { toast('ไฟล์ไม่ถูกต้อง'); }
};

// ---------- demo ----------
function demoProject() {
  const p = newProject('สัมภาษณ์ · Founder Talk', 'Studio Hoya', new Date().toISOString().slice(0, 10));
  const sc = p.scenes[0];
  Object.assign(sc, { number: '1', name: 'สัมภาษณ์ – ห้องนั่งเล่น', location: 'บ้านลูกค้า · ห้องนั่งเล่น', time: 'กลางวัน', notes: 'โทนอบอุ่น ธรรมชาติ ให้แสงหน้าต่างเป็นแสงหลักของพื้นหลัง ปิดไฟเพดานทั้งหมด' });
  S.scene = sc;
  const W = (a, b) => sc.plan.walls.push({ id: uid(), a, b, t: .12 });
  W([-3, -2.5], [3, -2.5]); W([3, -2.5], [3, 2.5]); W([3, 2.5], [-3, 2.5]); W([-3, 2.5], [-3, -2.5]);
  const add = (t, x, y, rot, ex = {}) => { const it = makeItem(t, x, y, ex); it.rot = rot; sc.plan.items.push(it); return it; };
  add('window', .6, -2.5, 90, { label: 'หน้าต่างบานใหญ่', reach: 3.6 });
  add('door', -3, 1.5, 0);
  add('armchair', -.75, 0, 0); add('armchair', .75, 0, 180);
  add('talent', -.75, 0, 0, { label: 'ผู้สัมภาษณ์', color: '#2f7cf6' });
  const guest = add('talent', .75, 0, 180, { label: 'แขกรับเชิญ', color: '#f5a524' });
  add('coffee', 0, .95, 90, { s: .7 });
  add('plant', 2.5, -2, 0); add('cabinet', 2.72, .6, 180);
  add('practical', 2.55, 1.9, 0, { label: 'โคมตั้งพื้น', k: 2700, watt: 40 });
  add('hmi', .6, -4.4, 90, { label: 'Sun', model: 'ARRI M18 HMI', watt: 1800, beam: 34, reach: 8.5, dim: 80 });
  add('cob', 2.3, -1.55, 147, { label: 'Key', model: 'Aputure STORM 1200x', watt: 1200, mode: 'bicolor', k: 5600, dim: 70, gel: '¼ CTO', aim: guest.id });
  add('diffusion', 1.5, -.95, 145, { size: '8×8', fabric: '¼ Grid' });
  add('lantern', -2.1, -1.6, 37, { label: 'Fill', model: 'Aputure amaran 200x S', watt: 200, k: 4300, dim: 40 });
  add('fresnel', -2.2, 1.9, -30, { label: 'Back light', model: 'Nanlite Forza 500B II', watt: 500, k: 3200, dim: 55, beam: 25 });
  add('tube', -2.75, -.2, 0, { label: 'BG accent', model: 'Astera Titan Tube', s: 1, color: '#ff8a3d', dim: 60 });
  add('neg', 2.85, .9, 180, { size: '4×8', fabric: 'Solid / Duvetyne' });
  add('hazer', -2.4, 1.1, 0, {});
  const A = add('camera', -1.9, .55, -12, { label: 'A', body: 'Sony FX3', lens: 50, color: CAM_COLORS[0] });
  const B = add('camera', 1.85, .75, 198, { label: 'B', body: 'Sony FX30', sensor: 'apsc', lens: 56, color: CAM_COLORS[1] });
  const C = add('camera', 0, 2.05, -90, { label: 'C', body: 'BMPCC 6K', sensor: 's35', lens: 24, color: CAM_COLORS[2] });
  add('monitor', -1.6, 2.1, -60);
  sc.plan.draws.push({ id: uid(), type: 'dim', pts: [[-.75, -.55], [.75, -.55]] });
  sc.plan.draws.push({ id: uid(), type: 'text', pts: [[.6, -1.95]], text: 'แสงบ่ายเข้าทางนี้', color: '#2f7cf6' });
  sc.plan.draws.push({ id: uid(), type: 'arrow', pts: [[-.4, 2.05], [-.1, 1.95], [.3, 1.95], [.55, 2.05]], color: '#2f7cf6' });
  sc.shots = [
    { id: uid(), num: '1A', size: '2-Shot', angle: ANGLES[0], move: 'Truck / Slide', lens: 24, cam: C.id, subject: 'ทั้งสองคน', desc: 'Wide establishing สไลด์ช้าๆ จากซ้ายไปขวา เห็นหน้าต่างเป็นพื้นหลัง', setup: 'Setup A', notes: '', photo: null },
    { id: uid(), num: '1B', size: 'MCU', angle: ANGLES[0], move: 'Static', lens: 50, cam: A.id, subject: 'แขกรับเชิญ', desc: 'Single ของแขก มองข้ามไหล่ผู้สัมภาษณ์เล็กน้อย Key จากหน้าต่างฝั่งขวาเฟรม', setup: 'Setup A', notes: 'เช็คแสงสะท้อนแว่น', photo: null },
    { id: uid(), num: '1C', size: 'CU', angle: ANGLES[0], move: 'Static', lens: 56, cam: B.id, subject: 'ผู้สัมภาษณ์', desc: 'Reaction / คำถาม ของผู้สัมภาษณ์', setup: 'Setup A', notes: '', photo: null },
  ];
  // scene 2
  const s2 = newScene(2, 'B-roll – โต๊ะทำงาน'); s2.location = 'บ้านลูกค้า · ห้องทำงาน'; s2.time = 'เย็น / Golden hour';
  p.scenes.push(s2); S.scene = s2;
  const W2 = (a, b) => s2.plan.walls.push({ id: uid(), a, b, t: .12 });
  W2([-2, -1.75], [2, -1.75]); W2([2, -1.75], [2, 1.75]); W2([2, 1.75], [-2, 1.75]); W2([-2, 1.75], [-2, -1.75]);
  const add2 = (t, x, y, rot, ex = {}) => { const it = makeItem(t, x, y, ex); it.rot = rot; s2.plan.items.push(it); return it; };
  add2('window', 2, 0, 180, { label: 'หน้าต่างทิศตะวันตก', k: 3800, reach: 3.2 });
  add2('desk', .9, 0, 180); add2('chair', .25, 0, 0); add2('talent', .25, 0, 0, { label: 'Founder', color: '#f5a524' });
  add2('panel', -1.2, -1.2, 40, { label: 'Fill', watt: 60, k: 3800, dim: 30 });
  const A2 = add2('camera', -1.2, .9, -30, { label: 'A', body: 'Sony FX3', lens: 35, color: CAM_COLORS[0] });
  s2.plan.draws.push({ id: uid(), type: 'arrow', pts: [[-1.5, 1.3], [-1.1, 1.1], [-.7, .85]], color: '#e5484d' });
  s2.shots = [{ id: uid(), num: '2A', size: 'MS', angle: 'มุมสูง', move: 'Dolly in', lens: 35, cam: A2.id, subject: 'Founder ที่โต๊ะ', desc: 'Push-in ช้าๆ ขณะพิมพ์งาน แสงเย็นจากหน้าต่าง', setup: 'Setup B', notes: '', photo: null }];
  S.scene = null;
  return p;
}

// ---------- export: sheets ----------
const SW = 2480, SH = 1754, SM = 90;
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
// Minimal PDF writer: one full-page JPEG per page (A4 landscape). No external dependency, works offline.
async function pagesToPDF(canvases) {
  const enc = new TextEncoder(), chunks = [], offsets = [];
  let len = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const W = 841.89, H = 595.28, n = canvases.length;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const pageIds = canvases.map((_, i) => 3 + i * 3);
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pageIds.map(i => i + ' 0 R').join(' ')}] >>`));
  for (let i = 0; i < n; i++) {
    const c = canvases[i], id = pageIds[i];
    const jpg = new Uint8Array(await (await toBlob(c, 'image/jpeg', .9)).arrayBuffer());
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(id, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`));
    obj(id + 1, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(id + 2, () => { push(`<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push('\nendstream'); });
  }
  const total = 3 + n * 3, xref = len;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}
async function planCanvas(sc, bw, bh, { scaleBar = true, fitTo } = {}) {
  planSVG(sc, { px: .02, labels: true });
  const bb = fitTo || sceneBBox(sc);
  if (!bw) { const k = Math.min(3200 / bb.w, 3200 / bb.h, 260); bw = Math.round(bb.w * k); bh = Math.round(bb.h * k); }
  const k = Math.min(bw / bb.w, bh / bb.h);
  const c = document.createElement('canvas'); c.width = bw; c.height = bh;
  const ctx = c.getContext('2d');
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, bw, bh);
  const ox = (bw - bb.w * k) / 2 - bb.x * k, oy = (bh - bb.h * k) / 2 - bb.y * k;
  const bg = sc.plan.bg;
  if (bg && S.proj.photos[bg.ph]) {
    const im = await loadImg(S.proj.photos[bg.ph]);
    ctx.globalAlpha = bg.op ?? .6; ctx.drawImage(im, ox + bg.x * k, oy + bg.y * k, bg.w * k, bg.h * k); ctx.globalAlpha = 1;
  }
  const vb = [-ox / k, -oy / k, bw / k, bh / k];
  const s = `<svg xmlns="http://www.w3.org/2000/svg" width="${bw}" height="${bh}" viewBox="${vb.join(' ')}">${planSVG(sc, { px: 1 / k, grid: { x: Math.floor(vb[0]), y: Math.floor(vb[1]), w: vb[2] + 2, h: vb[3] + 2 }, noBg: true, labels: true })}</svg>`;
  const im = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s));
  ctx.drawImage(im, 0, 0, bw, bh);
  if (scaleBar) {
    let m = 1; while (m * k < 70) m *= 2;
    const x = 24, y = bh - 28;
    ctx.fillStyle = INK; ctx.fillRect(x, y, m * k, 6); ctx.fillStyle = '#fff'; ctx.fillRect(x + m * k / 2, y + 1, m * k / 2 - 1, 4);
    ctx.font = `600 ${Math.max(18, bw / 90)}px ${FONT}`; ctx.fillStyle = INK; ctx.fillText(`${m} m`, x + m * k + 10, y + 7);
  }
  return c;
}
function segs(t) {
  t = String(t || '');
  try { if (window.Intl?.Segmenter) return [...new Intl.Segmenter('th', { granularity: 'word' }).segment(t)].map(s => s.segment); } catch { }
  return t.split(/(\s+)/);
}
function wrap(ctx, t, w, max = 99) {
  const lines = []; let cur = '';
  for (const piece of String(t || '').split('\n')) {
    for (const s of segs(piece)) {
      if (ctx.measureText(cur + s).width > w && cur) { lines.push(cur.trimEnd()); cur = s.trimStart(); } else cur += s;
    }
    lines.push(cur); cur = '';
  }
  if (lines.length > max) { const l = lines.slice(0, max); l[max - 1] = l[max - 1].replace(/.{0,2}$/, '…'); return l; }
  return lines;
}
function coverDraw(ctx, im, x, y, w, h, r = 10) {
  ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); ctx.clip();
  const k = Math.max(w / im.width, h / im.height), iw = im.width * k, ih = im.height * k;
  ctx.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); ctx.restore();
}
function sheetHeader(ctx, sc, cont) {
  const p = S.proj;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SW, SH);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  ctx.fillStyle = '#86827a'; ctx.font = `500 30px ${FONT}`;
  ctx.fillText([p.name, p.client, p.date && fmtDate(p.date)].filter(Boolean).join('  ·  '), SM, SM + 20);
  ctx.fillStyle = INK; ctx.font = `700 66px ${FONT}`;
  ctx.fillText(sceneTitle(sc) + (cont ? '  (ต่อ)' : ''), SM, SM + 105);
  ctx.fillStyle = '#6b6860'; ctx.font = `500 32px ${FONT}`;
  ctx.fillText([sc.location, sc.time].filter(Boolean).join('  ·  '), SM, SM + 155);
  ctx.textAlign = 'right'; ctx.fillStyle = INK; ctx.font = `500 38px Outfit, ${FONT}`; ctx.fillText('dp plans', SW - SM, SM + 22);
  { const cx = SW - SM - ctx.measureText('dp plans').width - 40, cy = SM + 8, r = 26;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
    let g = ctx.createRadialGradient(cx + r * .6, cy + r * .6, 0, cx + r * .6, cy + r * .6, r * 2.2); g.addColorStop(0, '#8CC4FF'); g.addColorStop(.45, '#2F6BFF'); g.addColorStop(1, '#1B3FB8'); ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    g = ctx.createRadialGradient(cx - r * .4, cy - r * .4, 0, cx - r * .4, cy - r * .4, r * 1.5); g.addColorStop(0, '#FFD08A'); g.addColorStop(.4, '#FF8A2B'); g.addColorStop(1, 'rgba(255,138,43,0)'); ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + r, cy - r * .45); ctx.lineTo(cx + r, cy + r * .45); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r * .16, 0, 7); ctx.fill(); ctx.restore(); }
  ctx.fillStyle = '#86827a'; ctx.font = `500 24px ${FONT}`; ctx.fillText('Lighting & shot plan', SW - SM, SM + 54);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e6e2d9'; ctx.fillRect(SM, SM + 190, SW - SM * 2, 3);
}
function fmtDate(d) { try { return new Date(d + 'T00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }); } catch { return d; } }
async function sceneSheets(sc) {
  const top = SM + 225, bottom = SH - SM - 30;
  const photos = {};
  for (const s of sc.shots) if (s.photo && S.proj.photos[s.photo]) photos[s.id] = await loadImg(S.proj.photos[s.photo]).catch(() => null);
  const pages = [];
  const mk = cont => { const c = document.createElement('canvas'); c.width = SW; c.height = SH; const ctx = c.getContext('2d'); sheetHeader(ctx, sc, cont); pages.push(c); return ctx; };
  let ctx = mk(false);
  // ref still + palette (like a DP lighting breakdown), then the plan
  const pw = 1400;
  let ptop = top;
  const ref = sc.refs?.[0], refSrc = ref && S.proj.photos[ref.ph];
  if (refSrc) {
    const im = await loadImg(refSrc), rh = 520;
    coverDraw(ctx, im, SM, top, pw, rh, 18);
    if (ref.marks?.length) {
      const mk = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(marksSVG(ref).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="' + Math.round(1000 * ref.h / ref.w) + '" ')));
      // marks were drawn on the whole image: map them through the same cover crop
      const k = Math.max(pw / im.width, rh / im.height), iw = im.width * k, ih = im.height * k;
      ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(SM, top, pw, rh, 18) : ctx.rect(SM, top, pw, rh); ctx.clip();
      ctx.drawImage(mk, SM + (pw - iw) / 2, top + (rh - ih) / 2, iw, ih); ctx.restore();
    }
    const pal = ref.pal || [];
    pal.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(SM + i * pw / pal.length, top + rh + 12, pw / pal.length + 1, 34); });
    if (ref.note) { ctx.fillStyle = '#5b5a55'; ctx.font = `500 24px ${FONT}`; ctx.fillText(ref.note, SM, top + rh + 80); }
    ptop = top + rh + (ref.note ? 100 : 66);
  }
  const ph = bottom - ptop;
  const pc = await planCanvas(sc, pw, ph);
  ctx.save(); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(SM, ptop, pw, ph, 18) : ctx.rect(SM, ptop, pw, ph); ctx.clip(); ctx.drawImage(pc, SM, ptop); ctx.restore();
  ctx.strokeStyle = '#e1ddd3'; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(SM, ptop, pw, ph, 18) : ctx.rect(SM, ptop, pw, ph); ctx.stroke();
  // blocks
  const blocks = [];
  const head = (t, n) => blocks.push({ keep: true, h: () => 64, draw: (c, x, y, w) => { c.fillStyle = INK; c.font = `700 34px ${FONT}`; c.fillText(t, x, y + 40); if (n != null) { c.fillStyle = '#86827a'; c.font = `500 28px ${FONT}`; c.textAlign = 'right'; c.fillText(n, x + w, y + 40); c.textAlign = 'left'; } c.fillStyle = '#ece8e0'; c.fillRect(x, y + 56, w, 2); } });
  const line = (t, opts = {}) => blocks.push({
    h: (c, w) => { c.font = `${opts.w || 500} ${opts.size || 27}px ${FONT}`; return wrap(c, t, w - (opts.sw ? 36 : 0)).length * (opts.size || 27) * 1.45 + 10; },
    draw: (c, x, y, w) => {
      c.font = `${opts.w || 500} ${opts.size || 27}px ${FONT}`;
      if (opts.sw) { c.fillStyle = opts.sw; c.beginPath(); c.arc(x + 11, y + 22, 11, 0, 7); c.fill(); c.strokeStyle = '#0002'; c.lineWidth = 1; c.stroke(); }
      c.fillStyle = opts.color || '#3a3833';
      wrap(c, t, w - (opts.sw ? 36 : 0)).forEach((l, i) => c.fillText(l, x + (opts.sw ? 36 : 0), y + 30 + i * (opts.size || 27) * 1.45));
    }
  });
  head('ช็อต', `${sc.shots.length} ช็อต`);
  if (!sc.shots.length) line('— ยังไม่มีช็อต —', { color: '#9b978e' });
  sc.shots.forEach(sh => {
    const cam = sc.plan.items.find(i => i.id === sh.cam), col = cam?.color || '#8b8d98', im = photos[sh.id];
    blocks.push({
      h: () => 152,
      draw: (c, x, y, w) => {
        const tw = 210, th = 118;
        if (im) coverDraw(c, im, x, y + 8, tw, th);
        else { c.fillStyle = col; c.globalAlpha = .14; c.beginPath(); c.roundRect ? c.roundRect(x, y + 8, tw, th, 10) : c.rect(x, y + 8, tw, th); c.fill(); c.globalAlpha = 1; c.fillStyle = col; c.font = `700 30px ${FONT}`; c.textAlign = 'center'; c.fillText(cam ? 'CAM ' + cam.label : '—', x + tw / 2, y + 78); c.textAlign = 'left'; }
        const tx = x + tw + 24, tw2 = w - tw - 24;
        c.fillStyle = col; c.beginPath(); c.arc(tx + 10, y + 30, 10, 0, 7); c.fill();
        c.fillStyle = INK; c.font = `700 32px ${FONT}`; c.fillText(sh.num, tx + 30, y + 41);
        const nw = c.measureText(sh.num).width;
        c.font = `600 26px ${FONT}`; c.fillStyle = '#55524b';
        c.fillText([sh.size, sh.lens ? sh.lens + 'mm' : '', sh.move, cam ? 'Cam ' + cam.label : ''].filter(Boolean).join(' · '), tx + 30 + nw + 16, y + 40);
        c.font = `500 25px ${FONT}`; c.fillStyle = '#3a3833';
        wrap(c, [sh.subject, sh.desc].filter(Boolean).join(' — '), tw2, 2).forEach((l, i) => c.fillText(l, tx, y + 82 + i * 34));
        c.fillStyle = '#efebe3'; c.fillRect(x, y + 144, w, 2);
      }
    });
  });
  const people = sc.plan.items.filter(i => i.cat === 'person');
  if (people.length) { head('นักแสดง / คน', people.length); people.forEach(pp => line(itemName(pp) + (pp.type === 'crew' ? '  (ทีมงาน)' : ''), { sw: pp.color })); }
  const L = lights(sc);
  if (L.length) {
    head('ไฟ', `${L.reduce((a, l) => a + (+l.watt || 0), 0).toLocaleString()} W`);
    L.forEach(l => line(`${itemName(l)} — ${[l.model && l.label ? l.model : '', LIBMAP[l.type].name, l.watt + 'W', kText(l), l.gel && l.gel !== '—' ? l.gel : '', (l.dim ?? 100) + '%', l.mod !== '—' ? l.mod : ''].filter(Boolean).join(' · ')}`, { sw: lightColor(l), size: 25 }));
  }
  const grip = sc.plan.items.filter(i => i.cat === 'grip' || i.type === 'monitor');
  const C = cams(sc);
  if (C.length || grip.length) {
    head('กล้อง & กริป');
    C.forEach(c => line(`Cam ${c.label}${c.body ? ' · ' + c.body : ''} · ${c.lens}mm · ${SENSORS[c.sensor]?.[0] || ''}${c.height ? ' · สูง ' + c.height + ' m' : ''}`, { sw: c.color, size: 25 }));
    const g = {}; grip.forEach(x => { const n = LIBMAP[x.type].name; g[n] = (g[n] || 0) + 1; });
    if (grip.length) line(Object.entries(g).map(([n, c]) => `${n} ×${c}`).join(' · '), { size: 25 });
  }
  if (sc.notes) { head('โน้ต'); line(sc.notes, { size: 25 }); }
  // flow into columns
  let cols = [{ x: SM + pw + 60, y: top, w: SW - SM - (SM + pw + 60), h: bottom - top }], ci = 0, y = cols[0].y;
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi], nx = blocks[bi + 1];
    let col = cols[ci], h = b.h(ctx, col.w);
    const need = h + (b.keep && nx ? nx.h(ctx, col.w) : 0);
    if (y + need > col.y + col.h && y > col.y) {
      ci++;
      if (ci >= cols.length) { ctx = mk(true); const cw = (SW - SM * 2 - 100) / 2; cols = [{ x: SM, y: top, w: cw, h: bottom - top }, { x: SM + cw + 100, y: top, w: cw, h: bottom - top }]; ci = 0; }
      col = cols[ci]; y = col.y; h = b.h(ctx, col.w);
    }
    b.draw(ctx, col.x, y, col.w);
    y += h + 6;
  }
  return pages;
}
async function buildSheets(scenes) {
  await document.fonts?.ready;
  try { await document.fonts.load(`700 40px 'IBM Plex Sans Thai'`, 'ไทย'); await document.fonts.load(`500 40px 'IBM Plex Sans Thai'`, 'ไทย'); } catch { }
  const pages = [];
  for (const sc of scenes) pages.push(...await sceneSheets(sc));
  pages.forEach((c, i) => {
    const ctx = c.getContext('2d'); ctx.textAlign = 'right'; ctx.fillStyle = '#9b978e'; ctx.font = `500 24px ${FONT}`;
    ctx.fillText(`${i + 1} / ${pages.length}`, SW - SM, SH - SM + 40);
    ctx.textAlign = 'left'; ctx.fillText(`สร้างด้วย dp plans · ${new Date().toLocaleDateString('th-TH')}`, SM, SH - SM + 40);
  });
  return pages;
}
const toBlob = (c, type = 'image/png', q) => new Promise(r => c.toBlob(r, type, q));
const fileSafe = s => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 60) || 'dpplans';

function csvOf(scenes) {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Scene', 'Scene name', 'Location', 'Time', 'Shot', 'Size', 'Angle', 'Movement', 'Lens (mm)', 'Camera', 'Body', 'Subject', 'Description', 'Lighting setup', 'Notes']];
  scenes.forEach(sc => sc.shots.forEach(sh => { const c = sc.plan.items.find(i => i.id === sh.cam); rows.push([sc.number, sc.name, sc.location, sc.time, sh.num, sh.size, sh.angle, sh.move, sh.lens, c?.label || '', c?.body || '', sh.subject, sh.desc, sh.setup, sh.notes]); }));
  return '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
}
function gearOf(scenes) {
  const L = {}, Cm = {}, G = {};
  let maxW = 0;
  scenes.forEach(sc => {
    const sl = {}, sg = {};
    lights(sc).forEach(l => { const n = `${l.model || LIBMAP[l.type].name}${l.model ? '' : ' (' + l.watt + 'W)'}${l.mod && l.mod !== '—' ? ' + ' + l.mod : ''}`; sl[n] = (sl[n] || 0) + 1; });
    Object.entries(sl).forEach(([n, c]) => L[n] = Math.max(L[n] || 0, c));
    cams(sc).forEach(c => { const n = c.body || 'กล้อง ' + c.label; (Cm[n] = Cm[n] || new Set()).add(c.lens + 'mm'); });
    sc.plan.items.filter(i => i.cat === 'grip' || i.type === 'monitor').forEach(x => { const n = LIBMAP[x.type].name; sg[n] = (sg[n] || 0) + 1; });
    Object.entries(sg).forEach(([n, c]) => G[n] = Math.max(G[n] || 0, c));
    maxW = Math.max(maxW, lights(sc).reduce((a, l) => a + (+l.watt || 0), 0));
  });
  const p = S.proj;
  let t = `รายการอุปกรณ์ — ${p.name}${p.date ? ' (' + fmtDate(p.date) + ')' : ''}\n${scenes.length > 1 ? scenes.length + ' ซีน' : sceneTitle(scenes[0])}\n\n`;
  t += `ไฟ\n${Object.entries(L).map(([n, c]) => `  □ ${n} ×${c}`).join('\n') || '  —'}\n  กำลังไฟสูงสุดต่อซีน ≈ ${maxW.toLocaleString()} W (${(maxW / 220).toFixed(1)} A @220V)\n\n`;
  t += `กล้อง & เลนส์\n${Object.entries(Cm).map(([n, s]) => `  □ ${n} — เลนส์ ${[...s].join(', ')}`).join('\n') || '  —'}\n\n`;
  t += `กริป\n${Object.entries(G).map(([n, c]) => `  □ ${n} ×${c}`).join('\n') || '  —'}\n`;
  return t;
}

function openExport() {
  const many = S.proj.scenes.length > 1;
  let scope = 'scene';
  const m = modal(`<h3>ส่งออกให้ทีม ${closeX}</h3>
    ${many ? `<div class="seg" id="exScope"><button data-s="scene" class="on">ซีนนี้</button><button data-s="all">ทุกซีน (${S.proj.scenes.length})</button></div>` : ''}
    <div class="preview" id="exPrev"><small class="muted">กำลังสร้างตัวอย่าง…</small></div>
    <div class="exgrid">
      <button class="main" data-ex="pdf">PDF Breakdown<small>A4 แนวนอน · แปลนไฟ + shot list + ภาพบล็อก + รายการไฟ ซีนละหน้า</small></button>
      <button data-ex="sheet">ภาพสรุป (PNG)<small>แผ่นเดียวกับ PDF ส่งในแชตได้ทันที</small></button>
      <button data-ex="plan">ภาพแปลนอย่างเดียว<small>PNG ความละเอียดสูง</small></button>
      <button data-ex="csv">Shot list → Sheets<small>ไฟล์ CSV เปิดใน Google Sheets / Excel</small></button>
      <button data-ex="gear">รายการอุปกรณ์<small>เช็กลิสต์ไฟ กล้อง เลนส์ กริป</small></button>
      <button data-ex="json">ไฟล์โปรเจกต์<small>ส่งให้ทีมเปิดแก้ไขต่อใน DP Plans</small></button>
    </div><div class="ready" hidden id="exReady"></div>`, { wide: true });
  const scenes = () => scope === 'all' ? S.proj.scenes : [S.scene];
  const prev = async () => {
    const box = $('#exPrev', m);
    try { const [pg] = await buildSheets([S.scene]); pg.style.width = '100%'; box.innerHTML = ''; box.appendChild(pg); } catch (e) { box.innerHTML = '<small class="muted">สร้างตัวอย่างไม่ได้</small>'; console.error(e); }
  };
  prev();
  if (many) $('#exScope', m).onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; scope = b.dataset.s; $$('#exScope button', m).forEach(x => x.classList.toggle('on', x === b)); };
  const ready = $('#exReady', m);
  const offer = (files, label, extra = '') => {
    ready.hidden = false;
    ready.innerHTML = `<b>${label}</b>${extra}<div class="row"><button class="btn primary" id="rShare">แชร์ / AirDrop</button><button class="btn" id="rSave">บันทึกไฟล์</button></div>`;
    const canShare = navigator.canShare && navigator.canShare({ files });
    if (!canShare) $('#rShare', m).hidden = true;
    $('#rShare', m).onclick = () => navigator.share({ files, title: S.proj.name }).catch(() => { });
    $('#rSave', m).onclick = () => files.forEach((f, i) => setTimeout(() => { const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, i * 300));
    ready.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };
  $('.exgrid', m).onclick = async e => {
    const b = e.target.closest('[data-ex]'); if (!b) return;
    const kind = b.dataset.ex, sc = scenes(), base = fileSafe(S.proj.name + (scope === 'scene' ? ' - ' + sceneTitle(S.scene) : ''));
    ready.hidden = false; ready.innerHTML = '<b>กำลังสร้างไฟล์…</b>';
    try {
      if (kind === 'pdf') {
        const pages = await buildSheets(sc);
        offer([new File([await pagesToPDF(pages)], base + '.pdf', { type: 'application/pdf' })], `PDF พร้อมแล้ว · ${pages.length} หน้า`);
      } else if (kind === 'sheet') {
        const pages = await buildSheets(sc);
        const files = await Promise.all(pages.map(async (c, i) => new File([await toBlob(c)], `${base}${pages.length > 1 ? '-' + (i + 1) : ''}.png`, { type: 'image/png' })));
        offer(files, `ภาพสรุปพร้อมแล้ว · ${files.length} ภาพ`);
      } else if (kind === 'plan') {
        const files = [];
        for (const s of sc) { const c = await planCanvas(s); files.push(new File([await toBlob(c)], fileSafe(S.proj.name + ' - ' + sceneTitle(s) + ' - plan') + '.png', { type: 'image/png' })); }
        offer(files, `ภาพแปลนพร้อมแล้ว · ${files.length} ภาพ`);
      } else if (kind === 'csv') {
        offer([new File([csvOf(sc)], base + ' - shot list.csv', { type: 'text/csv' })], 'Shot list (CSV) พร้อมแล้ว', '<p class="muted" style="margin:0 0 8px;font-size:13px">Google Sheets: ไฟล์ → นำเข้า → อัปโหลดไฟล์นี้</p>');
      } else if (kind === 'gear') {
        const t = gearOf(sc);
        offer([new File([t], base + ' - gear list.txt', { type: 'text/plain' })], 'รายการอุปกรณ์', `<textarea readonly style="width:100%;min-height:180px;border-radius:10px;border:1px solid var(--line);background:var(--surface);padding:10px;font-size:13px;margin-bottom:8px">${esc(t)}</textarea><button class="btn sm" id="rCopy" style="margin-bottom:8px">คัดลอกข้อความ</button>`);
        $('#rCopy', m).onclick = () => navigator.clipboard.writeText(t).then(() => toast('คัดลอกแล้ว'), () => toast('คัดลอกไม่ได้'));
      } else if (kind === 'json') {
        gcPhotos(S.proj);
        offer([new File([JSON.stringify({ app: 'dpplans', v: 1, project: S.proj })], fileSafe(S.proj.name) + '.dpplans.json', { type: 'application/json' })], 'ไฟล์โปรเจกต์พร้อมแล้ว', '<p class="muted" style="margin:0 0 8px;font-size:13px">ทีมเปิด DP Plans → นำเข้าไฟล์โปรเจกต์</p>');
      }
    } catch (err) {
      console.error(err);
      ready.innerHTML = `<b>สร้างไฟล์ไม่สำเร็จ</b><small class="muted">${esc(err.message || err)}</small>`;
    }
  };
}

// ---------- boot ----------
(async function boot() {
  try { await DB.open(); } catch { toast('เบราว์เซอร์นี้บันทึกข้อมูลไม่ได้ ข้อมูลจะหายเมื่อปิดหน้า'); }
  const kit = await DB.getMeta('kit').catch(() => null);
  if (Array.isArray(kit)) S.kit = kit;
  const sn = await DB.getMeta('snaps').catch(() => null);
  if (sn) Object.assign(S.snaps, sn);
  await loadProjects();
  renderTools();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => { });
})();
window.addEventListener('pagehide', () => { if (S.proj) DB.put(S.proj); });
