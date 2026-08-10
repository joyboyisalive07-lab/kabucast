/**
 * Hand-written declarations for the Node built-ins this repository uses.
 *
 * The dependency budget for this project is typescript and esbuild only, so
 * @types/node is not installed. These declarations cover exactly the surface
 * the code touches and are extended when new built-ins are actually used.
 */

declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): Promise<void>;
}

declare module "node:fs" {
  export function writeFileSync(path: string, data: string): void;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function mkdirSync(path: string, options: { readonly recursive: boolean }): void;
}

declare module "node:process" {
  interface Process {
    readonly argv: readonly string[];
    readonly stdout: { write(chunk: string): boolean };
    exit(code?: number): never;
  }
  const process: Process;
  export default process;
}

declare module "node:assert/strict" {
  export function ok(value: unknown, message?: string): void;
  export function equal(actual: unknown, expected: unknown, message?: string): void;
  export function notEqual(actual: unknown, expected: unknown, message?: string): void;
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  export function throws(fn: () => unknown, message?: string): void;
}
