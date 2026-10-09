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

---

# The pixel ascent rebuild

A second brief: keep the rules, data and tests, and rebuild the presentation as one animated
ascent in pixel art. Three iterations. Screenshots from each pass are in `screenshots/`
(`npm run screens` regenerates them).

I could not look at the reference. `krillion.io` loads but draws its game in script, and what came
back was only a menu, so this follows the written spec and nothing from that site.

## Iteration 1 — build it

Built: a canvas world drawn in code (`js/scene.js`), a camera that is just the score, the climb
with tier lines and an answer tag, reveal cards, liftoff countdown, near-miss confirmation,
circular timer, flight log, lifetime stats, flight numbers.

One decision changed a rule on purpose: altitude is now a curve, not feet-per-point. A linear scale
cannot both keep an obvious answer near the ground and put a perfect day in space, and the facts on
the ruler have to be true. On the curve seven obvious answers reach 1,037 ft, just over the tallest
building in Atlanta, and 700 points reaches the Karman line.

Looking at the first screenshots as a new player:

- **Start screen:** altitude facts were drawn straight over the title. The title was navy text on
  a pale sky with towers behind it and could barely be read. The mascot was hidden under the panel.
- **Mascot:** a striped pill. The wings were white on a pale sky and vanished.
- **Timeout:** the card was thrown off the top of the screen. The shake animation was applied to
  an ancestor of a fixed-position card, which re-anchors it.
- **HUD:** disappeared whenever the reveal card was up.
- **One in a Swarm:** the flash and the card arrived together, so the flash hid the card and the
  moment had no beat of its own.
- **Flight log:** the star and hive marks were unreadable at that size.
- **Skyline:** heavy and near, not "at distance".
- **Clutter:** tier-line labels and facts both sat on the left and collided.

| Checklist | Result | Evidence |
|---|---|---|
| World never resets; sky changes | PASS | screenshots 5 to 11; camera is one number that only goes up |
| Climb follows the answer, stops on its tier line | PASS | screenshot 5; not yet asserted by a test |
| Every tier has icon, colour, label, quip | FAIL | marks drawn but two unreadable |
| One in a Swarm is the most dramatic moment | FAIL | flash and card overlap |
| Timeout, wrong guess, near-miss look intentional | FAIL | timeout card off screen |
| No fake player statistics | PASS | results screen shows tier names only |
| All art original | PASS | everything is `fillRect` calls in `js/scene.js`; one OFL font |
| Reduced motion; no console errors; tests pass | FAIL | browser suite not yet ported |
| Looks right at 375 and 1440 | FAIL | start screen and timeout |

## Iteration 2 — fix what the screenshots showed

- Title in a navy panel; facts hidden on the title, results and error screens; the bee hovers over
  the lawn in a gap between the two panels.
- New mascot sprite with outlined wings, a head and an eye.
- Shake applied to the canvas and the card themselves. HUD moved out of the play view so it stays
  up through the reveal.
- One in a Swarm now gets 750ms of flash and bee burst before its card.
- Marks redrawn. Skyline paled toward the sky colour.
- Tier labels moved to the right, beside the ruler, and shortened; facts narrowed on phones.
- Ported the browser suite and added scenarios for the climb, near-miss, timeout and tiers.

The ported tests then found things the screenshots had not:

- At a high altitude the HUD number overflowed its cell on phones ("223,255 FT"). Restacked the
  phone HUD into two rows.
- At 320px the HUD overlapped the prompt. The prompt is now placed from the HUD's measured height.
- With a keyboard up on a small phone there was no room. Added a "tight" layout driven by the
  visual viewport: 54px of sky still shows between prompt and answer bar at 320x268.
- `image-rendering` resolved to `crisp-edges`, not `pixelated`, because of declaration order.

## Iteration 3 — last look

- Phone HUD was stacking into three rows because a later rule overrode the row layout. Fixed.
- On phones the tier label ran over the mascot. Moved the mascot left on narrow screens.

Still not right, and left as it is:

- The mascot is small and its wings disappear on alternate frames; it reads as a bee but it is not
  a character yet.
- Tier artwork is simple. The hive and the gem are recognisable; "Too Clever" spectacles are subtle.
- On a phone the reveal card covers the lower half of the screen, so you see the tag and the line
  but not much sky while it is up.
- Nobody has heard the sound or felt the frame rate on a real phone.

| Checklist | Result | Evidence |
|---|---|---|
| World never resets; sky visibly changes | PASS | e2e "the climb": HUD reads the same altitude at the start of round 2 as the end of round 1; top-of-screen sky goes from rgb(138,204,252) to rgb(0,6,18) |
| Climb follows the answer, stops on its tier line | PASS | same scenario: tag carries the answer, counter is mid-count at 500ms, lines COMMON to RARE appear in turn, tag ends within 60px above its own line, rare climb took 3,414ms |
| Every tier has icon, colour, label, quip | PASS | e2e "tiers": six distinct colours, pip marks, card pictures, names and quips; unit test simulates deuteranopia and protanopia on the palette |
| One in a Swarm is the most dramatic moment | PASS | only tier with a gold flash, a 46-particle bee burst, a gold mascot, a gold card, the longest climb (4s) and a held beat; screenshots 8 and 9 |
| Timeout, wrong guess, near-miss work and look intentional | PASS | e2e "wrong guess, near-miss and timeout"; screenshots 3, 4, 10 |
| No fake player statistics | PASS | e2e asserts the results text has no percentages or player counts |
| All art original | PASS | drawn in code; unit test confirms no image files ship besides the preview, which is a screenshot of the title screen |
| Reduced motion; no console errors; tests pass | PASS | `npm run test:all`: 91 unit tests, validator, 24 browser scenarios, each asserting an empty console |
| Looks right at 375 and 1440 | PASS | layout scenario at 320, 375, 768 and 1440 including keyboard-up; screenshots reviewed by eye |

Stopped after three iterations.

---

# v3: every flight goes somewhere

The brief: fix six bugs, separate visual height from displayed feet, rebuild the world in zones,
add easter eggs, and make it feel like a journey. Tracked item by item in `SWARM-V3.md`.
Two verify iterations.

## Iteration 1

Built sections 1 to 6, then toured every zone in screenshots and looked at them as a new player.

**The question that matters: does a 150-point flight end somewhere that looks different from the
start?** Yes. It starts on a green lawn under a pale sky beside a brick tower, and ends at
10,000 ft in clear blue above a floor of cloud, with birds and the sun. In between it passes
lit office towers, a crane and a train.

What was wrong:

- From the lawn, the office towers filled the whole sky. Each tower was drawn from its top down
  to the ground, and its top was several screens up. The city now fades in out of haze once the
  swarm leaves the treetops, and from the lawn it is a line on the horizon.
- The title screen's bottom panel was 354px tall on a phone and covered the bee and most of
  campus. Its three controls now share one row and it is 206px.
- A fact on the left sat on top of the bee. Facts now step aside for the bee, the answer tag and
  the tier labels.
- The sun sat behind the swarm for most of the climb. Moved to the right.
- A gold bee had a brown disc behind it (translucent gold on black). Replaced with a few sparks.
- The "common" quip said the bees had barely cleared the lawn, at 10,000 ft. Reworded.
- On phones the tier label ran over the bee, and on the Moon it hid the flag. Bee moved left on
  narrow screens; flag planted just behind it.
- "SIGHTINGS" broke mid-word in its button.

Found by tests, not by eye:

- Sightings in view on the loading screen were being counted when a flight resumed.
- The balloon could still be tapped for a frame after it popped.
- Headless Chrome floods arrow keys with repeats; the Konami handler now ignores repeats.
- The title screen scrolled sideways at 320px.

## Iteration 2

Re-ran everything after the fixes and re-shot the screenshots.

| Checklist | Result | Evidence |
|---|---|---|
| Typing during the wrong-guess lockout is never lost | PASS | e2e "wrong guess, near-miss and timeout": text typed inside the lockout replaces the selected guess; Enter inside it is ignored; the same Enter works after 400ms |
| Same points always climb the same height | PASS | e2e "the climb": 15 points at 160 and 15 points at 260 both move the camera 15 points; 10 points is 60% of the screen. Unit test on `SCREENS_PER_POINT` |
| A 150-pt flight ends in a visibly different zone | PASS | unit test: 150 points crosses campus, skyline and low clouds; screenshots `01-start-campus` and `12-flight150-ends-here` |
| All 8 zones render; the 700 run reaches the Moon | PASS | screenshots 01, 03 to 08 and 20; e2e "a perfect 700": altimeter reads 238,855 MI and the flag is planted |
| 12 sightings, 5 secret answers, 4 interaction eggs, all logged | PASS | 21 entries; e2e "easter eggs" exercises the tower, the bee, the Konami code, the night screen, all five secrets, the balloon and a sighting in flight, reading the log from localStorage each time |
| Facts never clipped or covered; ruler always on top | PASS | e2e: the fact window sits between HUD and reveal card, nothing visible intersects the tag, and the ruler line is one unbroken colour down the canvas |
| No real logos or brand names in art; facts verified or in VERIFY.md | PASS | all art is rectangles in `js/scene.js`; the jet, train, car and satellite carry no markings; 5 approximate facts are flagged in VERIFY.md |
| No console errors; reduced motion works; 60fps on mobile emulation | PASS | every scenario asserts an empty console; e2e "reduced motion"; e2e "frame rate": 60 fps average, 95th-percentile frame 17ms, with the CPU slowed 4x during a 4-second climb |

Not right yet, and left:

- Facts fade out at the edge of the clear band rather than staying fully legible to the last
  pixel. That is deliberate (it is what stops them hiding under panels), but a fact can be
  half-faded for a moment when a round begins.
- Weather is the weakest zone. The thunderheads are blocky and you can pass between them
  without seeing one.
- The bee is still small, and mid-flip it smears for a few frames.
- "Tested in a headless browser" is not "played on a phone". Sound, touch targets on the canvas
  and real frame rate are still unverified by a person.
