# Family Pick'em

A private NFL pick'em for our household. Everyone picks a winner straight up in
each game, picks lock at kickoff, and the standings grade themselves as games
finish.

No money, no spreads to beat, no betting links — just who you think wins.

## Running it locally

```bash
npm install
cp .env.example .env.local   # then edit the PIN and secret
npm run db:setup             # optional: the app also does this on first run
npm run dev                  # http://localhost:3000
```

Locally the database is just a file at `./data/picks.db` — nothing to sign up
for.

Sign in with the `FAMILY_PIN` from your `.env.local`, then tap your name.

### Environment variables

| Variable              | What it does                                                       | Default                 |
| --------------------- | ------------------------------------------------------------------ | ----------------------- |
| `FAMILY_PIN`          | The shared PIN that gates the whole site.                            | `1234`                  |
| `SESSION_SECRET`      | Signs the session cookies. Use a long random string in production.   | dev-only fallback       |
| `DATABASE_URL`        | `file:./data/picks.db` locally, or a `libsql://…` URL when hosted.   | `file:./data/picks.db`  |
| `DATABASE_AUTH_TOKEN` | Only needed for a hosted database.                                   | —                       |
| `NFL_SEASON`          | Season to fall back to if ESPN doesn't say.                          | `2026`                  |

Changing `FAMILY_PIN` signs everyone out, which is the easiest way to revoke
access from a device you no longer want in.

## Adding or removing a family member

Sign in as an admin (the seed makes **Justin** one) and open the **Family** tab.
You can add a name, give someone an optional personal PIN on top of the shared
one, hand out admin, or remove someone.

Removing is a soft delete — their past picks stay put so finished weeks still
add up. Adding the same name back brings them and their history along.

To change the starting family, edit the list in `src/db/seed.ts` before your
first `npm run db:seed`.

## How it works

- **Picks lock at kickoff.** The lock is enforced on the server every time a
  pick is written, so a page left open on someone's phone can't sneak one in
  late. Disabled buttons are just a courtesy.
- **Ties are a push.** Nobody gets the win, nobody takes the loss, and a push
  neither extends nor breaks a streak.
- **Standings are graded from our own database**, not from a live ESPN call, so
  a family record doesn't move if ESPN is unreachable.
- **Win probability and injuries are frozen at kickoff.** Once a game starts we
  save what the report said at the time, so a Thursday injury update doesn't
  quietly rewrite what you were looking at when you picked.
- **Times are shown in Central** with the local weekday.
- **An empty database installs itself.** The first query creates the tables and
  the starting family, so a new deployment needs no setup step. The seed only
  fires when the users table is genuinely empty — since removing someone is a
  soft delete, a redeploy never brings them back.
- **Bye weeks** need no special handling — a team on bye simply has no game, and
  the week view lists who's off.

## Where the data comes from

Everything comes from ESPN's public JSON endpoints. **This is unofficial,
undocumented data, used here for a family game.** It needs no API key and no
paid sports data product. If an endpoint changes shape or goes away, the page
degrades to "unavailable" for that section instead of breaking.

| What                     | Endpoint                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| Week schedule and scores | `site.api.espn.com/.../nfl/scoreboard?week=N&seasontype=2&dates=YYYY`     |
| Game detail and injuries | `site.api.espn.com/.../nfl/summary?event=ID`                              |
| Team season stats        | `sports.core.api.espn.com/.../seasons/YYYY/types/2/teams/ID/statistics`   |
| Points for / against     | `sports.core.api.espn.com/.../seasons/YYYY/types/2/teams/ID/record`       |

A few things worth knowing if you touch `src/lib/espn/`:

- The scoreboard's year parameter is **`dates`**, not `year`. Passing `year` is
  silently ignored and you get the current season back.
- Win probability prefers ESPN's own matchup predictor. When that's missing we
  convert the moneyline to an implied percentage and remove the vig so the two
  sides total 100%. That case is always labelled *"implied from odds, not a
  model"* on screen, because it isn't a forecast — it's a book price.
- Season stats fall back to last season when the current one hasn't been played
  yet, and the page says which year you're looking at.
- The statistics endpoint reports points allowed as `0`; the record endpoint is
  the only same-season source, so both come from the same year.

Responses are cached server-side — 30s while a game is in progress, 5 minutes
for schedules and odds, 6 hours for season stats — so the browser never talks to
ESPN directly and we stay light on their servers.

## Checks

```bash
npm test        # lock-at-kickoff, tie handling, standings maths
npm run typecheck
npm run lint
npm run build
```

`npm test` uses a throwaway database and refuses to run against your real one.

## Deploying to Vercel

Vercel wipes the filesystem on every deploy, so the database can't be a file
there — picks would vanish. The fix is a hosted SQLite database
([Turso](https://turso.tech), free tier). It speaks the same dialect, so nothing
in this app changes between local and hosted: same schema, same queries, same
driver.

1. **Create the database.** Sign in at [turso.tech](https://turso.tech), create a
   database, and copy its **URL** (`libsql://<name>.turso.io`) and an **auth
   token**.

2. **Nothing to run.** The app creates its own tables the first time it talks
   to an empty database, and seeds the starting family. Skip to the next step.

   (If you'd rather set it up explicitly, paste
   [`scripts/setup.sql`](scripts/setup.sql) into your provider's SQL console, or
   run `npm run db:setup` with those credentials from a local checkout. Both do
   the same thing.)

3. **Import the repo** at [vercel.com/new](https://vercel.com/new). Everything is
   detected automatically — no build settings to change.

4. **Add four environment variables** in Vercel (Settings → Environment
   Variables):

   | Name                  | Value                                     |
   | --------------------- | ----------------------------------------- |
   | `FAMILY_PIN`          | the PIN you'll share with the family       |
   | `SESSION_SECRET`      | a long random string                       |
   | `DATABASE_URL`        | `libsql://<name>.turso.io`                 |
   | `DATABASE_AUTH_TOKEN` | your Turso token                           |

5. **Deploy.** Send everyone the URL and the PIN.

Redeploys are safe — the database lives outside Vercel, so picks and standings
survive. Step 2 only needs running again if you change the schema.

### Hosting it somewhere else

Anywhere that runs Node works. On a host with a persistent disk (Fly, Railway, a
Raspberry Pi on the shelf) you can skip Turso entirely and keep
`DATABASE_URL=file:/some/persistent/path/picks.db`.
