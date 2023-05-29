# JSON Merger and formatter for Shopify

## JSON Merger

The library handles merging JSON objects and arrays.

```bash
npm install --save @smartimpact-it/json-merge-shopify
```

```javascript
import { Merger } from '@smartimpact-it/json-merge-shopify';
const merger = new Merger({
  ancestor,
  ours,
  theirs,
  preferred,
  filename,
});
const merged = merger.merge();
```

## JSON formatter

This formats JSON files to be Shopify compatible.

```javascript
import { formatJson } from '@smartimpact-it/json-merge-shopify';
const formatted = formatJson(json);
```
