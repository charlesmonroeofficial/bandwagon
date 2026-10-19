import { youtubeVideoId } from "./public/song-tools.js";

const promotional =
  /^(?:official\s+)?(?:(?:music|lyric|lyrics|live)\s+)?(?:video|audio|visuali[sz]er|lyrics?)(?:\s+(?:hd|hq|4k|1080p))?$|^(?:hd|hq|4k|1080p)$/i;
function tidy(value) {
  return value.replace(/\s+/g, " ").trim();
}
function withoutVideoLabels(value) {
  return tidy(
    value
      .replace(/\s*[\[(]([^\])]+)[\])]/g, (whole, inside) =>
        promotional.test(tidy(inside)) ? "" : whole,
      )
      .replace(
        /\s*(?:-|–|—|\|)\s*((?:official\s+)?(?:(?:music|lyric|lyrics)\s+)?(?:video|audio|visuali[sz]er|lyrics?)(?:\s+(?:hd|hq|4k|1080p))?)\s*$/i,
        "",
      ),
  );
}
export function guessSongDetails(videoTitle, authorName = "") {
  const cleaned = withoutVideoLabels(tidy(videoTitle));
  const parts = cleaned.match(/^(.+?)\s+(?:-|–|—|•)\s+(.+)$/);
  const artist = parts
    ? parts[1]
    : tidy(authorName.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, ""));
  const title = (parts ? parts[2] : cleaned).replace(/^["“](.+)["”]$/, "$1");
  return {
    title: tidy(title).slice(0, 100),
    artist: tidy(artist).slice(0, 100),
  };
}
function unavailable() {
  return Object.assign(
    new Error(
      "Could not read this YouTube video. Enter its title and artist manually.",
    ),
    { status: 502 },
  );
}
export function createYouTubeLookup({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map(),
    pending = new Map();
  return async (raw) => {
    const id = youtubeVideoId(raw);
    if (!id)
      throw Object.assign(
        new Error("Please paste a valid YouTube video link."),
        { status: 400 },
      );
    const saved = cache.get(id);
    if (saved?.expires > now()) return saved.value;
    if (pending.has(id)) return pending.get(id);
    const work = (async () => {
      try {
        const endpoint = new URL("https://www.youtube.com/oembed");
        endpoint.searchParams.set(
          "url",
          "https://www.youtube.com/watch?v=" + id,
        );
        endpoint.searchParams.set("format", "json");
        const response = await fetchImpl(endpoint, {
          signal: AbortSignal.timeout(6000),
          redirect: "error",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw unavailable();
        const raw = await response.text();
        if (raw.length > 32768) throw unavailable();
        const data = JSON.parse(raw);
        if (
          typeof data.title !== "string" ||
          !data.title.trim() ||
          data.title.length > 2000 ||
          typeof data.author_name !== "string" ||
          data.author_name.length > 500
        )
          throw unavailable();
        const value = {
          youtube: id,
          ...guessSongDetails(data.title, data.author_name),
          sourceTitle: data.title,
        };
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(id, { value, expires: now() + 10 * 60 * 1000 });
        return value;
      } catch {
        throw unavailable();
      }
    })();
    pending.set(id, work);
    try {
      return await work;
    } finally {
      if (pending.get(id) === work) pending.delete(id);
    }
  };
}
