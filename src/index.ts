export {
  Merger,
  MergerConstructorOptions,
  ConflictNode,
  PreferredSide,
} from './merger/Merger';

export { formatJson, FormatterOptions } from './formatter/formatJson';

export {
  Comparer,
  ComparisonResult,
  NormalizedComparisonResult,
  ArrayComparisonSource,
  ArrayElementPosition,
  ArrayElementResult,
} from './merger/Comparer';

export {
  ArrayMerger,
  ArrayMergerOptions,
  ArrayMergerVariant,
  SourceType,
} from './merger/ArrayMerger';

export {
  GitMerger,
  Logger,
  GitMergerOptions,
  GitMergerResult,
  defaultGitMergerOptions,
  AncestorIdentifier,
  possibleConfigFiles,
} from './git-integration/GitMerger';
