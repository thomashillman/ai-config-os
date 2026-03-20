import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { safeImport } from '../lib/windows-safe-import.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCRIPT_PATH = join(REPO_ROOT, 'scripts', 'build', 'upload-skills-kv.mjs');

function createClaudeDistFixture(mutator = () => {}) {
  const root = mkdtempSync(join(tmpdir(), 'upload-skills-kv-'));
  const distDir = join(root, 'dist', 'clients', 'claude-code');
  const pluginDir = join(distDir, '.claude-plugin');
  const skillDir = join(distDir, 'skills', 'debug');

  mkdirSync(pluginDir, { recursive: true });
  mkdirSync(join(skillDir, 'prompts'), { recursive: true });

  writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
    version: '9.9.9',
    skills: [
      { name: 'debug', path: 'skills/debug/SKILL.md' },
    ],
  }, null, 2));
  writeFileSync(join(skillDir, 'SKILL.md'), '# Debug\nUse this skill.\n');
  writeFileSync(join(skillDir, 'prompts', 'brief.md'), 'Be brief.\n');
  writeFileSync(join(skillDir, 'notes.txt'), 'nested file\n');

  mutator({ root, distDir, pluginDir, skillDir });

  return { root, distDir };
}

test('buildSkillsPackage_embeds_skill_files_from_dist', async () => {
  const { buildSkillsPackage } = await safeImport('../upload-skills-kv.mjs', import.meta.url);
  const fixture = createClaudeDistFixture();

  try {
    const result = buildSkillsPackage({ distDir: fixture.distDir });

    assert.equal(result.package.version, '9.9.9');
    assert.deepEqual(Object.keys(result.package.skills), ['debug']);
    assert.equal(result.package.skills.debug['SKILL.md'], '# Debug\nUse this skill.\n');
    assert.equal(result.package.skills.debug['prompts/brief.md'], 'Be brief.\n');
    assert.equal(result.package.skills.debug['notes.txt'], 'nested file\n');
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('buildSkillsPackage_fails_when_plugin_json_missing', async () => {
  const { buildSkillsPackage } = await safeImport('../upload-skills-kv.mjs', import.meta.url);
  const fixture = createClaudeDistFixture(({ pluginDir }) => {
    rmSync(join(pluginDir, 'plugin.json'));
  });

  try {
    assert.throws(
      () => buildSkillsPackage({ distDir: fixture.distDir }),
      /plugin\.json/i,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('buildSkillsPackage_fails_when_version_missing', async () => {
  const { buildSkillsPackage } = await safeImport('../upload-skills-kv.mjs', import.meta.url);
  const fixture = createClaudeDistFixture(({ pluginDir }) => {
    writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({
      skills: [{ name: 'debug', path: 'skills/debug/SKILL.md' }],
    }, null, 2));
  });

  try {
    assert.throws(
      () => buildSkillsPackage({ distDir: fixture.distDir }),
      /missing version/i,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('buildSkillsPackage_fails_when_skills_array_missing', async () => {
  const { buildSkillsPackage } = await safeImport('../upload-skills-kv.mjs', import.meta.url);
  const fixture = createClaudeDistFixture(({ pluginDir }) => {
    writeFileSync(join(pluginDir, 'plugin.json'), JSON.stringify({ version: '9.9.9' }, null, 2));
  });

  try {
    assert.throws(
      () => buildSkillsPackage({ distDir: fixture.distDir }),
      /skills array/i,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('buildSkillsPackage_fails_when_skill_has_no_skill_md', async () => {
  const { buildSkillsPackage } = await safeImport('../upload-skills-kv.mjs', import.meta.url);
  const fixture = createClaudeDistFixture(({ skillDir }) => {
    rmSync(join(skillDir, 'SKILL.md'));
  });

  try {
    assert.throws(
      () => buildSkillsPackage({ distDir: fixture.distDir }),
      /missing SKILL\.md/i,
    );
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test('uploadToKV_surfaces_cloudflare_error_when_runner_fails_without_stderr', async () => {
  const { uploadToKV } = await safeImport('../upload-skills-kv.mjs', import.meta.url);

  assert.throws(
    () => uploadToKV(
      { version: '9.9.9', skills: { debug: { 'SKILL.md': '# Debug\n' } } },
      {
        env: {
          CLOUDFLARE_ACCOUNT_ID: 'acct-123',
          CLOUDFLARE_API_TOKEN: 'token-123',
          MANIFEST_KV_NAMESPACE_ID: 'kv-123',
        },
        runner: () => ({
          status: 22,
          stdout: JSON.stringify({
            success: false,
            errors: [{ message: 'Authentication error' }],
          }),
          stderr: null,
        }),
        logger: () => {},
      },
    ),
    /Authentication error/,
  );
});

test('uploadToKV_streams_json_to_curl_without_shell_wrapping', async () => {
  const { uploadToKV } = await safeImport('../upload-skills-kv.mjs', import.meta.url);
  const calls = [];

  uploadToKV(
    { version: '9.9.9', skills: { debug: { 'SKILL.md': '# Debug\n' } } },
    {
      env: {
        CLOUDFLARE_ACCOUNT_ID: 'acct-123',
        CLOUDFLARE_API_TOKEN: 'token-123',
        MANIFEST_KV_NAMESPACE_ID: 'kv-123',
      },
      runner: (command, args, options) => {
        calls.push({ command, args, options });
        return {
          status: 0,
          stdout: JSON.stringify({ success: true }),
          stderr: '',
        };
      },
      logger: () => {},
    },
  );

  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.command, 'curl');
    assert.ok(call.args.includes('--fail-with-body'));
    assert.ok(call.args.includes('--data-binary'));
    assert.ok(call.args.includes('@-'));
    assert.equal(
      call.options.input,
      JSON.stringify({ version: '9.9.9', skills: { debug: { 'SKILL.md': '# Debug\n' } } }),
    );
  }
});

test('upload_skills_kv_dry_run_prints_target_keys_without_upload', () => {
  const fixture = createClaudeDistFixture();

  try {
    const result = spawnSync(process.execPath, [SCRIPT_PATH, '--dry-run'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        AI_CONFIG_OS_DIST_CLAUDE_CODE_DIR: fixture.distDir,
      },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /claude-code-package:9\.9\.9/);
    assert.match(result.stdout, /claude-code-package:latest/);
    assert.doesNotMatch(result.stdout, /Uploading to KV namespace/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
