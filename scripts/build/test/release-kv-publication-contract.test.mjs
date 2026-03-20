import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

const workflow = readFileSync(join(REPO_ROOT, '.github', 'workflows', 'build.yml'), 'utf8');
const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));

test('build_workflow_invokes_kv_upload_on_main_linux_release_path', () => {
  assert.match(
    workflow,
    /Build with provenance \(release mode\)[\s\S]*?(Upload Claude package to KV|deploy:upload-kv|upload-skills-kv\.mjs)/,
  );
  assert.match(workflow, /if:\s*runner\.os == 'Linux'\s*&&\s*github\.event_name == 'push'\s*&&\s*github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/);
  assert.match(workflow, /MANIFEST_KV_NAMESPACE_ID:\s*\$\{\{\s*secrets\.MANIFEST_KV_NAMESPACE_ID\s*\}\}/);
  assert.match(workflow, /(node scripts\/build\/upload-skills-kv\.mjs|npm run deploy:upload-kv)/);
});

test('package_json_exposes_deploy_upload_kv_script', () => {
  assert.equal(pkg.scripts['deploy:upload-kv'], 'node scripts/build/upload-skills-kv.mjs');
});
