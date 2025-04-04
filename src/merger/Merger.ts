import ArrayMerger from './ArrayMerger';

export interface MergerConstructorOptions {
  ours: any;
  theirs: any;
  ancestor: any;
  filename?: string;
  preferred?: PreferredSide;
  /** Whether deletions are allowed in "our" side. */
  deletionsAllowed?: boolean;
}
export type PreferredSide = 'ours' | 'theirs' | null;
export type Path = string[];

const ConflictSeparator = '<<<<<<<<>>>>>>>>' as const;

export interface ConflictNode {
  CONFLICT: typeof ConflictSeparator;
  OURS: any;
  THEIRS: any;
  ANCESTOR: any;
  PATH: string;
}

export class Merger {
  ours: any;
  theirs: any;
  ancestor: any;
  filename?: string | null;
  preferred?: PreferredSide;
  deletionsAllowed: boolean = true;
  _hasConflicts: boolean = false;

  constructor({
    ours,
    theirs,
    ancestor,
    filename,
    preferred,
    deletionsAllowed,
  }: MergerConstructorOptions) {
    this.ours = ours;
    this.theirs = theirs;
    this.ancestor = ancestor;
    this.filename = filename || null;
    this.preferred = preferred || 'theirs';
    this.deletionsAllowed = deletionsAllowed ?? true;
  }

  /**
   * Merge the 3 JSON objects and return the result
   */
  merge(): any {
    const isArray =
      Array.isArray(this.ours) &&
      Array.isArray(this.theirs) &&
      Array.isArray(this.ancestor);
    return isArray
      ? this.mergeArray(this.ancestor, this.ours, this.theirs)
      : this.mergeObject(this.ancestor, this.ours, this.theirs);
  }

  /**
   * The main merge function; we call it with the 3 json objects, and then
   * it recursively calls itself.  It modifies ourNode with the result
   * of the merge.
   *
   * Path is an array of key names indicating where we are in the object
   */
  mergeObject(
    ancestorNode: any,
    ourNode: any,
    theirNode: any,
    path: Path = [],
  ): Object | ConflictNode {
    // Create a set of all the keys present in either our node or their node
    const keys: Record<string, true> = {};
    for (let key in ourNode) {
      keys[key] = true;
    }
    for (let key in theirNode) {
      keys[key] = true;
    }

    for (let key in keys) {
      // Get the values at the current key
      const ancestorValue = ancestorNode?.[key];
      const ancestorValueExists = ancestorNode?.hasOwnProperty(key);
      const ourValue = ourNode?.[key];
      const ourValueExists = ourNode?.hasOwnProperty(key);
      const theirValue = theirNode?.[key];
      const theirValueExists = theirNode?.hasOwnProperty(key);
      const subPath = path.concat(key);

      // If there's no conflict, just take the value
      if (ourValue === theirValue) {
        continue;
      }

      // Handle the case where one side or the other is missing the key
      if (ourValueExists != theirValueExists) {
        if (!ancestorValueExists) {
          // If it's a new value coming from their branch, take theirs
          // Otherwise, keep ours.
          if (theirValueExists) {
            ourNode[key] = theirValue;
          }
        } else {
          // The value was removed on one side but not the other
          // If it was removed on their side, take theirs. Otherwise, keep ours.
          if (!theirValueExists && this.deletionsAllowed) {
            ourNode[key] = theirValue;
          }
        }

        continue;
      }

      // if theirs matches the ancestor, go with ours
      if (JSON.stringify(theirValue) === JSON.stringify(ancestorValue)) {
        // No action needed in this case
        continue;
      }

      if (JSON.stringify(ourValue) === JSON.stringify(ancestorValue)) {
        // We write the value to ourNode since we're going to overwrite
        // our version with the merged version
        ourNode[key] = theirValue;
        continue;
      }

      // Merge arrays
      const ourValueIsArray = Array.isArray(ourValue);
      const theirValueIsArray = Array.isArray(theirValue);
      const ancestorValueIsArray = Array.isArray(ancestorValue);
      if (ourValueIsArray || theirValueIsArray) {
        if (ourValueIsArray != theirValueIsArray) {
          // If they removed the array and we didn't, we remove it too
          if (
            ancestorValueIsArray === ourValueIsArray &&
            this.deletionsAllowed
          ) {
            ourNode[key] = theirValue;
            continue;
          }

          // If we removed the array and they didn't, we remove it too
          if (ancestorValueIsArray === theirValueIsArray) {
            ourNode[key] = ourValue;
            continue;
          }
        } else {
          // Both sides have an array. We need to merge them...
          if (!ancestorValueIsArray) {
            // Use their array if the ancestor didn't have one
            ourNode[key] = theirValue;
            continue;
          }

          ourNode[key] = this.mergeArray(
            ancestorValue,
            ourValue,
            theirValue,
            subPath,
          );
          continue;
        }
      }

      // Recursively merge objects
      if (
        ourValue &&
        theirValue &&
        typeof ourValue === 'object' &&
        typeof theirValue === 'object'
      ) {
        // If both sides have a non-null object value, we recurse
        this.mergeObject(ancestorValue, ourValue, theirValue, subPath);
        continue;
      }

      // If we get here, we have a conflict at this key
      // In this case, we take the value from the preferred branch.
      if (this.preferred === 'ours') {
        continue;
      } else if (this.preferred === 'theirs') {
        ourNode[key] = theirValue;
        continue;
      }

      // No preferred branch was set, so we have to create a conflict.
      ourNode[key] = this.createConflictNode(
        ancestorValue,
        ourValue,
        theirValue,
        subPath,
      );
    }

    return ourNode;
  }

  /**
   * Merge two arrays
   */
  mergeArray(
    ancestorArray: Array<any>,
    ourArray: Array<any>,
    theirArray: Array<any>,
    path: Path = [],
  ): Array<any> | ConflictNode {
    let resultArray = [];

    // If the value is in the ancestor, but not in any of ours/theirs, it is removed.
    let allValues;
    if (this.preferred === 'ours') {
      allValues = [...new Set([...ourArray, ...theirArray])];
    } else {
      allValues = [...new Set([...theirArray, ...ourArray])];
    }

    // Search for objects in the array.
    let hasObject = false;
    for (let i = 0; i < allValues.length; i++) {
      const value = allValues[i];
      if (typeof value === 'object') {
        hasObject = true;
        break;
      }
    }

    // If there are objects, we need to do a more complex merge.
    if (hasObject) {
      const arrayMerger = new ArrayMerger({
        base: ancestorArray,
        ours: ourArray,
        theirs: theirArray,
        preferred: this.preferred,
        filename: this.filename,
        deletionsAllowed: this.deletionsAllowed,
        path,
      });

      try {
        return arrayMerger.merge();
      } catch (e) {
        return this.createConflictNode(
          ancestorArray,
          ourArray,
          theirArray,
          path,
        );
      }
    }

    // Merge the 3 arrays.
    for (let i = 0; i < allValues.length; i++) {
      const value = allValues[i];
      const valueInAncestor = ancestorArray.includes(value);
      const valueInOurs = ourArray.includes(value);
      const valueInTheirs = theirArray.includes(value);

      // If the value is in all 3 arrays, add it to the result.
      if (valueInOurs === valueInTheirs) {
        resultArray.push(value);
        continue;
      }

      // If the value is in the ancestor, but not in ours or theirs, it is removed.
      if (valueInAncestor) {
        continue;
      }

      // At this point, we know the value is not in the ancestor.
      // So these are new values.
      resultArray.push(value);
    }

    // Shopify checks.
    const currentKey = path[path.length - 1];

    // Make sure we don't keep missing sections.
    if (currentKey === 'order') {
      const parent = this.getParentElementForPath(this.ours, path);
      if (
        parent &&
        typeof parent === 'object' &&
        parent.hasOwnProperty('sections')
      ) {
        const sections = parent.sections;
        for (let i = 0; i < resultArray.length; i++) {
          const sectionId = resultArray[i];

          // If the block doesn't exist, remove it from the array.
          if (!sections.hasOwnProperty(sectionId)) {
            resultArray.splice(i, 1);
          }
        }
      }
    }

    // Make sure we don't keep missing blocks.
    if (currentKey === 'block_order') {
      const parent = this.getParentElementForPath(this.ours, path);
      if (
        parent &&
        typeof parent === 'object' &&
        parent.hasOwnProperty('blocks')
      ) {
        const blocks = parent.blocks;
        for (let i = 0; i < resultArray.length; i++) {
          const blockId = resultArray[i];

          // If the block doesn't exist, remove it from the array.
          if (!blocks.hasOwnProperty(blockId)) {
            resultArray.splice(i, 1);
          }
        }
      }
    }

    return resultArray;
  }

  /**
   * Generate a node to indicate a conflict
   * We include `<<<<<<<<>>>>>>>>` so that developers used to searching for <<<<
   * to find conflicts can maintain their current habits
   */
  createConflictNode(
    ancestorValue: any,
    ourValue: any,
    theirValue: any,
    path: Path,
  ): ConflictNode {
    this._hasConflicts = true;
    return {
      CONFLICT: ConflictSeparator,
      OURS: ourValue != null ? ourValue : null,
      THEIRS: theirValue != null ? theirValue : null,
      ANCESTOR: ancestorValue != null ? ancestorValue : null,
      PATH: path.join('.'),
    };
  }

  /**
   * Get the element at a path
   */
  getElementForPath(obj: Object, path: Path): any {
    let current: any = obj;
    for (let i = 0; i < path.length; i++) {
      current = current[path[i]] as any;
    }
    return current;
  }

  /**
   * Get the parent element at a path
   */
  getParentElementForPath(obj: Object, path: Path): any {
    const parentPath = path.slice(0, path.length - 1);
    return this.getElementForPath(obj, parentPath);
  }

  hasConflicts(): boolean {
    return this._hasConflicts;
  }
}

export default Merger;
