import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  runDashboardTabDriftCheck,
} from '../../ci/check-dashboard-tab-drift.mjs';

function fixture({ appTabs, supportedTodayTabs, planTabs }) {
  const appSource = `const TABS = [\n${appTabs
    .map((tab, index) => `  { id: "tab-${index}", label: "${tab}" },`)
    .join('\n')}\n]\n`;

  const supportedTodaySource = [
    '## 5) Dashboard/runtime feature support',
    '',
    '| Feature surface | Status today | Evidence |',
    '|---|---|---|',
    `| Dashboard tabs: ${supportedTodayTabs.join(', ')} | Supported | Tab registry and routing are defined in App UI. | \`dashboard/src/App.jsx\` |`,
    '',
  ].join('\n');

  const planSource = `| React dashboard | Done | dashboard/ — 8 top-level tabs: ${planTabs.join(', ')} |`;

  return { appSource, supportedTodaySource, planSource };
}

function fixtureWithSingleQuotedTabs(tabs) {
  const appSource = `const TABS = [\n${tabs
    .map((tab, index) => `  { id: 'tab-${index}', label: '${tab}' },`)
    .join('\n')}\n];`;
  const supportedTodaySource = [
    '## 5) Dashboard/runtime feature support',
    '',
    '| Feature surface | Status today | Evidence |',
    '|---|---|---|',
    `| Dashboard tabs: ${tabs.join(', ')} | Supported | Tab registry. | \`dashboard/src/App.jsx\` |`,
    '',
  ].join('\n');
  const planSource = `| React dashboard | Done | dashboard/ — 8 top-level tabs: ${tabs.join(', ')} |`;
  return { appSource, supportedTodaySource, planSource };
}

test('passes when SUPPORTED_TODAY and PLAN tab lists match App tab labels in order', () => {
  const tabs = ['Tasks', 'Tools', 'Skills'];
  const result = runDashboardTabDriftCheck(fixture({ appTabs: tabs, supportedTodayTabs: tabs, planTabs: tabs }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('fails when a documented tab label was renamed without docs update', () => {
  const result = runDashboardTabDriftCheck(
    fixture({
      appTabs: ['Task Queue', 'Tools', 'Skills'],
      supportedTodayTabs: ['Tasks', 'Tools', 'Skills'],
      planTabs: ['Tasks', 'Tools', 'Skills'],
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
  assert.match(result.errors[0], /SUPPORTED_TODAY\.md/);
  assert.match(result.errors[1], /PLAN\.md/);
});

test('fails when documentation order changes relative to App tab order', () => {
  const result = runDashboardTabDriftCheck(
    fixture({
      appTabs: ['Tasks', 'Tools', 'Skills'],
      supportedTodayTabs: ['Tools', 'Tasks', 'Skills'],
      planTabs: ['Tasks', 'Tools', 'Skills'],
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /SUPPORTED_TODAY\.md/);
});

test('fails when docs include deprecated/extra tab names', () => {
  const result = runDashboardTabDriftCheck(
    fixture({
      appTabs: ['Tasks', 'Tools', 'Skills'],
      supportedTodayTabs: ['Tasks', 'Tools', 'Skills', 'Legacy'],
      planTabs: ['Tasks', 'Tools', 'Skills'],
    })
  );

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /SUPPORTED_TODAY\.md/);
  assert.match(result.errors[0], /Legacy/);
});

test('parses App TABS with single quotes and trailing semicolon', () => {
  const tabs = ['Tasks', 'Tools', 'Skills'];
  const result = runDashboardTabDriftCheck(fixtureWithSingleQuotedTabs(tabs));
  assert.equal(result.ok, true);
});
