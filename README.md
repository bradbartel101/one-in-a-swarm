# One in a Swarm

A Georgia Tech daily word game where the obvious answer is worth almost nothing.

Seven prompts a day, the same for every player. You get 25 seconds a round. "Name a Georgia Tech
residence hall" has dozens of right answers, and the rarer yours is, the higher you fly.

Fan-made game. Not affiliated with or endorsed by the Georgia Institute of Technology.

## How to play

**Daily flight.** Seven prompts, new at 00:00 UTC. A correct answer ends the round. A wrong answer
costs 3 seconds and you keep guessing. Answers score by rarity:

| Tier | Points | |
|---|---|---|
| Common | 10 | the answer everyone gives |
| Too Clever | 15 | the "obscure" answer everyone thinks is clever |
| Solid | 30 | |
| Rare | 60 | |
| Deep Cut | 85 | |
| One in a Swarm | 100 | exactly one hidden answer per prompt |

Each point is 4 feet of altitude above Tech Tower. A finished day cannot be replayed. If you are
mid-run when the day rolls over, you finish yesterday's flight first.

**Swarm mode.** One 45-second clock for the whole run, draining only while the answer box is active
or has text in it. Correct answers add 8 to 16 seconds; a wrong guess costs 3, a skip costs 5.

**The flight.** Your score is drawn as a climb: the bee lifts off the campus lawn, passes the skyline
and the clouds, and ends among the stars on a great day. Sound effects are synthesised in the
browser (no audio files) and the speaker button in the header turns them off. With
`prefers-reduced-motion` the scene jumps to the new altitude without animating.

Spelling is forgiving: case, accents, punctuation, plurals and a one-letter typo on longer answers
don't matter, and short names count ("CULC" is the Clough Undergraduate Learning Commons).

## Run it locally

It is a static site: HTML, CSS and vanilla JavaScript, with no build step, backend, dependencies,
analytics or tracking. It has to be served over HTTP, because browsers block `fetch` on `file://`.

```bash
npx serve .
```

## Tests

Needs Node 22 or newer. The browser tests also need Chrome or Chromium (set `CHROME_PATH` if it is
somewhere unusual). Nothing is installed from npm.

```bash
npm run test:all
```

That one command runs all three of these:

| Command | What it covers |
|---|---|
| `npm test` | Unit tests: matching, daily seed and rotation, timers, scoring, saved data, colour contrast, file checks |
| `npm run validate` | Content validator for `data/prompts.json` |
| `npm run test:e2e` | 21 scenarios in headless Chrome: full daily and infinite runs, refresh and midnight rollover, time zones, blocked storage, bad saves, load failure, layout at four widths, keyboard-only play, screen-reader announcements, sharing |

## Adding or changing prompts

Edit `tools/prompts.src.txt`, then rebuild `data/prompts.json`:

```bash
npm run build:data
```

One prompt looks like this:

```
@dorms | Campus | Name a Georgia Tech residence hall or campus apartment complex | strip=hall,apartments
C Glenn Hall
T Woodruff Residence Hall | Woody's
X Tenth and Home | 10th and Home :: A note shown after a correct answer.
?D Some Hall ?? Why a human should check this one.
```

- The header is `@id | Category | Prompt text`, plus optional `strip=` (trailing words a player may
  leave off) and `lead=` (leading words a player may leave off).
- Each answer starts with a tier letter: `C` common, `T` too clever, `S` solid, `R` rare,
  `D` deep cut, `X` one in a swarm. Names after `|` are accepted aliases.
- A leading `?` marks the answer `"verify": true` and lists it in `VERIFY.md`.
- The build refuses a prompt with fewer than 25 answers, anything other than exactly one `X`,
  two answers a player could not tell apart, or prompt text over 90 characters.

Only include answers you are sure are real. Changing the set of prompt ids reshuffles the daily
rotation for everyone, so ship prompt additions and removals just after 00:00 UTC.

The daily rotation never repeats a prompt within `floor(prompts / 7)` days (4 days with 31 prompts).

## Deploying to GitHub Pages

Every path in the site is relative, so it works from `https://<user>.github.io/<repo>/`. The exact
steps are in [HUMAN-TODO.md](HUMAN-TODO.md). In short: push to GitHub, then set
Settings → Pages → "Deploy from a branch" → `main` / `/ (root)`. `.nojekyll` is already in place,
and `.github/workflows/test.yml` runs the unit tests and the content validator on every push.

If the site ends up anywhere other than `https://bradbartel101.github.io/one-in-a-swarm/`, update
the four absolute URLs near the top of `index.html` so link previews keep working. The 404 page
assumes a project site (`/<repo>/`) on `github.io` and a domain root everywhere else.

## Layout

```
index.html, 404.html     the pages
css/style.css            styles; colour pairs are contrast-tested
js/core.js               game rules, pure functions, shared by the browser and the tests
js/sfx.js                sound effects, synthesised with Web Audio
js/app.js                the DOM layer
data/prompts.json        the prompt bank (generated)
tools/                   prompt source and build, validator, preview-image generator
tests/                   unit tests, and tests/e2e for headless Chrome
SHIP.md                  release checklist with evidence
HUMAN-TODO.md            what still needs a person
```
