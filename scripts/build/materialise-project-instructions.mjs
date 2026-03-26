#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE_DIR = resolve(SCRIPT_DIR, '..', '..', 'shared', 'agent-doctrine', 'base');
const DEFAULT_CLAUDE_SURFACE = resolve(
  SCRIPT_DIR,
  '..',
  '..',
  'shared',
  'agent-doctrine',
  'surfaces',
  'claude.md'
);
const DEFAULT_CODEX_SURFACE = resolve(
  SCRIPT_DIR,
  '..',
  '..',
  'shared',
  'agent-doctrine',
  'surfaces',
  'codex.md'
);

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    fail(`${flag} requires a value`);
  }
  return value;
}

function parseOverlayFileSpec(spec, overlays) {
  const splitIndex = spec.indexOf('=');
  if (splitIndex === -1) {
    fail(`Invalid --overlay-file value: ${spec}. Expected <surface>=<path>`);
  }

  const surface = spec.slice(0, splitIndex).trim();
  const filePath = spec.slice(splitIndex + 1).trim();
  if (!filePath) {
    fail(`Invalid --overlay-file value: ${spec}. Path must not be empty`);
  }

  if (surface === 'base') {
    overlays.baseOverlayFile = filePath;
    return;
  }

  if (surface === 'claude') {
    overlays.claudeOverlayFile = filePath;
    return;
  }

  if (surface === 'codex' || surface === 'agents') {
    overlays.codexOverlayFile = filePath;
    return;
  }

  fail(`Invalid --overlay-file surface: ${surface}. Use base, claude, codex, or agents`);
}

function parseArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    return { help: true };
  }

  const positional = [];
  const options = {
    dryRun: false,
    claudeOnly: false,
    codexOnly: false,
    overlayDir: null,
    baseOverlayFile: null,
    claudeOverlayFile: null,
    codexOverlayFile: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--claude-only') {
      options.claudeOnly = true;
      continue;
    }

    if (arg === '--codex-only') {
      options.codexOnly = true;
      continue;
    }

    if (arg === '--overlay') {
      options.overlayDir = requireValue(argv, i, arg);
      i++;
      continue;
    }

    if (arg === '--base-overlay-file') {
      options.baseOverlayFile = requireValue(argv, i, arg);
      i++;
      continue;
    }

    if (arg === '--claude-overlay-file') {
      options.claudeOverlayFile = requireValue(argv, i, arg);
      i++;
      continue;
    }

    if (arg === '--codex-overlay-file') {
      options.codexOverlayFile = requireValue(argv, i, arg);
      i++;
      continue;
    }

    if (arg === '--overlay-file') {
      parseOverlayFileSpec(requireValue(argv, i, arg), options);
      i++;
      continue;
    }

    fail(`Unknown argument: ${arg}`);
  }

  if (options.claudeOnly && options.codexOnly) {
    fail('Cannot use --claude-only and --codex-only together');
  }

  if (positional.length !== 1) {
    fail('Usage: node scripts/build/materialise-project-instructions.mjs <target-repo-path> [options]');
  }

  return {
    help: false,
    targetRepoPath: positional[0],
    ...options,
  };
}

function readIfExists(filePath) {
  if (!filePath) return '';
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    fail(`File does not exist: ${filePath}`);
  }
  return readFileSync(resolvedPath, 'utf8').trim();
}

function readRequired(filePath) {
  const resolvedPath = resolve(filePath);
  if (!existsSync(resolvedPath)) {
    fail(`Required file does not exist: ${filePath}`);
  }
  return readFileSync(resolvedPath, 'utf8').trim();
}

function readBaseDefaults(baseDir) {
  const resolvedBaseDir = resolve(baseDir);
  if (!existsSync(resolvedBaseDir)) {
    fail(`Required directory does not exist: ${baseDir}`);
  }

  const files = readdirSync(resolvedBaseDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
    .map(entry => entry.name)
    .sort((a, b) => a.localeCompare(b));

  if (files.length === 0) {
    fail(`No base markdown files found in: ${baseDir}`);
  }

  return files.map(fileName => readRequired(join(resolvedBaseDir, fileName)));
}

function resolveOverlayFiles(overlayDir) {
  if (!overlayDir) {
    return { base: null, claude: null, codex: null };
  }

  const overlayRoot = resolve(overlayDir);
  const candidates = {
    base: ['base.md'],
    claude: ['claude.md', 'CLAUDE.md'],
    codex: ['codex.md', 'AGENTS.md'],
  };

  const resolvedFiles = {};
  for (const [surface, names] of Object.entries(candidates)) {
    const found = names.map(name => join(overlayRoot, name)).find(path => existsSync(path));
    resolvedFiles[surface] = found || null;
  }

  return resolvedFiles;
}

function compose(parts) {
  return (
    parts
      .map(part => part.trim())
      .filter(Boolean)
      .join('\n\n')
      .trim() + '\n'
  );
}

function emitFile(targetPath, content, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] would write ${targetPath} (${Buffer.byteLength(content, 'utf8')} bytes)`);
    return;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, content, 'utf8');
  console.log(`wrote ${targetPath}`);
}

function printHelp() {
  console.log(`
Materialise project instructions into a target repository.

Usage:
  node scripts/build/materialise-project-instructions.mjs <target-repo-path> [options]

Options:
  --overlay <path>              Directory containing optional overlay files
  --overlay-file <spec>         Repeatable explicit overlay, format <surface>=<path>
                                surface: base | claude | codex | agents
  --base-overlay-file <path>    Explicit base overlay file
  --claude-overlay-file <path>  Explicit Claude-only overlay file
  --codex-overlay-file <path>   Explicit Codex-only overlay file
  --claude-only                 Emit only <target>/CLAUDE.md
  --codex-only                  Emit only <target>/AGENTS.md
  --dry-run                     Preview writes without changing files
  --help, -h                    Show this help

Overlay directory file names:
  base.md, claude.md (or CLAUDE.md), codex.md (or AGENTS.md)
`);
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  const targetRepoPath = resolve(parsed.targetRepoPath);
  if (!existsSync(targetRepoPath)) {
    fail(`Target repo path does not exist: ${parsed.targetRepoPath}`);
  }

  const overlayFromDir = resolveOverlayFiles(parsed.overlayDir);
  const baseOverlay = readIfExists(parsed.baseOverlayFile || overlayFromDir.base);
  const claudeOverlay = readIfExists(parsed.claudeOverlayFile || overlayFromDir.claude);
  const codexOverlay = readIfExists(parsed.codexOverlayFile || overlayFromDir.codex);

  const baseDefaults = readBaseDefaults(DEFAULT_BASE_DIR);
  const claudeSurface = readRequired(DEFAULT_CLAUDE_SURFACE);
  const codexSurface = readRequired(DEFAULT_CODEX_SURFACE);

  if (!parsed.codexOnly) {
    const claudeContent = compose([...baseDefaults, claudeSurface, baseOverlay, claudeOverlay]);
    emitFile(join(targetRepoPath, 'CLAUDE.md'), claudeContent, parsed.dryRun);
  }

  if (!parsed.claudeOnly) {
    const codexContent = compose([...baseDefaults, codexSurface, baseOverlay, codexOverlay]);
    emitFile(join(targetRepoPath, 'AGENTS.md'), codexContent, parsed.dryRun);
  }
}

main();
