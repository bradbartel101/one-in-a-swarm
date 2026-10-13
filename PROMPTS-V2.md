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
- [x] D10d. Traditions, head coaches and Atlanta headquarters retired (reasons in G); new GT prompts to bring the pool to 60
- [x] E. Validation in the test suite (section 7 of the brief)
- [x] F. Schedule regenerated for future dates only; repeat gap per pool reported
- [x] G. This file completed: counts, gaps, table of every prompt, drops, ten strongest
- [x] H. One daily flight played and screenshotted (a gt round and a general round); PR "Prompt bank v2" opened with VERIFY.md at the top

## Decisions and log
- 2026-10-13, resumed: the boxes above were brought in line with the commits already on the branch (A through D9 were done but unticked). State at resume: 101 live prompts (56 gt, 45 general, 15 of them easy openers), 15 retired, 10,949 answers. Still under the rules at that point: 25 older prompts (open lists under 80 answers, or closed lists without every member).
- The "40 players, 5 guesses each" simulation is kept in a lighter form: each prompt's source carries the guesses that were considered and rejected, with a reason (`!` lines, compiled to `data/review/meta.json`). The accepted guesses are simply in the answer list. A literal transcript of 200 guesses per prompt was not saved.
- 2026-10-13, later the same day: D10a to F finished. The brief itself is not in the repository, so "section 7" could not be read back; the validation tests in `tests/bank-v2.test.js` enforce the rules as this file and the build tool state them (pool on every live prompt, 80 answers for an open list, count and source and every member for a closed list, clarifier of eight words or fewer, no rejected or held-out guess that is also accepted, 60 gt prompts, the 14-day rule, the daily order). If the brief asked for a check that is not in that list, it is not tested.
- Lists the owner called already verified (Heisman winners through 2025, NCAA champions) were not searched again. Fernando Mendoza (2025) came off the held-out list on that basis.
- The pre-existing browser test "infinite: a full run through every prompt" was failing on this branch before any of today's work (it counted retired prompts). It now counts live prompts.
- H: the flight for 2026-10-17 (the first day of the new mix) was played end to end in headless Chrome at phone size: seven rounds in the order general, gt, gt, general, gt, general, gt, 330 points, no console errors. Pictures of round 1 (general, "Name an NFL team"), round 2 (gt, "Name a drink made by The Coca-Cola Company") and the results screen are in `screenshots/prompts-v2/`. Full suite at the end: 138 unit tests pass, the content validator passes, 38 of 38 browser scenarios pass.
- Late fix: 18 older prompts had no answer in one tier (17 with no deep cut, one with no rare). A browser test that asks for a deep-cut answer on a random prompt failed on one of them. Some rare answers in those prompts were moved to deep cut (and half of the landlocked deep cuts to rare), and a test now requires every tier on every live prompt.

## G. Where the bank stands

### Counts
- **105 live prompts: 60 gt, 45 general** (15 of the general ones are easy openers). 20 retired prompts stay in the files so that days already scheduled still play.
- **12,788 answers** in live prompts (13,565 with the retired ones). 49 closed lists, 56 open lists.
- Smallest open lists: buildings 81, Waffle House 81, Georgia colleges 82, Chick-fil-A 82, Summer Olympic sports 83. Nothing live is under 80.
- 1,210 rejected guesses with reasons are on file across 102 of the 105 live prompts (`data/review/meta.json`). The three without any are closed catalogue lists where a wrong guess is simply not on the list (majors, CS course numbers, MARTA stations).
- 97 answers are held out of the game and listed in VERIFY.md.

### Schedule
- Days through 2026-10-16 are untouched (2026-10-13 was "today" when the schedule was redrawn; the next three days were also left alone so that a merge a few days later cannot change a day that has become today).
- From **2026-10-17** every day is general (easy), gt, gt, general, gt, general, gt. The schedule runs to 2027-10-16.
- Repeat gap, by pool: **gt 15 days** (60 prompts, 4 a day), **easy general 15 days** (15 prompts, 1 a day), **other general 15 days** (30 prompts, 2 a day). The smallest gap actually found in the file is 15 days in each pool.
- Slack before the 14-day rule breaks and the build refuses to write a schedule: the gt pool can lose 4 prompts (56), the easy openers 1 (14), the other general prompts 2 (28).

### Gaps and things I could not do
- **Three lists are not checked against a source**: Atlanta United players after April 2021, the Waffle House menu and the Chick-fil-A menu. They are in VERIFY.md under "Lists I could not check".
- **Written from memory, not checked item by item**: the top-ups to films, musicians, Braves, Falcons and Hawks (D10b), and four new open prompts (birds, trees, Georgia wildlife, backpack). I only added answers I was confident of, but a fan should skim them. Roster and filming-location answers are the likeliest to hold a mistake.
- **NBA and MLB lists are complete as far as Wikipedia is**: they are built from Wikipedia's categories, not from an official register. The MLB total (69) agrees with ramblinwreck.com's running count; I found no official count to hold the NBA total (42) against.
- **Residence halls and Greek chapters are now "today's list"**, taken from Tech's own pages. Past halls and chapters (Fourth Street Apartments, Triangle, Alpha Delta Chi) are no longer accepted; that is a deliberate change from "past or present".
- **Buildings** rest partly on an older campus map (it still shows a "College of Management"), topped up from gatech.edu pages for the newer buildings. Two names I could not confirm are held out.
- **`atlairlines` and `atlnonstop` will go stale** as routes change; both carry the date they were read. `atlairlines` has 27 answers, only two above the 25-answer floor.
- **Tiers are still estimates.** Nothing here has been measured against real players.
- The first-pass reasons for the 15 prompts retired in step C were never written down; the reasons in the table below are mine, reconstructed from the prompts themselves.

### Prompts dropped, and why
| id | answers | prompt | why it was retired |
|---|---|---|---|
| `dining` | 25 | Name a spot to grab a bite or a coffee on or right around campus, past or present | Places open and close every term; no list to check against, and it could not reach 80. |
| `golf` | 26 | Name a golfer who played for Georgia Tech | Too few well-known names; covered by the famous-athletes prompt. |
| `bowls` | 25 | Name a bowl game Georgia Tech football has played in | A short list; the general bowl-games prompt and the Peach Bowl prompt cover the ground. |
| `orgs` | 47 | Name a Georgia Tech student organization | Hundreds exist and the list changes yearly, so correct answers were being marked wrong. |
| `streets` | 40 | Name a street on or right beside Tech's campus | "Right beside" is a judgement call; replaced by streets in Atlanta (161 answers). |
| `landmarks` | 43 | Name an Atlanta landmark or attraction within a few miles of campus | "A few miles" is a judgement call; replaced by landmarks inside the city limits. |
| `hangouts` | 41 | Name a place on Tech's campus that isn't a classroom building | No clear edge to the list. |
| `olympics` | 32 | Name a sport contested at the Atlanta Summer Games | A fixed list under 80; the general Summer Olympics prompt and the 1996 gold-medal countries prompt replace it. |
| `proteams` | 32 | Name an Atlanta-area pro sports team, past or present | Too few real teams to make a fair list of 80. |
| `qbs` | 39 | Name a quarterback who has started a game for Georgia Tech | No complete public list to check against; covered by the athletes and NFL prompts. |
| `corecourses` | 57 | Name a non-CS course by subject and number | Replaced by one closed prompt per subject, each checked against the catalogue. |
| `techs` | 35 | Name another U.S. school that goes by "Tech" or "Institute of Technology" | Short list with a fuzzy edge. |
| `systems` | 36 | Name a campus app, website, or shuttle that Tech students use | Changes every year; no source. |
| `nicknames` | 29 | Name the team nickname of a school that has shared a conference with Tech | Duplicates the conference prompt; the general college-nicknames prompt replaces it. |
| `beaten` | 53 | Name a team from outside today's ACC that Tech football has beaten | Hard to read, and I could not check every result. |
| `engineering` | 44 | Name a branch of engineering | There is no agreed list of branches, so the edge of the list was my opinion. Replaced by birds. |
| `units` | 42 | Name a unit of measurement named after a person | Only about 45 exist, most of them obscure; too hard for the general pool. Replaced by trees. |
| `traditions` | 36 | Name a Georgia Tech tradition or piece of campus lore | What counts as a tradition is opinion; it could not reach 80 without padding. |
| `coaches` | 45 | Name a Georgia Tech head coach | "Any sport, any era" has no complete list I could check, and most real answers are obscure. |
| `hq` | 50 | Name a company headquartered in metro Atlanta | Companies move, merge and rename; no stable list to check against. |

### The ten strongest prompts (my picks)
1. `atlnonstop`, cities you can fly to nonstop from Atlanta: everyone has an answer, 223 are right, and the rare ones are satisfying.
2. `gacounties`, Georgia's 159 counties: closed, complete, and every player knows a few.
3. `fightsong`, a word in the "Ramblin' Wreck" song: a closed list of 75 that every Tech fan can sing through.
4. `southernfood`: 182 answers, no wrong-feeling misses.
5. `marta`, the 38 rail stations: small, closed, local.
6. `atltallest`, Atlanta's tallest buildings: 125 answers, with Coda and Square on Fifth for the Tech crowd.
7. `gagovernors`: closed at 77, and the 100-point answer is the man who wrote the bill that founded Tech.
8. `backpack`, something in a Tech student's backpack: easy to start, with RAT caps and engineering paper further down.
9. `heisman`: all 90 winners, with Tech's near-misses on the rejected list.
10. `elements`: all 118, an easy opener with a deep tail.

### Every live prompt
| id | pool | prompt | list | answers | rejected guesses on file | source |
|---|---|---|---|---|---|---|
| `majors` | gt | Name an undergraduate major at Georgia Tech | closed, 42 | 42 | 0 | catalog.gatech.edu/programs, bachelor's degrees |
| `buildings` | gt | Name an academic or research building on Tech's campus | open | 81 | 20 |  |
| `dorms` | gt | Name a Georgia Tech residence hall | closed, 35 | 35 | 8 | housing.gatech.edu list of housing options, October 2026; a complex wi… |
| `alumni` | gt | Name a famous person who studied at Georgia Tech | open | 232 | 15 |  |
| `nba` | gt | Name a Tech basketball player who reached the NBA | closed, 42 | 42 | 16 | Wikipedia: every player in the category for Tech men's basketball play… |
| `nfl` | gt | Name a Tech football player who went on to the NFL | open | 215 | 10 |  |
| `diamond` | gt | Name a Tech baseball player who reached the major leagues | closed, 69 | 69 | 10 | Wikipedia's category of Tech baseball players, keeping the major leagu… |
| `neighborhoods` | gt | Name a neighborhood in the city of Atlanta | open | 140 | 20 |  |
| `conference` | gt | Name a school that has shared a conference with Tech | closed, 36 | 36 | 18 | Wikipedia membership tables: Southern Conference 1921-32, SEC 1932-64,… |
| `cs` | gt | Name a Georgia Tech CS course by its number | closed, 288 | 288 | 0 | catalog.gatech.edu/coursesaz/cs, every numbered course (recitations an… |
| `marta` | gt | Name a MARTA rail station | closed, 38 | 38 | 0 | itsmarta.com rail station list |
| `gacolleges` | gt | Name another college or university in Georgia | open | 82 | 15 |  |
| `greek` | gt | Name a Greek organization with a chapter at Tech | closed, 55 | 55 | 14 | greek.gatech.edu, Our Chapters and Councils, October 2026 (31 IFC, 9 C… |
| `codes` | gt | Name a subject code from Tech's course catalog | closed, 90 | 90 | 1 | catalog.gatech.edu/coursesaz |
| `films` | gt | Name a movie or series filmed in metro Atlanta | open | 177 | 18 |  |
| `musicians` | gt | Name a musician or group from the Atlanta area | open | 174 | 24 |  |
| `braves` | gt | Name a player from Atlanta Braves history | open | 250 | 15 |  |
| `falcons` | gt | Name a player from Atlanta Falcons history | open | 214 | 15 |  |
| `hawks` | gt | Name a player from Atlanta Hawks history | open | 172 | 13 |  |
| `collegetowns` | gt | Name the home city of a school in Tech's conference history | closed, 34 | 34 | 8 | the home cities of the 36 schools on the conference prompt; three of t… |
| `minors` | gt | Name a minor offered at Georgia Tech | closed, 87 | 87 | 7 | catalog.gatech.edu/programs, minors |
| `mathcourses` | gt | Name a Georgia Tech MATH course by its number | closed, 136 | 136 | 5 | catalog.gatech.edu/coursesaz/math, every numbered course (placeholders… |
| `gtmasters` | gt | Name a master's degree offered at Georgia Tech | closed, 59 | 59 | 12 | catalog.gatech.edu/programs, master's degrees (59 different program na… |
| `statesymbols` | gt | Name an official state symbol of Georgia | closed, 57 | 57 | 12 | Wikipedia, List of Georgia state symbols |
| `gacounties` | gt | Name a county in Georgia | closed, 159 | 159 | 7 | Wikipedia, List of counties in Georgia |
| `masters` | gt | Name a golfer who has won the Masters | closed, 57 | 57 | 16 | Wikipedia, List of Masters Tournament champions (through 2026) |
| `gold96` | gt | Name a country that won gold at the 1996 Atlanta Olympics | closed, 53 | 53 | 13 | Wikipedia, 1996 Summer Olympics medal table |
| `stateparks` | gt | Name a Georgia state park | closed, 45 | 45 | 11 | Wikipedia, List of Georgia state parks |
| `atlstreets` | gt | Name a street in Atlanta | open | 161 | 4 |  |
| `atlsuburbs` | gt | Name a suburb of Atlanta | open | 140 | 9 |  |
| `gacities` | gt | Name a city or town in Georgia | open | 242 | 7 |  |
| `georgians` | gt | Name a famous person from Georgia | open | 187 | 13 |  |
| `cokebrands` | gt | Name a drink made by The Coca-Cola Company | open | 109 | 14 |  |
| `cartoonnetwork` | gt | Name a Cartoon Network original show | open | 130 | 17 |  |
| `gtathletes` | gt | Name a famous Georgia Tech athlete | open | 204 | 11 |  |
| `atllandmarks` | gt | Name a landmark in the city of Atlanta | open | 151 | 14 |  |
| `southernfood` | gt | Name a Southern food | open | 182 | 10 |  |
| `georgiawaters` | gt | Name a body of water in Georgia | open | 99 | 8 |  |
| `outkast` | gt | Name a song by OutKast | open | 105 | 12 |  |
| `united` | gt | Name a player from Atlanta United history | open | 87 | 8 | not checked: Wikipedia's list of players is complete only to April 2021; later play… |
| `wafflehouse` | gt | Name something on the Waffle House menu | open | 81 | 23 | not checked: written from memory of the menu; not checked against the current one |
| `chickfila` | gt | Name something on the Chick-fil-A menu | open | 82 | 11 | not checked: written from memory of the menu; not checked against the current one |
| `fightsong` | gt | Name a word in the "Ramblin' Wreck" fight song | closed, 75 | 75 | 11 | the three verses of "Ramblin' Wreck from Georgia Tech" as sung today, … |
| `gameday` | gt | Name something you'd see at a Tech football game | open | 117 | 6 |  |
| `bulldogs` | gt | Know thy enemy: name a Georgia Bulldogs football great | open | 189 | 12 |  |
| `hbcus` | gt | Name a historically Black college or university | closed, 105 | 105 | 9 | Wikipedia, List of historically black colleges and universities (curre… |
| `peachbowl` | gt | Name a team that has played in the Peach Bowl | closed, 47 | 47 | 12 | Wikipedia, Peach Bowl game results (through January 2026) |
| `physcourses` | gt | Name a Georgia Tech PHYS course by its number | closed, 119 | 119 | 4 | catalog.gatech.edu/coursesaz/phys, every numbered course (placeholders… |
| `mecourses` | gt | Name a Georgia Tech ME course by its number | closed, 243 | 243 | 4 | catalog.gatech.edu/coursesaz/me, every numbered course (placeholders l… |
| `isyecourses` | gt | Name a Georgia Tech ISyE course by its number | closed, 160 | 160 | 3 | catalog.gatech.edu/coursesaz/isye, every numbered course (placeholders… |
| `ececourses` | gt | Name a Georgia Tech ECE course by its number | closed, 298 | 298 | 4 | catalog.gatech.edu/coursesaz/ece, every numbered course (placeholders … |
| `aecourses` | gt | Name a Georgia Tech AE course by its number | closed, 136 | 136 | 3 | catalog.gatech.edu/coursesaz/ae, every numbered course (placeholders a… |
| `chemcourses` | gt | Name a Georgia Tech CHEM course by its number | closed, 129 | 129 | 3 | catalog.gatech.edu/coursesaz/chem, every numbered course (placeholders… |
| `atlnonstop` | gt | Name a city you can fly to nonstop from Atlanta | open | 223 | 22 | Wikipedia, Hartsfield-Jackson airport destination table, read October … |
| `atlairlines` | gt | Name an airline that flies passengers out of Atlanta | closed, 27 | 27 | 15 | Wikipedia, Hartsfield-Jackson airport destination table, read October … |
| `gagovernors` | gt | Name a governor of Georgia | closed, 77 | 77 | 17 | Wikipedia, List of governors of Georgia: every state governor from 177… |
| `atltallest` | gt | Name one of Atlanta's tallest buildings | closed, 125 | 125 | 17 | Wikipedia, List of tallest buildings in Atlanta: every building of 300… |
| `falconspicks` | gt | Name a Falcons first-round draft pick | closed, 61 | 61 | 16 | Wikipedia, List of Atlanta Falcons first-round draft picks, 1966 throu… |
| `gawildlife` | gt | Name a wild animal that lives in Georgia | open | 206 | 24 |  |
| `backpack` | gt | Name something in a Tech student's backpack | open | 145 | 12 |  |
| `languages` | general | Name a programming language | open | 149 | 24 |  |
| `elements` | general (easy) | Name a chemical element | closed, 118 | 118 | 18 | IUPAC periodic table |
| `hoopschamps` | general | Name a school that has won the men's NCAA basketball tournament | closed, 37 | 37 | 20 | ncaa.com list of champions, 1939 to 2025 (37 different schools) |
| `heisman` | general | Name a Heisman Trophy winner | closed, 90 | 90 | 24 | heisman.com winners list, 1935 to 2025 (91 trophies, Archie Griffin tw… |
| `countries` | general (easy) | Name a country | closed, 195 | 195 | 17 | the 193 UN member states plus Vatican City and Palestine |
| `capitals` | general | Name the capital city of a country | closed, 195 | 195 | 20 | one capital for each of the 195 countries; a second official capital i… |
| `africa` | general | Name a country in Africa | closed, 54 | 54 | 12 | the 54 African member states of the UN |
| `landlocked` | general | Name a landlocked country | closed, 44 | 44 | 15 | countries on the list of 195 with no ocean coastline |
| `endsina` | general | Name a country whose name ends in the letter A | closed, 73 | 73 | 11 | worked out from the list of 195 countries, by their usual English names |
| `states` | general (easy) | Name a U.S. state | closed, 50 | 50 | 7 | the 50 states |
| `statecapitals` | general | Name a U.S. state capital | closed, 50 | 50 | 20 | the 50 state capitals |
| `presidents` | general (easy) | Name a U.S. president | closed, 45 | 45 | 8 | the 45 people who have held the office through 2025 |
| `nflteams` | general (easy) | Name an NFL team | closed, 32 | 32 | 8 | the 32 NFL franchises |
| `nbateams` | general | Name an NBA team | closed, 30 | 30 | 7 | the 30 NBA franchises |
| `mlbteams` | general | Name a Major League Baseball team | closed, 30 | 30 | 7 | the 30 MLB franchises |
| `nationalparks` | general | Name a U.S. national park | closed, 63 | 63 | 14 | the 63 units the National Park Service calls "National Park" |
| `fruits` | general (easy) | Name a fruit | open | 103 | 12 |  |
| `vegetables` | general (easy) | Name a vegetable | open | 104 | 11 |  |
| `colors` | general (easy) | Name a color | open | 126 | 7 |  |
| `dogbreeds` | general (easy) | Name a breed of dog | open | 174 | 11 |  |
| `sports` | general (easy) | Name a sport | open | 153 | 7 |  |
| `pizzatoppings` | general (easy) | Name a pizza topping | open | 133 | 5 |  |
| `instruments` | general (easy) | Name a musical instrument | open | 151 | 7 |  |
| `carbrands` | general (easy) | Name a car brand | open | 150 | 12 |  |
| `boardgames` | general (easy) | Name a board game | open | 169 | 11 |  |
| `constellations` | general | Name a constellation | closed, 88 | 88 | 11 | the 88 constellations recognized by the International Astronomical Uni… |
| `cheeses` | general | Name a kind of cheese | open | 129 | 8 |  |
| `ologies` | general | Name a word that ends in "-ology" | open | 208 | 9 |  |
| `toolbox` | general | Name something you'd find in a toolbox | open | 136 | 7 |  |
| `wheels` | general | Name something that has wheels | open | 141 | 6 |  |
| `olympicsports` | general | Name a sport at the Summer Olympics | open | 83 | 13 |  |
| `kitchentools` | general (easy) | Name a kitchen tool or utensil | open | 177 | 7 |  |
| `nhlteams` | general | Name an NHL team | closed, 32 | 32 | 7 | the 32 NHL franchises |
| `shakespeare` | general | Name a play by Shakespeare | closed, 38 | 38 | 13 | the 36 plays of the First Folio plus Pericles and The Two Noble Kinsmen |
| `disney` | general | Name an animated Disney movie | open | 93 | 20 |  |
| `emperors` | general | Name a Roman emperor | open | 95 | 13 |  |
| `pasta` | general | Name a pasta shape | open | 118 | 13 |  |
| `spicerack` | general | Name something on a spice rack | open | 123 | 9 |  |
| `dinosaurs` | general | Name a dinosaur | open | 167 | 16 |  |
| `greekmyth` | general | Name a figure from Greek mythology | open | 238 | 12 |  |
| `collegenicknames` | general | Name a college team nickname | open | 204 | 4 |  |
| `yellowthings` | general | Name something that is yellow | open | 209 | 9 |  |
| `bowlgames` | general | Name a college football bowl game | open | 92 | 10 |  |
| `birds` | general | Name a kind of bird | open | 196 | 15 |  |
| `trees` | general | Name a kind of tree | open | 142 | 15 |  |
