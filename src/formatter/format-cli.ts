import { sync } from 'glob';
import { readFileSync, writeFileSync } from 'fs';
import jsonFormatter from './formatter';

// Get the glob patterns from the command line arguments - e.g. "npm run format-json -- templates/*.json locales/*.json config/*.json"
let globPatterns = process.argv.slice(2);
if (globPatterns.length === 0) {
  console.log('No glob patterns specified. Using default glob patterns.');
  globPatterns = ['templates/*.json', 'locales/*.json', 'config/*.json'];
}

console.log('Formatting JSON files using the following glob patterns:');
console.log(globPatterns);

const files: string[] = globPatterns.reduce((acc: string[], pattern: string) => {
  return [
    ...acc,
    ...sync(pattern, {
      ignore: ['node_modules/**/*', 'build/**/*', 'dist/**/*'],
    }),
  ];
}, []);

files.forEach((file) => {
  try {
    const source = readFileSync(file, 'utf8');
    const formatted = jsonFormatter(JSON.parse(source));
    writeFileSync(file, formatted, 'utf8');
    console.log(`Formatted ${file}...`);
  } catch (e) {
    console.error(`Error formatting ${file}: ${e}`);
  }
});
