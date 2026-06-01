import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

const ids = new Set(Array.from(html.matchAll(/id="([^"]+)"/g), (match) => match[1]));
const duplicateIds = Array.from(ids).filter((id) => html.match(new RegExp(`id="${escapeRegExp(id)}"`, "g"))?.length > 1);
const queriedIds = Array.from(js.matchAll(/querySelector\("#([^"]+)"\)/g), (match) => match[1]);
const missingIds = Array.from(new Set(queriedIds.filter((id) => !ids.has(id))));
const replacementFiles = [
  ["index.html", html],
  ["app.js", js],
  ["styles.css", css],
].filter(([, content]) => content.includes("\uFFFD"));

if (duplicateIds.length) {
  throw new Error(`Duplicate HTML ids: ${duplicateIds.join(", ")}`);
}

if (missingIds.length) {
  throw new Error(`Missing HTML ids referenced by app.js: ${missingIds.join(", ")}`);
}

if (replacementFiles.length) {
  throw new Error(`Replacement characters found in: ${replacementFiles.map(([file]) => file).join(", ")}`);
}

console.log("UI validation passed.");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
