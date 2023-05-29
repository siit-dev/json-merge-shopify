#! /usr/bin/env node

// Credits: https://gist.github.com/jphaas/ad7823b3469aac112a52
// This is a custom merge driver for json files.

/**
 * How to install:
 *
 * Install locally:
 *    git config merge.json-merge-driver.name "custom JSON merge driver"
 *    git config merge.json-merge-driver.driver "node ./path/to/json-merge-driver.js %A %O %B %P"
 *
 * Then add this to .gitattributes:
 * *.json merge=json-merge-driver
 */

import { Merger } from '../merger/Merger';
import * as fs from 'fs';
import jsonFormatter from '../formatter/formatJson';

/**
 * This is the information we pass through in the driver config
 * via the placeholders `%A %O %B %P`
 * %A = tmp filepath to our version of the conflicted file
 * %O = tmp filepath to the base version of the file
 * %B = tmp filepath to the other branches version of the file
 * %P = placeholder / real file name
 * %L = conflict marker size (to be able to still serve according to this setting)
 */
const oursPath = process.argv[2];
const basePath = process.argv[3];
const theirsPath = process.argv[4];
const filename = process.argv[5];

// Read in and parse the files
const ancestor = JSON.parse(fs.readFileSync(basePath).toString());
const ours = JSON.parse(fs.readFileSync(oursPath).toString());
const theirs = JSON.parse(fs.readFileSync(theirsPath).toString());

// This gets set to true if we find a conflict
let conflicts = false;

// Get the preferred side
const preferred = 'theirs' || process.env.JSON_MERGE_DRIVER_PREFERRED_SIDE;

// Kick off the merge on the top of the json tree
const merger = new Merger({
  ancestor,
  ours,
  theirs,
  preferred,
  filename,
});
const merged = merger.merge();

/**
 * We write the merged version of ours back to the file we got it from, which
 * is what git expects us to do with the results of the merge.
 *
 * We use the custom Shopify json formatter to format the json.
 */
fs.writeFileSync(theirsPath, jsonFormatter(merged));

console.error(
  'Have there been conflicts?',
  merger.hasConflicts() ? 'Yes' : 'No',
);

/**
 * If there were conflicts, we exit with an error code of 1 to tell git that
 * the conflicts need manual resolution.
 * Otherwise, we exit with a code of 0 to tell git that the merge was successful.
 */
process.exit(conflicts ? 1 : 0);
