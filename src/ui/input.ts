/**
 * The input panel.
 *
 * A player types these numbers twice a day for a week, so the flow matters more
 * than the styling. Focus moves on when a field can no longer take another
 * digit, pasting a whole row fills the row, and a value the model cannot use is
 * marked where it was typed rather than in a dialogue that has to be dismissed.
 */

import { at } from "../model/array.ts";
import { BASE_PRICE_MAX, BASE_PRICE_MIN, SELLING_SLOT_COUNT } from "../model/constants.ts";
import { PATTERNS } from "../model/types.ts";
import type { Pattern } from "../model/types.ts";
import type { Strings } from "../i18n/strings.ts";
import { slotLabel } from "./format.ts";

/** The generator cannot exceed six times a base of 110, so four digits is a typo. */
const MAX_SELLING_PRICE = 999;
const MIN_SELLING_PRICE = 1;
const AUTO_ADVANCE_LENGTH = 3;

export interface InputState {
  readonly basePrice: number | null;
  readonly firstBuy: boolean;
  readonly previousPattern: Pattern | null;
  readonly prices: readonly (number | null)[];
}

export function emptyInputState(): InputState {
  return {
    basePrice: null,
    firstBuy: false,
    previousPattern: null,
    prices: new Array<number | null>(SELLING_SLOT_COUNT).fill(null),
  };
}

function parseInteger(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  if (!/^\d{1,4}$/.test(trimmed)) {
    return Number.NaN;
  }
  return Number.parseInt(trimmed, 10);
}

function labelled(control: HTMLElement, text: string, hint?: string): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.className = "field";
  const caption = document.createElement("span");
  caption.className = "field-label";
  caption.textContent = text;
  wrapper.append(caption, control);
  if (hint !== undefined) {
    const note = document.createElement("span");
    note.className = "field-hint";
    note.textContent = hint;
    wrapper.append(note);
  }
  return wrapper;
}

export class InputPanel {
  private readonly baseInput: HTMLInputElement;
  private readonly baseError: HTMLElement;
  private readonly firstBuyInput: HTMLInputElement;
  private readonly patternSelect: HTMLSelectElement;
  private readonly priceInputs: HTMLInputElement[] = [];
  private readonly priceErrors: HTMLElement[] = [];

  private readonly host: HTMLElement;
  private strings: Strings;
  private readonly onChange: () => void;

  constructor(host: HTMLElement, strings: Strings, onChange: () => void) {
    this.host = host;
    this.strings = strings;
    this.onChange = onChange;
    this.baseInput = document.createElement("input");
    this.baseInput.type = "text";
    this.baseInput.inputMode = "numeric";
    this.baseInput.autocomplete = "off";
    this.baseInput.className = "price-input";
    this.baseError = document.createElement("span");
    this.baseError.className = "field-error";

    this.firstBuyInput = document.createElement("input");
    this.firstBuyInput.type = "checkbox";

    this.patternSelect = document.createElement("select");

    this.build();
    this.wire();
  }

  private build(): void {
    this.host.replaceChildren();

    const top = document.createElement("div");
    top.className = "input-row";

    const baseField = labelled(this.baseInput, this.strings.sundayPrice, this.strings.sundayPriceHint);
    baseField.append(this.baseError);
    top.append(baseField);

    const patternField = labelled(this.patternSelect, this.strings.previousPattern);
    this.patternSelect.replaceChildren();
    const unknown = document.createElement("option");
    unknown.value = "";
    unknown.textContent = this.strings.patternUnknown;
    this.patternSelect.append(unknown);
    for (const pattern of PATTERNS) {
      const option = document.createElement("option");
      option.value = String(pattern);
      option.textContent = at(this.strings.patternNames, pattern);
      this.patternSelect.append(option);
    }
    top.append(patternField);

    const toggle = document.createElement("label");
    toggle.className = "toggle";
    const toggleText = document.createElement("span");
    toggleText.textContent = this.strings.firstTimeBuyer;
    const toggleHint = document.createElement("span");
    toggleHint.className = "field-hint";
    toggleHint.textContent = this.strings.firstTimeBuyerHint;
    toggle.append(this.firstBuyInput, toggleText, toggleHint);
    top.append(toggle);

    const pricesHeading = document.createElement("h2");
    pricesHeading.textContent = this.strings.prices;
    const pricesHint = document.createElement("p");
    pricesHint.className = "field-hint";
    pricesHint.textContent = this.strings.pricesHint;

    // One box per day, each holding its two half-days. The first version put
    // all twelve fields in one flat grid and nobody could tell where Tuesday
    // ended and Wednesday began.
    const grid = document.createElement("div");
    grid.className = "days";
    this.priceInputs.length = 0;
    this.priceErrors.length = 0;

    for (let day = 0; day < this.strings.dayNames.length; day += 1) {
      const block = document.createElement("div");
      block.className = "day";

      const name = document.createElement("span");
      name.className = "day-name";
      name.textContent = at(this.strings.dayNames, day);
      block.append(name);

      const fields = document.createElement("div");
      fields.className = "day-fields";

      for (const half of [0, 1] as const) {
        const slot = day * 2 + half;
        const input = document.createElement("input");
        input.type = "text";
        input.inputMode = "numeric";
        input.autocomplete = "off";
        input.className = "price-input";
        input.setAttribute(
          "aria-label",
          slotLabel(slot, this.strings.dayNames, this.strings.morning, this.strings.afternoon),
        );
        const error = document.createElement("span");
        error.className = "field-error";
        this.priceInputs.push(input);
        this.priceErrors.push(error);

        const cell = document.createElement("label");
        cell.className = "half";
        const caption = document.createElement("span");
        caption.className = "half-label";
        caption.textContent = half === 0 ? this.strings.morning : this.strings.afternoon;
        cell.append(caption, input, error);
        fields.append(cell);
      }

      block.append(fields);
      grid.append(block);
    }

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "secondary";
    clear.textContent = this.strings.clear;
    clear.addEventListener("click", () => this.clear());

    this.host.append(top, pricesHeading, pricesHint, grid, clear);
  }

  private wire(): void {
    this.baseInput.addEventListener("input", () => this.validateAndEmit());
    this.firstBuyInput.addEventListener("change", () => {
      this.patternSelect.disabled = this.firstBuyInput.checked;
      this.validateAndEmit();
    });
    this.patternSelect.addEventListener("change", () => this.validateAndEmit());

    this.baseInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        at(this.priceInputs, 0).focus();
      }
    });
    this.baseInput.addEventListener("paste", (event) => this.onPaste(event, -1));

    for (let slot = 0; slot < this.priceInputs.length; slot += 1) {
      const input = at(this.priceInputs, slot);
      input.addEventListener("input", () => {
        this.validateAndEmit();
        if (input.value.trim().length >= AUTO_ADVANCE_LENGTH) {
          this.focusNext(slot);
        }
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.focusNext(slot);
        }
      });
      input.addEventListener("paste", (event) => this.onPaste(event, slot));
    }
  }

  private focusNext(slot: number): void {
    const next = this.priceInputs[slot + 1];
    if (next !== undefined) {
      next.focus();
      next.select();
    }
  }

  private onPaste(event: ClipboardEvent, slot: number): void {
    const text = event.clipboardData?.getData("text") ?? "";
    const numbers = text.match(/\d+/g);
    if (numbers === null || numbers.length < 2) {
      return;
    }
    event.preventDefault();

    let index = slot;
    let taken = 0;
    if (slot === -1) {
      this.baseInput.value = numbers[0] ?? "";
      taken = 1;
      index = 0;
    }
    for (; taken < numbers.length && index < this.priceInputs.length; taken += 1, index += 1) {
      at(this.priceInputs, index).value = numbers[taken] ?? "";
    }
    this.validateAndEmit();
  }

  /** Empties one half-day and recomputes, for the offer made on an impossible week. */
  clearSlot(slot: number): void {
    const input = this.priceInputs[slot];
    if (input === undefined) {
      return;
    }
    input.value = "";
    this.validateAndEmit();
    input.focus();
  }

  /** Marks the price the inference says cannot follow the ones before it. */
  flagSlot(slot: number | null): void {
    for (let index = 0; index < this.priceInputs.length; index += 1) {
      at(this.priceInputs, index).classList.toggle("culprit", index === slot);
    }
  }

  private clear(): void {
    this.baseInput.value = "";
    this.firstBuyInput.checked = false;
    this.patternSelect.disabled = false;
    this.patternSelect.value = "";
    for (const input of this.priceInputs) {
      input.value = "";
    }
    this.validateAndEmit();
  }

  private validateAndEmit(): void {
    this.validate();
    this.onChange();
  }

  private validate(): void {
    const base = parseInteger(this.baseInput.value);
    const baseValid =
      base === null || (Number.isInteger(base) && base >= BASE_PRICE_MIN && base <= BASE_PRICE_MAX);
    this.baseInput.classList.toggle("invalid", !baseValid);
    this.baseError.textContent = baseValid ? "" : this.strings.invalidBasePrice;

    for (let slot = 0; slot < this.priceInputs.length; slot += 1) {
      const input = at(this.priceInputs, slot);
      const value = parseInteger(input.value);
      const valid =
        value === null ||
        (Number.isInteger(value) && value >= MIN_SELLING_PRICE && value <= MAX_SELLING_PRICE);
      input.classList.toggle("invalid", !valid);
      at(this.priceErrors, slot).textContent = valid ? "" : this.strings.invalidPrice;
    }
  }

  /**
   * The raw text rather than the parsed state, so that switching language in
   * the middle of typing an out-of-range number does not silently discard it.
   */
  private readRaw(): readonly string[] {
    return [this.baseInput.value, ...this.priceInputs.map((input) => input.value)];
  }

  private writeRaw(values: readonly string[]): void {
    this.baseInput.value = values[0] ?? "";
    for (let slot = 0; slot < this.priceInputs.length; slot += 1) {
      at(this.priceInputs, slot).value = values[slot + 1] ?? "";
    }
  }

  setStrings(strings: Strings): void {
    const raw = this.readRaw();
    const firstBuy = this.firstBuyInput.checked;
    const pattern = this.patternSelect.value;
    this.strings = strings;
    this.build();
    this.wire();
    this.writeRaw(raw);
    this.firstBuyInput.checked = firstBuy;
    this.patternSelect.value = pattern;
    this.patternSelect.disabled = firstBuy;
    this.validate();
  }

  write(state: InputState): void {
    this.baseInput.value = state.basePrice === null ? "" : String(state.basePrice);
    this.firstBuyInput.checked = state.firstBuy;
    this.patternSelect.disabled = state.firstBuy;
    this.patternSelect.value = state.previousPattern === null ? "" : String(state.previousPattern);
    for (let slot = 0; slot < this.priceInputs.length; slot += 1) {
      const price = at(state.prices, slot);
      at(this.priceInputs, slot).value = price === null ? "" : String(price);
    }
    this.validate();
  }

  /** Values outside the model's range are read as absent, and stay marked. */
  read(): InputState {
    const base = parseInteger(this.baseInput.value);
    const basePrice =
      base !== null && Number.isInteger(base) && base >= BASE_PRICE_MIN && base <= BASE_PRICE_MAX
        ? base
        : null;

    const prices: (number | null)[] = [];
    for (const input of this.priceInputs) {
      const value = parseInteger(input.value);
      prices.push(
        value !== null &&
          Number.isInteger(value) &&
          value >= MIN_SELLING_PRICE &&
          value <= MAX_SELLING_PRICE
          ? value
          : null,
      );
    }

    const selected = this.patternSelect.value;
    const previousPattern =
      selected === "" ? null : (Number.parseInt(selected, 10) as Pattern);

    return {
      basePrice,
      firstBuy: this.firstBuyInput.checked,
      previousPattern: this.firstBuyInput.checked ? null : previousPattern,
      prices,
    };
  }
}
