import { neon } from "@neondatabase/serverless";

function jsonResponse(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Notes-Write-Key",
    },
  });
}

function getOrigin(requestOrigin, allowedOrigin) {
  if (!requestOrigin || allowedOrigin === "*") {
    return "*";
  }

  return requestOrigin === allowedOrigin ? requestOrigin : allowedOrigin;
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

async function generateMdx({ env, title, topic, tags, sourceText, extraInstruction, promptTemplate }) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: buildSystemPrompt(promptTemplate) }],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildUserPrompt({ title, topic, tags, sourceText, extraInstruction }),
            },
          ],
        },
      ],
    }),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const message = json?.error?.message || "OpenAI generation failed.";
    throw new Error(message);
  }

  const outputText = typeof json?.output_text === "string" ? json.output_text.trim() : "";
  if (!outputText) {
    throw new Error("OpenAI returned empty content.");
  }

  return outputText;
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

export default {
  async fetch(request, env) {
    const requestOrigin = request.headers.get("Origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || "*";
    const corsOrigin = getOrigin(requestOrigin, allowedOrigin);

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

    if (request.method === "POST" && url.pathname === "/notes/generate") {
      if (!requireWriteKey(request, env)) {
        return jsonResponse({ error: "Unauthorized write request." }, 401, corsOrigin);
      }

      if (!env.OPENAI_API_KEY) {
        return jsonResponse({ error: "OPENAI_API_KEY is missing." }, 500, corsOrigin);
      }

      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return jsonResponse({ error: "Invalid JSON body." }, 400, corsOrigin);
      }

      const title = String(body.title || "").trim();
      const topicInput = String(body.topic || "").trim();
      const tags = parseTags(body.tags);
      const sourceText = String(body.sourceText || "").trim();
      const extraInstruction = String(body.extraInstruction || "").trim();
      const promptTemplate = String(body.promptTemplate || "").trim();
      const overwrite = Boolean(body.overwrite);

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
  },
};
