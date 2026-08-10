/**
 * Wiring. Reads the input panel, recomputes, and hands the result to the chart
 * and the view.
 *
 * Recomputes are coalesced into an animation frame so that holding a key down
 * cannot queue a backlog of them, and every section keeps its box whether or
 * not it has content, so nothing below the chart jumps while a number is being
 * typed.
 */

import { at } from "../model/array.ts";
import { SELLING_SLOT_COUNT } from "../model/constants.ts";
import { priceBoundsPerSlot } from "../infer/bounds.ts";
import { computePosterior } from "../infer/posterior.ts";
import type { Observations } from "../infer/likelihood.ts";
import { recommend } from "../decide/stopping.ts";
import type { Recommendation } from "../decide/stopping.ts";
import { EN } from "../i18n/strings.ts";
import type { Strings } from "../i18n/strings.ts";
import { Chart } from "./chart.ts";
import type { ChartData } from "./chart.ts";
import { InputPanel } from "./input.ts";
import type { InputState } from "./input.ts";
import { renderInconsistent, renderPatterns, renderRecommendation, renderScenarios } from "./view.ts";

function require(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (node === null) {
    throw new Error(`missing element: ${id}`);
  }
  return node;
}

function lastObservedSlot(observations: Observations): number {
  let last = -1;
  for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
    if (at(observations, slot) !== null) {
      last = slot;
    }
  }
  return last;
}

function buildChartData(
  state: InputState,
  minimum: readonly number[],
  maximum: readonly number[],
  recommendation: Recommendation | null,
): ChartData {
  const band: (readonly number[] | null)[] = new Array<readonly number[] | null>(
    SELLING_SLOT_COUNT,
  ).fill(null);

  // The fan grows out of the last recorded price, where the distribution is a
  // point mass, so the shape reads as one object rather than two.
  const anchor = lastObservedSlot(state.prices);
  if (anchor >= 0) {
    const price = at(state.prices, anchor);
    if (price !== null) {
      band[anchor] = [price, price, price, price, price];
    }
  }

  let peakSlot: number | null = null;
  let peakProbability = -1;
  if (recommendation !== null) {
    for (const slot of recommendation.outlook) {
      band[slot.slot] = slot.band;
      if (slot.probabilityWeekMaximum > peakProbability) {
        peakProbability = slot.probabilityWeekMaximum;
        peakSlot = slot.slot;
      }
    }
  }

  return {
    minimum,
    maximum,
    band,
    observed: state.prices,
    peakSlot,
    basePrice: state.basePrice,
  };
}

class Application {
  private readonly chart: Chart;
  private readonly panel: InputPanel;
  private frame: ReturnType<typeof setTimeout> | 0 = 0;

  private readonly chartSection = require("chart-section");
  private readonly decisionHost = require("decision");
  private readonly patternHost = require("patterns");
  private readonly scenarioHost = require("scenarios");
  private readonly scenarioSection = require("scenarios-section");
  private readonly patternSection = require("patterns-section");

  private readonly strings: Strings;

  constructor(strings: Strings) {
    this.strings = strings;
    this.chart = new Chart(require("chart"), require("readout"), strings);
    this.panel = new InputPanel(require("inputs"), strings, () => this.schedule());
    this.applyStaticStrings();
    this.recompute();
  }

  private applyStaticStrings(): void {
    require("tagline").textContent = this.strings.tagline;
    require("chart-heading").textContent = this.strings.chartHeading;
    require("axis-note").textContent = this.strings.axisNote;
    require("decision-heading").textContent = this.strings.recommendationHeading;
    require("patterns-heading").textContent = this.strings.patternsHeading;
    require("scenarios-heading").textContent = this.strings.scenariosHeading;
    require("scenarios-hint").textContent = this.strings.scenariosHint;

    const legend = require("legend");
    legend.replaceChildren();
    for (const [key, className] of [
      [this.strings.legendBand90, "swatch-90"],
      [this.strings.legendBand50, "swatch-50"],
      [this.strings.legendMedian, "swatch-median"],
      [this.strings.legendMinimum, "swatch-min"],
      [this.strings.legendMaximum, "swatch-max"],
      [this.strings.legendObserved, "swatch-observed"],
      [this.strings.legendPeak, "swatch-peak"],
    ] as const) {
      const item = document.createElement("li");
      const swatch = document.createElement("span");
      swatch.className = `swatch ${className}`;
      const label = document.createElement("span");
      label.textContent = key;
      item.append(swatch, label);
      legend.append(item);
    }
  }

  /**
   * Coalesced with a timer rather than an animation frame. A frame callback
   * does not run while the page is not compositing, so a recompute queued on
   * one can be dropped entirely in a background tab; a timer cannot.
   */
  private schedule(): void {
    if (this.frame !== 0) {
      return;
    }
    this.frame = setTimeout(() => {
      this.frame = 0;
      this.recompute();
    }, 0);
  }

  private recompute(): void {
    const state = this.panel.read();
    const posterior = computePosterior({
      basePrice: state.basePrice,
      observations: state.prices,
      previousPattern: state.previousPattern,
      firstBuy: state.firstBuy,
    });

    if (posterior === null) {
      this.chartSection.hidden = true;
      this.patternSection.hidden = true;
      this.scenarioSection.hidden = true;
      renderInconsistent(this.decisionHost, this.strings);
      return;
    }

    this.chartSection.hidden = false;
    this.patternSection.hidden = false;
    this.scenarioSection.hidden = false;

    const recommendation = recommend(posterior, state.prices);
    const bounds = priceBoundsPerSlot(posterior, state.prices);
    const minimum = bounds.map((bound) => bound.min);
    const maximum = bounds.map((bound) => bound.max);

    this.chart.update(buildChartData(state, minimum, maximum, recommendation));
    renderRecommendation(this.decisionHost, recommendation, this.strings);
    renderPatterns(this.patternHost, posterior, this.strings);
    renderScenarios(this.scenarioHost, posterior, this.strings);
  }
}

new Application(EN);
