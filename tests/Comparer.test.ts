'use strict';

import Comparer from '../src/merger/Comparer';
import { getFixtures } from './utils/get-fixtures';

it('identifies the same `settings_schema.json` setting', () => {
  const comparer = new Comparer();
  const a = {
    type: 'checkbox',
    id: 'predictive_search_show_vendor',
    default: false,
    label:
      't:settings_schema.search_input.settings.predictive_search_show_vendor.label',
    info: 't:settings_schema.search_input.settings.predictive_search_show_vendor.info',
  };
  const b = {
    type: 'checkbox',
    id: 'predictive_search_show_vendor',
    default: true,
    info: 'No info',
  };
  const c = {
    type: 'checkbox',
    id: 'predictive_search_show_name',
    default: true,
    info: 'No info',
  };

  const result1 = comparer.compareObjects(
    a,
    b,
    ['0', 'settings'],
    'settings_schema.json',
  );
  expect(result1?.equal).toBe(true);

  const result2 = comparer.compareObjects(
    a,
    c,
    ['0', 'settings'],
    'settings_schema.json',
  );
  expect(result2?.equal).toBe(false);
  expect(result2?.similarity).toBeGreaterThan(0);
});

it('identifies an object in an array', () => {
  const { base, ours, theirs, expected } = getFixtures('merger/array');
  const comparer = new Comparer();
  const themeInfo = base[0];
  const result = comparer.getArrayElementDiff3(themeInfo, {
    base,
    theirs,
    ours,
  });
  expect(result).toMatchObject({
    object: themeInfo,
    basePosition: 0,
    oursPosition: 0,
    theirsPosition: 0,
  });

  // Compare "social media" object
  const socialMedia = base[1];
  const result2 = comparer.getArrayElementDiff3(socialMedia, {
    base,
    theirs,
    ours,
  });
  expect(result2).toMatchObject({
    object: socialMedia,
    basePosition: 1,
    oursPosition: 2,
    theirsPosition: 1,
  });

  // Compare "search input" object
  const searchInput = base[2];
  const result3 = comparer.getArrayElementDiff3(searchInput, {
    base,
    theirs,
    ours,
  });
  expect(result3).toMatchObject({
    object: searchInput,
    basePosition: 2,
    oursPosition: 1,
    theirsPosition: 2,
  });

  // Compare "favicon" object
  const favicon = base[3];
  const result4 = comparer.getArrayElementDiff3(favicon, {
    base,
    theirs,
    ours,
  });
  expect(result4).toMatchObject({
    object: favicon,
    basePosition: 3,
    oursPosition: 3,
    theirsPosition: null,
  });

  // Compare "reviews" object
  const reviews = base[6];
  const result5 = comparer.getArrayElementDiff3(reviews, {
    base,
    theirs,
    ours,
  });
  expect(result5.basePosition).toBe(6);
  expect(result5.oursPosition).toBe(5);
  expect(result5.theirsPosition).toBeInstanceOf(Array);
  if (Array.isArray(result5.theirsPosition)) {
    expect(result5.theirsPosition[0].index).toBe(5);
    expect(result5.theirsPosition[0].similarity).toBeGreaterThan(0);
    expect(result5.theirsPosition[0].similarity).toBeLessThan(1);
  }
});
