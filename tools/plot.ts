/**
 * The calibration plot, drawn from docs/calibration.json.
 *
 * Every point is a bin of that file. Nothing is smoothed, nothing is dropped,
 * and the error bars are the standard errors the run recorded, so a bin holding
 * twenty thousand claims is visibly less certain than one holding twenty
 * million. If the picture ever stops sitting on the diagonal, that is the
 * measurement talking and not the drawing.
 *
 * Run with: node tools/plot.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { at } from "../src/model/array.ts";

const INPUT = "docs/calibration.json";
const OUTPUT = "docs/img/calibration.svg";

const WIDTH = 660;
const HEIGHT = 380;
const MARGIN_LEFT = 54;
const MARGIN_RIGHT = 16;
const MARGIN_TOP = 34;
const MARGIN_BOTTOM = 48;

const SURFACE = "#101316";
const GRID = "#262c32";
const TEXT = "#949ea8";
const TEXT_STRONG = "#e6eaee";
const ACCENT = "#5fd08a";
const SECOND = "#8fa6c4";

/** Bars are drawn at this many standard errors, the interval quoted in the doc. */
const ERROR_BAR_SIGMA = 2;

interface Bin {
  readonly count: number;
  readonly meanPredicted: number;
  readonly observedFrequency: number;
  readonly standardError: number;
}

interface Summary {
  readonly depth: number;
  readonly bins: readonly Bin[];
}

interface Report {
  readonly weeks: number;
  readonly previousPatternKnown: readonly Summary[];
  readonly previousPatternUnknown: readonly Summary[];
}

function pool(summaries: readonly Summary[]): readonly Bin[] {
  const first = summaries[0];
  if (first === undefined) {
    return [];
  }
  const pooled: Bin[] = [];
  for (let index = 0; index < first.bins.length; index += 1) {
    let count = 0;
    let predicted = 0;
    let observed = 0;
    for (const summary of summaries) {
      const bin = at(summary.bins, index);
      count += bin.count;
      predicted += bin.meanPredicted * bin.count;
      observed += bin.observedFrequency * bin.count;
    }
    const frequency = count === 0 ? 0 : observed / count;
    pooled.push({
      count,
      meanPredicted: count === 0 ? 0 : predicted / count,
      observedFrequency: frequency,
      standardError: count === 0 ? 0 : Math.sqrt((frequency * (1 - frequency)) / count),
    });
  }
  return pooled;
}

function x(value: number): number {
  return MARGIN_LEFT + value * (WIDTH - MARGIN_LEFT - MARGIN_RIGHT);
}

function y(value: number): number {
  return HEIGHT - MARGIN_BOTTOM - value * (HEIGHT - MARGIN_TOP - MARGIN_BOTTOM);
}

function series(bins: readonly Bin[], colour: string, radius: number): string {
  const parts: string[] = [];
  for (const bin of bins) {
    if (bin.count === 0) {
      continue;
    }
    const cx = x(bin.meanPredicted);
    const low = y(Math.max(0, bin.observedFrequency - ERROR_BAR_SIGMA * bin.standardError));
    const high = y(Math.min(1, bin.observedFrequency + ERROR_BAR_SIGMA * bin.standardError));
    parts.push(
      `<line x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${low.toFixed(1)}" ` +
        `y2="${high.toFixed(1)}" stroke="${colour}" stroke-width="1"/>`,
    );
    parts.push(
      `<circle cx="${cx.toFixed(1)}" cy="${y(bin.observedFrequency).toFixed(1)}" ` +
        `r="${radius}" fill="${colour}"/>`,
    );
  }
  return parts.join("");
}

function legendEntry(label: string, colour: string, offset: number): string {
  const cx = MARGIN_LEFT + 8;
  const cy = MARGIN_TOP + 10 + offset;
  return (
    `<circle cx="${cx}" cy="${cy}" r="3.4" fill="${colour}"/>` +
    `<text x="${cx + 10}" y="${cy + 4}" fill="${TEXT}" font-size="12">${label}</text>`
  );
}

function run(): void {
  const report = JSON.parse(readFileSync(INPUT, "utf8")) as Report;
  const known = pool(report.previousPatternKnown);
  const unknown = pool(report.previousPatternUnknown);

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const grid = ticks
    .map((tick) => {
      const gx = x(tick);
      const gy = y(tick);
      return (
        `<line x1="${gx.toFixed(1)}" x2="${gx.toFixed(1)}" y1="${y(0)}" y2="${y(1)}" ` +
        `stroke="${GRID}" stroke-width="1"/>` +
        `<line x1="${x(0)}" x2="${x(1)}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" ` +
        `stroke="${GRID}" stroke-width="1"/>` +
        `<text x="${gx.toFixed(1)}" y="${HEIGHT - MARGIN_BOTTOM + 18}" fill="${TEXT}" ` +
        `font-size="12" text-anchor="middle">${(tick * 100).toFixed(0)}%</text>` +
        `<text x="${MARGIN_LEFT - 8}" y="${(gy + 4).toFixed(1)}" fill="${TEXT}" ` +
        `font-size="12" text-anchor="end">${(tick * 100).toFixed(0)}%</text>`
      );
    })
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" ` +
    `width="${WIDTH}" height="${HEIGHT}" role="img" ` +
    `aria-label="Calibration of kabucast over ${report.weeks} simulated weeks">` +
    `<rect width="${WIDTH}" height="${HEIGHT}" fill="${SURFACE}"/>` +
    `<text x="${MARGIN_LEFT}" y="20" fill="${TEXT_STRONG}" font-size="13" font-weight="600">` +
    `Claimed probability against observed frequency, ${report.weeks.toLocaleString("en-US")} weeks</text>` +
    grid +
    `<line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="${TEXT}" ` +
    `stroke-width="1" stroke-dasharray="4 4"/>` +
    series(unknown, SECOND, 2.6) +
    series(known, ACCENT, 2.6) +
    legendEntry("last week known", ACCENT, 0) +
    legendEntry("last week unknown", SECOND, 18) +
    `<text x="${x(0.5).toFixed(1)}" y="${HEIGHT - 10}" fill="${TEXT}" font-size="12" ` +
    `text-anchor="middle">claimed probability</text>` +
    `<text x="14" y="${y(0.5).toFixed(1)}" fill="${TEXT}" font-size="12" text-anchor="middle" ` +
    `transform="rotate(-90 14 ${y(0.5).toFixed(1)})">observed frequency</text>` +
    `</svg>\n`;

  mkdirSync("docs/img", { recursive: true });
  writeFileSync(OUTPUT, svg);
  process.stdout.write(`wrote ${OUTPUT} from ${report.weeks} weeks\n`);
}

run();
