#!/usr/bin/env node
/**
 * Optional GitHub Actions job: post or update an AI-generated PR review comment.
 * See docs/superpowers/specs/2026-03-31-cursor-rules-ci-pr-automation-design.md
 */
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';

const MARKER = '<!-- ai-pr-review-bot -->';
const MAX_DIFF_BYTES = 200 * 1024;
const MAX_FILES = 100;

const SYSTEM_PROMPT = `You are a senior reviewer for a pull request. Output markdown only.

Use exactly these section headings (omit a section if there is nothing substantive to say):
## BREAKING CHANGES
## SECURITY
## TEST COVERAGE
## API DESIGN
## Other notes

Under each section, use bullet points. Tag each finding with a severity in bold: **critical**, **warning**, or **nit**.

End with a short line: **Recommendation:** approve | request changes | needs human judgement — with one sentence why.

Align with the repository skill "review-pr" dimensions (correctness, breaking changes, tests, security). Be concise.`;

function isDeniedPath(p) {
  const normalized = p.replace(/^"|"$/g, '').replace(/\\"/g, '"');
  const lower = normalized.toLowerCase();
  if (lower.includes('/secrets/') || lower.startsWith('secrets/')) {
    return true;
  }
  if (lower.includes('credential')) {
    return true;
  }
  if (lower.includes('id_rsa')) {
    return true;
  }
  if (/\.pem$/i.test(normalized)) {
    return true;
  }
  if (/\.key$/i.test(normalized) && !/\.keydown/i.test(normalized)) {
    return true;
  }
  const parts = normalized.split('/');
  const base = parts[parts.length - 1] || normalized;
  if (base === '.env' || base.startsWith('.env.')) {
    return true;
  }
  return false;
}

function extractPathsFromChunk(chunk) {
  const line = chunk.split('\n')[0] || '';
  const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
  if (!m) {
    return [];
  }
  return [m[1], m[2]];
}

/**
 * @param {string} diffText
 * @returns {{ text: string, truncated: boolean, droppedFiles: number, keptFiles: number }}
 */
export function filterDiffForReview(diffText) {
  const chunks = diffText.split(/\n(?=diff --git )/);
  const kept = [];
  let pathBasedKept = 0;
  let droppedFiles = 0;

  for (const chunk of chunks) {
    if (!chunk.trim()) {
      continue;
    }
    const body = chunk.startsWith('diff --git') ? chunk : `diff --git ${chunk}`;
    const paths = extractPathsFromChunk(body);
    if (paths.length === 0) {
      kept.push(body);
      continue;
    }
    if (paths.some(isDeniedPath)) {
      droppedFiles++;
      continue;
    }
    pathBasedKept++;
    if (pathBasedKept > MAX_FILES) {
      droppedFiles++;
      continue;
    }
    kept.push(body);
  }

  let text = kept.join('\n');
  let truncated = false;
  if (Buffer.byteLength(text, 'utf8') > MAX_DIFF_BYTES) {
    const buf = Buffer.from(text, 'utf8').subarray(0, MAX_DIFF_BYTES);
    text = buf.toString('utf8', 0, buf.length);
    truncated = true;
  }

  return {
    text,
    truncated,
    droppedFiles,
    keptFiles: Math.min(pathBasedKept, MAX_FILES),
  };
}

/**
 * Fallback when base/head SHAs are not available locally (e.g. shallow checkout).
 * GitHub Actions `pull_request` checkout is a merge commit: parents are base then head.
 */
function getMergeParentDiff() {
  const verify = spawnSync('git', ['rev-parse', '-q', '--verify', 'HEAD^2'], {
    encoding: 'utf8',
  });
  if (verify.status !== 0) {
    return null;
  }
  const d = spawnSync('git', ['diff', 'HEAD^1', 'HEAD^2'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (d.error) {
    throw d.error;
  }
  return d.stdout || '';
}

/**
 * Spec: git diff pull_request.base.sha..pull_request.head.sha after ensuring objects exist.
 */
function getPrDiffFromShas(baseSha, headSha) {
  if (!baseSha || !headSha) {
    return null;
  }

  const runDiff = () =>
    spawnSync('git', ['diff', baseSha, headSha], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
    });

  let r = runDiff();
  if (r.status !== 0) {
    const fr = spawnSync(
      'git',
      ['fetch', '--no-tags', '--depth=2048', 'origin', baseSha, headSha],
      { encoding: 'utf8' },
    );
    if (fr.status !== 0) {
      console.log(
        `pr-ai-review: git fetch origin shas failed (${fr.status}); trying merge-parent diff`,
      );
      return getMergeParentDiff();
    }
    r = runDiff();
  }

  if (r.error) {
    throw r.error;
  }
  if (r.status !== 0) {
    console.log(
      `pr-ai-review: git diff ${baseSha.slice(0, 7)}..${headSha.slice(0, 7)} failed; trying merge-parent diff`,
    );
    return getMergeParentDiff();
  }
  return r.stdout || '';
}

async function callOpenAI(apiKey, model, userContent) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content:
            'Here is the unified diff for this pull request (paths may be truncated for size). Review it.\n\n```diff\n' +
            userContent +
            '\n```',
        },
      ],
      temperature: 0.2,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 240)}`);
  }

  const j = await res.json();
  const text = j.choices?.[0]?.message?.content;
  if (!text || typeof text !== 'string') {
    throw new Error('OpenAI: empty or invalid response');
  }
  return text.trim();
}

async function githubRequest(path, token, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GitHub ${path} -> ${res.status}: ${t.slice(0, 200)}`);
  }
  if (res.status === 204) {
    return null;
  }
  return res.json();
}

async function listIssueComments(owner, repo, issueNumber, token) {
  const all = [];
  let page = 1;
  while (true) {
    const batch = await githubRequest(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      token,
    );
    all.push(...batch);
    if (batch.length < 100) {
      break;
    }
    page++;
  }
  return all;
}

async function postComment(owner, repo, issueNumber, body, token) {
  return githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

async function patchComment(owner, repo, commentId, body, token) {
  return githubRequest(`/repos/${owner}/${repo}/issues/comments/${commentId}`, token, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
}

function buildCommentBody(reviewMd, meta) {
  const metaLine = meta.truncated
    ? `_Diff truncated to ${MAX_DIFF_BYTES} bytes. ${meta.droppedFiles} file(s) excluded by safety rules or file cap._\n\n`
    : meta.droppedFiles > 0
      ? `_${meta.droppedFiles} file(s) excluded from diff by safety rules._\n\n`
      : '';

  return `${MARKER}
### Automated PR review (experimental)
${metaLine}_This comment is generated in CI and is not a merge blocker._

${reviewMd}`;
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    console.log('pr-ai-review: GITHUB_EVENT_PATH not set; skip');
    return;
  }

  const event = JSON.parse(readFileSync(eventPath, 'utf8'));

  const pr = event.pull_request;
  if (!pr) {
    console.log('pr-ai-review: not a pull_request event; skip');
    return;
  }

  if (pr.draft) {
    console.log('pr-ai-review: draft PR; skip');
    return;
  }

  const repoFull = event.repository?.full_name;
  const headFull = pr.head?.repo?.full_name;
  if (!repoFull || !headFull || headFull !== repoFull) {
    console.log('pr-ai-review: fork or missing repo metadata; skip');
    return;
  }

  const apiKey = process.env.AI_PR_REVIEW_API_KEY;
  if (!apiKey) {
    console.log('pr-ai-review: AI_PR_REVIEW_API_KEY not set; skip');
    return;
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error('pr-ai-review: GITHUB_TOKEN missing');
    process.exit(1);
  }

  const rawDiff = getPrDiffFromShas(pr.base?.sha, pr.head?.sha);
  if (rawDiff === null) {
    console.log('pr-ai-review: could not read PR diff; skip');
    return;
  }

  const filtered = filterDiffForReview(rawDiff);
  console.log(
    `pr-ai-review: diff stats keptFiles=${filtered.keptFiles} dropped=${filtered.droppedFiles} truncated=${filtered.truncated} bytes=${Buffer.byteLength(filtered.text, 'utf8')}`,
  );

  if (!filtered.text.trim()) {
    const body = buildCommentBody('_No reviewable diff after filtering (empty or all paths denied)._', filtered);
    await upsertComment(event.repository.owner.login, event.repository.name, pr.number, body, token);
    return;
  }

  const model = process.env.AI_PR_REVIEW_MODEL || 'gpt-4o-mini';
  const reviewMd = await callOpenAI(apiKey, model, filtered.text);
  const body = buildCommentBody(reviewMd, filtered);
  await upsertComment(event.repository.owner.login, event.repository.name, pr.number, body, token);
  console.log('pr-ai-review: comment upserted');
}

async function upsertComment(owner, repo, issueNumber, body, token) {
  const comments = await listIssueComments(owner, repo, issueNumber, token);
  const existing = comments.find((c) => typeof c.body === 'string' && c.body.includes(MARKER));
  if (existing) {
    await patchComment(owner, repo, existing.id, body, token);
  } else {
    await postComment(owner, repo, issueNumber, body, token);
  }
}

main().catch((e) => {
  console.error(`pr-ai-review: ${e.message}`);
  process.exit(1);
});
