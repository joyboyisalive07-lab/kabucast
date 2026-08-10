/**
 * Wiring. Reads the input panel, recomputes, and hands the result to the chart
 * and the view.
 *
 * Recomputes are coalesced into a timer so that holding a key down cannot queue
 * a backlog of them, and every section keeps its box whether or not it has
 * content, so nothing below the chart jumps while a number is being typed.
 */

import { at } from "../model/array.ts";
import { SELLING_SLOT_COUNT } from "../model/constants.ts";
import { priceBoundsPerSlot } from "../infer/bounds.ts";
import { computePosterior } from "../infer/posterior.ts";
import type { Observations } from "../infer/likelihood.ts";
import { recommend } from "../decide/stopping.ts";
import type { Recommendation } from "../decide/stopping.ts";
import { LANGUAGES, detectLanguage, rememberLanguage, stringsFor } from "../i18n/index.ts";
import type { LanguageCode } from "../i18n/index.ts";
import type { Strings } from "../i18n/strings.ts";
import { Chart } from "./chart.ts";
import type { ChartData } from "./chart.ts";
import { InputPanel } from "./input.ts";
import type { InputState } from "./input.ts";
import { decodeState, encodeState } from "./permalink.ts";
import { renderInconsistent, renderPatterns, renderRecommendation, renderScenarios } from "./view.ts";

const COPIED_FEEDBACK_MS = 1600;

function element(id: string): HTMLElement {
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
  private strings: Strings;
  private language: LanguageCode;
  private readonly chart: Chart;
  private readonly panel: InputPanel;
  private frame: ReturnType<typeof setTimeout> | 0 = 0;
  private copiedTimer: ReturnType<typeof setTimeout> | 0 = 0;

  private readonly chartSection = element("chart-section");
  private readonly decisionHost = element("decision");
  private readonly patternHost = element("patterns");
  private readonly scenarioHost = element("scenarios");
  private readonly scenarioSection = element("scenarios-section");
  private readonly patternSection = element("patterns-section");
  private readonly languageSelect = element("language") as HTMLSelectElement;
  private readonly copyButton = element("copy-link") as HTMLButtonElement;

  constructor() {
    this.language = detectLanguage();
    this.strings = stringsFor(this.language);
    this.chart = new Chart(element("chart"), element("readout"), this.strings);
    this.panel = new InputPanel(element("inputs"), this.strings, () => this.schedule());

    this.buildLanguageSelect();
    this.copyButton.addEventListener("click", () => {
      void this.copyPermalink();
    });
    window.addEventListener("hashchange", () => this.applyHash());

    this.applyStaticStrings();
    this.applyHash();
  }

  private buildLanguageSelect(): void {
    this.languageSelect.replaceChildren();
    for (const [code, strings] of LANGUAGES) {
      const option = document.createElement("option");
      option.value = code;
      option.textContent = strings.languageName;
      this.languageSelect.append(option);
    }
    this.languageSelect.value = this.language;
    this.languageSelect.addEventListener("change", () => {
      const chosen = this.languageSelect.value as LanguageCode;
      this.language = chosen;
      this.strings = stringsFor(chosen);
      rememberLanguage(chosen);
      document.documentElement.lang = chosen;
      this.panel.setStrings(this.strings);
      this.chart.setStrings(this.strings);
      this.applyStaticStrings();
      this.recompute();
    });
  }

  private applyStaticStrings(): void {
    document.documentElement.lang = this.language;
    element("tagline").textContent = this.strings.tagline;
    element("chart-heading").textContent = this.strings.chartHeading;
    element("axis-note").textContent = this.strings.axisNote;
    element("decision-heading").textContent = this.strings.recommendationHeading;
    element("patterns-heading").textContent = this.strings.patternsHeading;
    element("scenarios-heading").textContent = this.strings.scenariosHeading;
    element("scenarios-hint").textContent = this.strings.scenariosHint;
    element("language-label").textContent = this.strings.languageLabel;
    this.languageSelect.setAttribute("aria-label", this.strings.languageLabel);
    this.copyButton.textContent = this.strings.copyLink;

    const legend = element("legend");
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

  private applyHash(): void {
    const encoded = window.location.hash.replace(/^#/, "");
    if (encoded !== "" && encoded !== encodeState(this.panel.read())) {
      this.panel.write(decodeState(encoded));
    }
    this.recompute();
  }

  private async copyPermalink(): Promise<void> {
    const url = `${window.location.origin}${window.location.pathname}#${encodeState(this.panel.read())}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard access can be refused; the address bar already holds the link.
    }
    this.copyButton.textContent = this.strings.copied;
    if (this.copiedTimer !== 0) {
      clearTimeout(this.copiedTimer);
    }
    this.copiedTimer = setTimeout(() => {
      this.copyButton.textContent = this.strings.copyLink;
      this.copiedTimer = 0;
    }, COPIED_FEEDBACK_MS);
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

    const encoded = encodeState(state);
    const target = encoded === "" ? window.location.pathname : `#${encoded}`;
    if (window.location.hash.replace(/^#/, "") !== encoded) {
      window.history.replaceState(null, "", target);
    }

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

    this.chart.update(
      buildChartData(
        state,
        bounds.map((bound) => bound.min),
        bounds.map((bound) => bound.max),
        recommendation,
      ),
    );
    renderRecommendation(this.decisionHost, recommendation, this.strings);
    renderPatterns(this.patternHost, posterior, this.strings);
    renderScenarios(this.scenarioHost, posterior, this.strings);
  }
}

new Application();

// The offline single file runs from the filesystem, where there is no origin to
// register against and nothing to fetch.
if ((location.protocol === "https:" || location.protocol === "http:") && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("./service-worker.js").catch(() => undefined);
  });
}
