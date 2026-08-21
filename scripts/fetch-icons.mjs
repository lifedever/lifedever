/**
 * 抓取各项目的真实 App 图标，统一渲染成 96×96 PNG，base64 存进 assets/icons.json。
 *
 * 只在本地手动跑（依赖 macOS 的 sips 和本机 Chrome），不进 CI —— 图标很少变，
 * icons.json 直接提交进仓库。加新项目卡片时才需要重跑。
 *
 * 为什么必须内嵌 base64：SVG 被 GitHub 以 <img> 加载时处于受限模式，
 * 图内引用外部资源（<image href="./x.png">）会被浏览器拦掉，只有 data URI 能显示。
 *
 * 为什么统一转 PNG 而不是内联 SVG：各家图标的 <defs> id、渐变、滤镜混进同一张卡片
 * 容易撞 id；转位图一劳永逸，96px 在 48px 显示位上是 2x，Retina 也清晰。
 */
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const TMP = "/tmp/profile-icons";
mkdirSync(TMP, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SIZE = 96;

const SOURCES = [
  { slug: "tasktick", repo: "TaskTick", path: "docs/icon.svg" },
  { slug: "healthtick", repo: "health-tick-release", path: "logo.svg" },
  { slug: "pastememo", repo: "PasteMemo-app", path: "Sources/Resources/icons/128x128@2x.png" },
  { slug: "paperbox", repo: "paperbox", path: "assets/icon.png" },
  { slug: "markify", repo: "markify", path: "assets/logo.svg" },
  { slug: "cronpilot", repo: "CronPilot", path: "src-tauri/icons/128x128@2x.png" },
];

const gh = (args) => execFileSync("gh", args, { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });

const icons = {};
for (const s of SOURCES) {
  const raw = `${TMP}/${s.slug}${s.path.endsWith(".svg") ? ".svg" : ".png"}`;
  const out = `${TMP}/${s.slug}-${SIZE}.png`;

  if (!existsSync(raw)) {
    const b64 = gh(["api", `repos/lifedever/${s.repo}/contents/${s.path}`, "--jq", ".content"]).toString().trim();
    writeFileSync(raw, Buffer.from(b64, "base64"));
  }

  if (raw.endsWith(".svg")) {
    // 透明背景渲染，否则会带上 Chrome 默认的白底，深色主题下变成白方块
    const page = `${TMP}/${s.slug}.html`;
    writeFileSync(page, `<body style="margin:0"><img src="${raw}" width="${SIZE}" height="${SIZE}"></body>`);
    execFileSync(CHROME, [
      "--headless", "--disable-gpu", "--hide-scrollbars",
      "--default-background-color=00000000",
      `--window-size=${SIZE},${SIZE}`, `--screenshot=${out}`, `file://${page}`,
    ], { stdio: "ignore" });
  } else {
    execFileSync("sips", ["-z", `${SIZE}`, `${SIZE}`, raw, "--out", out], { stdio: "ignore" });
  }

  const buf = readFileSync(out);
  icons[s.slug] = `data:image/png;base64,${buf.toString("base64")}`;
  console.log(`✓ ${s.slug.padEnd(12)} ${(buf.length / 1024).toFixed(1)} KB`);
}

writeFileSync(new URL("../dist/assets/icons.json", import.meta.url), JSON.stringify(icons, null, 0));
const total = Object.values(icons).reduce((a, b) => a + b.length, 0);
console.log(`\n→ dist/assets/icons.json  (base64 总计 ${(total / 1024).toFixed(0)} KB)`);
