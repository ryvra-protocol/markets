import { accessSync, constants } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const required = [
  "CHANGELOG.md",
  "docs/release-candidate.md",
  "docs/compatibility-matrix.md",
  "docs/staging-http-mode-verification.md",
  "docs/production-cutover-runbook.md",
  "docs/rollback-runbook.md",
  "docs/incident-response-template.md",
  "docs/dependency-policy.md",
  "docs/branch-protection-required-settings.md",
  "docs/production-ready-checklist.md"
];

const missing = [];
for (const file of required) {
  try {
    accessSync(resolve(root, file), constants.R_OK);
  } catch {
    missing.push(file);
  }
}

if (missing.length > 0) {
  console.error("Missing required rollout docs/artifacts:");
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

console.log("Rollout docs/artifacts check passed.");
