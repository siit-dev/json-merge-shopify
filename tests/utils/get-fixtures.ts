import * as fs from 'fs';
import * as path from 'path';

export const getFixture = (folder: string, file: string, parseJson = true) => {
  const currentFolder = path.dirname(__dirname);
  const source = fs.readFileSync(
    `${currentFolder}/fixtures/${folder}/${file}`,
    'utf8',
  );
  return parseJson ? JSON.parse(source) : source;
};

export const getFixtures = (folder: string) => {
  return {
    base: getFixture(folder, 'base.json'),
    ours: getFixture(folder, 'ours.json'),
    theirs: getFixture(folder, 'theirs.json'),
    expected: getFixture(folder, 'expected.json'),
  };
};
