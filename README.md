# MYSTERYVERSE

**One Screen. One Team. Endless Mysteries.**

*Made by Gedalia G.*

Seven group mystery and party games built for one computer, one projector, and a room full of people
shouting ideas. One person drives; everyone else argues over theories. No accounts and no student devices are needed.
Content is kept appropriate for Orthodox Jewish and yeshivish classrooms by default (Strict Yeshiva Mode).

## Quick start

Requirements: **Node.js 20+** (tested on Node 24). One dependency: the official Anthropic SDK.

```bash
npm install
```

```bash
npm start
```

Open http://localhost:3000. The admin dashboard is at http://localhost:3000/admin. On first run a random admin
password is printed in the console and saved to `data/ADMIN_PASSWORD.txt` (or set `ADMIN_PASSWORD`).

Optional configuration goes in `.env` (copy `.env.example`):

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on AI features (also settable in Admin > Settings) |
| `ADMIN_PASSWORD` | Fixed admin password |
| `PORT` | Web server port (default 3000) |

Run the test suite with `npm test`.

## Putting it online (Render)

MysteryVerse needs a host that runs a Node.js server. Static-only hosts such as Netlify drag-and-drop or GitHub Pages
cannot run it. The project includes a `render.yaml` for [Render](https://render.com)'s free plan:

1. Put the project on GitHub. `package.json` and `render.yaml` must be at the top of the repository.
2. In Render: **New > Blueprint**, connect GitHub, pick the repository.
3. Enter an admin password when Render asks for `ADMIN_PASSWORD`, then click **Deploy Blueprint**.
4. Open the `https://<name>.onrender.com` address Render shows. The admin dashboard is at `/admin`.

Free Render services sleep after about 15 minutes without visitors; the next visit takes up to a minute to wake up.
The server's data file is reset whenever Render restarts or redeploys the service: built-in challenges come back
automatically and scores live in each browser, but admin edits, reports and uploads do not survive. A Render
persistent disk (paid) mounted at the project's `data` folder keeps admin edits and reports. Set `ANTHROPIC_API_KEY` in Render's
Environment tab (or in Admin > Settings) to turn on AI features.

## The seven games

210 curated challenges ship with the site, at least four per difficulty in every game (Easy, Medium, Hard, Expert, Insane).

| Game | Curated | How it works |
|---|---|---|
| 🔗 What's the Connection? | 28 | Five emoji pictures share one hidden link. Hints, optional sixth picture, one-at-a-time reveal mode, animated explanation. |
| 🔐 AI Password | 26 | A vault character guards a password (words, objects, places, numbers, phrases, patterns, riddles, two-stage vaults). Letter rules tighten with difficulty; trick prompts get playful refusals; every reply is filtered so the password cannot leak. Question limit in Challenge/Hardcore mode. |
| 📦 The Mystery Box | 27 | A 3D crate: shake, tilt, listen, weigh, scan materials and ask questions. Expert/Insane boxes hold two or three objects to identify. All physical properties are fixed before play. |
| 🎬 What Happens Next? | 24 | Original animated clips that freeze before the twist. Modes: Predict It (typed, judged by meaning), Pick the Ending, Spot the Twist, Impossible Ending. Admins can add real MP4/WEBM clips with a pause time. |
| 🔍 Find the Fake | 30 + unlimited | Six server-drawn SVG pictures, one with a deliberate impossible detail (22 scene types). Pick it, say why for a bonus, then watch a circle draw around the anomaly. New levels are generated procedurally forever. |
| 🎧 Guess the Sound | 35 + unlimited | 53 synthesized sounds and 11 soundscapes with a live waveform. Modes: classic, reversed, slow motion, one-second, layered (2-3 sounds), mystery place. |
| ❓ AI Twenty Questions | 40 | The AI picks a secret; the class gets 20 yes/no questions. AI vs Class flips it: the computer asks and the class answers. |

Every game supports the four loss modes (Casual, Challenge: 3 mistakes, Hardcore: one mistake ends the run,
Classroom: never game over), hints, scoring with bonuses, team mode, the optional timer and reporting.
**Mystery Shuffle** strings random games into a 5/10/20/endless game show; **Daily Mystery** gives every group the
same puzzle each day.

## What works with and without an AI key

Everything is playable offline. An API key adds live AI on top; it never replaces the safety checks.

| Feature | Without a key (default) | With a Claude API key |
|---|---|---|
| Curated challenges (all 7 games) | Yes | Yes |
| Twenty Questions / Password / Mystery Box conversations | Offline engines: fixed fact tables and rules answer questions consistently | Claude answers in character, grounded in the same fact tables; offline engine is the fallback |
| AI vs Class (reverse 20Q) | Offline information-gain guesser over ~140 known subjects | Claude asks and guesses about anything |
| Answer checking | Normalization, synonyms, typo tolerance, word containment | Plus semantic judging for different wording |
| New AI-generated challenges (Connection, Password, Mystery Box, 20Q) | Not available (admin sees a clear message) | Background queue, validation, independent solve check, AI moderation, admin approval |
| Unlimited Find the Fake / Guess the Sound levels | Yes (procedural generators, no AI needed) | Yes |
| Game-show host | Curated lines + browser text-to-speech | Same (host lines are never generated live, by design) |

The model defaults to `claude-opus-5-5` (changeable in the admin panel). Requests use structured JSON output,
`effort: low` for in-game chat, and the server-side `fallbacks: "default"` option so a safety decline is retried on
Anthropic's recommended fallback model. AI integration is covered by tests with a fake client; it has **not** been run
against the live API in this build because no key was available.

## Architecture

```
server.js                 HTTP server, static files, API dispatch
server/
  config.js db.js         settings defaults; JSON-file store (atomic, debounced writes)
  http.js security.js     router, Range-capable static serving, CSP, rate limits, admin auth (scrypt + HttpOnly cookie)
  api.js                  public play API + protected admin API
  ai/provider.js          the only place that calls Claude: budgets, usage/cost tracking, refusals
  ai/prompts.js prompts/  shared content policy, injection guard, per-game prompt templates and JSON schemas
  safety/policy.js        blocklists (hard + Strict Yeshiva Mode + admin terms), evasion handling, emoji allowlist
  safety/moderate.js      independent AI review of generated content; anything unreviewed goes to a human
  engine/answers.js       normalization, synonyms, typo tolerance, AI semantic judge
  engine/kb.js            offline knowledge engine (yes/no question parser, facts, reverse-mode guesser)
  engine/rounds.js        server-side round state, mistake limits per mode, scoring
  engine/challenges.js    curated seed, selection without repeats, daily pick, admin edits
  engine/generation.js    background generation queue with validation + moderation + approval rules
  games/*.js              one module per game (same interface)
  content/*.js            curated challenges and knowledge-base subjects
  media/*.js              procedural media: sound recipes, SVG scenes, video provider abstraction
public/
  index.html admin.html   app shell and admin dashboard
  js/app.js shell.js      hub, lobby, Mystery Shuffle, panels; shared level shell (header, host, hints, timer, results)
  js/audio/               synth for server-sent sound specs; adaptive original music engine and effects
  js/games/*.js           one client module per game
```

Hidden answers live only on the server. The browser receives a public "view" of each level (pictures, sound
synthesis instructions, a clip id) and asks the server to judge every guess.

### Data model

The JSON store (`data/db.json`) holds these collections: challenges (with source, status, validation and moderation
results, play statistics), reports, generation jobs, AI usage (daily, total, per purpose, estimated cost), settings,
admin credentials, the audit log, "learned" objects from AI vs Class, and uploaded media metadata. Live game rounds and
AI conversations are kept in server memory and expire after six hours.

### Safety architecture

1. A strict content policy in every system prompt.
2. Structured JSON outputs validated on the server.
3. Local blocklist scanning of everything shown to players (hard list always; extended list in Strict Yeshiva Mode;
   admin-added terms), with simple evasion handling (l33t, dotted letters).
4. Image safety: pictures are drawn from an emoji allowlist or server-generated SVG; admin uploads are type-checked by
   magic bytes (no SVG/HTML uploads).
5. Topic allowlists and blocklists in generation prompts and validators.
6. Independent AI moderation of generated content; if the review cannot run, the content waits for a human.
7. Curated fallbacks: the offline engines and curated library keep every game playable when AI fails.
8. Teacher/admin reporting: a 🚩 button on every level; "Not appropriate" reports pull the challenge from rotation
   immediately until an admin reviews it.

Player-typed text is filtered before it reaches any game logic or model, and wrapped as untrusted input in prompts.
AI dialogue is filtered again on the way out (blocked terms, leaked secrets).

## Audio

All music is original and generated live in the browser with the Web Audio API (instrumental only): menu, thinking,
tension, final countdown, AI terminal, mystery box and shuffle moods, crossfaded as the game state changes, plus
victory and soft "wrong answer" stingers. Audio starts only after the first click or key press. Master, music,
effects and voice volumes are adjustable; defaults are classroom-moderate and set by the admin.

## Keyboard shortcuts

`F` fullscreen · `M` mute · `H` hint · `Enter` submit · `N` next level · `Esc` back · `?` list of shortcuts.
Some games add their own (Space to play, number keys to choose).

## Not included / future integrations

- **PostgreSQL + Prisma**: the store is a single JSON file, fine for one classroom server. The collections above map
  directly to tables if you outgrow it.
- **Image generation, text-to-video and premium text-to-speech providers** are not connected. Pictures are emoji and
  procedural SVG, sounds are synthesized, clips are animated canvas scenes, and the host uses browser speech. Admins can
  upload licensed images, audio and video files and reference them from challenges.
- **User accounts**: progress and scores are stored per browser (localStorage).
