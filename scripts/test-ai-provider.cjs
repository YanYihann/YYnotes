const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadWorker } = require("./worker-test-runtime.cjs");
const env = { DATABASE_URL: "test-only", AUTH_SECRET: "test-only-auth-secret", OPENAI_API_KEY: "test-only-provider-key", OPENAI_BASE_URL: "https://api.302.ai/v1", OPENAI_MODEL: "deepseek-v3.2" };
const completion = (content, finish_reason = "stop") => Response.json({ choices: [{ message: { content }, finish_reason }] });
const user = { id: 1, username: "test@example.invalid", display_name: "Test" };

test("generation authenticates, uses only chat completions and saves bilingual output", async () => {
  const calls = []; let saved;
  const worker = loadWorker(async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    assert.equal(body.model, "deepseek-v3.2");
    assert.equal(url, "https://api.302.ai/v1/chat/completions");
    return body.max_tokens === 1024 ? completion('{"title":"测试笔记","topic":"研究方法","tags":["阅读"]}')
      : completion("# 中文版本\n\n## 定义\n公开资料。\n\n# English Version\n\n## Definition\nPublic material.");
  }, async (parts, ...values) => {
    const query = parts.join("?");
    if (/FROM users/.test(query)) return [user];
    if (/INSERT INTO notes/.test(query)) saved = values;
    return [];
  });
  const token = await worker.testApi.createAuthToken(env.AUTH_SECRET, user);
  const form = new FormData(); form.set("sourceText", "Public material."); form.set("promptTemplate", "Preserve the aligned Chinese and English versions."); form.set("model", "gpt-4.1-mini");
  const result = await worker.default.fetch(new Request("https://worker.invalid/notes/generate", { method: "POST", body: form, headers: { Authorization: `Bearer ${token}` } }), env);
  assert.equal(result.status, 200); assert.equal((await result.json()).success, true);
  assert.equal(calls.length, 2); assert.equal(saved[0], user.id); assert.match(saved[7], /English Version/); assert.match(saved[7], /中文/);
});

test("provider failures and truncated output fail without a fallback request", async () => {
  for (const [response, message] of [[Response.json({ error: { message: "Invalid key" } }, { status: 401 }), /HTTP 401/], [completion("Partial note", "length"), /output limit/], [completion(""), /no readable text/]]) {
    let calls = 0; const worker = loadWorker(async () => { calls++; return response; });
    await assert.rejects(worker.testApi.requestChatCompletion(env, "deepseek-v3.2", []), message); assert.equal(calls, 1);
  }
});

test("assistant uses DeepSeek and forwards actual SSE content", async () => {
  const worker = loadWorker(async (url, options) => {
    const body = JSON.parse(options.body); assert.equal(body.model, "deepseek-v3.2"); assert.equal(body.stream, true); assert.equal(url, "https://api.302.ai/v1/chat/completions");
    return new Response('data: {"choices":[{"delta":{"content":"Test answer"}}]}\n\ndata: [DONE]\n\n', { headers: { "Content-Type": "text/event-stream" } });
  });
  const response = await worker.testApi.createAssistantStream(env, { question: "Explain", model: "gpt-4o-mini", history: [], context: { noteContent: "Public note" } }, "*");
  const text = await response.text(); assert.match(text, /"delta":"Test answer"/); assert.match(text, /\[DONE\]/);
});

test("unauthenticated generation never invokes the AI provider", async () => {
  const worker = loadWorker(() => { throw new Error("Must not invoke provider"); });
  const response = await worker.default.fetch(new Request("https://worker.invalid/notes/generate", { method: "POST" }), env);
  assert.equal(response.status, 401);
});
