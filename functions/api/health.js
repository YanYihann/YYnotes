export async function onRequestGet(context) {
  const timestamp = new Date().toISOString();
  const commit = context.env.CF_PAGES_COMMIT_SHA || "";

  return new Response(
    JSON.stringify({
      ok: true,
      service: "yynotes-pages-functions",
      timestamp,
      commit,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
