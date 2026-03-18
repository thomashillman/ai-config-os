# Integrating Capability Discovery in Claude Code Web / iOS

This guide explains how to wire the capability API into a Claude Code session running in
a browser (desktop or iOS) where local filesystem and shell access are unavailable.

---

## Quick start (copy-paste)

```javascript
import { CapabilityClient } from './adapters/claude/capabilities-client.mjs';

const client = new CapabilityClient({
  workerUrl: 'https://ai-config-os-main.tj-hillman.workers.dev',
  token: SESSION_TOKEN,   // injected by your host app or session hook
  cache: 'localstorage',  // persist across page reloads
});

// Get everything for session start in one call
const { platform, profile, skills } = await client.getSessionStartData();

console.log(`Platform: ${platform}`);
console.log(`${profile.capabilities.supported.length} capabilities supported`);
console.log(`${skills.compatible_count} of ${skills.total_skills} skills available`);
```

---

## Architecture

```
Claude Code Web / iOS
│
├── CapabilityClient (browser JS)
│   ├── detectPlatform()      → 'claude-web' or 'claude-ios'
│   ├── getPlatformCapabilities('claude-web')
│   │   └── GET /v1/capabilities/platform/claude-web
│   └── getCompatibleSkills(['network.http', ...])
│       └── GET /v1/skills/compatible?caps=network.http,...
│
└── Cloudflare Worker (edge, CORS-enabled)
    ├── Platform profiles from compiled registry
    ├── Skill compatibility pre-computed by build system
    └── Immutable cache headers → browser caches forever
```

---

## Session-start hook

Add to your Claude Code web environment as a SessionStart hook that runs JS before
the assistant initialises:

```javascript
// .claude/hooks/web-session-start.js
// Fetches capability profile and compatible skills; stores in sessionStorage
// for Claude to reference throughout the session.

(async () => {
  const WORKER = globalThis.__AI_CONFIG_WORKER__ ?? 'https://ai-config-os-main.tj-hillman.workers.dev';
  const TOKEN  = globalThis.__AI_CONFIG_TOKEN__;

  if (!TOKEN) {
    console.warn('[ai-config] AI_CONFIG_TOKEN not set — skill discovery unavailable');
    return;
  }

  try {
    const { CapabilityClient } = await import('./adapters/claude/capabilities-client.mjs');
    const client = new CapabilityClient({
      workerUrl: WORKER,
      token: TOKEN,
      cache: 'localstorage',
    });

    const { platform, profile, skills } = await client.getSessionStartData();

    // Store for Claude Code to read as context
    sessionStorage.setItem('ai-config:platform', platform);
    sessionStorage.setItem('ai-config:capabilities', JSON.stringify(profile.capabilities));
    sessionStorage.setItem('ai-config:skills', JSON.stringify(skills.skills.map(s => s.id)));

    console.log(`[ai-config] ${skills.compatible_count} skills available for ${platform}`);
  } catch (err) {
    console.warn('[ai-config] Capability discovery failed (non-fatal):', err.message);
  }
})();
```

---

## What Claude Code can do with this

Once session storage is populated, Claude Code can read it to:

1. **Only show relevant skills** — filter slash commands to those in `ai-config:skills`
2. **Show capability notes** — explain why a skill requires copy-paste on web
3. **Offer fallback guidance** — when a skill has `fallback_mode: prompt-only`, explain the manual steps

Example system prompt context Claude might receive:

```
Platform: claude-web
Available skills: code-review, explain-code, debug, refactor, ...
Note: git-ops unavailable (requires shell access). Use manual git commands.
```

---

## iOS-specific considerations

On iOS (Claude app or PWA):

- `network.http` is the only reliably supported capability
- All shell, filesystem, and MCP capabilities are `unsupported`
- `ui.prompt-only` is always available
- Recommend using `?caps=network.http` to get the safe minimum skill set

```javascript
// iOS-optimised fetch — minimal cap set, aggressive caching
const skills = await client.getCompatibleSkills(['network.http']);
// Returns ~18 skills that work entirely via prompt-input
```

---

## Caching for offline resilience

The reference client caches responses in `localStorage` by default (browser) or in
memory (Node.js). Cloudflare also caches at the edge.

For true offline resilience (PWA), add a service worker cache:

```javascript
// service-worker.js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/v1/capabilities/') || url.pathname.startsWith('/v1/skills/compatible')) {
    event.respondWith(
      caches.open('ai-config-v1').then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      })
    );
  }
});
```

---

## Error handling and fallback

The client throws `CapabilityClientError` on failure. Always wrap in try/catch and
degrade gracefully:

```javascript
let skills = { skills: [], compatible_count: 0, total_skills: 0 };

try {
  const data = await client.getCompatibleSkills(['network.http']);
  skills = data;
} catch (err) {
  if (err.code === 'TIMEOUT' || err.code === 'NETWORK_ERROR') {
    // Worker unreachable — proceed with empty skill list
    console.warn('[ai-config] Worker unreachable; no skills loaded for this session');
  } else if (err.status === 401) {
    console.error('[ai-config] Invalid token — check AI_CONFIG_TOKEN');
  } else {
    console.error('[ai-config] Unexpected error:', err.message);
  }
}
```

---

## Token management

The `AI_CONFIG_TOKEN` must be available to browser JS. Options:

1. **Server-side injection** — render token into page HTML as a JS variable
2. **Meta tag** — `<meta name="ai-config-token" content="...">`
3. **Environment variable** — available in build-time-rendered SPAs

Never commit tokens. Use environment variables in your deployment pipeline.
