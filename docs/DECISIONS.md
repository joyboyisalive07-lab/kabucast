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
