# SWARM-V4 — bugs, and the remaining gap in feel

Resume from the first unchecked item. One commit per section.

## 1. Bugs (each with a regression test)
- [ ] 1a Only one caption at a time, queued, each fading after about 3 s
- [ ] 1b The climb starts within 200 ms of a correct submit
- [ ] 1c No freeze when the page is hidden mid-climb; every animation has a timer fallback
- [ ] 1d Secret answers show their message at once and never clear later typing
- [ ] 1e The "NEW SIGHTING" toast never overlaps the title, prompt card, HUD or input
- [ ] 1f Altitude facts stay inside a safe area between the HUD and the input bar
- [ ] 1g Points to feet through one function, tested at the five checkpoints
- [ ] 1h Daily schedule frozen by date in data/schedule.json, append-only

## 2. Close the feel gap
- [ ] 2a Panel-less centered reveal over the scene, with a subtle scrim
- [ ] 2b Tier lines pulse as the tag passes; the winning line turns solid and labeled
- [ ] 2c The bee glances at the input while you type, cheers on a hit, droops on a timeout
- [ ] 2d A Common answer still feels like something: half a screen and a puff of pollen
- [ ] 2e Zones differ more: clearly darker with cirrus and a jet by 300, navy with stars and the Earth's curve by 450
- [ ] 2f Start screen: less empty grass, more foreground detail
- [ ] 2g Results: a flight log with one column per round on zone bands, plus the Sightings panel

## 3. Verify (max 5 iterations, logged in REVIEW.md)
- [ ] 3a All tests pass
- [ ] 3b Runs of about 150, about 350 and a perfect 700 at both sizes, plus hidden-then-visible mid-climb
- [ ] 3c Screenshots in screenshots/v4/, compared against the reference, differences listed and fixed
- [ ] 3d Final checklist with evidence; commit, push, open a PR
