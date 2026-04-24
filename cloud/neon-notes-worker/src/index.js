import { neon } from "@neondatabase/serverless";
import JSZip from "jszip";

const MAX_SOURCE_CHARS = 35_000;
const MAX_METADATA_SOURCE_CHARS = 8_000;
const MAX_EXTRA_INSTRUCTION_CHARS = 1_500;
const MAX_INTERACTIVE_DESIGN_RESPONSE_CHARS = 20_000;
const MAX_NOTE_CONTEXT_CHARS = 14_000;
const MAX_SELECTION_CHARS = 2_200;
const MAX_QUESTION_CHARS = 2_000;
const MAX_FOLDER_NAME_CHARS = 48;
const MAX_HISTORY_ITEMS = 8;
const MAX_HIGHLIGHT_TEXT_CHARS = 1_200;
const MAX_HIGHLIGHTS_PER_NOTE = 1_500;
const SUPPORTED_TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "tex", "csv", "rst"]);
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const ALLOWED_ASSISTANT_MODELS = new Set(["gpt-5.4-nano-2026-03-17", "gpt-4.1-mini"]);
const ALLOWED_NOTE_GENERATION_MODELS = new Set(["qwen3.6-flash", "gpt-4.1-mini"]);
const SUPPORTED_HIGHLIGHT_COLORS = new Set(["yellow"]);
let highlightSchemaEnsured = false;

function jsonResponse(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Vary": "Origin",
    },
  });
}

function normalizeOriginValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "*") {
    return "*";
  }

  try {
    return new URL(raw).origin;
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function parseAllowedOrigins(value) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return { wildcard: true, origins: ["*"] };
  }

  const normalized = raw
    .split(/[,\n]/)
    .map((item) => normalizeOriginValue(item))
    .filter(Boolean);

  if (!normalized.length || normalized.includes("*")) {
    return { wildcard: true, origins: ["*"] };
  }

  return { wildcard: false, origins: Array.from(new Set(normalized)) };
}

function getOrigin(requestOrigin, allowedOrigin) {
  const { wildcard, origins } = parseAllowedOrigins(allowedOrigin);

  if (wildcard) {
    return "*";
  }

  const fallbackOrigin = origins[0] || "*";

  if (!requestOrigin) {
    return fallbackOrigin;
  }

  const normalizedRequest = normalizeOriginValue(requestOrigin);
  return origins.includes(normalizedRequest) ? normalizedRequest : fallbackOrigin;
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_HASH_ITERATIONS = 100_000;
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_HASH_BYTES = 32;
const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{2,39}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function getAuthSecret(env) {
  const secret = String(env.AUTH_SECRET ?? "").trim();
  return secret;
}

function normalizeUsername(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_REGEX.test(email);
}

function normalizeDisplayName(value) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, 80) : "";
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value) {
  const normalized = String(value ?? "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function timingSafeEqual(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length) {
    return false;
  }

  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }

  return result === 0;
}

async function signTokenData(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(data));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function createAuthToken(secret, user) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: Number(user.id),
    username: String(user.username),
    displayName: user.display_name ? String(user.display_name) : "",
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS,
  };

  const headerBytes = textEncoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadBytes = textEncoder.encode(JSON.stringify(payload));
  const headerSegment = bytesToBase64Url(headerBytes);
  const payloadSegment = bytesToBase64Url(payloadBytes);
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signatureSegment = await signTokenData(secret, signingInput);
  return `${signingInput}.${signatureSegment}`;
}

async function verifyAuthToken(secret, token) {
  const raw = String(token ?? "").trim();
  if (!raw) {
    return null;
  }

  const segments = raw.split(".");
  if (segments.length !== 3) {
    return null;
  }

  const [headerSegment, payloadSegment, signatureSegment] = segments;
  if (!headerSegment || !payloadSegment || !signatureSegment) {
    return null;
  }

  const signingInput = `${headerSegment}.${payloadSegment}`;
  const expectedSignature = await signTokenData(secret, signingInput);
  if (!timingSafeEqual(signatureSegment, expectedSignature)) {
    return null;
  }

  try {
    const payloadText = textDecoder.decode(base64UrlToBytes(payloadSegment));
    const payload = JSON.parse(payloadText);
    const userId = Number(payload?.sub);
    const username = normalizeUsername(payload?.username);
    const exp = Number(payload?.exp);

    if (!Number.isInteger(userId) || userId <= 0 || !username || !Number.isFinite(exp)) {
      return null;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (exp <= nowSeconds) {
      return null;
    }

    return {
      id: userId,
      username,
      displayName: normalizeDisplayName(payload?.displayName),
    };
  } catch {
    return null;
  }
}

function parseBearerToken(request) {
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return "";
  }
  return match[1].trim();
}

function toPublicUser(row) {
  return {
    id: Number(row.id),
    username: String(row.username),
    displayName: normalizeDisplayName(row.display_name),
  };
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_BYTES));
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: "SHA-256",
    },
    key,
    PASSWORD_HASH_BYTES * 8,
  );
  const hash = new Uint8Array(bits);
  return `pbkdf2_sha256$${PASSWORD_HASH_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

async function verifyPassword(password, storedHash) {
  const parts = String(storedHash ?? "").split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2_sha256") {
    return false;
  }

  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 80_000) {
    return false;
  }

  try {
    const salt = base64UrlToBytes(parts[2]);
    const expectedHash = base64UrlToBytes(parts[3]);
    const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      key,
      expectedHash.length * 8,
    );

    const hash = new Uint8Array(bits);
    return timingSafeEqual(bytesToBase64Url(hash), bytesToBase64Url(expectedHash));
  } catch {
    return false;
  }
}

function parseGoogleClientIds(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function verifyGoogleIdToken(idToken, env) {
  const token = String(idToken ?? "").trim();
  if (!token) {
    throw new Error("Google idToken is required.");
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || typeof payload !== "object") {
    throw new Error("Invalid Google token.");
  }

  const email = normalizeEmail(payload.email);
  const emailVerified = String(payload.email_verified ?? "").toLowerCase() === "true" || payload.email_verified === true;
  if (!isValidEmail(email) || !emailVerified) {
    throw new Error("Google account email is invalid or not verified.");
  }

  const aud = String(payload.aud ?? "").trim();
  const allowedClientIds = parseGoogleClientIds(env.GOOGLE_CLIENT_ID);
  if (allowedClientIds.length && (!aud || !allowedClientIds.includes(aud))) {
    throw new Error("Google token audience does not match GOOGLE_CLIENT_ID.");
  }

  return {
    email,
    displayName: normalizeDisplayName(payload.name) || email.split("@")[0],
  };
}

async function resolveAuthenticatedUser(request, env, sql) {
  const secret = getAuthSecret(env);
  if (!secret) {
    return { error: { status: 500, message: "AUTH_SECRET is missing." } };
  }

  const token = parseBearerToken(request);
  if (!token) {
    return { error: { status: 401, message: "Authentication required." } };
  }

  const tokenPayload = await verifyAuthToken(secret, token);
  if (!tokenPayload) {
    return { error: { status: 401, message: "Invalid or expired token." } };
  }

  const rows = await sql`
    SELECT id, username, display_name
    FROM users
    WHERE id = ${tokenPayload.id} AND username = ${tokenPayload.username}
    LIMIT 1
  `;

  if (!rows.length) {
    return { error: { status: 401, message: "User no longer exists." } };
  }

  return { user: toPublicUser(rows[0]) };
}

function slugifyTitle(input) {
  const base = String(input ?? "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (base) {
    return base;
  }

  return `note-${Date.now()}`;
}

function resolveUniqueSlug(baseSlug, takenSlugs) {
  const taken = new Set(
    Array.from(takenSlugs || [], (slug) => String(slug ?? "").trim()).filter(Boolean),
  );
  if (!taken.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  while (taken.has(`${baseSlug}-${counter}`)) {
    counter += 1;
  }

  return `${baseSlug}-${counter}`;
}

const INTERACTIVE_DEMO_REGISTRY = [
  {
    key: "differentiation",
    anchorId: "interactive-demo-differentiation",
    href: "/demos/numerical-differentiation",
    titleZh: "数值微分参数探索",
    titleEn: "Numerical Differentiation Explorer",
    descriptionZh: "调整函数、评估点和步长，观察有限差分如何影响导数估计。",
    descriptionEn: "Adjust the function, evaluation point, and step size to see how finite differences affect derivative estimates.",
    keywords: ["数值微分", "三点差分", "差分公式", "导数估计", "finite difference", "numerical differentiation", "three-point"],
  },
  {
    key: "integration",
    anchorId: "interactive-demo-integration",
    href: "/demos/numerical-integration",
    titleZh: "数值积分方法演示",
    titleEn: "Numerical Integration Explorer",
    descriptionZh: "切换积分方法并修改区间与分割数，观察近似面积与误差变化。",
    descriptionEn: "Switch methods and change the interval or partition count to compare approximate area and error.",
    keywords: ["数值积分", "梯形公式", "辛普森", "积分近似", "trapezoidal", "simpson", "numerical integration"],
  },
  {
    key: "integration-comparison",
    anchorId: "interactive-demo-integration-comparison",
    href: "/demos/integration-comparison",
    titleZh: "积分方法误差比较",
    titleEn: "Integration Error Comparison",
    descriptionZh: "并排比较不同积分方法在误差和收敛趋势上的差异。",
    descriptionEn: "Compare multiple integration methods side by side and inspect their error trends.",
    keywords: ["方法比较", "误差比较", "收敛趋势", "compare integration", "error trend", "comparison"],
  },
  {
    key: "romberg",
    anchorId: "interactive-demo-romberg",
    href: "/demos/romberg",
    titleZh: "Romberg 外推演示",
    titleEn: "Romberg Extrapolation Demo",
    descriptionZh: "观察网格加密与 Richardson 外推如何逐步提升积分精度。",
    descriptionEn: "See how grid refinement and Richardson extrapolation progressively improve integration accuracy.",
    keywords: ["romberg", "理查森外推", "romberg integration", "richardson extrapolation", "龙贝格"],
  },
];

function normalizeDemoText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function escapeRegExp(value) {
  return String(value ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildDemoJumpLabel(demo) {
  return `跳转到交互 Demo：${demo.titleZh}`;
}

function findDemoHeadingIndex(lines, demo) {
  const keywords = demo.keywords.map((item) => normalizeDemoText(item)).filter(Boolean);
  if (!keywords.length) {
    return -1;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!/^#{2,4}\s+/.test(trimmed)) {
      continue;
    }

    const headingText = normalizeDemoText(trimmed.replace(/^#{2,4}\s+/, ""));
    if (keywords.some((keyword) => headingText.includes(keyword))) {
      return index;
    }
  }

  return -1;
}

function insertDemoJumpLinks(body, demos) {
  const lines = String(body ?? "").split("\n");
  let offset = 0;

  for (const demo of demos) {
    const headingIndex = findDemoHeadingIndex(lines, demo);
    if (headingIndex < 0) {
      continue;
    }

    const insertionIndex = headingIndex + 1 + offset;
    const linkLine = `> [${buildDemoJumpLabel(demo)}](#${demo.anchorId})`;
    if (String(lines[insertionIndex] ?? "").includes(`#${demo.anchorId}`)) {
      continue;
    }

    lines.splice(insertionIndex, 0, "", linkLine, "");
    offset += 3;
  }

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildDemoEmbedBlock(demo) {
  return [
    `### ${demo.titleZh}`,
    "",
    `<div id="${demo.anchorId}" class="interactive-demo-embed" data-demo-key="${demo.key}"></div>`,
  ].join("\n");
}

function stripMarkdownForDemoDesign(value) {
  return String(value ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[-*+]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .trim();
}

function toDemoKebabCase(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function parseZhBodySections(body) {
  const lines = String(body ?? "").split("\n");
  const sections = [];
  let currentHeading = "";
  let currentLines = [];

  const flush = () => {
    if (!currentHeading) {
      currentLines = [];
      return;
    }

    sections.push({
      heading: stripMarkdownForDemoDesign(currentHeading),
      content: currentLines.join("\n").trim(),
    });
    currentLines = [];
  };

  for (const line of lines) {
    const headingMatch = line.trim().match(/^#{2,4}\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1].trim();
      continue;
    }

    if (currentHeading) {
      currentLines.push(line);
    }
  }

  flush();
  return sections;
}

function collectBulletsForDemoDesign(source) {
  return String(source ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*+]\s+/.test(line))
    .map((line) => stripMarkdownForDemoDesign(line.replace(/^[-*+]\s+/, "")))
    .filter(Boolean);
}

function buildConceptPool(title, topic, zhBody) {
  const sections = parseZhBodySections(zhBody);
  const keyConceptSection = sections.find((section) => section.heading === "关键概念");
  const conceptBullets = keyConceptSection ? collectBulletsForDemoDesign(keyConceptSection.content) : [];
  const majorHeadings = sections
    .map((section) => section.heading)
    .filter((heading) => !["学习目标", "关键概念", "小结", "交互 Demo"].includes(heading));

  return Array.from(
    new Set(
      [title, topic, ...conceptBullets, ...majorHeadings]
        .map((item) => stripMarkdownForDemoDesign(item))
        .map((item) => item.replace(/[：:]\s*$/, "").trim())
        .filter((item) => item.length >= 2),
    ),
  ).slice(0, 6);
}

function encodeDemoSpec(spec) {
  return encodeURIComponent(JSON.stringify(spec));
}

function buildGeneratedDesignSpecs(title, topic, zhBody) {
  const conceptPool = buildConceptPool(title, topic, zhBody);
  if (!conceptPool.length) {
    return [];
  }

  const focusOptions = conceptPool.slice(0, 4);
  const scenarioLabel = topic || title;

  return conceptPool.slice(0, 2).map((concept, index) => ({
    key: `generated-${toDemoKebabCase(concept) || `demo-${index + 1}`}`,
    anchorId: `generated-interactive-demo-${toDemoKebabCase(concept) || index + 1}`,
    titleZh: `${concept} 交互设计`,
    titleEn: `Interactive design for ${concept}`,
    summaryZh: `围绕“${concept}”切换关键变量，观察 ${scenarioLabel || concept} 在不同情境下的变化与判断依据。`,
    summaryEn: `Explore how ${concept} changes across different scenarios and control settings.`,
    observationsZh: [
      `观察当场景复杂度提高时，“${concept}”的判断依据会先发生什么变化。`,
      `对比不同观察重点下，${scenarioLabel || concept} 的关键结论是否一致。`,
      "尝试打开提示开关，再回到无提示状态，比较你自己的推理路径。",
    ],
    observationsEn: [
      `Observe which part of ${concept} changes first as scenario complexity increases.`,
      `Compare whether the key conclusion stays consistent across different focus settings.`,
      "Toggle the hint layer on and off to compare your own reasoning path.",
    ],
    tasksZh: [
      `先用默认设置理解“${concept}”的基本情境。`,
      `再切换一个观察重点，说明你的判断为什么改变或没有改变。`,
      "最后记录你最容易混淆的一步，并尝试口头解释给自己听。",
    ],
    tasksEn: [
      `Start with the default setup to understand the baseline idea behind ${concept}.`,
      "Switch to another focus and explain why your conclusion changes or stays the same.",
      "Record the step that feels most confusing and explain it in your own words.",
    ],
    controls: [
      {
        id: "focus",
        type: "select",
        labelZh: "观察重点",
        labelEn: "Focus",
        optionsZh: focusOptions,
        optionsEn: focusOptions,
        initialIndex: Math.min(index, Math.max(0, focusOptions.length - 1)),
      },
      {
        id: "complexity",
        type: "slider",
        labelZh: "场景复杂度",
        labelEn: "Scenario Complexity",
        min: 1,
        max: 5,
        step: 1,
        initialValue: 3,
        unitZh: "级",
        unitEn: "level",
      },
      {
        id: "hints",
        type: "toggle",
        labelZh: "显示判断提示",
        labelEn: "Show Hint Layer",
        initialValue: true,
      },
    ],
  }));
}

function buildGeneratedDesignBlock(spec) {
  return [
    `### ${spec.titleZh}`,
    "",
    `<div id="${spec.anchorId}" class="interactive-demo-design" data-demo-spec="${encodeDemoSpec(spec)}"></div>`,
  ].join("\n");
}

function buildDemoSection(demos, generatedDesigns = []) {
  return [
    "## 交互 Demo",
    "",
    ...demos.map((demo) => buildDemoEmbedBlock(demo)),
    ...generatedDesigns.map((spec) => buildGeneratedDesignBlock(spec)),
  ].join("\n\n").trim();
}

function insertDemoSectionBeforeSummary(body, demos, generatedDesigns = []) {
  if (!demos.length && !generatedDesigns.length) {
    return body;
  }

  const section = buildDemoSection(demos, generatedDesigns);
  const match = String(body ?? "").match(/^#{2,3}\s+小结\s*$/m);
  if (!match || match.index === undefined) {
    return `${String(body ?? "").trim()}\n\n${section}`.trim();
  }

  const source = String(body ?? "");
  return `${source.slice(0, match.index).trimEnd()}\n\n${section}\n\n${source.slice(match.index).trimStart()}`.trim();
}

function normalizeBilingualSectionMarkerTitle(title) {
  return String(title ?? "")
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[()（）[\]{}<>\-—–/\\|.,，。:：!?！？\s]/g, "")
    .trim();
}

function isChineseSectionMarker(title) {
  const normalized = normalizeBilingualSectionMarkerTitle(title);
  return (
    normalized === "中文版笔记" ||
    normalized === "中文笔记" ||
    normalized === "中文版" ||
    normalized === "chineseversion" ||
    normalized === "chinesenotes" ||
    normalized === "chinesenote"
  );
}

function isEnglishSectionMarker(title) {
  const normalized = normalizeBilingualSectionMarkerTitle(title);
  return (
    normalized === "englishversion" ||
    normalized === "englishnotes" ||
    normalized === "englishnote" ||
    normalized === "英文版笔记" ||
    normalized === "英文笔记" ||
    normalized === "英文版"
  );
}

function extractHeadingTitle(line) {
  const match = String(line ?? "").match(/^#{1,6}\s+(.+)$/);
  return match ? match[1].trim() : null;
}

function splitBilingualNoteSections(source) {
  const lines = normalizeNewlines(source).split("\n");
  let zhMarkerLine = -1;
  let enMarkerLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const headingTitle = extractHeadingTitle(lines[index].trim());
    if (!headingTitle) {
      continue;
    }

    if (zhMarkerLine === -1 && isChineseSectionMarker(headingTitle)) {
      zhMarkerLine = index;
      continue;
    }

    if (enMarkerLine === -1 && isEnglishSectionMarker(headingTitle)) {
      enMarkerLine = index;
    }
  }

  const hasStructuredSections = zhMarkerLine >= 0 && enMarkerLine > zhMarkerLine;
  if (!hasStructuredSections) {
    return {
      hasStructuredSections: false,
      zhMarkerLine,
      enMarkerLine,
      zhBody: "",
      enBody: "",
    };
  }

  const zhBody = lines.slice(zhMarkerLine + 1, enMarkerLine).join("\n").trim();
  const enBody = lines.slice(enMarkerLine + 1).join("\n").trim();

  if (!zhBody || !enBody) {
    return {
      hasStructuredSections: false,
      zhMarkerLine,
      enMarkerLine,
      zhBody: "",
      enBody: "",
    };
  }

  return {
    hasStructuredSections: true,
    zhMarkerLine,
    enMarkerLine,
    zhBody,
    enBody,
  };
}

function selectInteractiveDemos({ title, topic, tags, sourceText, generatedContent, limit = 3 }) {
  const safeLimit = Math.max(0, Math.min(limit, INTERACTIVE_DEMO_REGISTRY.length));
  if (safeLimit === 0) {
    return [];
  }

  const haystack = normalizeDemoText([title, topic, Array.isArray(tags) ? tags.join(" ") : "", sourceText, generatedContent].join("\n"));
  return INTERACTIVE_DEMO_REGISTRY.map((demo) => {
    const normalizedKeywords = demo.keywords.map((keyword) => normalizeDemoText(keyword)).filter(Boolean);
    const score = normalizedKeywords.reduce((total, keyword) => {
      const matches = haystack.match(new RegExp(escapeRegExp(keyword), "g"));
      return total + (matches?.length ?? 0);
    }, 0);
    return { demo, score };
  })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.demo.key.localeCompare(b.demo.key))
    .slice(0, safeLimit)
    .map((item) => item.demo);
}

function injectInteractiveDemosIntoNoteContent(source, demos, options = {}) {
  const sections = splitBilingualNoteSections(source);
  if (!sections.hasStructuredSections) {
    return source;
  }

  const generatedDesigns = Array.isArray(options.generatedSpecs) && options.generatedSpecs.length
    ? options.generatedSpecs
    : demos.length
      ? []
      : buildGeneratedDesignSpecs(options.title || "", options.topic || "", sections.zhBody);
  const jumpDemos = [
    ...demos,
    ...generatedDesigns.map((spec) => ({
      anchorId: spec.anchorId,
      titleZh: String(spec.titleZh || "").replace(/\s*交互设计$/, ""),
      keywords: [String(spec.titleZh || "").replace(/\s*交互设计$/, "")],
    })),
  ];
  const zhWithLinks = insertDemoJumpLinks(sections.zhBody, jumpDemos);
  const zhFinal = insertDemoSectionBeforeSummary(zhWithLinks, demos, generatedDesigns);

  return [
    "## 中文版笔记",
    "",
    zhFinal.trim(),
    "",
    "---",
    "",
    "## English Version",
    "",
    sections.enBody.trim(),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function fileExtension(name) {
  const normalized = String(name ?? "");
  const index = normalized.lastIndexOf(".");
  if (index === -1) {
    return "";
  }

  return normalized.slice(index + 1).toLowerCase();
}

function normalizeNewlines(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizeApiBase(input, fallback = DEFAULT_OPENAI_BASE_URL) {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return fallback;
  }
  return raw.replace(/\/+$/, "");
}

function resolveModelName(env, requestedModel, allowedModels) {
  const normalized = String(requestedModel ?? "").trim();
  if (normalized && allowedModels.has(normalized)) {
    return normalized;
  }
  return env.OPENAI_MODEL || "gpt-4.1-mini";
}

function clampText(value, max) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.length > max ? `${trimmed.slice(0, max)}\n...[truncated]` : trimmed;
}

function stripCodeFence(raw) {
  const trimmed = String(raw ?? "").trim();
  const fenced = trimmed.match(/^```(?:json|md|mdx|markdown)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function normalizeMathDelimiters(text) {
  let output = String(text ?? "");

  output = output.replace(/```(?:math|latex|tex)\s*\n([\s\S]*?)\n```/gi, (_match, body) => {
    const normalized = String(body ?? "").trim();
    if (!normalized) {
      return "";
    }
    return `$$\n${normalized}\n$$`;
  });

  output = output.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, body) => {
    const normalized = String(body ?? "").trim();
    if (!normalized) {
      return "";
    }
    return `$$\n${normalized}\n$$`;
  });

  output = output.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_match, body) => {
    const normalized = String(body ?? "").trim();
    if (!normalized) {
      return "";
    }
    return `$${normalized}$`;
  });

  output = output.replace(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g, (segment) => segment.replace(/\\\\([A-Za-z])/g, "\\$1"));
  return output;
}

function compressBlankLines(text) {
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function looksLikeReadableText(value) {
  const text = String(value ?? "").replace(/\s+/g, "");
  if (!text) {
    return false;
  }

  const sample = text.slice(0, 800);
  const readable = sample.match(/[A-Za-z0-9\u4e00-\u9fff.,;:!?()[\]{}'"`~+\-*/=<>_%$#@&\\|]/g)?.length ?? 0;
  return readable / sample.length > 0.45;
}

function decodeXmlEntities(text) {
  return String(text ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

async function extractDocxTextFromZip(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const xmlNames = Object.keys(zip.files)
    .filter((name) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b));

  const chunks = [];

  for (const xmlName of xmlNames) {
    const file = zip.file(xmlName);
    if (!file) {
      continue;
    }

    const xml = await file.async("string");
    const plain = decodeXmlEntities(
      xml
        .replace(/<w:tab[^>]*\/>/gi, "\t")
        .replace(/<w:br[^>]*\/>/gi, "\n")
        .replace(/<w:cr[^>]*\/>/gi, "\n")
        .replace(/<\/w:p>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    );

    const cleaned = compressBlankLines(normalizeNewlines(plain));
    if (cleaned) {
      chunks.push(cleaned);
    }
  }

  if (!chunks.length) {
    throw new Error("未能从 DOCX 中提取到文本内容，请检查文件是否为可编辑的 .docx。");
  }

  return clampText(chunks.join("\n\n"), MAX_SOURCE_CHARS);
}

async function extractPptxTextFromZip(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const aNum = Number.parseInt(a.match(/slide(\d+)\.xml/i)?.[1] ?? "0", 10);
      const bNum = Number.parseInt(b.match(/slide(\d+)\.xml/i)?.[1] ?? "0", 10);
      return aNum - bNum;
    });

  const slides = [];

  for (const slideName of slideNames) {
    const file = zip.file(slideName);
    if (!file) {
      continue;
    }

    const xml = await file.async("string");
    const plain = decodeXmlEntities(
      xml
        .replace(/<a:tab[^>]*\/>/gi, "\t")
        .replace(/<a:br[^>]*\/>/gi, "\n")
        .replace(/<\/a:p>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    );

    const cleaned = compressBlankLines(normalizeNewlines(plain));
    if (cleaned) {
      slides.push(cleaned);
    }
  }

  if (!slides.length) {
    throw new Error("未能从 PPTX 中提取到文本内容，请检查文件是否为可编辑的 .pptx。");
  }

  return clampText(slides.join("\n\n"), MAX_SOURCE_CHARS);
}

async function extractSourceFromFile(file) {
  if (!(file instanceof File)) {
    throw new Error("sourceFile is required.");
  }

  if (file.size <= 0) {
    throw new Error("上传文件为空，请检查后重试。");
  }

  const extension = fileExtension(file.name);

  if (extension === "docx") {
    return extractDocxTextFromZip(await file.arrayBuffer());
  }

  if (extension === "pptx") {
    return extractPptxTextFromZip(await file.arrayBuffer());
  }

  if (extension === "doc" || extension === "ppt") {
    throw new Error("暂不支持旧版 .doc / .ppt，请先另存为 .docx / .pptx 后再上传。");
  }

  if (SUPPORTED_TEXT_EXTENSIONS.has(extension) || file.type.startsWith("text/")) {
    return clampText(normalizeNewlines(await file.text()), MAX_SOURCE_CHARS);
  }

  const fallback = normalizeNewlines(await file.text());
  if (!looksLikeReadableText(fallback)) {
    throw new Error("无法解析该文件类型。当前支持 txt / md / markdown / docx / pptx。");
  }

  return clampText(fallback, MAX_SOURCE_CHARS);
}

function parseTags(value) {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(/[，,、|]/);
  const set = new Set();

  for (const item of raw) {
    const tag = String(item).trim().replace(/^#+/, "");
    if (!tag) {
      continue;
    }

    set.add(tag);
    if (set.size >= 12) {
      break;
    }
  }

  return Array.from(set);
}

function normalizeFolderName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FOLDER_NAME_CHARS);
}

function parseFolderId(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return Number.NaN;
  }

  return parsed;
}

function normalizeHighlightColor(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "yellow";
  }

  return SUPPORTED_HIGHLIGHT_COLORS.has(normalized) ? normalized : "yellow";
}

function parseHighlightOffset(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return Number.NaN;
  }

  return parsed;
}

function normalizeHighlightSelectedText(value) {
  return clampText(String(value ?? ""), MAX_HIGHLIGHT_TEXT_CHARS);
}

function mapHighlightRow(row) {
  return {
    id: Number(row.id),
    noteSlug: String(row.note_slug),
    startOffset: Number(row.start_offset),
    endOffset: Number(row.end_offset),
    selectedText: String(row.selected_text ?? ""),
    color: normalizeHighlightColor(row.color),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function ensureHighlightSchema(sql) {
  if (highlightSchemaEnsured) {
    return;
  }

  await sql`
    CREATE TABLE IF NOT EXISTS note_highlights (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      note_slug TEXT NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      selected_text TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT 'yellow',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT note_highlights_range_chk CHECK (start_offset >= 0 AND end_offset > start_offset)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS note_highlights_user_note_idx ON note_highlights (user_id, note_slug, start_offset ASC, id ASC)`;
  await sql`CREATE INDEX IF NOT EXISTS note_highlights_user_note_created_idx ON note_highlights (user_id, note_slug, created_at DESC)`;

  highlightSchemaEnsured = true;
}

function hasChinese(value) {
  return /[\u4e00-\u9fff]/.test(String(value ?? ""));
}

function extractChinesePhrases(value) {
  return (String(value ?? "").match(/[\u4e00-\u9fff]{2,}/g) ?? []).map((item) => item.trim()).filter(Boolean);
}

function deriveTitleFromFileName(fileName) {
  const normalized = String(fileName ?? "").trim();
  if (!normalized) {
    return "";
  }

  const dotIndex = normalized.lastIndexOf(".");
  const base = dotIndex > 0 ? normalized.slice(0, dotIndex) : normalized;

  return base
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function deriveTitleFromSource(sourceText) {
  const lines = normalizeNewlines(sourceText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalized = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$([^$]+)\$/g, "$1")
      .trim();

    if (normalized.length < 2 || !hasChinese(normalized)) {
      continue;
    }

    return normalized.slice(0, 80);
  }

  for (const line of lines) {
    const normalized = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s+/, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$([^$]+)\$/g, "$1")
      .trim();

    if (normalized.length >= 2) {
      return normalized.slice(0, 80);
    }
  }

  return "";
}

function fallbackTagsFromMetadata(title, topic) {
  const candidates = [
    ...extractChinesePhrases(topic),
    ...extractChinesePhrases(title),
    ...[topic, title].flatMap((value) => String(value ?? "").split(/[\/|,，、]+/)),
  ]
    .map((value) => value.trim().replace(/^#+/, ""))
    .filter((value) => value.length >= 2 && value.length <= 24 && hasChinese(value));

  const dedup = new Set();
  for (const candidate of candidates) {
    dedup.add(candidate);
    if (dedup.size >= 6) {
      break;
    }
  }

  return Array.from(dedup);
}

function parseMetadataResponse(raw) {
  const cleaned = stripCodeFence(raw).trim();
  if (!cleaned) {
    return {};
  }

  let jsonText = cleaned;
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    jsonText = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(jsonText);
    const title = typeof parsed?.title === "string" ? parsed.title.trim() : "";
    const topic = typeof parsed?.topic === "string" ? parsed.topic.trim() : "";
    const tags = parseTags(parsed?.tags);

    return {
      title: title || undefined,
      topic: topic || undefined,
      tags: tags.length ? tags : undefined,
    };
  } catch {
    return {};
  }
}

function sanitizeInteractiveDesignControl(raw, fallbackId) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const control = raw;
  const type = typeof control.type === "string" ? control.type : "";
  const id = typeof control.id === "string" && control.id.trim() ? control.id.trim() : fallbackId;
  const labelZh = typeof control.labelZh === "string" && control.labelZh.trim() ? control.labelZh.trim() : "交互控件";
  const labelEn = typeof control.labelEn === "string" && control.labelEn.trim() ? control.labelEn.trim() : "Interactive Control";

  if (type === "select") {
    const optionsZh = Array.isArray(control.optionsZh) ? control.optionsZh.map((item) => String(item).trim()).filter(Boolean) : [];
    const optionsEn = Array.isArray(control.optionsEn) ? control.optionsEn.map((item) => String(item).trim()).filter(Boolean) : [];
    if (!optionsZh.length) {
      return null;
    }

    return {
      id,
      type,
      labelZh,
      labelEn,
      optionsZh: optionsZh.slice(0, 6),
      optionsEn: (optionsEn.length ? optionsEn : optionsZh).slice(0, 6),
      initialIndex:
        typeof control.initialIndex === "number" && Number.isFinite(control.initialIndex)
          ? Math.max(0, Math.floor(control.initialIndex))
          : 0,
    };
  }

  if (type === "slider") {
    const min = typeof control.min === "number" && Number.isFinite(control.min) ? control.min : 1;
    const max = typeof control.max === "number" && Number.isFinite(control.max) ? control.max : Math.max(min + 1, 5);

    return {
      id,
      type,
      labelZh,
      labelEn,
      min,
      max,
      step: typeof control.step === "number" && Number.isFinite(control.step) ? control.step : 1,
      initialValue:
        typeof control.initialValue === "number" && Number.isFinite(control.initialValue) ? control.initialValue : min,
      unitZh: typeof control.unitZh === "string" ? control.unitZh.trim() : "",
      unitEn: typeof control.unitEn === "string" ? control.unitEn.trim() : "",
    };
  }

  if (type === "toggle") {
    return {
      id,
      type,
      labelZh,
      labelEn,
      initialValue: Boolean(control.initialValue),
    };
  }

  return null;
}

function sanitizeInteractiveDesignSpecs(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const spec = item;
      const titleZh = typeof spec.titleZh === "string" ? spec.titleZh.trim() : "";
      if (!titleZh) {
        return null;
      }

      const controls = Array.isArray(spec.controls)
        ? spec.controls
            .map((control, controlIndex) => sanitizeInteractiveDesignControl(control, `control-${index + 1}-${controlIndex + 1}`))
            .filter(Boolean)
        : [];
      if (!controls.length) {
        return null;
      }

      const toStringList = (value, fallback) =>
        Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 4) : fallback;

      return {
        key: typeof spec.key === "string" && spec.key.trim() ? spec.key.trim() : `generated-ai-design-${index + 1}`,
        anchorId:
          typeof spec.anchorId === "string" && spec.anchorId.trim()
            ? spec.anchorId.trim()
            : `generated-ai-interactive-demo-${index + 1}`,
        titleZh,
        titleEn: typeof spec.titleEn === "string" && spec.titleEn.trim() ? spec.titleEn.trim() : `Interactive design ${index + 1}`,
        summaryZh: typeof spec.summaryZh === "string" && spec.summaryZh.trim() ? spec.summaryZh.trim() : `${titleZh} 的交互探索设计。`,
        summaryEn:
          typeof spec.summaryEn === "string" && spec.summaryEn.trim()
            ? spec.summaryEn.trim()
            : `Interactive study design for ${titleZh}.`,
        observationsZh: toStringList(spec.observationsZh, ["观察交互状态变化，并记录你的判断依据。"]),
        observationsEn: toStringList(spec.observationsEn, ["Observe how the state changes and record your reasoning."]),
        tasksZh: toStringList(spec.tasksZh, ["调整控件后，比较结论是否发生变化。"]),
        tasksEn: toStringList(spec.tasksEn, ["Adjust the controls and compare how the conclusion changes."]),
        controls,
      };
    })
    .filter(Boolean)
    .slice(0, 2);
}

function parseInteractiveDesignResponse(raw) {
  const cleaned = stripCodeFence(raw).trim();
  if (!cleaned) {
    return [];
  }

  let jsonText = cleaned;
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    jsonText = cleaned.slice(firstBracket, lastBracket + 1);
  }

  try {
    return sanitizeInteractiveDesignSpecs(JSON.parse(jsonText));
  } catch {
    return [];
  }
}

function buildInteractiveDesignSystemPrompt() {
  return [
    "You design interactive study demos for a note page.",
    "Return JSON only. Do not include markdown fences or explanations.",
    "Return a JSON array with 1 or 2 demo specs.",
    "Each demo spec must include: key, anchorId, titleZh, titleEn, summaryZh, summaryEn, observationsZh, observationsEn, tasksZh, tasksEn, controls.",
    "Each controls item must use exactly one of these shapes:",
    '{"id":"focus","type":"select","labelZh":"...","labelEn":"...","optionsZh":["..."],"optionsEn":["..."],"initialIndex":0}',
    '{"id":"level","type":"slider","labelZh":"...","labelEn":"...","min":1,"max":5,"step":1,"initialValue":3,"unitZh":"级","unitEn":"level"}',
    '{"id":"hint","type":"toggle","labelZh":"...","labelEn":"...","initialValue":true}',
    "Design controls that help students explore the current note visually and interactively.",
    "Keep the design concrete, teachable, and directly tied to the note content.",
  ].join("\n");
}

function buildInteractiveDesignUserPrompt({ title, topic, tags, noteContent }) {
  return [
    "请根据下面这篇笔记，设计可直接渲染到“交互 Demo”部分的交互配置。",
    "要求：必须输出 JSON 数组；至少 1 个交互设计；最多 2 个交互设计；每个设计都必须包含可操作控件。",
    "如果笔记没有现成数学可视化，也要围绕概念切换、场景变化、判断条件、流程推演来设计交互。",
    "",
    `标题：${title}`,
    `主题：${topic || "未指定"}`,
    `标签：${Array.isArray(tags) && tags.length ? tags.join("、") : "未指定"}`,
    "",
    "笔记内容：",
    clampText(noteContent, MAX_INTERACTIVE_DESIGN_RESPONSE_CHARS),
  ].join("\n");
}

function buildInteractiveDesignSpecsFromNote({ title, topic, source }) {
  const sections = splitBilingualNoteSections(source);
  if (!sections.hasStructuredSections) {
    return [];
  }

  return buildGeneratedDesignSpecs(title, topic, sections.zhBody);
}

async function generateInteractiveDesignSpecsWithAI({ env, title, topic, tags, noteContent, modelName }) {
  const openaiBaseUrl = normalizeApiBase(env.OPENAI_BASE_URL);
  const responsesEndpoint = `${openaiBaseUrl}/responses`;
  const chatCompletionsEndpoint = `${openaiBaseUrl}/chat/completions`;
  const resolvedModelName = modelName || resolveModelName(env, "", ALLOWED_NOTE_GENERATION_MODELS);
  const input = [
    {
      role: "system",
      content: [{ type: "input_text", text: buildInteractiveDesignSystemPrompt() }],
    },
    {
      role: "user",
      content: [{ type: "input_text", text: buildInteractiveDesignUserPrompt({ title, topic, tags, noteContent }) }],
    },
  ];

  const response = await fetch(responsesEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: resolvedModelName,
      input,
    }),
  });

  const json = await response.json().catch(() => null);
  if (response.ok) {
    const text = extractResponsesText(json);
    if (text) {
      const parsed = parseInteractiveDesignResponse(text);
      if (parsed.length) {
        return parsed;
      }
    }
  }

  const chatResponse = await fetch(chatCompletionsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: resolvedModelName,
      messages: flattenInputMessages(input),
    }),
  });

  const chatJson = await chatResponse.json().catch(() => null);
  if (!chatResponse.ok) {
    return [];
  }

  const chatText = extractChatCompletionsText(chatJson);
  return chatText ? parseInteractiveDesignResponse(chatText) : [];
}

function deriveTopicFromSource(sourceText) {
  const lines = normalizeNewlines(sourceText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalized = line
      .replace(/^#{1,6}\s+/, "")
      .replace(/^[-*+]\s+/, "")
      .replace(/^\d+\.\s+/, "")
      .replace(/^>\s+/, "")
      .trim();

    if (!normalized) {
      continue;
    }

    const phrases = extractChinesePhrases(normalized);
    const candidate = phrases.find((item) => item.length >= 2 && item.length <= 16);
    if (candidate) {
      return candidate;
    }
  }

  return "";
}

function deriveTopicFromTitleOrTags(title, tags) {
  const titlePhrases = extractChinesePhrases(String(title ?? ""));
  const titleCandidate = titlePhrases.find((item) => item.length >= 2 && item.length <= 16);
  if (titleCandidate) {
    return titleCandidate;
  }

  if (Array.isArray(tags)) {
    const tagCandidate = tags
      .map((item) => String(item ?? "").trim())
      .find((item) => item.length >= 2 && item.length <= 16 && hasChinese(item));
    if (tagCandidate) {
      return tagCandidate;
    }
  }

  return "学习笔记";
}

async function inferMissingMetadata({ env, sourceText, fileName, modelName }) {
  const openaiBaseUrl = normalizeApiBase(env.OPENAI_BASE_URL);
  const responsesEndpoint = `${openaiBaseUrl}/responses`;
  const chatCompletionsEndpoint = `${openaiBaseUrl}/chat/completions`;
  const resolvedModelName = modelName || resolveModelName(env, "", ALLOWED_NOTE_GENERATION_MODELS);

  const systemPrompt = [
    "你是学习笔记元信息生成器。",
    "必须返回 JSON，不要输出 markdown 和解释文字。",
    'Schema: {"title":"...","topic":"...","tags":["...","..."]}',
    "规则：",
    "- title/topic/tags 必须是中文",
    "- title 要具体、简洁，长度不超过 24 字",
    "- topic 是更高层级分类，长度不超过 16 字",
    "- tags 返回 3 到 6 个中文标签",
  ].join("\n");

  const userPrompt = [
    "请根据以下资料推断笔记元信息，并严格按 JSON 返回。",
    `文件名：${fileName || "unknown"}`,
    "",
    "资料内容：",
    clampText(sourceText, MAX_METADATA_SOURCE_CHARS),
  ].join("\n");

  const input = [
    {
      role: "system",
      content: [{ type: "input_text", text: systemPrompt }],
    },
    {
      role: "user",
      content: [{ type: "input_text", text: userPrompt }],
    },
  ];

  const response = await fetch(responsesEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: resolvedModelName,
      input,
    }),
  });

  const json = await response.json().catch(() => null);
  if (response.ok) {
    const text = extractResponsesText(json);
    if (text) {
      const parsed = parseMetadataResponse(text);
      if (parsed.title || parsed.topic || parsed.tags?.length) {
        return parsed;
      }
    }
  }

  const chatResponse = await fetch(chatCompletionsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: resolvedModelName,
      messages: flattenInputMessages(input),
    }),
  });

  const chatJson = await chatResponse.json().catch(() => null);
  if (!chatResponse.ok) {
    const responsesError = response.ok
      ? "Responses API returned success but no readable text."
      : `responses: HTTP ${response.status} - ${extractProviderMessage(json)}`;
    const chatError = `chat_completions: HTTP ${chatResponse.status} - ${extractProviderMessage(chatJson)}`;
    throw new Error(`AI provider returned an error. ${responsesError} | ${chatError}`);
  }

  const chatText = extractChatCompletionsText(chatJson);
  if (!chatText) {
    return {};
  }

  return parseMetadataResponse(chatText);
}

async function resolveGenerationMetadata({ env, titleInput, topicInput, tagsInput, sourceText, fileName, modelName }) {
  const hasManualTitle = String(titleInput ?? "").trim().length > 0;
  const hasManualTopic = String(topicInput ?? "").trim().length > 0;
  const hasManualTags = Array.isArray(tagsInput) && tagsInput.length > 0;

  let title = String(titleInput ?? "").trim();
  let topic = String(topicInput ?? "").trim();
  let tags = Array.isArray(tagsInput) ? tagsInput.slice(0, 12) : [];

  if (!title || !topic || !tags.length) {
    try {
      const inferred = await inferMissingMetadata({
        env,
        sourceText,
        fileName,
        modelName,
      });

      if (!title && inferred.title) {
        title = inferred.title.trim();
      }

      if (!topic && inferred.topic) {
        topic = inferred.topic.trim();
      }

      if (!tags.length && Array.isArray(inferred.tags) && inferred.tags.length) {
        tags = inferred.tags.slice(0, 12);
      }
    } catch {
      // Best effort only. Fall through to deterministic heuristics below.
    }
  }

  if (!title) {
    title = deriveTitleFromSource(sourceText) || deriveTitleFromFileName(fileName) || "未命名笔记";
  }

  if (!hasManualTitle && !hasChinese(title)) {
    title = deriveTitleFromSource(sourceText) || "未命名笔记";
  }

  if (!topic) {
    topic = deriveTopicFromSource(sourceText) || deriveTopicFromTitleOrTags(title, tags);
  }

  if (!hasManualTopic && !hasChinese(topic)) {
    topic = deriveTopicFromSource(sourceText) || deriveTopicFromTitleOrTags(title, tags);
  }

  if (!hasManualTags) {
    tags = tags.filter((tag) => hasChinese(tag));
    if (!tags.length) {
      tags = fallbackTagsFromMetadata(title, topic);
    }

    if (!tags.length) {
      tags = ["学习笔记", "知识整理"];
    }
  }

  return {
    title: title.trim(),
    topic: topic.trim(),
    tags: tags.slice(0, 12),
  };
}

function extractFrontmatterTextFromRaw(raw, key) {
  const pattern = new RegExp(`^${key}:\\s*(.+)$`, "im");
  const match = String(raw ?? "").match(pattern);
  return typeof match?.[1] === "string" ? match[1].trim().replace(/^['"]|['"]$/g, "") : undefined;
}

function buildGeneratedFrontmatter({ title, slug, topic, topicZh, topicEn, tags, raw }) {
  const descriptionEn =
    extractFrontmatterTextFromRaw(raw, "descriptionEn") ??
    extractFrontmatterTextFromRaw(raw, "description") ??
    `A concise study note on ${topicEn || title}.`;

  const descriptionZh =
    extractFrontmatterTextFromRaw(raw, "descriptionZh") ??
    extractFrontmatterTextFromRaw(raw, "description") ??
    `概括 ${topicZh || title} 核心内容的学习笔记。`;

  const description = extractFrontmatterTextFromRaw(raw, "description") ?? descriptionEn;

  return [
    "---",
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `descriptionZh: ${JSON.stringify(descriptionZh)}`,
    `descriptionEn: ${JSON.stringify(descriptionEn)}`,
    `slug: ${JSON.stringify(slug)}`,
    `topic: ${JSON.stringify(topic)}`,
    `topicZh: ${JSON.stringify(topicZh)}`,
    `topicEn: ${JSON.stringify(topicEn)}`,
    ...(tags.length ? ["tags:", ...tags.map((tag) => `  - ${JSON.stringify(tag)}`)] : ["tags: []"]),
    `order: ${Date.now()}`,
    "---",
  ].join("\n");
}

function splitTopic(topicInput, title) {
  const normalized = String(topicInput ?? "").trim();
  if (!normalized) {
    const topicZh = deriveTopicFromTitleOrTags(title, []);
    return {
      topicZh,
      topicEn: "General",
      topic: `${topicZh} / General`,
    };
  }

  const hasZh = /[\u4e00-\u9fff]/.test(normalized);
  const hasEn = /[A-Za-z]/.test(normalized);
  const topicZh = hasEn && !hasZh ? deriveTopicFromTitleOrTags(title, []) : normalized;
  const topicEn = hasZh && !hasEn ? String(title ?? "") || "General" : normalized;

  return {
    topicZh,
    topicEn,
    topic: `${topicZh} / ${topicEn}`,
  };
}

function buildSystemPrompt(promptTemplate) {
  return [
    String(promptTemplate ?? "").trim(),
    "",
    "你必须严格遵守以上全部要求。",
    "你只能输出最终 MDX 内容，不要输出解释、分析、前言或后记。",
  ].join("\n");
}

function buildUserPrompt({ title, topic, tags, sourceText, extraInstruction, generateInteractiveDemo }) {
  const tagsLine = tags.length ? tags.join("、") : "未指定";
  const demoInstruction = generateInteractiveDemo
    ? "需要为笔记卡片准备简洁摘要。由于后续会追加一次专门的交互 Demo 生成提示，请让正文中的重点概念、关键变量、判断条件和流程节点表达明确、可定位。"
    : "需要为笔记卡片准备简洁摘要。";

  return [
    "请基于以下材料生成最终笔记，严格执行系统提示词中的全部规范。",
    "",
    `目标标题：${title}`,
    `目标主题：${topic || "未指定"}`,
    `目标标签：${tagsLine}`,
    "",
    "原始笔记材料：",
    sourceText,
    "",
    `补充生成要求：${demoInstruction}`,
    "",
    extraInstruction ? `补充要求：\n${extraInstruction}\n` : "",
    "请直接输出最终 MDX 内容。",
  ].join("\n");
}

function extractProviderMessage(payload) {
  if (!payload || typeof payload !== "object") {
    return "No detail from provider.";
  }

  const errorMessage = payload?.error?.message;
  if (typeof errorMessage === "string" && errorMessage.trim()) {
    return errorMessage.trim();
  }

  const message = payload?.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  try {
    const serialized = JSON.stringify(payload);
    return serialized.length > 320 ? `${serialized.slice(0, 320)}...` : serialized;
  } catch {
    return "Unable to serialize provider error payload.";
  }
}

function extractResponsesText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const direct = payload.output_text;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    return "";
  }

  const textParts = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = item.content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      if (!contentItem || typeof contentItem !== "object") {
        continue;
      }

      const text = contentItem.text;
      if (typeof text === "string" && text.trim()) {
        textParts.push(text.trim());
      }
    }
  }

  return textParts.join("\n\n").trim();
}

function extractChatCompletionsText(payload) {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return "";
  }

  const message = choices[0]?.message;
  if (!message || typeof message !== "object") {
    return "";
  }

  const content = message.content;
  if (typeof content === "string") {
    return content.trim();
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const text = item.text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function flattenInputMessages(input) {
  return input.map((item) => ({
    role: item.role,
    content: Array.isArray(item.content) ? item.content.map((part) => part?.text || "").join("\n\n").trim() : "",
  }));
}

function buildAssistantSystemPrompt() {
  return [
    "You are a study assistant integrated into a bilingual note page.",
    "Primary task: help the student understand the CURRENT note content accurately and clearly.",
    "Use the provided note context first. Do not invent formulas or claims that contradict the note.",
    "If the note context is insufficient, explicitly say so and provide cautious guidance.",
    "Keep explanations educational, structured, and concise enough for study use.",
    "When user asks Chinese, answer Chinese. When user asks English, answer English. When user asks bilingual, answer with Chinese first and English below.",
    "When possible, reference formulas, methods, assumptions, and common mistakes from the note.",
    "Do not present yourself as a general unrelated chatbot.",
  ].join("\n");
}

function normalizeAssistantHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  const valid = history
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: clampText(item?.content, MAX_QUESTION_CHARS),
    }))
    .filter((item) => item.content.length > 0);

  if (valid.length <= MAX_HISTORY_ITEMS) {
    return valid;
  }

  return valid.slice(valid.length - MAX_HISTORY_ITEMS);
}

function sanitizeAssistantPayload(payload) {
  const raw = payload && typeof payload === "object" ? payload : {};
  const context = raw.context && typeof raw.context === "object" ? raw.context : {};

  return {
    question: clampText(raw.question, MAX_QUESTION_CHARS),
    quickAction: clampText(raw.quickAction, 120) || undefined,
    model: clampText(raw.model, 80) || undefined,
    history: normalizeAssistantHistory(raw.history),
    context: {
      slug: clampText(context.slug, 120),
      weekLabelZh: clampText(context.weekLabelZh, 80),
      weekLabelEn: clampText(context.weekLabelEn, 80),
      zhTitle: clampText(context.zhTitle, 240),
      enTitle: clampText(context.enTitle, 240),
      noteContent: clampText(context.noteContent, MAX_NOTE_CONTEXT_CHARS),
      selectedText: clampText(context.selectedText, MAX_SELECTION_CHARS) || undefined,
      selectedSection: clampText(context.selectedSection, 180) || undefined,
    },
  };
}

function buildAssistantUserPrompt(payload) {
  const { context, question, quickAction } = payload;
  const parts = [];

  parts.push("Current note metadata:");
  parts.push(`- Topic (ZH): ${context.weekLabelZh}`);
  parts.push(`- Topic (EN): ${context.weekLabelEn}`);
  parts.push(`- Title (ZH): ${context.zhTitle}`);
  parts.push(`- Title (EN): ${context.enTitle}`);
  parts.push(`- Slug: ${context.slug}`);

  if (context.selectedSection) {
    parts.push(`- Selected section: ${context.selectedSection}`);
  }

  if (context.selectedText) {
    parts.push("\nUser-selected note text:");
    parts.push(context.selectedText);
  }

  parts.push("\nCurrent note content (markdown):");
  parts.push(context.noteContent);

  if (quickAction) {
    parts.push(`\nQuick action: ${quickAction}`);
  }

  parts.push("\nStudent question:");
  parts.push(question);

  parts.push(
    "\nResponse requirements: prioritize this note context, explain steps clearly, and keep terminology consistent with this note's subject.",
  );

  return parts.join("\n");
}

async function generateAssistantAnswer(env, payload) {
  const openaiBaseUrl = normalizeApiBase(env.OPENAI_BASE_URL);
  const responsesEndpoint = `${openaiBaseUrl}/responses`;
  const chatCompletionsEndpoint = `${openaiBaseUrl}/chat/completions`;
  const modelName = resolveModelName(env, payload.model, ALLOWED_ASSISTANT_MODELS);

  const input = [
    {
      role: "system",
      content: [{ type: "input_text", text: buildAssistantSystemPrompt() }],
    },
    ...payload.history.map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: [{ type: "input_text", text: item.content }],
    })),
    {
      role: "user",
      content: [{ type: "input_text", text: buildAssistantUserPrompt(payload) }],
    },
  ];

  const response = await fetch(responsesEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelName,
      input,
    }),
  });

  const json = await response.json().catch(() => null);
  if (response.ok) {
    const text = extractResponsesText(json);
    if (text) {
      return text;
    }
  }

  const responsesError = response.ok
    ? "Responses API returned success but no readable text."
    : `responses: HTTP ${response.status} - ${extractProviderMessage(json)}`;

  const chatResponse = await fetch(chatCompletionsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelName,
      messages: flattenInputMessages(input),
    }),
  });

  const chatJson = await chatResponse.json().catch(() => null);
  if (!chatResponse.ok) {
    const chatError = `chat_completions: HTTP ${chatResponse.status} - ${extractProviderMessage(chatJson)}`;
    throw new Error(`AI provider returned an error. ${responsesError} | ${chatError}`);
  }

  const chatText = extractChatCompletionsText(chatJson);
  if (!chatText) {
    throw new Error(`AI provider returned no readable text. ${responsesError} | chat_completions: empty text response.`);
  }

  return chatText;
}

async function generateMdx({ env, title, topic, tags, sourceText, extraInstruction, promptTemplate, modelName, generateInteractiveDemo }) {
  const openaiBaseUrl = normalizeApiBase(env.OPENAI_BASE_URL);
  const responsesEndpoint = `${openaiBaseUrl}/responses`;
  const chatCompletionsEndpoint = `${openaiBaseUrl}/chat/completions`;
  const resolvedModelName = modelName || resolveModelName(env, "", ALLOWED_NOTE_GENERATION_MODELS);
  const systemPrompt = buildSystemPrompt(promptTemplate);
  const userPrompt = buildUserPrompt({ title, topic, tags, sourceText, extraInstruction, generateInteractiveDemo });

  const response = await fetch(responsesEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: resolvedModelName,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: userPrompt,
            },
          ],
        },
      ],
    }),
  });

  const json = await response.json().catch(() => null);
  if (response.ok) {
    const outputText = extractResponsesText(json);
    if (outputText) {
      return outputText;
    }
  }

  const responsesError = response.ok
    ? "Responses API returned success but no readable text."
    : `responses: HTTP ${response.status} - ${extractProviderMessage(json)}`;

  const chatResponse = await fetch(chatCompletionsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: resolvedModelName,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  const chatJson = await chatResponse.json().catch(() => null);
  if (!chatResponse.ok) {
    const chatError = `chat_completions: HTTP ${chatResponse.status} - ${extractProviderMessage(chatJson)}`;
    throw new Error(`AI provider returned an error. ${responsesError} | ${chatError}`);
  }

  const chatText = extractChatCompletionsText(chatJson);
  if (!chatText) {
    throw new Error(
      `AI provider returned no readable text. ${responsesError} | chat_completions: empty text response.`,
    );
  }

  return chatText;
}

function normalizeGeneratedMdx(raw, { title, slug, topic, topicZh, topicEn, tags, sourceText, generateInteractiveDemo, interactiveDesignSpecs }) {
  let content = normalizeMathDelimiters(normalizeNewlines(stripCodeFence(raw))).trim();
  if (!content) {
    return "";
  }

  if (generateInteractiveDemo) {
    const demos = selectInteractiveDemos({
      title,
      topic,
      tags,
      sourceText,
      generatedContent: content,
    });
    content = injectInteractiveDemosIntoNoteContent(content, demos, {
      title,
      topic,
      generatedSpecs: interactiveDesignSpecs,
    });
  }

  const frontmatter = buildGeneratedFrontmatter({
    title,
    slug,
    topic,
    topicZh,
    topicEn,
    tags,
    raw,
  });

  return `${frontmatter}\n${content}`.trim();
}

function isDuplicateConstraintError(error, constraintName) {
  const code = String(error?.code ?? "").trim();
  const message = String(error?.message ?? "");
  if (code === "42710") {
    return true;
  }
  return new RegExp(`constraint\\s+\"?${constraintName}\"?.*already exists`, "i").test(message);
}

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS notes (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT,
      folder_id BIGINT,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      topic_zh TEXT NOT NULL,
      topic_en TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      mdx_content TEXT NOT NULL,
      source_text TEXT NOT NULL,
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, slug)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS folders (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, name)
    )
  `;

  await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS user_id BIGINT`;
  await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS folder_id BIGINT`;
  await sql`ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE notes DROP CONSTRAINT IF EXISTS notes_slug_key`;
  try {
    await sql`
      ALTER TABLE notes
      ADD CONSTRAINT notes_folder_fk
      FOREIGN KEY (folder_id)
      REFERENCES folders (id)
      ON DELETE SET NULL
    `;
  } catch (error) {
    if (!isDuplicateConstraintError(error, "notes_folder_fk")) {
      throw error;
    }
  }
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS notes_user_slug_unique_idx ON notes (user_id, slug)`;
  await sql`CREATE INDEX IF NOT EXISTS notes_user_updated_idx ON notes (user_id, updated_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS notes_user_folder_idx ON notes (user_id, folder_id)`;
  await sql`CREATE INDEX IF NOT EXISTS folders_user_order_idx ON folders (user_id, sort_order ASC, updated_at DESC)`;
}

function asBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function parseGeneratePayload(request) {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const sourceFile = formData.get("sourceFile");

    return {
      title: String(formData.get("title") || "").trim(),
      topicInput: String(formData.get("topic") || "").trim(),
      tags: parseTags(formData.get("tags")),
      sourceText: sourceFile instanceof File ? await extractSourceFromFile(sourceFile) : String(formData.get("sourceText") || "").trim(),
      fileName: sourceFile instanceof File ? sourceFile.name : String(formData.get("fileName") || "").trim(),
      extraInstruction: clampText(String(formData.get("extraInstruction") || ""), MAX_EXTRA_INSTRUCTION_CHARS),
      promptTemplate: String(formData.get("promptTemplate") || "").trim(),
      model: String(formData.get("model") || "").trim(),
      generateInteractiveDemo: asBoolean(formData.get("generateInteractiveDemo")),
    };
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    throw new Error("Invalid JSON body.");
  }

  return {
    title: String(body.title || "").trim(),
    topicInput: String(body.topic || "").trim(),
    tags: parseTags(body.tags),
    sourceText: clampText(String(body.sourceText || ""), MAX_SOURCE_CHARS),
    fileName: String(body.fileName || "").trim(),
    extraInstruction: clampText(String(body.extraInstruction || ""), MAX_EXTRA_INSTRUCTION_CHARS),
    promptTemplate: String(body.promptTemplate || "").trim(),
    model: String(body.model || "").trim(),
    generateInteractiveDemo: Boolean(body.generateInteractiveDemo),
  };
}

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsOrigin = getOrigin(requestOrigin, allowedOrigin);

    try {
      if (request.method === "OPTIONS") {
        return jsonResponse({ ok: true }, 200, corsOrigin);
      }

      if (!env.DATABASE_URL) {
        return jsonResponse({ error: "DATABASE_URL is missing." }, 500, corsOrigin);
      }

      const sql = neon(env.DATABASE_URL);
      await ensureSchema(sql);

      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/health") {
        return jsonResponse({ ok: true }, 200, corsOrigin);
      }

      if (request.method === "POST" && url.pathname === "/auth/register") {
        const secret = getAuthSecret(env);
        if (!secret) {
          return jsonResponse({ error: "AUTH_SECRET is missing." }, 500, corsOrigin);
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return jsonResponse({ error: "Invalid JSON body." }, 400, corsOrigin);
        }

        const email = normalizeEmail(body.email ?? body.username);
        const password = String(body.password ?? "");
        const displayName = normalizeDisplayName(body.displayName);

        if (!isValidEmail(email)) {
          return jsonResponse({ error: "Invalid email address." }, 400, corsOrigin);
        }

        if (password.length < 8 || password.length > 72) {
          return jsonResponse({ error: "Password must be between 8 and 72 characters." }, 400, corsOrigin);
        }

        const existingUser = await sql`
          SELECT id FROM users
          WHERE username = ${email}
          LIMIT 1
        `;
        if (existingUser.length) {
          return jsonResponse({ error: "Email already exists." }, 409, corsOrigin);
        }

        const passwordHash = await hashPassword(password);
        const inserted = await sql`
          INSERT INTO users (username, password_hash, display_name, updated_at)
          VALUES (${email}, ${passwordHash}, ${displayName}, NOW())
          RETURNING id, username, display_name
        `;

        const user = toPublicUser(inserted[0]);
        const token = await createAuthToken(secret, inserted[0]);

        return jsonResponse({ success: true, user, token }, 201, corsOrigin);
      }

      if (request.method === "POST" && url.pathname === "/auth/login") {
        const secret = getAuthSecret(env);
        if (!secret) {
          return jsonResponse({ error: "AUTH_SECRET is missing." }, 500, corsOrigin);
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return jsonResponse({ error: "Invalid JSON body." }, 400, corsOrigin);
        }

        const email = normalizeEmail(body.email ?? body.username);
        const password = String(body.password ?? "");

        if ((!isValidEmail(email) && !USERNAME_REGEX.test(email)) || !password) {
          return jsonResponse({ error: "Invalid email or password." }, 400, corsOrigin);
        }

        const rows = await sql`
          SELECT id, username, display_name, password_hash
          FROM users
          WHERE username = ${email}
          LIMIT 1
        `;

        if (!rows.length) {
          return jsonResponse({ error: "Invalid email or password." }, 401, corsOrigin);
        }

        const validPassword = await verifyPassword(password, rows[0].password_hash);
        if (!validPassword) {
          return jsonResponse({ error: "Invalid email or password." }, 401, corsOrigin);
        }

        const token = await createAuthToken(secret, rows[0]);
        const user = toPublicUser(rows[0]);
        await sql`UPDATE users SET updated_at = NOW() WHERE id = ${user.id}`;

        return jsonResponse({ success: true, user, token }, 200, corsOrigin);
      }

      if (request.method === "POST" && url.pathname === "/auth/google") {
        const secret = getAuthSecret(env);
        if (!secret) {
          return jsonResponse({ error: "AUTH_SECRET is missing." }, 500, corsOrigin);
        }

        if (!String(env.GOOGLE_CLIENT_ID ?? "").trim()) {
          return jsonResponse({ error: "GOOGLE_CLIENT_ID is missing." }, 500, corsOrigin);
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return jsonResponse({ error: "Invalid JSON body." }, 400, corsOrigin);
        }

        let verified;
        try {
          verified = await verifyGoogleIdToken(body.idToken, env);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid Google token.";
          return jsonResponse({ error: message }, 401, corsOrigin);
        }

        const email = verified.email;
        const displayName = normalizeDisplayName(verified.displayName);

        const existingRows = await sql`
          SELECT id, username, display_name
          FROM users
          WHERE username = ${email}
          LIMIT 1
        `;

        let userRow;
        if (existingRows.length) {
          userRow = existingRows[0];

          if (displayName && !String(userRow.display_name ?? "").trim()) {
            const updatedRows = await sql`
              UPDATE users
              SET display_name = ${displayName}, updated_at = NOW()
              WHERE id = ${userRow.id}
              RETURNING id, username, display_name
            `;
            userRow = updatedRows[0];
          } else {
            await sql`UPDATE users SET updated_at = NOW() WHERE id = ${userRow.id}`;
          }
        } else {
          const generatedPasswordHash = await hashPassword(`google:${crypto.randomUUID()}:${Date.now()}`);
          const insertedRows = await sql`
            INSERT INTO users (username, password_hash, display_name, updated_at)
            VALUES (${email}, ${generatedPasswordHash}, ${displayName}, NOW())
            RETURNING id, username, display_name
          `;
          userRow = insertedRows[0];
        }

        const token = await createAuthToken(secret, userRow);
        const user = toPublicUser(userRow);
        return jsonResponse({ success: true, user, token }, 200, corsOrigin);
      }

      if (request.method === "GET" && url.pathname === "/auth/me") {
        const authResolved = await resolveAuthenticatedUser(request, env, sql);
        if (authResolved.error) {
          return jsonResponse({ error: authResolved.error.message }, authResolved.error.status, corsOrigin);
        }

        return jsonResponse({ success: true, user: authResolved.user }, 200, corsOrigin);
      }

      const requiresUserAuth =
        url.pathname === "/assistant" ||
        url.pathname === "/notes" ||
        url.pathname.startsWith("/notes/") ||
        url.pathname === "/folders" ||
        url.pathname.startsWith("/folders/");
      let authenticatedUser = null;
      if (requiresUserAuth) {
        const authResolved = await resolveAuthenticatedUser(request, env, sql);
        if (authResolved.error) {
          return jsonResponse({ error: authResolved.error.message }, authResolved.error.status, corsOrigin);
        }
        authenticatedUser = authResolved.user;
      }

      if (request.method === "POST" && url.pathname === "/assistant") {
        if (!env.OPENAI_API_KEY) {
          return jsonResponse({ error: "OPENAI_API_KEY is missing." }, 500, corsOrigin);
        }

        let rawPayload;
        try {
          rawPayload = await request.json();
        } catch {
          return jsonResponse({ error: "Invalid JSON body." }, 400, corsOrigin);
        }

        const payload = sanitizeAssistantPayload(rawPayload);
        if (!payload.question) {
          return jsonResponse({ error: "Question is required." }, 400, corsOrigin);
        }

        const answer = await generateAssistantAnswer(env, payload);
        return jsonResponse({ answer }, 200, corsOrigin);
      }

      if (request.method === "GET" && url.pathname === "/folders") {
        const userId = Number(authenticatedUser?.id);
        const rows = await sql`
          SELECT id, name, sort_order, created_at, updated_at
          FROM folders
          WHERE user_id = ${userId}
          ORDER BY sort_order ASC, id ASC
        `;

        return jsonResponse({ success: true, folders: rows }, 200, corsOrigin);
      }

      if (request.method === "POST" && url.pathname === "/folders") {
        const userId = Number(authenticatedUser?.id);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return jsonResponse({ error: "Invalid JSON body." }, 400, corsOrigin);
        }

        const name = normalizeFolderName(body.name);
        if (!name) {
          return jsonResponse({ error: "Folder name is required." }, 400, corsOrigin);
        }

        const duplicate = await sql`
          SELECT id
          FROM folders
          WHERE user_id = ${userId} AND lower(name) = lower(${name})
          LIMIT 1
        `;
        if (duplicate.length) {
          return jsonResponse({ error: "Folder name already exists." }, 409, corsOrigin);
        }

        const requestedOrder = Number(body.sortOrder);
        let sortOrder = Number.isInteger(requestedOrder) && requestedOrder >= 0 ? requestedOrder : null;
        if (sortOrder === null) {
          const nextRows = await sql`
            SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
            FROM folders
            WHERE user_id = ${userId}
          `;
          sortOrder = Number(nextRows?.[0]?.next_order ?? 0);
        }

        const inserted = await sql`
          INSERT INTO folders (user_id, name, sort_order, updated_at)
          VALUES (${userId}, ${name}, ${sortOrder}, NOW())
          RETURNING id, name, sort_order, created_at, updated_at
        `;

        return jsonResponse({ success: true, folder: inserted[0] }, 201, corsOrigin);
      }

      const folderPathMatch = url.pathname.match(/^\/folders\/(\d+)$/);
      if (request.method === "PATCH" && folderPathMatch) {
        const userId = Number(authenticatedUser?.id);
        const folderId = Number(folderPathMatch[1]);
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return jsonResponse({ error: "Invalid JSON body." }, 400, corsOrigin);
        }

        const rows = await sql`
          SELECT id, name, sort_order
          FROM folders
          WHERE user_id = ${userId} AND id = ${folderId}
          LIMIT 1
        `;
        if (!rows.length) {
          return jsonResponse({ error: "Folder not found." }, 404, corsOrigin);
        }

        const current = rows[0];
        const hasName = Object.prototype.hasOwnProperty.call(body, "name");
        const hasSortOrder = Object.prototype.hasOwnProperty.call(body, "sortOrder");
        if (!hasName && !hasSortOrder) {
          return jsonResponse({ error: "No update field provided." }, 400, corsOrigin);
        }

        const nextName = hasName ? normalizeFolderName(body.name) : String(current.name ?? "");
        if (!nextName) {
          return jsonResponse({ error: "Folder name is required." }, 400, corsOrigin);
        }

        const nextSortOrderRaw = hasSortOrder ? Number(body.sortOrder) : Number(current.sort_order ?? 0);
        if (!Number.isInteger(nextSortOrderRaw) || nextSortOrderRaw < 0) {
          return jsonResponse({ error: "sortOrder must be a non-negative integer." }, 400, corsOrigin);
        }

        const duplicate = await sql`
          SELECT id
          FROM folders
          WHERE user_id = ${userId} AND lower(name) = lower(${nextName}) AND id <> ${folderId}
          LIMIT 1
        `;
        if (duplicate.length) {
          return jsonResponse({ error: "Folder name already exists." }, 409, corsOrigin);
        }

        const updated = await sql`
          UPDATE folders
          SET name = ${nextName}, sort_order = ${nextSortOrderRaw}, updated_at = NOW()
          WHERE user_id = ${userId} AND id = ${folderId}
          RETURNING id, name, sort_order, created_at, updated_at
        `;

        return jsonResponse({ success: true, folder: updated[0] }, 200, corsOrigin);
      }

      if (request.method === "DELETE" && folderPathMatch) {
        const userId = Number(authenticatedUser?.id);
        const folderId = Number(folderPathMatch[1]);

        await sql`
          UPDATE notes
          SET folder_id = NULL, updated_at = NOW()
          WHERE user_id = ${userId} AND folder_id = ${folderId}
        `;

        const deleted = await sql`
          DELETE FROM folders
          WHERE user_id = ${userId} AND id = ${folderId}
          RETURNING id
        `;
        if (!deleted.length) {
          return jsonResponse({ error: "Folder not found." }, 404, corsOrigin);
        }

        return jsonResponse({ success: true, folderId }, 200, corsOrigin);
      }

      const noteHighlightsMatch = url.pathname.match(/^\/notes\/([^/]+)\/highlights(?:\/(\d+))?$/);
      if (noteHighlightsMatch) {
        const userId = Number(authenticatedUser?.id);
        const slug = decodeURIComponent(noteHighlightsMatch[1] ?? "").trim();
        const highlightId = noteHighlightsMatch[2] ? Number(noteHighlightsMatch[2]) : null;

        if (!slug) {
          return jsonResponse({ error: "Slug is required." }, 400, corsOrigin);
        }

        await ensureHighlightSchema(sql);

        const noteRows = await sql`
          SELECT slug
          FROM notes
          WHERE user_id = ${userId} AND slug = ${slug}
          LIMIT 1
        `;
        if (!noteRows.length) {
          return jsonResponse({ error: "Note not found." }, 404, corsOrigin);
        }

        if (request.method === "GET" && highlightId === null) {
          const rows = await sql`
            SELECT id, note_slug, start_offset, end_offset, selected_text, color, created_at, updated_at
            FROM note_highlights
            WHERE user_id = ${userId} AND note_slug = ${slug}
            ORDER BY start_offset ASC, id ASC
          `;

          return jsonResponse({ success: true, highlights: rows.map((row) => mapHighlightRow(row)) }, 200, corsOrigin);
        }

        if (request.method === "POST" && highlightId === null) {
          const body = await request.json().catch(() => null);
          if (!body || typeof body !== "object") {
            return jsonResponse({ error: "Invalid JSON body." }, 400, corsOrigin);
          }

          const startOffset = parseHighlightOffset(body.startOffset);
          const endOffset = parseHighlightOffset(body.endOffset);
          if (!Number.isInteger(startOffset) || !Number.isInteger(endOffset)) {
            return jsonResponse({ error: "startOffset and endOffset must be integers." }, 400, corsOrigin);
          }
          if (startOffset < 0 || endOffset <= startOffset) {
            return jsonResponse({ error: "Invalid highlight range." }, 400, corsOrigin);
          }
          if (endOffset - startOffset > 4_000) {
            return jsonResponse({ error: "Highlight range is too large." }, 400, corsOrigin);
          }

          const selectedText = normalizeHighlightSelectedText(body.selectedText);
          const color = normalizeHighlightColor(body.color);

          const countRows = await sql`
            SELECT COUNT(*)::int AS total
            FROM note_highlights
            WHERE user_id = ${userId} AND note_slug = ${slug}
          `;
          const currentTotal = Number(countRows?.[0]?.total ?? 0);
          if (currentTotal >= MAX_HIGHLIGHTS_PER_NOTE) {
            return jsonResponse({ error: "Too many highlights in this note." }, 409, corsOrigin);
          }

          const duplicateRows = await sql`
            SELECT id, note_slug, start_offset, end_offset, selected_text, color, created_at, updated_at
            FROM note_highlights
            WHERE
              user_id = ${userId}
              AND note_slug = ${slug}
              AND start_offset = ${startOffset}
              AND end_offset = ${endOffset}
            LIMIT 1
          `;
          if (duplicateRows.length) {
            return jsonResponse(
              { success: true, duplicate: true, highlight: mapHighlightRow(duplicateRows[0]) },
              200,
              corsOrigin,
            );
          }

          const overlapRows = await sql`
            SELECT id
            FROM note_highlights
            WHERE
              user_id = ${userId}
              AND note_slug = ${slug}
              AND NOT (end_offset <= ${startOffset} OR start_offset >= ${endOffset})
            LIMIT 1
          `;
          if (overlapRows.length) {
            return jsonResponse({ error: "Highlight overlaps with an existing range." }, 409, corsOrigin);
          }

          const insertedRows = await sql`
            INSERT INTO note_highlights (user_id, note_slug, start_offset, end_offset, selected_text, color, updated_at)
            VALUES (${userId}, ${slug}, ${startOffset}, ${endOffset}, ${selectedText}, ${color}, NOW())
            RETURNING id, note_slug, start_offset, end_offset, selected_text, color, created_at, updated_at
          `;

          return jsonResponse({ success: true, highlight: mapHighlightRow(insertedRows[0]) }, 201, corsOrigin);
        }

        if (request.method === "DELETE") {
          if (highlightId === null) {
            await sql`
              DELETE FROM note_highlights
              WHERE user_id = ${userId} AND note_slug = ${slug}
            `;
            return jsonResponse({ success: true, cleared: true }, 200, corsOrigin);
          }

          const deletedRows = await sql`
            DELETE FROM note_highlights
            WHERE user_id = ${userId} AND note_slug = ${slug} AND id = ${highlightId}
            RETURNING id
          `;
          if (!deletedRows.length) {
            return jsonResponse({ error: "Highlight not found." }, 404, corsOrigin);
          }

          return jsonResponse({ success: true, id: highlightId }, 200, corsOrigin);
        }
      }

      if (request.method === "GET" && url.pathname === "/notes") {
        const userId = Number(authenticatedUser?.id);
        const rawLimit = Number(url.searchParams.get("limit") || 20);
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(Math.floor(rawLimit), 300)) : 20;
        const includeContent = asBoolean(url.searchParams.get("include_content"));
        const includeTrash = asBoolean(url.searchParams.get("trash"));
        const rows = includeContent
          ? includeTrash
            ? await sql`
                SELECT slug, title, topic, topic_zh, topic_en, tags, folder_id, mdx_content, deleted_at, created_at, updated_at
                FROM notes
                WHERE user_id = ${userId} AND deleted_at IS NOT NULL
                ORDER BY updated_at DESC
                LIMIT ${limit}
              `
            : await sql`
                SELECT slug, title, topic, topic_zh, topic_en, tags, folder_id, mdx_content, deleted_at, created_at, updated_at
                FROM notes
                WHERE user_id = ${userId} AND deleted_at IS NULL
                ORDER BY updated_at DESC
                LIMIT ${limit}
              `
          : includeTrash
            ? await sql`
                SELECT slug, title, topic, topic_zh, topic_en, tags, folder_id, deleted_at, created_at, updated_at
                FROM notes
                WHERE user_id = ${userId} AND deleted_at IS NOT NULL
                ORDER BY updated_at DESC
                LIMIT ${limit}
              `
            : await sql`
                SELECT slug, title, topic, topic_zh, topic_en, tags, folder_id, deleted_at, created_at, updated_at
                FROM notes
                WHERE user_id = ${userId} AND deleted_at IS NULL
                ORDER BY updated_at DESC
                LIMIT ${limit}
              `;

        return jsonResponse({ success: true, notes: rows }, 200, corsOrigin);
      }

      if (request.method === "GET" && url.pathname.startsWith("/notes/")) {
        const userId = Number(authenticatedUser?.id);
        const slug = decodeURIComponent(url.pathname.replace("/notes/", "")).trim();
        if (!slug) {
          return jsonResponse({ error: "Slug is required." }, 400, corsOrigin);
        }

        const rows = await sql`
          SELECT slug, title, topic, topic_zh, topic_en, tags, folder_id, mdx_content, deleted_at, created_at, updated_at
          FROM notes
          WHERE user_id = ${userId} AND slug = ${slug} AND deleted_at IS NULL
          LIMIT 1
        `;

        if (!rows.length) {
          return jsonResponse({ error: "Note not found." }, 404, corsOrigin);
        }

        return jsonResponse({ success: true, note: rows[0] }, 200, corsOrigin);
      }

      if (request.method === "PATCH" && url.pathname.startsWith("/notes/")) {
        const userId = Number(authenticatedUser?.id);
        const slug = decodeURIComponent(url.pathname.replace("/notes/", "")).trim();
        if (!slug) {
          return jsonResponse({ error: "Slug is required." }, 400, corsOrigin);
        }

        const body = await request.json().catch(() => null);
        if (!body || typeof body !== "object") {
          return jsonResponse({ error: "Invalid JSON body." }, 400, corsOrigin);
        }

        const rows = await sql`
          SELECT slug, title, topic, topic_zh, topic_en, tags, folder_id, mdx_content
          FROM notes
          WHERE user_id = ${userId} AND slug = ${slug} AND deleted_at IS NULL
          LIMIT 1
        `;

        if (!rows.length) {
          return jsonResponse({ error: "Note not found." }, 404, corsOrigin);
        }

        const current = rows[0];
        const titleInput = String(body.title ?? "").trim();
        const topicInput = String(body.topic ?? "").trim();
        const tagsInput = parseTags(body.tags);
        const hasFolderId = Object.prototype.hasOwnProperty.call(body, "folderId");
        const hasMdxContent = Object.prototype.hasOwnProperty.call(body, "mdxContent");
        let nextFolderId = current.folder_id === null || current.folder_id === undefined ? null : Number(current.folder_id);

        if (hasFolderId) {
          const parsedFolderId = parseFolderId(body.folderId);
          if (Number.isNaN(parsedFolderId)) {
            return jsonResponse({ error: "folderId must be a positive integer or null." }, 400, corsOrigin);
          }

          if (parsedFolderId === null) {
            nextFolderId = null;
          } else {
            const folderRows = await sql`
              SELECT id
              FROM folders
              WHERE user_id = ${userId} AND id = ${parsedFolderId}
              LIMIT 1
            `;
            if (!folderRows.length) {
              return jsonResponse({ error: "Folder not found for current user." }, 400, corsOrigin);
            }
            nextFolderId = parsedFolderId;
          }
        }

        const nextTitle = titleInput || String(current.title ?? "").trim() || "未命名笔记";
        const currentTags = parseTags(current.tags);
        const nextTags = tagsInput.length ? tagsInput.slice(0, 12) : currentTags.slice(0, 12);
        const topicSeed =
          topicInput ||
          String(current.topic_zh ?? "").trim() ||
          String(current.topic ?? "").trim() ||
          deriveTopicFromTitleOrTags(nextTitle, nextTags);
        const topicParts = splitTopic(topicSeed, nextTitle);
        const nextMdxContent = hasMdxContent
          ? normalizeNewlines(String(body.mdxContent ?? "")).trim()
          : String(current.mdx_content ?? "");

        if (hasMdxContent && !nextMdxContent) {
          return jsonResponse({ error: "mdxContent cannot be empty." }, 400, corsOrigin);
        }

        await sql`
          UPDATE notes
          SET
            title = ${nextTitle},
            topic = ${topicParts.topic},
            topic_zh = ${topicParts.topicZh},
            topic_en = ${topicParts.topicEn},
            tags = ${JSON.stringify(nextTags)},
            folder_id = ${nextFolderId},
            mdx_content = ${nextMdxContent},
            updated_at = NOW()
          WHERE user_id = ${userId} AND slug = ${slug}
        `;

        return jsonResponse(
          {
            success: true,
            slug,
            note: {
              slug,
              weekLabelZh: topicParts.topicZh,
              weekLabelEn: topicParts.topicEn,
              zhTitle: nextTitle,
              enTitle: nextTitle,
              descriptionZh: `关于“${nextTitle}”的双语学习笔记。`,
              descriptionEn: `Bilingual study note on ${nextTitle}.`,
              tags: nextTags,
              folderId: nextFolderId,
            },
          },
          200,
          corsOrigin,
        );
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/notes/")) {
        const userId = Number(authenticatedUser?.id);
        const slug = decodeURIComponent(url.pathname.replace("/notes/", "")).trim();
        const permanent = asBoolean(url.searchParams.get("permanent"));
        if (!slug) {
          return jsonResponse({ error: "Slug is required." }, 400, corsOrigin);
        }

        const deleted = permanent
          ? await sql`
              DELETE FROM notes
              WHERE user_id = ${userId} AND slug = ${slug} AND deleted_at IS NOT NULL
              RETURNING slug
            `
          : await sql`
              UPDATE notes
              SET deleted_at = NOW(), updated_at = NOW()
              WHERE user_id = ${userId} AND slug = ${slug} AND deleted_at IS NULL
              RETURNING slug
            `;

        if (!deleted.length) {
          return jsonResponse({ error: permanent ? "Note not found in trash." : "Note not found." }, 404, corsOrigin);
        }

        if (permanent) {
          await sql`
            DELETE FROM note_highlights
            WHERE user_id = ${userId} AND note_slug = ${slug}
          `;
        }

        return jsonResponse({ success: true, slug, movedToTrash: !permanent, permanentlyDeleted: permanent }, 200, corsOrigin);
      }

      const noteRestoreMatch = url.pathname.match(/^\/notes\/([^/]+)\/restore$/);
      if (request.method === "POST" && noteRestoreMatch) {
        const userId = Number(authenticatedUser?.id);
        const slug = decodeURIComponent(noteRestoreMatch[1] ?? "").trim();
        if (!slug) {
          return jsonResponse({ error: "Slug is required." }, 400, corsOrigin);
        }

        const rows = await sql`
          SELECT slug, title
          FROM notes
          WHERE user_id = ${userId} AND slug = ${slug} AND deleted_at IS NOT NULL
          LIMIT 1
        `;
        if (!rows.length) {
          return jsonResponse({ error: "Note not found in trash." }, 404, corsOrigin);
        }

        const baseSlug = String(rows[0].slug ?? "").trim();
        const matchingSlugs = await sql`
          SELECT slug
          FROM notes
          WHERE user_id = ${userId}
            AND slug <> ${slug}
            AND (slug = ${baseSlug} OR slug LIKE ${`${baseSlug}-%`})
        `;
        const restoredSlug = resolveUniqueSlug(baseSlug, matchingSlugs.map((row) => row.slug));

        await sql`
          UPDATE notes
          SET slug = ${restoredSlug}, deleted_at = NULL, updated_at = NOW()
          WHERE user_id = ${userId} AND slug = ${slug} AND deleted_at IS NOT NULL
        `;

        if (restoredSlug !== slug) {
          await sql`
            UPDATE note_highlights
            SET note_slug = ${restoredSlug}
            WHERE user_id = ${userId} AND note_slug = ${slug}
          `;
        }

        return jsonResponse({ success: true, slug: restoredSlug, restoredFrom: slug }, 200, corsOrigin);
      }

      if (request.method === "POST" && url.pathname === "/notes/generate") {
        const userId = Number(authenticatedUser?.id);
        if (!env.OPENAI_API_KEY) {
          return jsonResponse({ error: "OPENAI_API_KEY is missing." }, 500, corsOrigin);
        }

        let payload;
        try {
          payload = await parseGeneratePayload(request);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid request body.";
          return jsonResponse({ error: message }, 400, corsOrigin);
        }

        const { title: titleInput, topicInput, tags: tagsInput, sourceText, fileName, extraInstruction, promptTemplate, generateInteractiveDemo } = payload;
        const modelName = resolveModelName(env, payload.model, ALLOWED_NOTE_GENERATION_MODELS);

        if (!sourceText) {
          return jsonResponse({ error: "sourceText is required." }, 400, corsOrigin);
        }

        if (!promptTemplate) {
          return jsonResponse({ error: "promptTemplate is required." }, 400, corsOrigin);
        }

        const resolvedMeta = await resolveGenerationMetadata({
          env,
          titleInput,
          topicInput,
          tagsInput,
          sourceText,
          fileName,
          modelName,
        });

        const title = resolvedMeta.title;
        const tags = resolvedMeta.tags;
        const baseSlug = slugifyTitle(title);
        const topicParts = splitTopic(resolvedMeta.topic, title);

        const matchingSlugs = await sql`
          SELECT slug
          FROM notes
          WHERE user_id = ${userId}
            AND (slug = ${baseSlug} OR slug LIKE ${`${baseSlug}-%`})
        `;
        const slug = resolveUniqueSlug(baseSlug, matchingSlugs.map((row) => row.slug));

        const mdxContentRaw = await generateMdx({
          env,
          title,
          topic: resolvedMeta.topic,
          tags,
          sourceText,
          extraInstruction,
          promptTemplate,
          modelName,
          generateInteractiveDemo,
        });
        const normalizedArgs = {
          title,
          slug,
          topic: topicParts.topic,
          topicZh: topicParts.topicZh,
          topicEn: topicParts.topicEn,
          tags,
          sourceText,
        };
        const baseMdxContent = normalizeGeneratedMdx(mdxContentRaw, {
          ...normalizedArgs,
          generateInteractiveDemo: false,
        });

        let interactiveDesignSpecs = [];
        if (generateInteractiveDemo) {
          interactiveDesignSpecs = await generateInteractiveDesignSpecsWithAI({
            env,
            title,
            topic: topicParts.topic,
            tags,
            noteContent: baseMdxContent,
            modelName,
          });

          if (!interactiveDesignSpecs.length) {
            interactiveDesignSpecs = buildInteractiveDesignSpecsFromNote({
              title,
              topic: topicParts.topic,
              source: baseMdxContent,
            });
          }
        }

        const mdxContent = generateInteractiveDemo
          ? normalizeGeneratedMdx(mdxContentRaw, {
              ...normalizedArgs,
              generateInteractiveDemo: true,
              interactiveDesignSpecs,
            })
          : baseMdxContent;

        if (!mdxContent) {
          return jsonResponse({ error: "AI returned empty content." }, 502, corsOrigin);
        }

        await sql`
          INSERT INTO notes (user_id, slug, title, topic, topic_zh, topic_en, tags, mdx_content, source_text, updated_at)
          VALUES (
            ${userId},
            ${slug},
            ${title},
            ${topicParts.topic},
            ${topicParts.topicZh},
            ${topicParts.topicEn},
            ${JSON.stringify(tags)},
            ${mdxContent},
            ${sourceText},
            NOW()
          )
        `;

        const preview = mdxContent.split(/\r?\n/).slice(0, 28).join("\n");

        return jsonResponse(
          {
            success: true,
            slug,
            replaced: false,
            fileName: `${slug}.mdx`,
            preview,
            note: {
              slug,
              weekLabelZh: topicParts.topicZh,
              weekLabelEn: topicParts.topicEn,
              zhTitle: title,
              enTitle: title,
              descriptionZh: extractFrontmatterTextFromRaw(mdxContent, "descriptionZh") ?? `概括 ${topicParts.topicZh || title} 核心内容的学习笔记。`,
              descriptionEn: extractFrontmatterTextFromRaw(mdxContent, "descriptionEn") ?? `A concise study note on ${topicParts.topicEn || title}.`,
              tags,
            },
          },
          200,
          corsOrigin,
        );
      }

      return jsonResponse({ error: "Not found." }, 404, corsOrigin);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Internal server error.";
      return jsonResponse({ error: message }, 500, corsOrigin);
    }
  },
};
