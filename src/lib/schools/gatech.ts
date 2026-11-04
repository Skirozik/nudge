import type { School } from './types'

// Findings from live testing against registration.banner.gatech.edu (2026-11-03):
// - Same Banner 9 flow as GSU works unmodified: GET /ssb/registration → POST
//   term/search?mode=search → GET classSearch → POST resetDataForm → GET
//   searchResults. No GT-specific request changes were needed.
// - Term list: Language Institute terms are already self-marked "(View Only)"
//   by Banner, same as a not-yet-open term, so the existing "first term not
//   View Only" rule (now banner.ts's pickActiveTerm) handles both correctly.
//   Spring 2027 ("202702") was marked View Only as of the Guide's Oct 27
//   check; as of today it's open and picked correctly. Nothing to fix here.
// - CS 1331 search returns real sections with real seat counts (e.g. 5
//   sections, 178/180 open in one). The Guide's "Problem 2" (0 sections)
//   did not reproduce.
// - txt_courseReferenceNumber is broken here too — a CRN-only search ignores
//   the filter and returns every section for the term, same as GSU. The
//   existing searchByCrn() workaround (search by subject+number, filter
//   client-side) is unaffected and still required.
// - Subject codes: CS is already the real code (unlike GSU's CSC), so it's
//   not in subjectAliases below — per the Guide, only non-code spellings go in.
// - DIFFERENT FROM GSU, and likely the real explanation for the Guide's
//   "Problem 2": an unrecognized/rate-limited session doesn't come back as
//   an HTML page here. It comes back as a normal 200 with valid JSON —
//   {"success":true,"totalCount":0,"data":null} — so banner.ts's existing
//   "non-JSON response (session expired?)" retry never fires for this case.
//   Reproduced it a few ways: a single fresh login followed by 4 searches
//   back to back on that SAME session returned real data every time
//   (5/5/5/5 sections for CS 1331). But under heavier testing — several
//   script runs and a live three-terminal test close together — a search
//   on an already-established, previously-working session still came back
//   empty. So this isn't strictly "fresh logins only": it looks like some
//   form of rate limiting or anomaly detection on Georgia Tech's side keyed
//   to overall request volume from an IP in a short window, not just login
//   count. I don't know its exact threshold or cooldown. Normal production
//   use (one worker, one session reused across polls every few minutes) is
//   far below whatever volume I was generating while manually mapping this,
//   but it's worth Zach knowing this shape exists — a watch that goes quiet
//   with no error isn't necessarily broken, it may be this. I didn't add an
//   auto-retry for it: an immediate retry would likely land in the same
//   window and could make it worse without knowing the real cooldown.
// - Waitlist fields exist and are populated: waitCapacity, waitCount,
//   waitAvailable all came back on real sections (e.g. waitCapacity: 100,
//   waitCount: 0). Per the Guide, not building anything on this — Zach's
//   call on how SeatSnipe should treat a seat opening on a waitlisted section.
// - registerSite: oscar.gatech.edu (confirmed live, 200).
export const gatech: School = {
  id: 'gatech',
  name: 'Georgia Tech',
  shortName: 'Georgia Tech',
  aliases: ['gt', 'gatech', 'ga tech', 'georgia tech', 'georgia institute of technology'],
  banner: {
    baseUrl: 'https://registration.banner.gatech.edu/StudentRegistrationSsb',
    registerSite: 'oscar.gatech.edu',
    subjectAliases: {
      COMPSCI: 'CS',
      CSCI: 'CS',
      ECO: 'ECON',
      ECONOMICS: 'ECON',
      ENG: 'ENGL',
      ENGLISH: 'ENGL',
      BIO: 'BIOL',
      BIOLOGY: 'BIOL',
      CHEMISTRY: 'CHEM',
      PHYSICS: 'PHYS',
      PSYCH: 'PSYC',
      PSYCHOLOGY: 'PSYC',
      MECH: 'ME',
      MECHE: 'ME',
      AERO: 'AE',
      EE: 'ECE',
      ELECTRICAL: 'ECE',
      ISE: 'ISYE',
      IE: 'ISYE',
      BME: 'BMED',
      CIVIL: 'CEE',
    },
  },
}
