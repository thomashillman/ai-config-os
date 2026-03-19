import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { safeImport } from '../lib/windows-safe-import.mjs';

const {
  getSkillValidator,
  getPlatformValidator,
  getRouteValidator,
  getOutcomeValidator,
  getSkillSchema,
} = await safeImport('../lib/validators-cache.mjs', import.meta.url);

describe('validators-cache', () => {
  it('returns the same skill validator instance on repeated calls', async () => {
    const v1 = await getSkillValidator();
    const v2 = await getSkillValidator();
    assert.equal(v1, v2, 'should be referentially identical');
  });

  it('returns the same platform validator instance on repeated calls', async () => {
    const v1 = await getPlatformValidator();
    const v2 = await getPlatformValidator();
    assert.equal(v1, v2);
  });

  it('returns the same route validator instance on repeated calls', async () => {
    const v1 = await getRouteValidator();
    const v2 = await getRouteValidator();
    assert.equal(v1, v2);
  });

  it('returns the same outcome validator instance on repeated calls', async () => {
    const v1 = await getOutcomeValidator();
    const v2 = await getOutcomeValidator();
    assert.equal(v1, v2);
  });

  it('skill validator accepts a minimal valid skill frontmatter', async () => {
    const validator = await getSkillValidator();
    const valid = validator({
      skill: 'test-skill',
      description: 'A test skill.',
      type: 'prompt',
      status: 'stable',
      version: '1.0.0',
      capabilities: { required: [], fallback_mode: 'none' },
    });
    assert.ok(valid, `expected valid, got errors: ${JSON.stringify(validator.errors)}`);
  });

  it('skill validator rejects frontmatter missing required fields', async () => {
    const validator = await getSkillValidator();
    const valid = validator({ skill: 'test' });
    assert.equal(valid, false);
    assert.ok(validator.errors.length > 0);
  });

  it('getSkillSchema returns an object with $defs', () => {
    const schema = getSkillSchema();
    assert.ok(schema.$defs, 'schema should have $defs');
    assert.ok(schema.$defs.capabilityId, 'schema should have capabilityId def');
  });
});
