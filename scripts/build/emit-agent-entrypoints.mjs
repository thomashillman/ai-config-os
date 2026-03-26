#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const REPO_ROOT = resolve(process.cwd());
const DOCTRINE_ROOT = join(REPO_ROOT, 'shared', 'agent-doctrine');
const GENERATED_HEADER = '> Generated file. Edit doctrine fragments, not this file.';
const SUPPORTED_SURFACES = new Set(['claude', 'codex']);

function sortedMarkdownFiles(dirPath, suffix = '.md') {
  return readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function readSections(dirPath, fileNames) {
  return fileNames
    .map((fileName) => readFileSync(join(dirPath, fileName), 'utf8').trim())
    .filter(Boolean);
}

function overlayFilesForSurface(overlaysDir, surfaceName) {
  const allOverlayFiles = sortedMarkdownFiles(overlaysDir, '.overlay.md');
  const sharedOverlayFiles = allOverlayFiles
    .filter((fileName) => !SUPPORTED_SURFACES.has(fileName.replace('.overlay.md', '')));
  const surfaceOverlayFiles = allOverlayFiles
    .filter((fileName) => fileName === `${surfaceName}.overlay.md`);

  return [...sharedOverlayFiles, ...surfaceOverlayFiles];
}

export function composeForSurface(surfaceName) {
  if (!SUPPORTED_SURFACES.has(surfaceName)) {
    throw new Error(`Unsupported surface: ${surfaceName}`);
  }

  const baseDir = join(DOCTRINE_ROOT, 'base');
  const surfacesDir = join(DOCTRINE_ROOT, 'surfaces');
  const overlaysDir = join(DOCTRINE_ROOT, 'repos', 'ai-config-os');

  const baseSections = readSections(baseDir, sortedMarkdownFiles(baseDir));
  const surfaceSection = readFileSync(join(surfacesDir, `${surfaceName}.md`), 'utf8').trim();
  const overlaySections = readSections(overlaysDir, overlayFilesForSurface(overlaysDir, surfaceName));

  return [GENERATED_HEADER, ...baseSections, surfaceSection, ...overlaySections].join('\n\n').trim() + '\n';
}

function upsertOutput(outputFile, content, checkMode) {
  const outputPath = join(REPO_ROOT, outputFile);
  const current = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : null;

  if (current === content) {
    console.log(`  [ok] ${outputFile} unchanged`);
    return true;
  }

  if (checkMode) {
    console.error(`  [drift] ${outputFile} is out of date`);
    return false;
  }

  writeFileSync(outputPath, content, 'utf8');
  console.log(`  [write] ${outputFile} updated`);
  return true;
}

export function emitEntrypoints({ checkMode = false } = {}) {
  const outputs = [
    { surface: 'claude', outputFile: 'CLAUDE.md' },
    { surface: 'codex', outputFile: 'AGENTS.md' },
  ];

  let allCurrent = true;
  for (const output of outputs) {
    const content = composeForSurface(output.surface);
    const current = upsertOutput(output.outputFile, content, checkMode);
    allCurrent = allCurrent && current;
  }

  return allCurrent;
}

function main() {
  const checkMode = process.argv.includes('--check');
  const ok = emitEntrypoints({ checkMode });

  if (!ok) {
    process.exitCode = 1;
    console.error('\nDoctrine entrypoints are stale. Run: npm run doctrine:build');
    return;
  }

  console.log('\nDoctrine entrypoints are up to date.');
}

main();
