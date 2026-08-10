# Decisions

Every non-obvious choice, with the reason and the alternative that was rejected.
Newest phase last.

## Phase 0 — toolchain and scaffold

### D-001 TypeScript is used for typechecking only; esbuild produces every build

`tsconfig.json` sets `noEmit`. `tsc` is a linter here. Bundling for the browser,
for the offline single-file artifact and for anything shipped is done by
esbuild.

Rejected: `tsc` emitting to `dist/` and esbuild bundling the emitted JavaScript.
That is two artifacts of the same code and two chances for them to disagree.

### D-002 Tests run straight from TypeScript sources through Node's type stripping

Node 24 strips types from `.ts` files without a flag, so `node --test
"tests/**/*.test.ts"` runs the sources the typechecker sees, with no build step
between a change and its test.

The cost is that TypeScript syntax which is not erasable is forbidden: no
`enum`, no `namespace`, no parameter properties, no `import` of a type without
`import type`. `erasableSyntaxOnly` and `verbatimModuleSyntax` in
`tsconfig.json` turn that into a compile error rather than a runtime surprise,
and domain "enums" are written as `const` objects with derived union types.

### D-003 `@types/node` is not installed; the needed built-ins are declared by hand

The dependency budget for this project is `typescript` and `esbuild`, nothing
else, and `@types/node` is a third package. `types/node-builtins.d.ts` declares
exactly the surface the repository uses and grows only when a built-in is
actually called.

Rejected: excluding `tests/` and `tools/` from the typecheck. Test code that is
not typechecked is the code most likely to assert the wrong thing.

### D-004 The pseudo-random generator is explicit, seeded and reproducible

`Math.random` cannot be seeded and its stream is not stable across engines or
versions. The project promises byte-identical output for identical input and
Monte Carlo estimates with stated error bounds; neither survives an unseeded
generator.

The implementation is xoshiro128\*\* seeded by splitmix64. It is 32-bit
throughout, which JavaScript executes natively via `Math.imul`; the 64-bit
members of the same family would put BigInt in the hot loop. Every constant in
`src/model/rng.ts` is transcribed from the reference C listings at
<https://prng.di.unimi.it/xoshiro128starstar.c> and
<https://prng.di.unimi.it/splitmix64.c>, and `tests/rng.test.ts` cross-checks
the production implementation against a literal BigInt transcription of both
listings, because the realistic failure mode is JavaScript's signed shift and
float multiplication semantics rather than the algorithm itself.

### D-005 Uniform draws carry 53 bits, assembled from two 32-bit words

A single 32-bit word would place samples on a 2^-32 lattice. The likelihood
work integrates over rate intervals that can be narrow, and a visible lattice
there would show up as bias in the calibration curve rather than as a bug.

## Phase 1 — sources

### D-006 Ninji's decompilation is the primary source; Turnip Prophet is a second reading, not a second source

Every constant was read from the decompiled C++ at
<https://gist.github.com/Treeki/85be14d297c80c8b3c0a76375743325b> and then
confirmed against the independent JavaScript transcription in
<https://github.com/mikebryant/ac-nh-turnip-prices>. All sixteen transition
probabilities and every rate range, phase-length distribution and rounding rule
agreed; no disagreement was found.

That is weaker than it sounds and [ALGORITHM.md](ALGORITHM.md) says so: both are
readings of the same extraction from the same binary, so the agreement rules out
transcription error and nothing else. No genuinely independent extraction was
found. This is why the project's accuracy claim rests on calibration against
kabucast's own reimplementation of the generator rather than on the sources
being beyond doubt.

### D-007 An unknown previous pattern is marginalised with the chain's stationary distribution

The prior over this week's pattern with last week's unknown is
`sum over q of pi(q) * P(pattern | q)`. Choosing `pi` to be the stationary
distribution makes that expression equal `pi`, which is both the natural fixed
point and the only choice that is self-consistent week over week. It was solved
exactly in rational arithmetic from the sourced matrix, and only afterwards
compared with the same four fractions used by Turnip Prophet.

Rejected: a uniform prior over the four patterns. It is not what a long-running
chain produces, and it would quietly overweight the decreasing pattern, whose
stationary share is 0.148 rather than 0.25.

The assumption behind the choice is that a player's week is observed at a
uniformly random point of a long chain. That is an assumption, and it is
labelled as one in the documentation rather than presented as a fact.

### D-008 Decay phases are solved in exact closed form; Monte Carlo is a test, not a component

The brief allowed a Monte Carlo estimator with a reported error bound where the
geometry has no closed form. Working the geometry through, there is a closed
form everywhere: propagating the rate density through a decreasing phase turns a
piecewise polynomial of degree `d` into one of degree `d + 1`, phases are at
most twelve slots long, and the small-spike peak reduces to integrals of
`a + c/u + e/u^2`. So the inference path computes exact volumes and contains no
sampling at all.

Monte Carlo is kept, but as an independent check in the test suite: the closed
form must agree with a sampled estimate of the same polytope to within the
estimate's own confidence interval. Shipping an estimator that nothing calls
would be dead code; using one to verify the exact result is evidence.

### D-009 A float32 tolerance, applied identically to feasibility and to measure

The game rounds in 32-bit floating point and kabucast computes in doubles, so
near an inverted interval endpoint the two can disagree in the last place. The
cost of that is not a small numerical error but a scenario rejected outright.

kabucast widens each inverted rate interval by two units in the last place of a
float32 at the price, and uses the widened interval for both the feasibility
test and the measure, so the number reported stays the measure of what was
actually accepted.

The tolerance is scaled to the magnitude rather than fixed, because the ulp at a
price of 600 is sixteen times the ulp at 40 and a constant wide enough for the
first would be needlessly wide for the second. The overlap it creates between
neighbouring buckets is four units in the last place relative: 3.1e-5 at a price
of 100, 2.4e-4 at 600.

Both of those figures were wrong in the first draft of this file, which claimed
1e-5 flat. The error surfaced in phase 5, when a test computed the predictive
distribution over the next price from marginal likelihood ratios and found it
summing to 1.0002 rather than 1. The flat tolerance was replaced by the scaled
one and the figures recomputed. That test now measures the excess on every run.

Rejected: Turnip Prophet's approach of retrying with the accepted price widened
by up to five whole bells and clamping observations into the predicted range.
Five bells is not a rounding tolerance, and after that clamp the reported
numbers are not posterior probabilities. When no scenario survives, kabucast
reports the input as inconsistent with the generator instead.

### D-010 The `whatPattern >= 4` branch is not exposed

The generator forces the decreasing pattern when the stored previous pattern is
out of range, which covers an uninitialised save. A player selecting last week's
pattern has one to select, and a player who has never bought is covered by the
first-time-buyer rule, so exposing a fifth option would offer a state no user
can be in. Unknown previous pattern is handled by D-007 instead.

## Phase 2 — the generative model

### D-011 The generator reproduces the original's arithmetic but not its bit stream

Two things could be meant by implementing the generator "exactly". kabucast does
one and not the other, deliberately.

Reproduced: the uniform draw sits on the same 2^-23 lattice, every rate
operation is rounded through float32 with `Math.fround`, the two subtractions of
a decay step stay separate because the original performs them separately, and
the rounding rule is `(int)(v + 0.99999f)` rather than a ceiling. This matters
because the simulated corpus is what the inference is judged against; a
simulator that rounded differently would let a rounding bug pass calibration.

Not reproduced: `sead::Random` itself. kabucast draws from its own generator in
the original's draw order, so each draw consumes what the original consumed, but
the bit stream differs. A player cannot observe the game's seed, so nothing in
the product depends on matching it, and the distributions are identical either
way.

The one consequence worth recording is measured rather than assumed. Because the
game computes `rate * base` in float32 and the inversion works in doubles, the
true rate can fall outside the inverted interval. `tests/generator.test.ts`
measures this over 200 000 draws and the excursion stays below 1e-6 in rate
units, which is the tolerance the likelihood will apply.

### D-012 One scenario builder, shared by the simulator and the enumerator

`buildScenario` is the only place that turns phase-length draws into segments.
The simulator samples parameters and calls it; the inference enumerates every
parameter combination and calls the same function. A test samples 200 000
scenarios per pattern and checks the empirical frequencies against the
enumerated probabilities, so the two views cannot drift apart silently.

Rejected: a separate hand-written table of scenarios for the inference. It would
be faster to read and would eventually disagree with the generator.

## Phase 3 — the likelihood

### D-013 Densities are piecewise polynomials in a basis local to each piece

The rate density inside a decreasing phase is exactly a piecewise polynomial:
it starts uniform, restriction cuts pieces without changing degree, and
convolution with the uniform decrement raises the degree by one. Keeping that
representation exactly is what turns the polytope volume into a closed form.

Each piece is stored as coefficients of `(x - left breakpoint)^m` rather than of
`x^m`, and is re-based whenever a cut moves its left breakpoint. Over a phase of
twelve slots the degree reaches eleven, and in a global basis the coefficients
of a degree-eleven polynomial over a piece a hundredth of a unit wide span
thirty orders of magnitude. In a local basis the argument never leaves one piece
width and the terms decay instead.

Rejected: a global monomial basis, for the reason above. Rejected: a grid, which
is what Turnip Prophet does; it is simpler but it is an approximation, and being
exact here is the reason this project exists.

### D-014 The peak of the small spike is integrated, not sampled

The three correlated slots reduce to a one-dimensional integral whose integrand
is `A0 + A1 / v + A2 / v^2` on each piece, so the whole thing is
`A0 v + A1 ln v - A2 / v`. The logarithm and the reciprocal appear only where
their coefficients are non-zero, and in exactly those regions `v` is bounded
away from zero by the constraint that produced the coefficient, so the
singularity at `v = 0` is unreachable rather than merely unlikely.

### D-015 The likelihood primitives are separately testable

`independentProbability`, `decayRunProbability` and `peakProbability` take
intervals rather than prices, so the tests exercise the geometry directly
against a sampler that shares no code with them. Converting a price into an
interval is a separate function with its own tests, which keeps a failure in
the rounding inversion from being mistaken for a failure in the volume.

## Phase 4 — the posterior

### D-016 The posterior is joint over scenario and base price, enumerated in full

A term is a (scenario, base price) pair. With the Sunday price unknown there are
72 scenarios times 21 base prices, so 1512 terms, and every one is evaluated.
The per-pattern, per-scenario and per-base-price figures are marginals of that
one table, which is why they all normalise against the same denominator instead
of being three separate calculations that could disagree.

Enumeration is affordable. Measured over sixty generated weeks per column, with
the Sunday price unknown so that all 21 base prices stay in play:

| Prices observed | Mean | Worst | Terms alive at the worst case |
| --- | --- | --- | --- |
| 0 | 0.83 ms | 2.91 ms | 1512 |
| 1 | 0.68 ms | 1.85 ms | 903 |
| 2 | 1.09 ms | 2.50 ms | 420 |
| 3 | 1.21 ms | 3.51 ms | 219 |
| 6 | 1.32 ms | 3.05 ms | 57 |
| 12 | 1.62 ms | 4.00 ms | 5 |

Four milliseconds against a hundred millisecond budget. No pruning heuristic is
needed and none is used, so no scenario is ever dropped for being unlikely.

### D-017 An input no scenario can produce is reported, not repaired

`computePosterior` returns null when every term has zero weight. It does not
widen the accepted prices, does not clamp an observation into a predicted range,
and does not fall back to a uniform answer.

This fires more often than it might seem, because most price sequences are not
reachable: at a base price of 100, a Monday morning of 93 followed by a Monday
afternoon of 88 belongs to no pattern, since 93 requires a high-phase slot and
88 is below every high-phase rate and above every decreasing-phase start. Two
of this phase's own test fixtures had to be replaced after the code correctly
rejected them, which is the behaviour working.

The alternative is Turnip Prophet's fudge factor, rejected in D-009. A number
produced after the data has been altered to fit is not a posterior probability.

## Phase 5 — the selling decision

### D-018 The stopping rule is a Monte Carlo approximation, and says so

The likelihood is exact and D-008 keeps sampling out of it. The decision is a
different problem and gets a different answer, which has to be stated plainly
rather than left to look like the same guarantee.

The value function is `V(t) = max(price now, E[V(t + 1) | everything seen])`.
The conditioning set is the whole price history, because the belief over
scenarios moves with every new price, and exact backward induction over that
belief would branch on every integer price at every remaining slot. There is no
closed form and no tractable exact recursion.

So the induction runs backwards over paths drawn from the posterior, with the
continuation value at each slot fitted by least squares on quantities the seller
can actually see then: the current price, its square, the running maximum, the
ratio to the previous price. That is the Longstaff and Schwartz construction.

Two things keep the reported number honest. The rule is fitted on one sample and
valued on an independent one, so what is reported is the value of a policy that
could really be followed, never the in-sample optimism of the fit. And the
estimate carries its standard error, which is around two bells at the start of a
week and under one bell by midweek.

A test brackets the result: the policy must be worth at least as much as
committing in advance to the first or the last remaining slot, and no more than
perfect foresight. All three bounds are estimated from the same paths.

### D-019 Paths are drawn by inverting distributions, never by rejection

Completing a week under a term means drawing the rate at the first unseen slot
from its filtered density. The first implementation drew the shared rate of a
small spike by rejection, which is exact and was three lines. It failed on real
input: when an observed flank price sits just under an observed peak price the
two constraints overlap in a sliver, the acceptance rate collapses, and the loop
exhausted ten thousand attempts. Both draws now invert a distribution function
by bisection, which has no such failure mode.

### D-020 The sampler interprets flat instructions rather than calling closures

A term was first described by one closure per segment. With more than a thousand
terms alive that put thousands of distinct closures behind a single call site,
the dispatch went megamorphic, and sampling cost more than five times its
arithmetic. Replacing them with a flat list of instructions of one shape, run by
one switch, cut a full recompute from 93 ms to 39 ms in the worst case measured.

Measured over forty generated weeks per column, posterior plus recommendation,
with the Sunday price unknown:

| Prices observed | Mean | Worst | Standard error of the expectation |
| --- | --- | --- | --- |
| 0 | 23.7 ms | 38.7 ms | 1.95 bells |
| 1 | 22.7 ms | 28.7 ms | 1.98 bells |
| 3 | 18.6 ms | 23.6 ms | 1.33 bells |
| 6 | 14.6 ms | 26.4 ms | 0.82 bells |
| 9 | 9.3 ms | 16.3 ms | 0.16 bells |

The path counts were then set from that budget rather than the other way round:
2000 to fit and 4000 to value. This leaves room for a machine several times
slower than the one measured, which is the point of the exercise.
