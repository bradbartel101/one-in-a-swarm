# Morning report — overnight run

Branch: `overnight`. Nothing was pushed to main and nothing was merged; the live site did not change.

## Read this first
- The Mac was on battery at 9% in Low Power Mode when the run began, and started charging during item 1. While it was on battery one browser test ("frame rate during a climb on a throttled phone") could not pass, because Low Power Mode caps the browser at 30 frames a second; it passes on mains power. Every commit below was made with the whole suite passing unless it says otherwise.

## Done
1. **No time penalty for wrong answers.** Wrong guesses cost nothing in both modes. The box still shakes and says "'x': no buzz. try again." with the text selected. A repeat of a guess (after normalizing) is ignored with no message and no count. Submits are accepted at most once every 350 ms; typing is never blocked. The results show "Round 3 · 2 misses" under the round and a "Wrong guesses" total; neither is in the share text. Rules text, README and tests updated; new tests for duplicates and the cooldown.
2. **Polish.** The sun now keeps to the left of the sky, away from the answer tag (centre) and tier labels (right), and is not drawn at all wherever the reveal text, the tag or a tier label would be in front of it; it fades back in when the sky there is clear. Captions show for about 3 seconds, fade, and are removed the moment their subject scrolls off screen; captions queued for things no longer in view are dropped. Tier lines glow as the answer passes instead of scaling, so their labels stay one size.
3. **Launch essentials.** `config.js` holds `GOATCOUNTER_CODE` and `FEEDBACK_URL`, both empty. With a site code, the page loads GoatCounter (page views) and sends one `flight-finished` event per completed daily flight; with none, nothing is loaded. "Wrong tier? Tell us" appears on the results page only when `FEEDBACK_URL` is set, and carries `date=` and `prompts=`. The link preview tags were checked against the GitHub Pages URL (added `og:image:type`, `og:locale`, `twitter:image:alt`), and the 1200x630 image is verified by a test. A web app manifest and four icons (drawn from the game's own bee by `npm run build:icons`) make it installable to a home screen.
4. **Better sharing.** The text share is unchanged. A new "SAVE IMAGE" button draws a 1080x1350 PNG: title, flight number, date, score, final altitude, band name, the flight log chart and the site address, with no answers. On a phone with a share sheet that accepts files it opens the share sheet; everywhere else it downloads `one-in-a-swarm-flight-N.png`. A test renders the card at 375 px and 1440 px and requires the two pictures to be identical byte for byte.
5. **Content (partly: see "For you to check").**
   - **The count you asked for: the bank as it stood (32 prompts) covers 4 days before a prompt has to repeat.** Seven prompts a day means a prompt came back about every fifth day. No prompt going unrepeated for 30 days needs 210 prompts; 120 days with no repeat at all needs 840.
   - **Added 12 prompts (44 now, 1,971 answers):** films shot in Atlanta, Atlanta musicians, Braves, Falcons and Hawks players, college towns of Tech's conference rivals, branches of engineering, programming languages, chemical elements, units named after people, NCAA basketball champions, Heisman winners. Each has 25+ answers, exactly one 100-point answer, tiers and aliases. **The bank now covers 6 days without a repeat**, and no prompt returns within six days anywhere in the new schedule.
   - **The 120-day target was not reached.** Writing 170 to 800 more prompts in one night could only be done by guessing at answers, and the accuracy rule comes first. This is the honest stopping point, not a skipped item.
   - **Held out for your approval (not in the game):** 5 answers I was not sure of, listed in VERIFY.md under "Held out of the game until approved" (Road Trip, Jumanji: Welcome to the Jungle, Soulja Boy, Trinidad James, Fernando Mendoza). The build tool now has a `~` marker for this.
   - **Schedule:** every day up to and including today (2026-10-13 UTC) is byte-for-byte unchanged. The 363 later days were drawn again from the 44-prompt bank, and the file now runs to 2027-10-13. The CI check now protects days up to today and allows future days to be redrawn.
   - **Rivalry week:** `data/themed/rivalry.json` holds 7 prompts (400 answers): Georgia Bulldogs greats ("Know thy enemy"), Georgia cities ("Anywhere but Athens"), Georgia counties, dog breeds, insects, other rivalry games and trophies, and ACC-or-SEC schools. It is **not scheduled** and the game does not load it. Tell me the dates and I will wire it in.
6. **Stats for players.** The results page has a "Your flights" section: a bar for each of your last 30 scores (today's bar is pale, your best has a green cap), streak, longest streak, flights, average and best, and how many answers of each tier you have found all-time, including rounds where nothing landed. It all lives in the same localStorage record as before. A record saved before tonight keeps its streak and totals and starts its chart and tier counts from the next flight; damaged parts are reset one at a time without losing the rest.
7. **More easter eggs.** Four new sightings, placed in the zones that had the fewest: a pizza-delivery drone among the Midtown towers (350 ft), a paper airplane in the high sky (45,000 ft), a pressure-suited skydiver in the stratosphere (120,000 ft) and a teapot in orbit (1,000 miles). One new secret answer: type "What's the good word?" in any round and the game answers. The Sightings total is now 26 (16 sightings, 6 secrets, 4 things to do). All art is drawn in code; no logos or brand names.
8. **Final check.**
   - **Tests:** 119 unit tests, the content validator (44 prompts and the rivalry set), and 35 of 35 browser scenarios pass. Frame rate on a 4x-slowed phone: 60 fps. Climb starts 16 ms after submit.
   - **Screenshots:** 70 files in `screenshots/overnight/`, at 375x812 and 1440x900: a daily flight with wrong guesses (`-10`, `-12`, `-17b` shows "Round 1 · 2 misses"), a run to about 350 (`-18`, `-19`), a perfect 700 with the Moon and flag (`-20` to `-25`), an Infinite run to the end (`-27`, `-28`), "Your flights" (`-17c`), the share card (`-17d`), and the four new sightings (`-29`).
   - **No time lost to wrong guesses, measured during the screenshot run:** three wrong guesses took 1.0 s off the clock in 0.9 s of real time on the phone size, and 0.9 s in 0.8 s on desktop. That is the clock running, nothing more.
   - **Lighthouse** (served locally with gzip and a 10-minute cache, as GitHub Pages does):

     | | Performance | Accessibility | Best practices | SEO |
     |---|---|---|---|---|
     | Mobile | 99 | 100 | 100 | 100 |
     | Desktop | 100 | 100 | 100 | 100 |

     Mobile: first paint 1.4 s, largest paint 2.0 s, no blocking time, no layout shift. One fix came out of it: the invisible window that facts scroll through used to move when the page settled, which Lighthouse counted as a layout shift (0.17 to 0.25); it now stays put (0). Before that fix mobile performance was 92. Against a plain uncompressed local server the first run scored 50 for performance, but that server is not how the site is hosted.
   - **Pull request:** "Overnight improvements", from `overnight` to `main`. Not merged.

## Skipped
Nothing was skipped. One item fell short of its target: see item 5 (content).

## Decisions I made
- **Infinite mode lost its penalty too.** The brief says "everywhere". A wrong guess there used to cost 3 seconds and could end the run; now only the clock and skips (5 s) can. Infinite mode is easier as a result: you can guess freely while the clock drains only at real speed. Say if you want a penalty kept there.
- **The cooldown applies to every submit**, not only after a wrong one, so confirming a near miss also waits 350 ms.
- **A wrong guess with almost no time left no longer ends the round**; only the clock does.
- **The power came back partway through item 1** (the Mac began charging), and with it the frame-rate test passes again.
- **The sun hides rather than dodges.** On a phone the reveal text is nearly as wide as the screen, so there is no spot beside it; the sun disappears behind text and returns when clear, instead of jumping sideways.
- **A caption can now go unseen.** If a sighting flies past faster than the caption queue reaches it, its caption is dropped (the sighting still counts in the log). That is the price of never showing a caption for something that has gone.
- **No service worker.** Offline support was optional, and the surest way never to serve a stale daily puzzle is not to cache at all. The game needs a connection to load.
- **`config.js` lives at the top of the site**, next to `index.html`, so it is easy to find.
- **The feedback link accepts only `https:` or `mailto:` addresses**; anything else is treated as empty.
- **The finished-flight event fires once, when you land**, not when the results are reopened after a reload.
- **The share card uses the pixel font only**, so it looks the same on every device; it shows each round's tier mark at the altitude reached, like the flight log, and never an answer.
- **Three of the new prompts are general knowledge with a Tech hook** (elements, programming languages, units) rather than Tech trivia, because those are lists I can get fully right. Drop any you think are off-theme: delete the block in `tools/prompts.src.txt`, run `npm run build:data` and `npm run build:schedule:redraw`.
- **"C", "C++" and "C#" count as one answer** in the programming-languages prompt, because the game ignores punctuation and all three reduce to "C".
- **History starts now.** There is no way to recover past scores or tiers for existing players, so their chart begins with their next flight. The longest streak starts from their current streak.
- **First-load budget.** The bigger prompt bank pushed the slow-network test (title screen ready on a 400 kbps link, uncompressed) to 9.07 s against its 9 s limit. I did not loosen the test. Instead the share-card script now loads only when "Save image" is pressed and the generated `prompts.json` lost its indentation (137 KB to 121 KB), which brings the test to about 8.65 s. GitHub Pages compresses these files, so real loads are far faster than the test's worst case, but the next big batch of prompts will need the bank loaded in parts.
- **Lighthouse had to be downloaded.** It was not installed, so I ran it with `npx`, which fetched it from the npm registry. It audited only the local copy of the site. It is not added to the project.

## For you to check or decide
- **Set your two launch values in `config.js`**: the GoatCounter site code (you need to create the free account) and the feedback address. Both are empty, so neither feature is live yet.
- **One accidental outside request.** While writing the visit-counter test, one test run loaded GoatCounter's public script (`gc.zgo.at/count.js`) once from the local test browser before my block was in place. It sent no count (the script refuses on localhost) and the test now blocks that address before any page loads. Nothing else left the machine.
- **Content target.** 44 prompts cover 6 days without a repeat, not 120. Decide how much repetition you can live with: about 85 prompts would give 12 days, 210 would give 30. I can keep adding in batches of a dozen with the same care, or you can supply topics.
- **Rivalry week dates.** The set is ready in `data/themed/rivalry.json` and unscheduled. Pick the seven prompts' day or days and I will schedule it.
- **Approve or reject the 5 held-out answers** in VERIFY.md.
- **Tiers on the new prompts are my editorial guesses**, as with the original bank.
