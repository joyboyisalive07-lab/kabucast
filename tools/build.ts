/**
 * The site build.
 *
 * Produces the hosted build in dist/ and, from the same bundle, the
 * self-contained kabucast-offline.html. The single file is not a lesser copy:
 * it is the same script and the same stylesheet with the two link elements
 * replaced by their contents, so the two artifacts cannot drift apart.
 *
 * The hosted assets carry a content hash in their names. That is what lets the
 * service worker treat them as immutable and fetch the page itself
 * network-first, so a deployment is picked up on the next load instead of the
 * one after it, and a fresh page can never be paired with a stale script.
 *
 * Run with: node tools/build.ts
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";
import * as esbuild from "esbuild";
import { writeIcons } from "./icon.ts";

const OUTPUT_DIRECTORY = "dist";
const HASH_LENGTH = 12;

const STYLE_LINK = '<link rel="stylesheet" href="./styles.css" />';
const SCRIPT_TAG = '<script type="module" src="./main.js"></script>';
const ICON_LINKS =
  '<link rel="icon" href="./icon.svg" type="image/svg+xml" />' +
  '<link rel="icon" href="./icon-32.png" sizes="32x32" />' +
  '<link rel="apple-touch-icon" href="./icon-128.png" />' +
  '<link rel="manifest" href="./manifest.webmanifest" />';

/**
 * Installing the page onto a home screen is how this reaches a phone, where an
 * executable is not an option at all. The manifest is written here rather than
 * kept as a file so the icon list cannot fall out of step with what the icon
 * generator actually produced.
 */
const MANIFEST = {
  name: "kabucast",
  short_name: "kabucast",
  description:
    "Turnip price predictor for Animal Crossing: New Horizons. Posterior probabilities and a selling decision.",
  start_url: "./",
  scope: "./",
  display: "standalone",
  orientation: "portrait-primary",
  background_color: "#101316",
  theme_color: "#101316",
  icons: [
    { src: "./icon.svg", sizes: "any", type: "image/svg+xml" },
    { src: "./icon-64.png", sizes: "64x64", type: "image/png" },
    { src: "./icon-128.png", sizes: "128x128", type: "image/png" },
    { src: "./icon-256.png", sizes: "256x256", type: "image/png" },
    {
      src: "./icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
  ],
} as const;

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

function digest(...parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest("hex").slice(0, HASH_LENGTH);
}

/**
 * A script element ends at the first `</script` in the source, whatever it is
 * quoted inside, so the sequence is broken up before inlining.
 */
function inlineSafe(script: string): string {
  return script.replace(/<\/script/gi, "<\\/script");
}

async function build(): Promise<void> {
  // Emptied first: asset names carry a content hash, so a stale one left behind
  // would be deployed alongside the new one and served to anyone still holding
  // a reference to it.
  rmSync(OUTPUT_DIRECTORY, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

  const icons = writeIcons();
  const script = await bundle("src/ui/main.ts", {});
  const styles = readFileSync("src/ui/styles.css", "utf8");
  const page = readFileSync("src/ui/index.html", "utf8");

  for (const marker of [STYLE_LINK, SCRIPT_TAG, ICON_LINKS]) {
    if (!page.includes(marker)) {
      throw new Error(`index.html no longer carries a tag the build replaces: ${marker}`);
    }
  }

  const scriptName = `main.${digest(script)}.js`;
  const styleName = `styles.${digest(styles)}.css`;
  const manifest = `${JSON.stringify(MANIFEST, null, 2)}\n`;

  const hosted = page
    .replace(STYLE_LINK, `<link rel="stylesheet" href="./${styleName}" />`)
    .replace(SCRIPT_TAG, `<script type="module" src="./${scriptName}"></script>`);

  const serviceWorker = await bundle("src/ui/service-worker.ts", {
    __CACHE_VERSION__: JSON.stringify(digest(script, styles, hosted, manifest)),
    __IMMUTABLE_ASSETS__: JSON.stringify([`./${scriptName}`, `./${styleName}`]),
  });

  writeFileSync(`${OUTPUT_DIRECTORY}/${scriptName}`, script);
  writeFileSync(`${OUTPUT_DIRECTORY}/${styleName}`, styles);
  writeFileSync(`${OUTPUT_DIRECTORY}/index.html`, hosted);
  writeFileSync(`${OUTPUT_DIRECTORY}/service-worker.js`, serviceWorker);
  writeFileSync(`${OUTPUT_DIRECTORY}/manifest.webmanifest`, manifest);

  const inlineIcon = `data:image/svg+xml,${encodeURIComponent(icons.svg)}`;
  const offline = page
    .replace(ICON_LINKS, `<link rel="icon" href="${inlineIcon}" type="image/svg+xml" />`)
    .replace(STYLE_LINK, `<style>\n${styles}</style>`)
    .replace(SCRIPT_TAG, `<script type="module">\n${inlineSafe(script)}\n</script>`);
  writeFileSync(`${OUTPUT_DIRECTORY}/kabucast-offline.html`, offline);

  process.stdout.write(
    `dist/ built: ${scriptName}, ${styleName}, icon ${icons.icoBytes} bytes, ` +
      `offline file ${offline.length} bytes\n`,
  );
}

await build();
