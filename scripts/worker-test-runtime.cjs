const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { webcrypto } = require("node:crypto");

// Execute the real Worker with injected transport/database; no production token is minted.
exports.loadWorker = (fetchImpl, sqlImpl = async () => []) => {
  const filename = path.join(__dirname, "../cloud/neon-notes-worker/src/index.js");
  const source = fs.readFileSync(filename, "utf8");
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const context = { exports: {}, fetch: fetchImpl, require: (name) => name === "@neondatabase/serverless" ? { neon: () => sqlImpl } : require(name),
    Request, Response, Headers, URL, FormData, File, Blob, ReadableStream, TextEncoder, TextDecoder, Uint8Array,
    crypto: webcrypto, btoa, atob, AbortSignal, setTimeout, clearTimeout };
  vm.runInNewContext(js + "\nexports.testApi = { createAuthToken, requestChatCompletion, generateMdx, createAssistantStream, resolveModelName };", context, { filename });
  return context.exports;
};
