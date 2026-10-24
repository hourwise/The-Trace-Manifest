// Build-output check for role-gated admin pages (D6). Astro can bundle a
// role-conditional <script> with the wrong script body, so a page must never
// render a script conditionally, and the scripts every role receives on the
// extraction page must contain the read-only audit code.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const RENDER_SCRIPT = /renderScript\(\$\$result\d*,\s*"([^"]+)"\)/g;
// A script inside `{condition && (<script>)}` or a ternary compiles to a
// renderTemplate wrapper directly after `&&`, `?` or `:`.
const CONDITIONAL_PREFIX = /(?:&&|\?|:)\s*renderTemplate`\s*\$\{\s*$/;

/** Script ids a compiled page renders, split by whether they are role/condition gated. */
export function renderedScripts(pageModuleSource) {
  const unconditional = [];
  const conditional = [];
  for (const match of pageModuleSource.matchAll(RENDER_SCRIPT)) {
    const before = pageModuleSource.slice(Math.max(0, match.index - 80), match.index);
    (CONDITIONAL_PREFIX.test(before) ? conditional : unconditional).push(match[1]);
  }
  return { unconditional, conditional };
}

/** Maps a script id to its shipped code: inlined in the manifest or emitted under dist/_astro. */
export function scriptContent(manifest, distDir, scriptId) {
  const inlined = (manifest.inlinedScripts ?? []).find(([id]) => id === scriptId);
  if (inlined) return inlined[1];
  const entry = manifest.entryModules?.[scriptId];
  if (entry && existsSync(join(distDir, entry))) return readFileSync(join(distDir, entry), "utf8");
  return null;
}

export function readManifest(distDir) {
  const serverDir = join(distDir, "_worker.js");
  const file = readdirSync(serverDir).find((name) => /^manifest_.*\.mjs$/.test(name));
  if (!file) throw new Error("Astro server manifest not found in dist/_worker.js.");
  const line = readFileSync(join(serverDir, file), "utf8").split("\n").find((text) => text.startsWith("const manifest = deserializeManifest("));
  if (!line) throw new Error("Serialized Astro manifest not found.");
  return JSON.parse(line.slice("const manifest = deserializeManifest(".length, line.lastIndexOf(")")));
}

function pageModules(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? pageModules(path) : path.endsWith(".mjs") ? [path] : [];
  });
}

export function verifyRoleScripts(distDir) {
  const failures = [];
  const pagesDir = join(distDir, "_worker.js", "pages");
  for (const path of pageModules(pagesDir)) {
    const { conditional } = renderedScripts(readFileSync(path, "utf8"));
    for (const id of conditional) failures.push(`${relative(distDir, path)} renders a <script> conditionally (${id.split("?")[0].split("/").slice(-1)[0]})`);
  }

  const extraction = join(pagesDir, "admin", "extract-claims.astro.mjs");
  if (!existsSync(extraction)) {
    failures.push("dist/_worker.js/pages/admin/extract-claims.astro.mjs is missing");
  } else {
    const manifest = readManifest(distDir);
    const { unconditional } = renderedScripts(readFileSync(extraction, "utf8"));
    const contents = unconditional.map((id) => scriptContent(manifest, distDir, id));
    if (contents.some((content) => content === null)) failures.push("an extraction-page script could not be resolved in the build output");
    const everyRole = contents.filter(Boolean).join("\n");
    if (!everyRole.includes("recent-extraction-runs")) failures.push("readers do not receive the extraction audit code on /admin/extract-claims");
    if (!everyRole.includes("extract-form")) failures.push("the extraction run handler is missing from /admin/extract-claims");
  }
  return failures;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const failures = verifyRoleScripts("dist");
  if (failures.length) {
    console.error(failures.map((failure) => `- ${failure}`).join("\n"));
    process.exit(1);
  }
  console.log("Role-gated admin scripts render for every role; readers receive the extraction audit code.");
}
