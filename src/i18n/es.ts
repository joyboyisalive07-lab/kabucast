import type { Strings } from "./strings.ts";

export const ES: Strings = {
  locale: "es-ES",
  languageName: "Español",
  languageLabel: "Idioma",
  copyLink: "Copiar enlace",
  copied: "Copiado",

  tagline: "Precios de los nabos como probabilidades, no como conjeturas.",

  sundayPrice: "Precio de compra del domingo",
  sundayPriceHint: "De 90 a 110. Déjalo vacío si no lo anotaste.",
  firstTimeBuyer: "Primera semana comprando nabos",
  firstTimeBuyerHint: "La primera vez el juego impone el pico pequeño.",
  previousPattern: "Patrón de la semana pasada",
  patternUnknown: "No lo sé",
  patternNames: ["Fluctuante", "Pico grande", "Decreciente", "Pico pequeño"],
  prices: "Precios de venta",
  pricesHint: "Escribe lo que tengas. Puedes pegar una fila entera.",
  clear: "Borrar",

  dayNames: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"],
  dayShort: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
  morning: "mañana",
  afternoon: "tarde",

  chartHeading: "Previsión de precios",
  legendBand90: "rango del 90%",
  legendBand50: "rango del 50%",
  legendMedian: "mediana",
  legendMinimum: "mínimo posible",
  legendMaximum: "máximo posible",
  legendObserved: "anotado",
  legendPeak: "pico más probable",
  axisNote: "Precios en escala logarítmica",
  readoutEmpty: "Toca el gráfico o pulsa una flecha para ver cifras exactas",
  chartSummary:
    "{recorded} de {total} precios anotados. Las medias jornadas que quedan aún pueden ir de {low} a {high} bayas.",
  chartPeak: "Pico más probable: {slot}.",
  chartKeyboardHint: "Usa las flechas izquierda y derecha para leer cada media jornada.",

  recommendationHeading: "Decisión",
  sellNow: "Vender ahora",
  hold: "Esperar",
  sellNowDetail: "Esperar vale menos que las {price} bayas que tienes delante.",
  holdDetail: "Esperar vale más que las {price} bayas que tienes delante.",
  expectedIfWaiting: "Esperado si aguantas",
  probabilityBetter: "Probabilidad de que esperar salga mejor",
  downside: "Mal caso, percentil 10",
  plusMinus: "±",
  nothingLeft: "La semana ha terminado. No queda nada que decidir.",
  nothingEntered: "Escribe un precio para obtener una decisión.",

  patternsHeading: "Probabilidad de cada patrón",
  patternColumn: "Patrón",
  probabilityColumn: "Probabilidad",
  scenariosColumn: "Escenarios",

  scenariosHeading: "Escenarios que siguen en pie",
  scenariosHint: "Cada forma que aún encaja con lo que has escrito, con su probabilidad.",
  scenarioPeakAt: "pico el {slot}",
  scenarioFalls: "baja {ranges}",
  scenarioAllWeek: "baja toda la semana",
  scenarioCount: "{count} de {total}",

  inconsistentHeading: "Estos precios no pueden darse",
  inconsistentBody:
    "Ningún patrón del juego produce esta secuencia, así que no hay nada que calcular. Revisa los números.",
  invalidPrice: "Número entero entre 1 y 999",
  invalidBasePrice: "Número entero entre 90 y 110",
};
