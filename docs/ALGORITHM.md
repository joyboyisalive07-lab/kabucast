# The model

Everything kabucast computes rests on the price generator extracted from the
game binary by the community. This document records that generator constant by
constant, each one traced to the source it was read from, and then derives the
inference kabucast performs on top of it.

No constant below was written from memory. Where a constant could not be
confirmed, it is listed in [Unverified and disputed](#unverified-and-disputed).

## Sources

| Tag | Source | Revision read |
| --- | --- | --- |
| **S1** | Ash Wolf (Ninji), *AC:NH turnip price calculator*, decompiled C++: <https://gist.github.com/Treeki/85be14d297c80c8b3c0a76375743325b> | gist version `d56c4ad1476ae9935b94aafd3cb3b1b1903e901b`, committed 2020-03-30 |
| **S2** | Turnip Prophet, `js/predictions.js`: <https://github.com/mikebryant/ac-nh-turnip-prices/blob/master/js/predictions.js> | commit `f1a6680fcd26ef85d6fe04e95ba9de37734027bc`, 2020-05-07 |
| **S3** | Ash Wolf (Ninji), project page: <https://wuffs.org/projects/acnh> | read 2026-08-08 |
| **S4** | David Blackman and Sebastiano Vigna, xoshiro128\*\* and splitmix64: <https://prng.di.unimi.it/xoshiro128starstar.c>, <https://prng.di.unimi.it/splitmix64.c> | read 2026-08-08 |

S1 is the primary source: C++ recovered from the game with Ghidra. S3 confirms
its authorship and that the decompilation was published as that gist. S2 is an
independent transcription of the same generator into JavaScript by a different
author, and is used here purely as a second reading of every constant — where
S1 and S2 agree, a transcription error in either is ruled out. S4 covers only
kabucast's own generator, which has nothing to do with the game.

Line references below are to `TurnipPrices.cpp` in S1 at the revision above.

Every downstream calculator the search turned up derives from S1. There is no
genuinely independent third extraction, so "two sources agree" here means "two
readings of one binary", not two binaries. That limit is real and is the reason
the calibration in [CALIBRATION.md](CALIBRATION.md) is run against kabucast's
own reimplementation of S1 rather than treated as a proof of the game.

## Slots and notation

The game holds a 14-entry array. Entries 0 and 1 are the Sunday buy price, and
entries 2 to 13 are the twelve selling half-days, Monday morning through
Saturday afternoon (S1 L225-226, L346-347, L368-374).

kabucast indexes the twelve selling slots 0 to 11 and calls the Sunday buy price
`base`. Game index = kabucast index + 2.

| Symbol | Meaning |
| --- | --- |
| `b` | Sunday buy price, an integer |
| `p_i` | observed selling price at slot `i`, an integer |
| `r_i` | the underlying continuous rate at slot `i` |

## The game's random primitives

| Primitive | Definition | Source |
| --- | --- | --- |
| `randbool()` | `rng.getU32() & 0x80000000` — the top bit, so 1/2 each way | S1 L101-104 |
| `randint(min, max)` | `((uint64)rng.getU32() * (max - min + 1)) >> 32) + min` — uniform over the `max - min + 1` integers | S1 L105-108 |
| `randfloat(a, b)` | `a + (fval - 1) * (b - a)` where `fval` has the bit pattern `0x3F800000 \| (rng.getU32() >> 9)` | S1 L109-114 |
| `intceil(v)` | `(int)(v + 0.99999f)` | S1 L115-118 |

Two consequences of `randfloat` matter and are used throughout.

**It is uniform on a half-open interval, and the open end follows the second
argument.** `fval` lies in `[1, 2)`, so `u = fval - 1` lies in `[0, 1)` and the
result is `a + u(b - a)`, which covers `[a, b)` when `a < b` and `(b, a]` when
`a > b`. The game calls it both ways: `randfloat(0.9, 1.4)` yields `[0.9, 1.4)`
while `randfloat(0.8, 0.6)` yields `(0.6, 0.8]` (S1 L248, L252). Endpoints carry
zero Lebesgue measure, so kabucast treats every such range as the closed
interval between its two arguments and records the orientation only where it
affects the reading of the source.

**`u` is a lattice, not a continuum.** `rng.getU32() >> 9` keeps 23 bits, so
`u` takes the values `k / 2^23` for integer `k` in `[0, 2^23)`. Section
[From a price to a rate interval](#from-a-price-to-a-rate-interval) shows the
error from treating it as continuous.

`intceil` is *not* a ceiling. `(int)(v + 0.99999f)` truncates, so for `v > 0` it
equals `floor(v + 0.99999)`, which agrees with `ceil(v)` except when the
fractional part of `v` lies in `(0, 0.00001)`, where it is one less. The
inversion in the next section uses the true definition, not `ceil`.

## Base price

`base = randint(90, 110)` — uniform over the 21 integers 90 to 110 inclusive
(S1 L123). Confirmed by S2, which enumerates `buy_price` from 90 to 110 with
equal weight when the Sunday price is unknown (S2 L900).

## Pattern selection

The four patterns are numbered as in S1:

| Number | S1 comment | Common name |
| --- | --- | --- |
| 0 | high, decreasing, high, decreasing, high (L236) | fluctuating |
| 1 | decreasing middle, high spike, random low (L282) | large spike |
| 2 | consistently decreasing (L302) | decreasing |
| 3 | decreasing, spike, decreasing (L312) | small spike |

The next pattern is drawn as `chance = randint(0, 99)` (S1 L124) compared
against thresholds that depend on the previous week's pattern (S1 L137-208).
Converting the thresholds to probabilities gives the transition matrix, rows
indexed by the previous pattern:

| from \ to | 0 fluctuating | 1 large spike | 2 decreasing | 3 small spike | S1 lines |
| --- | --- | --- | --- | --- | --- |
| **0** | 0.20 | 0.30 | 0.15 | 0.35 | L137-154 |
| **1** | 0.50 | 0.05 | 0.20 | 0.25 | L155-172 |
| **2** | 0.25 | 0.45 | 0.05 | 0.25 | L173-190 |
| **3** | 0.45 | 0.25 | 0.15 | 0.15 | L191-208 |

S2 L9-33 states the same matrix as explicit probabilities. The two agree in all
sixteen entries.

S1 L129-132 also handles `whatPattern >= 4` by forcing the next pattern to 2.
That branch covers an uninitialised stored pattern. kabucast does not expose it:
a player who is entering last week's pattern has a pattern to enter, and a
player who has never bought before is covered by the rule below.

### Unknown previous pattern

kabucast marginalises rather than guesses. With the previous pattern unknown,
the prior over this week's pattern is `sum over q of pi(q) * P(pattern | q)`,
and taking `pi` to be the stationary distribution of the matrix above makes that
sum equal `pi` itself. Solved exactly in rational arithmetic from the matrix:

| Pattern | Stationary probability | Decimal |
| --- | --- | --- |
| 0 fluctuating | 4530/13082 | 0.34628 |
| 1 large spike | 3236/13082 | 0.24736 |
| 2 decreasing | 1931/13082 | 0.14761 |
| 3 small spike | 3385/13082 | 0.25875 |

These are derived, not quoted. S2 L883 arrives at the same four fractions, which
is a check on the derivation rather than its source.

The stationary distribution is the right prior only if a player's islands are
observed at a uniformly random point in a long-running chain. That assumption is
stated here because it is an assumption, not a fact about the game.

### First-time buyer

S1 L214-221 carries, as a comment beside the extracted function, the surrounding
game logic:

> if (checkGlobalFlag("FirstKabuBuy")) { if (!checkGlobalFlag("FirstKabuPattern")) { setGlobalFlag("FirstKabuPattern", true); whatPattern = 3; } }

A player's first ever week of buying turnips is therefore forced to pattern 3,
small spike, overriding the transition matrix. S2 implements exactly this: with
`first_buy` set it generates pattern 3 only (S2 L903-904).

This is the one rule whose own code path is not in the decompiled listing — it
is Ninji's annotation of adjacent logic, quoted in a comment. Two sources agree
on it and kabucast implements it, but it carries less weight than the
constants that come from decompiled statements.

## The four generators

Common to all four: `base` is drawn first, then `chance`, then the pattern
branch runs. Slots are filled left to right.

### Pattern 0, fluctuating

S1 L235-280. Five phases in a fixed order: high, decreasing, high, decreasing,
high.

| Quantity | Value | Source |
| --- | --- | --- |
| length of decreasing phase 1 | 3 or 2, each with probability 1/2 | L238 |
| length of decreasing phase 2 | `5 - len(dec 1)` | L239 |
| length of high phase 1 | `randint(0, 6)`, uniform over 7 values | L241 |
| high phases 2 and 3 combined | `7 - len(high 1)` | L242 |
| length of high phase 3 | `randint(0, combined - 1)`, uniform over `combined` values | L243 |
| high-phase rate, every slot | `randfloat(0.9, 1.4)`, independent per slot | L248, L263, L278 |
| decreasing-phase starting rate | `randfloat(0.8, 0.6)`, so `(0.6, 0.8]` | L252, L267 |
| decreasing-phase step | `rate -= 0.04` then `rate -= randfloat(0, 0.06)`, a decrement in `[0.04, 0.10)` | L256-257, L271-272 |

The lengths always sum to twelve: `len(high 1) + 5 + (7 - len(high 1)) = 12`.

S2 L572-598 restates the same block; S2 L623-625 and L638-641 pass the
decreasing phases as start range `[0.6, 0.8]` and decay range `[0.04, 0.10]`,
which is the same decrement written as one uniform.

### Pattern 1, large spike

S1 L281-300.

| Quantity | Value | Source |
| --- | --- | --- |
| peak start slot (game index) | `randint(3, 9)`, uniform over 7 values | L283 |
| pre-peak starting rate | `randfloat(0.9, 0.85)`, so `(0.85, 0.9]` | L284 |
| pre-peak step | `-0.03` then `-randfloat(0, 0.02)`, a decrement in `[0.03, 0.05)` | L288-289 |
| spike slot 1 | `randfloat(0.9, 1.4)` | L291 |
| spike slot 2 | `randfloat(1.4, 2.0)` | L292 |
| spike slot 3, the peak | `randfloat(2.0, 6.0)` | L293 |
| spike slot 4 | `randfloat(1.4, 2.0)` | L294 |
| spike slot 5 | `randfloat(0.9, 1.4)` | L295 |
| every slot after the spike | `randfloat(0.4, 0.9)`, independent per slot | L298 |

All five spike slots are independent draws. Confirmed by S2 L727-728, which
lists the same five ranges followed by `[0.4, 0.9]` for the remaining slots.
Because the peak start is at most game index 9, the five spike slots always fit
inside the week.

### Pattern 2, decreasing

S1 L301-311. No phase randomness at all.

| Quantity | Value | Source |
| --- | --- | --- |
| starting rate | `0.9 - randfloat(0, 0.05)`, so `(0.85, 0.9]` | L303-304 |
| step, all twelve slots | `-0.03` then `-randfloat(0, 0.02)`, a decrement in `[0.03, 0.05)` | L308-309 |

S2 L778 passes start range `[0.85, 0.9]` and decay range `[0.03, 0.05]`.

### Pattern 3, small spike

S1 L312-343.

| Quantity | Value | Source |
| --- | --- | --- |
| peak start slot (game index) | `randint(2, 9)`, uniform over 8 values | L314 |
| pre-peak starting rate | `randfloat(0.9, 0.4)`, so `(0.4, 0.9]` | L317 |
| pre-peak step | `-0.03` then `-randfloat(0, 0.02)` | L321-322 |
| peak slot 1 | `randfloat(0.9, 1.4)` | L325 |
| peak slot 2 | `randfloat(0.9, 1.4)` | L326 |
| peak slot 3 | `intceil(randfloat(1.4, R) * base) - 1` | L328 |
| peak slot 4 | `intceil(R * base)`, where `R = randfloat(1.4, 2.0)` | L327, L329 |
| peak slot 5 | `intceil(randfloat(1.4, R) * base) - 1` | L330 |
| post-peak starting rate | `randfloat(0.9, 0.4)`, a fresh draw | L335 |
| post-peak step | `-0.03` then `-randfloat(0, 0.02)` | L338-339 |

Two features of the peak are easy to miss and both are load-bearing.

The **shared `R`** ties slots 3, 4 and 5 together: `R` is drawn once, slot 4 is
`R` itself, and slots 3 and 5 are independent draws from `[1.4, R)` — the same
`R`. They are conditionally independent given `R`, not independent.

The **`- 1`** on slots 3 and 5 is applied after `intceil`, so an observed price
`p` in those slots means `intceil(rate * base) = p + 1`, not `p`.

S2 L803-808 reproduces both, and S2 L478-479 documents the same conditional
structure with the same variables. If the peak starts at game index 9 there is
no post-peak phase; if it starts at 2 there is no pre-peak phase.

## Inference

The generator above defines a probability measure. Inference is the measure of
the region of that space consistent with what the player typed. kabucast
computes that measure; it does not count branches.

### From a price to a rate interval

A price is an integer, a rate is not. Inverting `intceil` gives an interval,
never a point. For `v > 0`, `intceil(v) = floor(v + 0.99999)`, so

```
intceil(v) = p   <=>   p <= v + 0.99999 < p + 1
                 <=>   p - 0.99999 <= v < p + 0.00001
```

and with `v = r * b` and `b > 0`,

```
r in [ (p - 0.99999) / b , (p + 0.00001) / b )
```

an interval of width exactly `1 / b`. For the two flanking slots of the small
spike, where the generator emits `intceil(r * b) - 1`, observing `p` means
`intceil(r * b) = p + 1` and the interval is

```
r in [ (p + 0.00001) / b , (p + 1.00001) / b )
```

again of width `1 / b`. S2 L303-309 inverts to the same two endpoints, which
confirms the reading of `0.99999f` and of the truncation.

**Why the rate lattice can be ignored.** The true rate is not continuous: it is
`a + u(b - a)` with `u` on a `2^-23` lattice, so the reachable rates in a range
of width `W` are spaced `W * 2^-23` apart. A price bucket has rate width
`1 / b`, at most `1 / 90`. The narrowest range the game uses for a directly
observable rate is `W = 0.5` (`[0.9, 1.4]`), giving at least
`(1/110) / (0.5 * 2^-23)` which is over 150 000 lattice points per bucket. The
relative error from replacing counting measure on that lattice with Lebesgue
measure is of order `2^-23 * W * b`, below `10^-5`. It is recorded here and
otherwise ignored.

**Why a tolerance is applied anyway.** The game computes `r * b + 0.99999f` in
32-bit floating point on ARM; kabucast computes in 64-bit doubles. Near an
interval endpoint the two can disagree in the last place, and the consequence is
not a small error in a probability but a scenario rejected outright. kabucast
widens each inverted interval by a tolerance derived from the 32-bit unit in the
last place at the magnitude involved, and uses the *same* widened interval for
both the feasibility test and the measure, so the reported probability stays the
measure of the region actually accepted. The added measure is of order `10^-5`
relative. S2 handles the same problem differently, by retrying with a
"fudge factor" of up to 5 whole bells and clamping the observed price into the
predicted range; its own source marks the probability consequences of that as an
open question (S2 L357, L408, L461, L500).

### Independent slots

For a slot whose rate is a single `randfloat(a, b)` draw with no other slot
depending on it, the rate is uniform on `[lo, hi]` with `lo = min(a, b)` and
`hi = max(a, b)`. With `I` the inverted interval for the observed price,

```
P(price = p) = |I ∩ [lo, hi]| / (hi - lo)
```

An unobserved slot contributes a factor of 1. This covers every high-phase slot
of pattern 0, the five spike slots and the tail of pattern 1, and the first two
peak slots of pattern 3.

### Correlated decay phases

This is the part that has to be right.

Inside a decreasing phase of length `k` the generator produces

```
r_1 = randfloat(s_lo, s_hi)
r_{j+1} = r_j - D_j ,  D_j ~ Uniform[d_lo, d_hi] , independent
```

The underlying draws `(r_1, D_1, ..., D_{k-1})` are uniform on a box in `R^k`.
Each observed price at slot `j` constrains `r_j`, which is the linear form
`r_1 - D_1 - ... - D_{j-1}`, to lie in an interval — a pair of parallel
half-spaces. The feasible set is therefore the intersection of the box with a
family of slabs: a convex polytope. The probability of the scenario is that
polytope's volume divided by the box's volume.

Treating the observations as independent — multiplying the per-slot interval
measures — is wrong, because `r_j` and `r_{j+1}` differ by a single bounded
decrement and are strongly dependent. It is worth being precise about who does
what here: **S2 does not make that mistake.** It carries a discretised density of
`r_j` forward through the phase and conditions on each observation in turn (S2
L388-428, and the `PDF` class at S2 L124-286), which is the correct chain-rule
factorisation. Its error is of a different kind — see
[Where kabucast differs](#where-kabucast-differs-from-turnip-prophet).

kabucast computes the volume exactly, in closed form, by the same forward
factorisation carried out on an exact representation. Let `f_j` be the density
of `r_j` restricted to the observations seen so far. Then:

**Conditioning.** On an observation with inverted interval `I`, the factor
contributed is `integral of f_j over I`, and `f_j` is replaced by its
restriction to `I`, renormalised. Both operations are exact on a piecewise
polynomial.

**Propagation.** `r_{j+1} = r_j - D_j` with `D_j` uniform gives

```
f_{j+1}(y) = ( F_j(y + d_hi) - F_j(y + d_lo) ) / (d_hi - d_lo)
```

where `F_j` is the antiderivative of `f_j`. A piecewise polynomial of degree `d`
therefore becomes one of degree `d + 1`, with breakpoints translated by `-d_lo`
and by `-d_hi`.

Starting from a uniform density, after `k` steps the result is a piecewise
polynomial of degree at most `k`, and since `k` is at most 12 the whole
computation is a finite exact one. The product of the conditioning factors is
the polytope volume, computed without sampling and without discretisation. The
breakpoints stay tractable because the translations come from a fixed pair
`{d_lo, d_hi}` and collide heavily: after `k` steps a single starting breakpoint
generates at most `(k+1)(k+2)/2` distinct offsets.

Monte Carlo therefore does not appear in kabucast's inference path at all. It
appears in the test suite, where the closed form is checked against a sampled
estimate of the same polytope with a reported error bound; a closed form that
agrees with an independent estimator to within its own confidence interval is
worth more than an estimator alone. Phase 3 implements this and
[CALIBRATION.md](CALIBRATION.md) reports the agreement.

### The small-spike peak

Slots 3, 4 and 5 of the pattern 3 peak share the draw `R ~ Uniform[1.4, 2.0]`.
Conditional on `R`, slots 3 and 5 are independent and uniform on `[1.4, R]`.
Writing `A` for the interval `R` must lie in, given the observation at slot 4,
and `B` and `C` for the intervals slots 3 and 5 must lie in — all three obtained
by the inversion above, with the `+1` correction on `B` and `C` — the scenario
probability is

```
              1        /
P = ----------------- | h_B(x) * h_C(x) dx ,   h_S(x) = |S ∩ [1.4, x]| / (x - 1.4)
      2.0 - 1.4       / A
```

`|S ∩ [1.4, x]|` is piecewise linear in `x`, so each `h` is a linear function
over `x - 1.4` and the integrand is a ratio of a quadratic to `(x - 1.4)^2`.
Substituting `u = x - 1.4` reduces every piece to `∫ (a + c/u + e/u^2) du`,
which integrates to `a*u + c*ln(u) - e/u`. Closed form, no sampling. An
unobserved slot sets its `h` to 1.

### Assembling the posterior

A scenario is a pattern together with a full assignment of phase lengths and
peak positions — everything the generator draws before it starts drawing rates.
For each scenario `s`:

```
w(s) = P(pattern of s) * P(phase assignment | pattern) * L(observations | s)
```

`P(pattern)` is the transition-matrix row for the stated previous pattern, or
the stationary distribution when it is unknown, or a point mass on pattern 3 for
a first-time buyer. `P(phase assignment | pattern)` is the product of the
uniform phase-length and peak-position probabilities tabulated above. `L` is the
product of the per-phase measures derived in this section.

When the Sunday price is unknown, `b` is summed over 90 to 110 with weight 1/21
each, inside the same expression, so the posterior over `b` falls out of the
same normalisation rather than being fixed in advance.

The posterior over scenarios is `w(s)` normalised over all scenarios; the
posterior over patterns is that same quantity aggregated by pattern. Both sum to
one by construction. If every scenario has weight zero the input is
inconsistent with the generator, and kabucast says so instead of relaxing the
data until something matches.

## Where kabucast differs from Turnip Prophet

Recorded here because the difference is the reason this project exists, and
because one common description of Turnip Prophet is wrong and should not be
repeated.

**Not a difference.** Turnip Prophet does not assume independence between
consecutive observations inside a decreasing phase, and it does not merely count
surviving branches. Its `PDF` class propagates the rate density through the
decay chain and conditions on each observation, which is the correct
factorisation.

**Real differences.**

1. *Discretisation.* Turnip Prophet works on a grid of `1e-4` rate units and
   represents the density as constant within each cell (S2 L113-123). Its decay
   convolution is exact only under that piecewise-constant assumption, while the
   true density after `k` steps is a piecewise polynomial of degree `k`.
   kabucast keeps the polynomial and is exact.
2. *The fudge factor.* When nothing matches, Turnip Prophet re-runs with the
   accepted price widened by up to 5 bells and clamps observations into the
   predicted range (S2 L353-362, L916-926). The numbers it then reports are no
   longer posterior probabilities of anything, as its own comments note.
   kabucast applies a tolerance of order `10^-5` derived from float32 precision,
   uses it identically in the feasibility test and in the measure, and reports
   an inconsistent input as inconsistent.
3. *No selling decision.* Turnip Prophet reports prices. kabucast computes the
   optimal stopping policy over the posterior by backward induction and reports
   expected bells, the probability that waiting beats selling now, and the 10th
   percentile outcome.

Section 3 of [CALIBRATION.md](CALIBRATION.md) compares the two on fixed inputs
with the numbers attached.

## Unverified and disputed

Nothing in the constant tables above is unverified: every entry was read in S1
and independently confirmed in S2, and no disagreement between them was found.

Three items are weaker than the rest and the code treats them conservatively:

1. **The first-time-buyer rule.** Its code path is not in the decompiled
   listing; it appears as Ninji's commented annotation (S1 L214-221) and is
   implemented by S2. kabucast follows it, but it is the only rule here without
   a decompiled statement behind it, and the interface makes the toggle
   explicit rather than inferring it.
2. **The stationary prior for an unknown previous pattern.** The transition
   matrix is sourced; treating a player's week as a draw from the chain's
   stationary distribution is kabucast's modelling choice, recorded in
   [DECISIONS.md](DECISIONS.md).
3. **Float32 versus float64.** The game's arithmetic is 32-bit and kabucast's is
   64-bit. The tolerance described above bounds the consequence but does not
   eliminate it. No source states the exact ARM rounding behaviour of the
   original, so this is handled as a bounded approximation and not as a
   reproduction.
