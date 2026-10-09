# SWARM-V3 — make every flight a journey

Resume from the first unchecked item. One commit per numbered section.
The brief arrived cut off: section 4C ends after "Tap the clock tower 5 times", with one empty
bullet after it. Everything that came through is listed here.

## 1. Bugs (each with a regression test)
- [ ] 1a Typing during the wrong-guess lockout is never dropped; only re-submitting is blocked for 400ms
- [ ] 1b The same points always climb the same distance (delivered by section 2)
- [ ] 1c HUD score counts up in sync with the climb
- [ ] 1d Altitude facts are never clipped under the HUD or hidden under the reveal card
- [ ] 1e The altitude ruler is always the top layer
- [ ] 1f The answer tag does not collide with facts or tier labels

## 2. Altitude system
- [ ] 2a Visual height in points: fixed pixels per point, 10 pts is about 60% of a screen, 100 pts about 6 screens
- [ ] 2b Displayed feet from one curve: 0 = 0 ft, 150 ≈ 10,000 ft, 350 ≈ 40,000 ft, 550 ≈ edge of space, 700 = the Moon
- [ ] 2c Climb 2.5 to 4 s, eased, longer for higher tiers; bee held about 60% down the screen

## 3. A world that changes
- [ ] 3a Eight zones by points with their own props; sky is a continuous gradient
- [ ] 3b At least three parallax depth layers
- [ ] 3c Ground fills about the bottom quarter of the start screen
- [ ] 3d Facts as small monospace text with leader lines, alternating sides, verified; uncertain ones in VERIFY.md

## 4. Easter eggs
- [ ] 4a Twelve altitude sightings with captions, original pixel art
- [ ] 4b Secret answers: Burdell, Buzz, THWG, Helluva Engineer, wrong school
- [ ] 4c Tap the bee; tap the clock tower five times on the start screen

## Wrap-up
- [ ] Full test suite and a screenshot review
