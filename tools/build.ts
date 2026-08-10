/**
 * The site build.
 *
 * esbuild bundles the module graph and copies the two static files. There is no
 * framework to configure and no transform beyond bundling, so this stays a
 * script rather than a configuration file.
 *
 * Run with: node tools/build.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import * as esbuild from "esbuild";

const OUTPUT_DIRECTORY = "dist";
const ENTRY = "src/ui/main.ts";

async function build(): Promise<void> {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    sourcemap: false,
    write: false,
    legalComments: "none",
  });

  const script = result.outputFiles?.[0]?.text ?? "";
  writeFileSync(`${OUTPUT_DIRECTORY}/main.js`, script);
  writeFileSync(`${OUTPUT_DIRECTORY}/styles.css`, readFileSync("src/ui/styles.css", "utf8"));
  writeFileSync(`${OUTPUT_DIRECTORY}/index.html`, readFileSync("src/ui/index.html", "utf8"));

  process.stdout.write(`bundled ${script.length} bytes of script into ${OUTPUT_DIRECTORY}/\n`);
}

await build();
