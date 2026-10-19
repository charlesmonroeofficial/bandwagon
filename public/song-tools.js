export function youtubeVideoId(raw) {
  try {
    const url = new URL(raw);
    if (!["https:", "http:"].includes(url.protocol)) return null;
    let id;
    if (url.hostname === "youtu.be") id = url.pathname.split("/")[1];
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(url.hostname)
    )
      id =
        url.pathname === "/watch"
          ? url.searchParams.get("v")
          : /^\/(shorts|embed|live)\//.test(url.pathname)
            ? url.pathname.split("/")[2]
            : null;
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}

export function youtubePlayerURL(id, origin) {
  if (!/^[\w-]{11}$/.test(id)) throw new Error("Invalid video");
  const url = new URL("https://www.youtube-nocookie.com/embed/" + id);
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("origin", new URL(origin).origin);
  return url.href;
}

// Only apply a lookup to the form and fields that initiated it. User typing,
// newer links, and closing the dialog must win over late metadata responses.
export function bindSongForm(form, { lookup, delay = 350 }) {
  const field = (name) => form.elements.namedItem(name),
    urlField = field("url");
  const status = form.querySelector("[data-metadata-status]");
  const warning = form.querySelector("[data-replacement]"),
    confirmation = field("confirmReplacement");
  const versions = { title: 0, artist: 0 };
  let generation = 0,
    timer,
    controller,
    requestedId,
    requestState;
  const removers = [];
  function listen(element, event, fn) {
    element.addEventListener(event, fn);
    removers.push(() => element.removeEventListener(event, fn));
  }
  for (const name of ["title", "artist"])
    listen(field(name), "input", () => versions[name]++);
  function schedule(immediate = false) {
    const id = youtubeVideoId(urlField.value),
      changed = Boolean(
        form.dataset.originalVideo && id && id !== form.dataset.originalVideo,
      );
    if (warning) {
      warning.hidden = !changed;
      confirmation.disabled = !changed;
      confirmation.required = changed;
      if (!changed) confirmation.checked = false;
    }
    if (
      id &&
      id === requestedId &&
      ["loading", "success"].includes(requestState)
    )
      return;
    clearTimeout(timer);
    controller?.abort();
    const current = ++generation;
    requestedId = id;
    requestState = null;
    if (!id) {
      status.textContent = urlField.value.trim()
        ? "Paste a valid YouTube video link, or enter the song details manually."
        : "";
      return;
    }
    if (id === form.dataset.originalVideo) {
      status.textContent =
        "This is the current video. Your existing song details are kept.";
      return;
    }
    const snapshot = { ...versions };
    requestState = "loading";
    status.textContent = "Looking up the YouTube title…";
    const perform = async () => {
      controller = new AbortController();
      try {
        const details = await lookup("https://www.youtube.com/watch?v=" + id, {
          signal: controller.signal,
        });
        if (current !== generation) return;
        for (const name of ["title", "artist"])
          if (versions[name] === snapshot[name])
            field(name).value = String(details[name] || "").slice(0, 100);
        requestState = "success";
        status.textContent =
          "Details guessed from YouTube. Check them and change anything you like.";
      } catch (error) {
        if (current !== generation || controller.signal.aborted) return;
        requestState = "error";
        status.textContent =
          "Couldn’t read this video’s details. You can enter the title and artist yourself.";
      }
    };
    if (immediate) void perform();
    else timer = setTimeout(perform, delay);
  }
  listen(urlField, "input", () => schedule());
  listen(urlField, "change", () => schedule(true));
  return () => {
    generation++;
    clearTimeout(timer);
    controller?.abort();
    for (const remove of removers) remove();
  };
}
