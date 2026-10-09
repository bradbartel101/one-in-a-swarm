# One in a Swarm

A Georgia Tech daily word game where the obvious answer is worth almost nothing.

Seven prompts a day, the same for every player. You get 25 seconds a round. "Name a Georgia Tech
residence hall" has dozens of right answers, and the rarer yours is, the higher you fly.

Fan-made game. Not affiliated with or endorsed by the Georgia Institute of Technology.

## How to play

**Daily flight.** Seven prompts, new at 00:00 UTC. Each round a prompt slides in, the swarm takes
two seconds to lift off, and then you have 25 seconds. A correct answer ends the round. A wrong
answer costs 3 seconds and you keep guessing. A near-miss ("clugh") asks you to submit again to
confirm it ("Clough") and costs nothing. Answers score by rarity:

| Tier | Points | |
|---|---|---|
| Common | 10 | the answer everyone gives |
| Too Clever | 15 | the "obscure" answer everyone thinks is clever |
| Solid | 30 | |
| Rare | 60 | |
| Deep Cut | 85 | |
| One in a Swarm | 100 | exactly one hidden answer per prompt |

**The ascent.** The whole game is one tall pixel-art world, and it never resets between rounds.
Height on screen depends only on points: one point is 6% of the screen, so a 10-point answer climbs
a little over half a screen and a 100-point answer climbs six. The feet on the ruler come from one
curve (`altitudeFeet()` in `js/core.js`) pinned so that real altitudes land in the right scenery:

| Points | Zone | About |
|---|---|---|
| 0 | Campus | the lawn |
| 40 | Midtown skyline | 120 ft |
| 110 | Low clouds | 1,200 ft |
| 200 | Weather | 16,000 ft |
| 300 | High sky | 29,000 ft |
| 420 | Stratosphere | 70,000 ft |
| 550 | Space | the Karman line, 100 km |
| 650 to 700 | The Moon | 238,855 miles |

Real altitude facts slide past on the way up, and there are 21 sightings to find: twelve odd things
drawn into the world at their real altitudes, five secret answers, and four things to do. Found
ones are kept in the browser and listed on the title and results screens.

A finished day cannot be replayed. If you are mid-run when the day rolls over, you finish
yesterday's flight first. Streak, flights, average and best are kept in the browser.

**Infinite mode.** One 45-second clock for the whole run, draining only while the answer box is
active or has text in it. Correct answers add 8 to 16 seconds; a wrong guess costs 3, a skip costs 5.

Spelling is forgiving: case, accents, punctuation and plurals don't matter, and short names count
("CULC" is the Clough Undergraduate Learning Commons).

Sound is off until you turn it on with the speaker button. Scanlines can be switched off too. With
`prefers-reduced-motion` the long climb, the screen shake and the scanlines are all skipped.

## Run it locally

It is a static site: HTML, CSS and vanilla JavaScript, with no build step, backend, dependencies,
analytics or tracking. All artwork is drawn in code on a canvas and all sound is synthesised; the
only asset is one self-hosted open-licence font (Press Start 2P, SIL OFL, in `assets/fonts/`). It has to be served over HTTP, because browsers block `fetch` on `file://`.

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
| `npm run test:e2e` | 27 scenarios in headless Chrome: full daily and infinite runs, the climb and reveal card, equal points climbing equal distance, a perfect 700 to the Moon, easter eggs and the sightings log, wrong guess, near-miss and timeout, refresh and midnight rollover, time zones, blocked storage, bad saves, load failure, layout at four widths with the keyboard up, keyboard-only play, screen-reader announcements, reduced motion, sound, sharing, and frame rate on a throttled phone |

`npm run screens` plays flights of about 150, about 350 and a perfect 700 at 375x812 and 1440x900
and saves screenshots of every zone, some sightings, a secret answer, the One in a Swarm moment and
the results into `screenshots/v3/`. It also refreshes the link-preview image.

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

The daily rotation never repeats a prompt within `floor(prompts / 7)` days (4 days with 32 prompts).

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
js/scene.js              the world: one tall pixel-art scene drawn on a canvas
js/facts.js              the altitude facts (flag an approximate one with `verify`)
js/sfx.js                sound effects, synthesised with Web Audio
js/app.js                camera, round pacing and the DOM
data/prompts.json        the prompt bank (generated)
assets/fonts/            Press Start 2P and its licence
tools/                   prompt source and build, validator
tests/                   unit tests, and tests/e2e for headless Chrome
screenshots/v3/          the latest `npm run screens` output
SWARM-V3.md              the v3 checklist with evidence
SHIP.md                  release checklist with evidence
HUMAN-TODO.md            what still needs a person
```
