/**
 * Number formatting for the interface.
 *
 * Probabilities are the one place where rounding can lie: a scenario with a
 * one in ten thousand chance is not zero, and printing it as "0%" would claim
 * the maths never produced it. Anything below the displayed precision but above
 * zero is shown with a less-than sign instead.
 */

const SMALLEST_SHOWN_PERCENT = 0.1;

export function bells(value: number, locale: string): string {
  return Math.round(value).toLocaleString(locale);
}

export function percent(fraction: number): string {
  if (fraction <= 0) {
    return "0%";
  }
  const scaled = fraction * 100;
  if (scaled < SMALLEST_SHOWN_PERCENT) {
    return `<${SMALLEST_SHOWN_PERCENT}%`;
  }
  if (scaled >= 99.95 && fraction < 1) {
    return ">99.9%";
  }
  return `${scaled.toFixed(scaled >= 10 ? 1 : 2)}%`;
}

export function slotLabel(slot: number, dayNames: readonly string[], am: string, pm: string): string {
  const day = dayNames[Math.floor(slot / 2)] ?? "";
  return `${day} ${slot % 2 === 0 ? am : pm}`;
}

export function shortDayLabel(slot: number, dayShort: readonly string[]): string {
  return dayShort[Math.floor(slot / 2)] ?? "";
}

export function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}
