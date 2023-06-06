'use strict';

import Merger from '../src/merger/Merger';
import { getFixtures, writeFixture } from './utils/get-fixtures';

it('merges objects correctly (settings_data.json)', () => {
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

it('merges objects correctly (object-2)', () => {
  const { base, ours, theirs, expected } = getFixtures('merger/object-2');

  const merger = new Merger({
    ancestor: base,
    ours,
    theirs,
    preferred: 'theirs',
    filename: 'index.json',
  });
  const result = merger.merge();
  const hasConflict = merger.hasConflicts();

  expect(result).toEqual(expected);
  expect(hasConflict).toBe(false);
});

it('merges arrays correctly (ours)', () => {
  const { base, ours, theirs, expected } = getFixtures(
    'merger/array',
    'expected-ours.json',
  );
  const merger = new Merger({
    ancestor: base,
    ours,
    theirs,
    preferred: 'ours',
    filename: 'settings_schema.json',
  });
  const result = merger.merge();
  const hasConflict = merger.hasConflicts();
  writeFixture(result, 'merger/array', 'result-ours.json');

  expect(result).toEqual(expected);
  expect(hasConflict).toBe(false);
});

it('merges arrays correctly (theirs)', () => {
  const { base, ours, theirs, expected } = getFixtures(
    'merger/array',
    'expected-theirs.json',
  );
  const merger = new Merger({
    ancestor: base,
    ours,
    theirs,
    preferred: 'theirs',
    filename: 'settings_schema.json',
  });
  const result = merger.merge();
  const hasConflict = merger.hasConflicts();
  writeFixture(result, 'merger/array', 'result-theirs.json');

  expect(result).toEqual(expected);
  expect(hasConflict).toBe(false);
});
