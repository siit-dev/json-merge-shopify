'use strict';

import simpleGit, { GitConfigScope, SimpleGit } from 'simple-git';
import GitMerger from '../src/git-integration/GitMerger';
import * as os from 'os';
import * as path from 'path';
let git: SimpleGit;
let gitRoot: string;
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { getFixtures } from './utils/get-fixtures';
import * as JSON5 from 'json5';

beforeEach(async () => {
  const { base, ours, theirs, expected } = getFixtures('merger/object-2');

  // Create the folder in a temp directory outside the project repo
  gitRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'json-merge-test-'));

  git = simpleGit({
    baseDir: gitRoot,
    maxConcurrentProcesses: 1,
    trimmed: false,
  });

  // Initialize git repo
  await git.init();
  await git.addConfig('user.name', 'Test User', false, GitConfigScope.local);
  await git.addConfig(
    'user.email',
    'testuser@test.com',
    false,
    GitConfigScope.local,
  );
  fs.writeFileSync(gitRoot + '/file.txt', 'Hello World');
  await git.add('.');
  await git.commit('Initial commit');

  // Set the "master" branch as "main"
  await git.branch(['-m', 'main']);

  // Create a JSON file
  if (!fs.existsSync(gitRoot + '/templates')) {
    fs.mkdirSync(gitRoot + '/templates/', { recursive: true });
  }
  fs.writeFileSync(gitRoot + '/templates/page.json', JSON.stringify(base));
  fs.writeFileSync(gitRoot + '/.gitignore', 'page.ignored*.json');
  await git.add('.');
  await git.commit('Add page.json on main');

  // Create a `live-mirror` branch
  await git.checkoutLocalBranch('live-mirror');
  await git.checkout('live-mirror');
  fs.writeFileSync(gitRoot + '/templates/page.json', JSON.stringify(theirs));
  fs.writeFileSync(
    gitRoot + '/templates/page.alt.json',
    JSON.stringify(theirs),
  );
  fs.writeFileSync(
    gitRoot + '/templates/page.ignored-a.json',
    JSON.stringify(theirs),
  );
  fs.writeFileSync(
    gitRoot + '/templates/page.ignored.json',
    JSON.stringify({}),
  );
  await git.add('.');
  await git.raw(['add', 'templates/page.ignored-a.json', '-f']);
  await git.raw(['add', 'templates/page.ignored.json', '-f']);
  await git.commit('Add new json files on live-mirror');

  // Go back to the `main` branch
  await git.checkout('main');

  // Create the `production` branch
  await git.checkoutLocalBranch('production');

  // Go back to the `main` branch
  await git.checkout('main');
});

afterEach(async () => {
  if (fs.existsSync(gitRoot)) {
    fs.rmSync(gitRoot, { recursive: true });
  }
});

const shopifyMessage = (shop: string, editor: string): string =>
  `Update from Shopify\n\nCommitted from shop: ${shop}\nTheme last edited by: ${editor}`;

const commitSourceEdit = async (
  file: string,
  value: string,
  message: string,
  date?: string,
): Promise<string> => {
  await git.checkout('live-mirror');
  fs.mkdirSync(path.dirname(path.join(gitRoot, file)), { recursive: true });
  fs.writeFileSync(path.join(gitRoot, file), JSON.stringify({ value }));
  await git.add(file);
  if (date) {
    execFileSync('git', ['commit', '-m', message], {
      cwd: gitRoot,
      env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
  } else {
    await git.commit(message);
  }
  return (await git.revparse(['HEAD'])).trim();
};

const stageMainEdit = async (): Promise<void> => {
  await git.checkout('main');
  fs.writeFileSync(gitRoot + '/templates/page.json', '{"mainEdit":true}');
  await git.add('templates/page.json');
};

it('can load setting from a JS file', async () => {
  const jsFile = gitRoot + '/settings.js';
  fs.writeFileSync(
    jsFile,
    `module.exports = ` +
      JSON.stringify({
        runLocallyOnly: true,
        exitIfNoExistingDeployment: false,
        checkJsonValidity: false,
        createCommit: true,
        commitMessage: 'test',
        preferred: 'theirs',
      }) +
      ';',
  );

  const merger = new GitMerger('settings.js', {
    gitRoot,
  });
  expect(merger.runLocallyOnly).toBe(true);
  expect(merger.exitIfNoExistingDeployment).toBe(false);
  expect(merger.checkJsonValidity).toBe(false);
  expect(merger.createCommit).toBe(true);
  expect(merger.preferred).toBe('theirs');
  expect(merger.commitMessage).toBe('test');

  fs.unlinkSync(jsFile);
});

it('can load setting from a JSON file', async () => {
  const jsFile = gitRoot + '/settings.json';
  fs.writeFileSync(
    jsFile,
    JSON.stringify({
      runLocallyOnly: true,
      exitIfNoExistingDeployment: false,
      checkJsonValidity: false,
      createCommit: true,
      commitMessage: 'test',
      preferred: 'theirs',
    }),
  );

  const merger = new GitMerger('settings.json', {
    gitRoot,
  });
  expect(merger.runLocallyOnly).toBe(true);
  expect(merger.exitIfNoExistingDeployment).toBe(false);
  expect(merger.checkJsonValidity).toBe(false);
  expect(merger.createCommit).toBe(true);
  expect(merger.preferred).toBe('theirs');
  expect(merger.commitMessage).toBe('test');

  fs.unlinkSync(jsFile);
});

it('detects the correct current branch', async () => {
  await git.checkout('main');

  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    createNewFiles: true,
  });

  const currentBranch = await merger.checkCurrentBranch();
  expect(currentBranch).toBe('main');
});

it('gets all the JSON files', async () => {
  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    createNewFiles: true,
  });

  const files = await merger.getAllJsons();
  expect(files).toMatchObject({
    valid: ['templates/page.json', 'templates/page.alt.json'],
    ignored: ['templates/page.ignored.json', 'templates/page.ignored-a.json'],
  });
});

it('gets the ancestor commit', async () => {
  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    checkJsonValidity: false,
    createNewFiles: true,
  });

  const ancestorCommit = await merger.getAncestorCommit('templates/page.json');
  expect(ancestorCommit).not.toBeNull();
  expect(ancestorCommit).not.toBeUndefined();

  const log = (
    await (git as any).log(['-n', '1', '--pretty=format:%s', ancestorCommit])
  )?.latest?.hash;
  expect(log).toBe('Add page.json on main');
});

it('merges correctly data from live-mirror (preferred: theirs)', async () => {
  const { base, ours, theirs, expected } = getFixtures('merger/object-2');
  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    checkJsonValidity: false,
    createCommit: true,
    preferred: 'theirs',
    createNewFiles: true,
  });

  const results = await merger.run();
  expect(results.error).toBeFalsy();
  expect(results.hasErrors).toBe(false);
  expect(results.hasConflict).toBe(false);
  expect(results.hasCommitted).toBe(true);
  expect(results.mergedFiles).toMatchObject([
    'templates/page.json',
    'templates/page.alt.json',
  ]);

  const lastCommit = (await git?.log())?.latest;
  expect(lastCommit?.message).toContain('[AUTOMATED]');
  expect(lastCommit?.message).toContain('`live-mirror`');
  expect(lastCommit?.message).toContain('templates/page.json');
  expect(lastCommit?.message).toContain('templates/page.alt.json');
  const currentContent = JSON5.parse(
    fs.readFileSync(gitRoot + '/templates/page.json', 'utf-8'),
  );
  expect(JSON.stringify(currentContent)).toBe(JSON.stringify(expected));
  const currentContent2 = JSON5.parse(
    fs.readFileSync(gitRoot + '/templates/page.alt.json', 'utf-8'),
  );
  expect(JSON.stringify(currentContent2)).toBe(JSON.stringify(theirs));
  expect(() =>
    fs.readFileSync(gitRoot + '/templates/page.ignored-a.json', 'utf-8'),
  ).toThrow('no such file');
});

it('merges correctly data from live-mirror (preferred: ours)', async () => {
  const { base, ours, theirs, expected } = getFixtures('merger/object-2');
  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    checkJsonValidity: false,
    createCommit: true,
    preferred: 'ours',
    createNewFiles: true,
  });

  // Run the merge
  const results = await merger.run();
  expect(results.error).toBeFalsy();
  expect(results.hasErrors).toBe(false);
  expect(results.hasConflict).toBe(false);
  expect(results.hasCommitted).toBe(true);
  expect(results.mergedFiles).toMatchObject([
    'templates/page.json',
    'templates/page.alt.json',
  ]);

  const lastCommit = (await git?.log())?.latest;
  expect(lastCommit?.message).toContain('[AUTOMATED]');
  expect(lastCommit?.message).toContain('`live-mirror`');
  expect(lastCommit?.message).toContain('templates/page.json');
  expect(lastCommit?.message).toContain('templates/page.alt.json');
  const currentContent = JSON5.parse(
    fs.readFileSync(gitRoot + '/templates/page.json', 'utf-8'),
  );
  expect(JSON.stringify(currentContent)).toBe(JSON.stringify(expected));
  const currentContent2 = JSON5.parse(
    fs.readFileSync(gitRoot + '/templates/page.alt.json', 'utf-8'),
  );
  expect(JSON.stringify(currentContent2)).toBe(JSON.stringify(theirs));
  expect(() =>
    fs.readFileSync(gitRoot + '/templates/page.ignored-a.json', 'utf-8'),
  ).toThrow('no such file');
});

it("doesn't run if there are uncommitted changes", async () => {
  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    checkJsonValidity: false,
    createCommit: true,
    preferred: 'theirs',
    createNewFiles: true,
  });

  // Go to `main` and change a file + create a new one
  await git.checkout('main');
  const page2Content = {
    section: {
      name: 'test',
    },
  };
  fs.writeFileSync(
    gitRoot + '/templates/page-2.json',
    JSON.stringify(page2Content),
  );

  // Run the merge
  const results = await merger.run();
  expect(results.hasErrors).toBe(true);
  expect(results.error).toBeTruthy();
  expect(results.error?.message).toContain('uncommitted changes');
});

it('uses staged files in commit message placeholders', async () => {
  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    checkJsonValidity: false,
    createCommit: true,
    commitMessage: '[AUTOMATED] Merged #files#',
  });

  const gitCommitMock = jest.fn().mockResolvedValue({});
  const gitStatusMock = jest
    .fn()
    .mockResolvedValueOnce({ files: [], conflicted: [] })
    .mockResolvedValueOnce({ files: [{ path: 'templates/page.alt.json' }] });
  const gitDiffMock = jest.fn().mockResolvedValue('templates/page.alt.json\n');
  const gitCheckoutMock = jest.fn().mockResolvedValue(undefined);
  (merger as any).git = {
    status: gitStatusMock,
    diff: gitDiffMock,
    checkout: gitCheckoutMock,
    commit: gitCommitMock,
    revparse: jest.fn().mockResolvedValue(''),
  };

  jest.spyOn(merger, 'pullLiveMirrorBranch').mockResolvedValue();
  jest
    .spyOn(merger, 'getAllJsons')
    .mockResolvedValue({ valid: [], ignored: [] });
  jest.spyOn(merger, 'checkCurrentBranch').mockResolvedValue('main');
  jest.spyOn(merger, 'mergeJsonFiles').mockResolvedValue({
    hasConflict: false,
    mergedFiles: ['templates/page.json', 'templates/page.alt.json'],
  });

  await merger.run();

  expect(gitCommitMock).toHaveBeenCalledWith(
    expect.stringContaining('templates/page.alt.json'),
  );
  expect(gitCommitMock).not.toHaveBeenCalledWith(
    expect.stringContaining('templates/page.json'),
  );
});

it.each(['ours', 'theirs'])(
  'handles newly added files on live-mirror (preferred: %s)',
  async (preferredValue) => {
    const preferred = preferredValue as 'ours' | 'theirs';
    const merger = new GitMerger({
      gitRoot,
      runLocallyOnly: true,
      exitIfNoExistingDeployment: false,
      checkJsonValidity: false,
      createCommit: true,
      preferred,
      createNewFiles: true,
    });

    // Go to `live-mirror` and change a file + create a new one
    await git.checkout('live-mirror');
    const page2Content = {
      section: {
        name: 'test',
      },
    };
    fs.writeFileSync(
      gitRoot + '/templates/page-2.json',
      JSON.stringify(page2Content),
    );
    await git.add('.');
    await git.commit('Add page-2.json on live-mirror');

    // Find the ancestor: no ancestor should be found
    const ancestorCommit = await merger.getAncestorCommit(
      'templates/page-2.json',
      {
        existsInMain: true,
        existsInLiveMirror: false,
      },
    );
    expect(ancestorCommit).toBeNull();

    // Run the merge
    const results = await merger.run();
    expect(results.error).toBeFalsy();
    expect(results.hasErrors).toBe(false);
    expect(results.hasConflict).toBe(false);
    expect(results.hasCommitted).toBe(true);
    expect(results.mergedFiles).toContain('templates/page-2.json');

    const page2 = JSON5.parse(
      fs.readFileSync(gitRoot + '/templates/page-2.json', 'utf-8'),
    );
    expect(page2).toMatchObject(page2Content);
  },
);

it.each(['ours', 'theirs'])(
  'handles newly added files on live-mirror (preferred: %s)',
  async (preferredValue) => {
    const preferred = preferredValue as 'ours' | 'theirs';
    const merger = new GitMerger({
      gitRoot,
      runLocallyOnly: true,
      exitIfNoExistingDeployment: false,
      checkJsonValidity: false,
      createCommit: true,
      preferred,
      createNewFiles: true,
    });

    // Go to `live-mirror` and change a file + create a new one
    await git.checkout('live-mirror');
    const page3Content = {
      section: {
        name: 'test3',
      },
    };
    fs.writeFileSync(
      gitRoot + '/templates/page-3.json',
      JSON.stringify(page3Content),
    );
    await git.add('.');
    await git.commit('Add page-3.json on live-mirror');

    // Run the merge
    const results = await merger.run();
    expect(results.error).toBeFalsy();
    expect(results.hasErrors).toBe(false);
    expect(results.hasConflict).toBe(false);
    expect(results.hasCommitted).toBe(true);
    expect(results.mergedFiles).toContain('templates/page-3.json');

    const page3 = JSON5.parse(
      fs.readFileSync(gitRoot + '/templates/page-3.json', 'utf-8'),
    );
    expect(page3).toMatchObject(page3Content);
  },
);

it('merges correctly data when both `main` and `live-mirror` have changes', async () => {
  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    checkJsonValidity: false,
    createCommit: true,
    preferred: 'theirs',
    createNewFiles: true,
  });

  // Go to `main` and change a file + create a new one
  await git.checkout('main');
  const page2Content = {
    section: {
      name: 'test',
    },
  };
  fs.writeFileSync(
    gitRoot + '/templates/page-2.json',
    JSON.stringify(page2Content),
  );
  const existing = JSON5.parse(
    fs.readFileSync(gitRoot + '/templates/page.json', 'utf-8'),
  );
  existing.order.reverse();
  fs.writeFileSync(gitRoot + '/templates/page.json', JSON.stringify(existing));
  await git.add('.');
  await git.commit('Change page.json and add page-2.json on main');

  // Go to `live-mirror` and change a file + create a new one
  await git.checkout('live-mirror');
  const page3Content = {
    section: {
      name: 'test2',
    },
  };
  fs.writeFileSync(
    gitRoot + '/templates/page-3.json',
    JSON.stringify(page3Content),
  );
  const existing2 = JSON5.parse(
    fs.readFileSync(gitRoot + '/templates/page.json', 'utf-8'),
  );
  existing2.sections[Object.keys(existing2.sections)[0]].name = 'test';
  fs.writeFileSync(gitRoot + '/templates/page.json', JSON.stringify(existing2));
  await git.add('.');
  await git.commit('Change page.json and add page-3.json on live-mirror');

  // Run the merge
  const results = await merger.run();
  expect(results.error).toBeFalsy();
  expect(results.hasErrors).toBe(false);
  expect(results.hasConflict).toBe(false);
  expect(results.hasCommitted).toBe(true);
  expect(results.mergedFiles).toMatchObject([
    'templates/page.json',
    'templates/page.alt.json',
    'templates/page-3.json',
  ]);

  const lastCommit = (await git?.log())?.latest;
  expect(lastCommit?.message).toContain('[AUTOMATED]');
  expect(lastCommit?.message).toContain('`live-mirror`');
  expect(lastCommit?.message).toContain('templates/page.json');
  expect(lastCommit?.message).toContain('templates/page.alt.json');
  const currentContent = JSON5.parse(
    fs.readFileSync(gitRoot + '/templates/page.json', 'utf-8'),
  );
  expect(currentContent.order).toMatchObject(existing.order);
  console.log(currentContent.sections);
  expect(
    currentContent.sections[Object.keys(currentContent.sections)[0]].name,
  ).toBe('test');
  expect(() =>
    fs.readFileSync(gitRoot + '/templates/page.ignored-a.json', 'utf-8'),
  ).toThrow('no such file');
  const page2 = JSON5.parse(
    fs.readFileSync(gitRoot + '/templates/page-2.json', 'utf-8'),
  );
  expect(page2).toMatchObject(page2Content);
});

it('applies the target repo prettier config when using the default formatter', async () => {
  fs.writeFileSync(
    gitRoot + '/.prettierrc',
    JSON.stringify({
      bracketSpacing: false,
    }),
  );

  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    checkJsonValidity: false,
    createCommit: false,
  });

  await merger.saveAndCommitJsonFile('templates/prettier-config.json', {
    section: {
      title: 'This title forces multiline formatting',
    },
  });

  const saved = fs.readFileSync(
    gitRoot + '/templates/prettier-config.json',
    'utf-8',
  );

  expect(saved).toBe(
    '{"section": {"title": "This title forces multiline formatting"}}\n',
  );
});

it('adds distinct Shopify editors for merged files and preserves a custom body', async () => {
  await commitSourceEdit(
    'templates/page.json',
    'one',
    shopifyMessage('Carnaby', 'Alice'),
  );
  await commitSourceEdit(
    'templates/page.json',
    'two',
    shopifyMessage('Carnaby', 'Alice'),
  );
  await commitSourceEdit(
    'templates/page.json',
    'three',
    shopifyMessage('Other', 'Bob'),
  );
  const sourceHead = await commitSourceEdit(
    'locales/fr.json',
    'unrelated',
    shopifyMessage('Carnaby', 'Mallory'),
  );
  await stageMainEdit();

  const merger = new GitMerger({
    gitRoot,
    commitMessage: '[AUTOMATED] Merge #files#\n\nExisting details',
  });
  merger.lastMergedFiles = ['templates/page.json'];
  (merger as any).lastSourceCommit = sourceHead;
  await merger.commit();

  const message = (
    await git.raw(['show', '-s', '--format=%B', 'HEAD'])
  ).trimEnd();
  expect(message).toBe(
    '[AUTOMATED] Merge templates/page.json\n\nExisting details\n\n' +
      'Committed from shop: Carnaby\nTheme edited by: Alice\n\n' +
      'Committed from shop: Other\nTheme edited by: Bob\n\n' +
      `Shopify-Source-Commit: ${sourceHead}`,
  );
});

it('uses the saved Shopify source commit for a deferred commit', async () => {
  const previousSource = await commitSourceEdit(
    'templates/page.json',
    'old',
    shopifyMessage('Carnaby', 'Alice'),
  );
  await git.checkout('main');
  fs.writeFileSync(gitRoot + '/file.txt', 'previous merge');
  await git.add('file.txt');
  await git.commit(
    `[AUTOMATED] previous\n\nShopify-Source-Commit: ${previousSource}`,
  );
  const sourceHead = await commitSourceEdit(
    'templates/page.json',
    'new',
    shopifyMessage('Carnaby', 'Bob'),
  );
  await stageMainEdit();

  const merger = new GitMerger({ gitRoot, createCommit: true });
  (merger as any).lastSourceCommit = sourceHead;
  await merger.maybeCreateCommit(['templates/page.json']);

  const message = await git.raw(['show', '-s', '--format=%B', 'HEAD']);
  expect(message).toContain('Theme edited by: Bob');
  expect(message).not.toContain('Alice');
  expect(message).toContain(`Shopify-Source-Commit: ${sourceHead}`);
});

it('captures Shopify attribution during run for a later action-style commit', async () => {
  await git.checkout('live-mirror');
  const source = JSON5.parse(
    fs.readFileSync(gitRoot + '/templates/page.json', 'utf-8'),
  );
  source.shopifyAttributionTest = true;
  fs.writeFileSync(gitRoot + '/templates/page.json', JSON.stringify(source));
  await git.add('templates/page.json');
  await git.commit(shopifyMessage('Carnaby', 'Service Web'));
  const sourceHead = (await git.revparse(['HEAD'])).trim();
  await git.checkout('main');

  const merger = new GitMerger({
    gitRoot,
    runLocallyOnly: true,
    exitIfNoExistingDeployment: false,
    checkJsonValidity: false,
    createCommit: false,
    createNewFiles: true,
  });
  const result = await merger.run();
  expect(result.hasErrors).toBe(false);
  await merger.commit();

  const message = await git.raw(['show', '-s', '--format=%B', 'HEAD']);
  expect(message).toContain(
    'Committed from shop: Carnaby\nTheme edited by: Service Web',
  );
  expect(message).toContain(`Shopify-Source-Commit: ${sourceHead}`);
});

it('uses the last automated commit time on the first attributed run', async () => {
  await commitSourceEdit(
    'templates/page.json',
    'old',
    shopifyMessage('Carnaby', 'Alice'),
    '2019-01-01T00:00:00Z',
  );
  await git.checkout('main');
  fs.writeFileSync(gitRoot + '/file.txt', 'previous merge');
  await git.add('file.txt');
  execFileSync('git', ['commit', '-m', '[AUTOMATED] previous'], {
    cwd: gitRoot,
    env: {
      GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z',
      GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z',
    },
  });
  const sourceHead = await commitSourceEdit(
    'templates/page.json',
    'new',
    shopifyMessage('Carnaby', 'Bob'),
    '2021-01-01T00:00:00Z',
  );
  await stageMainEdit();

  const merger = new GitMerger({ gitRoot });
  merger.lastMergedFiles = ['templates/page.json'];
  (merger as any).lastSourceCommit = sourceHead;
  await merger.commit();

  const message = await git.raw(['show', '-s', '--format=%B', 'HEAD']);
  expect(message).toContain('Theme edited by: Bob');
  expect(message).not.toContain('Alice');
});

it('keeps the original message when Shopify metadata is absent', async () => {
  const sourceHead = await commitSourceEdit(
    'templates/page.json',
    'new',
    'Update from Shopify',
  );
  await stageMainEdit();

  const merger = new GitMerger({
    gitRoot,
    commitMessage: '[AUTOMATED] custom',
  });
  merger.lastMergedFiles = ['templates/page.json'];
  (merger as any).lastSourceCommit = sourceHead;
  await merger.commit();

  expect((await git.raw(['show', '-s', '--format=%B', 'HEAD'])).trim()).toBe(
    '[AUTOMATED] custom',
  );
});

it('does not attribute a commit created only by post-merge hooks', async () => {
  const sourceHead = await commitSourceEdit(
    'templates/page.json',
    'new',
    shopifyMessage('Carnaby', 'Alice'),
  );
  await git.checkout('main');
  fs.writeFileSync(gitRoot + '/file.txt', 'hook change');
  await git.add('file.txt');

  const merger = new GitMerger({ gitRoot, commitMessage: '[AUTOMATED] hook' });
  merger.lastMergedFiles = [];
  (merger as any).lastSourceCommit = sourceHead;
  await merger.commit();

  expect((await git.raw(['show', '-s', '--format=%B', 'HEAD'])).trim()).toBe(
    '[AUTOMATED] hook',
  );
});

it('omits attribution when the saved Shopify source commit is unreachable', async () => {
  await git.checkout('main');
  fs.writeFileSync(gitRoot + '/file.txt', 'previous merge');
  await git.add('file.txt');
  await git.commit(
    `[AUTOMATED] previous\n\nShopify-Source-Commit: ${'0'.repeat(40)}`,
  );
  const sourceHead = await commitSourceEdit(
    'templates/page.json',
    'new',
    shopifyMessage('Carnaby', 'Alice'),
  );
  await stageMainEdit();

  const merger = new GitMerger({
    gitRoot,
    commitMessage: '[AUTOMATED] current',
  });
  merger.lastMergedFiles = ['templates/page.json'];
  (merger as any).lastSourceCommit = sourceHead;
  const warning = jest.spyOn(merger, 'logWarning').mockResolvedValue();
  await merger.commit();

  expect((await git.raw(['show', '-s', '--format=%B', 'HEAD'])).trim()).toBe(
    '[AUTOMATED] current',
  );
  expect(warning).toHaveBeenCalledWith(
    'Shopify source commit is no longer reachable; omitting attribution.',
  );
});
