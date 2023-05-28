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

export const getFixtures = (
  folder: string,
  expectedFilename: string | null = 'expected.json',
) => {
  return {
    base: getFixture(folder, 'base.json'),
    ours: getFixture(folder, 'ours.json'),
    theirs: getFixture(folder, 'theirs.json'),
    expected: expectedFilename ? getFixture(folder, expectedFilename) : null,
  };
};

export const writeFixture = (
  content: any,
  folder: string,
  file: string,
  stringifyJson = true,
) => {
  const currentFolder = path.dirname(__dirname);
  fs.writeFileSync(
    `${currentFolder}/fixtures/${folder}/${file}`,
    stringifyJson ? JSON.stringify(content, null, 2) : content.toString(),
  );
};
