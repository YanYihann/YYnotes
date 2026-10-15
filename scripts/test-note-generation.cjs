const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const JSZip = require("jszip");

// Exercise the production TypeScript directly, with transport/provider stubs.
// These tests never call an AI provider or write a note/account.
function loadClient(fetchImpl, pdfImpl, signalImpl = AbortSignal) {
  const limits = loadModule("lib/ai/generation-limits.ts", {});
  return loadModule("lib/ai/note-generation-client.ts", {
    fetch: fetchImpl, AbortSignal: signalImpl,
    require: (name) => name === "./generation-limits" ? limits
      : name.includes("pdfjs-dist") ? pdfImpl : require(name),
  });
}
function loadModule(file, overrides) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const context = { exports: {}, require, process: { env: { NEXT_PUBLIC_NOTES_API_BASE: "/api/cloud", NOTES_UPSTREAM_URL: "https://worker.invalid" } },
    File, Blob, FormData, Request, Response, Headers, AbortSignal, DOMException, URL, setTimeout, clearTimeout, ...overrides };
  vm.runInNewContext(js, context, { filename: file });
  return context.exports;
}
const payload = (overrides = {}) => ({ title: "", topic: "", tags: "", source: { sourceText: "Public test material.", fileName: "source.txt" },
  extraInstruction: "Preserve examples", model: "gpt-4.1-mini", promptPreset: "standard", customPromptTemplate: "", generateInteractiveDemo: false, authToken: "test-token", ...overrides });
const response = (json, status = 200) => Response.json(json, { status });
const ok = () => response({ success: true, slug: "test-note", note: null, fileName: "test-note.mdx", preview: "" });
const neverFetch = () => { throw new Error("Unexpected network request"); };

test("source limits reject excess text without truncating or submitting", async () => {
  const client = loadClient(neverFetch);
  assert.equal(client.validateGenerationText("  A\r\nB  "), "A\nB");
  assert.equal(client.validateGenerationText("x".repeat(35000)).length, 35000);
  assert.throws(() => client.validateGenerationText("x".repeat(35001)), (e) => e.code === "source_too_long");
  await assert.rejects(client.generateWorkspaceNote({ file: null, text: "x".repeat(35001), instruction: "", title: "", model: "gpt-4.1-mini", authToken: "test", signal: new AbortController().signal }), (e) => e.code === "source_too_long");
});

test("DOCX preserves paragraphs, tables, entities and footnotes", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", '<w:document><w:p><w:t>Definition &amp; example</w:t></w:p><w:tbl><w:tr><w:tc><w:p><w:t>Term</w:t></w:p></w:tc><w:tc><w:p><w:t>Value</w:t></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:t>Weight</w:t></w:p></w:tc><w:tc><w:p><w:t>0.6</w:t></w:p></w:tc></w:tr></w:tbl></w:document>');
  zip.file("word/footnotes.xml", '<w:p><w:t>Reference</w:t></w:p>');
  const file = new File([await zip.generateAsync({ type: "uint8array" })], "document.docx");
  const source = await loadClient(neverFetch).resolveGenerationSourcePayload(file);
  assert.equal(source.fileName, file.name);
  assert.equal(source.sourceText, "Definition & example\n\nTerm\tValue\nWeight\t0.6\n\nReference");
});

test("PPTX retains numeric slide order and rejects long files", async () => {
  const zip = new JSZip();
  for (const i of [10, 2, 1]) zip.file(`ppt/slides/slide${i}.xml`, `<a:p><a:t>Slide ${i}</a:t></a:p>`);
  const source = await loadClient(neverFetch).resolveGenerationSourcePayload(new File([await zip.generateAsync({ type: "uint8array" })], "slides.pptx"));
  assert.equal(source.sourceText, "Slide 1\n\nSlide 2\n\nSlide 10");
  zip.file("ppt/slides/slide1.xml", `<a:p><a:t>${"x".repeat(35001)}</a:t></a:p>`);
  await assert.rejects(loadClient(neverFetch).resolveGenerationSourcePayload(new File([await zip.generateAsync({ type: "uint8array" })], "long.pptx")), (e) => e.code === "source_too_long");
});

test("PDF reading reports real page progress and cleans resources", async () => {
  let destroyed = 0, cleaned = 0;
  const phases = [];
  const pdf = { GlobalWorkerOptions: {}, getDocument: () => ({ destroy: async () => { destroyed++; }, promise: Promise.resolve({ numPages: 2, getPage: async (i) => ({ cleanup: () => cleaned++, getTextContent: async () => ({ items: [{ str: `Page ${i}`, hasEOL: true }, { str: "Evidence", hasEOL: false }] }) }) }) }) };
  const source = await loadClient(neverFetch, pdf).resolveGenerationSourcePayload(new File(["fixture"], "source.pdf"), undefined, (phase) => phases.push(phase));
  assert.equal(source.sourceText, "Page 1\nEvidence\n\nPage 2\nEvidence");
  assert.equal(phases.at(-1).current, 2);
  assert.equal(phases.at(-1).total, 2);
  assert.equal(cleaned, 2);
  assert.equal(destroyed, 1);
});

test("cancelling a pending PDF destroys the worker and rejects promptly", async () => {
  const controller = new AbortController();
  let rejectLoading, started, destroyed = 0;
  const ready = new Promise((resolve) => { started = resolve; });
  const pdf = { GlobalWorkerOptions: {}, getDocument: () => { started(); return { promise: new Promise((_, reject) => { rejectLoading = reject; }), destroy: async () => { destroyed++; rejectLoading(new Error("Destroyed")); } }; } };
  const reading = loadClient(neverFetch, pdf).resolveGenerationSourcePayload(new File(["fixture"], "source.pdf"), controller.signal);
  await ready;
  controller.abort();
  await assert.rejects(reading, (e) => e.name === "AbortError");
  assert.ok(destroyed >= 1);
});

test("scanned PDFs and unsupported/empty files fail before generation", async () => {
  const pdf = { GlobalWorkerOptions: {}, getDocument: () => ({ destroy: async () => {}, promise: Promise.resolve({ numPages: 1, getPage: async () => ({ cleanup: () => {}, getTextContent: async () => ({ items: [] }) }) }) }) };
  const client = loadClient(neverFetch, pdf);
  await assert.rejects(client.resolveGenerationSourcePayload(new File(["fixture"], "scan.pdf")), (e) => e.code === "pdf_scan");
  await assert.rejects(client.resolveGenerationSourcePayload(new File(["fixture"], "legacy.doc")), (e) => e.code === "unsupported_file");
  await assert.rejects(client.resolveGenerationSourcePayload(new File([], "empty.txt")), (e) => e.code === "empty_source");
});

test("prompt cache, actual multipart fields and a single generation submission", async () => {
  let promptReads = 0, posts = 0;
  const phases = [];
  const client = loadClient(async (url, options) => {
    if (!options?.method) { promptReads++; return new Response("# Active bilingual rules"); }
    posts++;
    assert.equal(url, "/api/cloud/notes/generate");
    assert.equal(options.headers.Authorization, "Bearer test-token");
    assert.equal(options.body.get("sourceText"), "Public test material.");
    assert.equal(options.body.get("promptTemplate"), "# Active bilingual rules");
    assert.equal(options.body.get("generateInteractiveDemo"), "false");
    return ok();
  });
  await client.resolvePromptTemplateForPreset("standard", "");
  const result = await client.submitNoteGeneration(payload({ onPhase: (phase) => phases.push(phase) }), "cloud");
  assert.equal(result.slug, "test-note");
  assert.equal(promptReads, 1);
  assert.equal(posts, 1);
  assert.equal(phases.at(-1).stage, "generating");
});

test("failures and invalid results never automatically retry and distinguish uncertain saves", async () => {
  for (const [status, json, code, uncertain] of [[401, {}, "unauthenticated", false], [429, {}, "rate_limit", false], [502, {}, "server_error", true], [200, { success: true }, "invalid_result", true]]) {
    let posts = 0;
    const client = loadClient(async (_, options) => options?.method ? (posts++, response(json, status)) : new Response("# Rules"));
    await assert.rejects(client.submitNoteGeneration(payload(), "cloud"), (e) => e.code === code && e.uncertain === uncertain);
    assert.equal(posts, 1);
  }
  let posts = 0;
  const client = loadClient(async (_, options) => { if (!options?.method) return new Response("# Rules"); posts++; throw new TypeError("Failed to fetch"); });
  await assert.rejects(client.submitNoteGeneration(payload(), "cloud"), (e) => e.code === "network" && e.uncertain);
  assert.equal(posts, 1);
});

test("abort after response arrival rejects stale success", async () => {
  const controller = new AbortController();
  const client = loadClient(async (_, options) => { if (!options?.method) return new Response("# Rules"); controller.abort(); return ok(); });
  await assert.rejects(client.submitNoteGeneration(payload({ signal: controller.signal }), "cloud"), (e) => e.name === "AbortError");
});

test("complete multipart sizing reserves overhead for a 4 MiB file", async () => {
  const file = new File([new Uint8Array(4 * 1024 * 1024)], "boundary.txt");
  let posts = 0;
  const client = loadClient(async (_, options) => options?.method ? (posts++, ok()) : new Response("# Rules"));
  await client.submitNoteGeneration(payload({ source: { sourceFile: file, fileName: file.name } }), "cloud");
  assert.equal(posts, 1);
  await assert.rejects(client.submitNoteGeneration(payload({ source: { sourceFile: file, fileName: file.name }, promptPreset: "custom", customPromptTemplate: "p".repeat(200000) }), "cloud"), (e) => e.code === "request_too_large");
  assert.equal(posts, 1);
});

function loadProxy(fetchImpl) {
  const limits = loadModule("lib/ai/generation-limits.ts", {});
  return loadModule("app/api/cloud/notes/generate/route.ts", { fetch: fetchImpl, require: (name) => name.includes("generation-limits") ? limits : require(name) });
}
const request = (form, authorized = true) => new Request("https://site.invalid/api/cloud/notes/generate", { method: "POST", body: form, headers: authorized ? { Authorization: "Bearer test-token" } : {} });
test("proxy validates missing auth, oversized text and empty source before upstream", async () => {
  const { POST } = loadProxy(neverFetch);
  let form = new FormData(); form.set("sourceText", "Source");
  assert.equal((await POST(request(form, false))).status, 401);
  form = new FormData(); form.set("sourceText", "x".repeat(35001));
  assert.equal((await POST(request(form))).status, 400);
  assert.equal((await POST(request(new FormData()))).status, 400);
});
test("proxy accepts 4 MiB files with prompt overhead but rejects files over the limit", async () => {
  let calls = 0;
  const { POST } = loadProxy(async () => { calls++; return ok(); });
  const form = new FormData(); form.set("sourceFile", new File([new Uint8Array(4 * 1024 * 1024)], "source.txt")); form.set("promptTemplate", "# Rules");
  assert.equal((await POST(request(form))).status, 200);
  form.set("sourceFile", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "source.txt"));
  assert.equal((await POST(request(form))).status, 413);
  assert.equal(calls, 1);
});
