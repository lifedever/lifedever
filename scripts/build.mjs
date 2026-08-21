import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { banner, DARK, LIGHT } from "./banner.mjs";
import { card, stackStrip, statStrip, CARDS, STACK, CARD_DARK, CARD_LIGHT } from "./cards.mjs";

const A = new URL("../assets/", import.meta.url);

// 先清空 cards/ —— 改动 CARDS 后旧 slug 的文件会残留在仓库里（cronpilot 就漏进过暂存区）
rmSync(new URL("cards/", A), { recursive: true, force: true });
mkdirSync(new URL("cards/", A), { recursive: true });

for (const [mode, bt, ct] of [["dark", DARK, CARD_DARK], ["light", LIGHT, CARD_LIGHT]]) {
  writeFileSync(new URL(`banner-${mode}.svg`, A), banner(bt));
  writeFileSync(new URL(`stack-${mode}.svg`, A), stackStrip(ct, STACK));
  writeFileSync(new URL(`stats-${mode}.svg`, A), statStrip(ct));
  for (const p of CARDS) writeFileSync(new URL(`cards/${p.slug}-${mode}.svg`, A), card(p, ct));
}
console.log(`✓ banner ×2 · stack ×2 · stats ×2 · cards ×${CARDS.length * 2}`);
