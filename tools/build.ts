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
import { writeIcons } from "./icon.ts";

const OUTPUT_DIRECTORY = "dist";
const CACHE_VERSION_LENGTH = 12;

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

/**
 * A script element ends at the first `</script` in the source, whatever it is
 * quoted inside, so the sequence is broken up before inlining.
 */
function inlineSafe(script: string): string {
  return script.replace(/<\/script/gi, "<\\/script");
}

async function build(): Promise<void> {
  mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

  const icons = writeIcons();
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
  writeFileSync(
    `${OUTPUT_DIRECTORY}/manifest.webmanifest`,
    `${JSON.stringify(MANIFEST, null, 2)}\n`,
  );

  for (const marker of [STYLE_LINK, SCRIPT_TAG, ICON_LINKS]) {
    if (!page.includes(marker)) {
      throw new Error(`index.html no longer carries a tag the offline build replaces: ${marker}`);
    }
  }
  const inlineIcon = `data:image/svg+xml,${encodeURIComponent(icons.svg)}`;
  const offline = page
    .replace(ICON_LINKS, `<link rel="icon" href="${inlineIcon}" type="image/svg+xml" />`)
    .replace(STYLE_LINK, `<style>\n${styles}</style>`)
    .replace(SCRIPT_TAG, `<script type="module">\n${inlineSafe(script)}\n</script>`);
  writeFileSync(`${OUTPUT_DIRECTORY}/kabucast-offline.html`, offline);

  process.stdout.write(
    `dist/ built, cache ${version}, script ${script.length} bytes, ` +
      `icon ${icons.icoBytes} bytes, offline file ${offline.length} bytes\n`,
  );
}

await build();
