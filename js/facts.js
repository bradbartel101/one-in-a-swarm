/* Altitude facts that slide past on the climb. Written for this game; each one is a real,
   checkable number. `verify` marks one a human should confirm, and those are listed in VERIFY.md.
   Altitudes in the game are measured from campus, while a few facts (mountains) are quoted above
   sea level, as they always are. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SwarmFacts = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return [
    { feet: 723, text: 'Westin Peachtree Plaza, 723 ft. The tallest hotel in the world when it opened in 1976.' },
    { feet: 1023, text: 'Bank of America Plaza, 1,023 ft. Nothing in Atlanta stands taller.' },
    { feet: 4784, text: 'Brasstown Bald, the top of Georgia: 4,784 ft above sea level.' },
    { feet: 6500, text: 'Low clouds keep their bases below about 6,500 ft.' },
    { feet: 13000, text: 'Skydivers usually step out around 13,000 ft.', verify: 'A typical figure; drop zones quote anything from 10,000 to 14,000 ft.' },
    { feet: 16000, text: 'Wispy cirrus clouds begin around 16,000 ft and are made of ice.' },
    { feet: 29032, text: 'The summit of Mount Everest: 29,032 ft.' },
    { feet: 35000, text: 'Airliners cruise at about 35,000 ft.' },
    { feet: 36000, text: 'Around 36,000 ft the stratosphere begins. The weather is all below you now.', verify: 'This is the standard-atmosphere figure; the real boundary moves with latitude and season.' },
    { feet: 60000, text: 'Near 60,000 ft the air is so thin that water boils at body temperature.' },
    { feet: 85069, text: 'An SR-71 Blackbird held level flight at 85,069 ft in 1976.' },
    { feet: 100000, text: 'Weather balloons burst at around 100,000 ft. The sky overhead is nearly black.', verify: 'Burst height varies by balloon; "nearly black" is a description, not a measurement.' },
    { feet: 127852, text: 'Felix Baumgartner jumped from 127,852 ft in 2012.' },
    { feet: 135890, text: 'Alan Eustace jumped from 135,890 ft in 2014.' },
    { feet: 264000, text: 'Fifty miles up. The United States awards astronaut wings from here.' },
    { feet: 328084, text: 'The Karman line, 100 kilometres up: the edge of space.' },
  ];
});
