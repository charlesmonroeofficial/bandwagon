import http from "node:http";
import { createStore } from "./storage.js";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = path.dirname(fileURLToPath(import.meta.url));
const token = () => randomBytes(24).toString("base64url");
const hash = (s) => createHash("sha256").update(s).digest("hex");
export function youtubeId(raw) {
  try {
    const u = new URL(raw);
    if (!["https:", "http:"].includes(u.protocol)) return null;
    const h = u.hostname.toLowerCase();
    let id;
    if (h === "youtu.be") id = u.pathname.split("/")[1];
    else if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(h)
    )
      id =
        u.pathname === "/watch"
          ? u.searchParams.get("v")
          : /^\/(shorts|embed|live)\//.test(u.pathname)
            ? u.pathname.split("/")[2]
            : null;
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}
export function createApp({
  databaseUrl = process.env.DATABASE_URL,
  dbPath = process.env.DB_PATH || path.join(root, "work/bandwagon.sqlite"),
  origin = process.env.APP_ORIGIN ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${process.env.PORT || 3000}`,
  allowDemo = process.env.ALLOW_DEMO === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEMO !== "false"),
  googleClientId = process.env.GOOGLE_CLIENT_ID,
  googleClientSecret = process.env.GOOGLE_CLIENT_SECRET,
} = {}) {
  const store = createStore({
    databaseUrl,
    dbPath,
  });
  const { db, run, get, all, transaction, ready } = store;
  origin = new URL(origin).origin;
  function fail(message, status = 400) {
    throw Object.assign(new Error(message), {
      status,
    });
  }
  const clean = (v, max, min = 1) => {
    if (typeof v !== "string" || v.trim().length < min || v.trim().length > max)
      fail(`Please enter between ${min} and ${max} characters.`);
    return v.trim();
  };
  const cookies = (req) =>
    Object.fromEntries(
      (req.headers.cookie || "")
        .split(";")
        .filter((x) => x.includes("="))
        .map((x) => {
          const i = x.indexOf("=");
          return [x.slice(0, i).trim(), x.slice(i + 1)];
        }),
    );
  const cookie = (name, value, age) =>
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${origin.startsWith("https:") ? "; Secure" : ""}`;
  async function session(res, uid) {
    const t = token();
    await run(
      "INSERT INTO sessions VALUES(?,?,?)",
      hash(t),
      uid,
      Date.now() + 30 * 86400000,
    );
    res.setHeader("Set-Cookie", cookie("bw_session", t, 30 * 86400));
  }
  const member = async (uid, id) => {
    const b = await get(
      "SELECT b.* FROM bands b JOIN members m ON m.band_id=b.id WHERE b.id=? AND m.user_id=?",
      id,
      uid,
    );
    if (!b) fail("Band not found.", 404);
    return b;
  };
  const editable = (b) => {
    if (b.finalized)
      fail("This setlist is final. The band owner can reopen voting.", 409);
  };
  const reset = async (id) =>
    await run("UPDATE members SET approved=0 WHERE band_id=?", id);
  async function state(uid, bid) {
    const bands = await all(
      "SELECT b.id,b.name,b.demo FROM bands b JOIN members m ON b.id=m.band_id WHERE m.user_id=? ORDER BY b.name,b.id",
      uid,
    );
    if (!bid) bid = bands[0]?.id;
    let band = null;
    if (bid) {
      const b = await member(uid, bid);
      const members = await all(
        "SELECT u.id,u.name,m.approved FROM members m JOIN users u ON u.id=m.user_id WHERE m.band_id=? ORDER BY u.name,u.id",
        bid,
      );
      const rows = await all(
        'SELECT s.*,u.name AS "suggestedBy" FROM songs s JOIN users u ON s.user_id=u.id WHERE s.band_id=? ORDER BY s.created DESC',
        bid,
      );
      const voteRows = await all(
        "SELECT v.song_id,v.user_id,v.kind,v.reason FROM votes v JOIN songs s ON s.id=v.song_id WHERE s.band_id=?",
        bid,
      );
      const bySong = new Map();
      for (const { song_id, ...vote } of voteRows) {
        if (!bySong.has(song_id)) bySong.set(song_id, []);
        bySong.get(song_id).push(vote);
      }
      const songs = rows.map((s) => {
        const votes = bySong.get(s.id) || [];
        return {
          ...s,
          created: Number(s.created),
          votes,
          ready:
            votes.length === members.length &&
            votes.filter((v) => v.kind === "up").length > members.length / 2 &&
            !votes.some((v) => v.kind === "veto"),
        };
      });
      band = {
        ...b,
        invite: b.owner === uid ? b.invite : undefined,
        members,
        songs,
      };
    }
    return {
      user: await get("SELECT id,name,email,demo FROM users WHERE id=?", uid),
      bands,
      band,
    };
  }
  async function makeDemo(res) {
    const prefix = "demo-" + token(),
      did = (name) => prefix + "-" + name,
      uid = did("you");
    await transaction(async () => {
      for (const [id, name] of [
        ["you", "You"],
        ["maya", "Maya"],
        ["leo", "Leo"],
        ["sam", "Sam"],
      ])
        await run(
          "INSERT INTO users(id,name,demo) VALUES(?,?,1)",
          did(id),
          name,
        );
      await run(
        "INSERT INTO bands(id,name,owner,invite,demo) VALUES(?,?,?,?,1)",
        did("band"),
        "The Midnight Assembly",
        uid,
        token(),
      );
      for (const id of ["you", "maya", "leo", "sam"])
        await run(
          "INSERT INTO members(band_id,user_id) VALUES(?,?)",
          did("band"),
          did(id),
        );
      const songs = [
        [
          "Do I Wanna Know?",
          "Arctic Monkeys",
          "bpOSxM0rNPM",
          "maya",
          "That opening riff. Enough said.",
        ],
        [
          "Dreams",
          "Fleetwood Mac",
          "mrZRURcb1cM",
          "sam",
          "A little room for harmonies.",
        ],
        [
          "Reptilia",
          "The Strokes",
          "b8-tXG8KrWs",
          "you",
          "Would be such a fun opener.",
        ],
        [
          "Come Together",
          "The Beatles",
          "45cYwDMibGo",
          "leo",
          "Let’s make this one our own.",
        ],
        [
          "Everybody Wants to Rule the World",
          "Tears for Fears",
          "aGCdLKXNF3w",
          "maya",
          "For the singalong moment.",
        ],
        [
          "Creep",
          "Radiohead",
          "XFkzRNyygfk",
          "leo",
          "Maybe a slower mid-set moment?",
        ],
      ];
      for (const [i, s] of songs.entries()) {
        const id = did("song-" + i);
        await run(
          "INSERT INTO songs VALUES(?,?,?,?,?,?,?,?)",
          id,
          did("band"),
          did(s[3]),
          s[2],
          s[0],
          s[1],
          s[4],
          Date.now() - i * 1000,
        );
        for (const other of ["maya", "leo", "sam"])
          await run(
            "INSERT INTO votes VALUES(?,?,?,?)",
            id,
            did(other),
            i === 5 && other === "sam"
              ? "veto"
              : i === 3 && other === "maya"
                ? "neutral"
                : "up",
            i === 5 && other === "sam"
              ? "The vocal range is uncomfortable for me."
              : "",
          );
      }
    });
    await session(res, uid);
    return await state(uid);
  }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, origin);
    const send = (data, status = 200) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify(data));
    };
    const redirect = (p) => {
      res.writeHead(302, {
        Location: p,
        "Cache-Control": "no-store",
      });
      res.end();
    };
    try {
      await ready;
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Referrer-Policy", "same-origin");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' https://i.ytimg.com; style-src 'self'; script-src 'self'; connect-src 'self'; frame-src https://www.youtube-nocookie.com; base-uri 'none'; frame-ancestors 'self'; form-action 'self'",
      );
      if (url.pathname === "/healthz") {
        await get("SELECT 1 AS ok");
        return send({
          ok: true,
        });
      }
      const c = cookies(req);
      const user = c.bw_session
        ? await get(
            "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?",
            hash(c.bw_session),
            Date.now(),
          )
        : null;
      if (url.pathname === "/auth/google") {
        if (!googleClientId || !googleClientSecret)
          fail(
            "Google sign-in has not been configured. See the setup guide.",
            503,
          );
        const t = token(),
          verifier = token() + token();
        await run("DELETE FROM oauth WHERE expires<?", Date.now());
        await run(
          "INSERT INTO oauth VALUES(?,?,?)",
          hash(t),
          verifier,
          Date.now() + 600000,
        );
        res.setHeader("Set-Cookie", cookie("bw_oauth", t, 600));
        const q = new URLSearchParams({
          client_id: googleClientId,
          redirect_uri: origin + "/auth/google/callback",
          response_type: "code",
          scope: "openid email profile",
          state: t,
          code_challenge: hashBase64(verifier),
          code_challenge_method: "S256",
        });
        return redirect("https://accounts.google.com/o/oauth2/v2/auth?" + q);
      }
      if (url.pathname === "/auth/google/callback") {
        const t = url.searchParams.get("state") || "",
          ct = c.bw_oauth || "";
        if (
          t.length !== ct.length ||
          !t ||
          !timingSafeEqual(Buffer.from(t), Buffer.from(ct))
        )
          fail("Sign-in expired. Please try again.", 403);
        const o = await get(
          "SELECT * FROM oauth WHERE id=? AND expires>?",
          hash(t),
          Date.now(),
        );
        if (!o) fail("Sign-in expired. Please try again.", 403);
        await run("DELETE FROM oauth WHERE id=?", hash(t));
        res.setHeader("Set-Cookie", cookie("bw_oauth", "", 0));
        if (!url.searchParams.get("code")) return redirect("/?auth=cancelled");
        const r = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            code: url.searchParams.get("code"),
            client_id: googleClientId,
            client_secret: googleClientSecret,
            redirect_uri: origin + "/auth/google/callback",
            grant_type: "authorization_code",
            code_verifier: o.verifier,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) fail("Google sign-in failed. Please try again.", 502);
        const auth = await r.json();
        const info = await fetch(
          "https://openidconnect.googleapis.com/v1/userinfo",
          {
            headers: {
              Authorization: `Bearer ${auth.access_token}`,
            },
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!info.ok) fail("Could not verify your Google account.", 502);
        const profile = await info.json();
        if (!profile.sub || !profile.email_verified)
          fail("Please use a verified Google account.", 403);
        const u = await transaction(
          async () =>
            await get(
              "INSERT INTO users(id,name,email,google_id) VALUES(?,?,?,?) ON CONFLICT(google_id) DO UPDATE SET name=excluded.name,email=excluded.email RETURNING id",
              token(),
              String(profile.name || profile.email).slice(0, 100),
              profile.email,
              profile.sub,
            ),
        );
        await session(res, u.id);
        return redirect("/");
      }
      if (url.pathname.startsWith("/api/")) {
        if (req.method !== "GET") {
          if (req.headers.origin !== origin)
            fail("Please refresh this page before trying again.", 403);
          if (
            !(req.headers["content-type"] || "").startsWith("application/json")
          )
            fail("Expected JSON.", 415);
        }
        let body = {};
        if (req.method === "POST") {
          let raw = "";
          for await (const chunk of req) {
            raw += chunk;
            if (raw.length > 16384) fail("Request too large.", 413);
          }
          try {
            body = JSON.parse(raw || "{}");
          } catch {
            fail("Invalid request.");
          }
        }
        if (url.pathname === "/api/session" && req.method === "GET")
          return send(
            user
              ? await state(user.id, url.searchParams.get("band"))
              : {
                  user: null,
                  googleEnabled: !!(googleClientId && googleClientSecret),
                  demoEnabled: allowDemo,
                },
          );
        if (url.pathname === "/api/demo" && req.method === "POST") {
          if (!allowDemo) fail("Demo mode is disabled.", 404);
          return send(await makeDemo(res));
        }
        if (!user) fail("Please sign in first.", 401);
        if (url.pathname === "/api/logout" && req.method === "POST") {
          await run("DELETE FROM sessions WHERE id=?", hash(c.bw_session));
          res.setHeader("Set-Cookie", cookie("bw_session", "", 0));
          return send({
            ok: true,
          });
        }
        if (req.method !== "POST") fail("Not found.", 404);
        const result = await transaction(async () => {
          if (url.pathname === "/api/bands") {
            if (user.demo) fail("Sign in with Google to create your own band.");
            if (
              (
                await get(
                  "SELECT count(*) AS n FROM members WHERE user_id=?",
                  user.id,
                )
              ).n >= 20
            )
              fail("You can join up to 20 bands.");
            const id = token();
            await run(
              "INSERT INTO bands(id,name,owner,invite) VALUES(?,?,?,?)",
              id,
              clean(body.name, 60),
              user.id,
              token(),
            );
            await run(
              "INSERT INTO members(band_id,user_id) VALUES(?,?)",
              id,
              user.id,
            );
            return await state(user.id, id);
          }
          if (url.pathname === "/api/join") {
            if (user.demo) fail("Sign in with Google to join a real band.");
            const b = await get(
              "SELECT * FROM bands WHERE invite=?",
              String(body.invite),
            );
            if (!b || b.demo) fail("This invite link is invalid.", 404);
            if (
              !(await get(
                "SELECT 1 FROM members WHERE band_id=? AND user_id=?",
                b.id,
                user.id,
              ))
            ) {
              editable(b);
              if (
                (
                  await get(
                    "SELECT count(*) n FROM members WHERE band_id=?",
                    b.id,
                  )
                ).n >= 30
              )
                fail("This band is full.");
              await run(
                "INSERT INTO members(band_id,user_id) VALUES(?,?)",
                b.id,
                user.id,
              );
              await reset(b.id);
            }
            return await state(user.id, b.id);
          }
          const b = await member(user.id, body.bandId);
          if (url.pathname === "/api/reopen") {
            if (b.owner !== user.id)
              fail("Only the owner can reopen voting.", 403);
            await run("UPDATE bands SET finalized=0 WHERE id=?", b.id);
            await reset(b.id);
            return await state(user.id, b.id);
          }
          editable(b);
          if (url.pathname === "/api/demo-review") {
            if (!allowDemo || !b.demo || !user.demo) fail("Demo only.", 403);
            const others = await all(
              "SELECT user_id FROM members WHERE band_id=? AND user_id<>?",
              b.id,
              user.id,
            );
            for (const m of others) {
              for (const s of await all(
                "SELECT id FROM songs WHERE band_id=?",
                b.id,
              ))
                await run(
                  "INSERT INTO votes VALUES(?,?,'up','') ON CONFLICT(song_id,user_id) DO NOTHING",
                  s.id,
                  m.user_id,
                );
            }
            await reset(b.id);
            await run(
              "UPDATE members SET approved=1 WHERE band_id=? AND user_id<>?",
              b.id,
              user.id,
            );
          } else if (url.pathname === "/api/songs") {
            const youtube = youtubeId(body.url);
            if (!youtube) fail("Please paste a valid YouTube video link.");
            if (
              await get(
                "SELECT 1 FROM songs WHERE band_id=? AND youtube=?",
                b.id,
                youtube,
              )
            )
              fail("That song is already in the pool.", 409);
            if (
              (
                await get(
                  "SELECT count(*) n FROM songs WHERE band_id=? AND user_id=?",
                  b.id,
                  user.id,
                )
              ).n >= 10
            )
              fail("You have reached your 10-song suggestion limit.");
            await run(
              "INSERT INTO songs VALUES(?,?,?,?,?,?,?,?)",
              token(),
              b.id,
              user.id,
              youtube,
              clean(body.title, 100),
              clean(body.artist, 100),
              clean(body.note || "", 280, 0),
              Date.now(),
            );
            await reset(b.id);
          } else if (url.pathname === "/api/vote") {
            const s = await get(
              "SELECT * FROM songs WHERE id=? AND band_id=?",
              body.songId,
              b.id,
            );
            if (!s) fail("Song not found.", 404);
            if (!["up", "down", "veto", "neutral", null].includes(body.kind))
              fail("Choose a valid reaction.");
            const prev = await get(
              "SELECT kind FROM votes WHERE song_id=? AND user_id=?",
              s.id,
              user.id,
            );
            if (body.kind === "down" || body.kind === "veto") {
              const n = (
                await get(
                  "SELECT count(*) n FROM votes v JOIN songs s ON s.id=v.song_id WHERE s.band_id=? AND v.user_id=? AND v.kind=? AND s.id<>?",
                  b.id,
                  user.id,
                  body.kind,
                  s.id,
                )
              ).n;
              if (n >= (body.kind === "down" ? 3 : 2))
                fail(
                  body.kind === "down"
                    ? "You have used all 3 skip votes. Remove one to use it elsewhere."
                    : "You have used both strong objections. Remove one to use it elsewhere.",
                );
            }
            if (body.kind === null)
              await run(
                "DELETE FROM votes WHERE song_id=? AND user_id=?",
                s.id,
                user.id,
              );
            else
              await run(
                "INSERT INTO votes VALUES(?,?,?,?) ON CONFLICT(song_id,user_id) DO UPDATE SET kind=excluded.kind,reason=excluded.reason",
                s.id,
                user.id,
                body.kind,
                body.kind === "veto" ? clean(body.reason || "", 280, 0) : "",
              );
            if (prev?.kind !== body.kind || body.kind === "veto")
              await reset(b.id);
          } else if (url.pathname === "/api/delete-song") {
            const s = await get(
              "SELECT * FROM songs WHERE id=? AND band_id=?",
              body.songId,
              b.id,
            );
            if (!s || s.user_id !== user.id)
              fail("You can only remove your own suggestions.", 403);
            await run("DELETE FROM songs WHERE id=?", s.id);
            await reset(b.id);
          } else if (url.pathname === "/api/approve") {
            const st = await state(user.id, b.id);
            if (!st.band.songs.some((s) => s.ready))
              fail("Review the songs to build a consensus shortlist first.");
            await run(
              "UPDATE members SET approved=? WHERE band_id=? AND user_id=?",
              body.approved ? 1 : 0,
              b.id,
              user.id,
            );
          } else if (url.pathname === "/api/finalize") {
            if (b.owner !== user.id)
              fail("Only the owner can finalize the setlist.", 403);
            const st = await state(user.id, b.id);
            if (
              !st.band.songs.some((s) => s.ready) ||
              st.band.members.some((m) => !m.approved)
            )
              fail("Everyone must approve the proposed setlist first.");
            await run("UPDATE bands SET finalized=1 WHERE id=?", b.id);
          } else if (url.pathname === "/api/rotate-invite") {
            if (b.owner !== user.id)
              fail("Only the owner can change the invite link.", 403);
            await run("UPDATE bands SET invite=? WHERE id=?", token(), b.id);
          } else fail("Not found.", 404);
          return await state(user.id, b.id);
        });
        return send(result);
      }
      if (req.method !== "GET") fail("Not found.", 404);
      const files = {
        "/": "index.html",
        "/app.js": "app.js",
        "/style.css": "style.css",
        "/privacy": "privacy.html",
        "/privacy/": "privacy.html",
        "/legal.css": "legal.css",
        "/terms": "terms.html",
        "/terms/": "terms.html",
      };
      const f = files[url.pathname];
      if (!f) fail("Not found.", 404);
      res.writeHead(200, {
        "Content-Type": f.endsWith(".js")
          ? "text/javascript"
          : f.endsWith(".css")
            ? "text/css"
            : "text/html",
        "Cache-Control": "no-cache",
      });
      res.end(await readFile(path.join(root, "public", f)));
    } catch (e) {
      if (e.status)
        send(
          {
            error: e.message,
          },
          e.status,
        );
      else {
        console.error("Request failed:", e.code || "internal");
        send(
          {
            error: "Something went wrong. Please try again.",
          },
          500,
        );
      }
    }
  });
  return {
    server,
    db,
    store,
    ready,
    close: store.close,
  };
}
function hashBase64(s) {
  return createHash("sha256").update(s).digest("base64url");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (
    (process.env.NODE_ENV === "production" || process.env.RENDER === "true") &&
    !process.env.DATABASE_URL
  ) {
    console.error(
      "DATABASE_URL is required in production. Connect an external PostgreSQL database before deploying.",
    );
    process.exit(1);
  }
  const app = createApp();
  try {
    await app.ready;
  } catch {
    console.error(
      "Database initialization failed. Check DATABASE_URL and database availability.",
    );
    await app.close();
    process.exit(1);
  }
  app.server.listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
    console.log("BandWagon is listening on port " + (process.env.PORT || 3000)),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.once(signal, () => {
      const timeout = setTimeout(() => process.exit(1), 10000);
      timeout.unref();
      app.server.close(async () => {
        await app.close();
        clearTimeout(timeout);
        process.exit(0);
      });
    });
}
