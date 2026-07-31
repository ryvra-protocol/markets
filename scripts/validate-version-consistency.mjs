import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const changelog = readFileSync(resolve(root, "CHANGELOG.md"), "utf8");
const rcDoc = readFileSync(resolve(root, "docs/release-candidate.md"), "utf8");
const matrixDoc = readFileSync(resolve(root, "docs/compatibility-matrix.md"), "utf8");

const version = packageJson.version;
const requiredMarkers = [
  `## [${version}]`,
  `Release candidate: \`${version}\``,
  `Release baseline: \`${version}\``
];

const targets = [changelog, rcDoc, matrixDoc];
const missing = requiredMarkers.filter((marker, index) => !targets[index].includes(marker));

if (missing.length > 0) {
  console.error("Version consistency validation failed.");
  for (const marker of missing) {
    console.error(`Missing marker: ${marker}`);
  }
  process.exit(1);
}

console.log(`Version consistency validation passed for ${version}.`);
