import { Path } from './Merger';
import levenshtein from 'js-levenshtein';

export interface ComparisonResult {
  equal: boolean;
  couldBeEqual?: boolean;
  similarity?: number;
}

export interface NormalizedComparisonResult extends ComparisonResult {
  couldBeEqual: boolean;
  similarity: number;
}

export interface ArrayComparisonSource {
  base: any[];
  ours: any[];
  theirs: any[];
}

export type ArrayElementPosition =
  | number
  | Array<{ index: number; similarity: number }>
  | null;
export interface ArrayElementResult {
  object: any;
  basePosition: ArrayElementPosition;
  oursPosition: ArrayElementPosition;
  theirsPosition: ArrayElementPosition;
}

export class Comparer {
  /**
   * Compare two variables, of any type.
   */
  public compare(
    a: any,
    b: any,
    parentPath: Path = [],
    filename: string | null = null,
  ): ComparisonResult {
    // If they are equal, return that they are equal :)
    if (JSON.stringify(a) === JSON.stringify(b)) {
      return this.equal();
    }

    // If they are both arrays, compare them as arrays.
    if (Array.isArray(a) && Array.isArray(b)) {
      const result = this.compareArrays(a, b, parentPath, filename);
      if (result) {
        return result;
      }
    }

    // If they are both objects, compare them as objects.
    if (
      typeof a === 'object' &&
      typeof b === 'object' &&
      Array.isArray(a) === Array.isArray(b)
    ) {
      const result = this.compareObjects(a, b, parentPath, filename);
      if (result) {
        return result;
      }
    }

    // If they are both strings, compare them as strings.
    if (typeof a === 'string' && typeof b === 'string') {
      return this.compareStrings(a, b, parentPath, filename);
    }

    return this.unequal();
  }

  /**
   * Compare two arrays.
   */
  public compareArrays(
    a: any,
    b: any,
    parentPath: Path = [],
    filename: string | null = null,
  ): ComparisonResult | null {
    // Check if they are both arrays.
    const aIsArray = Array.isArray(a);
    const bIsArray = Array.isArray(b);
    if (!aIsArray && !bIsArray) {
      return this.compare(a, b, parentPath, filename);
    }

    // If they are equal, return that they are equal :)
    if (JSON.stringify(a) === JSON.stringify(b)) {
      return this.equal();
    }

    // If one of them is not an array, return that they are not equal.
    if ((!aIsArray || !bIsArray) && aIsArray !== bIsArray) {
      return this.unequal();
    }

    // Now we know that both are arrays. Compare them as arrays.
    const common = a.filter((element: any) => {
      const found = b.find((bElement: any) => {
        return this.compare(element, bElement, parentPath, filename)?.equal;
      });
      return !!found;
    });
    if (a.length === b.length && common.length === a.length) {
      return this.equal();
    }
    if (common.length > 0 && common.length / a.length > 0.5) {
      return {
        equal: false,
        couldBeEqual: true,
        similarity: common.length / a.length,
      };
    }

    return this.unequal();
  }

  /**
   * Compare two objects (not arrays).
   */
  public compareObjects(
    a: any,
    b: any,
    parentPath: Path = [],
    filename: string | null = null,
  ): ComparisonResult | null {
    // If they are equal, return that they are equal :)
    if (JSON.stringify(a) === JSON.stringify(b)) {
      return this.equal();
    }

    // If one of theme is not an object, return that they are not equal.
    if (typeof a !== 'object' || typeof b !== 'object') {
      return this.unequal();
    }

    // Check if any of them is an array.
    const aIsArray = Array.isArray(a);
    const bIsArray = Array.isArray(b);
    if (aIsArray || bIsArray) {
      return this.compareArrays(a, b, parentPath, filename);
    }

    const parentPathString = parentPath ? parentPath.join('.') : '';

    // Handle setting fields.
    let result: ComparisonResult | null = null;
    if (a.type && b.type && a.id && b.id) {
      result = this.compareSettings(a, b, parentPath, filename);
      if (result) {
        return result;
      }
    } else if (parentPathString.match(/\d+\.settings/)) {
      result = this.compareSettings(a, b, parentPath, filename);
      if (result) {
        return result;
      }
    } else if (
      a.name &&
      b.name &&
      (parentPathString == '' ||
        (a.settings &&
          b.settings &&
          Array.isArray(a.settings) &&
          Array.isArray(b.settings)))
    ) {
      result = this.compareSettingBlocks(a, b, parentPath, filename);
      if (result) {
        return result;
      }
    }

    return this.unequal();
  }

  /**
   * Compare blocks of settings
   */
  private compareSettingBlocks(
    a: any,
    b: any,
    parentPath: string[] | null = null,
    filename: string | null = null,
  ): ComparisonResult | null {
    // If the name is different, they are not equal
    if (a.name && a.name !== b.name) {
      // Compare the settings.
      const aSettingIds = (a.settings || []).map((setting: any) => setting.id);
      const bSettingIds = (b.settings || []).map((setting: any) => setting.id);
      const intersection = aSettingIds.filter((id: string) =>
        bSettingIds.includes(id),
      );
      const union = [...new Set([...aSettingIds, ...bSettingIds])];
      // If the intersection is more than half of the settings, they could be equal
      if (intersection.length > 0 && intersection.length / union.length > 0.5) {
        return {
          equal: false,
          couldBeEqual: true,
          similarity: (intersection.length / union.length) * 0.85,
        };
      }

      return this.unequal();
    }

    // Blocks without settings, but with the same name are equal.
    if (!a.settings && !b.settings) {
      return {
        equal: true,
        couldBeEqual: true,
        similarity: 0.8,
      };
    }

    // If the name is the same, but the one doesn't have settings, they could be equal
    if (!!a.settings !== !!b.settings) {
      return {
        equal: false,
        couldBeEqual: true,
        similarity: 0.5,
      };
    }

    // If both have settings, compare the setting IDs
    const aSettingIds = (a.settings || []).map((setting: any) => setting?.id);
    const bSettingIds = (b.settings || []).map((setting: any) => setting?.id);
    const intersection = aSettingIds.filter((id: string) =>
      bSettingIds.includes(id),
    );
    const union = [...new Set([...aSettingIds, ...bSettingIds])];
    // If the intersection is more than half of the settings, they could be equal
    if (
      intersection.length > 0 &&
      intersection.length > Math.max(aSettingIds.length, bSettingIds) / 2 &&
      intersection.length > Math.min(aSettingIds.length, bSettingIds.length)
    ) {
      return {
        equal: false,
        couldBeEqual: true,
        similarity: intersection.length / union.length,
      };
    }

    return this.unequal();
  }

  /**
   * Compare Shopify setting fields
   */
  private compareSettings(
    a: any,
    b: any,
    parentPath: string[] | null = null,
    filename: string | null = null,
  ): ComparisonResult | null {
    if (a.id && a.id === b.id) {
      return this.equal();
    }

    // If they are the same type and have the same label, they are equal
    if (a.type && a.type === b.type && a.label && a.label === b.label) {
      return this.equal();
    }

    // The ID and type are different, but the label is the same
    if (a.label && a.label === b.label) {
      return {
        equal: false,
        couldBeEqual: true,
        similarity: 0.5,
      };
    }

    // The type is the same and some of the properties are the same
    if (a.type && a.type === b.type) {
      const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
      const intersection = keys.filter((key: string) => a[key] === b[key]);
      const similarity = intersection.length / keys.length;
      return {
        equal: false,
        couldBeEqual: similarity > 0.25,
        similarity,
      };
    }

    return this.unequal();
  }

  /**
   * Compare two strings.
   */
  compareStrings(
    a: string,
    b: string,
    parentPath: string[] | null = null,
    filename: string | null = null,
  ): ComparisonResult {
    if (a === b) {
      return this.equal();
    }

    // If the strings are similar, they could be equal
    const score = levenshtein(a, b);
    const similarity = 1 - score / Math.max(a.length, b.length);
    if (similarity > 0.5) {
      return {
        equal: false,
        couldBeEqual: true,
        similarity,
      };
    }

    return this.unequal();
  }

  /**
   * Default values for non-equal comparison results.
   */
  private unequal(): ComparisonResult {
    return {
      equal: false,
      couldBeEqual: false,
      similarity: 0,
    };
  }

  /**
   * Default values for equal comparison results.
   */
  private equal(): ComparisonResult {
    return {
      equal: true,
      couldBeEqual: true,
      similarity: 1,
    };
  }

  /**
   * Normalize the comparison result.
   */
  normalizeComparisonResult(
    result: ComparisonResult,
  ): NormalizedComparisonResult {
    if (result.equal) {
      return {
        equal: true,
        couldBeEqual: true,
        similarity: 1,
      };
    }

    return {
      couldBeEqual: false,
      similarity: 0,
      ...result,
    };
  }

  /**
   * Get the possible positions of an object in an array.
   */
  getArrayElementPossiblePositions(
    object: Object,
    source: Array<any>,
    path: Path = [],
    filename: string | null = null,
  ): ArrayElementPosition {
    const comparisonResults: Array<{
      index: number;
      result: NormalizedComparisonResult;
    }> = [];
    for (let i = 0; i < source.length; i++) {
      const sourceObject = source[i];
      comparisonResults.push({
        index: i,
        result: this.normalizeComparisonResult(
          this.compare(object, sourceObject, path, filename),
        ),
      });
    }

    // If there is only one equal result, we can use it
    const foundEquals = comparisonResults.filter(
      (result) => result.result.equal,
    );
    if (foundEquals.length === 1) {
      return foundEquals[0].index;
    }

    // If there's no clear winner, we need to sort the results...
    const sortedResults = comparisonResults
      .filter((result) => result.result.couldBeEqual)
      .sort((a, b) => {
        if (a.result.similarity > b.result.similarity) {
          return -1;
        } else if (a.result.similarity < b.result.similarity) {
          return 1;
        }
        return 0;
      });

    if (sortedResults.length === 0) {
      return null;
    }

    return sortedResults.map((result) => {
      return {
        index: result.index,
        similarity: result.result.similarity,
      };
    });
  }

  /**
   * Do a 3-way comparison of an object in 3 arrays.
   */
  getArrayElementDiff3(
    object: Object,
    sources: ArrayComparisonSource,
    path: Path = [],
    filename: string | null = null,
  ): ArrayElementResult {
    const finalResults: ArrayElementResult = {
      object,
      basePosition: null,
      oursPosition: null,
      theirsPosition: null,
    };
    const sourceNames = ['base', 'ours', 'theirs'] as const;
    sourceNames.forEach((key) => {
      const source = sources[key] || [];
      finalResults[`${key}Position`] = this.getArrayElementPossiblePositions(
        object,
        source,
        path,
        filename,
      );
    });

    return finalResults;
  }
}

export default Comparer;
