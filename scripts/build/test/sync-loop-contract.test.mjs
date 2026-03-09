import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import http from 'node:http';

const REPO_ROOT = resolve(new URL('../../..', import.meta.url).pathname);
const MATERIALISE_SH = join(REPO_ROOT, 'adapters/claude/materialise.sh');

const tempDirs = [];
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop(), { recursive: true, force: true });
});

function makeHome() {
  const dir = mkdtempSync(join(tmpdir(), 'sync-loop-test-'));
  tempDirs.push(dir);
  return dir;
}

function cachePaths(homeDir) {
  const cacheDir = join(homeDir, '.ai-config-os/cache/claude-code');
  mkdirSync(cacheDir, { recursive: true });
  return {
    cacheDir,
    latest: join(cacheDir, 'latest.json'),
    etag: join(cacheDir, 'latest.etag'),
    version: join(cacheDir, 'latest.version'),
  };
}

function runFetch({ homeDir, workerUrl, token = 'test-token' }) {
  return new Promise((resolveFetch) => {
    const proc = spawn('bash', [MATERIALISE_SH, 'fetch'], {
      cwd: REPO_ROOT,
      env: { ...process.env, HOME: homeDir, AI_CONFIG_WORKER: workerUrl, AI_CONFIG_TOKEN: token, NO_PROXY: '127.0.0.1,localhost' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += String(d); });
    proc.stderr.on('data', (d) => { stderr += String(d); });
    proc.on('close', (status) => resolveFetch({ status, stdout, stderr }));
  });
}

async function withMockServer(handler, fn) {
  const server = http.createServer(handler);
  await new Promise((resolveReady) => server.listen(0, '127.0.0.1', resolveReady));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

describe('sync loop fetch contract (etag + version pointer)', () => {
  test('initial fetch stores both payload version and ETag', async () => {
    const seen = [];
    await withMockServer((req, res) => {
      seen.push(req.headers);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('ETag', '"etag-v1"');
      res.end(JSON.stringify({ version: '1.0.0', skills: [{ id: 'a' }] }));
    }, async (baseUrl) => {
      const homeDir = makeHome();
      const result = await runFetch({ homeDir, workerUrl: baseUrl });
      assert.equal(result.status, 0, result.stderr);

      const files = cachePaths(homeDir);
      assert.equal(JSON.parse(readFileSync(files.latest, 'utf8')).version, '1.0.0');
      assert.equal(readFileSync(files.etag, 'utf8'), '"etag-v1"');
      assert.equal(readFileSync(files.version, 'utf8'), '1.0.0');
    });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].authorization, 'Bearer test-token');
    assert.equal(seen[0]['if-none-match'], undefined);
  });

  test('subsequent request sends If-None-Match and 304 keeps version pointer unchanged', async () => {
    let callCount = 0;
    const ifNoneMatch = [];

    await withMockServer((req, res) => {
      callCount += 1;
      ifNoneMatch.push(req.headers['if-none-match']);
      if (callCount === 1) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('ETag', '"etag-v1"');
        res.end(JSON.stringify({ version: '1.0.0', skills: [] }));
      } else {
        res.statusCode = 304;
        res.end();
      }
    }, async (baseUrl) => {
      const homeDir = makeHome();
      assert.equal((await runFetch({ homeDir, workerUrl: baseUrl })).status, 0);

      const files = cachePaths(homeDir);
      const beforeVersion = readFileSync(files.version, 'utf8');
      const beforePayload = readFileSync(files.latest, 'utf8');

      const second = await runFetch({ homeDir, workerUrl: baseUrl });
      assert.equal(second.status, 0, second.stderr);

      assert.equal(readFileSync(files.version, 'utf8'), beforeVersion);
      assert.equal(readFileSync(files.latest, 'utf8'), beforePayload);
    });

    assert.deepEqual(ifNoneMatch, [undefined, '"etag-v1"']);
  });

  test('200 with new ETag updates payload and version pointer atomically', async () => {
    let callCount = 0;

    await withMockServer((req, res) => {
      callCount += 1;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      if (callCount === 1) {
        res.setHeader('ETag', '"etag-v1"');
        res.end(JSON.stringify({ version: '1.0.0', skills: [{ id: 'a' }] }));
      } else {
        res.setHeader('ETag', '"etag-v2"');
        res.end(JSON.stringify({ version: '2.0.0', skills: [{ id: 'b' }] }));
      }
    }, async (baseUrl) => {
      const homeDir = makeHome();
      assert.equal((await runFetch({ homeDir, workerUrl: baseUrl })).status, 0);
      assert.equal((await runFetch({ homeDir, workerUrl: baseUrl })).status, 0);

      const files = cachePaths(homeDir);
      assert.equal(JSON.parse(readFileSync(files.latest, 'utf8')).version, '2.0.0');
      assert.equal(readFileSync(files.etag, 'utf8'), '"etag-v2"');
      assert.equal(readFileSync(files.version, 'utf8'), '2.0.0');
    });
  });

  test('failure path does not partially update etag/version state', async () => {
    await withMockServer((req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('ETag', '"etag-v2"');
      res.end('{"skills":[]}');
    }, async (baseUrl) => {
      const homeDir = makeHome();
      const files = cachePaths(homeDir);
      writeFileSync(files.latest, JSON.stringify({ version: '1.0.0', skills: [] }));
      writeFileSync(files.etag, '"etag-v1"');
      writeFileSync(files.version, '1.0.0');

      const result = await runFetch({ homeDir, workerUrl: baseUrl });
      assert.notEqual(result.status, 0);

      assert.equal(JSON.parse(readFileSync(files.latest, 'utf8')).version, '1.0.0');
      assert.equal(readFileSync(files.etag, 'utf8'), '"etag-v1"');
      assert.equal(readFileSync(files.version, 'utf8'), '1.0.0');
      assert.equal(existsSync(join(files.cacheDir, 'latest.json.tmp')), false);
      assert.equal(existsSync(join(files.cacheDir, 'latest.etag.tmp')), false);
      assert.equal(existsSync(join(files.cacheDir, 'latest.version.tmp')), false);
    });
  });
});
