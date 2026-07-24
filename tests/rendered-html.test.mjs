import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the initial Wordless customer experience", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*\blang="en"/i);
  assert.match(
    html,
    /<title>Wordless — Point instead of explaining<\/title>/i,
  );
  assert.match(html, /<main[^>]*\bclass="wordless-shell"/i);

  const headings = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) ?? [];
  assert.equal(headings.length, 1, "the page must expose exactly one h1");
  assert.match(headings[0], />\s*Wordless\s*<span[^>]*aria-hidden="true"[^>]*>\.<\/span>\s*<\/h1>/i);

  for (const label of [
    "Use any words you have",
    "Maria O. · Account already attached to this request",
    "What the machine heard",
    "A confident guess",
    "What actually happened",
    "Choose what you mean",
    "Your account can speak first.",
  ]) {
    assert.ok(html.includes(label), `missing initial customer label: ${label}`);
  }
  assert.match(html, /id="fragment-input"/i);
  assert.match(html, /value="order wrong the thing help"/i);
  assert.match(html, />Find what I mean<\/button>/i);

  assert.match(
    html,
    /<div(?=[^>]*\bclass="[^"]*\bjudge-surface\b[^"]*")(?=[^>]*\baria-hidden="true")[^>]*>/i,
  );
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/i);
  assert.doesNotMatch(html, /react-loading-skeleton|sites-skeleton/i);
  assert.doesNotMatch(html, /name="codex-preview"/i);
});

test("three choices use real buttons and presenter mode remains wired", async () => {
  const [demo, panel, card, rank, presenter, layout] = await Promise.all([
    readFile(new URL("../components/WordlessDemo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/WordlessPanel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/CandidateCard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/rank.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/PresenterBar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(rank, /\.slice\(0,\s*3\)/);
  assert.match(panel, /candidates\.map\(\(candidate, index\) => \([\s\S]*?<CandidateCard/);
  assert.match(
    card,
    /<button\b(?=[^>]*\btype="button")(?=[^>]*\bclassName="candidate-button")[^>]*>/,
  );

  assert.match(demo, /new URLSearchParams\(window\.location\.search\)\.get\("present"\) === "1"/);
  assert.match(demo, /<PresenterBar[\s\S]*?enabled=\{presenterEnabled\}/);
  assert.match(presenter, /aria-label="Presenter controls"/);
  assert.match(presenter, /event\.code === "Space"/);
  assert.match(presenter, /onJumpPath\(Number\(event\.key\) as 1 \| 2 \| 3\)/);

  assert.match(layout, /const title = "Wordless — Point instead of explaining"/);
  assert.match(layout, /applicationName: "Wordless"/);
});
