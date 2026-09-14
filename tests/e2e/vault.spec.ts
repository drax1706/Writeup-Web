import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const screenshotDirectory = path.join(process.cwd(), "docs", "screenshots");

async function capture(page: Page, fileName: string) {
  await mkdir(screenshotDirectory, { recursive: true });
  await page.screenshot({
    path: path.join(screenshotDirectory, fileName),
    fullPage: true,
    animations: "disabled",
    caret: "initial",
  });
}

async function mainNavigation(page: Page) {
  const mobileMenu = page.locator(".editorial-mobile-menu");
  if (
    (await mobileMenu.isVisible()) &&
    (await mobileMenu.getAttribute("open")) === null
  ) {
    await mobileMenu.locator("summary").click();
  }
  return page.getByRole("navigation", {
    name: "Điều hướng chính",
    exact: true,
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(
    dimensions.viewportWidth + 1,
  );
}

test("home fits the viewport and main navigation opens the library", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Web CTF &\s*Security Notes/,
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(page, `home-${testInfo.project.name}.png`);

  const navigation = await mainNavigation(page);
  await navigation
    .getByRole("link", { name: "Write-ups", exact: true })
    .click();
  await expect(page).toHaveURL(/\/writeups$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Write-ups",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    (await mainNavigation(page)).getByRole("link", {
      name: "Write-ups",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "WebSec — Trang chủ" }).click();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Web CTF &\s*Security Notes/,
    }),
  ).toBeVisible();
});

test("write-up filters survive reload and reset restores the library", async ({
  page,
}) => {
  await page.goto("/writeups");
  const cards = page.locator(".writeup-grid article[data-access]");
  const publicCard = page.locator('article[data-access="public"]').first();
  await expect(
    publicCard,
    "The content collection needs a published public article for the filter flow",
  ).toBeVisible();
  const originalCount = await cards.count();
  const title = (
    await publicCard.getByRole("heading", { level: 3 }).innerText()
  ).trim();
  const platform = (
    await publicCard.locator(".platform-name").innerText()
  ).trim();
  const difficulty = (
    await publicCard.locator(".difficulty").innerText()
  ).trim();
  const vulnerability = (
    await publicCard.locator(".tag").first().innerText()
  ).trim();
  const search = page.getByRole("searchbox", { name: "Tìm kiếm", exact: true });
  await search.fill(title);
  await page
    .getByRole("combobox", { name: "Nền tảng", exact: true })
    .selectOption(platform);
  await page
    .getByRole("combobox", { name: "Độ khó", exact: true })
    .selectOption(difficulty);
  await page
    .getByRole("combobox", { name: "Lỗ hổng", exact: true })
    .selectOption(vulnerability);
  await page
    .getByRole("combobox", { name: "Quyền truy cập", exact: true })
    .selectOption("public");
  await expect(page).toHaveURL(
    (url) =>
      url.searchParams.get("q") === title &&
      url.searchParams.get("platform") === platform &&
      url.searchParams.get("difficulty") === difficulty &&
      url.searchParams.get("vulnerability") === vulnerability &&
      url.searchParams.get("access") === "public",
  );
  await expect(
    page.getByRole("link", { name: title, exact: true }).first(),
  ).toBeVisible();
  await expect(page.locator('article[data-access="locked"]')).toHaveCount(0);
  const filteredCount = await cards.count();
  expect(filteredCount).toBeGreaterThan(0);
  expect(filteredCount).toBeLessThanOrEqual(originalCount);

  await page.reload();
  await expect(search).toHaveValue(title);
  await expect(
    page.getByRole("combobox", { name: "Nền tảng", exact: true }),
  ).toHaveValue(platform);
  await expect(
    page.getByRole("combobox", { name: "Độ khó", exact: true }),
  ).toHaveValue(difficulty);
  await expect(
    page.getByRole("combobox", { name: "Lỗ hổng", exact: true }),
  ).toHaveValue(vulnerability);
  await expect(
    page.getByRole("combobox", { name: "Quyền truy cập", exact: true }),
  ).toHaveValue("public");
  await expect(
    page.getByRole("link", { name: title, exact: true }).first(),
  ).toBeVisible();
  await expect(cards).toHaveCount(filteredCount);
  await expect(page.locator('article[data-access="locked"]')).toHaveCount(0);

  await page.getByRole("button", { name: "Xóa bộ lọc", exact: true }).click();
  await expect(page).toHaveURL(/\/writeups$/);
  await expect(search).toHaveValue("");
  for (const name of ["Nền tảng", "Độ khó", "Lỗ hổng", "Quyền truy cập"]) {
    await expect(page.getByRole("combobox", { name, exact: true })).toHaveValue(
      "",
    );
  }
  await expect(cards).toHaveCount(originalCount);
  await expect(
    page.getByRole("link", { name: title, exact: true }).first(),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("Encoder round-trips Unicode and reports malformed decoding", async ({
  page,
}, testInfo) => {
  await page.goto("/tools/encoder");
  const input = page.getByRole("textbox", { name: "Đầu vào", exact: true });
  const source = "Xin chào 🔐 — Việt Nam /?q=Unicode&lang=vi";
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.getByRole("radio", { name: "Base64", exact: true }).check();
  await input.fill(source);
  await page
    .getByRole("button", { name: "Encode dữ liệu", exact: true })
    .click();
  const result = page.getByLabel("Kết quả chuyển đổi", { exact: true });
  await expect(result).toBeVisible();
  const encoded = await result.textContent();
  expect(encoded).not.toBe(source);
  expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);

  await page
    .getByRole("button", { name: "Đảo chiều kết quả", exact: true })
    .click();
  await expect(input).toHaveValue(encoded ?? "");
  await page
    .getByRole("button", { name: "Decode dữ liệu", exact: true })
    .click();
  await expect(result).toHaveText(source);
  await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "desktop") await capture(page, "encoder.png");

  await page.getByRole("radio", { name: "Hex", exact: true }).check();
  await input.fill("zz");
  await page
    .getByRole("button", { name: "Decode dữ liệu", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Hex chỉ chứa" }),
  ).toContainText("Hex chỉ chứa ký tự 0-9 và a-f.");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(result).toHaveCount(0);
  expect(apiRequests).toEqual([]);
});

test("JWT example shows all three parts with an unverified-signature warning", async ({
  page,
}) => {
  await page.goto("/tools/jwt");
  const apiRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  await page.getByRole("button", { name: "Dùng JWT mẫu", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "JSON Web Token", exact: true }),
  ).not.toHaveValue("");
  await page
    .getByRole("button", { name: "Phân tích JWT", exact: true })
    .click();
  const results = page.getByRole("region", { name: "Kết quả phân tích JWT" });
  for (const name of ["01 / Header", "02 / Payload", "03 / Signature"]) {
    await expect(
      results.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByLabel("JWT header", { exact: true })).toContainText(
    '"alg": "HS256"',
  );
  await expect(page.getByLabel("JWT payload", { exact: true })).toContainText(
    "Nguyễn An",
  );
  await expect(
    page.getByLabel("JWT signature, chưa xác minh", { exact: true }),
  ).not.toHaveText("");
  await expect(page.getByRole("note")).toContainText("Decoded ≠ verified");
  await expect(results.getByRole("list")).toContainText(
    "chưa được xác minh chữ ký",
  );
  await expect(results.getByText("Đã hết hạn", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(apiRequests).toEqual([]);
});

test("Proof of Solve handles an empty collection or opens a locked article gate", async ({
  page,
}) => {
  const unlockRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith("/unlock"))
      unlockRequests.push(request.url());
  });
  await page.goto("/writeups");
  const navigation = await mainNavigation(page);
  const proofLink = navigation.getByRole("link", {
    name: "Proof of Solve",
    exact: true,
  });
  await proofLink.click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/writeups" &&
      url.searchParams.get("access") === "locked",
  );
  await expect(
    page.getByRole("combobox", { name: "Quyền truy cập", exact: true }),
  ).toHaveValue("locked");
  await page.reload();
  await mainNavigation(page);
  await expect(proofLink).toHaveAttribute("aria-current", "page");
  const mobileMenu = page.locator(".editorial-mobile-menu[open]");
  if (await mobileMenu.isVisible()) await mobileMenu.locator("summary").click();
  const lockedCard = page.locator('article[data-access="locked"]').first();
  await expect(page.locator('article[data-access="public"]')).toHaveCount(0);
  if (await lockedCard.count() === 0) {
    await expect(page.locator(".empty-state")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(unlockRequests).toEqual([]);
    return;
  }
  await expect(lockedCard).toBeVisible();
  const title = await lockedCard.getByRole("heading", { level: 3 }).innerText();
  await lockedCard.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(
    page.getByRole("heading", {
      name: "Mở bài bằng flag",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("Flag", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mở bài", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Mục lục bài viết" }),
  ).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
  await expectNoHorizontalOverflow(page);
  expect(unlockRequests).toEqual([]);
});

test("public article renders Markdown and its table of contents navigates", async ({
  page,
}, testInfo) => {
  await page.goto("/writeups?access=public");
  const publicCard = page.locator('article[data-access="public"]').first();
  await expect(publicCard).toBeVisible();
  const title = await publicCard.getByRole("heading", { level: 3 }).innerText();
  await publicCard.getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  await expect(page.getByRole("article")).toBeVisible();
  const mobileToc = page.locator(".editorial-toc-mobile");
  if (await mobileToc.isVisible()) {
    await expect(mobileToc).not.toHaveAttribute("open");
    await mobileToc.locator("summary").click();
    await expect(mobileToc).toHaveAttribute("open", "");
  }
  const toc = page.getByRole("navigation", { name: "Mục lục bài viết" });
  const firstHeadingLink = toc.getByRole("link").first();
  const headingText = await firstHeadingLink.innerText();
  const headingHash = await firstHeadingLink.getAttribute("href");
  expect(headingHash).toMatch(/^#/);
  await firstHeadingLink.click();
  await expect(page).toHaveURL(
    (url) => decodeURIComponent(url.hash) === decodeURIComponent(headingHash!),
  );
  await expect(
    page.getByRole("heading", { name: headingText, exact: true }),
  ).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  if (testInfo.project.name === "desktop") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await capture(page, "writeup.png");
  }
});
