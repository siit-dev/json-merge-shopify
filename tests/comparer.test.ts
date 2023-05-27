'use strict';

import Comparer from '../src/merger/Comparer';

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
  expect(result1.equal).toBe(true);

  const result2 = comparer.compareObjects(
    a,
    c,
    ['0', 'settings'],
    'settings_schema.json',
  );
  expect(result2.equal).toBe(false);
  expect(result2.similarity).toBeGreaterThan(0);
});
