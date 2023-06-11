'use strict';

import simpleGit, { SimpleGit } from 'simple-git';
import GitMerger from '../src/git-integration/GitMerger';
let git: SimpleGit;
const gitRoot = process.cwd() + '/tests/fixtures/git';
import * as fs from 'fs';
import { getFixtures } from './utils/get-fixtures';

beforeEach(async () => {
  const { base, ours, theirs, expected } = getFixtures('merger/object-2');

  // Create the folder
  if (fs.existsSync(gitRoot)) {
    fs.rmSync(gitRoot, { recursive: true });
  }
  fs.mkdirSync(gitRoot);

  git = simpleGit({
    baseDir: gitRoot,
    maxConcurrentProcesses: 1,
    trimmed: false,
  });

  // Initialize git repo
  await git.init();
  await git.addConfig('user.name', 'Test User');
  await git.addConfig('user.email', 'testuser@test.com');
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
  await git.add('.');
  await git.raw(['add', 'templates/page.ignored-a.json', '-f']);
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
    ignored: ['templates/page.ignored-a.json'],
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
  const currentContent = JSON.parse(
    fs.readFileSync(gitRoot + '/templates/page.json', 'utf-8'),
  );
  expect(JSON.stringify(currentContent)).toBe(JSON.stringify(expected));
  const currentContent2 = JSON.parse(
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
  const currentContent = JSON.parse(
    fs.readFileSync(gitRoot + '/templates/page.json', 'utf-8'),
  );
  expect(JSON.stringify(currentContent)).toBe(JSON.stringify(expected));
  const currentContent2 = JSON.parse(
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

    const page2 = JSON.parse(
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

    const page3 = JSON.parse(
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
  const existing = JSON.parse(
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
  const existing2 = JSON.parse(
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
  const currentContent = JSON.parse(
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
  const page2 = JSON.parse(
    fs.readFileSync(gitRoot + '/templates/page-2.json', 'utf-8'),
  );
  expect(page2).toMatchObject(page2Content);
});
