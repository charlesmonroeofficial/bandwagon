# BandWagon

Suggest songs, find common ground, and agree on a setlist the whole band wants to play.

The full app includes Google sign-in, private bands with revocable invite links, durable songs and votes, an interactive demo, and playlist approval. The separately hosted browser-local demo uses simulated bandmates; it does not connect to this database.

## Deploy on Render's free plan

Use **a Render Web Service** for Node.js and **an external PostgreSQL database**, such as Neon. A free Render web service has an ephemeral filesystem, so production refuses to start without `DATABASE_URL`. No Render disk or paid Render database is required by this configuration.

1. Create a PostgreSQL project on Neon. Copy its **pooled** connection string with TLS enabled.
2. In Render, create a **Web Service**, choose `charlesmonroeofficial/bandwagon`, branch **main**, runtime **Node**, and the **Free** instance type. If you already created this service, update its settings instead.
3. Use build command **`npm ci`** and start command **`npm start`**. Node 24 is selected by `.node-version` and `package.json`.
4. Add these environment variables in Render:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Your external PostgreSQL connection string; keep its TLS parameters |
   | `GOOGLE_CLIENT_ID` | Your Google Web application OAuth client ID |
   | `GOOGLE_CLIENT_SECRET` | Its client secret |
   | `ALLOW_DEMO` | `false` for the real band; `true` temporarily if you want to try the isolated demo before Google setup |

5. Set the health check path to **`/healthz`** and deploy. Initial database migrations run automatically before the server starts.
6. Render supplies `RENDER_EXTERNAL_URL`, so the app automatically uses the correct HTTPS address for cookies and sign-in. Set `APP_ORIGIN` only if using a custom domain; use the exact origin without a trailing slash.
7. Set up Google sign-in as described below, then create your band and invite your people.

For a new Blueprint-based service, `render.yaml` contains the same free web-service configuration and asks for the environment values. It deliberately does not provision a Render database. Do not create a second service if you already have one configured.

Free services can sleep when idle, so the first request may take time to load. Your songs, votes, memberships, and sessions remain in the external database across sleeps and redeployments. The database provider's own free-tier quotas and policies still apply.

## Google sign-in

In Google Cloud Console:

1. Configure the OAuth consent screen. If it is in testing mode, add your bandmates as test users.
2. Create an OAuth client with application type **Web application**.
3. Add the authorized redirect URI **`https://YOUR-RENDER-SERVICE.onrender.com/auth/google/callback`**, replacing the origin with your actual Render URL. For local development, also add **`http://localhost:3000/auth/google/callback`**.
4. Store the client ID and secret in Render's environment settings and redeploy.

The redirect URI must match the app's origin exactly. Never commit the database URL, Google client secret, or `.env` file. Do not put secrets in issues or pull requests.

For Google's production branding settings, the app provides a public, sign-in-free privacy policy at **`https://bandwagon-it23.onrender.com/privacy`**, linked from both the welcome screen and signed-in app. The homepage is **`https://bandwagon-it23.onrender.com`** and terms of service are at **`https://bandwagon-it23.onrender.com/terms`**. Use **Charles Monroe** as the operator and **charlesmonroeofficial@gmail.com** as the support/contact email. Update `public/privacy.html` if the operator, contact, hosting providers, or data practices change. Google may separately require branding or domain verification before publication.

Google sign-in uses state checking and PKCE. Sessions are opaque, stored hashed in the database, and sent in HttpOnly cookies (Secure on HTTPS). Band access is authorized server-side; cross-origin writes are rejected.

## Local development

Requires **Node.js 24**.

```sh
npm ci
npm start
```

Open **http://localhost:3000** and choose **Explore the demo**. SQLite is used locally when `DATABASE_URL` is empty, with data in `work/bandwagon.sqlite`. Copy `.env.example` to `.env` to configure local Google sign-in or a development PostgreSQL database. Use a separate development database rather than the live band's database.

Each demo session creates an independent example band. React to songs, open **Our setlist**, and use **Simulate band review** to demonstrate the other example members reviewing and approving the proposed set. Approve it yourself and finalize it. Existing objections remain in place. Demo members are explicitly simulated and invitations are disabled for demo bands.

## Making changes and deploying

1. Make a change here or in a local checkout, on a feature branch.
2. Run `npm run check` and `npm test`, then push the branch and open a pull request.
3. GitHub Actions tests both SQLite and PostgreSQL. Review the result and merge into `main`.
4. Set Render **Auto-Deploy** to **After CI Checks Pass**. Render rebuilds and deploys the merged commit automatically.

The initial app is published on `main` so Render can connect immediately. Subsequent work should use pull requests. A GitHub push changes source code; it does not configure your Render environment variables or create a Neon database. Set those up once in their dashboards. No new credential configuration is needed for ordinary code changes.

## Voting rules

- Up to **10 active suggestions per member per band**. Add a YouTube link, title, artist, and optional pitch. Different URL formats for the same video resolve to one entry; duplicate submissions explain that the video is already present.
- Pasting a YouTube link looks up its public title and channel using oEmbed, then guesses the artist and song name. Both fields remain editable. If lookup fails, enter the details manually; no YouTube API key is needed.
- Use a song’s **⋯ → Edit my suggestion** to change its title, artist, note, or video while voting is open. Corrections keep votes and reset setlist approvals. Replacing the video requires confirmation, clears all its votes (returning skip/veto allowances), and resets approvals. Editing does not use another suggestion slot.
- Each member has **one reaction per song**: want to play, prefer to skip, strong objection, or neutral. Click again to remove it or select a different reaction.
- Likes and neutral reactions are unlimited. A member can have at most **3 skips** and **2 strong objections** active per band. Removing one restores the allowance.
- A song enters the proposed setlist when **every current member reviews it**, a **strict majority likes it**, and it has **no strong objections**.
- A strong objection blocks the song. Its optional explanation is visible to the band for discussion. Only that member can change their objection.
- Every member explicitly approves the proposed set before the **owner** finalizes it. Changes to songs, reactions, or membership reset approvals.
- A final setlist locks songs, reactions, and new membership. The owner can reopen voting, which resets approvals.
- Members can remove their own suggestions while voting is open. Associated votes are removed too. The owner can replace an invite link to revoke the old one.

Search, review filters, sorting, YouTube playback, participation and favourite counts, text export, and YouTube setlist playback are included. Votes are visible in this version. Rounds, hidden voting, rehearsal-readiness flags, and long-term favourite rotation are future extensions.

## Database and checks

The `pg` driver connects to PostgreSQL when `DATABASE_URL` is set. TLS follows the connection string; certificate checks are not disabled by the app. Migrations in `migrations/` run once and are tracked in `app_migrations`. Append new migration files for later schema changes. Database transactions serialize state changes so simultaneous requests cannot exceed voting limits or bypass final approval. Existing local SQLite databases remain local; switching to PostgreSQL does not automatically copy their data.

```sh
npm run check
npm test
```

To run the same integration suite against a **dedicated test PostgreSQL database**, set `TEST_DATABASE_URL` before running `npm test`. Tests create fixture records in that database. CI uses a disposable PostgreSQL service.

Checks cover authentication, cross-origin writes, membership, duplicate detection, suggestion limits, vote allowances, simultaneous requests, consensus, approval resets, finalization, invite revocation, demo isolation, and transaction rollback. YouTube embeds send the app origin using `strict-origin-when-cross-origin`, as required for player identification; the external YouTube link remains available for videos that disallow embedding. Automated metadata tests use stubbed YouTube responses and do not require network access. The live Google OAuth round trip still requires your configured credentials. Browser-based visual verification was unavailable in the authoring environment.
