/* Altitude facts that slide past on the climb. Written for this game; each is a real, checkable
   number, placed in the world by its altitude through core.altitudeFeet(). `verify` marks one
   that is a typical or approximate figure, and those are listed in VERIFY.md.
   The game measures altitude from campus, while mountains are quoted above sea level, as always. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SwarmFacts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const MILE = 5280;
  return [
    { feet: 100, text: 'About 100 ft: the roof of a ten-storey building.', verify: 'A rule of thumb (roughly 10 ft a storey), not a measurement.' },
    { feet: 167, text: 'Niagara\'s Horseshoe Falls drop 167 ft.' },
    { feet: 305, text: 'The Statue of Liberty\'s torch: 305 ft up.' },
    { feet: 380, text: 'The tallest tree on Earth, a coast redwood, is about 380 ft.' },
    { feet: 555, text: 'The Washington Monument: 555 ft.' },
    { feet: 723, text: 'Westin Peachtree Plaza, 723 ft. The tallest hotel in the world when it opened in 1976.' },
    { feet: 1023, text: 'Bank of America Plaza, 1,023 ft. Nothing in Atlanta stands taller.' },
    { feet: 1250, text: 'The roof of the Empire State Building: 1,250 ft.' },
    { feet: 1776, text: 'One World Trade Center: 1,776 ft, on purpose.' },
    { feet: 2717, text: 'Burj Khalifa, the tallest building ever built: 2,717 ft.' },
    { feet: 4784, text: 'Brasstown Bald, the top of Georgia: 4,784 ft above sea level.' },
    { feet: 6500, text: 'Low clouds keep their bases below about 6,500 ft.' },
    { feet: 6684, text: 'Mount Mitchell, 6,684 ft: the highest peak east of the Mississippi.' },
    { feet: 13000, text: 'Skydivers usually step out around 13,000 ft.', verify: 'A typical figure; drop zones quote anything from 10,000 to 14,000 ft.' },
    { feet: 14505, text: 'Mount Whitney, 14,505 ft: the roof of the lower 48 states.' },
    { feet: 16000, text: 'Wispy cirrus clouds begin around 16,000 ft and are made of ice.' },
    { feet: 20310, text: 'Denali, 20,310 ft: the top of North America.' },
    { feet: 29032, text: 'The summit of Mount Everest: 29,032 ft.' },
    { feet: 35000, text: 'Airliners cruise at about 35,000 ft.' },
    { feet: 36000, text: 'Around 36,000 ft the stratosphere begins. The weather is below you now.', verify: 'The standard-atmosphere figure; the real boundary moves with latitude and season.' },
    { feet: 60000, text: 'Near 60,000 ft the air is so thin that water boils at body temperature.' },
    { feet: 85069, text: 'An SR-71 Blackbird held level flight at 85,069 ft in 1976.' },
    { feet: 100000, text: 'Weather balloons burst at around 100,000 ft. The sky overhead is nearly black.', verify: 'Burst height varies by balloon; "nearly black" is a description, not a measurement.' },
    { feet: 127852, text: 'Felix Baumgartner jumped from 127,852 ft in 2012.' },
    { feet: 135890, text: 'Alan Eustace jumped from 135,890 ft in 2014.' },
    { feet: 264000, text: 'Fifty miles up. The United States awards astronaut wings from here.' },
    { feet: 328084, text: 'The Karman line, 100 kilometres up: the edge of space.' },
    { feet: 250 * MILE, text: 'The International Space Station orbits about 250 miles up.', verify: 'Its altitude drifts between roughly 230 and 260 miles.' },
    { feet: 12550 * MILE, text: 'GPS satellites circle 12,550 miles up.' },
    { feet: 22236 * MILE, text: 'At 22,236 miles a satellite keeps pace with the turning Earth and seems to hang still.' },
    { feet: 238855 * MILE, text: 'The Moon: 238,855 miles from home, on average.' },
  ];
});
