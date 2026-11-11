import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import GitMerger from '../src/git-integration/GitMerger';

const installed = process.env.SHOPIFY_CLI_MATRIX_BIN ? test : test.skip;
installed(
  'installed CLI blocks merged JSON errors and permits unrelated findings',
  async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'merge-real-check-'));
    try {
      mkdirSync(path.join(root, 'templates'));
      writeFileSync(
        path.join(root, '.theme-check.yml'),
        'extends: []\nValidJSON:\n  enabled: true\n  severity: error\n',
      );
      writeFileSync(path.join(root, 'templates/index.json'), '{ broken');
      const merger = new GitMerger({ gitRoot: root, logger: () => {} });
      expect(await merger.validateJson(['templates/index.json'])).toBe(false);
      expect(await merger.validateJson(['templates/other.json'])).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
  60000,
);
