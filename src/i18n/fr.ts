import type { Strings } from "./strings.ts";

export const FR: Strings = {
  locale: "fr-FR",
  languageName: "Français",
  languageLabel: "Langue",
  copyLink: "Copier le lien",
  copied: "Copié",

  tagline: "Le prix des navets en probabilités, pas en suppositions.",

  sundayPrice: "Prix d'achat du dimanche",
  sundayPriceHint: "De 90 à 110. Laissez vide si vous ne l'avez pas noté.",
  firstTimeBuyer: "Toute première semaine avec des navets",
  firstTimeBuyerHint: "La première fois, le jeu impose le petit pic.",
  previousPattern: "Motif de la semaine dernière",
  patternUnknown: "Je ne sais pas",
  patternNames: ["Fluctuant", "Grand pic", "Décroissant", "Petit pic"],
  prices: "Prix de vente",
  pricesHint: "Entrez ce que vous avez. Vous pouvez coller une ligne entière.",
  clear: "Effacer",

  dayNames: ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"],
  dayShort: ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"],
  morning: "matin",
  afternoon: "après-midi",

  chartHeading: "Prévision des prix",
  legendBand90: "intervalle 90 %",
  legendBand50: "intervalle 50 %",
  legendMedian: "médiane",
  legendMinimum: "minimum possible",
  legendMaximum: "maximum possible",
  legendObserved: "noté",
  legendPeak: "pic le plus probable",
  axisNote: "Prix sur une échelle logarithmique",
  readoutEmpty: "Touchez le graphique ou appuyez sur une flèche pour les chiffres exacts",
  chartSummary:
    "{recorded} prix sur {total} saisis. Les demi-journées restantes peuvent encore aller de {low} à {high} clochettes.",
  chartPeak: "Pic le plus probable : {slot}.",
  chartKeyboardHint: "Les flèches gauche et droite parcourent chaque demi-journée.",

  recommendationHeading: "Décision",
  sellNow: "Vendre maintenant",
  hold: "Attendre",
  sellNowDetail: "Attendre vaut moins que les {price} clochettes sur la table.",
  holdDetail: "Attendre vaut plus que les {price} clochettes sur la table.",
  expectedIfWaiting: "Espéré si vous attendez",
  probabilityBetter: "Chance qu'attendre rapporte plus",
  downside: "Mauvais cas, 10e centile",
  plusMinus: "±",
  nothingLeft: "La semaine est finie. Il n'y a plus rien à décider.",
  nothingEntered: "Entrez un prix pour obtenir une décision.",

  patternsHeading: "Probabilité de chaque motif",
  patternColumn: "Motif",
  probabilityColumn: "Probabilité",
  scenariosColumn: "Scénarios",

  scenariosHeading: "Scénarios encore possibles",
  scenariosHint: "Chaque forme encore compatible avec vos saisies, et sa probabilité.",
  scenarioPeakAt: "pic {slot}",
  scenarioFalls: "baisse {ranges}",
  scenarioAllWeek: "baisse toute la semaine",
  scenarioCount: "{count} sur {total}",

  inconsistentHeading: "Ces prix sont impossibles",
  inconsistentBody:
    "Aucun motif du jeu ne produit cette suite, il n'y a donc rien à calculer. Vérifiez vos nombres.",
  inconsistentSlot:
    "Le prix de {slot} ne peut pas suivre les précédents.",
  inconsistentClear: "Effacer {slot}",
  invalidPrice: "Nombre entier entre 1 et 999",
  invalidBasePrice: "Nombre entier entre 90 et 110",
};
