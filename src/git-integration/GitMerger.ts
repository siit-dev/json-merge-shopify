import simpleGit, {
  DefaultLogFields,
  ListLogLine,
  SimpleGit,
} from 'simple-git';
import * as fs from 'fs';
import path from 'path';
import * as glob from 'glob';
import { Merger } from '../merger/Merger';
// @ts-ignore
import prettier from 'prettier';
import appRoot from 'app-root-path';
import { exec } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';
const execAsync = promisify(exec);
import * as JSON5 from 'json5';

export type ThemeCheckResultOffense = {
  check: string;
  severity: number;
  start_row: number;
  start_column: number;
  end_row: number;
  end_column: number;
  message: string;
};
export type ThemeCheckResult = {
  path: string;
  offenses: ThemeCheckResultOffense[];
  errorCount: number;
  suggestionCount: number;
  styleCount: number;
};

export type AncestorIdentifier = (
  file: string,
  instance: GitMerger,
  {
    existsInMain,
    existsInLiveMirror,
  }: {
    existsInMain: boolean;
    existsInLiveMirror: boolean;
  },
) => Promise<string | null>;

export type Logger = (
  message: string | Error,
  type: 'log' | 'warn' | 'error' | 'success',
) => unknown;

export interface GitMergerOptions {
  jsonPaths?: string[];
  gitRoot?: string | null;
  createCommit?: boolean;
  mainBranch?: string;
  liveMirrorBranch?: string;
  productionBranch?: string | null;
  runLocallyOnly?: boolean;
  exitIfNoExistingDeployment?: boolean;
  preferred?: 'ours' | 'theirs' | null;
  checkJsonValidity?: boolean;
  failIfThemeCheckMissing?: boolean;
  commitMessage?: string;
  createNewFiles?: boolean;
  ancestorIdentifier?: AncestorIdentifier | null;
  formatter?: ((json: string, path: string) => Promise<string>) | null;
  logger?: Logger | null;
  verbose?: boolean;
}

export interface GitMergerResult {
  mergedFiles?: string[];
  hasConflict?: boolean;
  hasErrors?: boolean;
  hasCommitted?: boolean;
  error?: any;
}

export const defaultGitMergerOptions: Required<GitMergerOptions> = {
  jsonPaths: [
    'templates/**/*.json',
    'locales/*.json',
    'config/*.json',
    'sections/**/*.json',
  ],
  gitRoot: null,
  createCommit: false,
  mainBranch: 'main',
  liveMirrorBranch: 'live-mirror',
  productionBranch: 'production',
  preferred: 'theirs',
  checkJsonValidity: true,
  failIfThemeCheckMissing: true,
  commitMessage:
    '[AUTOMATED] Update JSON files from `#liveMirror#` branch: #files#',
  formatter: null,
  exitIfNoExistingDeployment: true,
  runLocallyOnly: false,
  ancestorIdentifier: null,
  createNewFiles: false,
  logger: null,
  verbose: false,
};

export const possibleConfigFiles: string[] = [
  'shopify-git-merger.config.js',
  'shopify-git-merger.config.json',
];

export class GitMerger {
  chalkInstance: any | null = null;
  gitRoot: string;
  jsonPaths: string[];
  git: SimpleGit;
  createCommit: boolean;
  mainBranch: string;
  productionBranch: string | null;
  liveMirrorBranch: string;
  checkJsonValidity: boolean;
  failIfThemeCheckMissing: boolean;
  formatter: (json: string, path: string) => Promise<string>;
  commitMessage: string;
  preferred: 'ours' | 'theirs';
  exitIfNoExistingDeployment: boolean;
  runLocallyOnly: boolean;
  ancestorIdentifier: AncestorIdentifier | null = null;
  logger: Logger | null;
  verbose: boolean;
  createNewFiles: boolean;

  /**
   * Create a new GitMerger instance.
   *
   * @param options - The options for the merger. If it's a string, it's the path to a config file (JSON or JS)
   */
  constructor(
    options: GitMergerOptions | string | null,
    extraOptions: Partial<GitMergerOptions> = {},
  ) {
    let mergedOptions: Required<GitMergerOptions>;

    // If the options are a string, it's the path to a config file.
    if (typeof options == 'string' || options == null) {
      options = this.getOptionsFromConfigFile(options, extraOptions);
      mergedOptions = {
        ...this.getDefaultOptions(),
        ...extraOptions,
        ...options,
      };
    } else {
      mergedOptions = {
        ...this.getDefaultOptions(),
        ...options,
        ...extraOptions,
      };
    }

    const {
      jsonPaths,
      gitRoot,
      createCommit,
      mainBranch,
      liveMirrorBranch,
      productionBranch,
      preferred,
      checkJsonValidity,
      failIfThemeCheckMissing,
      commitMessage,
      formatter,
      exitIfNoExistingDeployment,
      runLocallyOnly,
      ancestorIdentifier,
      createNewFiles,
      logger,
      verbose,
    } = mergedOptions;

    // Get the git root as the node module root
    const projectRoot = appRoot.toString();
    this.gitRoot = gitRoot || projectRoot;
    this.jsonPaths = jsonPaths;
    this.createCommit = createCommit;
    this.mainBranch = mainBranch;
    this.liveMirrorBranch = liveMirrorBranch;
    this.productionBranch = productionBranch;
    this.checkJsonValidity = checkJsonValidity;
    this.failIfThemeCheckMissing = failIfThemeCheckMissing;
    this.commitMessage = commitMessage;
    this.preferred = preferred || 'theirs';
    this.exitIfNoExistingDeployment = exitIfNoExistingDeployment;
    this.runLocallyOnly = runLocallyOnly;
    this.logger = logger;
    this.verbose = verbose;
    this.createNewFiles = createNewFiles;

    if (formatter) {
      this.formatter = formatter;
    } else {
      this.formatter = (json: string, path: string) => {
        return prettier.format(json, { filepath: path });
      };
    }

    if (ancestorIdentifier) {
      this.ancestorIdentifier = ancestorIdentifier;
    }

    this.git = simpleGit({
      baseDir: this.gitRoot,
      maxConcurrentProcesses: 1,
      trimmed: false,
    });
  }

  getDefaultOptions(): Required<GitMergerOptions> {
    return defaultGitMergerOptions;
  }

  /**
   * Get the options from a config file.
   */
  getOptionsFromConfigFile(
    filename: string | null = null,
    extraOptions: Partial<GitMergerOptions> = {},
  ): GitMergerOptions | null {
    // Make sure we have a git root
    this.gitRoot = this.gitRoot || extraOptions.gitRoot || appRoot.toString();

    if (!filename) {
      for (let file of possibleConfigFiles) {
        const filePath = path.resolve(this.gitRoot, file);
        if (fs.existsSync(filePath)) {
          filename = file;
          break;
        }
      }
    }
    if (!filename) {
      this.logWarning('No config file found for git root: ' + this.gitRoot);
      return null;
    }

    const configFile = path.resolve(this.gitRoot, filename);
    if (!fs.existsSync(configFile)) {
      this.logWarning('No config file found at ' + configFile);
      return null;
    }

    let config = null;
    if (configFile.endsWith('.js')) {
      this.logInfo('Loading config file (JS): ' + configFile);
      config = require(configFile);
    }

    if (configFile.endsWith('.json')) {
      this.logInfo('Loading config file (JSON): ' + configFile);
      config = JSON5.parse(fs.readFileSync(configFile, 'utf8'));
    }

    return config as GitMergerOptions | null;
  }

  async run(): Promise<GitMergerResult> {
    // 0. Do we have uncommitted changes?
    let status = await this.git.status();
    if (status.files.length > 0) {
      const error = new Error(
        'You have uncommitted changes. Please commit them first.',
      );
      await this.logError(error);
      return { hasErrors: true, error };
    }

    try {
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
        return { hasConflict: true };
      }

      // 5. Check if there are committed changes
      status = await this.git.status();
      if (status.files.length == 0) {
        await this.logSuccess('No changes to commit');
        return {
          hasCommitted: false,
          hasErrors: false,
          mergedFiles,
          hasConflict,
        };
      }

      // 5b. Check the JSON validity using theme check. Merges can sometimes create invalid JSON files. If there are errors, we will abort the commit and ask the user to fix them.
      if (this.checkJsonValidity) {
        const isValid = await this.validateJson(allJsons);
        if (!isValid) {
          const error = new Error(
            'There are errors in the JSON files. Please fix them first.',
          );
          await this.logError(error);
          return { hasErrors: true, mergedFiles, hasConflict, error };
        }
      }

      // 6. Commit the changes
      const hasCommitted = await this.maybeCreateCommit(mergedFiles);

      return {
        hasCommitted,
        hasErrors: false,
        mergedFiles,
        hasConflict,
      };
    } catch (error) {
      throw error;
      return {
        hasErrors: true,
        error,
      };
    }
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
    if (this.runLocallyOnly) {
      await this.logWarning(
        'Running locally only. Skipping pulling the latest changes from the remote "live-mirror" branch.',
      );
      return;
    }

    // 1. Remove the local "live-mirror" branch, so that we can create a new one from the remote "live-mirror" branch. This will prevent merge conflicts with existing local `live-mirror` branches.
    this.removeLiveMirrorBranch();

    // 1b. Create a new local "live-mirror" branch from the remote "live-mirror" branch
    await this.logInfo(
      `Creating new local "${this.liveMirrorBranch}" branch from the remote "${this.liveMirrorBranch}" branch`,
    );
    await this.git.checkout([
      '-b',
      this.liveMirrorBranch,
      `origin/${this.liveMirrorBranch}`,
    ]);

    // 1c. Get the current branch
    let currentBranch = await this.checkCurrentBranch();

    // 1d. Check if the "live-mirror" branch exists
    if (currentBranch != this.liveMirrorBranch) {
      await this.logWarning(`Reverting to "${this.mainBranch}" branch`);
      await this.git.checkout(this.mainBranch);
      await this.logError(
        `The "${this.liveMirrorBranch}" branch does not exist. Please create it first.`,
      );
      throw new Error(
        `The "${this.liveMirrorBranch}" branch does not exist. Please create it first.`,
      );
    }

    // 1e. Pull the latest changes from the remote "live-mirror" branch
    await this.git.pull('origin', this.liveMirrorBranch);
  }

  /**
   * Use the `origin/` prefix if we are not running strictly locally.
   */
  private maybeGetOriginPrefix() {
    return this.runLocallyOnly ? '' : 'origin/';
  }

  /**
   * Get all jsons matching the glob patterns, both from the "main" branch and from the "live-mirror" branch, except the ones that are .gitignored.
   */
  async getAllJsons(): Promise<{ valid: string[]; ignored: string[] }> {
    const allJsons: string[] = [];
    const ignoredJsons: string[] = [];

    if (this.verbose) {
      await this.logInfo(
        `Getting all JSON files from the "${this.mainBranch}" and "${this.liveMirrorBranch}" branches. The git root is "${this.gitRoot}".`,
      );
    }

    //  Make a list of all JSON files from the "live-mirror" branch
    await this.git.checkout(this.liveMirrorBranch);
    const remoteBranchJsons: string[] = [];
    this.jsonPaths.forEach((jsonFile) => {
      const found = glob.sync(this.gitRoot + '/' + jsonFile);
      remoteBranchJsons.push(...found);
      if (this.verbose) {
        this.logInfo(
          `Found ${found.length} JSON files in the "${this.liveMirrorBranch}" branch for the pattern "${jsonFile}"`,
        );
      }
    });
    if (this.verbose) {
      await this.logInfo(
        `Found ${remoteBranchJsons.length} JSON files in the "${
          this.liveMirrorBranch
        }" branch: ${remoteBranchJsons
          .map(this.removeGitRootPrefix)
          .join(', ')}`,
      );
    }

    // Go back to the local "main" branch and make a list of all JSON files
    await this.git.checkout(this.mainBranch);
    this.jsonPaths.forEach((jsonFile) => {
      const found = glob.sync(this.gitRoot + '/' + jsonFile);
      allJsons.push(...found);
      if (this.verbose) {
        this.logInfo(
          `Found ${found.length} JSON files in the "${this.mainBranch}" branch for the pattern "${jsonFile}"`,
        );
      }
    });
    if (this.verbose) {
      await this.logInfo(
        `Found ${allJsons.length} JSON files in the "${
          this.mainBranch
        }" branch: ${allJsons.map(this.removeGitRootPrefix).join(', ')}`,
      );
    }
    remoteBranchJsons.forEach((file) => {
      if (!allJsons.includes(file)) {
        allJsons.push(file);
      }
    });

    // Remove all .gitignored files from the list
    const valid = [];
    for await (let file of allJsons) {
      const filename = this.removeGitRootPrefix(file);
      const gitIgnored = await this.git.checkIgnore(filename);
      const isGitIgnored = gitIgnored.length > 0;

      if (isGitIgnored) {
        ignoredJsons.push(file);

        if (this.verbose) {
          await this.logInfo(
            `Ignoring ${this.removeGitRootPrefix(
              filename,
            )} because it is .gitignored.`,
          );
        }
      } else if (
        file.endsWith('.schema.json') ||
        file.endsWith('_schema.json')
      ) {
        // Ignore the ".schema.json" and "_schema.json" files.
        ignoredJsons.push(file);
        if (this.verbose) {
          await this.logInfo(
            `Ignoring ${this.removeGitRootPrefix(
              filename,
            )} because it is a schema file.`,
          );
        }
      } else {
        valid.push(file);
      }
    }

    return {
      valid: valid.map(this.removeGitRootPrefix),
      ignored: ignoredJsons.map(this.removeGitRootPrefix),
    };
  }

  /**
   * Remove the git root prefix from the file path.
   *
   * @param file
   * @returns
   */
  private removeGitRootPrefix = (file: string): string => {
    if (file.startsWith(this.gitRoot)) {
      return file.substring(this.gitRoot.length + 1);
    }

    return file;
  };

  /**
   * Get the file content from a specific commit.
   */
  async getFileContentFromCommit(
    file: string,
    commitOrBranch: string,
    displayWarning = true,
  ): Promise<{ exists: boolean; content: any | null }> {
    let exists = false;
    let content = null;
    try {
      content = JSON5.parse(await this.git.show([`${commitOrBranch}:${file}`]));
      exists = true;
    } catch (error) {
      if (displayWarning) {
        await this.logWarning(
          `The file ${file} does not exist in the "${commitOrBranch}" branch/commit.`,
        );
      }
    }

    return { exists, content };
  }

  /**
   * Check if a file exists in a specific commit.
   */
  async fileExistsInCommit(
    file: string,
    commitOrBranch: string,
  ): Promise<boolean> {
    try {
      await this.git.show([`${commitOrBranch}:${file}`]);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Save and commit a JSON file.
   * @param file
   * @param content
   */
  async saveAndCommitJsonFile(file: string, content: any): Promise<void> {
    const formatted = await this.formatter(JSON.stringify(content), file);
    fs.writeFileSync(path.resolve(this.gitRoot, file), formatted);
    await this.git.add(file);
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
      if (this.verbose) {
        await this.logInfo(`Merging ${file}...`);
      }

      const { hasConflict: fileHasConflict, isMerged } =
        await this.mergeJsonFile(file);
      if (isMerged) {
        mergedFiles.push(file);
      }

      if (fileHasConflict) {
        hasConflict = true;
        await this.logWarning(
          `There are conflicts in ${file}. Please do the merge manually.`,
        );
      }
    }

    return { hasConflict, mergedFiles };
  }

  /**
   * Merge a JSON file
   * @param file
   */
  async mergeJsonFile(
    file: string,
  ): Promise<{ hasConflict: boolean; isMerged: boolean }> {
    // Get the file content from the "main" branch
    const { content: ours, exists: oursExists } =
      await this.getFileContentFromCommit(file, this.mainBranch);

    // Get the file content from the "live-mirror" branch
    const { content: theirs, exists: theirsExists } =
      await this.getFileContentFromCommit(
        file,
        this.maybeGetOriginPrefix() + this.liveMirrorBranch,
      );

    // Determine the type of the content: array or object
    let isArray = false;
    if (ours) {
      isArray = Array.isArray(ours);
    } else if (theirs) {
      isArray = Array.isArray(theirs);
    }

    let base = isArray ? [] : {};
    const existsInMain = oursExists;
    const existsInLiveMirror = theirsExists;
    let ancestorCommit = null;

    try {
      ancestorCommit = await this.getAncestorCommit(file, {
        existsInMain,
        existsInLiveMirror,
      });
    } catch (e) {
      if (this.verbose) {
        await this.logError(
          `Could not find the base (ancestor commit) for ${file}: ${e}`,
        );
      }

      return {
        hasConflict: true,
        isMerged: false,
      };
    }

    if (!ancestorCommit) {
      await this.logWarning(
        `Could not find the base (ancestor commit) for ${file}.`,
      );

      // Handle new files in the "live-mirror" branch.
      if (existsInLiveMirror && !existsInMain) {
        // If the "createNewFiles" flag is false, we should skip it.
        if (!this.createNewFiles) {
          await this.logWarning(
            `The file ${file} exists in the "${this.liveMirrorBranch}" branch but not in the "${this.mainBranch}" branch. Skipping because "createNewFiles" flag is false.`,
          );
          return {
            hasConflict: false,
            isMerged: false,
          };
        }

        // If the "createNewFiles" flag is true, we should save it in the "main" branch.
        await this.logWarning(
          `The file ${file} exists in the "${this.liveMirrorBranch}" branch but not in the "${this.mainBranch}" branch. Saving it in the "${this.mainBranch}" branch, because "createNewFiles" flag is true.`,
        );
        await this.saveAndCommitJsonFile(file, theirs);
        return {
          hasConflict: false,
          isMerged: true,
        };
      }

      // If it's a new file in the "main" branch, we should skip it.
      if (existsInMain && !existsInLiveMirror) {
        await this.logWarning(
          `The file ${file} exists in the "${this.mainBranch}" branch but not in the "${this.liveMirrorBranch}" branch. Skipping.`,
        );
        return {
          hasConflict: false,
          isMerged: false,
        };
      }

      // If the file exists in both branches, we should merge it, but how??
      await this.logError(
        `The file ${file} exists in both branches but we could not find the base (ancestor commit). Please do the merge manually.`,
      );
      return {
        hasConflict: true,
        isMerged: false,
      };
    }

    const result = await this.getFileContentFromCommit(file, ancestorCommit);
    const exists = result.exists;
    if (exists) {
      base = result.content;
    }

    // Skip identical files
    if (JSON.stringify(ours) === JSON.stringify(theirs)) {
      return {
        hasConflict: false,
        isMerged: false,
      };
    }

    // Merge the files
    await this.logInfo(`Merging ${file}...`);
    const emptyValue = isArray ? [] : {};
    const merger = new Merger({
      ancestor: base,
      ours: ours || emptyValue,
      theirs: theirs || emptyValue,
      preferred: this.preferred,
      filename: file,
    });
    const merged = merger.merge();
    await this.saveAndCommitJsonFile(file, merged);

    return {
      hasConflict: merger.hasConflicts(),
      isMerged: true,
    };
  }

  /**
   * Get the commit hash to use as a base for the merge.
   * @param file
   */
  async getAncestorCommit(
    file: string,
    {
      existsInMain = null,
      existsInLiveMirror = null,
    }: {
      existsInMain?: boolean | null;
      existsInLiveMirror?: boolean | null;
    } = {},
  ): Promise<string | null> {
    // Check if the file exists in the "main" branch
    if (existsInMain === null) {
      existsInMain = await this.fileExistsInCommit(file, this.mainBranch);
    }

    // Check if the file exists in the "live-mirror" branch
    if (existsInLiveMirror === null) {
      existsInLiveMirror = await this.fileExistsInCommit(
        file,
        `${this.maybeGetOriginPrefix()}${this.liveMirrorBranch}`,
      );
    }

    // If the file exists in one branch but not in the other, we don't have an ancestor.
    if (existsInMain !== existsInLiveMirror) {
      await this.logWarning(
        `The file ${file} exists in one branch but not in the other.`,
      );
      return null;
    }

    // Use the custom ancestor identifier, if provided
    if (this.ancestorIdentifier) {
      return await this.ancestorIdentifier(file, this, {
        existsInMain,
        existsInLiveMirror,
      });
    }

    // Compare to the last "merge" commit, either from "main" or from "production".
    const lastMerge = await this.getLastMergeCommit(file);
    const lastDeploy = await this.getDeployCommit(file);

    // If the file is in both branches AND no deployment has been done yet, we should not merge. We should simply exit clean.
    if (
      existsInMain === existsInLiveMirror &&
      !lastDeploy &&
      this.exitIfNoExistingDeployment
    ) {
      await this.logError(
        `No deployment has been done yet for this file (${file}). No need to merge.`,
      );
      throw new Error(
        `No deployment has been done yet for this file (${file}). No need to merge.`,
      );
    }

    if (this.verbose) {
      await this.logInfo(
        `Last merge commit for ${file}: ${lastMerge?.hash} (${lastMerge?.date})`,
      );
      await this.logInfo(
        `Last deploy commit for ${file}: ${lastDeploy?.hash} (${lastDeploy?.date})`,
      );
    }

    const base = this.sortCommitsByDate(lastMerge, lastDeploy);
    if (!base) {
      await this.logWarning(`Could not find the base for ${file}.`);
      return null;
    }

    if (this.verbose) {
      await this.logInfo(
        `Using ${base.hash} (${base.date}) as a base for ${file}`,
      );
    }

    return base.hash;
  }

  /**
   * Get the last merge commit for a file.
   */
  async getLastMergeCommit(
    file: string,
  ): Promise<(DefaultLogFields & ListLogLine) | null> {
    try {
      return (
        await this.git.log([
          this.mainBranch,
          '-n',
          '1',
          '-i',
          `--grep=${this.liveMirrorBranch}`,
          '--',
          file,
        ])
      )?.latest;
    } catch (error) {
      if (this.verbose) {
        this.logWarning('Error while getting the last merge commit: ' + error);
      }
      return null;
    }
  }

  /**
   * Get the last production deploy commit for a file.
   */
  async getLastProductionDeployCommit(
    file: string,
  ): Promise<(DefaultLogFields & ListLogLine) | null> {
    if (!this.productionBranch) {
      return null;
    }

    try {
      return (
        await this.git.log([
          `${this.maybeGetOriginPrefix()}${this.productionBranch}`,
          '-n',
          '1',
          '-i',
          '--',
          file,
        ])
      )?.latest;
    } catch (error) {
      if (this.verbose) {
        this.logWarning(
          'Error while getting the most recent production deployment commit: ' +
            error,
        );
      }
      return null;
    }
  }

  /**
   * Get the most recent common commit between "main" and "live-mirror" branches.
   */
  async getMostRecentCommonCommit(
    file: string,
  ): Promise<(DefaultLogFields & ListLogLine) | null> {
    try {
      const lastCommonCommit = await this.git.raw([
        'merge-base',
        this.mainBranch,
        `${this.maybeGetOriginPrefix()}${this.liveMirrorBranch}`,
      ]);
      if (!lastCommonCommit) {
        return null;
      }

      return (
        await this.git.log([
          lastCommonCommit.trim(),
          '-n',
          '1',
          '-i',
          '--',
          file,
        ])
      )?.latest;
    } catch (error) {
      if (this.verbose) {
        this.logWarning(
          'Error while getting the most recent common commit: ' + error,
        );
      }
      return null;
    }
  }

  /**
   * Get the commit to use as a base for the merge.
   */
  async getDeployCommit(
    file: string,
  ): Promise<(DefaultLogFields & ListLogLine) | null> {
    return (
      (await this.getLastProductionDeployCommit(file)) ||
      (await this.getMostRecentCommonCommit(file))
    );
  }

  sortCommitsByDate(
    ...commits: Array<(DefaultLogFields & ListLogLine) | null>
  ): (DefaultLogFields & ListLogLine) | null {
    return (
      commits
        .filter((commit) => commit != null)
        .sort((a, b) => {
          if (!a && !b) {
            return 0;
          }
          if (!a) {
            return -1;
          }
          if (!b) {
            return 1;
          }

          const dateA = new Date(a.date).getTime();
          const dateB = new Date(b.date).getTime();
          return dateA - dateB;
        })
        .pop() || null
    );
  }

  /**
   * Check the JSON validity using theme check. Merges can sometimes create invalid JSON files.
   */
  async validateJson(paths: string[]): Promise<boolean> {
    await this.logWarning('Checking JSON validity using `shopify theme check`');
    try {
      // Execute "shopify theme check" command and get the output as JSON.
      await execAsync('shopify theme check  -o json');
      await this.logSuccess('JSON files are valid.');
    } catch (error: any) {
      const { stdout, stderr } = error;
      // The JSON is only the first line of the output.
      const json = stdout.split('\n').slice(0, 1).join('');
      let result: ThemeCheckResult[] = [];
      if (json.trim() != '') {
        try {
          const rawResult = JSON5.parse(json) as ThemeCheckResult[];
          // Keep only the JSON files with errors that match the glob patterns
          result = rawResult
            .filter((item) => item.errorCount > 0)
            .filter((item) => item.path.endsWith('.json'))
            .filter((item) => paths.find((path) => item.path.endsWith(path)));
        } catch (error) {
          await this.logError(
            'The JSON output is not valid. Is theme-check installed?',
          );
          await this.logInfo(json);
          await this.logWarning(stdout);
          await this.logError(stderr);
          await this.logError((error as any).toString());

          // If the JSON is not valid, we should throw an error.
          if (this.failIfThemeCheckMissing) {
            throw error;
          } else {
            return true;
          }
        }
      }

      // Create a list of paths with errors
      if (result.length > 0) {
        const errorPaths = result.map((item: ThemeCheckResult) => {
          const offenses = item.offenses.map(
            (offense: ThemeCheckResultOffense) => {
              return `${offense.start_row}:${offense.start_column} - ${offense.message}`;
            },
          );
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
  async maybeCreateCommit(mergedFiles: string[] = []): Promise<boolean> {
    const createCommit = this.createCommit;
    const message = this.commitMessage
      .replace('#liveMirror#', this.liveMirrorBranch)
      .replace('#files#', mergedFiles.join(', '));
    if (createCommit) {
      await this.logSuccess('Committing the changes');
      await this.git.commit(message);
      return true;
    } else {
      await this.logWarning(
        'Not committing the changes (not requested to do so).',
      );
      return false;
    }
  }

  /**
   * Remove the local "live-mirror" branch
   */
  async removeLiveMirrorBranch(): Promise<void> {
    await this.logInfo(`Removing local "${this.liveMirrorBranch}" branch`);
    try {
      await this.git.branch(['-D', this.liveMirrorBranch]);
    } catch (e) {
      await this.logInfo(`Local "${this.liveMirrorBranch}" branch not found.`);
    }
  }

  async logInfo(message: string) {
    if (this.logger) {
      this.logger(message, 'log');
      return;
    }

    console.log(chalk.blue(message));
  }

  async logWarning(message: string) {
    if (this.logger) {
      this.logger(message, 'warn');
      return;
    }

    console.warn(chalk.yellow(message));
  }

  async logError(message: string | Error) {
    if (this.logger) {
      this.logger(message, 'error');
      return;
    }

    console.error(chalk.red(message));
  }

  async logSuccess(message: string) {
    if (this.logger) {
      this.logger(message, 'success');
      return;
    }

    console.error(chalk.green(message));
  }
}

export default GitMerger;
