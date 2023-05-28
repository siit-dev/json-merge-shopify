'use strict';

import { writeFileSync } from 'fs';
import Merger from '../src/merger/Merger';
import { getFixtures, writeFixture } from './utils/get-fixtures';

it('merges objects correctly', () => {
  const { base, ours, theirs, expected } = getFixtures('merger/object');

  const merger = new Merger({
    ancestor: base,
    ours,
    theirs,
    preferred: 'theirs',
    filename: 'settings_data.json',
  });
  const result = merger.merge();
  const hasConflict = merger.hasConflicts();

  expect(result).toEqual(expected);
  expect(hasConflict).toBe(false);
});

it('merges arrays correctly', () => {
  const { base, ours, theirs, expected } = getFixtures('merger/array');

  const merger = new Merger({
    ancestor: base,
    ours,
    theirs,
    preferred: 'theirs',
    filename: 'settings_schema.json',
  });
  const result = merger.merge();
  const hasConflict = merger.hasConflicts();
  writeFixture(result, 'merger/array', 'result.json');

  expect(result).toEqual(expected);
  expect(hasConflict).toBe(false);
});
