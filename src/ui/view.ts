/**
 * Everything below the chart: the decision, the pattern table and the list of
 * surviving scenarios.
 *
 * The scenario list is not decoration. When the data does not pin the week down
 * there is no single answer, and showing the survivors with their weights is
 * the only honest way to say so. It is collapsed rather than hidden, so the
 * count is always visible even when the detail is not.
 */

import { at } from "../model/array.ts";
import { RATE_SPIKE_PEAK } from "../model/constants.ts";
import { segmentLength } from "../model/scenario.ts";
import { PATTERNS } from "../model/types.ts";
import type { Scenario } from "../model/types.ts";
import type { Posterior } from "../infer/posterior.ts";
import type { Recommendation } from "../decide/stopping.ts";
import type { Strings } from "../i18n/strings.ts";
import { bells, fill, percent, slotLabel } from "./format.ts";

function shortLabel(slot: number, strings: Strings): string {
  return slotLabel(slot, strings.dayNames, strings.morning, strings.afternoon);
}

/** A short description of a scenario's shape, in the player's own vocabulary. */
export function describeScenario(scenario: Scenario, strings: Strings): string {
  let slot = 0;
  const falling: string[] = [];
  let peakSlot: number | null = null;

  for (const segment of scenario.segments) {
    const length = segmentLength(segment);
    if (segment.kind === "decay") {
      falling.push(
        length === 1
          ? shortLabel(slot, strings)
          : `${shortLabel(slot, strings)}-${shortLabel(slot + length - 1, strings)}`,
      );
    }
    if (segment.kind === "peak") {
      peakSlot = slot + 1;
    }
    if (segment.kind === "independent" && segment.rate === RATE_SPIKE_PEAK) {
      peakSlot = slot;
    }
    slot += length;
  }

  if (peakSlot !== null) {
    return fill(strings.scenarioPeakAt, { slot: shortLabel(peakSlot, strings) });
  }
  if (falling.length === 1 && falling[0] !== undefined && scenario.segments.length === 1) {
    return strings.scenarioAllWeek;
  }
  return fill(strings.scenarioFalls, { ranges: falling.join(", ") });
}

function statistic(label: string, value: string, note?: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "statistic";
  const term = document.createElement("span");
  term.className = "statistic-label";
  term.textContent = label;
  const figure = document.createElement("span");
  figure.className = "statistic-value";
  figure.textContent = value;
  wrapper.append(term, figure);
  if (note !== undefined) {
    const hint = document.createElement("span");
    hint.className = "statistic-note";
    hint.textContent = note;
    wrapper.append(hint);
  }
  return wrapper;
}

export function renderRecommendation(
  host: HTMLElement,
  recommendation: Recommendation | null,
  strings: Strings,
): void {
  host.replaceChildren();

  if (recommendation === null) {
    const message = document.createElement("p");
    message.className = "muted";
    message.textContent = strings.nothingEntered;
    host.append(message);
    return;
  }

  const verdict = document.createElement("p");
  verdict.className = "verdict";
  const detail = document.createElement("p");
  detail.className = "verdict-detail";

  if (recommendation.outlook.length === 0) {
    verdict.textContent = strings.sellNow;
    detail.textContent = strings.nothingLeft;
    host.append(verdict, detail);
    return;
  }

  if (recommendation.sellNowPrice === null) {
    verdict.textContent = strings.hold;
    detail.textContent = strings.nothingEntered;
  } else {
    const sell = recommendation.action === "sell";
    verdict.textContent = sell ? strings.sellNow : strings.hold;
    verdict.dataset["action"] = recommendation.action;
    detail.textContent = fill(sell ? strings.sellNowDetail : strings.holdDetail, {
      price: bells(recommendation.sellNowPrice),
    });
  }

  const figures = document.createElement("div");
  figures.className = "statistics";
  figures.append(
    statistic(
      strings.expectedIfWaiting,
      bells(recommendation.expectedBellsIfWaiting),
      `${strings.plusMinus}${bells(recommendation.expectedBellsStandardError)}`,
    ),
    statistic(strings.probabilityBetter, percent(recommendation.probabilityBetterByWaiting)),
    statistic(strings.downside, bells(recommendation.tenthPercentileIfWaiting)),
  );

  host.append(verdict, detail, figures);
}

export function renderPatterns(host: HTMLElement, posterior: Posterior, strings: Strings): void {
  host.replaceChildren();

  const table = document.createElement("table");
  table.className = "patterns";
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  for (const [label, className] of [
    [strings.patternColumn, "name"],
    [strings.probabilityColumn, "figure"],
    [strings.scenariosColumn, "figure"],
  ] as const) {
    const cell = document.createElement("th");
    cell.textContent = label;
    cell.className = className;
    headRow.append(cell);
  }
  head.append(headRow);

  const body = document.createElement("tbody");
  const ordered = [...PATTERNS].sort(
    (a, b) => at(posterior.patterns, b) - at(posterior.patterns, a),
  );
  for (const pattern of ordered) {
    const probability = at(posterior.patterns, pattern);
    const count = posterior.scenarios.filter(
      (entry) => entry.scenario.pattern === pattern && entry.probability > 0,
    ).length;

    const row = document.createElement("tr");
    if (probability === 0) {
      row.className = "eliminated";
    }

    const name = document.createElement("td");
    name.textContent = at(strings.patternNames, pattern);
    const bar = document.createElement("span");
    bar.className = "bar";
    bar.style.setProperty("--share", String(Math.max(0, Math.min(1, probability))));
    name.append(bar);

    const value = document.createElement("td");
    value.className = "figure";
    value.textContent = percent(probability);

    const scenarios = document.createElement("td");
    scenarios.className = "figure";
    scenarios.textContent = String(count);

    row.append(name, value, scenarios);
    body.append(row);
  }

  table.append(head, body);
  host.append(table);
}

export function renderScenarios(host: HTMLElement, posterior: Posterior, strings: Strings): void {
  host.replaceChildren();

  const surviving = posterior.scenarios.filter((entry) => entry.probability > 0);
  const total = surviving.length;

  for (const pattern of PATTERNS) {
    const entries = surviving
      .filter((entry) => entry.scenario.pattern === pattern)
      .sort((a, b) => b.probability - a.probability);
    if (entries.length === 0) {
      continue;
    }

    const group = document.createElement("details");
    group.className = "scenario-group";
    const summary = document.createElement("summary");
    const name = document.createElement("span");
    name.textContent = at(strings.patternNames, pattern);
    const count = document.createElement("span");
    count.className = "figure";
    count.textContent = fill(strings.scenarioCount, {
      count: String(entries.length),
      total: String(total),
    });
    summary.append(name, count);
    group.append(summary);

    const list = document.createElement("ul");
    for (const entry of entries) {
      const item = document.createElement("li");
      const shape = document.createElement("span");
      shape.textContent = describeScenario(entry.scenario, strings);
      const probability = document.createElement("span");
      probability.className = "figure";
      probability.textContent = percent(entry.probability);
      item.append(shape, probability);
      list.append(item);
    }
    group.append(list);
    host.append(group);
  }
}

export function renderInconsistent(host: HTMLElement, strings: Strings): void {
  host.replaceChildren();
  const heading = document.createElement("p");
  heading.className = "verdict";
  heading.dataset["action"] = "invalid";
  heading.textContent = strings.inconsistentHeading;
  const body = document.createElement("p");
  body.className = "verdict-detail";
  body.textContent = strings.inconsistentBody;
  host.append(heading, body);
}
