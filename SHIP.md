# SHIP.md — release audit for v1.0

Resume from the first unchecked item. Each checked item carries one line of evidence.
Unit tests: `npm test`. Browser tests (headless Chrome): `npm run test:e2e`. Everything: `npm run test:all`.

## A. Game logic edge cases
- [x] A1 Daily seed uses UTC consistently (UTC-12, UTC+14, America/New_York get the same 7)
  - Evidence: unit `A1: players in UTC-12, UTC+14 and New York get the same seven` (child processes with TZ set; local dates 7th/9th/8th, same ids) and e2e `same seven prompts in UTC-12, UTC+14 and New York` (Chrome timezone override).
- [x] A2 Midnight rollover mid-run finishes yesterday's puzzle; today's is available after
  - Evidence: Was broken: a refresh after 00:00 UTC discarded the run. Fixed with `resolveDaily`. Unit `A2: a run started at 23:59 UTC...`; e2e `midnight UTC rollover mid-run` starts at 23:59:30, crosses midnight, reloads, finishes the Oct 8 puzzle, then starts Oct 9 with Oct 9's prompts.
- [x] A3 A finished day can't be replayed by refreshing; the result screen reappears
  - Evidence: Was wrong: a refresh landed on the home screen. e2e `daily run, keyboard only` reloads after finishing and asserts the results view, 330 pts, an unchanged save, and that the daily button only reopens results. Unit `A3`.
- [x] A4 Resume mid-round restores round, score and a fair timer
  - Evidence: e2e `resume mid-round`: reload in round 2 returns to round 2 with the round-1 pip, the wrong-guess chip and 20,994ms -> 20,450ms on the clock. Unit `A4` (16s left, not 25s; never negative).
- [x] A5 Timer can't be gamed by tab switching, backgrounding or changing the device clock
  - Evidence: Was exploitable: setting the clock back added time. Rounds now store time-left and count max(wall, monotonic) elapsed. e2e `timer cannot be gamed`: clock back 1h mid-round, back again plus reload, tab frozen 3s (23988 -> 22985 -> 22935 -> 19528 ms), clock forward ends the round. Units `A5` x3. Residual limit in HUMAN-TODO section 7.
- [x] A6 Infinite clock drains only while typing; focus pause handled; ends cleanly at 0
  - Evidence: e2e `infinite: drains only while typing, pauses on blur, ends cleanly at 0` (bar unchanged over 1.5s while blurred and empty, pause note shown, text in a blurred box drains, +16s on a swarm answer, ends on infover and stays there). Unit `A6`.
- [x] A7 Daily rotation doesn't run out or repeat a recent day; coverage number logged
  - Evidence: Rotation rebuilt as a chain from a fixed epoch that excludes the previous days' prompts. The bank covers **4 days** (31 prompts / 7 per day): unit `A7` checks 3,660 consecutive days, each with 7 prompts, no prompt repeated in any 4-day window, every prompt used.
- [x] A8 Answer matching edge cases (accents, plurals, aliases, punctuation, spaces, curly quotes, "the", empty, very long, emoji, HTML)
  - Evidence: units `A8: matching on the real bank`, `A8: empty, enormous, emoji and markup input` (500,000-character guess rejected in under 2s) and tests/matching.test.js; e2e `hostile input is shown as text and never runs` (script/img/svg payloads become text chips, `window.__xss` stays undefined, also after reload).
- [x] A9 Duplicate guesses in a round are rejected without a penalty
  - Evidence: unit `A9: a repeated wrong guess costs nothing` (six spellings of one guess, one penalty, both modes); e2e keyboard run asserts 'Already tried' and under 0.03 of the bar lost.

## B. Storage and failure modes
- [x] B1 Game plays with localStorage blocked, full or throwing
  - Evidence: e2e `storage failure` x3 (every Storage method throws; reading window.localStorage throws; setItem throws QuotaExceededError): a full 7-round day to 420 pts plus an infinite run, empty console.
- [x] B2 Corrupted or old-format saves are detected and reset; saves carry a version
  - Evidence: Saves carry `v: 2`; `reviveDaily` / `reviveBest` validate every field. Unit `B2` x3 (18 malformed shapes, tampered score recomputed); e2e `corrupted or old-format saves are reset` loads 15 bad payloads, each boots to a clean home screen and is removed.
- [x] B3 A failed prompts.json load shows a friendly error
  - Evidence: e2e `prompts.json fails to load` in three ways (truncated JSON, HTTP 500, blocked request): the error view shows 'The game data did not load. Check your connection and try again.', focus is on Try again, and retry recovers.

## C. Content
- [x] C1 Validation script passes on the final data/prompts.json
  - Evidence: `npm run validate` -> 'Content OK: 31 prompts, 1290 answers, exactly one 100-point answer each, 0 still flagged "verify".' It also rejects empty strings, stray whitespace and prompt text over 90 characters.
- [x] C2 Every "verify": true answer re-reviewed; unconfirmed removed; uncertain copied to HUMAN-TODO.md
  - Evidence: All 52 flagged answers checked against live sources (Tech catalog, news and housing pages, Wikipedia): 30 confirmed and unflagged, 22 removed and listed in HUMAN-TODO.md section 5. The check also found a stale unflagged major and a wrongly named bowl, both fixed.
- [x] C3 No offensive, mean-spirited or overly inside-joke prompts or answers
  - Evidence: Read all 31 prompts and their notes. Reworded two padded prompts, removed 'the famous Carlisle Indians' phrasing, kept Tech's own traditions (To Hell With Georgia, Clean Old-Fashioned Hate, the Budweiser song) as they are official lore. Nothing targets a person or group. A second opinion is requested in HUMAN-TODO section 5.
- [x] C4 Spelling and capitalization of displayed answers is correct
  - Evidence: Script scan of every name and alias: no double spaces, no stray whitespace, all start with a capital or digit except three intentional ones (eduroam, github.gatech.edu, u[sic]GA). CS course titles replaced with the catalog's wording. Proper-noun spelling beyond that is in HUMAN-TODO section 5.

## D. Cross-device and accessibility
- [x] D1 Works at 320, 375, 768 and 1440px; no horizontal scroll, nothing cut off
  - Evidence: e2e `layout at 320, 375, 768 and 1440` audits 9 screens per width: no horizontal scroll, nothing outside the viewport or its card, no clipped text. Screenshots at 320 and 375 reviewed by eye, which is how the clipped results numbers and cut-off share box were found and fixed.
- [x] D2 Mobile: keyboard doesn't cover input or timer; inputs 16px+; tap targets 44px+
  - Evidence: Same e2e: every button, input and summary is at least 44x44, inputs are 18px. On the longest prompt the answer box ends at 241px (320x568) and 247px (375x667), above the keyboard line; the header is hidden during play on phones. Real-device check listed in HUMAN-TODO section 4.
- [x] D3 Keyboard-only play start to finish; focus visible and logical
  - Evidence: e2e `daily run, keyboard only, desktop` uses only Tab and Enter from the first-visit dialog to the copy button, asserting where focus lands at each step and a `solid 3px` focus ring.
- [x] D4 Screen reader: timer, feedback and score announced without every tick
  - Evidence: e2e `screen reader`: the clock region changed exactly twice in a round ('10 seconds left', '5 seconds left'); feedback, round result ('Round 1: Deep Cut, ..., plus 85 points. Total 85 points.') and final score go to aria-live regions. Real VoiceOver/TalkBack check in HUMAN-TODO section 4.
- [x] D5 Contrast meets WCAG AA in light and dark; tier results not shown by colour alone
  - Evidence: tests/contrast.test.js computes WCAG ratios for 19 text pairs (4.5:1) and 6 edge pairs (3:1) in both themes from the CSS tokens. Round pips now print their points, and every tier badge carries its name (e2e asserts pip text '85' and badge 'Deep Cut').
- [x] D6 prefers-reduced-motion respected
  - Evidence: e2e `dark mode and reduced motion`: with prefers-reduced-motion the shake animation computes to `none` and transitions to 0s; without it the shake plays.

## E. Sharing and polish
- [x] E1 Share text copies (Clipboard API with fallback), confirms "Copied!", no spoilers, includes the game URL
  - Evidence: e2e keyboard run presses Copy, sees 'Copied!', reads the clipboard back and matches it to the share box; line 5 is the game URL and no played answer appears in it. e2e `copy falls back` covers a missing Clipboard API and a refusing one at phone size. unit `share text`.
- [ ] E2 "How to play" modal, shown automatically on first visit only
- [ ] E3 Title, meta description, favicon, Open Graph/Twitter tags, original 1200x630 preview image
- [ ] E4 Footer disclaimer; no official GT logos, wordmarks or Buzz
- [ ] E5 A simple 404.html

## F. Code quality and performance
- [ ] F1 No console errors or warnings in a full daily run and a full infinite run (headless browser)
- [ ] F2 All user-entered text inserted with textContent, never innerHTML
- [ ] F3 Page weight under 500 KB; loads fast on throttled 3G
- [ ] F4 Nothing external (or HTTPS only)
- [ ] F5 Dead code, debug logs and TODOs removed
- [ ] F6 Full test suite passes in one command, documented

## G. Deployment (GitHub Pages)
- [ ] G1 All asset and data paths relative; works from a subpath
- [ ] G2 .nojekyll and README (what, how to play, tests, adding prompts, deploying)
- [ ] G3 GitHub Actions workflow runs tests and the content validator on every push
- [ ] G4 Exact steps to turn on GitHub Pages written in HUMAN-TODO.md

## Final pass
- [ ] All tests, plus a full daily and infinite run in headless Chrome at mobile and desktop sizes
- [ ] Commit, push, open pull request "Release v1.0"
