import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createApp, youtubeId } from "../server.js";

test("YouTube links are normalized and unrelated URLs are rejected", () => {
  for (const url of [
    "https://youtu.be/bpOSxM0rNPM?t=15",
    "https://www.youtube.com/watch?v=bpOSxM0rNPM&list=x",
    "https://m.youtube.com/shorts/bpOSxM0rNPM",
    "https://youtube.com/embed/bpOSxM0rNPM",
  ])
    assert.equal(youtubeId(url), "bpOSxM0rNPM");
  for (const url of [
    "https://youtube.com.evil.example/watch?v=bpOSxM0rNPM",
    "javascript:alert(1)",
    "https://youtu.be/short",
    "https://example.com",
    "not a url",
  ])
    assert.equal(youtubeId(url), null);
});

test("band membership, voting fairness, consensus, approval, and finalization", async (t) => {
  const fixturePrefix = crypto.randomUUID();
  const app = createApp({
    databaseUrl: process.env.TEST_DATABASE_URL || null,
    dbPath: ":memory:",
    allowDemo: false,
  });
  await app.ready;
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    await app.close();
  });
  const base = "http://127.0.0.1:" + app.server.address().port;
  for (const who of ["a", "b", "c", "outsider"]) {
    const id = fixturePrefix + who;
    await app.store.run(
      "INSERT INTO users(id,name) VALUES(?,?)",
      id,
      id.toUpperCase(),
    );
    await app.store.run(
      "INSERT INTO sessions VALUES(?,?,?)",
      createHash("sha256")
        .update(fixturePrefix + who + "-token")
        .digest("hex"),
      id,
      Date.now() + 60000,
    );
  }
  async function request(
    who,
    route,
    body,
    expected = 200,
    origin = "http://localhost:3000",
  ) {
    const res = await fetch(base + "/api/" + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: "bw_session=" + fixturePrefix + who + "-token",
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    assert.equal(res.status, expected, JSON.stringify(data));
    return data;
  }
  await t.test(
    "the app shell and its assets are served with security headers",
    async () => {
      for (const path of ["/", "/app.js", "/style.css", "/healthz"]) {
        const res = await fetch(base + path);
        assert.equal(res.status, 200);
        assert.match(
          res.headers.get("content-security-policy"),
          /default-src 'self'/,
        );
        assert((await res.text()).length > (path === "/healthz" ? 0 : 100));
      }
      const res = await fetch(base + "/../server.js");
      assert.equal(res.status, 404);
    },
  );
  await t.test("authentication and CSRF are enforced", async () => {
    await request("none", "bands", { name: "Nope" }, 401);
    await request("a", "bands", { name: "Nope" }, 403, "https://evil.example");
    await request("a", "demo", {}, 404);
  });
  let bandId, invite, songs;
  await t.test("invite-based membership protects private bands", async () => {
    const a = await request("a", "bands", { name: "The Test Band" });
    bandId = a.band.id;
    invite = a.band.invite;
    await request("outsider", "session?band=" + bandId, undefined, 404);
    await request(
      "outsider",
      "songs",
      {
        bandId,
        url: "https://youtu.be/bpOSxM0rNPM",
        title: "No",
        artist: "No",
      },
      404,
    );
    await request("b", "join", { invite });
    await request("c", "join", { invite });
    const b = await request("b", "session?band=" + bandId);
    assert.equal(b.band.invite, undefined);
    assert.equal(b.band.members.length, 3);
  });
  await t.test(
    "suggestions have a 10-song cap and duplicate URLs merge",
    async () => {
      for (let i = 0; i < 10; i++)
        await request("a", "songs", {
          bandId,
          url: "https://youtu.be/" + ("abcdefghij" + i),
          title: "Song " + i,
          artist: "Artist",
        });
      await request(
        "a",
        "songs",
        {
          bandId,
          url: "https://youtu.be/abcdefghijk",
          title: "Eleventh",
          artist: "Artist",
        },
        400,
      );
      await request(
        "b",
        "songs",
        {
          bandId,
          url: "https://youtube.com/watch?v=abcdefghij0&t=10",
          title: "Duplicate",
          artist: "Artist",
        },
        409,
      );
      songs = (await request("a", "session?band=" + bandId)).band.songs;
      assert.equal(songs.length, 10);
    },
  );
  const vote = (who, index, kind, status = 200) =>
    request(who, "vote", { bandId, songId: songs[index].id, kind }, status);
  await t.test(
    "one reaction per song, three skips, and two objections",
    async () => {
      await vote("a", 0, "up");
      await vote("a", 0, "up");
      let st = await request("a", "session?band=" + bandId);
      assert.equal(
        st.band.songs.find((s) => s.id === songs[0].id).votes.length,
        1,
      );
      for (let i = 1; i <= 3; i++) await vote("a", i, "down");
      await vote("a", 4, "down", 400);
      await vote("a", 1, null);
      await vote("a", 4, "down");
      await vote("a", 5, "veto");
      await vote("a", 6, "veto");
      await vote("a", 7, "veto", 400);
      await vote("a", 5, "neutral");
      await vote("a", 7, "veto");
      await vote("a", 7, null);
      await vote("a", 6, null);
    },
  );
  await t.test(
    "shortlist requires every review, majority support, and zero objections",
    async () => {
      await vote("b", 0, "up");
      let st = await request("a", "session?band=" + bandId);
      assert.equal(
        st.band.songs.find((s) => s.id === songs[0].id).ready,
        false,
      );
      st = await vote("c", 0, "neutral");
      assert.equal(st.band.songs.find((s) => s.id === songs[0].id).ready, true);
      st = await vote("c", 0, "veto");
      assert.equal(
        st.band.songs.find((s) => s.id === songs[0].id).ready,
        false,
      );
      await vote("c", 0, "neutral");
    },
  );
  await t.test(
    "approval resets on changes; only owner can finalize; final sets are immutable",
    async () => {
      await request("a", "finalize", { bandId }, 400);
      await request("b", "finalize", { bandId }, 403);
      for (const who of ["a", "b", "c"])
        await request(who, "approve", { bandId, approved: true });
      await vote("a", 9, "up");
      let st = await request("a", "session?band=" + bandId);
      assert(st.band.members.every((m) => !m.approved));
      for (const who of ["a", "b", "c"])
        await request(who, "approve", { bandId, approved: true });
      st = await request("a", "finalize", { bandId });
      assert.equal(st.band.finalized, 1);
      await vote("b", 0, "down", 409);
      await request("outsider", "reopen", { bandId }, 404);
      await request("b", "reopen", { bandId }, 403);
      st = await request("a", "reopen", { bandId });
      assert.equal(st.band.finalized, 0);
      assert(st.band.members.every((m) => !m.approved));
    },
  );
  await t.test(
    "only the suggester can delete and vote records are removed",
    async () => {
      await request("b", "delete-song", { bandId, songId: songs[0].id }, 403);
      const st = await request("a", "delete-song", {
        bandId,
        songId: songs[0].id,
      });
      assert.equal(st.band.songs.length, 9);
      assert.equal(
        Number(
          (
            await app.store.get(
              "SELECT count(*) n FROM votes WHERE song_id=?",
              songs[0].id,
            )
          ).n,
        ),
        0,
      );
    },
  );
  await t.test(
    "simultaneous requests cannot exceed the skip allowance",
    async () => {
      let st = await request("a", "bands", { name: "Concurrent Band" });
      const concurrentBand = st.band.id;
      for (let i = 0; i < 4; i++)
        st = await request("a", "songs", {
          bandId: concurrentBand,
          url: "https://youtu.be/" + ("concurrent" + i),
          title: "Concurrent " + i,
          artist: "Artist",
        });
      const responses = await Promise.all(
        st.band.songs.map((s) =>
          fetch(base + "/api/vote", {
            method: "POST",
            headers: {
              Cookie: "bw_session=" + fixturePrefix + "a-token",
              Origin: "http://localhost:3000",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              bandId: concurrentBand,
              songId: s.id,
              kind: "down",
            }),
          }),
        ),
      );
      assert.deepEqual(
        responses.map((r) => r.status).sort(),
        [200, 200, 200, 400],
      );
      st = await request("a", "session?band=" + concurrentBand);
      assert.equal(
        st.band.songs.flatMap((s) => s.votes).filter((v) => v.kind === "down")
          .length,
        3,
      );
    },
  );
  await t.test("revoked invites stop granting access", async () => {
    await request("a", "rotate-invite", { bandId });
    await request("outsider", "join", { invite }, 404);
  });
});

test("demo sessions are isolated and can demonstrate the complete finalization flow", async (t) => {
  const app = createApp({
    databaseUrl: process.env.TEST_DATABASE_URL || null,
    dbPath: ":memory:",
    allowDemo: true,
  });
  await app.ready;
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    await app.close();
  });
  const base = "http://127.0.0.1:" + app.server.address().port;
  const headers = {
    Origin: "http://localhost:3000",
    "Content-Type": "application/json",
  };
  let res = await fetch(base + "/api/demo", {
    method: "POST",
    headers,
    body: "{}",
  });
  assert.equal(res.status, 200);
  headers.Cookie = res.headers.get("set-cookie").split(";")[0];
  let st = await res.json();
  const bandId = st.band.id;
  assert.equal(st.band.songs.length, 6);
  res = await fetch(base + "/api/demo", {
    method: "POST",
    headers,
    body: "{}",
  });
  const other = await res.json();
  assert.notEqual(other.band.id, bandId);
  for (const s of st.band.songs.slice(0, 5)) {
    res = await fetch(base + "/api/vote", {
      method: "POST",
      headers,
      body: JSON.stringify({ bandId, songId: s.id, kind: "up" }),
    });
    assert.equal(res.status, 200);
  }
  for (const [route, body] of [
    ["demo-review", {}],
    ["approve", { approved: true }],
    ["finalize", {}],
  ]) {
    res = await fetch(base + "/api/" + route, {
      method: "POST",
      headers,
      body: JSON.stringify({ bandId, ...body }),
    });
    st = await res.json();
    assert.equal(res.status, 200, JSON.stringify(st));
  }
  assert.equal(st.band.finalized, 1);
  assert.equal(st.band.songs.filter((s) => s.ready).length, 5);
});

test("sessions, songs, and votes survive an application restart", async (t) => {
  const folder = await mkdtemp(path.join(tmpdir(), "bandwagon-restart-"));
  const options = {
    databaseUrl: process.env.TEST_DATABASE_URL || null,
    dbPath: path.join(folder, "bandwagon.sqlite"),
    allowDemo: true,
  };
  let app;
  async function stop() {
    if (!app) return;
    const old = app;
    app = null;
    await new Promise((resolve) => old.server.close(resolve));
    await old.close();
  }
  t.after(async () => {
    await stop();
    await rm(folder, { recursive: true, force: true });
  });
  async function start() {
    app = createApp(options);
    await app.ready;
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    return "http://127.0.0.1:" + app.server.address().port;
  }
  let base = await start();
  const headers = {
    Origin: "http://localhost:3000",
    "Content-Type": "application/json",
  };
  let response = await fetch(base + "/api/demo", {
    method: "POST",
    headers,
    body: "{}",
  });
  assert.equal(response.status, 200);
  headers.Cookie = response.headers.get("set-cookie").split(";")[0];
  let state = await response.json();
  const bandId = state.band.id,
    songId = state.band.songs[0].id;
  response = await fetch(base + "/api/vote", {
    method: "POST",
    headers,
    body: JSON.stringify({ bandId, songId, kind: "up" }),
  });
  assert.equal(response.status, 200);
  const userId = state.user.id;
  await stop();
  base = await start();
  response = await fetch(base + "/api/session", { headers });
  assert.equal(response.status, 200);
  state = await response.json();
  assert.equal(state.user.id, userId);
  assert.equal(state.band.id, bandId);
  assert.equal(state.band.songs.length, 6);
  assert.equal(
    state.band.songs
      .find((s) => s.id === songId)
      .votes.find((v) => v.user_id === userId).kind,
    "up",
  );
});
