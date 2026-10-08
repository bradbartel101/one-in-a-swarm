# REVIEW.md — self-critique of the build

## Iteration 1

Reviewed as a sceptical player and as a code reviewer, straight after the first complete build
(31 prompts, 59 unit tests passing, nothing yet run in a browser).

**Bugs**
- A daily round stored a wall-clock deadline. Setting the device clock back mid-round added time.
- A run in progress at 00:00 UTC was thrown away on the next refresh or visit to the home screen.
- Refreshing a finished day landed on the home screen, not the results.
- An unreadable save ("not json") was ignored but left in storage; an old-format save was never rejected by shape.
- "Skiles" then "skile" was charged as two different wrong guesses.
- `npm test` pointed `node --test` at a directory, which fails on Node 22.
- "Best run: 100 pts across 1 prompts."

**Confusing UX**
- The load-failure message told players to run `npx serve`, which only makes sense to a developer.
- No first-visit explanation. The rules lived behind a button.
- Share text left the URL out on localhost, so the copy path could not be tested as shipped.
- Pressing Enter twice after a correct answer could start the next round by accident (guarded with a 600ms lockout).

**Mobile layout** (found only by taking screenshots; the first automated layout audit missed them)
- At 320px the results numbers were clipped and the altitude labels ran over them.
- The share box cut off its last line when lines wrapped.
- At 320px the answer box ended 297px down, under where a phone keyboard sits.
- The "honeycomb" background was three line gradients that rendered as horizontal stripes.

**Accessibility**
- Round pips showed rarity by colour alone.
- Round results and the final score were never announced to screen readers.

**Content**
- 52 answers flagged as uncertain, none checked against a source.
- Several prompts ran past 100 characters. Two were inside jokes padded with parentheticals.
- "All-American Bowl" was the wrong name for the 1985 game (it was the Hall of Fame Classic that year).
- Tiers are guesses. A real course number or a real recent player missing from the bank costs 3 seconds.

### Checklist after iteration 1

| Item | Result | Evidence |
|---|---|---|
| All tests pass | PASS | 59 of 59 unit tests |
| No console errors in a full daily and infinite run | FAIL | not yet run in a browser |
| Full daily run playable; share text copies | FAIL | not yet run in a browser |
| Refresh mid-run resumes correctly | FAIL | unit-tested only; midnight case known broken |
| Layout works at 360px and 1440px | FAIL | clipped results and low answer box on small phones |
| Every prompt has 25+ answers and exactly one One in a Swarm | PASS | `tests/data.test.js` |
| VERIFY.md lists every uncertain answer | PASS | `tests/data.test.js` (52 listed, 52 flagged) |
| Keyboard-only play; visible focus; AA contrast | FAIL | contrast tested and passing; keyboard play not yet exercised; pips colour-only |

## Iteration 2

The request changed mid-build to a release audit, so iteration 2 is that audit. Every failure above
was fed into it, and it is tracked item by item, with evidence, in [SHIP.md](SHIP.md).

### Checklist after iteration 2

| Item | Result | Evidence |
|---|---|---|
| All tests pass | PASS | `npm run test:all`: 86 unit tests, validator, 20 browser scenarios |
| No console errors in a full daily and infinite run | PASS | e2e "daily run, keyboard only" and "infinite: a full run through every prompt" assert an empty error and warning log |
| Full daily run playable; share text copies | PASS | e2e reads the clipboard back and compares it with the share box |
| Refresh mid-run resumes correctly | PASS | e2e "resume mid-round" (20,994ms left before reload, 20,450ms after) |
| Layout works at 360px and 1440px | PASS | e2e layout audit at 320, 375, 768 and 1440, plus screenshots reviewed by eye |
| Every prompt has 25+ answers and exactly one One in a Swarm | PASS | `npm run validate` |
| VERIFY.md lists every uncertain answer | PASS | all 52 resolved: 30 confirmed, 22 removed and listed in HUMAN-TODO.md; none flagged now |
| Keyboard-only play; visible focus; AA contrast | PASS | e2e plays a whole day with Tab and Enter and checks the 3px focus ring; `tests/contrast.test.js` |

Stopped after two iterations: every item passes.
