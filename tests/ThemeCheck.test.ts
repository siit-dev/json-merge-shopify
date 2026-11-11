import { mkdtempSync, writeFileSync, rmSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import GitMerger from '../src/git-integration/GitMerger';

let root: string;
const pathKeys = Object.keys(process.env).filter(
  (key) => key.toLowerCase() === 'path',
);
let beforePaths: Record<string, string | undefined>;
const setPath = (value: string) => {
  for (const key of pathKeys) process.env[key] = value;
};
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'merge-check-'));
  beforePaths = Object.fromEntries(
    pathKeys.map((key) => [key, process.env[key]]),
  );
  writeFileSync(
    path.join(root, 'fixture.cjs'),
    "process.stdout.write(process.env.CHECK_REPORT || ''); process.stderr.write('diagnostics on stderr'); process.exit(Number(process.env.CHECK_EXIT || '0'));\n",
  );
  writeFileSync(
    path.join(root, process.platform === 'win32' ? 'shopify.cmd' : 'shopify'),
    process.platform === 'win32'
      ? `@echo off\r\n"${process.execPath}" "%~dp0fixture.cjs" %*\r\n`
      : `#!/bin/sh\n"${process.execPath}" "${path.join(
          root,
          'fixture.cjs',
        )}" "$@"\n`,
    { mode: 0o755 },
  );
  setPath(root + path.delimiter + beforePaths[pathKeys[0]]);
});
afterEach(() => {
  for (const key of pathKeys) process.env[key] = beforePaths[key];
  delete process.env.CHECK_REPORT;
  delete process.env.CHECK_EXIT;
  rmSync(root, { recursive: true, force: true });
});
const issue = () => ({
  filePath: path.join(root, 'templates/page.json'),
  check: 'JSONSyntaxError',
  severity: 'error',
  message: 'Invalid JSON',
  startRow: 1,
  startColumn: 1,
  endRow: 1,
  endColumn: 2,
});
const merger = (failIfThemeCheckMissing = true) =>
  new GitMerger({ gitRoot: root, failIfThemeCheckMissing, logger: () => {} });

test.each(['legacy', 'v5'])(
  '%s report blocks matching JSON errors, including pretty-printed output',
  async (format) => {
    const i = issue();
    const report =
      format === 'legacy'
        ? [
            {
              path: i.filePath,
              errorCount: 1,
              warningCount: 0,
              infoCount: 0,
              offenses: [
                {
                  check: i.check,
                  severity: i.severity,
                  message: i.message,
                  start_row: -1,
                  start_column: -1,
                },
              ],
            },
          ]
        : { valid: false, issues: [i] };
    process.env.CHECK_REPORT = JSON.stringify(report, null, 2);
    process.env.CHECK_EXIT = '1';
    expect(await merger().validateJson(['templates/page.json'])).toBe(false);
    expect(await merger().validateJson(['templates/other.json'])).toBe(true);
  },
);

test('v5 unrelated Liquid issues and warnings do not block merged JSON', async () => {
  process.env.CHECK_REPORT = JSON.stringify({
    valid: false,
    issues: [
      { ...issue(), filePath: path.join(root, 'sections/a.liquid') },
      { ...issue(), severity: 'warning' },
    ],
  });
  process.env.CHECK_EXIT = '1';
  expect(await merger().validateJson(['templates/page.json'])).toBe(true);
});

test.each([
  '',
  'not JSON',
  '{}',
  '{"error":{"message":"No auth"}}',
  '{"valid":false,"issues":[]}',
])('tool failures cannot be accepted as empty reports: %s', async (report) => {
  process.env.CHECK_REPORT = report;
  process.env.CHECK_EXIT = '1';
  await expect(
    merger(false).validateJson(['templates/page.json']),
  ).rejects.toThrow();
});

test('legacy empty reports and trailing agent hints are accepted', async () => {
  process.env.CHECK_REPORT = '[]\n<claude-code-hint message="hint" />\n';
  expect(await merger().validateJson(['templates/page.json'])).toBe(true);
});

test('a failed report with no issues is rejected even with exit zero', async () => {
  process.env.CHECK_REPORT = JSON.stringify({ valid: false, issues: [] });
  await expect(merger().validateJson([])).rejects.toThrow();
});

test('missing CLI opt-out is portable while the default still fails', async () => {
  unlinkSync(
    path.join(root, process.platform === 'win32' ? 'shopify.cmd' : 'shopify'),
  );
  setPath(root);
  expect(await merger(false).validateJson([])).toBe(true);
  await expect(merger(true).validateJson([])).rejects.toThrow();
});

test.each([
  { offenses: [] },
  {
    offenses: [
      {
        check: 'Syntax',
        severity: 'warning',
        message: 'bad',
        start_row: 0,
        start_column: 0,
      },
    ],
  },
])(
  'rejects inconsistent legacy counts instead of accepting malformed reports: %j',
  async ({ offenses }) => {
    process.env.CHECK_REPORT = JSON.stringify([
      {
        path: path.join(root, 'templates/page.json'),
        offenses,
        errorCount: 1,
        warningCount: 0,
        infoCount: 0,
      },
    ]);
    for (const code of ['0', '1']) {
      process.env.CHECK_EXIT = code;
      await expect(
        merger().validateJson(['templates/page.json']),
      ).rejects.toThrow(/counts/);
    }
  },
);

test('rejects contradictory flat report counters', async () => {
  process.env.CHECK_REPORT = JSON.stringify({
    valid: true,
    issues: [],
    errorCount: 1,
    warningCount: 0,
    infoCount: 0,
  });
  await expect(merger().validateJson([])).rejects.toThrow(/counts/);
});
