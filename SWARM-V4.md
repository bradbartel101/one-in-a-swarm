# SWARM-V4 — bugs, and the remaining gap in feel

Resume from the first unchecked item. One commit per section.

## 1. Bugs (each with a regression test)
- [x] 1a Only one caption at a time, queued, each fading after about 3 s
  - Evidence: e2e "captions: one at a time, about three seconds each" passes; captions are also hidden on the results screen
- [x] 1b The climb starts within 200 ms of a correct submit
  - Evidence: e2e "the climb" measures it in the page: climb began 23 ms after submit
- [x] 1c No freeze when the page is hidden mid-climb; every animation has a timer fallback
  - Evidence: e2e "page hidden mid-climb: the game never freezes, and the reveal always arrives" passes; every camera move has a timer fallback
- [x] 1d Secret answers show their message at once and never clear later typing
  - Evidence: e2e "easter eggs" checks the message is set in the same tick as the submit and that "Klaus" typed afterwards survives
- [x] 1e The "NEW SIGHTING" toast never overlaps the title, prompt card, HUD or input
  - Evidence: e2e "easter eggs" checks the toast against the title, start panel, tools, HUD, prompt, input bar, button and reveal
- [x] 1f Altitude facts stay inside a safe area between the HUD and the input bar
  - Evidence: e2e "the climb" checks every visible fact is wholly inside the safe area; ruler numbers obey the same area
- [x] 1g Points to feet through one function, tested at the five checkpoints
  - Evidence: unit test "points to feet: the five checkpoints of the one curve" (0, 10,000, 40,000, 328,084 ft, 238,855 mi)
- [x] 1h Daily schedule frozen by date in data/schedule.json, append-only
  - Evidence: tests/schedule.test.js and e2e "daily schedule is frozen by date, even when the prompt bank changes"; CI refuses a changed published day

## 2. Close the feel gap
- [x] 2a Panel-less centered reveal over the scene, with a subtle scrim
  - Evidence: screenshots/v4/*-12, -19, -20, -23
- [x] 2b Tier lines pulse as the tag passes; the winning line turns solid and labeled
  - Evidence: e2e "the climb" asserts the winning line has .won; screenshots -12 and -19
- [x] 2c The bee glances at the input while you type, cheers on a hit, droops on a timeout
  - Evidence: scene.setLook / moods cheer and droop; screenshots -10 (typing), -19 (cheer), -16 (timeout)
- [x] 2d A Common answer still feels like something: half a screen and a puff of pollen
  - Evidence: 10 points is 60% of a screen (SCREENS_PER_POINT = 0.06 in js/app.js); the pollen puff is scene.pollen(), not separately screenshotted
- [x] 2e Zones differ more: clearly darker with cirrus and a jet by 300, navy with stars and the Earth's curve by 450
  - Evidence: screenshots -12 (8,893 ft, pale blue, cumulus) against -19 (40,000 ft, navy, cirrus) and -20 (stars, Earth's curve)
- [x] 2f Start screen: less empty grass, more foreground detail
  - Evidence: screenshots -01: flower beds, path with students, bench, lamp posts, hedge
- [x] 2g Results: a flight log with one column per round on zone bands, plus the Sightings panel
  - Evidence: screenshots -17, -24, -25; e2e keyboard run asserts seven log columns at the right heights

## 3. Verify (max 5 iterations, logged in REVIEW.md)
- [x] 3a All tests pass
  - Evidence: npm run test:all: 106 unit tests, content OK, 30 of 30 browser scenarios
- [x] 3b Runs of about 150, about 350 and a perfect 700 at both sizes, plus hidden-then-visible mid-climb
  - Evidence: npm run screens plays 145, 350 and 700 at 375x812 and 1440x900; the hidden-page case is the e2e scenario in 1c
- [x] 3c Screenshots in screenshots/v4/, compared against the reference, differences listed and fixed
  - Evidence: 50 screenshots in screenshots/v4/; differences and fixes are logged in REVIEW.md
- [x] 3d Final checklist with evidence; commit, push, open a PR
  - Evidence: REVIEW.md, "v4 final checklist"
