import { join, resolve } from 'node:path';

function detectProvider(env) {
  if (env.CLAUDE_CODE_REMOTE === 'true' || env.CLAUDE_PROJECT_DIR || env.CLAUDE_CODE_ENTRYPOINT) {
    return 'claude';
  }

  if (env.CURSOR_SESSION || env.CURSOR_TRACE_ID) {
    return 'cursor';
  }

  if (env.CODEX_SURFACE || env.CODEX_CLI || env.CODEX_HOME) {
    return 'codex';
  }

  return 'unknown';
}

function createClaudeContext({ env, cwd, home, repoRoot }) {
  const projectDir = env.CLAUDE_PROJECT_DIR || repoRoot;
  const materialiseScript = join(repoRoot, 'adapters', 'claude', 'materialise.sh');

  return {
    provider: 'claude',
    startup: {
      shouldInstallOnStart: env.CLAUDE_CODE_REMOTE === 'true',
    },
    capabilities: {
      can_fetch_bundle: Boolean(env.AI_CONFIG_WORKER),
      can_auth_bundle_source: Boolean(env.AI_CONFIG_TOKEN),
      can_materialize_skills: true,
      can_write_target: true,
      can_validate: true,
      can_probe_runtime: true,
      can_sync_runtime: true,
    },
    paths: {
      repo_root: projectDir,
      local_bundle: join(projectDir, 'dist', 'clients', 'claude-code'),
      cache_dir: join(home, '.ai-config-os', 'cache', 'claude-code'),
      target_path: join(home, '.claude', 'skills'),
    },
    auth: {
      strategy: env.AI_CONFIG_TOKEN ? 'bearer' : 'none',
      headers: env.AI_CONFIG_TOKEN ? ['Authorization: Bearer ${AI_CONFIG_TOKEN}'] : [],
    },
    commands: {
      remote_install: ['bash', materialiseScript, 'bootstrap'],
      acquire_local_bundle: ['node', join(projectDir, 'scripts', 'build', 'compile.mjs')],
      materialize_local: ['bash', materialiseScript, 'extract'],
      install_target: ['bash', materialiseScript, 'install'],
      deferred: [
        {
          phase: 'probe_runtime',
          required_capability: 'can_probe_runtime',
          command: ['bash', join(projectDir, 'ops', 'capability-probe.sh'), '--quiet'],
        },
        {
          phase: 'validate',
          required_capability: 'can_validate',
          command: ['bash', join(projectDir, 'ops', 'validate-all.sh')],
        },
        {
          phase: 'summarize_skills',
          required_capability: 'can_validate',
          command: ['node', join(projectDir, 'adapters', 'claude', 'filter-skills-cli.mjs'), '--summary'],
        },
        {
          phase: 'generate_commands',
          required_capability: 'can_validate',
          command: ['node', join(projectDir, 'adapters', 'claude', 'generate-commands.mjs'), '--project-dir', projectDir],
        },
        {
          phase: 'sync_runtime',
          required_capability: 'can_sync_runtime',
          command: ['bash', join(projectDir, 'runtime', 'sync.sh'), '--dry-run'],
        },
      ],
    },
  };
}

function createCodexContext({ env, home, repoRoot }) {
  const materialiseScript = join(repoRoot, 'adapters', 'codex', 'materialise.sh');

  return {
    provider: 'codex',
    startup: {
      shouldInstallOnStart: false,
    },
    capabilities: {
      can_fetch_bundle: Boolean(env.AI_CONFIG_WORKER),
      can_auth_bundle_source: Boolean(env.AI_CONFIG_TOKEN),
      can_materialize_skills: true,
      can_write_target: true,
      can_validate: false,
      can_probe_runtime: false,
      can_sync_runtime: false,
    },
    paths: {
      repo_root: repoRoot,
      local_bundle: join(repoRoot, 'dist', 'clients', 'codex'),
      cache_dir: join(home, '.ai-config-os', 'cache', 'codex'),
      target_path: join(home, '.codex', 'AGENTS.md'),
    },
    auth: {
      strategy: env.AI_CONFIG_TOKEN ? 'bearer' : 'none',
      headers: env.AI_CONFIG_TOKEN ? ['Authorization: Bearer ${AI_CONFIG_TOKEN}'] : [],
    },
    commands: {
      acquire_local_bundle: ['node', join(repoRoot, 'scripts', 'build', 'compile.mjs')],
      materialize_local: ['bash', materialiseScript, 'extract'],
      install_target: ['bash', materialiseScript, 'install'],
      deferred: [],
    },
  };
}

function createCursorContext({ home, repoRoot }) {
  return {
    provider: 'cursor',
    startup: {
      shouldInstallOnStart: false,
    },
    capabilities: {
      can_fetch_bundle: false,
      can_auth_bundle_source: false,
      can_materialize_skills: false,
      can_write_target: true,
      can_validate: false,
      can_probe_runtime: false,
      can_sync_runtime: false,
    },
    paths: {
      repo_root: repoRoot,
      local_bundle: join(repoRoot, 'dist', 'clients', 'cursor'),
      cache_dir: join(home, '.ai-config-os', 'cache', 'cursor'),
      target_path: join(repoRoot, '.cursorrules'),
    },
    auth: {
      strategy: 'none',
      headers: [],
    },
    commands: {
      acquire_local_bundle: ['node', join(repoRoot, 'scripts', 'build', 'compile.mjs')],
      install_target: ['bash', join(repoRoot, 'adapters', 'cursor', 'install.sh'), repoRoot],
      deferred: [],
    },
  };
}

export function resolveProviderContext({ env = process.env, cwd = process.cwd(), home } = {}) {
  const resolvedHome = home || env.HOME || env.USERPROFILE || cwd;
  const repoRoot = resolve(cwd);
  const provider = detectProvider(env);

  switch (provider) {
    case 'claude':
      return createClaudeContext({ env, cwd, home: resolvedHome, repoRoot });
    case 'codex':
      return createCodexContext({ env, home: resolvedHome, repoRoot });
    case 'cursor':
      return createCursorContext({ home: resolvedHome, repoRoot });
    default:
      return {
        provider: 'unknown',
        startup: {
          shouldInstallOnStart: false,
        },
        capabilities: {
          can_fetch_bundle: false,
          can_auth_bundle_source: false,
          can_materialize_skills: false,
          can_write_target: false,
          can_validate: false,
          can_probe_runtime: false,
          can_sync_runtime: false,
        },
        paths: {
          repo_root: repoRoot,
          local_bundle: null,
          cache_dir: null,
          target_path: null,
        },
        auth: {
          strategy: 'none',
          headers: [],
        },
        commands: {
          deferred: [],
        },
      };
  }
}
