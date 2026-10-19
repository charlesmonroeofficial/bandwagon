import test from "node:test";
import assert from "node:assert/strict";
import { guessSongDetails, createYouTubeLookup } from "../youtube.js";
import { bindSongForm, youtubePlayerURL } from "../public/song-tools.js";

test("common YouTube music titles produce editable song and artist guesses", () => {
  for (const [title, author, expected] of [
    [
      "Talking Heads - Psycho Killer (Official Video)",
      "Talking Heads",
      { artist: "Talking Heads", title: "Psycho Killer" },
    ],
    [
      "Arctic Monkeys – Do I Wanna Know? [Official Music Video] [HD]",
      "Channel",
      { artist: "Arctic Monkeys", title: "Do I Wanna Know?" },
    ],
    [
      "Dreams (2004 Remaster)",
      "Fleetwood Mac - Topic",
      { artist: "Fleetwood Mac", title: "Dreams (2004 Remaster)" },
    ],
    [
      "Creep (Official Audio)",
      "RadioheadVEVO",
      { artist: "Radiohead", title: "Creep" },
    ],
    [
      "AC/DC - T.N.T. (Live at River Plate)",
      "AC/DC",
      { artist: "AC/DC", title: "T.N.T. (Live at River Plate)" },
    ],
    [
      "Artist - “Song Name” - Official Music Video",
      "Channel",
      { artist: "Artist", title: "Song Name" },
    ],
  ])
    assert.deepEqual(guessSongDetails(title, author), expected);
});

test("metadata uses only validated YouTube oEmbed URLs and caches equivalent links", async () => {
  let count = 0;
  const lookup = createYouTubeLookup({
    fetchImpl: async (url, options) => {
      count++;
      assert.equal(url.origin, "https://www.youtube.com");
      assert.equal(url.pathname, "/oembed");
      assert.equal(
        url.searchParams.get("url"),
        "https://www.youtube.com/watch?v=bpOSxM0rNPM",
      );
      assert.equal(options.redirect, "error");
      assert(options.signal instanceof AbortSignal);
      return Response.json({
        title: "Artist - Song (Official Video)",
        author_name: "Channel",
      });
    },
  });
  const [a, b] = await Promise.all([
    lookup("https://youtu.be/bpOSxM0rNPM?t=1"),
    lookup("https://youtube.com/watch?v=bpOSxM0rNPM"),
  ]);
  assert.deepEqual(a, b);
  assert.equal(count, 1);
  assert.equal(a.artist, "Artist");
  assert.equal(a.title, "Song");
  await assert.rejects(
    lookup("https://youtube.com.evil.example/watch?v=bpOSxM0rNPM"),
    { status: 400 },
  );
  assert.equal(count, 1);
});

test("unavailable or malformed metadata falls back safely and can be retried", async () => {
  for (const response of [
    new Response("", { status: 404 }),
    Response.json({ title: null }),
    new Response("not json"),
  ]) {
    const lookup = createYouTubeLookup({ fetchImpl: async () => response });
    await assert.rejects(lookup("https://youtu.be/bpOSxM0rNPM"), {
      status: 502,
    });
  }
  let count = 0;
  const lookup = createYouTubeLookup({
    fetchImpl: async () => {
      count++;
      throw new Error("Unavailable");
    },
  });
  await assert.rejects(lookup("https://youtu.be/bpOSxM0rNPM"));
  await assert.rejects(lookup("https://youtu.be/bpOSxM0rNPM"));
  assert.equal(count, 2);
});

class Field extends EventTarget {
  constructor(value = "") {
    super();
    this.value = value;
    this.required = false;
    this.disabled = false;
    this.checked = false;
  }
  input(value) {
    this.value = value;
    this.dispatchEvent(new Event("input"));
  }
  change(value) {
    this.value = value;
    this.dispatchEvent(new Event("change"));
  }
}
function form(originalVideo = "") {
  const fields = {
    url: new Field(),
    title: new Field(),
    artist: new Field(),
    confirmReplacement: new Field(),
  };
  const status = { textContent: "" },
    warning = { hidden: true };
  return {
    fields,
    status,
    warning,
    dataset: { originalVideo },
    elements: { namedItem: (name) => fields[name] },
    querySelector: (selector) =>
      selector === "[data-metadata-status]" ? status : warning,
  };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test("metadata prefills fields without overwriting typing done during the lookup", async () => {
  const f = form();
  let resolve;
  const cleanup = bindSongForm(f, {
    lookup: () => new Promise((r) => (resolve = r)),
  });
  f.fields.url.change("https://youtu.be/bpOSxM0rNPM");
  f.fields.title.input("My custom title");
  resolve({ title: "Guessed title", artist: "Guessed artist" });
  await tick();
  assert.equal(f.fields.title.value, "My custom title");
  assert.equal(f.fields.artist.value, "Guessed artist");
  cleanup();
});

test("new links and closing a form prevent stale metadata updates", async () => {
  const f = form(),
    requests = [];
  const cleanup = bindSongForm(f, {
    lookup: (url, options) =>
      new Promise((resolve) =>
        requests.push({ url, resolve, signal: options.signal }),
      ),
  });
  f.fields.url.change("https://youtu.be/bpOSxM0rNPM");
  f.fields.url.change("https://youtu.be/mrZRURcb1cM");
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve({ title: "New song", artist: "New artist" });
  await tick();
  requests[0].resolve({ title: "Old song", artist: "Old artist" });
  await tick();
  assert.equal(f.fields.title.value, "New song");
  f.fields.url.change("https://youtu.be/b8-tXG8KrWs");
  cleanup();
  requests[2].resolve({ title: "Closed form", artist: "Old artist" });
  await tick();
  assert.equal(f.fields.title.value, "New song");
  assert.equal(requests[2].signal.aborted, true);
});

test("unreadable metadata keeps manual entry available; replacing a video requires confirmation", async () => {
  const f = form("bpOSxM0rNPM");
  f.fields.title.value = "Existing title";
  const cleanup = bindSongForm(f, {
    lookup: async () => {
      throw Error("Private video");
    },
  });
  f.fields.url.change("https://youtu.be/mrZRURcb1cM");
  assert.equal(f.warning.hidden, false);
  assert.equal(f.fields.confirmReplacement.required, true);
  assert.equal(f.fields.confirmReplacement.disabled, false);
  await tick();
  assert.equal(f.fields.title.value, "Existing title");
  assert.match(f.status.textContent, /enter the title and artist yourself/);
  f.fields.confirmReplacement.checked = true;
  f.fields.url.change("https://youtube.com/watch?v=bpOSxM0rNPM&t=1");
  assert.equal(f.warning.hidden, true);
  assert.equal(f.fields.confirmReplacement.required, false);
  assert.equal(f.fields.confirmReplacement.checked, false);
  cleanup();
});

test("player uses the privacy-enhanced embed with the actual app origin", () => {
  const url = new URL(
    youtubePlayerURL("bpOSxM0rNPM", "https://bandwagon.example/"),
  );
  assert.equal(url.origin, "https://www.youtube-nocookie.com");
  assert.equal(url.searchParams.get("origin"), "https://bandwagon.example");
  assert.equal(url.searchParams.get("autoplay"), "1");
});
