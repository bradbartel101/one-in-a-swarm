# Morning report — overnight run

Branch: `overnight`. Nothing was pushed to main and nothing was merged; the live site did not change.

## Read this first
- The Mac was on battery at 9% in Low Power Mode when the run began, and started charging during item 1. While it was on battery one browser test ("frame rate during a climb on a throttled phone") could not pass, because Low Power Mode caps the browser at 30 frames a second; it passes on mains power. Every commit below was made with the whole suite passing unless it says otherwise.

## Done
1. **No time penalty for wrong answers.** Wrong guesses cost nothing in both modes. The box still shakes and says "'x': no buzz. try again." with the text selected. A repeat of a guess (after normalizing) is ignored with no message and no count. Submits are accepted at most once every 350 ms; typing is never blocked. The results show "Round 3 · 2 misses" under the round and a "Wrong guesses" total; neither is in the share text. Rules text, README and tests updated; new tests for duplicates and the cooldown.
2. **Polish.** The sun now keeps to the left of the sky, away from the answer tag (centre) and tier labels (right), and is not drawn at all wherever the reveal text, the tag or a tier label would be in front of it; it fades back in when the sky there is clear. Captions show for about 3 seconds, fade, and are removed the moment their subject scrolls off screen; captions queued for things no longer in view are dropped. Tier lines glow as the answer passes instead of scaling, so their labels stay one size.
3. **Launch essentials.** `config.js` holds `GOATCOUNTER_CODE` and `FEEDBACK_URL`, both empty. With a site code, the page loads GoatCounter (page views) and sends one `flight-finished` event per completed daily flight; with none, nothing is loaded. "Wrong tier? Tell us" appears on the results page only when `FEEDBACK_URL` is set, and carries `date=` and `prompts=`. The link preview tags were checked against the GitHub Pages URL (added `og:image:type`, `og:locale`, `twitter:image:alt`), and the 1200x630 image is verified by a test. A web app manifest and four icons (drawn from the game's own bee by `npm run build:icons`) make it installable to a home screen.

## Skipped

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

## For you to check or decide
- **Set your two launch values in `config.js`**: the GoatCounter site code (you need to create the free account) and the feedback address. Both are empty, so neither feature is live yet.
- **One accidental outside request.** While writing the visit-counter test, one test run loaded GoatCounter's public script (`gc.zgo.at/count.js`) once from the local test browser before my block was in place. It sent no count (the script refuses on localhost) and the test now blocks that address before any page loads. Nothing else left the machine.
