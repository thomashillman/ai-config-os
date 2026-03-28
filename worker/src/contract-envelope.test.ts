import { describe, it, expect } from 'vitest';
import { createWorkerHandler } from './router';

const registry = {
  version: '2026.03.26',
  skills: [
    {
      id: 'review-repo',
      version: '1.0.0',
      description: 'Review repository',
      type: 'core',
      status: 'stable',
      capabilities: { required: ['fs.read'], optional: ['shell.exec'] },
      compatibility: {
        'claude-code': {
          status: 'supported',
          notes: 'Local runtime scripts supported',
        },
      },
    },
  ],
  platform_definitions: {
    'claude-code': {
      id: 'claude-code',
      name: 'Claude Code',
      surface: 'local',
      default_package: 'plugin',
      capabilities: {
        'fs.read': { status: 'supported' },
        'shell.exec': { status: 'supported' },
        'network.http': { status: 'unsupported' },
      },
    },
  },
};

const env = {
  AUTH_TOKEN: 'token',
  EXECUTOR_SHARED_SECRET: 'secret',
};

function authRequest(path: string): Request {
  return new Request(`https://example.com${path}`, {
    method: 'GET',
    headers: { Authorization: 'Bearer token' },
  });
}

describe('worker response envelope contracts', () => {
  it('returns deterministic capability error shape with code/message/hint', async () => {
    const handler = createWorkerHandler(registry, {});
    const response = await handler.fetch(authRequest('/v1/skills/compatible'), env as never);
    const payload = await response.json() as { error: { code: string; message: string; hint: string } };

    expect(response.status).toBe(400);
    expect(payload.error.code).toBe('MISSING_CAPS_PARAM');
    expect(typeof payload.error.message).toBe('string');
    expect(payload.error.message.length).toBeGreaterThan(0);
    expect(typeof payload.error.hint).toBe('string');
    expect(payload.error.hint.length).toBeGreaterThan(0);
  });

  it('keeps capability/locality flags accurate in platform response', async () => {
    const handler = createWorkerHandler(registry, {});
    const response = await handler.fetch(authRequest('/v1/capabilities/platform/claude-code'), env as never);
    const payload = await response.json() as {
      surface: string;
      capabilities: { supported: string[]; unsupported: string[]; unknown: string[] };
    };

    expect(response.status).toBe(200);
    expect(payload.surface).toBe('local');
    expect(payload.capabilities.supported).toContain('fs.read');
    expect(payload.capabilities.supported).toContain('shell.exec');
    expect(payload.capabilities.unsupported).toContain('network.http');
    expect(payload.capabilities.unknown).toEqual([]);
  });

  it('preserves legacy task route aliases consumed by existing clients', async () => {
    const handler = createWorkerHandler(registry, {});

    const byCode = await handler.fetch(authRequest('/v1/t/ABC123'), env as never);
    const byTaskId = await handler.fetch(authRequest('/v1/tasks/task_123'), env as never);
    const byCodePayload = await byCode.json() as { error: { code: string; message: string } };
    const byTaskPayload = await byTaskId.json() as { error: { code: string; message: string } };

    expect([404, 500]).toContain(byCode.status);
    expect([404, 500]).toContain(byTaskId.status);
    expect(typeof byCodePayload.error.code).toBe('string');
    expect(typeof byTaskPayload.error.code).toBe('string');
    expect(typeof byCodePayload.error.message).toBe('string');
    expect(typeof byTaskPayload.error.message).toBe('string');
    expect(byCodePayload.error.message.length).toBeGreaterThan(0);
    expect(byTaskPayload.error.message.length).toBeGreaterThan(0);
  });
});
