import simpleGit from 'simple-git';
import * as fs from 'fs';
import path from 'path';
import * as glob from 'glob';
import { Merger } from '../merger/Merger';
import prettier from 'prettier';
import appRoot from 'app-root-path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
const execAsync = promisify(exec);

export interface GitMergerOptions {
  jsonPaths?: string[];
  gitRoot?: string | null;
  createCommit?: boolean;
  mainBranch?: string;
  liveMirrorBranch?: string;
  checkJsonValidity?: boolean;
  formatter?: ((json: string, path: string) => string) | null;
  commitMessage?: string;
}

export class GitMerger {
  chalkInstance: any | null = null;
  gitRoot: string;
  jsonPaths: string[];
  git: any = null;
  createCommit: boolean;
  mainBranch: string;
  liveMirrorBranch: string;
  checkJsonValidity: boolean;
  formatter: (json: string, path: string) => string;
  commitMessage: string;

  constructor({
    jsonPaths = ['templates/**/*.json', 'locales/*.json', 'config/*.json'],
    gitRoot = null,
    createCommit = false,
    mainBranch = 'main',
    liveMirrorBranch = 'live-mirror',
    checkJsonValidity = true,
    commitMessage = `[AUTOMATED] Update JSON files from #liveMirror# branch: #files#}`,
    formatter = null,
  }: GitMergerOptions) {
    // Get the git root as the node module root
    const projectRoot = appRoot.toString();
    this.gitRoot = gitRoot || projectRoot;
    this.jsonPaths = jsonPaths;
    this.createCommit = createCommit;
    this.mainBranch = mainBranch;
    this.liveMirrorBranch = liveMirrorBranch;
    this.checkJsonValidity = checkJsonValidity;
    this.commitMessage = commitMessage;

    if (formatter) {
      this.formatter = formatter;
    } else {
      this.formatter = (json: string, path: string) => {
        return prettier.format(json, { filepath: path });
      };
    }

    this.git = simpleGit({
      baseDir: this.gitRoot,
      maxConcurrentProcesses: 1,
      trimmed: false,
    });
  }

  async run() {
    // 0. Do we have uncommitted changes?
    let status = await this.git.status();
    if (status.files.length > 0) {
      await this.logError(
        'You have uncommitted changes. Please commit them first.',
      );
      process.exit(1);
    }

    // 1. Pull the latest changes from the remote "live-mirror" branch
    await this.pullLiveMirrorBranch();

    // 2. Make a list of all JSON files.
    const { valid: allJsons } = await this.getAllJsons();

    // 3a. Make sure we are on the "main" branch
    await this.git.checkout(this.mainBranch);

    // 3b. Get the current branch
    await this.checkCurrentBranch();

    // 4. Merge the JSON files - take the last file content from all 3 branches: main, live-mirror and production
    const { hasConflict, mergedFiles } = await this.mergeJsonFiles(allJsons);

    // 3b. Check if there are conflicts - if there are, abort the commit and ask the user to resolve them.
    if (status.conflicted.length > 0 || hasConflict) {
      await this.logError(
        'There are conflicts in the merge. Please do the merge manually.',
      );
      process.exit(1);
    }

    // 5. Check if there are committed changes
    status = await this.git.status();
    if (status.files.length == 0) {
      await this.logSuccess('No changes to commit');
      process.exit(0);
    }

    // 5b. Check the JSON validity using theme check. Merges can sometimes create invalid JSON files. If there are errors, we will abort the commit and ask the user to fix them.
    if (!this.checkJsonValidity) {
      const isValid = await this.validateJson();
      if (!isValid) {
        process.exit(1);
      }
    }

    // 6. Commit the changes
    this.maybeCreateCommit(mergedFiles);
  }

  /**
   * Check what is the current branch.
   */
  async checkCurrentBranch(): Promise<string> {
    let currentBranch = (await this.git.branchLocal()).current;
    await this.logInfo('Current branch: ' + currentBranch);
    return currentBranch;
  }

  /**
   * Pull the latest changes from the remote "live-mirror" branch
   */
  async pullLiveMirrorBranch(): Promise<void> {
    // 1. Remove the local "live-mirror" branch, so that we can create a new one from the remote "live-mirror" branch. This will prevent merge conflicts with existing local `live-mirror` branches.
    this.removeLiveMirrorBranch();

    // 1b. Create a new local "live-mirror" branch from the remote "live-mirror" branch
    await this.logInfo(
      'Creating new local "live-mirror" branch from the remote "live-mirror" branch',
    );
    await this.git.checkout([
      '-b',
      this.liveMirrorBranch,
      'origin/live-mirror',
    ]);

    // 1c. Get the current branch
    let currentBranch = await this.checkCurrentBranch();

    // 1d. Check if the "live-mirror" branch exists
    if (currentBranch != this.liveMirrorBranch) {
      await this.logError(
        'The "live-mirror" branch does not exist. Please create it first.',
      );
      await this.logWarning('Reverting to "main" branch');
      await this.git.checkout(this.mainBranch);
      process.exit(1);
    }

    // 1e. Pull the latest changes from the remote "live-mirror" branch
    await this.git.pull('origin', this.liveMirrorBranch);
  }

  /**
   * Get all jsons matching the glob patterns, both from the "main" branch and from the "live-mirror" branch, except the ones that are .gitignored.
   */
  async getAllJsons(): Promise<{ valid: string[]; ignored: string[] }> {
    const allJsons: string[] = [];
    const ignoredJsons: string[] = [];

    //  Make a list of all JSON files from the "live-mirror" branch
    await this.git.checkout(this.liveMirrorBranch);
    const remoteBranchJsons: string[] = [];
    this.jsonPaths.forEach((jsonFile) => {
      remoteBranchJsons.push(...glob.sync(jsonFile));
    });

    // Go back to the local "main" branch and make a list of all JSON files
    await this.git.checkout(this.mainBranch);
    this.jsonPaths.forEach((jsonFile) => {
      allJsons.push(...glob.sync(jsonFile));
    });
    remoteBranchJsons.forEach((file) => {
      if (!allJsons.includes(file)) {
        allJsons.push(file);
      }
    });

    // Remove all .gitignored files from the list
    for await (let file of allJsons) {
      const isGitIgnored = (await this.git.checkIgnore(file)).length > 0;
      if (isGitIgnored) {
        ignoredJsons.push(file);
        allJsons.splice(allJsons.indexOf(file), 1);
      }
    }

    return { valid: allJsons, ignored: ignoredJsons };
  }

  /**
   * Merge the JSON files
   * Take the last file content from main and live-mirror branches
   */
  async mergeJsonFiles(
    allJsons: string[],
  ): Promise<{ hasConflict: boolean; mergedFiles: string[] }> {
    let hasConflict = false;
    let mergedFiles = [];
    for await (let file of allJsons) {
      const ours = JSON.parse(await this.git.show(['main:' + file]));
      const isArray = Array.isArray(ours);

      // Compare to the last "merge" commit, either from "main" or from "production".
      const lastMerge = (
        await this.git.log([
          this.mainBranch,
          '-n',
          '1',
          '-i',
          '--grep=live-mirror',
          '--',
          file,
        ])
      )?.latest;
      const lastDeploy = (
        await this.git.log(['origin/production', '-n', '1', '-i', '--', file])
      )?.latest;

      let theirs = isArray ? [] : {};
      try {
        theirs = JSON.parse(
          await this.git.show(['origin/live-mirror:' + file]),
        );
      } catch (error) {
        await this.logWarning(
          `The file ${file} does not exist in the "live-mirror" branch.`,
        );
      }

      let base = isArray ? [] : {};
      try {
        // Identify the base: the latest "merge-like" commit. If there is no such commit, use the latest commit from "main".
        let latestCommitMainTs = 0;
        let latestCommitProdTs = 0;
        if (lastMerge) {
          latestCommitMainTs = new Date(lastMerge.date).getTime();
        }
        if (lastDeploy) {
          latestCommitProdTs = new Date(lastDeploy.date).getTime();
        }
        let latestCommit = this.mainBranch;
        if (latestCommitMainTs > latestCommitProdTs) {
          latestCommit = lastMerge.hash;
        } else if (latestCommitProdTs > latestCommitMainTs) {
          latestCommit = lastDeploy.hash;
        } else {
          latestCommit = this.mainBranch;
        }

        base = JSON.parse(await this.git.show([latestCommit + ':' + file]));
      } catch (error) {
        await this.logWarning(`Could not find the base for ${file}: ${error}`);
      }

      // Skip identical files
      if (JSON.stringify(ours) === JSON.stringify(theirs)) {
        continue;
      }

      await this.logInfo(`Merging ${file}...`);
      mergedFiles.push(file);
      const merger = new Merger({
        ancestor: base,
        ours,
        theirs,
        preferred: 'theirs',
        filename: file,
      });
      const merged = merger.merge();
      const formatted = this.formatter(JSON.stringify(merged), file);
      fs.writeFileSync(path.resolve(this.gitRoot, file), formatted);
      await this.git.add(file);

      if (merger.hasConflicts()) {
        hasConflict = true;
        await this.logWarning(
          `There are conflicts in ${file}. Please do the merge manually.`,
        );
      }
    }

    return { hasConflict, mergedFiles };
  }

  /**
   * Check the JSON validity using theme check. Merges can sometimes create invalid JSON files.
   */
  async validateJson(): Promise<boolean> {
    await this.logWarning(
      'Checking JSON validity using `shopify theme check -c json`',
    );
    try {
      // Execute "shopify theme check -c json" command and get the output
      await execAsync('shopify theme check -c json -o json');
      await this.logSuccess('JSON files are valid.');
    } catch (error: any) {
      const { stdout, stderr } = error;
      // The JSON is only the first line of the output.
      const json = stdout.split('\n').slice(0, 1).join('');
      let result = [];
      if (json.trim() == '') {
        try {
          result = JSON.parse(json);
        } catch (error) {
          await this.logError(
            'The JSON output is not valid. Is theme check installed?',
          );
          await this.logWarning(stdout);
          await this.logError((error as any).toString());
          process.exit(1);
        }
      }

      // Create a list of paths with errors
      if (result.length > 0) {
        const errorPaths = result.map((item: any) => {
          const offenses = item.offenses.map((offense: any) => {
            return `${offense.start_row}:${offense.start_column} - ${offense.message}`;
          });
          return `  - ${item.path} (${offenses.join(', ')})`;
        });

        await this.logWarning(
          'There are errors in the JSON files. Please fix them first.',
        );
        await this.logError(
          'The following files have errors:\n' + errorPaths.join('\n'),
        );

        return false;
      }
    }

    return true;
  }

  /**
   * Create a commit with the changes
   */
  async maybeCreateCommit(mergedFiles: string[] = []): Promise<void> {
    const createCommit = this.createCommit;
    const message = this.commitMessage
      .replace('#liveMirror#', this.liveMirrorBranch)
      .replace('#files#', mergedFiles.join(', '));
    if (createCommit) {
      await this.logSuccess('Committing the changes');
      await this.git.commit(message);
    } else {
      await this.logWarning(
        'Not committing the changes (not requested to do so).',
      );
    }
  }

  /**
   * Remove the local "live-mirror" branch
   */
  async removeLiveMirrorBranch(): Promise<void> {
    await this.logInfo('Removing local "live-mirror" branch');
    try {
      await this.git.branch(['-D', this.liveMirrorBranch]);
    } catch (e) {
      await this.logInfo('Local "live-mirror" branch not found.');
    }
  }

  async logInfo(message: string) {
    console.log(chalk.blue(message));
  }

  async logWarning(message: string) {
    console.warn(chalk.yellow(message));
  }

  async logError(message: string) {
    console.error(chalk.red(message));
  }

  async logSuccess(message: string) {
    console.error(chalk.green(message));
  }
}

export default GitMerger;
