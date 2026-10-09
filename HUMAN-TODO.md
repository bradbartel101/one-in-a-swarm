# HUMAN-TODO — what still needs a person

## 1. Merged and live

Done: the "Release v1.0" pull request is merged into `main`, and GitHub Pages is serving `main`
at https://bradbartel101.github.io/one-in-a-swarm/ (checked: the game loads and a round starts,
the missing-page URL returns the "Wrong turn" page).

## 2. (done) GitHub Pages

Settings → Pages is set to "Deploy from a branch", `main`, `/ (root)`. Every push to `main`
redeploys the site.

## 3. Confirm the site address used in link previews

`index.html` contains four absolute URLs (`canonical`, `og:url`, `og:image`, `twitter:image`) that
assume `https://bradbartel101.github.io/one-in-a-swarm/`, which is where the site now lives. If you
add a custom domain, change those four lines. Still to do: paste the live link into a group chat (iMessage, Slack, Discord) and
check that the preview image appears.

## 4. Check on real phones

Headless Chrome cannot show a real on-screen keyboard, real frame rates, VoiceOver or TalkBack.

- [ ] **Keyboard, iPhone Safari and Android Chrome:** during a round the clock ring, the prompt and
      the answer box all stay visible above the keyboard. The bar is lifted using the visual
      viewport and the layout tightens when little height is left; both are tested, but only by
      simulating the keyboard.
- [ ] **Smoothness:** the climb should hold a steady frame rate on a mid-range phone. The world is
      a small canvas scaled up (about 125 x 270 art pixels on a phone), which is cheap, but I have
      not measured it on real hardware.
- [ ] **iPhone:** tapping the answer box does not zoom the page, and the keyboard opens when a
      round starts without a second tap.
- [ ] **Copy result** shows "Copied!" on both, and the paste is right.
- [ ] **VoiceOver or TalkBack:** a wrong guess, "10 seconds left", "5 seconds left", the round
      result and the final score are each read out once, and the clock is not read every second.
- [ ] **Sound** is off by default. Turn it on and listen: wrong-guess buzz, the rising tone on the
      climb, the One in a Swarm chord, the last-five-seconds ticks. Nobody has heard these yet;
      the tests only prove they fire and that the mute button silences them.
- [ ] **Taste:** look at `screenshots/` and play it. This rebuild was made without being able to
      see krillion.io's game screens (they render in script and did not load here), so it follows
      your written spec, not that site's look. Say what feels off.

## 5. Have a Georgia Tech student or alum review the content

All 1,290 answers were written from memory. In the audit, every answer I had flagged as uncertain
was checked against a live source (the Tech course catalog, Tech news and housing pages, Wikipedia).
That check also caught one answer I had *not* flagged (the retired "Earth and Atmospheric Sciences"
B.S.), so expect a handful more stale or wrong answers among the unflagged ones.

- [ ] Skim `tools/prompts.src.txt` for anything wrong, closed, renamed or missing.
- [ ] Sanity-check the rarity tiers. They are my guesses about what players will say.
- [ ] `bowls` and `dining` have exactly 25 answers each, the minimum. Add a few if you can.

**Removed because I could not confirm them.** Restore any you know to be right (add the line back to
the prompt named in brackets, then run `npm run build:data`):

- [ ] [majors] Building Construction — the catalog no longer lists this B.S.; replaced with
      "Construction Science and Management". Should "Building Construction" count as an alias?
- [ ] [majors] Earth and Atmospheric Sciences — the catalog lists it only as a minor, M.S. and Ph.D.
- [ ] [dorms] Techwood Dormitory (McDaniel) and Burge Apartments — demolished buildings; names unconfirmed.
- [ ] [dorms] Curran Street Residence Hall — under construction in 2025; add it once it is open.
- [ ] [dorms] "Undergraduate Living Center / ULC" as an old name for Nelson-Shell — unconfirmed, so
      only "Nelson-Shell" is accepted.
- [ ] [dining] Burdell's, Einstein Bros. Bagels, Taco Bell, Pizza Hut, Highland Bakery, Chipotle,
      Atwoods — I could not confirm any of these as campus or Tech Square spots.
- [ ] [nba] Isma'il Muhammad — sources show training camps only, no NBA regular-season game.
- [ ] [qbs] Damarius Bilbo — listed as a backup, with no start at quarterback on record.
- [ ] [streets] Greenfield Street, Power Plant Drive — unconfirmed.
- [ ] [corecourses] MGT 2250, BMED 2110, INTA 1200 — numbers and titles unconfirmed.
- [ ] [codes] PTFE — could not confirm it is still a catalog subject code.
- [ ] [systems] Zimbra (old student email) — unconfirmed. "BuzzFunds" was dropped because it turned
      out to be a funding programme for student organisations, not the BuzzCard balance.
- [ ] [beaten] Sewanee — Tech played them often before 1920; I could not confirm a specific win.

## 6. Decide whether the name and colours are acceptable

The game uses the words "Georgia Tech", Tech Gold and Navy, and campus trivia. It uses no official
logos, wordmarks or Buzz artwork, and every page carries the "not affiliated" line. Whether that is
enough for a public fan project is a judgment about the Institute's trademark and licensing policy
that I can't make for you. If in doubt, ask Georgia Tech's licensing office before promoting it.

## 7. Known limitations to accept or schedule

- Rarity is preset, not measured. Real rarity needs a small backend.
- Altitude is a curve, not a fixed number of feet per point, so that 700 points reaches the edge of
  space while the first obvious answers barely leave the lawn. "+60 PTS" therefore climbs a
  different number of feet depending on how high you already are. The card shows the real figure.
- Flight numbers count from 8 October 2026 (`LAUNCH_DATE` in `js/core.js`).
- Everything runs in the browser, so a determined player can read `data/prompts.json` or edit their
  saved score. The timer resists refreshes, tab switching and clock changes, but someone who sets
  their device clock back *while the page is closed* pauses the clock for that long.
- A correct answer that is not in the bank is marked wrong and costs 3 seconds. This will happen,
  most often with recent athletes and coaches and with course numbers.
- The prompt bank covers 4 days without a repeat. After that prompts recur, in new combinations.
- CI runs the unit tests and the validator. The headless-Chrome suite runs locally
  (`npm run test:e2e`); it has not been tried on GitHub's runners.
