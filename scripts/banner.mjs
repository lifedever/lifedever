/**
 * GitHub profile banner —— 24 小时提交时钟 + 一年贡献热力图。
 *
 * 约束：GitHub 用 <img> 加载 SVG，所以禁 JS、禁外部字体，
 * 动画只能靠 SMIL + 内联 CSS。数据全部来自 assets/data.json。
 */
import { readFileSync } from "node:fs";

const D = JSON.parse(readFileSync(new URL("../assets/data.json", import.meta.url), "utf8"));

const MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const UI = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const W = 880;
const num = (x) => x.toLocaleString("en-US");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const DARK = {
  fg: "#e6edf3", dim: "#8b949e", faint: "#6e7681", line: "#21262d",
  accent: "#2f81f7", bar: "#238636", barOpacity: 0.62,
  empty: "#151b23", levels: ["#0e4429", "#006d32", "#26a641", "#39d353"],
};
export const LIGHT = {
  fg: "#1f2328", dim: "#59636e", faint: "#818b98", line: "#d1d9e0",
  accent: "#0969da", bar: "#2da44e", barOpacity: 0.78,   // 浅底上要更实一点才压得住
  empty: "#ebedf0", levels: ["#9be9a8", "#40c463", "#30a14e", "#216e39"],
};

/**
 * 淡入 + 上浮。
 * ⚠️ animateTransform 是 replace 语义：目标 <g> 自己若带 transform 会被覆盖，
 *    那种情况要把定位 transform 套在外层 <g>。
 */
const fadeIn = ({ begin = 0, dur = 0.5, dy = 8 }) =>
  `<animate attributeName="opacity" values="0;1" dur="${dur}s" begin="${begin}s" fill="freeze"/>
   <animateTransform attributeName="transform" type="translate" values="0 ${dy};0 0" dur="${dur}s" begin="${begin}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.22 1 0.36 1"/>`;

/* 分级用分位数而非固定阈值：单日最高 107，写死「10+ 满格」会让高强度期糊成一片同色 */
const positives = D.calendar.weeks.flatMap((w) => w.days).map((d) => d.n).filter((x) => x > 0).sort((a, b) => a - b);
const q = (p) => positives[Math.floor(positives.length * p)] || 1;
const CUTS = [q(0.25), q(0.5), q(0.75)];
const levelOf = (c) => (c === 0 ? -1 : c <= CUTS[0] ? 0 : c <= CUTS[1] ? 1 : c <= CUTS[2] ? 2 : 3);

/** 贡献热力图。371 个格子用 CSS animation-delay 逐列点亮 —— 换成 SMIL 会让体积翻三倍 */
function heatmap({ x0, y0, cell, gap, t, begin }) {
  const step = cell + gap;
  const weeks = D.calendar.weeks;
  let cells = "", months = "", lastMonth = -1;

  weeks.forEach((w, ci) => {
    const m = new Date(w.firstDay + "T00:00:00Z").getUTCMonth();
    if (m !== lastMonth && w.days.length && ci < weeks.length - 1 && (lastMonth === -1 || ci > 2)) {
      months += `<text x="${x0 + ci * step}" y="${y0 - 8}" font-family="${UI}" font-size="10.5" fill="${t.faint}">${MONTHS[m]}</text>`;
      lastMonth = m;
    }
    for (const d of w.days) {
      const lv = levelOf(d.n);
      cells += `<rect class="hc" x="${x0 + ci * step}" y="${y0 + d.wd * step}" width="${cell}" height="${cell}" rx="${(cell * 0.23).toFixed(1)}" fill="${lv < 0 ? t.empty : t.levels[lv]}" style="animation-delay:${(begin + ci * 0.016).toFixed(3)}s"/>`;
    }
  });

  return {
    body: `<g opacity="0">${fadeIn({ begin: begin - 0.15, dur: 0.4, dy: 0 })}${months}</g>${cells}`,
    w: weeks.length * step - gap,
    h: 7 * step - gap,
    endDelay: begin + weeks.length * 0.016,
  };
}

export function banner(t) {
  const r = D.rhythm;
  const CX = 152, CY = 132, R0 = 40, R1 = 86;
  const maxHour = Math.max(...r.hours);

  // 每小时一个 15° 扇形，12 点方向为 0 时；半径按该小时提交量伸缩
  const wedges = r.hours.map((v, i) => {
    const a0 = (i * 15 - 90 - 6.4) * (Math.PI / 180);
    const a1 = (i * 15 - 90 + 6.4) * (Math.PI / 180);
    const rr = R0 + Math.max(3, (v / maxHour) * (R1 - R0)); // 3px 保底：凌晨 0 提交也要有存在感
    const on = i === r.peakHour;
    const p = (rad, ang) => `${(CX + rad * Math.cos(ang)).toFixed(1)} ${(CY + rad * Math.sin(ang)).toFixed(1)}`;
    const grown = `M${p(R0, a0)} L${p(rr, a0)} A${rr} ${rr} 0 0 1 ${p(rr, a1)} L${p(R0, a1)} A${R0} ${R0} 0 0 0 ${p(R0, a0)} Z`;
    const flat = `M${p(R0, a0)} L${p(R0, a0)} A${R0} ${R0} 0 0 1 ${p(R0, a1)} L${p(R0, a1)} A${R0} ${R0} 0 0 0 ${p(R0, a0)} Z`;
    return `<path d="${flat}" fill="${on ? t.accent : t.bar}" opacity="${on ? 1 : t.barOpacity}">
      <animate attributeName="d" values="${flat};${grown}" dur="0.6s" begin="${(0.3 + i * 0.035).toFixed(2)}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines="0.16 1 0.3 1"/>
    </path>`;
  }).join("");

  const marks = [0, 6, 12, 18].map((i) => {
    const a = (i * 15 - 90) * (Math.PI / 180);
    return `<text x="${(CX + (R1 + 20) * Math.cos(a)).toFixed(1)}" y="${(CY + (R1 + 20) * Math.sin(a) + 4).toFixed(1)}" font-family="${MONO}" font-size="10.5" fill="${t.faint}" text-anchor="middle">${String(i).padStart(2, "0")}</text>`;
  }).join("");

  const RX = 300;          // 右侧文字栏，避开时钟外圈刻度
  const HEAT_Y = 274;      // 必须低于时钟底部刻度 (CY+R1+20=238)，否则和月份标签叠字
  const hm = heatmap({ x0: 88, y0: HEAT_Y, cell: 11, gap: 3, t, begin: 1.1 });
  const H = HEAT_Y + hm.h + 46;

  const stats = [
    [num(D.totals.contributions), "contributions this year"],
    [`${r.longestStreak} days`, "longest streak"],
    [`${r.bestDay} commits`, "best single day"],
    [`${r.activeDays}/${r.totalDays}`, "days with code"],
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" role="img" aria-label="${D.user.name} — ${num(D.totals.contributions)} contributions in the last year, peak commit hour ${r.peakHour}:00">
<style>
text{-webkit-font-smoothing:antialiased}
.hc{opacity:0;animation:hp .4s cubic-bezier(.34,1.4,.64,1) forwards;transform-origin:center;transform-box:fill-box}
@keyframes hp{from{opacity:0;transform:scale(.55)}to{opacity:1;transform:scale(1)}}
</style>

<g opacity="0">${fadeIn({ begin: 0, dur: 0.5, dy: 6 })}
  <text x="${RX}" y="64" font-family="${UI}" font-size="22" font-weight="700" fill="${t.fg}">${D.user.name || D.user.login}</text>
  <text x="${RX}" y="86" font-family="${UI}" font-size="13" fill="${t.dim}">Independent developer · shipping since ${D.user.since}</text>
</g>

<circle cx="${CX}" cy="${CY}" r="${R0 - 1}" fill="none" stroke="${t.line}" stroke-width="1"/>
<circle cx="${CX}" cy="${CY}" r="${R1}" fill="none" stroke="${t.line}" stroke-width="1" stroke-dasharray="2 5" opacity="0.7"/>
${wedges}
${marks}
<g opacity="0">${fadeIn({ begin: 1.0, dur: 0.5, dy: 0 })}
  <text x="${CX}" y="${CY - 2}" font-family="${UI}" font-size="21" font-weight="700" fill="${t.fg}" text-anchor="middle">${String(r.peakHour).padStart(2, "0")}:00</text>
  <text x="${CX}" y="${CY + 15}" font-family="${UI}" font-size="8.5" font-weight="600" fill="${t.faint}" text-anchor="middle" letter-spacing="0.8">PEAK HOUR</text>
</g>

${stats.map(([v, l], i) => {
  const cx = RX + (i % 2) * 270, cy = 132 + Math.floor(i / 2) * 52;
  return `<g opacity="0">
    <text x="${cx}" y="${cy}" font-family="${UI}" font-size="21" font-weight="600" fill="${t.fg}">${v}</text>
    <text x="${cx}" y="${cy + 17}" font-family="${UI}" font-size="11" fill="${t.faint}">${l}</text>
    ${fadeIn({ begin: 0.5 + i * 0.1, dur: 0.45, dy: 6 })}
  </g>`;
}).join("")}

${hm.body}
<g opacity="0">${fadeIn({ begin: hm.endDelay + 0.2, dur: 0.5, dy: 4 })}
  <text x="88" y="${H - 18}" font-family="${MONO}" font-size="11.5" fill="${t.faint}">${D.calendar.from} → ${D.calendar.to}</text>
  <text x="${W - 88}" y="${H - 18}" font-family="${MONO}" font-size="11.5" fill="${t.faint}" text-anchor="end">${r.busiestWeekday}s are busiest</text>
</g>
</svg>
`;
}
