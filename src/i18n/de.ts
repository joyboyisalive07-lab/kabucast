import type { Strings } from "./strings.ts";

export const DE: Strings = {
  locale: "de-DE",
  languageName: "Deutsch",
  languageLabel: "Sprache",
  copyLink: "Link kopieren",
  copied: "Kopiert",

  tagline: "Rübenpreise als Wahrscheinlichkeiten statt als Vermutung.",

  sundayPrice: "Kaufpreis am Sonntag",
  sundayPriceHint: "90 bis 110. Leer lassen, wenn nicht notiert.",
  firstTimeBuyer: "Allererste Woche mit Rüben",
  firstTimeBuyerHint: "Beim ersten Mal erzwingt das Spiel den kleinen Ausschlag.",
  previousPattern: "Muster der letzten Woche",
  patternUnknown: "Weiß ich nicht",
  patternNames: ["Schwankend", "Großer Ausschlag", "Fallend", "Kleiner Ausschlag"],
  prices: "Verkaufspreise",
  pricesHint: "Trag ein, was du hast. Eine ganze Zeile kannst du einfügen.",
  clear: "Leeren",

  dayNames: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"],
  dayShort: ["Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  morning: "vorm.",
  afternoon: "nachm.",

  chartHeading: "Preisprognose",
  legendBand90: "90%-Bereich",
  legendBand50: "50%-Bereich",
  legendMedian: "Median",
  legendMinimum: "niedrigstmöglich",
  legendMaximum: "höchstmöglich",
  legendObserved: "notiert",
  legendPeak: "wahrscheinlichster Höhepunkt",
  axisNote: "Preise auf logarithmischer Skala",
  readoutEmpty: "Diagramm antippen oder Pfeiltaste drücken für genaue Zahlen",
  chartSummary:
    "{recorded} von {total} Preisen notiert. Die übrigen Halbtage können noch zwischen {low} und {high} Sternis liegen.",
  chartPeak: "Wahrscheinlichster Höhepunkt: {slot}.",
  chartKeyboardHint: "Mit den Pfeiltasten links und rechts jeden Halbtag durchgehen.",

  recommendationHeading: "Entscheidung",
  sellNow: "Jetzt verkaufen",
  hold: "Warten",
  sellNowDetail: "Warten ist weniger wert als die {price} Sternis auf dem Tisch.",
  holdDetail: "Warten ist mehr wert als die {price} Sternis auf dem Tisch.",
  expectedIfWaiting: "Erwartet beim Warten",
  probabilityBetter: "Chance, dass Warten besser ist",
  downside: "Schlechter Fall, 10. Perzentil",
  plusMinus: "±",
  nothingLeft: "Die Woche ist vorbei. Es gibt nichts mehr zu entscheiden.",
  nothingEntered: "Trag einen Preis ein, um eine Entscheidung zu bekommen.",

  patternsHeading: "Musterwahrscheinlichkeiten",
  patternColumn: "Muster",
  probabilityColumn: "Wahrscheinlichkeit",
  scenariosColumn: "Szenarien",

  scenariosHeading: "Verbleibende Szenarien",
  scenariosHint: "Jeder Verlauf, der noch zu deinen Eingaben passt, mit seiner Wahrscheinlichkeit.",
  scenarioPeakAt: "Höhepunkt am {slot}",
  scenarioFalls: "fällt {ranges}",
  scenarioAllWeek: "fällt die ganze Woche",
  scenarioCount: "{count} von {total}",

  inconsistentHeading: "Diese Preise kann es nicht geben",
  inconsistentBody:
    "Kein Muster im Spiel erzeugt diese Folge, also gibt es nichts zu rechnen. Prüf deine Zahlen.",
  invalidPrice: "Ganze Zahl zwischen 1 und 999",
  invalidBasePrice: "Ganze Zahl zwischen 90 und 110",
};
