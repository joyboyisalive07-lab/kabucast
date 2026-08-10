/**
 * The site build.
 *
 * Produces the hosted build in dist/ and, from the same bundle, the
 * self-contained kabucast-offline.html. The single file is not a lesser copy:
 * it is the same script and the same stylesheet with the two link elements
 * replaced by their contents, so the two artifacts cannot drift apart.
 *
 * Run with: node tools/build.ts
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import * as esbuild from "esbuild";

const OUTPUT_DIRECTORY = "dist";
const CACHE_VERSION_LENGTH = 12;

const STYLE_LINK = '<link rel="stylesheet" href="./styles.css" />';
const SCRIPT_TAG = '<script type="module" src="./main.js"></script>';

async function bundle(entry: string, define: Readonly<Record<string, string>>): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: "esm",
    target: "es2022",
    minify: true,
    sourcemap: false,
    write: false,
    legalComments: "none",
    define,
  });
  return result.outputFiles?.[0]?.text ?? "";
}

/**
 * A script element ends at the first `</script` in the source, whatever it is
 * quoted inside, so the sequence is broken up before inlining.
 */
function inlineSafe(script: string): string {
  return script.replace(/<\/script/gi, "<\\/script");
}

async function build(): Promise<void> {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

  const script = await bundle("src/ui/main.ts", {});
  const styles = readFileSync("src/ui/styles.css", "utf8");
  const page = readFileSync("src/ui/index.html", "utf8");

  const version = createHash("sha256")
    .update(script)
    .update(styles)
    .update(page)
    .digest("hex")
    .slice(0, CACHE_VERSION_LENGTH);

  const serviceWorker = await bundle("src/ui/service-worker.ts", {
    __CACHE_VERSION__: JSON.stringify(version),
  });

  writeFileSync(`${OUTPUT_DIRECTORY}/main.js`, script);
  writeFileSync(`${OUTPUT_DIRECTORY}/styles.css`, styles);
  writeFileSync(`${OUTPUT_DIRECTORY}/index.html`, page);
  writeFileSync(`${OUTPUT_DIRECTORY}/service-worker.js`, serviceWorker);

  if (!page.includes(STYLE_LINK) || !page.includes(SCRIPT_TAG)) {
    throw new Error("index.html no longer carries the tags the offline build replaces");
  }
  const offline = page
    .replace(STYLE_LINK, `<style>\n${styles}</style>`)
    .replace(SCRIPT_TAG, `<script type="module">\n${inlineSafe(script)}\n</script>`);
  writeFileSync(`${OUTPUT_DIRECTORY}/kabucast-offline.html`, offline);

  process.stdout.write(
    `dist/ built, cache ${version}, script ${script.length} bytes, ` +
      `offline file ${offline.length} bytes\n`,
  );
}

await build();
