/**
 * The fan chart, drawn by hand.
 *
 * Three things rule out a charting library here. The bands are a posterior
 * predictive rather than a series, so the shape has to grow out of the last
 * recorded price rather than start at the axis. The vertical scale has to be
 * logarithmic, because a week where a spike is still possible spans forty to
 * six hundred bells and a linear axis would flatten everything a player
 * actually reads. And the transition between recomputes has to move the same
 * shape rather than replace it, which means interpolating the geometry, not
 * cross-fading two pictures.
 *
 * The viewBox is set to the element's pixel size rather than a fixed grid, so
 * one unit is one pixel and the type is the size it claims to be at 380 pixels
 * wide as well as at 1200.
 */

import { at } from "../model/array.ts";
import { SELLING_SLOT_COUNT } from "../model/constants.ts";
import type { Strings } from "../i18n/strings.ts";
import { bells, fill, shortDayLabel, slotLabel } from "./format.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

const MARGIN_LEFT = 40;
const MARGIN_RIGHT = 10;
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 26;

/*
 * On a phone the horizontal margins are the difference between half-days you
 * can hit with a thumb and half-days you cannot. Twelve slots across a 375px
 * screen leave about 27px each once the axis gutter is cut to what the widest
 * tick actually needs -- three monospaced digits at 11px, plus the 6px the
 * label already stands off by. At the wide setting the gutter is generous
 * because there is room to be generous.
 */
const NARROW_WIDTH = 420;
const MARGIN_LEFT_NARROW = 32;
const MARGIN_RIGHT_NARROW = 6;

/* Only a floor against degenerate geometry before the first layout. Above it
 * the viewBox tracks the real element width, so one unit stays one pixel and
 * the type is the size it claims to be instead of being scaled to fit. */
const MIN_WIDTH = 240;

const TRANSITION_MS = 220;
const SETTLE_GRACE_MS = 80;

/** Ticks are chosen from these, keeping the ones the current scale contains. */
const TICK_CANDIDATES = [10, 20, 30, 50, 70, 100, 150, 200, 300, 400, 600, 900];
const MIN_TICKS = 3;

const BAND_LOW = 0;
const BAND_LOW_MID = 1;
const BAND_MID = 2;
const BAND_HIGH_MID = 3;
const BAND_HIGH = 4;

export interface ChartData {
  /** Lowest and highest price each slot can still take. */
  readonly minimum: readonly number[];
  readonly maximum: readonly number[];
  /** Five percentiles per slot, or null where the slot is already past. */
  readonly band: readonly (readonly number[] | null)[];
  readonly observed: readonly (number | null)[];
  readonly peakSlot: number | null;
  readonly basePrice: number | null;
}

function element<K extends keyof SVGElementTagNameMap>(
  name: K,
  attributes: Readonly<Record<string, string>>,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    node.setAttribute(key, value);
  }
  return node;
}

function emptyFrame(): number[] {
  return new Array<number>(SELLING_SLOT_COUNT).fill(1);
}

interface Frame {
  readonly minimum: number[];
  readonly maximum: number[];
  readonly low: number[];
  readonly lowMid: number[];
  readonly mid: number[];
  readonly highMid: number[];
  readonly high: number[];
  /** Index of the first slot the bands cover; earlier slots are drawn flat. */
  bandStart: number;
}

function newFrame(): Frame {
  return {
    minimum: emptyFrame(),
    maximum: emptyFrame(),
    low: emptyFrame(),
    lowMid: emptyFrame(),
    mid: emptyFrame(),
    highMid: emptyFrame(),
    high: emptyFrame(),
    bandStart: 0,
  };
}

function copyInto(target: Frame, source: Frame): void {
  for (const key of ["minimum", "maximum", "low", "lowMid", "mid", "highMid", "high"] as const) {
    const to = target[key];
    const from = source[key];
    for (let i = 0; i < to.length; i += 1) {
      to[i] = at(from, i);
    }
  }
  target.bandStart = source.bandStart;
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export class Chart {
  private readonly svg: SVGSVGElement;
  private readonly gridGroup: SVGGElement;
  private readonly band90: SVGPathElement;
  private readonly band50: SVGPathElement;
  private readonly medianLine: SVGPathElement;
  private readonly minimumLine: SVGPathElement;
  private readonly maximumLine: SVGPathElement;
  private readonly baseLine: SVGLineElement;
  private readonly peakMark: SVGGElement;
  private readonly markerGroup: SVGGElement;
  private readonly cursor: SVGLineElement;
  private readonly labelGroup: SVGGElement;

  private width = 720;
  private height = 320;
  private marginLeft = MARGIN_LEFT;
  private marginRight = MARGIN_RIGHT;
  private scaleLo = 20;
  private scaleHi = 200;

  private readonly shown: Frame = newFrame();
  private readonly from: Frame = newFrame();
  private readonly to: Frame = newFrame();
  private animation = 0;
  private animationStart = 0;
  private settleTimer: ReturnType<typeof setTimeout> | 0 = 0;

  private data: ChartData | null = null;
  private hovered: number | null = null;
  private staticKey = "";

  private readonly host: HTMLElement;
  private readonly readout: HTMLElement;
  private strings: Strings;

  constructor(host: HTMLElement, readout: HTMLElement, strings: Strings) {
    this.host = host;
    this.readout = readout;
    this.strings = strings;
    // Focusable, because every exact number the chart holds is reachable only
    // through the cursor. A pointer is not the only way anyone reads this.
    this.svg = element("svg", {
      viewBox: "0 0 720 320",
      role: "img",
      tabindex: "0",
      preserveAspectRatio: "xMidYMid meet",
    });
    this.gridGroup = element("g", { class: "grid" });
    this.band90 = element("path", { class: "band band-90" });
    this.band50 = element("path", { class: "band band-50" });
    this.minimumLine = element("path", { class: "edge edge-min" });
    this.maximumLine = element("path", { class: "edge edge-max" });
    this.medianLine = element("path", { class: "median" });
    this.baseLine = element("line", { class: "base-line" });
    this.peakMark = element("g", { class: "peak" });
    this.markerGroup = element("g", { class: "markers" });
    this.cursor = element("line", { class: "cursor", "stroke-width": "1" });
    this.labelGroup = element("g", { class: "labels" });

    this.svg.append(
      this.gridGroup,
      this.baseLine,
      this.band90,
      this.band50,
      this.maximumLine,
      this.minimumLine,
      this.medianLine,
      this.peakMark,
      this.cursor,
      this.markerGroup,
      this.labelGroup,
    );
    this.host.append(this.svg);
    this.readout.textContent = this.strings.readoutEmpty;

    this.svg.addEventListener("pointermove", (event) => this.onPointer(event));
    this.svg.addEventListener("pointerdown", (event) => this.onPointer(event));
    this.svg.addEventListener("pointerleave", () => {
      this.hovered = null;
      this.drawCursor();
    });
    this.svg.addEventListener("keydown", (event) => this.onKey(event));

    const observer = new ResizeObserver(() => this.measure());
    observer.observe(this.host);
    this.measure();
  }

  setStrings(strings: Strings): void {
    this.strings = strings;
    this.readout.textContent =
      this.hovered === null ? strings.readoutEmpty : this.readout.textContent;
    this.drawStatic();
    this.drawCursor();
    this.describe();
  }

  /**
   * The chart's accessible name. A reader who cannot see the fan still gets the
   * shape of the week from it: how much is known, what the unknown half-days
   * can still do, and where the peak is likeliest. The per-slot numbers arrive
   * through the readout, which is a live region.
   */
  private describe(): void {
    const strings = this.strings;
    const data = this.data;
    if (data === null) {
      this.svg.setAttribute("aria-label", strings.chartHeading);
      return;
    }

    let recorded = 0;
    let low = Infinity;
    let high = 0;
    for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
      if (at(data.observed, slot) !== null) {
        recorded += 1;
        continue;
      }
      low = Math.min(low, at(data.minimum, slot));
      high = Math.max(high, at(data.maximum, slot));
    }

    // The section's own heading sits directly above the chart and is already
    // announced, so the name starts at the summary rather than repeating it.
    const parts: string[] = [];
    if (high === 0) {
      parts.push(strings.nothingLeft);
    } else {
      parts.push(
        fill(strings.chartSummary, {
          recorded: String(recorded),
          total: String(SELLING_SLOT_COUNT),
          low: bells(low, strings.locale),
          high: bells(high, strings.locale),
        }),
      );
      if (data.peakSlot !== null) {
        const label = slotLabel(data.peakSlot, strings.dayNames, strings.morning, strings.afternoon);
        parts.push(fill(strings.chartPeak, { slot: label }));
      }
      parts.push(strings.chartKeyboardHint);
    }
    this.svg.setAttribute("aria-label", parts.join(" "));
  }

  /** The slot a keyboard reader starts from: the most recent thing they typed. */
  private startSlot(): number {
    const data = this.data;
    if (data !== null) {
      for (let slot = SELLING_SLOT_COUNT - 1; slot >= 0; slot -= 1) {
        if (at(data.observed, slot) !== null) {
          return slot;
        }
      }
    }
    return 0;
  }

  private onKey(event: KeyboardEvent): void {
    if (this.data === null) {
      return;
    }
    const last = SELLING_SLOT_COUNT - 1;
    const current = this.hovered;
    let next: number | null;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = current === null ? this.startSlot() : Math.min(last, current + 1);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = current === null ? this.startSlot() : Math.max(0, current - 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      case "Escape":
        next = null;
        break;
      default:
        return;
    }
    // Only after a key we actually handle, so the page still scrolls when the
    // chart has focus and the reader presses something else.
    event.preventDefault();
    this.hovered = next;
    this.drawCursor();
  }

  private measure(): void {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(MIN_WIDTH, Math.round(rect.width));
    const height = Math.round(Math.min(340, Math.max(220, width * 0.52)));
    if (width === this.width && height === this.height) {
      return;
    }
    this.width = width;
    this.height = height;
    this.marginLeft = width < NARROW_WIDTH ? MARGIN_LEFT_NARROW : MARGIN_LEFT;
    this.marginRight = width < NARROW_WIDTH ? MARGIN_RIGHT_NARROW : MARGIN_RIGHT;
    this.svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    this.svg.setAttribute("height", String(height));
    this.drawStatic();
    this.render();
    // The markers and the peak line carry absolute coordinates, so they have to
    // be laid out again here. Leaving them out left them at their old positions
    // after a resize, which put the recorded prices somewhere they never were.
    this.drawMarkers();
    this.drawCursor();
  }

  private x(slot: number): number {
    const span = this.width - this.marginLeft - this.marginRight;
    return this.marginLeft + (span * slot) / (SELLING_SLOT_COUNT - 1);
  }

  private y(price: number): number {
    const span = this.height - MARGIN_TOP - MARGIN_BOTTOM;
    const lo = Math.log(this.scaleLo);
    const hi = Math.log(this.scaleHi);
    const value = Math.log(Math.max(price, 1));
    const fraction = (value - lo) / (hi - lo);
    return MARGIN_TOP + span * (1 - Math.min(1, Math.max(0, fraction)));
  }

  private line(values: readonly number[], fromSlot = 0): string {
    const parts: string[] = [];
    for (let slot = fromSlot; slot < SELLING_SLOT_COUNT; slot += 1) {
      parts.push(`${slot === fromSlot ? "M" : "L"}${this.x(slot).toFixed(2)} ${this.y(at(values, slot)).toFixed(2)}`);
    }
    return parts.join(" ");
  }

  private area(lower: readonly number[], upper: readonly number[], fromSlot: number): string {
    const parts: string[] = [];
    for (let slot = fromSlot; slot < SELLING_SLOT_COUNT; slot += 1) {
      parts.push(`${slot === fromSlot ? "M" : "L"}${this.x(slot).toFixed(2)} ${this.y(at(upper, slot)).toFixed(2)}`);
    }
    for (let slot = SELLING_SLOT_COUNT - 1; slot >= fromSlot; slot -= 1) {
      parts.push(`L${this.x(slot).toFixed(2)} ${this.y(at(lower, slot)).toFixed(2)}`);
    }
    parts.push("Z");
    return parts.join(" ");
  }

  /**
   * The axis only changes when the scale, the size or the language changes, and
   * none of those happen on a keystroke. Rebuilding eighteen text nodes for
   * every digit typed was work nobody could see.
   */
  private drawStatic(): void {
    const key = `${this.width}x${this.height}:${this.scaleLo}-${this.scaleHi}:${this.strings.locale}`;
    if (key === this.staticKey) {
      return;
    }
    this.staticKey = key;

    this.gridGroup.replaceChildren();
    this.labelGroup.replaceChildren();

    const ticks = TICK_CANDIDATES.filter((tick) => tick >= this.scaleLo && tick <= this.scaleHi);
    const chosen = ticks.length >= MIN_TICKS ? ticks : [this.scaleLo, this.scaleHi];
    for (const tick of chosen) {
      const y = this.y(tick);
      this.gridGroup.append(
        element("line", {
          x1: String(this.marginLeft),
          x2: String(this.width - this.marginRight),
          y1: y.toFixed(2),
          y2: y.toFixed(2),
        }),
      );
      const label = element("text", {
        x: String(this.marginLeft - 6),
        y: (y + 4).toFixed(2),
        "text-anchor": "end",
        class: "tick",
      });
      label.textContent = String(tick);
      this.labelGroup.append(label);
    }

    for (let day = 0; day < this.strings.dayNames.length; day += 1) {
      const slot = day * 2;
      const label = element("text", {
        x: this.x(slot).toFixed(2),
        y: String(this.height - 8),
        "text-anchor": "middle",
        class: "day-tick",
      });
      label.textContent = shortDayLabel(slot, this.strings.dayShort);
      this.labelGroup.append(label);
    }
  }

  update(data: ChartData): void {
    // Measured here rather than only from the resize observer: an observer is
    // delivered during rendering, so a chart built before its container has
    // been laid out would keep a stale viewBox until the next repaint, and the
    // type would be scaled to a size it never asked for.
    this.measure();
    this.data = data;

    let lowest = Infinity;
    let highest = 0;
    for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
      lowest = Math.min(lowest, at(data.minimum, slot));
      highest = Math.max(highest, at(data.maximum, slot));
    }
    if (data.basePrice !== null) {
      lowest = Math.min(lowest, data.basePrice);
      highest = Math.max(highest, data.basePrice);
    }
    this.scaleLo = Math.max(1, Math.floor(lowest * 0.85));
    this.scaleHi = Math.max(this.scaleLo * 2, Math.ceil(highest * 1.1));

    let bandStart = SELLING_SLOT_COUNT;
    for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
      if (at(data.band, slot) !== null) {
        bandStart = slot;
        break;
      }
    }

    const target = this.to;
    target.bandStart = bandStart;
    for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
      target.minimum[slot] = at(data.minimum, slot);
      target.maximum[slot] = at(data.maximum, slot);
      const band = at(data.band, slot);
      const fallback = at(data.minimum, slot);
      target.low[slot] = band === null ? fallback : at(band, BAND_LOW);
      target.lowMid[slot] = band === null ? fallback : at(band, BAND_LOW_MID);
      target.mid[slot] = band === null ? fallback : at(band, BAND_MID);
      target.highMid[slot] = band === null ? fallback : at(band, BAND_HIGH_MID);
      target.high[slot] = band === null ? fallback : at(band, BAND_HIGH);
    }

    copyInto(this.from, this.shown);
    this.drawStatic();
    this.startAnimation();
    this.drawMarkers();
    this.drawCursor();
    this.describe();
  }

  private settle(): void {
    if (this.animation !== 0) {
      cancelAnimationFrame(this.animation);
      this.animation = 0;
    }
    if (this.settleTimer !== 0) {
      clearTimeout(this.settleTimer);
      this.settleTimer = 0;
    }
    copyInto(this.shown, this.to);
    this.render();
  }

  /**
   * Animation frames do not run while the page is not compositing, so the
   * transition is backed by a timer that snaps to the final geometry. Without
   * it a chart in a background tab would keep showing the previous week.
   */
  private startAnimation(): void {
    if (this.animation !== 0) {
      cancelAnimationFrame(this.animation);
      this.animation = 0;
    }
    if (this.settleTimer !== 0) {
      clearTimeout(this.settleTimer);
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.settle();
      return;
    }

    this.settleTimer = setTimeout(() => this.settle(), TRANSITION_MS + SETTLE_GRACE_MS);
    this.animationStart = performance.now();
    const step = (now: number): void => {
      const elapsed = now - this.animationStart;
      const t = Math.min(1, elapsed / TRANSITION_MS);
      const eased = easeOut(t);
      for (const key of ["minimum", "maximum", "low", "lowMid", "mid", "highMid", "high"] as const) {
        const shown = this.shown[key];
        const from = this.from[key];
        const to = this.to[key];
        for (let i = 0; i < shown.length; i += 1) {
          shown[i] = at(from, i) + (at(to, i) - at(from, i)) * eased;
        }
      }
      this.shown.bandStart = this.to.bandStart;
      this.render();
      if (t < 1) {
        this.animation = requestAnimationFrame(step);
      } else {
        this.animation = 0;
        if (this.settleTimer !== 0) {
          clearTimeout(this.settleTimer);
          this.settleTimer = 0;
        }
      }
    };
    this.animation = requestAnimationFrame(step);
  }

  private render(): void {
    const start = Math.max(0, Math.min(this.shown.bandStart, SELLING_SLOT_COUNT - 1));
    this.band90.setAttribute("d", this.area(this.shown.low, this.shown.high, start));
    this.band50.setAttribute("d", this.area(this.shown.lowMid, this.shown.highMid, start));
    this.medianLine.setAttribute("d", this.line(this.shown.mid, start));
    this.minimumLine.setAttribute("d", this.line(this.shown.minimum));
    this.maximumLine.setAttribute("d", this.line(this.shown.maximum));

    const data = this.data;
    if (data?.basePrice != null) {
      const y = this.y(data.basePrice);
      this.baseLine.setAttribute("x1", String(this.marginLeft));
      this.baseLine.setAttribute("x2", String(this.width - this.marginRight));
      this.baseLine.setAttribute("y1", y.toFixed(2));
      this.baseLine.setAttribute("y2", y.toFixed(2));
      this.baseLine.removeAttribute("hidden");
    } else {
      this.baseLine.setAttribute("hidden", "hidden");
    }
  }

  private drawMarkers(): void {
    const data = this.data;
    this.markerGroup.replaceChildren();
    this.peakMark.replaceChildren();
    if (data === null) {
      return;
    }

    for (let slot = 0; slot < SELLING_SLOT_COUNT; slot += 1) {
      const price = at(data.observed, slot);
      if (price === null) {
        continue;
      }
      this.markerGroup.append(
        element("circle", {
          cx: this.x(slot).toFixed(2),
          cy: this.y(price).toFixed(2),
          r: "3.5",
        }),
      );
    }

    if (data.peakSlot !== null) {
      const x = this.x(data.peakSlot);
      this.peakMark.append(
        element("line", {
          x1: x.toFixed(2),
          x2: x.toFixed(2),
          y1: String(MARGIN_TOP),
          y2: String(this.height - MARGIN_BOTTOM),
        }),
      );
    }
  }

  private onPointer(event: PointerEvent): void {
    const rect = this.svg.getBoundingClientRect();
    if (rect.width === 0) {
      return;
    }
    const x = ((event.clientX - rect.left) / rect.width) * this.width;
    const span = this.width - this.marginLeft - this.marginRight;
    const raw = ((x - this.marginLeft) / span) * (SELLING_SLOT_COUNT - 1);
    this.hovered = Math.min(SELLING_SLOT_COUNT - 1, Math.max(0, Math.round(raw)));
    this.drawCursor();
  }

  private drawCursor(): void {
    const slot = this.hovered;
    const data = this.data;
    if (slot === null || data === null) {
      this.cursor.setAttribute("hidden", "hidden");
      this.readout.textContent = this.strings.readoutEmpty;
      return;
    }

    const x = this.x(slot);
    this.cursor.setAttribute("x1", x.toFixed(2));
    this.cursor.setAttribute("x2", x.toFixed(2));
    this.cursor.setAttribute("y1", String(MARGIN_TOP));
    this.cursor.setAttribute("y2", String(this.height - MARGIN_BOTTOM));
    this.cursor.removeAttribute("hidden");

    const label = slotLabel(slot, this.strings.dayNames, this.strings.morning, this.strings.afternoon);
    const observed = at(data.observed, slot);
    if (observed !== null) {
      this.readout.textContent = `${label}: ${bells(observed, this.strings.locale)}`;
      return;
    }
    const band = at(data.band, slot);
    const minimum = at(data.minimum, slot);
    const maximum = at(data.maximum, slot);
    if (band === null) {
      this.readout.textContent = `${label}: ${bells(minimum, this.strings.locale)} - ${bells(maximum, this.strings.locale)}`;
      return;
    }
    const locale = this.strings.locale;
    this.readout.textContent =
      `${label}: ${bells(at(band, BAND_MID), locale)} ` +
      `(${this.strings.legendBand50} ${bells(at(band, BAND_LOW_MID), locale)}-${bells(at(band, BAND_HIGH_MID), locale)}, ` +
      `${this.strings.legendBand90} ${bells(at(band, BAND_LOW), locale)}-${bells(at(band, BAND_HIGH), locale)}, ` +
      `${this.strings.legendMinimum} ${bells(minimum, locale)}, ${this.strings.legendMaximum} ${bells(maximum, locale)})`;
  }
}
