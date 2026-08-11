import type { Strings } from "./strings.ts";

export const RU: Strings = {
  locale: "ru-RU",
  languageName: "Русский",
  languageLabel: "Язык",
  copyLink: "Скопировать ссылку",
  copied: "Скопировано",

  tagline: "Цены на репу как вероятности, а не как догадки.",

  sundayPrice: "Цена покупки в воскресенье",
  sundayPriceHint: "От 90 до 110. Оставьте пустым, если не записали.",
  firstTimeBuyer: "Первая в жизни неделя с репой",
  firstTimeBuyerHint: "В первый раз игра всегда даёт малый шип.",
  previousPattern: "Паттерн прошлой недели",
  patternUnknown: "Не знаю",
  patternNames: ["Колебания", "Большой шип", "Снижение", "Малый шип"],
  prices: "Цены продажи",
  pricesHint: "Введите то, что есть. Можно вставить всю строку разом.",
  clear: "Очистить",

  dayNames: ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"],
  dayShort: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"],
  morning: "утро",
  afternoon: "вечер",

  chartHeading: "Прогноз цен",
  legendBand90: "интервал 90%",
  legendBand50: "интервал 50%",
  legendMedian: "медиана",
  legendMinimum: "нижняя граница",
  legendMaximum: "верхняя граница",
  legendObserved: "записано",
  legendPeak: "вероятный пик",
  axisNote: "Цены по логарифмической шкале",
  readoutEmpty: "Коснитесь графика или нажмите стрелку, чтобы увидеть точные числа",
  chartSummary:
    "Записано {recorded} из {total} цен. Оставшиеся полудни могут дать от {low} до {high} колокольчиков.",
  chartPeak: "Вероятный пик: {slot}.",
  chartKeyboardHint: "Стрелки влево и вправо читают каждую половину дня.",

  recommendationHeading: "Решение",
  sellNow: "Продавать",
  hold: "Ждать",
  sellNowDetail: "Ожидание стоит меньше, чем {price} на столе.",
  holdDetail: "Ожидание стоит больше, чем {price} на столе.",
  expectedIfWaiting: "Ожидаемо, если ждать",
  probabilityBetter: "Шанс, что ожидание выгоднее",
  downside: "Плохой случай, 10-й перцентиль",
  plusMinus: "±",
  nothingLeft: "Неделя кончилась. Решать больше нечего.",
  nothingEntered: "Введите цену, чтобы получить решение.",

  patternsHeading: "Вероятности паттернов",
  patternColumn: "Паттерн",
  probabilityColumn: "Вероятность",
  scenariosColumn: "Сценарии",

  scenariosHeading: "Выжившие сценарии",
  scenariosHint: "Каждая форма, ещё совместимая с введённым, и её вероятность.",
  scenarioPeakAt: "пик в {slot}",
  scenarioFalls: "падает {ranges}",
  scenarioAllWeek: "падает всю неделю",
  scenarioCount: "{count} из {total}",

  inconsistentHeading: "Таких цен не бывает",
  inconsistentBody:
    "Ни один паттерн в игре не даёт такую последовательность, считать нечего. Проверьте введённые числа.",
  inconsistentSlot:
    "Цена за {slot} не может следовать за предыдущими.",
  inconsistentClear: "Очистить {slot}",
  invalidPrice: "Целое число от 1 до 999",
  invalidBasePrice: "Целое число от 90 до 110",
};
