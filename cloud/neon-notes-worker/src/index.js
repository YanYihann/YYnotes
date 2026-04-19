import { neon } from "@neondatabase/serverless";
import JSZip from "jszip";

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_CHARS = 35_000;
const MAX_EXTRA_INSTRUCTION_CHARS = 1_500;
const SUPPORTED_TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "tex", "csv", "rst"]);
const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

function jsonResponse(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Notes-Write-Key",
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

function getOrigin(requestOrigin, allowedOrigin) {
  const normalizedAllowed = normalizeOriginValue(allowedOrigin);

  if (normalizedAllowed === "*") {
    return "*";
  }

  if (!requestOrigin) {
    return normalizedAllowed;
  }

  const normalizedRequest = normalizeOriginValue(requestOrigin);
  return normalizedRequest === normalizedAllowed ? normalizedRequest : normalizedAllowed;
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

function clampText(value, max) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.length > max ? `${trimmed.slice(0, max)}\n...[truncated]` : trimmed;
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

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("文件过大，请控制在 4MB 以内。");
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

function splitTopic(topicInput, title) {
  const normalized = String(topicInput ?? "").trim();
  if (!normalized) {
    return {
      topicZh: "未分类",
      topicEn: "General",
      topic: "未分类 / General",
    };
  }

  const hasZh = /[\u4e00-\u9fff]/.test(normalized);
  const hasEn = /[A-Za-z]/.test(normalized);
  const topicZh = hasEn && !hasZh ? "未分类" : normalized;
  const topicEn = hasZh && !hasEn ? String(title ?? "") : normalized;

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

function buildUserPrompt({ title, topic, tags, sourceText, extraInstruction }) {
  const tagsLine = tags.length ? tags.join("、") : "未指定";

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

async function generateMdx({ env, title, topic, tags, sourceText, extraInstruction, promptTemplate }) {
  const openaiBaseUrl = normalizeApiBase(env.OPENAI_BASE_URL);
  const responsesEndpoint = `${openaiBaseUrl}/responses`;
  const chatCompletionsEndpoint = `${openaiBaseUrl}/chat/completions`;
  const modelName = env.OPENAI_MODEL || "gpt-4.1-mini";
  const systemPrompt = buildSystemPrompt(promptTemplate);
  const userPrompt = buildUserPrompt({ title, topic, tags, sourceText, extraInstruction });

  const response = await fetch(responsesEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: modelName,
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
      model: modelName,
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

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS notes (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      topic_zh TEXT NOT NULL,
      topic_en TEXT NOT NULL,
      tags JSONB NOT NULL DEFAULT '[]'::jsonb,
      mdx_content TEXT NOT NULL,
      source_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

function requireWriteKey(request, env) {
  if (!env.WRITE_API_KEY) {
    return true;
  }

  const provided = request.headers.get("X-Notes-Write-Key") || "";
  return provided === env.WRITE_API_KEY;
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
      extraInstruction: clampText(String(formData.get("extraInstruction") || ""), MAX_EXTRA_INSTRUCTION_CHARS),
      promptTemplate: String(formData.get("promptTemplate") || "").trim(),
      overwrite: asBoolean(formData.get("overwrite")),
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
    extraInstruction: clampText(String(body.extraInstruction || ""), MAX_EXTRA_INSTRUCTION_CHARS),
    promptTemplate: String(body.promptTemplate || "").trim(),
    overwrite: Boolean(body.overwrite),
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

      if (request.method === "GET" && url.pathname === "/notes") {
        const limit = Math.min(Number(url.searchParams.get("limit") || 20), 100);
        const rows = await sql`
          SELECT slug, title, topic, topic_zh, topic_en, tags, created_at, updated_at
          FROM notes
          ORDER BY updated_at DESC
          LIMIT ${limit}
        `;

        return jsonResponse({ success: true, notes: rows }, 200, corsOrigin);
      }

      if (request.method === "GET" && url.pathname.startsWith("/notes/")) {
        const slug = decodeURIComponent(url.pathname.replace("/notes/", "")).trim();
        if (!slug) {
          return jsonResponse({ error: "Slug is required." }, 400, corsOrigin);
        }

        const rows = await sql`
          SELECT slug, title, topic, topic_zh, topic_en, tags, mdx_content, created_at, updated_at
          FROM notes
          WHERE slug = ${slug}
          LIMIT 1
        `;

        if (!rows.length) {
          return jsonResponse({ error: "Note not found." }, 404, corsOrigin);
        }

        return jsonResponse({ success: true, note: rows[0] }, 200, corsOrigin);
      }

      if (request.method === "DELETE" && url.pathname.startsWith("/notes/")) {
        if (!requireWriteKey(request, env)) {
          return jsonResponse({ error: "Unauthorized write request." }, 401, corsOrigin);
        }

        const slug = decodeURIComponent(url.pathname.replace("/notes/", "")).trim();
        if (!slug) {
          return jsonResponse({ error: "Slug is required." }, 400, corsOrigin);
        }

        const deleted = await sql`
          DELETE FROM notes
          WHERE slug = ${slug}
          RETURNING slug
        `;

        if (!deleted.length) {
          return jsonResponse({ error: "Note not found." }, 404, corsOrigin);
        }

        return jsonResponse({ success: true, slug }, 200, corsOrigin);
      }

      if (request.method === "POST" && url.pathname === "/notes/generate") {
        if (!requireWriteKey(request, env)) {
          return jsonResponse({ error: "Unauthorized write request." }, 401, corsOrigin);
        }

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

        const { title, topicInput, tags, sourceText, extraInstruction, promptTemplate, overwrite } = payload;

        if (!title) {
          return jsonResponse({ error: "title is required." }, 400, corsOrigin);
        }

        if (!sourceText) {
          return jsonResponse({ error: "sourceText is required." }, 400, corsOrigin);
        }

        if (!promptTemplate) {
          return jsonResponse({ error: "promptTemplate is required." }, 400, corsOrigin);
        }

        const slug = slugifyTitle(title);
        const topicParts = splitTopic(topicInput, title);

        const existing = await sql`SELECT slug FROM notes WHERE slug = ${slug} LIMIT 1`;
        if (existing.length && !overwrite) {
          return jsonResponse({ error: `slug ${slug} already exists.` }, 409, corsOrigin);
        }

        const mdxContent = await generateMdx({
          env,
          title,
          topic: topicInput,
          tags,
          sourceText,
          extraInstruction,
          promptTemplate,
        });

        await sql`
          INSERT INTO notes (slug, title, topic, topic_zh, topic_en, tags, mdx_content, source_text, updated_at)
          VALUES (
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
          ON CONFLICT (slug)
          DO UPDATE SET
            title = EXCLUDED.title,
            topic = EXCLUDED.topic,
            topic_zh = EXCLUDED.topic_zh,
            topic_en = EXCLUDED.topic_en,
            tags = EXCLUDED.tags,
            mdx_content = EXCLUDED.mdx_content,
            source_text = EXCLUDED.source_text,
            updated_at = NOW()
        `;

        const preview = mdxContent.split(/\r?\n/).slice(0, 28).join("\n");

        return jsonResponse(
          {
            success: true,
            slug,
            replaced: existing.length > 0,
            fileName: `${slug}.mdx`,
            preview,
            note: {
              slug,
              weekLabelZh: topicParts.topicZh,
              weekLabelEn: topicParts.topicEn,
              zhTitle: title,
              enTitle: title,
              descriptionZh: `关于“${title}”的双语学习笔记。`,
              descriptionEn: `Bilingual study note on ${title}.`,
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
