export default {
  fetch() {
    return new Response("YYnotes worker build check OK", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },
} satisfies ExportedHandler;
