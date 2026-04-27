import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import type { BrowserContext, Page } from "playwright";

export const runtime = "nodejs";

const CHATGPT_URL = "https://chatgpt.com/";
const EDGE_USER_DATA_DIR = path.join(process.cwd(), ".automation", "chatgpt-edge-profile");
const CHROME_USER_DATA_DIR = path.join(process.cwd(), ".automation", "chatgpt-profile");
const PLAYWRIGHT_USER_DATA_DIR = path.join(process.cwd(), ".automation", "chatgpt-playwright-profile");
const TEMP_UPLOAD_DIR = path.join(os.tmpdir(), "yynotes-chatgpt-upload");
const LOGIN_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const RESPONSE_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const BROWSER_VIEWPORT = { width: 1440, height: 960 };
const COMPOSER_SELECTORS = [
  "#prompt-textarea",
  "textarea[placeholder]",
  "div[contenteditable='true'][id*='prompt']",
  "div[contenteditable='true'][data-testid*='composer']",
] as const;

function normalizeMultilineText(value: unknown): string {
  return String(value ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function buildAutomationPrompt(prompt: string): string {
  return [
    normalizeMultilineText(prompt),
    "",
    "---",
    "",
    "自动复制要求：",
    "- 最终请将完整笔记放在唯一一个 ```mdx 代码块中。",
    "- 代码块外不要输出任何解释、致谢、说明、前言或后记。",
    "- 如果需要 frontmatter，也要放在同一个 ```mdx 代码块中。",
  ].join("\n");
}

async function ensureFileOnDisk(file: File): Promise<string> {
  const safeName = file.name.replace(/[<>:\"/\\|?*\u0000-\u001f]+/g, "-") || "source-file";
  const uniqueName = `${Date.now()}-${crypto.randomUUID()}-${safeName}`;
  const filePath = path.join(TEMP_UPLOAD_DIR, uniqueName);
  await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function hasVisibleComposer(page: Page, timeout = 500): Promise<boolean> {
  for (const selector of COMPOSER_SELECTORS) {
    try {
      const locator = page.locator(selector).first();
      if ((await locator.count()) > 0) {
        await locator.waitFor({ state: "visible", timeout });
        return true;
      }
    } catch {
      // Keep checking the next selector.
    }
  }

  return false;
}

async function openChatGptLoginFirst(page: Page): Promise<void> {
  await page.bringToFront().catch(() => undefined);
  await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded" });

  if (await hasVisibleComposer(page, 3_000)) {
    return;
  }

  const loginCandidates = [
    page.getByRole("link", { name: /Log in|Sign in|登录|登入/i }).first(),
    page.getByRole("button", { name: /Log in|Sign in|登录|登入/i }).first(),
    page.locator('a[href*="/auth/login"]').first(),
    page.locator('a[href*="/login"]').first(),
  ];

  for (const candidate of loginCandidates) {
    try {
      if ((await candidate.count()) < 1) {
        continue;
      }

      await candidate.click({ timeout: 2_000 });
      await page.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => undefined);
      return;
    } catch {
      // Try the next login entry.
    }
  }

  await page.goto("https://chatgpt.com/auth/login", { waitUntil: "domcontentloaded" });
}

async function waitForComposer(page: Page): Promise<void> {
  const deadline = Date.now() + LOGIN_WAIT_TIMEOUT_MS;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    for (const selector of COMPOSER_SELECTORS) {
      try {
        const locator = page.locator(selector);
        if ((await locator.count()) > 0) {
          await locator.first().waitFor({ state: "visible", timeout: 2_000 });
          return;
        }
      } catch (error) {
        lastError = error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    lastError instanceof Error
      ? `等待 ChatGPT 输入框超时：${lastError.message}`
      : "等待 ChatGPT 输入框超时，请先在弹出的浏览器里完成登录。",
  );
}

async function trySelectPreferredModel(page: Page): Promise<string | null> {
  const openers = [
    () => page.locator('[data-testid="model-switcher-dropdown-button"]').first(),
    () => page.getByRole("button", { name: /GPT|模型|Model/i }).first(),
  ];

  const options = [
    () => page.getByRole("menuitem", { name: /GPT-?5\.?4/i }).first(),
    () => page.getByRole("option", { name: /GPT-?5\.?4/i }).first(),
    () => page.getByRole("button", { name: /GPT-?5\.?4/i }).first(),
    () => page.locator("text=/GPT-?5\\.?4/i").first(),
  ];

  for (const openerFactory of openers) {
    try {
      const opener = openerFactory();
      if ((await opener.count()) < 1) {
        continue;
      }

      await opener.click({ timeout: 2_000 });
      await page.waitForTimeout(500);

      for (const optionFactory of options) {
        const option = optionFactory();
        if ((await option.count()) < 1) {
          continue;
        }

        await option.click({ timeout: 2_000 });
        await page.waitForTimeout(500);
        return "GPT-5.4";
      }
    } catch {
      // Best effort only.
    }
  }

  return null;
}

async function uploadSourceFile(page: Page, filePath: string): Promise<void> {
  const fileInputs = [
    page.locator('input[type="file"]').first(),
    page.locator('input[accept*="pdf"]').first(),
  ];

  for (const input of fileInputs) {
    if ((await input.count()) > 0) {
      await input.setInputFiles(filePath);
      return;
    }
  }

  const openers = [
    page.getByRole("button", { name: /Attach|上传|文件|Add photos and files/i }).first(),
    page.locator("button[aria-label*='Attach']").first(),
    page.locator("button[aria-label*='Add photos']").first(),
  ];

  for (const opener of openers) {
    try {
      if ((await opener.count()) < 1) {
        continue;
      }

      await opener.click({ timeout: 2_000 });
      await page.waitForTimeout(500);
      const input = page.locator('input[type="file"]').first();
      if ((await input.count()) > 0) {
        await input.setInputFiles(filePath);
        return;
      }
    } catch {
      // Keep trying the next pattern.
    }
  }

  throw new Error("没有找到 ChatGPT 的文件上传控件。");
}

async function submitPrompt(page: Page, prompt: string): Promise<void> {
  for (const selector of COMPOSER_SELECTORS) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) < 1) {
      continue;
    }

    await locator.click({ timeout: 2_000 });
    try {
      await locator.fill(prompt);
    } catch {
      await locator.evaluate((node: Element, nextPrompt: string) => {
        if (node instanceof HTMLTextAreaElement) {
          node.value = nextPrompt;
          node.dispatchEvent(new Event("input", { bubbles: true }));
          return;
        }

        if (node instanceof HTMLElement) {
          node.textContent = nextPrompt;
          node.dispatchEvent(new InputEvent("input", { bubbles: true, data: nextPrompt }));
        }
      }, prompt);
    }

    const sendCandidates = [
      page.locator('[data-testid="send-button"]').first(),
      page.getByRole("button", { name: /Send|发送/i }).first(),
      page.locator("button[aria-label*='Send']").first(),
    ];

    for (const sendButton of sendCandidates) {
      if ((await sendButton.count()) > 0) {
        await sendButton.click({ timeout: 2_000 });
        return;
      }
    }

    await page.keyboard.press("Enter");
    return;
  }

  throw new Error("没有找到 ChatGPT 的输入框。");
}

async function waitForStableAssistantResponse(page: Page): Promise<string> {
  const deadline = Date.now() + RESPONSE_WAIT_TIMEOUT_MS;
  let previous = "";
  let stableCycles = 0;

  while (Date.now() < deadline) {
    const lastCodeBlock = page.locator("main article pre code").last();
    let current = "";

    if ((await lastCodeBlock.count()) > 0) {
      current = normalizeMultilineText(await lastCodeBlock.textContent());
    }

    if (!current) {
      const lastArticle = page.locator("main article").last();
      if ((await lastArticle.count()) > 0) {
        current = normalizeMultilineText(await lastArticle.textContent());
      }
    }

    if (current && current === previous) {
      stableCycles += 1;
      if (stableCycles >= 3) {
        return current;
      }
    } else {
      stableCycles = 0;
      previous = current;
    }

    await page.waitForTimeout(2_000);
  }

  throw new Error("等待 ChatGPT 返回结果超时。");
}

function extractMarkdownFromAutomationResult(raw: string): string {
  const normalized = normalizeMultilineText(raw);
  const fencedMatch = normalized.match(/```(?:md|mdx|markdown)\s*\n([\s\S]*?)\n```/i);
  if (fencedMatch?.[1]?.trim()) {
    return fencedMatch[1].trim();
  }
  return normalized;
}

export async function POST(request: Request) {
  let uploadedFilePath = "";
  let context: BrowserContext | null = null;

  try {
    const formData = await request.formData();
    const prompt = normalizeMultilineText(formData.get("prompt"));
    const sourceFile = formData.get("sourceFile");

    if (!prompt) {
      return NextResponse.json({ error: "缺少自动化 Prompt。" }, { status: 400 });
    }

    if (!(sourceFile instanceof File)) {
      return NextResponse.json({ error: "请先上传原始资料文件。" }, { status: 400 });
    }

    uploadedFilePath = await ensureFileOnDisk(sourceFile);

    const { chromium } = await import("playwright");
    const warnings: string[] = [];

    try {
      context = await chromium.launchPersistentContext(EDGE_USER_DATA_DIR, {
        headless: false,
        channel: "msedge",
        viewport: BROWSER_VIEWPORT,
      });
    } catch {
      warnings.push("未检测到本机 Edge，已尝试使用 Chrome。");
    }

    if (!context) {
      try {
        context = await chromium.launchPersistentContext(CHROME_USER_DATA_DIR, {
          headless: false,
          channel: "chrome",
          viewport: BROWSER_VIEWPORT,
        });
      } catch {
        warnings.push("未检测到本机 Chrome，已尝试使用 Playwright 默认浏览器。若后续失败，请执行 npx playwright install chromium。");
      }
    }

    context ??= await chromium.launchPersistentContext(PLAYWRIGHT_USER_DATA_DIR, {
      headless: false,
      viewport: BROWSER_VIEWPORT,
    });

    const page = context.pages()[0] ?? (await context.newPage());
    await openChatGptLoginFirst(page);
    await waitForComposer(page);

    const selectedModel = await trySelectPreferredModel(page);
    if (!selectedModel) {
      warnings.push("未能自动切换到 GPT-5.4，已继续使用当前 ChatGPT 页面上的默认模型。");
    }

    await uploadSourceFile(page, uploadedFilePath);
    await submitPrompt(page, buildAutomationPrompt(prompt));
    const rawResult = await waitForStableAssistantResponse(page);
    const markdown = extractMarkdownFromAutomationResult(rawResult);

    if (!markdown) {
      throw new Error("未从 ChatGPT 页面提取到可保存的 Markdown / MDX 结果。");
    }

    return NextResponse.json({
      success: true,
      markdown,
      warnings,
      model: selectedModel ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "自动化执行失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (context) {
      await context.close().catch(() => undefined);
    }

    if (uploadedFilePath) {
      await fs.unlink(uploadedFilePath).catch(() => undefined);
    }
  }
}
