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
| Daily timer vs refresh | Each round stores a wall-clock deadline | A refresh resumes the round but cannot pause or reset the clock |
| Daily repeats | Days are grouped into blocks; each block is one seeded shuffle of the bank, sliced 7 per day | Same prompts for everyone on a UTC date, and no prompt repeats inside a block |
| Infinite "drains while focus/text" | Clock drains when the input is focused **or** has text in it | Literal reading of the spec; text left in a blurred box can't be used as a pause |
| Infinite wrong guess | −3 s, same as daily | Otherwise guessing is free |
| Stuck in infinite | Skip button, −5 s | A prompt you can't answer shouldn't end the run slowly |
| Typos | One-letter slips accepted on answers of 7+ letters with no digits, only if exactly one answer is that close | 25 seconds on a phone keyboard; course numbers must stay exact |
| Suffixes | Per-prompt optional words ("Hall", "Street", "Bowl", "Station", leading "CS") | "Glenn" and "Glenn Hall" are the same answer |
| Gold on white | Tech Gold is a fill colour only; text gold is a darker shade | #B3A369 on white is about 2.4:1, which fails WCAG AA |

**Checklist target for this iteration:** all eight items, with evidence.

## Iteration 2

Filled in from REVIEW.md after iteration 1's critique.
