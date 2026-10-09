# SWARM-V3 — make every flight a journey

Resume from the first unchecked item. One commit per numbered section.

## 1. Bugs (each with a regression test)
- [x] 1a Typing during the wrong-guess lockout is never dropped; only re-submitting is blocked for 400ms
  - e2e "wrong guess, near-miss and timeout": text typed inside the lockout lands and replaces the selected wrong text; Enter inside it is ignored at no cost; the same Enter works after 400ms.
- [x] 1b The same points always climb the same distance (delivered by section 2)
  - The world is measured in points at 6% of the screen height each. e2e "the climb" plays 15 points at 160 and again at 260 and asserts the camera moved 15 points both times, and that 10 points is 60% of a screen.
- [x] 1c HUD score counts up in sync with the climb
  - e2e "the climb": the HUD score is strictly between 0 and 60 at 500ms into a 60-point climb.
- [x] 1d Altitude facts are never clipped under the HUD or hidden under the reveal card
  - Facts and tier lines now live in a window that spans only the clear band of screen and fades at its edges. e2e asserts the window sits between the HUD and the reveal card.
- [x] 1e The altitude ruler is always the top layer
  - Ruler is drawn last. e2e reads the ruler's column from the canvas and asserts one flat colour top to bottom.
- [x] 1f The answer tag does not collide with facts or tier labels
  - A fact under the tag fades out while the tag is there. e2e asserts nothing visible intersects the tag at the end of a climb.

## 2. Altitude system
- [x] 2a Visual height in points: fixed pixels per point, 10 pts is about 60% of a screen, 100 pts about 6 screens
  - `SCREENS_PER_POINT = 0.06` in js/scene.js. Asserted in the browser by the same scenario.
- [x] 2b Displayed feet from one curve: 0 = 0 ft, 150 ≈ 10,000 ft, 350 ≈ 40,000 ft, 550 ≈ edge of space, 700 = the Moon
  - `altitudeFeet()` in js/core.js, a monotone cubic through seven anchors. Unit test "one altitude curve from the lawn to the Moon": exact at every anchor (700 reads 238,855 mi), strictly rising every half point to 1,200, no step over 6%.
- [x] 2c Climb 2.5 to 4 s, eased, longer for higher tiers; bee held about 60% down the screen
  - Unit test on tier climb times (2.5 s to 4 s, rising); `BEE_DOWN = 0.6` in js/app.js, clamped to the gap above the answer bar when a keyboard is up. Browser check lands with section 3, once the world is redrawn at the new scale.

## 3. A world that changes
- [x] 3a Eight zones by points with their own props; sky is a continuous gradient
  - js/scene.js redrawn: campus (halls, trees, clock tower, paths, walkers), skyline (three depths of lit towers, a train, a crane), low clouds (three shapes, birds, hills), weather (thunderheads with lightning and rain, a jet), high sky (cirrus, low sun, warm haze, a cloud floor), stratosphere (stars, the Earth's curve), space (black, satellites, Earth with a thin blue line), the Moon. Unit test "eight zones"; a phone-size tour was captured and reviewed by eye.
- [x] 3b At least three parallax depth layers
  - Four: far 0.3, mid 0.6, near 1, front 1.4, plus stars at 0.12. Unit test "at least three depth layers".
- [x] 3c Ground fills about the bottom quarter of the start screen
  - The bee idles 2.5 points up at 60% down the screen, which puts the lawn at 75%. The city no longer fills the start screen: towers fade in from haze once the swarm leaves the treetops.
- [x] 3d Facts as small monospace text with leader lines, alternating sides, verified; uncertain ones in VERIFY.md
  - 31 facts in js/facts.js as outlined text with a dotted leader to the ruler, alternating sides. Five approximate ones are flagged and listed in VERIFY.md. Short of "one per half screen": that would need about 85, and I only kept ones I could stand behind. Unit test "facts are in altitude order...".

## 4. Easter eggs
- [x] 4a Twelve altitude sightings with captions, original pixel art
  - Drawn in js/scene.js from rectangles: gold jalopy, squirrel on a bench, window washer, red-and-black balloon (tap to pop), geese with one going the wrong way, a paper-dart exam, a climbing jet, a mortarboard, a weather balloon with a navy-and-gold payload, an astronaut, a honeycomb satellite, a flag on the Moon. Each is placed by its altitude through the curve. The busiest-airport claim was checked (ACI, 2025: Atlanta first, 106.3m passengers). Browser evidence in section 7.
- [x] 4b Five secret answers: Burdell, Buzz, THWG, Helluva Engineer, wrong school
  - `secretFor()` in js/core.js. Unit tests: no time lost, not counted wrong, round stays open, and a secret never overrides a real answer ("Georgia" still scores where Georgia belongs).
- [x] 4c Four interaction eggs: tap the bee, tower chime, night start screen, Konami gold swarm
  - Wired in js/app.js (`onTap`, `onKey`, night sky between midnight and 4am local). Browser evidence in section 7.
- [x] 4d Sightings log in localStorage, panel on results and the menu, "NEW SIGHTING" toast
  - 21 in all (12 + 5 + 4), stored under `swarm.sightings`, shown as "n / 21 found" with silhouettes for the rest.
- [x] 4e Eggs never block input, never cover the prompt or input, never fire while the clock runs; reduced motion respected
  - Taps and toasts are ignored or queued while `clockLive()`; the toast sits in the open sky band; flips, loops, flashes and bursts are skipped under reduced motion. Secret answers are the one exception, since the player types them. Browser evidence in section 7.

## 5. Feel and look
- [ ] 5a Ruler: thin line, ticks and small labels on a transparent background
- [ ] 5b Reveal card smaller, lower, translucent; the tier creature animates
- [ ] 5c The swarm grows by one bee per correct answer and is clearly visible
- [ ] 5d Start screen: rules collapsed by default, smaller title panel, room for the campus

## 6. Content pass
- [ ] 6a Prompts that combine two categories split or rewritten
- [ ] 6b Tiers re-checked: nothing obscure is Common or Too Clever

## 7. Verify (max 5 iterations, logged in REVIEW.md)
- [ ] 7a All tests pass
- [ ] 7b Flights of about 150, about 350 and a perfect 700 at 375x812 and 1440x900, screenshots in screenshots/v3/
- [ ] 7c Screenshot review written up and problems fixed
- [ ] 7d Final checklist with evidence; commit, push, open a PR
