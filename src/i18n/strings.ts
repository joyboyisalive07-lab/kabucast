/**
 * Every string the interface can show. Kept in one table so that adding a
 * language is adding a file, and so that no string is written inline where a
 * translator would never find it.
 */

export interface Strings {
  /** BCP 47 tag, used for grouping separators in figures. */
  readonly locale: string;
  readonly languageName: string;
  readonly languageLabel: string;
  readonly copyLink: string;
  readonly copied: string;

  readonly tagline: string;

  readonly sundayPrice: string;
  readonly sundayPriceHint: string;
  readonly firstTimeBuyer: string;
  readonly firstTimeBuyerHint: string;
  readonly previousPattern: string;
  readonly patternUnknown: string;
  readonly patternNames: readonly string[];
  readonly prices: string;
  readonly pricesHint: string;
  readonly clear: string;

  readonly dayNames: readonly string[];
  /** Two or three characters; the chart axis and the day blocks use these. */
  readonly dayShort: readonly string[];
  readonly morning: string;
  readonly afternoon: string;

  readonly chartHeading: string;
  readonly legendBand90: string;
  readonly legendBand50: string;
  readonly legendMedian: string;
  readonly legendMinimum: string;
  readonly legendMaximum: string;
  readonly legendObserved: string;
  readonly legendPeak: string;
  readonly axisNote: string;
  readonly readoutEmpty: string;

  readonly recommendationHeading: string;
  readonly sellNow: string;
  readonly hold: string;
  readonly sellNowDetail: string;
  readonly holdDetail: string;
  readonly expectedIfWaiting: string;
  readonly probabilityBetter: string;
  readonly downside: string;
  readonly plusMinus: string;
  readonly nothingLeft: string;
  readonly nothingEntered: string;

  readonly patternsHeading: string;
  readonly patternColumn: string;
  readonly probabilityColumn: string;
  readonly scenariosColumn: string;

  readonly scenariosHeading: string;
  readonly scenariosHint: string;
  readonly scenarioPeakAt: string;
  readonly scenarioFalls: string;
  readonly scenarioAllWeek: string;
  readonly scenarioCount: string;

  readonly inconsistentHeading: string;
  readonly inconsistentBody: string;
  readonly invalidPrice: string;
  readonly invalidBasePrice: string;
}

export const EN: Strings = {
  locale: "en-US",
  languageName: "English",
  languageLabel: "Language",
  copyLink: "Copy link",
  copied: "Copied",

  tagline: "Turnip prices, as probabilities rather than guesses.",

  sundayPrice: "Sunday buy price",
  sundayPriceHint: "90 to 110. Leave empty if you did not record it.",
  firstTimeBuyer: "First week ever buying turnips",
  firstTimeBuyerHint: "The game forces the small spike the first time.",
  previousPattern: "Last week's pattern",
  patternUnknown: "I don't know",
  patternNames: ["Fluctuating", "Large spike", "Decreasing", "Small spike"],
  prices: "Selling prices",
  pricesHint: "Enter what you have. Paste a whole row if you like.",
  clear: "Clear",

  dayNames: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  dayShort: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  morning: "AM",
  afternoon: "PM",

  chartHeading: "Price forecast",
  legendBand90: "90% range",
  legendBand50: "50% range",
  legendMedian: "Median",
  legendMinimum: "Lowest possible",
  legendMaximum: "Highest possible",
  legendObserved: "Recorded",
  legendPeak: "Likeliest peak",
  axisNote: "Prices on a logarithmic scale",
  readoutEmpty: "Touch the chart for exact numbers",

  recommendationHeading: "Decision",
  sellNow: "Sell now",
  hold: "Wait",
  sellNowDetail: "Waiting is worth less than the {price} bells on the table.",
  holdDetail: "Waiting is worth more than the {price} bells on the table.",
  expectedIfWaiting: "Expected if you wait",
  probabilityBetter: "Chance waiting beats selling now",
  downside: "Bad case, 10th percentile",
  plusMinus: "±",
  nothingLeft: "The week is over. Nothing left to decide.",
  nothingEntered: "Enter a price to get a decision.",

  patternsHeading: "Pattern probabilities",
  patternColumn: "Pattern",
  probabilityColumn: "Probability",
  scenariosColumn: "Scenarios",

  scenariosHeading: "Surviving scenarios",
  scenariosHint:
    "Every shape still consistent with what you entered, with the probability of each.",
  scenarioPeakAt: "peak at {slot}",
  scenarioFalls: "falls {ranges}",
  scenarioAllWeek: "falls all week",
  scenarioCount: "{count} of {total}",

  inconsistentHeading: "These prices cannot happen",
  inconsistentBody:
    "No pattern in the game produces this sequence, so there is nothing to compute. Check the numbers you typed.",
  invalidPrice: "Whole number between 1 and 999",
  invalidBasePrice: "Whole number between 90 and 110",
};
