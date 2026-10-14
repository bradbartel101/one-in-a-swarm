/* One in a Swarm — the two settings the site owner fills in. Both are off while empty.

   GOATCOUNTER_CODE  The site code from goatcounter.com: for "myswarm.goatcounter.com" it is
                     "myswarm". When set, the page loads GoatCounter's counting script and
                     counts page views, plus one event per finished daily flight. GoatCounter
                     sets no cookies and collects no personal data. When empty, nothing is
                     loaded and nothing leaves the page.

   FEEDBACK_URL      Where "Wrong tier? Tell us" on the results page points: an https: form or
                     page, or a mailto: address. The date and the day's prompt ids are added to
                     the link. When empty, the link is hidden. */
window.SwarmConfig = {
  GOATCOUNTER_CODE: 'oneinaswarm',
  FEEDBACK_URL: '',
};
