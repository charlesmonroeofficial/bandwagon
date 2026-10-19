import { bindSongForm, youtubePlayerURL } from "/song-tools.js";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const icons = {
  music:
    '<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
  pool: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  up: '<path d="M7 10v11H3V10zm0 10h11a2 2 0 002-1.7l1-7A2 2 0 0019 9h-6l1-5c0-3-3-3-3-1l-4 7"/>',
  down: '<path d="M7 14V3H3v11zm0-10h11a2 2 0 012 1.7l1 7A2 2 0 0119 15h-6l1 5c0 3-3 3-3 1l-4-7"/>',
  veto: '<path d="m8 3-5 5v8l5 5h8l5-5V8l-5-5Z M9 9l6 6M15 9l-6 6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  play: '<path d="m9 5 11 7-11 7Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0112 0v3M16 5a3 3 0 010 6m3 10v-3a6 6 0 00-2-4"/>',
  link: '<path d="m10 13 4-4M8 16l-1 1a4 4 0 01-6-6l4-4a4 4 0 016 0m2 1 1-1a4 4 0 016 6l-4 4a4 4 0 01-6 0"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  logout: '<path d="M9 4H4v16h5m6-13 5 5-5 5m-7-5h12"/>',
  note: '<path d="M4 3h16v14l-4 4H4Zm12 18v-4h4M8 8h8M8 12h5"/>',
};
const ic = (n, cl = "") =>
  `<svg class="icon ${cl}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[n] || icons.music}</svg>`;
let state = null,
  view = "pool",
  filter = "all",
  query = "",
  sort = "new",
  busy = false;
const invite = new URLSearchParams(location.search).get("invite");
try {
  if (invite) sessionStorage.setItem("bw-invite", invite);
} catch {}
const toast = (msg) => {
  $("#toast").textContent = msg;
  $("#toast").classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $("#toast").classList.remove("show"), 4500);
};
async function api(path, body, options = {}) {
  const r = await fetch("/api/" + path, {
    signal: options.signal,
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
async function mutate(path, body, msg) {
  if (busy) return;
  busy = true;
  document.body.classList.add("busy");
  try {
    state = await api(path, { bandId: state?.band?.id, ...body });
    render();
    if (msg) toast(msg);
    return true;
  } catch (e) {
    toast(e.message);
    return false;
  } finally {
    busy = false;
    document.body.classList.remove("busy");
  }
}
const avatar = (m, i = 0) =>
  `<span class="avatar av${i % 4}" title="${esc(m.name)}">${esc(
    m.name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .slice(0, 2)
      .join(""),
  )}</span>`;
function brand() {
  return `<a class="brand" href="/" aria-label="BandWagon home"><span class="brand-icon">${ic("music")}</span>BandWagon<span class="brand-dot">.</span></a>`;
}
function render() {
  if (!state?.user) return renderWelcome();
  const b = state.band,
    u = state.user;
  $("#app").innerHTML =
    `<aside class="sidebar">${brand()}<div class="band-label">YOUR BACKSTAGE</div><button class="band-switch" data-action="bands"><span class="band-symbol">${ic("music")}</span><span><b>${esc(b?.name || "Your first band")}</b><small>${b?.demo ? "Demo workspace" : b ? `${b.members.length} band member${b.members.length === 1 ? "" : "s"}` : "Make some noise"}</small></span><span>⌄</span></button><nav><button class="nav-item ${view === "pool" ? "active" : ""}" data-view="pool">${ic("pool")} Song pool <span>${b?.songs.length || 0}</span></button><button class="nav-item ${view === "shortlist" ? "active" : ""}" data-view="shortlist">${ic("list")} Our setlist <span>${b?.songs.filter((s) => s.ready).length || 0}</span></button><button class="nav-item ${view === "members" ? "active" : ""}" data-view="members">${ic("people")} The band</button></nav><div class="sidebar-tip"><span class="tiny-title">GOOD VIBES. FAIR VOTES.</span><p>Everyone gets a say.<br>Every song gets a chance.</p><button class="text-button" data-action="rules">How it works ${ic("arrow")}</button></div><div class="sidebar-bottom">${avatar(u)}<span><b>${esc(u.name)}</b><small>${u.demo ? "Exploring the demo" : "Ready to make music"}</small></span><button class="icon-button" data-action="logout" aria-label="Sign out">${ic("logout")}</button></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb">Your band <span>/</span> <b>${view === "shortlist" ? "Our setlist" : view === "members" ? "The band" : "Song pool"}</b></div><div class="top-actions">${b?.demo ? '<span class="demo-label">INTERACTIVE DEMO</span>' : ""}${b ? `<div class="avatars">${b.members.slice(0, 4).map(avatar).join("")}</div><button class="button outline small" data-action="invite">${ic("plus")} Invite members</button>` : ""}</div></header><main>${!b ? emptyBand() : view === "members" ? membersView() : poolView()}</main><footer>Made for the music. Built for the whole band. <span class="legal-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></span><span>BandWagon ♫</span></footer></div>`;
}
function renderWelcome() {
  $("#app").innerHTML =
    `<div class="welcome"><header>${brand()}<span class="welcome-tag">LESS DEBATE. MORE REHEARSAL.</span><button class="button outline small" data-action="rules">How it works ${ic("arrow")}</button></header><main class="welcome-grid"><section><div class="eyebrow"><span class="live-dot"></span> EVERY GREAT BAND FINDS ITS GROOVE</div><h1>Different tastes.<br>One <em>great setlist.</em></h1><p class="welcome-copy">Your next favourite set starts here. Bring your songs, find your common ground, and make a playlist the whole band wants to play.</p><div class="welcome-buttons">${state?.googleEnabled ? '<a class="button primary" href="/auth/google">Continue with Google ' + ic("arrow") + "</a>" : ""}${state?.demoEnabled ? '<button class="button ' + (state.googleEnabled ? "outline" : "primary") + '" data-action="demo">Explore the demo ' + ic("arrow") + "</button>" : ""}</div>${!state?.googleEnabled ? '<p class="setup-note">Google sign-in needs configuration before real bands can join. The demo lets you try the complete voting flow.</p>' : ""}<div class="welcome-features"><span>${ic("check")} Everyone gets a say</span><span>${ic("check")} No unwanted encores</span></div></section><div class="welcome-art"><div class="orbit one"></div><div class="orbit two"></div><div class="record"><div class="record-label">BAND<br><b>WAGON</b><i></i><small>SIDE A · GOOD VIBES</small></div></div><div class="float-card card-one"><span class="mini-cover cover0">AM</span><span><b>Do I Wanna Know?</b><small>Arctic Monkeys</small></span><span class="pill green">${ic("check")} Band favourite</span></div><div class="float-card card-two"><span>✦</span><div><b>A little democracy.</b><small>A lot of good music.</small></div></div><span class="art-star">✳</span><div class="hand-note">Find your sound, together.</div></div></main><div class="welcome-steps"><div><span>01</span><b>Drop your favourites</b><p>Up to 10 YouTube songs each.</p></div><div><span>02</span><b>Find the common ground</b><p>Like it, skip it, or speak up.</p></div><div><span>03</span><b>Play a set you all love</b><p>Everyone signs off before showtime.</p></div></div><footer>A little democracy. A lot of good music. <span class="legal-links"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></span><span>♫ BandWagon</span></footer></div>`;
}
function emptyBand() {
  return `<div class="empty onboarding"><div class="empty-icon">${ic("people")}</div><h1>Every band starts somewhere.</h1><p>Create your band, invite your people, and start finding your next set.</p><button class="button primary" data-action="create-band">${ic("plus")} Create a band</button><button class="text-button" data-action="join">Have an invite? Join your band ${ic("arrow")}</button></div>`;
}
function poolView() {
  const b = state.band,
    u = state.user,
    mine = b.songs.filter((s) => s.user_id === u.id).length,
    ready = b.songs.filter((s) => s.ready),
    votes = b.songs.flatMap((s) => s.votes.filter((v) => v.user_id === u.id)),
    down = 3 - votes.filter((v) => v.kind === "down").length,
    veto = 2 - votes.filter((v) => v.kind === "veto").length,
    reviewed = votes.length;
  return `<section class="page-heading"><div><div class="eyebrow">${b.finalized ? "LOCKED IN. TURN IT UP." : "A LITTLE DEMOCRACY. A LOT OF GOOD MUSIC."}</div><h1>${view === "shortlist" ? "The set, together." : "Find your next great set."}<span class="heading-spark">✳</span></h1><p>${view === "shortlist" ? "The songs you agree on. The set you can all get behind." : "Drop a song. Cast your votes. Make something everyone wants to play."}</p></div>${!b.finalized ? `<button class="button primary" data-action="suggest" ${mine >= 10 ? "disabled" : ""}>${ic("plus")} Suggest a song</button>` : `<span class="pill green">${ic("check")} Final setlist</span>`}</section><section class="round-banner"><div class="round-icon">${ic(b.finalized ? "check" : "music")}</div><div class="round-copy"><span class="tiny-title">${b.finalized ? "THE BAND HAS SPOKEN" : "YOUR BAND. YOUR SOUND."}</span><h2>${b.finalized ? "All agreed. Ready for rehearsal." : "A setlist everyone can get behind."}</h2><p>${b.finalized ? "Your playlist is locked. Export it and bring the good energy." : "Likes build the shortlist. Strong objections make space for a conversation."}</p></div><div class="round-status"><span class="live-dot"></span> ${b.finalized ? "Setlist finalized" : "Voting is open"}<small>${b.members.length} members · ${b.songs.length} suggestions</small></div><div class="banner-record"></div></section><section class="stats"><div>${ic("music")}<span><b>${mine}<small> / 10</small></b><p>Your suggestions</p></span><div class="mini-meter"><i style="width:${mine * 10}%"></i></div></div><div>${ic("down")}<span><b>${down}<small> remaining</small></b><p>Prefer to skip</p></span></div><div>${ic("veto")}<span><b>${veto}<small> remaining</small></b><p>Strong objections</p></span></div><div>${ic("check")}<span><b>${reviewed}<small> / ${b.songs.length}</small></b><p>Songs you’ve reviewed</p></span></div></section>${view === "shortlist" ? shortlistIntro(ready) : ""}<section class="pool-section"><div class="section-top"><div><h2>${view === "shortlist" ? "The proposed setlist" : "The song pool"} <span class="count-badge">${view === "shortlist" ? ready.length : b.songs.length}</span></h2><p>${view === "shortlist" ? "Majority loved. Everyone reviewed. No strong objections." : "A mix of favourites, wildcards, and “trust me on this one.”"}</p></div><label class="search">${ic("search")}<input id="search" type="search" placeholder="Find a song or artist…" aria-label="Search songs" value="${esc(query)}"></label></div><div class="pool-tools"><div class="tabs"><button class="tab ${filter === "all" ? "selected" : ""}" data-filter="all">All songs</button><button class="tab ${filter === "unreviewed" ? "selected" : ""}" data-filter="unreviewed">To review <span>${b.songs.length - reviewed}</span></button><button class="tab ${filter === "mine" ? "selected" : ""}" data-filter="mine">My suggestions</button><button class="tab ${filter === "discussion" ? "selected" : ""}" data-filter="discussion">Needs a chat</button></div><label class="sort-label">Sort by <select id="sort" aria-label="Sort songs"><option value="new" ${sort === "new" ? "selected" : ""}>Newest first</option><option value="support" ${sort === "support" ? "selected" : ""}>Most loved</option><option value="title" ${sort === "title" ? "selected" : ""}>Song title</option></select></label></div><div id="songs">${songRows()}</div></section><div class="bottom-note">${ic("people")} The best setlist isn’t the one with the most votes. It’s the one you all want to play.<button class="text-button" data-action="rules">The house rules ${ic("arrow")}</button></div>`;
}
function shortlistIntro(ready) {
  const b = state.band,
    me = b.members.find((m) => m.id === state.user.id),
    approved = b.members.filter((m) => m.approved).length;
  return `<section class="approval"><div><h2>${b.finalized ? "Your final setlist is ready." : "Can you live with this set?"}</h2><p>${approved} of ${b.members.length} members have signed off. Any song or vote change resets approvals.</p></div><div class="approval-actions">${b.demo && !b.finalized ? '<button class="button outline" data-action="demo-review">Simulate band review</button>' : ""}<button class="button outline" data-action="export" ${!ready.length ? "disabled" : ""}>${ic("list")} Export songs</button>${ready.length ? `<button class="button outline" data-action="youtube">${ic("play")} Play on YouTube</button>` : ""}${!b.finalized ? `<button class="button ${me.approved ? "green-button" : "primary"}" data-action="approve" ${!ready.length ? "disabled" : ""}>${ic("check")} ${me.approved ? "You’re happy with this set" : "I’m happy with this set"}</button>${b.owner === state.user.id ? `<button class="button primary" data-action="finalize" ${approved !== b.members.length || !ready.length ? "disabled" : ""}>Finalize setlist ${ic("arrow")}</button>` : ""}` : b.owner === state.user.id ? '<button class="button outline" data-action="reopen">Reopen voting</button>' : ""}</div></section>`;
}
function songRows() {
  const b = state.band;
  let songs = b.songs.filter(
    (s) =>
      (view !== "shortlist" || s.ready) &&
      (!query ||
        `${s.title} ${s.artist}`.toLowerCase().includes(query.toLowerCase())) &&
      (filter === "all" ||
        (filter === "mine" && s.user_id === state.user.id) ||
        (filter === "unreviewed" &&
          !s.votes.some((v) => v.user_id === state.user.id)) ||
        (filter === "discussion" && s.votes.some((v) => v.kind === "veto"))),
  );
  songs.sort((a, b) =>
    sort === "support"
      ? b.votes.filter((v) => v.kind === "up").length -
        a.votes.filter((v) => v.kind === "up").length
      : sort === "title"
        ? a.title.localeCompare(b.title)
        : b.created - a.created,
  );
  if (!songs.length)
    return `<div class="empty"><div class="empty-icon">${ic(view === "shortlist" ? "list" : "music")}</div><h3>${query || filter !== "all" ? "No songs in this mix." : view === "shortlist" ? "Good things take a little consensus." : "The stage is yours."}</h3><p>${query || filter !== "all" ? "Try another search or filter." : view === "shortlist" ? "A song joins the setlist when everyone reviews it, a majority likes it, and nobody strongly objects." : "Be the first to suggest a song for the band."}</p>${view !== "shortlist" && !query && filter === "all" ? '<button class="button primary" data-action="suggest">Suggest your first song</button>' : ""}</div>`;
  return songs
    .map((s, i) => {
      const own = s.votes.find((v) => v.user_id === state.user.id),
        up = s.votes.filter((v) => v.kind === "up").length,
        dn = s.votes.filter((v) => v.kind === "down").length,
        vt = s.votes.filter((v) => v.kind === "veto").length;
      return `<article class="song-row"><button class="song-art cover${b.songs.indexOf(s) % 6}" data-play="${esc(s.id)}" aria-label="Listen to ${esc(s.title)}"><span>${esc(
        s.artist
          .split(" ")
          .map((t) => t[0])
          .slice(0, 3)
          .join(""),
      )}</span><span class="play-overlay">${ic("play")}</span><i></i></button><div class="song-info"><div class="song-name"><h3>${esc(s.title)}</h3>${s.ready ? '<span class="pill green">' + ic("check") + " Band favourite</span>" : vt ? '<button class="pill peach" data-details="' + esc(s.id) + '">Needs a chat</button>' : ""}</div><p class="artist">${esc(s.artist)}</p><div class="suggested">Suggested by <b>${s.user_id === state.user.id ? "you" : esc(s.suggestedBy)}</b>${s.note ? '<span class="note-snippet"> · ' + esc(s.note) + "</span>" : ""}</div></div><div class="song-voting"><div class="reaction-buttons">${[
        ["up", "Want to play", up],
        ["down", "Prefer to skip", dn],
        ["veto", "Strong objection", vt],
      ]
        .map(
          ([k, label, n]) =>
            `<button class="reaction ${own?.kind === k ? "chosen " + k : ""}" data-vote="${k}" data-song="${esc(s.id)}" aria-label="${label} ${esc(s.title)} (${n} votes)" aria-pressed="${own?.kind === k}" title="${label}" ${b.finalized ? "disabled" : ""}>${ic(k)}<b>${n}</b></button>`,
        )
        .join(
          "",
        )}<button class="neutral ${own?.kind === "neutral" ? "chosen" : ""}" data-vote="neutral" data-song="${esc(s.id)}" aria-label="Neutral on ${esc(s.title)}" aria-pressed="${own?.kind === "neutral"}" title="I’m neutral" ${b.finalized ? "disabled" : ""}>—</button></div><button class="review-count" data-details="${esc(s.id)}">${own ? ic("check") : ""}${s.votes.length}/${b.members.length} reviewed ${ic("arrow")}</button></div><button class="more icon-button" data-details="${esc(s.id)}" aria-label="Details for ${esc(s.title)}">···</button></article>`;
    })
    .join("");
}
function membersView() {
  const b = state.band;
  return `<section class="page-heading"><div><div class="eyebrow">THE PEOPLE BEHIND THE PLAYLIST</div><h1>Meet your band.<span class="heading-spark">✳</span></h1><p>Different tastes. Equal say. Better music together.</p></div><button class="button primary" data-action="invite">${ic("plus")} Invite members</button></section><section class="members-grid">${b.members
    .map((m, i) => {
      const songs = b.songs.filter((s) => s.user_id === m.id),
        loves = b.songs.filter(
          (s) =>
            s.ready &&
            s.votes.some((v) => v.user_id === m.id && v.kind === "up"),
        );
      return `<article class="member-card">${avatar(m, i)}<h2>${esc(m.name)} ${m.id === state.user.id ? "<small>(you)</small>" : ""}</h2><span class="pill ${m.id === b.owner ? "purple" : ""}">${m.id === b.owner ? "Band owner" : "Band member"}</span><dl><div><dt>Suggestions</dt><dd>${songs.length} / 10</dd></div><div><dt>Songs reviewed</dt><dd>${b.songs.filter((s) => s.votes.some((v) => v.user_id === m.id)).length} / ${b.songs.length}</dd></div><div><dt>Favourites in the set</dt><dd>${loves.length}</dd></div></dl><p class="member-status">${m.approved ? "✓ Happy with the proposed set" : "Still finding the groove"}</p></article>`;
    })
    .join(
      "",
    )}</section><div class="bottom-note">${ic("people")} Check that everyone has something they love in the setlist.</div>`;
}
let disposeSongForm = () => {};
function modal(html) {
  disposeSongForm();
  disposeSongForm = () => {};
  const d = $("#modal");
  d.innerHTML = `<button class="modal-close icon-button" data-close aria-label="Close">${ic("close")}</button>${html}`;
  if (!d.open) d.showModal();
}
function suggest(song) {
  const editing = Boolean(song);
  modal(`<div class="modal-symbol">${ic("music")}</div><div class="eyebrow">${editing ? "TUNE YOUR SUGGESTION" : "GIVE IT A SPIN"}</div><h2>${editing ? "Edit your suggestion" : "Got a song in mind?"}</h2><p>Paste a YouTube link and we’ll try to fill in the song details. You can change them.</p>
  <form id="suggest-form" data-song-id="${esc(song?.id || "")}" data-original-video="${esc(song?.youtube || "")}">
    <label>YouTube link<input required type="url" name="url" value="${editing ? esc("https://www.youtube.com/watch?v=" + song.youtube) : ""}" placeholder="https://www.youtube.com/watch?v=…" maxlength="500" aria-describedby="metadata-status"></label>
    <p id="metadata-status" class="metadata-status" data-metadata-status role="status" aria-live="polite"></p>
    <div class="form-grid"><label>Song title<input required name="title" value="${esc(song?.title || "")}" placeholder="Do I Wanna Know?" maxlength="100"></label><label>Artist<input required name="artist" value="${esc(song?.artist || "")}" placeholder="Arctic Monkeys" maxlength="100"></label></div>
    <label>A little pitch <span>(optional)</span><textarea name="note" maxlength="280" placeholder="That riff would sound so good live…" rows="3">${esc(song?.note || "")}</textarea></label>
    ${editing ? '<div class="replacement-notice" data-replacement hidden><label><input type="checkbox" name="confirmReplacement" value="yes" disabled><span>I understand that replacing the video clears all votes on this suggestion and resets everyone’s setlist approval.</span></label></div>' : ""}
    <p class="form-error" role="alert"></p><button class="button primary full" type="submit">${ic(editing ? "check" : "plus")} ${editing ? "Save changes" : "Add to the song pool"}</button>
    <small class="form-foot">${editing ? "Correcting details keeps votes, but resets setlist approvals." : 10 - state.band.songs.filter((s) => s.user_id === state.user.id).length + " of your 10 suggestions remaining · Each video has one entry"}</small>
  </form>`);
  disposeSongForm = bindSongForm($("#suggest-form"), {
    lookup: (url, options) =>
      api("youtube?url=" + encodeURIComponent(url), undefined, options),
  });
}
async function vote(id, kind) {
  const s = state.band.songs.find((s) => s.id === id),
    prev = s.votes.find((v) => v.user_id === state.user.id);
  if (prev?.kind === kind) kind = null;
  if (kind === "veto") {
    modal(
      `<div class="modal-symbol peach">${ic("veto")}</div><h2>Let’s talk about this one.</h2><p>A strong objection keeps “${esc(s.title)}” off the setlist. Use it for songs you really don’t want to play.</p><form id="veto-form" data-song="${esc(id)}"><label>Help the band understand <span>(optional)</span><textarea name="reason" maxlength="280" rows="3" placeholder="A different key might help, or maybe another song…"></textarea></label><p class="form-error" role="alert"></p><button class="button primary full">Raise a strong objection</button></form>`,
    );
    return;
  }
  await mutate(
    "vote",
    { songId: id, kind },
    kind
      ? "Reaction saved. Your band is one step closer."
      : "Reaction removed.",
  );
}
function details(id) {
  const b = state.band,
    s = b.songs.find((s) => s.id === id);
  modal(
    `<div class="eyebrow">BEHIND THE SONG</div><h2>${esc(s.title)}</h2><p>${esc(s.artist)} · Suggested by ${esc(s.suggestedBy)}</p>${s.note ? `<blockquote>“${esc(s.note)}”</blockquote>` : ""}<div class="vote-details">${b.members
      .map((m, i) => {
        const v = s.votes.find((v) => v.user_id === m.id);
        return `<div>${avatar(m, i)}<span><b>${esc(m.name)}</b><small>${v ? { up: "Wants to play", down: "Prefers to skip", veto: "Strong objection", neutral: "Neutral" }[v.kind] : "Hasn’t reviewed yet"}</small>${v?.reason ? `<p>${esc(v.reason)}</p>` : ""}</span>${v ? ic(v.kind === "neutral" ? "note" : v.kind) : ""}</div>`;
      })
      .join(
        "",
      )}</div><button class="button outline full" data-play="${esc(id)}">${ic("play")} Listen on YouTube</button>${s.user_id === state.user.id && !b.finalized ? `<button class="button outline full edit-suggestion" data-edit="${esc(id)}">${ic("note")} Edit my suggestion</button><button class="text-button danger" data-delete="${esc(id)}">Remove my suggestion</button>` : ""}`,
  );
}
function rules() {
  modal(
    `<div class="eyebrow">THE HOUSE RULES</div><h2>Good music. Fair play.</h2><div class="rules-list"><p><b>01 · Bring your favourites.</b> Suggest up to 10 songs using YouTube links. Each video gets one entry.</p><p><b>02 · Have your say.</b> Like as many songs as you want. You get 3 “prefer to skip” votes and 2 strong objections per band. Mark neutral to show you’ve listened.</p><p><b>03 · Change your mind.</b> Click your reaction again to remove it, or choose a different one. Removing a skip or objection gives it back to you.</p><p><b>04 · Find common ground.</b> Everyone must review a song, a majority must like it, and no one can strongly object for it to reach the setlist.</p><p><b>05 · Take one final look.</b> Everyone approves the whole proposed set before the owner locks it. Changes reset approvals.</p></div><button class="button primary full" data-close>Sounds good ${ic("check")}</button>`,
  );
}
async function handle(action) {
  if (action === "demo") {
    if (
      await mutate("demo", {}, "Welcome backstage. This is an example band.")
    ) {
      history.replaceState({}, "", "/");
    }
  } else if (action === "rules") rules();
  else if (action === "suggest") suggest();
  else if (action === "logout") {
    await api("logout", {});
    state = await api("session");
    view = "pool";
    render();
  } else if (action === "invite") {
    if (state.band.demo)
      return modal(
        '<h2>Bring your real band.</h2><p>This is a demo workspace with example members. Configure Google sign-in, then create your own band to invite your people.</p><button class="button primary full" data-close>Got it</button>',
      );
    if (!state.band.invite)
      return toast("Ask the band owner for an invite link.");
    modal(
      `<div class="modal-symbol">${ic("people")}</div><h2>Better with the whole band.</h2><p>Anyone with this invite can join your band after signing in. Share it with your bandmates.</p><label>Band invite link<input readonly id="invite-link" value="${esc(location.origin + "/?invite=" + state.band.invite)}"></label><button class="button primary full" data-action="copy">${ic("link")} Copy invite link</button><button class="text-button" data-action="rotate">Replace invite link</button>`,
    );
  } else if (action === "copy") {
    try {
      await navigator.clipboard.writeText($("#invite-link").value);
      toast("Invite link copied.");
    } catch {
      $("#invite-link").select();
      toast("Select and copy the invite link.");
    }
  } else if (action === "rotate") {
    if (await mutate("rotate-invite", {}, "Previous invite link revoked."))
      handle("invite");
  } else if (action === "bands") {
    modal(
      `<h2>Your backstage.</h2><p>Pick a band or start something new.</p><div class="band-list">${state.bands.map((b) => `<button class="band-choice" data-band="${esc(b.id)}">${ic("music")} ${esc(b.name)} ${ic("arrow")}</button>`).join("")}</div><button class="button primary full" data-action="create-band">${ic("plus")} Create a band</button><button class="text-button" data-action="join">Join with an invite</button>`,
    );
  } else if (action === "create-band") {
    if (state.user.demo)
      return toast("Google sign-in is required to create your own band.");
    modal(
      '<h2>What’s your band called?</h2><p>Something to put on the marquee.</p><form id="band-form"><label>Band name<input required name="name" maxlength="60" placeholder="The Midnight Assembly"></label><p class="form-error" role="alert"></p><button class="button primary full">Create band</button></form>',
    );
  } else if (action === "join") {
    modal(
      '<h2>Your people are waiting.</h2><p>Paste the invite link your band owner shared.</p><form id="join-form"><label>Invite link<input name="invite" type="text" required placeholder="https://…/?invite=…"></label><p class="form-error" role="alert"></p><button class="button primary full">Join band</button></form>',
    );
  } else if (action === "demo-review")
    await mutate(
      "demo-review",
      {},
      "Demo bandmates have reviewed and approved the set.",
    );
  else if (action === "approve")
    await mutate(
      "approve",
      {
        approved: !state.band.members.find((m) => m.id === state.user.id)
          .approved,
      },
      "Setlist approval updated.",
    );
  else if (action === "finalize") {
    if (
      await mutate("finalize", {}, "That’s your set. Time to make some noise!")
    )
      view = "shortlist";
    render();
  } else if (action === "reopen")
    modal(
      '<h2>Back to the song pool?</h2><p>Reopening unlocks voting and clears everyone’s setlist approval.</p><button class="button primary full" data-action="confirm-reopen">Reopen voting</button>',
    );
  else if (action === "confirm-reopen") {
    if (await mutate("reopen", {}, "Voting is open again."))
      $("#modal").close();
  } else if (action === "export") {
    const songs = state.band.songs
      .filter((s) => s.ready)
      .sort(
        (a, b) =>
          b.votes.filter((v) => v.kind === "up").length -
          a.votes.filter((v) => v.kind === "up").length,
      );
    const text =
      state.band.name +
      " — " +
      (state.band.finalized ? "Final setlist" : "Proposed setlist") +
      "\n\n" +
      songs
        .map(
          (s, i) =>
            `${i + 1}. ${s.title} — ${s.artist}\nhttps://www.youtube.com/watch?v=${s.youtube}`,
        )
        .join("\n\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    link.download = "bandwagon-setlist.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } else if (action === "youtube") {
    window.open(
      "https://www.youtube.com/watch_videos?video_ids=" +
        state.band.songs
          .filter((s) => s.ready)
          .sort(
            (a, b) =>
              b.votes.filter((v) => v.kind === "up").length -
              a.votes.filter((v) => v.kind === "up").length,
          )
          .map((s) => s.youtube)
          .join(","),
      "_blank",
      "noopener,noreferrer",
    );
  }
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("button,[data-close]");
  if (!el) return;
  try {
    if (el.hasAttribute("data-close")) $("#modal").close();
    else if (el.dataset.action) await handle(el.dataset.action);
    else if (el.dataset.view) {
      view = el.dataset.view;
      filter = "all";
      query = "";
      render();
    } else if (el.dataset.filter) {
      filter = el.dataset.filter;
      render();
    } else if (el.dataset.vote) await vote(el.dataset.song, el.dataset.vote);
    else if (el.dataset.details) details(el.dataset.details);
    else if (el.dataset.edit) {
      const song = state.band.songs.find((s) => s.id === el.dataset.edit);
      if (song?.user_id === state.user.id && !state.band.finalized)
        suggest(song);
    } else if (el.dataset.play) {
      const s = state.band.songs.find((s) => s.id === el.dataset.play);
      modal(
        `<h2>${esc(s.title)}</h2><p>${esc(s.artist)}</p><iframe class="player" src="${esc(youtubePlayerURL(s.youtube, location.origin))}" referrerpolicy="strict-origin-when-cross-origin" title="${esc(s.title)} on YouTube" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe><a class="button outline full" href="https://www.youtube.com/watch?v=${s.youtube}" target="_blank" rel="noopener noreferrer">Open on YouTube ${ic("arrow")}</a>`,
      );
    } else if (el.dataset.band) {
      state = await api("session?band=" + encodeURIComponent(el.dataset.band));
      $("#modal").close();
      render();
    } else if (el.dataset.delete) {
      const s = state.band.songs.find((s) => s.id === el.dataset.delete);
      modal(
        `<h2>Remove this suggestion?</h2><p>“${esc(s.title)}” and its votes will be removed. Everyone’s setlist approval will reset.</p><button class="button primary full" data-confirm-delete="${esc(s.id)}">Remove song</button>`,
      );
    } else if (el.dataset.confirmDelete) {
      if (
        await mutate(
          "delete-song",
          { songId: el.dataset.confirmDelete },
          "Song removed.",
        )
      )
        $("#modal").close();
    }
  } catch (e) {
    toast(e.message);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    query = e.target.value;
    $("#songs").innerHTML = songRows();
  }
});
document.addEventListener("change", (e) => {
  if (e.target.id === "sort") {
    sort = e.target.value;
    $("#songs").innerHTML = songRows();
  }
});
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target,
    body = Object.fromEntries(new FormData(f));
  let route;
  if (f.id === "suggest-form") {
    route = f.dataset.songId ? "edit-song" : "songs";
    if (f.dataset.songId) body.songId = f.dataset.songId;
    body.confirmReplacement = body.confirmReplacement === "yes";
  }
  if (f.id === "veto-form") {
    route = "vote";
    body.songId = f.dataset.song;
    body.kind = "veto";
  }
  if (f.id === "band-form") route = "bands";
  if (f.id === "join-form") {
    route = "join";
    try {
      body.invite =
        new URL(body.invite).searchParams.get("invite") || body.invite;
    } catch {}
  }
  if (!route || busy) return;
  const button = f.querySelector('button[type="submit"],button');
  button.disabled = true;
  f.querySelector(".form-error").textContent = "";
  try {
    state = await api(route, { bandId: state.band?.id, ...body });
    $("#modal").close();
    render();
    toast(
      route === "songs"
        ? "Added to the pool. Give it a little love."
        : route === "edit-song"
          ? "Suggestion updated. The band can review your changes."
          : route === "vote"
            ? "Your objection is saved. Let’s find common ground."
            : "You’re in. Make some noise.",
    );
  } catch (err) {
    f.querySelector(".form-error").textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) {
    const r = e.target.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      e.target.close();
  }
});
$("#modal").addEventListener("close", () => {
  disposeSongForm();
  disposeSongForm = () => {};
  $("#modal").innerHTML = "";
});
(async () => {
  try {
    state = await api("session");
    let pending = invite;
    try {
      pending = sessionStorage.getItem("bw-invite") || invite;
    } catch {}
    if (state.user && !state.user.demo && pending) {
      try {
        state = await api("join", { invite: pending });
        try {
          sessionStorage.removeItem("bw-invite");
        } catch {}
        history.replaceState({}, "", "/");
        toast("Welcome to the band!");
      } catch (e) {
        toast(e.message);
      }
    }
    render();
    if (!state.user && pending) toast("Sign in to join your band.");
    if (new URLSearchParams(location.search).get("auth") === "cancelled")
      toast("Sign-in cancelled. You can try again anytime.");
  } catch (e) {
    $("#app").innerHTML =
      '<div class="empty"><h1>Couldn’t get backstage.</h1><p>Please refresh to try again.</p></div>';
    toast(e.message);
  }
})();
