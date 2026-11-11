import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import GitMerger from '../src/git-integration/GitMerger';

let root: string;
let beforePath: string | undefined;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'merge-check-'));
  beforePath = process.env.PATH;
  writeFileSync(
    path.join(root, 'shopify'),
    `#!${process.execPath}\nprocess.stdout.write(process.env.CHECK_REPORT || '');\nprocess.stderr.write('diagnostics on stderr');\nprocess.exit(Number(process.env.CHECK_EXIT || '0'));\n`,
    { mode: 0o755 },
  );
  process.env.PATH = root + path.delimiter + beforePath;
});
afterEach(() => {
  process.env.PATH = beforePath;
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
