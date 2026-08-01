#!/usr/bin/env node
import fs from "fs";
import path from "path";

const ROOT = new URL(".", import.meta.url).pathname;
const SRC  = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

function readDir(dir, base = "") {
  const files = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(files, readDir(path.join(dir, entry.name), rel));
    else files[rel] = fs.readFileSync(path.join(dir, entry.name), "utf8");
  }
  return files;
}

const files = readDir(SRC);
if (!files["index.html"]) { console.error("Error: src/index.html is required"); process.exit(1); }

const MIGRATIONS_DIR = path.join(ROOT, "migrations");
let migrations = [];

if (manifest.storage === "db") {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error('Error: storage:"db" apps must have a migrations/ directory');
    process.exit(1);
  }

  const files_ = fs.readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith(".sql")).sort();
  if (files_.length === 0) {
    console.error("Error: migrations/ must contain at least one .sql file");
    process.exit(1);
  }

  for (const file of files_) {
    const match = file.match(/^(\d+)/);
    if (!match) { console.error(`Error: migration file must start with a number: ${file}`); process.exit(1); }
    const version = parseInt(match[1], 10);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").trim();
    migrations.push({ version, sql });
  }

  const FORBIDDEN = [
    [/\bdrop\s+table\b/i,                      "DROP TABLE is not allowed"],
    [/\bdrop\s+column\b/i,                      "DROP COLUMN is not allowed"],
    [/\brename\s+column\b/i,                    "RENAME COLUMN is not allowed"],
    [/\balter\s+table\b[^;]+\brename\s+to\b/i,  "RENAME TABLE is not allowed"],
    [/\btruncate\b/i,                           "TRUNCATE is not allowed"],
  ];

  for (const m of migrations) {
    for (const [pattern, msg] of FORBIDDEN) {
      if (pattern.test(m.sql)) { console.error(`Error: migration v${m.version}: ${msg}`); process.exit(1); }
    }
    const isCreate = /^\s*create\s+table\b/i.test(m.sql);
    if (isCreate) {
      if (!/\bif\s+not\s+exists\b/i.test(m.sql)) {
        console.error(`Error: migration v${m.version}: CREATE TABLE must use IF NOT EXISTS`); process.exit(1);
      }
    }

  }

  const versions = migrations.map(m => m.version);
  if (new Set(versions).size !== versions.length) {
    console.error("Error: migration versions must be unique"); process.exit(1);
  }

  console.log(`Migrations: ${migrations.length} file(s) validated ✓`);
}

// ── Read scenarios.json (optional per-app behavioral specs) ───────────────────
let scenarios;
const SCENARIOS_FILE = path.join(ROOT, "scenarios.json");
if (fs.existsSync(SCENARIOS_FILE)) {
  scenarios = JSON.parse(fs.readFileSync(SCENARIOS_FILE, "utf8"));
}

// ── Read ui-scenarios.json (optional per-app browser specs) ───────────────────
// Layer 3b: Playwright drives the app's own UI inside the real hub. Shipped in
// the bundle so the hub can collect scenarios from a published bundle, not just
// from a local app dir (see hub DESIGN-app-ui-scenarios.md).
let uiScenarios;
const UI_SCENARIOS_FILE = path.join(ROOT, "ui-scenarios.json");
if (fs.existsSync(UI_SCENARIOS_FILE)) {
  uiScenarios = JSON.parse(fs.readFileSync(UI_SCENARIOS_FILE, "utf8"));
}
const bundle = { manifest, ...(migrations.length ? { migrations } : {}), files, ...(scenarios ? { scenarios } : {}), ...(uiScenarios ? { ui_scenarios: uiScenarios } : {}) };

fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "bundle.json"), JSON.stringify(bundle, null, 2), "utf8");

const totalBytes = Object.values(files).reduce((s, v) => s + v.length, 0);
console.log(`Built ${Object.keys(files).length} file(s) — ${(totalBytes / 1024).toFixed(1)} KB → dist/bundle.json`);
