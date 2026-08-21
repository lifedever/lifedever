/**
 * 抓取渲染 banner 所需的全部真实数据 → assets/data.json
 *
 * 本地跑：GITHUB_TOKEN=$(gh auth token) node scripts/fetch-data.mjs
 * CI 跑：Actions 注入 GITHUB_TOKEN（需要 read:user 权限拿 contributionsCollection）
 *
 * 渲染层只读 data.json，不碰网络 —— 这样改样式不用重新请求 API。
 */
import { writeFileSync } from "node:fs";

const LOGIN = process.env.GH_LOGIN || "lifedever";
const TZ_OFFSET = +(process.env.TZ_OFFSET ?? 8); // 作息按本地时区还原，committedDate 是 UTC
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error("缺少 GITHUB_TOKEN。本地跑：GITHUB_TOKEN=$(gh auth token) node scripts/fetch-data.mjs");
  process.exit(1);
}

async function gql(query, variables = {}) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

/* ── 1. 账号基本信息 + 贡献日历 ───────────────────────── */
const base = await gql(`
  query($login: String!) {
    user(login: $login) {
      id name login createdAt
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks { firstDay contributionDays { date contributionCount weekday } }
        }
      }
    }
  }`, { login: LOGIN });

const u = base.user;
const cal = u.contributionsCollection.contributionCalendar;
const weeks = cal.weeks.map((w) => ({
  firstDay: w.firstDay,
  days: w.contributionDays.map((d) => ({ date: d.date, n: d.contributionCount, wd: d.weekday })),
}));
const days = weeks.flatMap((w) => w.days);

/* ── 2. 连续提交：最长 / 当前 ─────────────────────────── */
let longest = 0, run = 0;
for (const d of days) {
  run = d.n > 0 ? run + 1 : 0;
  if (run > longest) longest = run;
}
// 当前连续从最后一天往回数；最后一天还没提交不算断（当天可能还没开始写）
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].n > 0) current++;
  else if (i !== days.length - 1) break;
}

const weekday = [0, 0, 0, 0, 0, 0, 0];
for (const d of days) weekday[d.wd] += d.n;

/* ── 3. 提交时段：按仓库取样，还原成本地作息 ───────────── */
const repoBatch = await gql(`
  query($login: String!, $id: ID!) {
    user(login: $login) {
      repositories(first: 20, orderBy: {field: PUSHED_AT, direction: DESC},
                   ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) {
        nodes {
          name
          defaultBranchRef {
            target { ... on Commit { history(first: 100, author: {id: $id}) { nodes { committedDate } } } }
          }
        }
      }
    }
  }`, { login: LOGIN, id: u.id });

const hours = Array(24).fill(0);
let sampled = 0;
for (const r of repoBatch.user.repositories.nodes) {
  for (const c of r.defaultBranchRef?.target?.history?.nodes ?? []) {
    const t = new Date(c.committedDate);           // 恒为 UTC（以 Z 结尾）
    hours[(t.getUTCHours() + TZ_OFFSET + 24) % 24]++;
    sampled++;
  }
}

/* ── 4. 语言分布：按代码字节数，比按仓库数真实得多 ─────── */
const langMap = new Map();
let stars = 0, repoCount = 0, cursor = null, totalRepos = 0;
// 必须翻页 —— 只取 first:100 会把 128 个仓库统计成 100，star 总数也少算
do {
  const page = await gql(`
    query($login: String!, $cursor: String) {
      user(login: $login) {
        repositories(first: 100, after: $cursor, ownerAffiliations: OWNER,
                     isFork: false, privacy: PUBLIC,
                     orderBy: {field: PUSHED_AT, direction: DESC}) {
          totalCount
          pageInfo { hasNextPage endCursor }
          nodes {
            stargazerCount
            languages(first: 8, orderBy: {field: SIZE, direction: DESC}) {
              edges { size node { name color } }
            }
          }
        }
      }
    }`, { login: LOGIN, cursor });
  const repos = page.user.repositories;
  totalRepos = repos.totalCount;
  for (const r of repos.nodes) {
    repoCount++;
    stars += r.stargazerCount;
    for (const e of r.languages.edges) {
      const cur = langMap.get(e.node.name) ?? { name: e.node.name, color: e.node.color, size: 0 };
      cur.size += e.size;
      langMap.set(e.node.name, cur);
    }
  }
  cursor = repos.pageInfo.hasNextPage ? repos.pageInfo.endCursor : null;
} while (cursor);
if (repoCount !== totalRepos) throw new Error(`翻页不全: 拿到 ${repoCount}/${totalRepos}`);
const totalBytes = [...langMap.values()].reduce((a, b) => a + b.size, 0);
const languages = [...langMap.values()]
  .sort((a, b) => b.size - a.size)
  .slice(0, 6)
  .map((l) => ({ ...l, pct: +((l.size / totalBytes) * 100).toFixed(1) }));

/* ── 5. 汇总 ─────────────────────────────────────────── */
const peakHour = hours.indexOf(Math.max(...hours));
const activeDays = days.filter((d) => d.n > 0).length;
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const data = {
  generatedAt: new Date().toISOString().slice(0, 10),
  user: {
    login: u.login, name: u.name,
    since: +u.createdAt.slice(0, 4),
    // 满周年才算：单纯减年份会把 2012-12 注册的账号在 2026-08 说成 14 年
    years: (() => {
      const c = new Date(u.createdAt), now = new Date();
      let y = now.getUTCFullYear() - c.getUTCFullYear();
      const m = now.getUTCMonth() - c.getUTCMonth();
      if (m < 0 || (m === 0 && now.getUTCDate() < c.getUTCDate())) y--;
      return y;
    })(),
  },
  totals: { repos: repoCount, stars, contributions: cal.totalContributions },
  calendar: { weeks, from: days[0].date, to: days.at(-1).date },
  rhythm: {
    hours, sampled, peakHour,
    weekday, busiestWeekday: WD[weekday.indexOf(Math.max(...weekday))],
    longestStreak: longest, currentStreak: current,
    activeDays, totalDays: days.length,
    bestDay: Math.max(...days.map((d) => d.n)),
  },
  languages,
};

writeFileSync(new URL("../assets/data.json", import.meta.url), JSON.stringify(data, null, 2));
console.log(`✓ assets/data.json
  贡献      ${data.totals.contributions} (${activeDays}/${days.length} 天有提交)
  连续      最长 ${longest} 天 · 当前 ${current} 天
  单日最高  ${data.rhythm.bestDay}
  作息      峰值 ${peakHour}:00 · ${data.rhythm.busiestWeekday} 最活跃 (采样 ${sampled} commits)
  语言      ${languages.map((l) => `${l.name} ${l.pct}%`).join(" · ")}`);
