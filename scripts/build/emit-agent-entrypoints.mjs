#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'fs';
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

function composeForSurface(surfaceName) {
  if (!SUPPORTED_SURFACES.has(surfaceName)) {
    throw new Error(`Unsupported surface: ${surfaceName}`);
  }

  const baseDir = join(DOCTRINE_ROOT, 'base');
  const surfacesDir = join(DOCTRINE_ROOT, 'surfaces');
  const overlaysDir = join(DOCTRINE_ROOT, 'repos', 'ai-config-os');

  const baseSections = readSections(baseDir, sortedMarkdownFiles(baseDir));
  const surfaceSection = readFileSync(join(surfacesDir, `${surfaceName}.md`), 'utf8').trim();
  const overlaySections = readSections(overlaysDir, sortedMarkdownFiles(overlaysDir, '.overlay.md'));

  return [GENERATED_HEADER, ...baseSections, surfaceSection, ...overlaySections].join('\n\n').trim() + '\n';
}

function emitEntrypoints() {
  const outputs = [
    { surface: 'claude', outputFile: 'CLAUDE.md' },
    { surface: 'codex', outputFile: 'AGENTS.md' }
  ];

  for (const output of outputs) {
    const content = composeForSurface(output.surface);
    writeFileSync(join(REPO_ROOT, output.outputFile), content, 'utf8');
    console.log(`Wrote ${output.outputFile}`);
  }
}

emitEntrypoints();
