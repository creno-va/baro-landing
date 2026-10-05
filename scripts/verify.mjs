import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const html = await readFile("index.html", "utf8");
assert(!/<(?:script|iframe|form|input)\b/i.test(html), "Preparation page must not collect data or load scripts");
assert(!/유불리|승소 가능성|소개 수수료|세무 서비스|판례.{0,8}학습|평균.{0,3}3초|인증 변호사/.test(html), "Unsupported product claims");
assert(html.indexOf("법률 자문을 대신하지 않습니다") < html.indexOf('class="actions"'), "Notice must precede CTA");
const browser = await chromium.launch({ headless: true, timeout: 30000 });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route("https://landing.test/**", route => route.fulfill({ contentType: "text/html", body: html }));
  await page.goto("https://landing.test/");
  for (const viewport of [{ width: 1280, height: 900 }, { width: 320, height: 900 }, { width: 640, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(zoom => { document.documentElement.style.zoom = zoom; }, viewport.width === 640 ? "2" : "1");
    assert(!await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), "Horizontal overflow");
    const report = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    assert.deepEqual(report.violations.map(v => ({ rule: v.id, impact: v.impact })), [], "Accessibility violations");
  }
  await page.setViewportSize({ width: 320, height: 900 });
  await page.reload();
  await page.keyboard.press("Tab");
  assert(await page.locator(".skip").evaluate(el => el === document.activeElement), "Keyboard skip link");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: "베타 준비 상태 확인", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert(page.url().endsWith("#status"), "Status CTA");
  await page.getByText("지금 서비스를 이용할 수 있나요?", { exact: true }).focus();
  await page.keyboard.press("Enter");
  assert(await page.getByText("공개 베타를 준비 중입니다. 공개 이용이 가능한 상태가 되면 승인된 정책과 함께 안내하겠습니다.").isVisible(), "Keyboard FAQ");
  await mkdir(".verification", { recursive: true });
  await page.screenshot({ path: ".verification/mobile.png", fullPage: true });
  console.log("Landing passed: scope/notice/no collection, 320px/200%/keyboard/CTA/FAQ/WCAG A-AA");
} finally { await browser.close(); }
