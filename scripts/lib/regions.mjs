// State -> region, using the US Census Bureau's nine divisions rather than an ad-hoc
// grouping. Two reasons: "New England" in the brief's first question is a Census division
// with a fixed, checkable membership (CT, ME, MA, NH, RI, VT), and a published standard
// keeps region boundaries out of the author's judgement.
//
// Region is also the comparison set for scoring: an airport is ranked against its regional
// peers, not against every US airport. See docs/03-scoring-methodology.md.
const DIVISIONS = {
  'New England': ['CT', 'ME', 'MA', 'NH', 'RI', 'VT'],
  'Middle Atlantic': ['NJ', 'NY', 'PA'],
  'East North Central': ['IL', 'IN', 'MI', 'OH', 'WI'],
  'West North Central': ['IA', 'KS', 'MN', 'MO', 'NE', 'ND', 'SD'],
  'South Atlantic': ['DE', 'DC', 'FL', 'GA', 'MD', 'NC', 'SC', 'VA', 'WV'],
  'East South Central': ['AL', 'KY', 'MS', 'TN'],
  'West South Central': ['AR', 'LA', 'OK', 'TX'],
  Mountain: ['AZ', 'CO', 'ID', 'MT', 'NV', 'NM', 'UT', 'WY'],
  Pacific: ['AK', 'CA', 'HI', 'OR', 'WA'],
  // Not Census divisions. BTS reports these origins and they are US airports for this
  // purpose, but they belong to no division, so they get their own set rather than being
  // silently folded into one.
  'US Territories': ['PR', 'VI', 'GU', 'AS', 'MP', 'TT'],
};

const BY_STATE = Object.fromEntries(
  Object.entries(DIVISIONS).flatMap(([region, states]) => states.map((s) => [s, region])),
);

export const regionForState = (state) => BY_STATE[state] ?? null;
export const REGIONS = Object.keys(DIVISIONS);
