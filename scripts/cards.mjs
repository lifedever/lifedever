/**
 * 项目卡片 + 技术栈条。
 *
 * 两个关键决定：
 * 1. 卡片底色必须比页面底色亮一级 —— 之前两者都是 #0d1117，只靠 1px 边框区分，
 *    视觉上是"陷进去的框"而不是"浮起来的卡片"，这是上一版显素的主因。
 * 2. 用各 App 的真实图标（base64 内嵌）。SVG 以 <img> 加载时引用外部图片会被拦，
 *    只有 data URI 能显示。
 */
import { readFileSync } from "node:fs";

const D = JSON.parse(readFileSync(new URL("../assets/data.json", import.meta.url), "utf8"));
const ICONS = JSON.parse(readFileSync(new URL("../assets/icons.json", import.meta.url), "utf8"));

const UI = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export const CARD_DARK = {
  page: "#0d1117", bg: "#161b22", bgTop: "#1c232c", border: "#30363d",
  fg: "#e6edf3", dim: "#9198a1", faint: "#7d8590",
  chip: "#21262d", chipBorder: "#30363d", star: "#e3b341",
};
export const CARD_LIGHT = {
  page: "#ffffff", bg: "#f6f8fa", bgTop: "#fdfdfe", border: "#d1d9e0",
  fg: "#1f2328", dim: "#59636e", faint: "#6e7781",
  chip: "#ffffff", chipBorder: "#d1d9e0", star: "#9a6700",
};

/* Helvetica advance width 表（em/1000）—— SVG 没有 measureText，
   右对齐、折行、chip 宽度全靠它；估宽一点比估窄安全 */
const AW = {
  " ": 278, "-": 333, ".": 278, ",": 278, "·": 333, "★": 1000, "/": 278, "+": 584, "&": 667,
  A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611,
  U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222,
  k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278,
  u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};
for (const d of "0123456789") AW[d] = 556;
const measure = (text, size, weight = 400) => {
  const bold = weight >= 700 ? 1.075 : weight >= 600 ? 1.04 : 1;
  let sum = 0;
  for (const ch of String(text)) sum += AW[ch] ?? (ch.codePointAt(0) > 0x2e80 ? 1000 : 556);
  return (sum / 1000) * size * bold;
};
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** 按可用宽度折行，超出行数就省略号 —— 卡片高度固定，不能让文字溢出 */
function wrap(text, maxW, size, maxLines = 2) {
  const lines = [];
  let cur = "";
  for (const w of text.split(" ")) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next, size) <= maxW) { cur = next; continue; }
    lines.push(cur);
    cur = w;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) lines.push(cur);
  if (lines.length === maxLines && lines.join(" ").length < text.length) {
    let last = lines[maxLines - 1];
    while (last.length > 1 && measure(last + "…", size) > maxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last.trimEnd() + "…";
  }
  return lines;
}

const CW = 300, CH = 126, GAP = 10;   // GAP 做进画布高度当外边距，GitHub 上没法给 div 设 line-height

/** claude-rules 没有 App 图标，画一个「规则清单」符号顶上 */
function rulesGlyph(x, y, s) {
  const u = s / 48;
  return `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${11 * u}" fill="#8957e5"/>
    <g stroke="#fff" stroke-width="${2.6 * u}" stroke-linecap="round" fill="none" opacity="0.95">
      <path d="M${x + 14 * u} ${y + 17 * u} h${20 * u}"/>
      <path d="M${x + 14 * u} ${y + 25 * u} h${20 * u}"/>
      <path d="M${x + 14 * u} ${y + 33 * u} h${11 * u}"/>
    </g>
    <circle cx="${x + 35 * u}" cy="${y + 33 * u}" r="${6.5 * u}" fill="#3fb950"/>
    <path d="M${x + 32 * u} ${y + 33 * u} l${2.2 * u} ${2.4 * u} l${4.2 * u} ${-4.6 * u}" stroke="#fff" stroke-width="${1.9 * u}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

export function card(p, t) {
  const pad = 16, icon = 48;
  const tx = pad + icon + 14;                 // 文字起始 x
  const starTxt = p.stars > 0 ? `★ ${p.stars}` : "";
  const starW = starTxt ? measure(starTxt, 12, 600) : 0;
  const textW = CW - tx - pad;
  const desc = wrap(p.desc, textW, 11.5, 2);

  let cx = pad;
  const tags = p.tags.map((tag) => {
    const w = measure(tag.label, 10.5, 500) + (tag.color ? 21 : 15);
    const el = `<g>
      <rect x="${cx.toFixed(1)}" y="${CH - 30}" width="${w.toFixed(1)}" height="18" rx="9" fill="${t.chip}" stroke="${t.chipBorder}" stroke-width="0.8"/>
      ${tag.color ? `<circle cx="${(cx + 9.5).toFixed(1)}" cy="${CH - 21}" r="3.6" fill="${tag.color}"/>` : ""}
      <text x="${(cx + (tag.color ? 18 : 8)).toFixed(1)}" y="${CH - 17.5}" font-family="${UI}" font-size="10.5" font-weight="500" fill="${t.dim}">${esc(tag.label)}</text>
    </g>`;
    cx += w + 6;
    return el;
  }).join("");

  const art = p.slug === "claude-rules"
    ? rulesGlyph(pad, pad, icon)
    : `<image x="${pad}" y="${pad}" width="${icon}" height="${icon}" href="${ICONS[p.slug]}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CW}" height="${CH + GAP}" viewBox="0 0 ${CW} ${CH + GAP}" fill="none" role="img" aria-label="${esc(p.name)} — ${esc(p.desc)}">
<defs>
  <linearGradient id="cbg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="${t.bgTop}"/><stop offset="1" stop-color="${t.bg}"/>
  </linearGradient>
</defs>
<rect x="0.5" y="0.5" width="${CW - 1}" height="${CH - 1}" rx="10" fill="url(#cbg)" stroke="${t.border}"/>
${art}
<text x="${tx}" y="${pad + 16}" font-family="${UI}" font-size="14.5" font-weight="600" fill="${t.fg}">${esc(p.name)}</text>
${starTxt ? `<text x="${CW - pad}" y="${pad + 16}" font-family="${UI}" font-size="12" font-weight="600" fill="${t.star}" text-anchor="end">${starTxt}</text>` : ""}
${desc.map((l, i) => `<text x="${tx}" y="${pad + 36 + i * 15}" font-family="${UI}" font-size="11.5" fill="${t.dim}">${esc(l)}</text>`).join("")}
${tags}
</svg>
`;
}

/** 技术栈：按层分组，每组一行标签 —— 平铺一长条 chip 只是标签云，看不出结构 */
export function stackStrip(t, groups) {
  const pad = 18, LH = 30, labelW = 78;
  const H = pad * 2 + groups.length * LH - 8;
  let W = 0;

  const rows = groups.map((g, gi) => {
    let x = pad + labelW;
    const chips = g.items.map((it) => {
      const w = measure(it.label, 11.5, 500) + (it.color ? 24 : 18);
      const el = `<g opacity="0">
        <rect x="${x.toFixed(1)}" y="${pad + gi * LH}" width="${w.toFixed(1)}" height="21" rx="10.5" fill="${t.chip}" stroke="${t.chipBorder}" stroke-width="0.8"/>
        ${it.color ? `<circle cx="${(x + 11).toFixed(1)}" cy="${pad + gi * LH + 10.5}" r="3.8" fill="${it.color}"/>` : ""}
        <text x="${(x + (it.color ? 19.5 : 9)).toFixed(1)}" y="${pad + gi * LH + 14.5}" font-family="${UI}" font-size="11.5" font-weight="500" fill="${t.fg}">${esc(it.label)}</text>
        <animate attributeName="opacity" values="0;1" dur="0.4s" begin="${(0.1 + gi * 0.12 + g.items.indexOf(it) * 0.05).toFixed(2)}s" fill="freeze"/>
      </g>`;
      x += w + 6;
      return el;
    }).join("");
    W = Math.max(W, x);
    return `<text x="${pad}" y="${pad + gi * LH + 14.5}" font-family="${UI}" font-size="10" font-weight="700" fill="${t.faint}" letter-spacing="1">${g.label}</text>${chips}`;
  }).join("");

  W = Math.ceil(W - 6 + pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="Stack: ${groups.flatMap((g) => g.items.map((i) => i.label)).join(", ")}">
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
${rows}
</svg>
`;
}

/** 三个汇总数字，带竖分隔线 */
export function statStrip(t) {
  const H = 52, pad = 22, gap = 34;
  const items = [
    [`${D.totals.repos}`, "PUBLIC REPOS"],
    [D.totals.stars.toLocaleString("en-US"), "STARS EARNED"],
    [`${D.user.years}`, "YEARS SHIPPING"],
  ];
  let x = pad;
  const parts = items.map(([v, l], i) => {
    const vw = measure(v, 19, 700), lw = measure(l, 9.5, 600) + l.length * 0.9;
    const w = Math.max(vw, lw);
    const el = `<g opacity="0">
      <text x="${x.toFixed(1)}" y="${pad + 4}" font-family="${UI}" font-size="19" font-weight="700" fill="${t.fg}">${v}</text>
      <text x="${x.toFixed(1)}" y="${pad + 19}" font-family="${UI}" font-size="9.5" font-weight="600" fill="${t.faint}" letter-spacing="0.9">${l}</text>
      <animate attributeName="opacity" values="0;1" dur="0.45s" begin="${(0.1 + i * 0.1).toFixed(2)}s" fill="freeze"/>
    </g>`;
    x += w + gap;
    const sep = i < items.length - 1
      ? `<line x1="${(x - gap / 2).toFixed(1)}" y1="12" x2="${(x - gap / 2).toFixed(1)}" y2="${H - 12}" stroke="${t.border}"/>`
      : "";
    return el + sep;
  }).join("");
  const W = Math.ceil(x - gap + pad);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="${D.totals.repos} public repos, ${D.totals.stars} stars earned, ${D.user.years} years shipping">
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
${parts}
</svg>
`;
}

const SWIFT = "#F05138", TS = "#3178c6", RUST = "#dea584", JS = "#f1e05a", JAVA = "#b07219", CF = "#f38020";

export const CARDS = [
  { slug: "tasktick", name: "TaskTick", stars: 458, desc: "Cron-driven task runner that lives in the menu bar.",
    tags: [{ label: "Swift", color: SWIFT }, { label: "macOS" }] },
  { slug: "healthtick", name: "HealthTick", stars: 439, desc: "Break reminders that get you out of the chair.",
    tags: [{ label: "Swift", color: SWIFT }, { label: "macOS" }] },
  { slug: "pastememo", name: "PasteMemo", stars: 291, desc: "Clipboard history with OCR and instant search.",
    tags: [{ label: "Swift", color: SWIFT }, { label: "macOS" }] },
  { slug: "claude-rules", name: "claude-rules", stars: 189, desc: "Coding standards for AI assistants.",
    tags: [{ label: "Claude Code" }, { label: "Cursor" }] },
  { slug: "paperbox", name: "Paperbox", stars: null, desc: "Local PDF toolbox. Nothing leaves your machine.",
    tags: [{ label: "Rust", color: RUST }, { label: "Tauri" }] },
  { slug: "markify", name: "Markify", stars: null, desc: "Any document to clean Markdown, offline.",
    tags: [{ label: "Rust", color: RUST }, { label: "Tauri" }] },
];

export const STACK = [
  { label: "DESKTOP", items: [{ label: "Swift", color: SWIFT }, { label: "SwiftUI", color: SWIFT }, { label: "Tauri", color: RUST }, { label: "Rust", color: RUST }] },
  { label: "WEB", items: [{ label: "TypeScript", color: TS }, { label: "Vue", color: "#41b883" }, { label: "Node.js", color: JS }] },
  { label: "BACKEND", items: [{ label: "Java", color: JAVA }, { label: "Spring Boot", color: JAVA }, { label: "Cloudflare Workers", color: CF }, { label: "Docker", color: "#384d54" }] },
];
