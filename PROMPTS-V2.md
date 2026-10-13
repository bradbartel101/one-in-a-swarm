# PROMPTS-V2 — rebuilding the prompt bank

Resume from the first unchecked item. Branch `prompts-v2`. Commit after each batch. Do not merge.
Tiers are estimates until there is real player data.

## Checklist
- [x] A. Plumbing: `pool`, clarifier, type/count/source, held-out and rejected lists in the build tool; clarifier shown in the game; retired prompts stay playable on days already scheduled
- [x] B. Daily mix: 4 gt + 3 general in the order general, gt, gt, general, gt, general, gt; easy general first; repeat rule; tests
- [x] C. Audit of the 44 existing prompts: pool tags and first keep/retire pass (in the sources; the reasons are written up in G)
- [x] D1. Closed GT lists verified against the catalog (majors, minors, subject codes, CS and MATH courses)
- [x] D2. Georgia closed lists (counties, Masters champions, 1996 gold-medal countries, state parks)
- [x] D3. New GT prompts (streets, suburbs, fight song, game day, Bulldogs, cities, Georgians, Coca-Cola)
- [x] D4. New GT prompts (Cartoon Network, athletes, PHYS/ME/ISyE/ECE courses, master's degrees, state symbols, HBCUs)
- [x] D5. New GT prompts (landmarks, Southern food, AE/CHEM courses, Peach Bowl, waters, OutKast, Atlanta United, Waffle House, Chick-fil-A)
- [x] D6. General prompts: geography, closed lists, easy openers
- [x] D7. General prompts (car brands, board games, constellations, cheeses, -ology, toolbox, wheels, Olympic sports)
- [x] D8. General prompts (kitchen tools, NHL, Shakespeare, Disney, emperors, pasta)
- [x] D9. General prompts (spice rack, dinosaurs, Greek myth, college nicknames, yellow things, bowl games)
- [x] D10a. Older general prompts brought up to the rules: elements to all 118, Heisman and NCAA champions complete with counts, programming languages to 80+; engineering and units retired and replaced
- [x] D10b. Older GT prompts topped up from knowledge to 80+: films, musicians, Braves, Falcons, Hawks
- [x] D10c. Older GT prompts checked against published lists: dorms, Greek chapters, NBA/NFL/MLB alumni, conference history and its college towns, Atlanta neighborhoods, buildings, Georgia colleges, alumni
- [ ] D10d. Traditions, head coaches and Atlanta headquarters retired (reasons in G); new GT prompts to bring the pool to 60
- [ ] E. Validation in the test suite (section 7 of the brief)
- [ ] F. Schedule regenerated for future dates only; repeat gap per pool reported
- [ ] G. This file completed: counts, gaps, table of every prompt, drops, ten strongest
- [ ] H. One daily flight played and screenshotted (a gt round and a general round); PR "Prompt bank v2" opened with VERIFY.md at the top

## Decisions and log
- 2026-10-13, resumed: the boxes above were brought in line with the commits already on the branch (A through D9 were done but unticked). State at resume: 101 live prompts (56 gt, 45 general, 15 of them easy openers), 15 retired, 10,949 answers. Still under the rules at that point: 25 older prompts (open lists under 80 answers, or closed lists without every member).
- The "40 players, 5 guesses each" simulation is kept in a lighter form: each prompt's source carries the guesses that were considered and rejected, with a reason (`!` lines, compiled to `data/review/meta.json`). The accepted guesses are simply in the answer list. A literal transcript of 200 guesses per prompt was not saved.
