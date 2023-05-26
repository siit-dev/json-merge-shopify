'use strict';

import formatJson from '../src/formatter/formatJson';
import { getFixture } from './utils/get-fixtures';

it.skip('formats JSON', () => {
  const source = getFixture('format', 'source.json', true);
  const expected = getFixture('format', 'formatted.json', false);

  const formatted = formatJson(source);
  expect(formatted).toEqual(expected);
});
