import Merger from '../src/merger';
import * as fs from 'fs';

const getFixtures = (folder) => {
  const base = fs.readFileSync(`./fixtures/${folder}/base.json`,'utf8');
  const ours = fs.readFileSync(`./fixtures/${folder}/ours.json`,'utf8');
  const theirs = fs.readFileSync(`./fixtures/${folder}/theirs.json`, 'utf8');
  const expected = fs.readFileSync(`./fixtures/${folder}/expected.json`, 'utf8');

  return {
    base: JSON.parse(base),
    ours: JSON.parse(ours),
    theirs: JSON.parse(theirs),
    expected: JSON.parse(expected),
  }
}

it('merges objects correctly', () => {
  const { base, ours, theirs, expected } = getFixtures('merger/object');

  const merger = new Merger(base, ours, theirs);
  const result = merger.merge();
  const hasConflict = merger.hasConflict();

  expect(result).toEqual(expected);
  expect(hasConflict).toBe(false);
});