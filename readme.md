# JSON Merger and formatter for Shopify

## JSON Merger

The library handles merging JSON objects and arrays.

```bash
npm install --save @smartimpact-it/json-merge-shopify
```

```javascript
import { Merger } from '@smartimpact-it/json-merge-shopify';
const merger = new Merger({
  ancestor,
  ours,
  theirs,
  preferred,
  filename,
});
const merged = merger.merge();
```

## JSON formatter

This formats JSON files to be Shopify compatible.

```javascript
import { formatJson } from '@smartimpact-it/json-merge-shopify';
const formatted = formatJson(json);
```

## Git Branch Merger

This `GitMerger` functionality is intended to workaround Shopify's limitations for the Git integration.

To use it, you will need 2 or 3 branches:

- `main` branch: this is the branch that you will be merging into
- `live-mirror` branch: this is the branch that you will be merging from; this branch needs to be connected to Shopify (i.e. the `live` branch). We never write to this branch, we only read from it. Only Shopify should be writing to this branch.
- `production` branch (optional): this is the branch that you be deploying from. It will not be connected directly to Shopify's git integration, but with a Github Action you can deploy this branch to Shopify.

To use it, import the `GitMerger` class. It has the following options:

- `gitRoot`: the root of the git repository
- `createCommit`: whether or not to create a commit with the changes
- `mainBranch`: the name of the main branch (default: `main`)
- `liveMirrorBranch`: the name of the live mirror branch (default: `live-mirror`)
- `productionBranch`: the name of the production branch (default: `production`)
- `commitMessage`: the commit message to use (default: ` [AUTOMATED] Update JSON files from ``#liveMirror#`` branch: #files# `)
- `preferred`: the preferred strategy for the merger (default: `theirs`)
- `jsonPaths`: the paths to the JSON files to merge (default: `['templates/**/*.json', 'locales/*.json', 'config/*.json']`)
- `exitIfNoExistingDeployment` (default: `true`): whether or not to exit if there is no commit on the `production` branch
- `checkJsonValidity` (default: `true`): whether or not to check the validity of the JSON files using `shopify theme check`

```javascript title="path/to/json-merger.js"
const { GitMerger } = require('@smartimpact-it/json-merge-shopify');
const path = require('path');
const gitRoot = path.resolve(__dirname, '../../../'); // The root of the git repository

(async () => {
  const createCommit =
    process.argv.includes('--commit') || process.env.COMMIT_CHANGES == 'true';

  // Initialize the merger
  const merger = new GitMerger({
    gitRoot,
    createCommit,
  });

  // Run the merge
  await merger.run();
})();
```

### Github Workflows

You will need 2 workflows:

- on the `live-mirror` branch - to check if JSON files have been modified by Shopify and then trigger the second workflow
- on the `main` branch - to merge the JSON changes from the `live-mirror` branch

```yaml title=".github/workflows/check-json-changes.yml"
name: Check modified JSON files

concurrency:
  group: live-mirror
  cancel-in-progress: false

on:
  push:
    branches:
      - live-mirror
  workflow_dispatch:

env:
  NODE_VERSION: 18
  NPM_VERSION: 9

jobs:
  check-json:
    name: Check if JSON files have been modified
    runs-on: ubuntu-latest
    if: contains(toJSON(github.event.head_commit.message), 'Update from Shopify')
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 2 # Needed to get the previous commits

      - name: Get changed files
        id: changed-files
        uses: tj-actions/changed-files@v35.9.2
        with:
          files: |
            templates/**/*.json
            locales/**/*.json
            config/*.json

      - name: Trigger merge if necessary
        if: steps.changed-files.outputs.any_changed == 'true'
        uses: actions/github-script@v6
        with:
          script: |
            # Check if there is any production deployment
            # Remove this if you don't want to check for a production deployment
            const lastRun = await github.rest.actions.listWorkflowRuns({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'production.yml',
              branch: 'production',
              status: 'success',
              per_page: 1,
            });
            if (lastRun.data.total_count === 0) {
              console.log('No successful production runs found');
              return;
            }

            # Trigger the merge workflow
            await github.rest.actions.createWorkflowDispatch({
              owner: context.repo.owner,
              repo: context.repo.repo,
              workflow_id: 'merge-live-mirror-json.yml',
              ref: 'main',
              inputs: {
                merge: 'true',
              },
            });
```

```yaml title=".github/workflows/merge-json-changes.yml"
name: Merge JSON files

concurrency:
  group: main
  cancel-in-progress: true

on:
  workflow_dispatch:

env:
  NODE_VERSION: 18
  NPM_VERSION: 9
  COMMIT_CHANGES: true

jobs:
  merge-json:
    name: Merge JSON files
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v3
        with:
          node-version: 18

      - uses: ruby/setup-ruby@v1
        with:
          ruby-version: 3.2
          bundler: 'latest'

      - name: Install Ruby dependencies
        run: |
          gem install theme-check

      - name: Get npm cache directory
        id: npm-cache-dir
        shell: bash
        run: echo "dir=$(npm config get cache)" >> $GITHUB_OUTPUT

      - name: Load NPM packages from cache
        id: npm-cache
        uses: actions/cache@v3
        with:
          path: |
            ${{ steps.npm-cache-dir.outputs.dir }}
            **/node_modules
          key: ${{ runner.os }}-node-${{ env.NODE_VERSION }}-${{ hashFiles('**/package-lock.json') }}
          restore-keys: |
            ${{ runner.os }}-node-${{ env.NODE_VERSION }}-
            ${{ runner.os }}-node-

      - name: Upgrade NPM to the correct version
        shell: bash
        env:
          NPM_VERSION: ${{ env.NPM_VERSION }}
        run: npm i -g npm@$NPM_VERSION

      - name: Install Shopify CLI
        run: npm install -g @shopify/cli @shopify/theme

      - name: Install node modules
        if: steps.npm-cache.outputs.cache-hit != 'true'
        run: npm install

      - name: Run the merge process
        uses: mathiasvr/command-output@v2.0.0
        id: merge-json
        env:
          COMMIT_CHANGES: ${{ env.COMMIT_CHANGES }}
        with:
          run: |
            git config user.name github-actions
            git config user.email github-actions@github.com
            git status
            node path/to/json-merger.js --commit
            git status

      - name: Push the changes, if there are any
        if: success()
        run: |
          git status | grep 'Your branch is ahead' && git push && echo 'Pushed changes' || echo "No changes to push"
```
