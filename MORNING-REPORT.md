# Morning report — overnight run

Branch: `overnight`. Nothing was pushed to main and nothing was merged; the live site did not change.

## Read this first
- The Mac was on battery at 9% in Low Power Mode when the run began, and started charging during item 1. While it was on battery one browser test ("frame rate during a climb on a throttled phone") could not pass, because Low Power Mode caps the browser at 30 frames a second; it passes on mains power. Every commit below was made with the whole suite passing unless it says otherwise.

## Done
1. **No time penalty for wrong answers.** Wrong guesses cost nothing in both modes. The box still shakes and says "'x': no buzz. try again." with the text selected. A repeat of a guess (after normalizing) is ignored with no message and no count. Submits are accepted at most once every 350 ms; typing is never blocked. The results show "Round 3 · 2 misses" under the round and a "Wrong guesses" total; neither is in the share text. Rules text, README and tests updated; new tests for duplicates and the cooldown.

## Skipped

## Decisions I made
- **Infinite mode lost its penalty too.** The brief says "everywhere". A wrong guess there used to cost 3 seconds and could end the run; now only the clock and skips (5 s) can. Infinite mode is easier as a result: you can guess freely while the clock drains only at real speed. Say if you want a penalty kept there.
- **The cooldown applies to every submit**, not only after a wrong one, so confirming a near miss also waits 350 ms.
- **A wrong guess with almost no time left no longer ends the round**; only the clock does.
- **The power came back partway through item 1** (the Mac began charging), and with it the frame-rate test passes again.

## For you to check or decide
