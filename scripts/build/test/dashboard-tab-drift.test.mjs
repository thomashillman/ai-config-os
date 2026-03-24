import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDashboardTabDriftCheck,
} from '../../ci/check-dashboard-tab-drift.mjs';

function fixture({ appTabs, readmeTabs, planTabs }) {
  const appSource = `const TABS = [\n${appTabs
    .map((tab, index) => `  { id: "tab-${index}", label: "${tab}" },`)
    .join('\n')}\n]\n`;

  const readmeBullets = readmeTabs
    .map(label => `- **${label}:** Tab details`)
    .join('\n');

  const readmeSource = [
    '# AI Config OS',
    '',
    'The dashboard provides eight top-level tabs:',
    readmeBullets,
    '',
  ].join('\n');

  const planSource = `| React dashboard | Done | dashboard/ — 8 top-level tabs: ${planTabs.join(', ')} |`;

  return { appSource, readmeSource, planSource };
}

function fixtureWithSingleQuotedTabs(tabs) {
  const appSource = `const TABS = [\n${tabs
    .map((tab, index) => `  { id: 'tab-${index}', label: '${tab}' },`)
    .join('\n')}\n];`;
  const readmeSource = [
    '# AI Config OS',
    '',
    'The dashboard provides eight top-level tabs:',
    ...tabs.map(label => `- **${label}:** Tab details`),
    '',
  ].join('\n');
  const planSource = `| React dashboard | Done | dashboard/ — 8 top-level tabs: ${tabs.join(', ')} |`;
  return { appSource, readmeSource, planSource };
}

test('passes when README and PLAN tab lists match App tab labels in order', () => {
  const tabs = ['Tasks', 'Tools', 'Skills'];
  const result = runDashboardTabDriftCheck(fixture({ appTabs: tabs, readmeTabs: tabs, planTabs: tabs }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('fails when a documented tab label was renamed without docs update', () => {
  const result = runDashboardTabDriftCheck(
    fixture({
      appTabs: ['Task Queue', 'Tools', 'Skills'],
      readmeTabs: ['Tasks', 'Tools', 'Skills'],
      planTabs: ['Tasks', 'Tools', 'Skills'],
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /README\.md/);
  assert.match(result.errors[1], /PLAN\.md/);
});

test('fails when documentation order changes relative to App tab order', () => {
  const result = runDashboardTabDriftCheck(
    fixture({
      appTabs: ['Tasks', 'Tools', 'Skills'],
      readmeTabs: ['Tools', 'Tasks', 'Skills'],
      planTabs: ['Tasks', 'Tools', 'Skills'],
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /README\.md/);
});

test('fails when docs include deprecated/extra tab names', () => {
  const result = runDashboardTabDriftCheck(
    fixture({
      appTabs: ['Tasks', 'Tools', 'Skills'],
      readmeTabs: ['Tasks', 'Tools', 'Skills', 'Legacy'],
      planTabs: ['Tasks', 'Tools', 'Skills'],
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /README\.md/);
  assert.match(result.errors[0], /Legacy/);
});

test('parses App TABS with single quotes and trailing semicolon', () => {
  const tabs = ['Tasks', 'Tools', 'Skills'];
  const result = runDashboardTabDriftCheck(fixtureWithSingleQuotedTabs(tabs));
  assert.equal(result.ok, true);
});
