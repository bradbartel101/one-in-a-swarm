# One in a Swarm — build plan

## Iteration 1 — build the whole game end to end

**What:** everything in the spec, in one pass, so the critique step has a real game to attack.

- `js/core.js` — all game rules as pure functions (no DOM, no clock of its own) so Node can test them:
  matching, daily seed, round timer, infinite clock, scoring, altitude, bands, share text, data validation.
- `js/app.js` — the DOM layer only: views, timers, localStorage (try/catch), clipboard.
- `data/prompts.json` — the prompt bank. Authored in a compact source file
  (`tools/prompts.src.txt`) and compiled by `tools/build-prompts.js`, which also writes `VERIFY.md`.
  The JSON is committed, so the site itself needs no build step.
- `tests/*.test.js` — `node --test`, no dependencies.

**Decisions made where the spec left room:**

| Question | Decision | Why |
|---|---|---|
| Daily timer vs refresh | Each round stores a wall-clock deadline (replaced in iteration 2) | A refresh resumes the round but cannot pause or reset the clock |
| Daily repeats | Days are grouped into blocks; each block is one seeded shuffle of the bank, sliced 7 per day (replaced in iteration 2) | Same prompts for everyone on a UTC date, and no prompt repeats inside a block |
| Infinite "drains while focus/text" | Clock drains when the input is focused **or** has text in it | Literal reading of the spec; text left in a blurred box can't be used as a pause |
| Infinite wrong guess | −3 s, same as daily | Otherwise guessing is free |
| Stuck in infinite | Skip button, −5 s | A prompt you can't answer shouldn't end the run slowly |
| Typos | One-letter slips accepted on answers of 7+ letters with no digits, only if exactly one answer is that close | 25 seconds on a phone keyboard; course numbers must stay exact |
| Suffixes | Per-prompt optional words ("Hall", "Street", "Bowl", "Station", leading "CS") | "Glenn" and "Glenn Hall" are the same answer |
| Gold on white | Tech Gold is a fill colour only; text gold is a darker shade | #B3A369 on white is about 2.4:1, which fails WCAG AA |

**Checklist target for this iteration:** all eight items, with evidence.

## Iteration 2 — the release audit

**Why:** iteration 1's critique (REVIEW.md) failed five of eight checklist items, and the request
grew into a ship-readiness audit. The highest-impact failures went first.

1. Timer integrity. Replace the stored deadline with "time left + when measured", count elapsed
   time as the larger of wall-clock and monotonic time, never negative.
2. Midnight rollover. An unfinished run from yesterday is finished first; today's opens after.
3. Saved data. Version it, validate every field on load, throw away anything malformed.
4. A real browser. Drive headless Chrome over the DevTools protocol with no dependencies, serve the
   site from a subpath, and assert an empty console on every scenario.
5. Small-phone layout, found by screenshot: results screen, share box, answer box above the keyboard.
6. Rotation. Guarantee no prompt repeats within the days the bank covers, across any boundary.
7. Content. Check every flagged answer against a live source; remove what cannot be confirmed.
8. Release furniture: first-visit help, link-preview tags and image, 404 page, README, CI.

Tracked in SHIP.md.
