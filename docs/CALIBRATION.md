# Calibration

Accuracy claims in this project are measured, not asserted. Everything below
comes from one run of the harness and can be reproduced:

```bash
node tools/simulate.ts --weeks 1000000
```

The run writes [calibration.json](calibration.json), which is committed
alongside this file. The seed is fixed, so a second run reproduces it byte for
byte; that is checked before every release by running the harness twice and
comparing hashes.

**The run.** 1 000 000 weeks. Last week's pattern is drawn from the chain's
stationary distribution, this week's from the transition matrix, and the prices
from the generator in `src/model/`. At each of eight checkpoints the predictor
is handed the Sunday buy price and the prices up to that half-day, and its
answer is compared with the pattern that actually produced them. Two
configurations run side by side: last week's pattern told to the predictor, and
withheld. That is 16 million posteriors, 1522 seconds, 657 weeks per second.

Not one of the sixteen million inputs was rejected as inconsistent, which is the
first thing the run had to show: the inference accepts everything its own
generator produces.

## The calibration curve

Every (week, checkpoint, pattern) triple contributes one claimed probability and
one outcome. Claims are pooled into twenty bins of width 0.05 across all eight
checkpoints. If the numbers mean what they say, the observed frequency in a bin
equals the mean claimed probability in it.

Last week's pattern known:

| Bin | Claims | Mean claimed | Observed | Difference | Standard error |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.00–0.05 | 20 259 719 | 0.0024 | 0.0023 | −0.0000 | 0.0000 |
| 0.05–0.10 | 1 464 537 | 0.0688 | 0.0689 | +0.0001 | 0.0002 |
| 0.10–0.15 | 378 023 | 0.1264 | 0.1267 | +0.0003 | 0.0005 |
| 0.15–0.20 | 293 015 | 0.1764 | 0.1762 | −0.0002 | 0.0007 |
| 0.20–0.25 | 160 956 | 0.2186 | 0.2207 | +0.0021 | 0.0010 |
| 0.25–0.30 | 76 570 | 0.2782 | 0.2795 | +0.0013 | 0.0016 |
| 0.30–0.35 | 408 051 | 0.3259 | 0.3263 | +0.0004 | 0.0007 |
| 0.35–0.40 | 424 683 | 0.3771 | 0.3780 | +0.0008 | 0.0007 |
| 0.40–0.45 | 453 051 | 0.4372 | 0.4367 | −0.0004 | 0.0007 |
| 0.45–0.50 | 180 254 | 0.4862 | 0.4865 | +0.0003 | 0.0012 |
| 0.50–0.55 | 321 407 | 0.5162 | 0.5151 | −0.0011 | 0.0009 |
| 0.55–0.60 | 541 228 | 0.5711 | 0.5714 | +0.0003 | 0.0007 |
| 0.60–0.65 | 341 960 | 0.6160 | 0.6155 | −0.0004 | 0.0008 |
| 0.65–0.70 | 117 843 | 0.6777 | 0.6782 | +0.0006 | 0.0014 |
| 0.70–0.75 | 97 937 | 0.7287 | 0.7271 | −0.0016 | 0.0014 |
| 0.75–0.80 | 319 929 | 0.7789 | 0.7777 | −0.0011 | 0.0007 |
| 0.80–0.85 | 302 550 | 0.8265 | 0.8272 | +0.0006 | 0.0007 |
| 0.85–0.90 | 223 329 | 0.8655 | 0.8656 | +0.0001 | 0.0007 |
| 0.90–0.95 | 476 777 | 0.9242 | 0.9236 | −0.0006 | 0.0004 |
| 0.95–1.00 | 5 158 181 | 0.9978 | 0.9978 | +0.0000 | 0.0000 |

No bin is off by more than 0.0021 in probability, and the largest deviation is
2.0 standard errors. Over twenty bins one deviation of that size is what chance
produces.

Last week's pattern withheld and marginalised:

| Bin | Claims | Mean claimed | Observed | Difference | Standard error |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0.00–0.05 | 20 040 895 | 0.0022 | 0.0022 | +0.0000 | 0.0000 |
| 0.05–0.10 | 1 420 111 | 0.0700 | 0.0699 | −0.0000 | 0.0002 |
| 0.10–0.15 | 341 118 | 0.1166 | 0.1177 | +0.0011 | 0.0006 |
| 0.15–0.20 | 34 625 | 0.1730 | 0.1762 | +0.0032 | 0.0020 |
| 0.20–0.25 | 28 463 | 0.2258 | 0.2235 | −0.0023 | 0.0025 |
| 0.25–0.30 | 25 317 | 0.2800 | 0.2869 | +0.0069 | 0.0028 |
| 0.30–0.35 | 299 632 | 0.3190 | 0.3192 | +0.0002 | 0.0009 |
| 0.35–0.40 | 906 085 | 0.3692 | 0.3696 | +0.0004 | 0.0005 |
| 0.40–0.45 | 608 363 | 0.4203 | 0.4204 | +0.0001 | 0.0006 |
| 0.45–0.50 | 622 154 | 0.4780 | 0.4780 | +0.0001 | 0.0006 |
| 0.50–0.55 | 382 992 | 0.5203 | 0.5201 | −0.0003 | 0.0008 |
| 0.55–0.60 | 1 028 283 | 0.5717 | 0.5713 | −0.0004 | 0.0005 |
| 0.60–0.65 | 153 710 | 0.6445 | 0.6454 | +0.0008 | 0.0012 |
| 0.65–0.70 | 229 804 | 0.6581 | 0.6580 | −0.0001 | 0.0010 |
| 0.70–0.75 | 11 401 | 0.7237 | 0.7163 | −0.0073 | 0.0042 |
| 0.75–0.80 | 20 547 | 0.7717 | 0.7721 | +0.0004 | 0.0029 |
| 0.80–0.85 | 26 259 | 0.8276 | 0.8259 | −0.0017 | 0.0023 |
| 0.85–0.90 | 310 858 | 0.8836 | 0.8825 | −0.0011 | 0.0006 |
| 0.90–0.95 | 573 013 | 0.9084 | 0.9079 | −0.0004 | 0.0004 |
| 0.95–1.00 | 4 936 370 | 0.9997 | 0.9997 | −0.0000 | 0.0000 |

Largest deviation 0.0073, largest in standard errors 2.4, both in bins holding
under 30 000 claims out of 31 million. Marginalising the unknown previous week
costs sharpness, as it should, and costs nothing in calibration.

So when kabucast says 77 percent, the pattern is that one about 77 percent of
the time, to within a fifth of a percentage point.

## Convergence

How much of the week has to pass before the answer is settled. A week counts as
resolved when exactly one pattern retains any probability at all; the
near-certain column uses a threshold of 0.99 instead, and the last column is how
often the near-certain answer was right.

Last week's pattern known:

| Prices | Day reached | Resolved to one pattern | Near certain | Near certain and correct | Top choice correct | Mean probability on the truth | Brier |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Monday morning | 10.50% | 10.74% | 100.000% | 78.32% | 0.6946 | 0.3056 |
| 2 | **Monday** | 20.79% | 22.08% | 99.978% | 81.99% | 0.7457 | 0.2545 |
| 3 | Tuesday morning | 52.42% | 56.19% | 99.980% | 86.19% | 0.8228 | 0.1772 |
| 4 | **Tuesday** | 62.34% | 62.96% | 99.997% | 87.32% | 0.8468 | 0.1532 |
| 5 | Wednesday morning | 68.07% | 68.61% | 99.997% | 89.96% | 0.8741 | 0.1259 |
| 6 | **Wednesday** | 73.27% | 73.42% | 100.000% | 93.03% | 0.9027 | 0.0973 |
| 8 | Thursday | 96.03% | 96.08% | 100.000% | 99.65% | 0.9940 | 0.0060 |
| 10 | Friday | 99.99% | 100.00% | 100.000% | 100.00% | 1.0000 | 0.0000 |

Last week's pattern withheld:

| Prices | Day reached | Resolved to one pattern | Near certain | Near certain and correct | Top choice correct | Mean probability on the truth | Brier |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | Monday morning | 10.50% | 10.74% | 100.000% | 74.30% | 0.6539 | 0.3464 |
| 2 | **Monday** | 20.79% | 21.86% | 99.980% | 78.01% | 0.7103 | 0.2899 |
| 3 | Tuesday morning | 52.42% | 55.80% | 99.985% | 82.01% | 0.7930 | 0.2070 |
| 4 | **Tuesday** | 62.34% | 62.92% | 99.997% | 83.48% | 0.8206 | 0.1794 |
| 5 | Wednesday morning | 68.07% | 68.59% | 99.998% | 87.82% | 0.8526 | 0.1475 |
| 6 | **Wednesday** | 73.27% | 73.41% | 100.000% | 91.85% | 0.8871 | 0.1129 |
| 8 | Thursday | 96.03% | 96.08% | 100.000% | 99.65% | 0.9937 | 0.0063 |
| 10 | Friday | 99.99% | 100.00% | 100.000% | 100.00% | 1.0000 | 0.0000 |

The three figures the brief asks for: **20.8 percent** of weeks are pinned to a
single pattern after Monday, **62.3 percent** after Tuesday, **73.3 percent**
after Wednesday. The remaining quarter of weeks are still genuinely ambiguous on
Wednesday evening, and kabucast shows them as several surviving scenarios rather
than picking one.

Two details worth reading off the tables. The resolved column is identical
whether or not last week's pattern is known, because which patterns *can* have
produced the prices does not depend on the prior; only their weights do. And the
near-certain answer is essentially never wrong: over the eight checkpoints the
worst near-certain accuracy is 99.978 percent, an error rate of 22 weeks in
100 000.

## Cross-check against Turnip Prophet

Six fixed inputs, entered at <https://turnipprophet.io/> through its own URL
format, with a Sunday price of 100 and no previous pattern given. Turnip Prophet
displays three significant figures, so that is the precision at which agreement
can be confirmed.

| Input | kabucast | Turnip Prophet | Scenarios |
| --- | --- | --- | ---: |
| `88.84.80.76` | large 46.82%, decreasing 48.89%, small 4.29% | large 46.8%, decreasing 48.9%, small 4.29% | 9 = 9 |
| `86.81.76.73.107` | large 91.61%, small 8.39% | large 91.6%, small 8.39% | 2 = 2 |
| `65.60.132.126.147.158` | small 100% | small 100% | 1 = 1 |
| `75.70.66` | fluctuating 4.075%, small 95.925% | fluctuating 4.08%, small 95.9% | 12 = 12 |
| `107.114.75.69` | fluctuating 100% | fluctuating 100% | 10 = 10 |
| `88.84.80.76.72.71` | **inconsistent input** | decreasing 65.7%, large 31.4%, small 2.88% | — |

Reproduce any row by appending it to `https://turnipprophet.io/?prices=100.` and
entering the same numbers in kabucast.

**On five of the six they agree.** Not only on the pattern totals but on the
number of surviving scenarios and on each scenario's individual probability. The
`75.70.66` row is the sharpest of these, because it is the one case found where
the two competing patterns use *different* decay rules — the fluctuating
pattern's decrement is 0.04 to 0.10 and the small spike's is 0.03 to 0.05 — so
the answer depends on the shape of the rate density rather than on interval
widths alone. kabucast integrates that density exactly and Turnip Prophet
approximates it on a grid of 1e-4 rate units, and at three significant figures
the difference does not show.

This is worth stating plainly because the opposite is often assumed. Turnip
Prophet does **not** treat consecutive observations inside a decreasing phase as
independent, and it does not merely count surviving branches. Its `PDF` class
propagates the rate density through the decay chain and conditions on each
observation, which is the correct factorisation. On reachable inputs its numbers
are right.

### The sixth row

`100.88.84.80.76.72.71` cannot happen. The fall from 72 to 71 is a rate step of
0.01, and the smallest step any decreasing phase in the game takes is 0.03. The
price 71 is also too low to be a high-phase slot, a spike slot, or the start of a
fresh decreasing phase in the position it occupies. No pattern, no phase
assignment and no base price produces it.

kabucast reports the input as inconsistent with the generator and stops.

Turnip Prophet reports 65.7 percent decreasing, 31.4 percent large spike and
2.88 percent small spike. It reaches those numbers by widening the accepted
price by up to five whole bells and clamping the observation into whatever range
it predicted, then dividing as if nothing had happened. Its own source marks the
consequences as an open question at four separate places (`js/predictions.js`
lines 357, 408, 461, 500). Nothing in its interface tells the player this
happened.

Which is correct is not a matter of taste. A player seeing 65.7 percent has been
told something about their week; a player who typed 71 instead of 61 has been
told something about their typo. kabucast prefers to say so.

## What this does not show

Three limits, stated because the numbers above are easy to over-read.

1. **This measures the inference against the model, not the model against the
   game.** The weeks are generated by kabucast's own reimplementation of the
   extracted algorithm. If that reimplementation is wrong in the same way the
   inference is wrong, calibration cannot see it. What guards that boundary is
   the constant-by-constant sourcing in [ALGORITHM.md](ALGORITHM.md) and the
   unit tests behind it, not this run.
2. **Both tools descend from one extraction.** The agreement in the cross-check
   rules out transcription error between two readings of the same decompiled
   source. It is not independent confirmation that either matches the binary.
3. **The selling decision is not calibrated here.** It is a Monte Carlo
   approximation with its own error bar, described in
   [DECISIONS.md](DECISIONS.md) D-018 and bracketed by its own tests. Nothing on
   this page speaks to it.
