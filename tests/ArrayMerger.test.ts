import { getFixtures } from './utils/get-fixtures';
import ArrayMerger from '../src/merger/ArrayMerger';

it('gets the possible variants for merging arrays', () => {
  const { base, ours, theirs } = getFixtures('merger/array', null);
  const merger = new ArrayMerger({
    base,
    ours,
    theirs,
    preferred: 'theirs',
    filename: 'settings_schema.json',
    path: [],
  });
  const variants = merger.getVariants();
  expect(variants.length).toBeGreaterThan(0);
});

it('generates a possible result for merging arrays', () => {
  const { base, ours, theirs } = getFixtures('merger/array', null);
  const merger = new ArrayMerger({
    base,
    ours,
    theirs,
    preferred: 'theirs',
    filename: 'settings_schema.json',
    path: [],
  });
  const result = merger.merge();
  expect(result.length).toBeGreaterThan(0);
});
