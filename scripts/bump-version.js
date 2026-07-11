#!/usr/bin/env node
/**
 * Bumps expo.version in app.json, mirroring the way EAS auto-increments
 * versionCode / buildNumber for every build.
 *
 * The `version` field (user-facing semver, e.g. 1.0.0) is NOT auto-incremented
 * by EAS even when `autoIncrement` is on — EAS only bumps versionCode/buildNumber.
 * Run this before an `eas build` to bump the local semver by one.
 *
 * Usage:
 *   node scripts/bump-version.js            # patch bump  1.0.0 -> 1.0.1  (default)
 *   node scripts/bump-version.js patch      # same as above
 *   node scripts/bump-version.js minor      # 1.0.5 -> 1.1.0
 *   node scripts/bump-version.js major      # 1.4.2 -> 2.0.0
 *   node scripts/bump-version.js 3.2.1      # set an explicit version
 */

const fs = require('fs');
const path = require('path');

const APP_JSON = path.join(__dirname, '..', 'app.json');
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

const arg = (process.argv[2] || 'patch').trim();

const raw = fs.readFileSync(APP_JSON, 'utf8');
const appJson = JSON.parse(raw);

const current = appJson.expo && appJson.expo.version;
if (typeof current !== 'string' || !SEMVER_RE.test(current)) {
  console.error(
    `❌ expo.version in app.json must be an x.y.z semver string (found: ${JSON.stringify(current)}).`
  );
  process.exit(1);
}

let next;
if (SEMVER_RE.test(arg)) {
  // Explicit version supplied.
  next = arg;
} else {
  const [, major, minor, patch] = current.match(SEMVER_RE).map(Number);
  switch (arg) {
    case 'major':
      next = `${major + 1}.0.0`;
      break;
    case 'minor':
      next = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
      next = `${major}.${minor}.${patch + 1}`;
      break;
    default:
      console.error(
        `❌ Unknown argument "${arg}". Use: patch | minor | major | <x.y.z>`
      );
      process.exit(1);
  }
}

appJson.expo.version = next;

// Preserve the existing 2-space indentation and trailing newline.
const hadTrailingNewline = raw.endsWith('\n');
fs.writeFileSync(
  APP_JSON,
  JSON.stringify(appJson, null, 2) + (hadTrailingNewline ? '\n' : '')
);

console.log(`✅ app.json version bumped: ${current} -> ${next}`);
