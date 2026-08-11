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

### D-021 The README argues from specifics, not adjectives

Two instructions have to be reconciled. The first said no adjective lists and
badges limited to CI and licence. The second asked for a page that draws people
in and states the advantages plainly. Both are satisfiable at once, because what
actually persuades here is concrete and checkable:

- The lead example is the input `100.88.84.80.76.72.71`. A fall from 72 to 71 is
  a rate step of 0.01 where the generator's smallest is 0.03, and no pattern
  reaches 71 any other way, so no week can produce it. kabucast says the input
  is inconsistent. Turnip Prophet reports 65.7 percent decreasing, 31.4 percent
  large spike, 2.88 percent small spike, with no indication that it widened the
  data to get there. Both are reproducible from a URL, so the reader can check
  in ten seconds rather than take anyone's word.
- The calibration curve from a million simulated weeks, printed as numbers.
- The selling decision, which the existing tool does not compute at all.
- What the two tools agree on. On every reachable input tested they match to the
  three significant figures Turnip Prophet displays, including the per-scenario
  breakdown. Saying so costs nothing and is the reason the one disagreement is
  worth reading.

No screenshot will be staged or drawn by hand; the images are of the interface
actually running, and the calibration plot is generated from the simulation
output committed alongside it. An attractive page that overstates would fail the
same honesty rule as an overconfident probability.

## Phase 7 — the interface

### D-022 The price axis is logarithmic

A week where a large spike is still possible spans about forty bells to six
hundred. On a linear axis the forty-to-a-hundred region a player actually reads
collapses into the bottom eighth of the chart, and the shape of the fan there
becomes unreadable. Prices are a rate times a base price, so they are
multiplicative by construction and a log axis is the natural one; a doubling
occupies the same height wherever it happens.

The axis is labelled as logarithmic on the page rather than left to be inferred.
Rejected: a square-root axis, which compresses less honestly and has no
interpretation; and clipping the possible-maximum line, which would hide the
very thing a spike week needs to show.

### D-023 The fan grows out of the last recorded price

At the last slot the player has entered, the distribution is a point mass: that
price is known. The bands are therefore anchored there with all five percentiles
equal to it, and widen from that point. Starting the fan at the following slot
would draw a gap between what is known and what is forecast, and the two are one
object.

### D-024 Nothing the interface must get right depends on an animation frame

The recompute was first coalesced into `requestAnimationFrame`. Testing found it
silently doing nothing: frame callbacks do not run while a page is not
compositing, so a recompute queued on one can be dropped entirely. It is now
coalesced with a timer.

The chart's transition genuinely needs frames, so it keeps them, but it is
backed by a timer that snaps to the final geometry if the frames never arrive,
and `prefers-reduced-motion` skips the animation rather than shortening it.
Otherwise a chart in a background tab would keep showing the previous week.

### D-025 The chart measures itself in pixels rather than using a fixed grid

The viewBox is set to the element's measured pixel size, so one SVG unit is one
CSS pixel and an eleven-pixel tick label is eleven pixels at 380 wide as well as
at 1280. A fixed viewBox scaled by CSS would have made the same label six pixels
on a phone.

The measurement is taken when the data changes as well as from a resize
observer, for the reason in D-024: an observer is delivered during rendering, so
a chart built before its container was laid out would otherwise keep a stale
viewBox and scale all of its type.

### D-026 Probabilities that survive are never printed as zero

A scenario holding one chance in ten thousand has not been ruled out. Rounding
it to "0%" would claim the arithmetic produced something it did not, so anything
below the displayed precision but above zero is shown as "<0.1%", and the
same rule at the top gives ">99.9%" rather than a premature "100%".

### D-027 Twelve price fields are grouped into six day boxes

The first version laid the twelve half-days out as one flat grid with captions
reading "Mon AM", "PM", "Tue AM" and so on. It fitted, and it was unreadable:
nothing said where one day ended and the next began, so entering Thursday
evening meant counting cells.

Each day is now its own bordered box holding its two half-days, one box per row
on a phone, two from 460 pixels and three from 760. A day box at 380 pixels is
326 wide with two 148-pixel fields in it, which is a comfortable target and
leaves the day name room to be spelled out rather than abbreviated.

### D-028 Seven languages, and a test that keeps them in step

English and Russian were required; German, Spanish, French, Japanese and
Simplified Chinese were added because the game's audience is not
English-speaking and the vocabulary here is small and concrete enough to
translate without guessing. The choice is remembered in local storage and
otherwise taken from the browser's own preference order.

Two tests guard the set rather than trusting it: every language must fill every
key with a non-empty string and match the array lengths of the English table,
and every template must carry exactly the placeholders the English one does. A
translation that dropped `{price}` would otherwise ship a sentence with a hole
in it.

Figures are formatted for the reader's locale, so a thousand groups with a comma
in English and a space in Russian.

### D-029 The permalink lives in the hash, not the query string

A fragment is not sent to the server. Since the whole point is that no price a
player types leaves their machine, putting the state after the `#` keeps that
true even on the hosted build. The language is deliberately excluded: a link
should arrive in the reader's language, not the sender's.

Malformed links load what they can rather than refusing. A link is not a form,
and a truncated one that fills in nine of twelve prices is more useful than an
error.

### D-030 The offline file is the same build, not a second one

`kabucast-offline.html` is `index.html` with the stylesheet link and the script
tag replaced by their own contents, produced in the same run from the same
bytes. There is no separate entry point and no reduced feature set, so the two
artifacts cannot drift. The build asserts that the two tags it replaces are
still present, so a rename in the HTML fails the build rather than silently
producing a page with no styles.

Verified by copying the file alone into a directory where `./main.js` and
`./styles.css` do not exist: it renders, computes, and issues zero resource
requests. Service worker registration is skipped unless the page was served over
http or https, so the file works from the filesystem.

## Phase 9 — icon, executable and documentation

### D-031 The icon is defined once in code and emits both the vector and the raster

`tools/icon.ts` holds the geometry and writes the SVG, the PNG sizes and the
Windows `.ico` from the same numbers, with its own supersampled rasteriser and
its own PNG encoder over `node:zlib`. Two reasons. An SVG file plus separately
exported bitmaps drift the moment one is edited, and rasterising an SVG at build
time would mean a third dependency in a project whose budget is typescript and
esbuild.

The mark is a price line: a level approach, a sharp rise, a faster fall, with
the spike itself in the accent colour and the approaches not. A separate marker
at the apex was tried first and became a blob at sixteen pixels.

### D-032 The executable copies the page out of its bundle before opening it

A one-file PyInstaller build extracts to a temporary directory and deletes it
when the process exits, so handing the browser a path inside that directory is a
race the browser usually loses. The launcher copies the page to a stable
location under the system temporary directory and opens that.

`Path.as_uri()` does the percent-encoding, which is what makes a path with
spaces work. Verified twice: the executable run from
`build\space test folder\` and again with the temporary directory pointed at
`build\temp with spaces\`, which produced
`file:///.../temp%20with%20spaces/kabucast/kabucast-offline.html` and a
byte-identical copy of the page.

### D-033 The screenshots come from headless Chrome, not from a canvas trick

Rasterising the live page inside the browser was tried, by cloning the DOM into
an SVG `foreignObject` and drawing it to a canvas. Chromium taints a canvas that
has drawn a `foreignObject`, so the image cannot be read back. The screenshots
are therefore taken by headless Chrome against the local build, at twice device
scale, once per language. They are of the interface actually running; nothing is
composed by hand.

### D-034 The README argues from the reproducible case

Recorded in D-021 and now carried out. The lead is the input
`100.88.84.80.76.72.71` with a link to each tool, because a reader can check it
in ten seconds. The section immediately after it says where the two tools agree,
which is nearly everywhere, and corrects the common claim that Turnip Prophet
assumes independence inside falling phases. Overstating the difference would
have been easier and would have failed the same honesty rule as an overconfident
probability.

## Phase 10 — publication

### D-035 The release is published by the gh CLI, not by a third-party action

`gh` is already on the runner and is maintained by the same people as the
platform. A third-party release action would be a fourth dependency, in the
supply-chain sense that matters most: it runs with a token that can write to the
repository.

The workflow asserts the artifacts before publishing rather than after: both
files non-empty, the offline page carrying an inline module script and no
reference to an external one. A release with a broken artifact is worse than no
release, and the check costs four lines.

### D-036 The published artifacts were verified by downloading them back

Not by trusting the build. `kabucast-offline.html` was downloaded from the
release and hashed against the local build: identical, which also shows the
bundle is reproducible across machines. It was then served from a directory
where its relative assets do not exist and made to compute, issuing zero
resource requests.

`kabucast.exe` was downloaded and run from a directory whose path contains a
space, with the temporary directory also pointed at one. It dropped a
byte-identical copy of the page and opened
`file:///.../release%20check/temp%20target%20with%20spaces/...`, which is the
percent-encoding that makes such a path work at all.

### D-037 The cold-load claim is a measurement, not an estimate

The site is four requests and 76 KB in total: 2.3 KB of HTML, 9.6 KB of CSS,
63.9 KB of script, 0.5 KB of icon. Fetched cold over the network from GitHub
Pages, each round trip took about 170 ms on the connection measured, and the two
assets are fetched in parallel after the document, so a cold load lands near
350 ms before the recompute, which is about 40 ms at a mobile width. With the
service worker warm, `DOMContentLoaded` was 244 ms and the recommendation was on
screen by the load event at 261 ms.

### D-038 Local tooling is excluded through `.git/info/exclude`, not `.gitignore`

A committed ignore file describes the workbench to everyone who reads the
repository. Naming an editor or a helper directory there says something about
how the work was done rather than what the work is, and it is the kind of detail
that outlives its usefulness immediately.

Build outputs stay in `.gitignore`, because anyone cloning the repository
produces them too. Everything that only exists on one machine goes in
`.git/info/exclude`, which is never committed.

### D-039 The executable is unsigned and the documentation says why

Windows warns about it. Three responses were considered.

Signing properly needs an Authenticode certificate issued against a verified
legal identity, which this project has no way to obtain. A self-signed
certificate was rejected outright: the warning exists because a signature that
vouches for itself proves nothing, so a self-signed build would carry the same
warning while looking like it had been dealt with. Shipping the executable
inside a zip was rejected for being worse than useless — it suppresses the
browser's download prompt without changing a byte of what gets run.

What is offered instead is provenance. Every release is built by the public
workflow in this repository, each artifact carries a GitHub build attestation
verifiable with `gh attestation verify`, and `SHA256SUMS.txt` covers the
downloads. The README states the situation in one paragraph and then points at
the HTML file, which raises no warning anywhere and runs on the phones the
executable never could.

### D-040 A phone gets an installable page, not a smaller program

An executable cannot reach the platform most players hold while checking a
price. The manifest makes the hosted page installable to a home screen, where it
opens without browser chrome and keeps working with no signal, and the icon
generator emits a full-bleed maskable variant so a launcher mask does not crop
into transparent corners.

The manifest is written by the build from the same list the icon generator
produced, rather than kept as a file that would silently fall out of step.

### D-041 A shared link opens on the forecast

A link arrives with prices already in it, so the reader did not type them and
has no reason to be looking at twelve empty fields. The forecast is scrolled up
after two frames, once the chart has taken its height, and only when it is off
screen. A page opened empty is left alone, and if the frames never arrive the
page simply stays where it was.

### D-042 An impossible week names the price that broke it

Saying "these prices cannot happen" and stopping leaves the reader to find the
mistake by eye across twelve fields. The prices are fed in one at a time and the
first prefix with no surviving scenario names the earliest slot that cannot
follow what came before it; that field is outlined and the page offers to clear
it.

The offer is to clear rather than to correct, because the earliest ruled-out
slot is not necessarily the mistyped one. In 88, 84, 80, 76, 72, 71 the
inference stops at the 71, but the typo could as easily have been the 72.
Claiming to know which was meant would be inventing information.

### D-043 Assets carry a content hash and the page is fetched network-first

The service worker was cache-first for everything. That is correct for offline
use and wrong on the visit after a deployment: the reader saw the previous
version once, and only the visit after that got the new one. It is how a stale
interface reaches someone who followed a link from the documentation.

The script and the stylesheet now carry a content hash in their names, which
makes them immutable — a URL can only ever mean one file — so they are served
from the cache without asking. The page itself is fetched from the network and
falls back to the cache, so a deployment lands on the next load and a fresh page
can never be paired with a stale script. `dist/` is emptied before every build,
because a hashed file left behind would be deployed and served to anyone still
holding a reference to it.

### D-044 A documentation link carries its own language

D-029 kept the language out of the permalink so that a link a player sends
arrives in the reader's language. That is right for a shared link and wrong for
a link written inside an English document, which opened in Russian for a Russian
browser.

An `l=` in the hash now wins over browser detection, and the English and Russian
readmes use their own. The copy button still never writes one, and choosing a
language from the menu clears it, so a deliberate choice outranks what a link
asked for.
