import Comparer, { ArrayElementPosition, ArrayElementResult } from './Comparer';

export interface ArrayMergerOptions {
  base: any[];
  ours: any[];
  theirs: any[];
  preferred?: string | null;
  filename?: string | null;
  path?: string[];
}

export interface ArrayMergerVariant {
  seemsValid: boolean;
  positions: Array<{
    object: any;
    basePosition: number | null;
    oursPosition: number | null;
    theirsPosition: number | null;
  }>;
  similarityScore: number;
}

export interface UnionArrayElementResult extends ArrayElementResult {
  unionIndex: number;
}

const sourceNames = ['base', 'ours', 'theirs'] as const;
export type SourceType = 'base' | 'ours' | 'theirs';

export class ArrayMerger {
  ours: any[];
  theirs: any[];
  base: any[];
  union: any[];
  preferred: string | null;
  filename: string | null;
  path: string[] | null;
  variants: ArrayMergerVariant[] | null = null;
  objectPossiblePositions: UnionArrayElementResult[] | null = null;

  constructor({
    base,
    ours,
    theirs,
    preferred,
    filename,
    path,
  }: ArrayMergerOptions) {
    this.base = base;
    this.ours = ours;
    this.theirs = theirs;
    this.preferred = preferred || 'theirs';
    this.filename = filename || null;
    this.path = path || [];
    this.union = this.getUnion();
  }

  private getUnion(): any[] {
    let union: any[];
    if (this.preferred === 'ours') {
      union = [...new Set([...this.ours, ...this.theirs])];
    } else {
      union = [...new Set([...this.theirs, ...this.ours])];
    }
    return union;
  }

  getObjectPositions(): UnionArrayElementResult[] {
    if (this.objectPossiblePositions) {
      return this.objectPossiblePositions;
    }
    const comparer = new Comparer();
    const objectPositions: UnionArrayElementResult[] = [];
    this.union.forEach((object, index) => {
      const result = comparer.getArrayElementDiff3(object, {
        base: this.base,
        theirs: this.theirs,
        ours: this.ours,
      });
      objectPositions.push({
        unionIndex: index,
        ...result,
      });
    });

    this.objectPossiblePositions = objectPositions;
    return objectPositions;
  }

  private getPositionsAsArray(
    position: ArrayElementPosition,
    type: SourceType,
    currentVariants: ArrayMergerVariant[],
  ): Array<number | { index: number; similarity: number } | null> {
    if (position === null) {
      return [null];
    }

    let positions: Array<{ index: number; similarity: number } | null>;
    if (Array.isArray(position)) {
      positions = position;
    } else {
      positions = [{ index: position, similarity: 1 }];
    }

    positions = positions.filter((position) => {
      return !currentVariants.find((variant) => {
        return variant.positions.find((variantPosition) => {
          if (position === null) {
            return false;
          }

          switch (type) {
            case 'base':
              return position.index === variantPosition.basePosition;
            case 'ours':
              return position.index === variantPosition.oursPosition;
            case 'theirs':
              return position.index === variantPosition.theirsPosition;
          }
        });
      });
    });

    if (positions.length === 0) {
      return [null];
    }

    return positions;
  }

  private getPositionIndex(
    position: number | { index: number; similarity: number } | null,
  ): number | null {
    return typeof position === 'object' && position != null
      ? position.index
      : position;
  }

  private getPositionScore(
    position: number | { index: number; similarity: number } | null,
  ): number | null {
    return typeof position === 'object' && position != null
      ? position.similarity
      : position !== null
      ? 1
      : null;
  }

  private getNextVariants(
    currentVariants: ArrayMergerVariant[],
    unionIndex: number,
  ): ArrayMergerVariant[] {
    if (unionIndex === this.union.length) {
      return currentVariants;
    }

    const objectPositions = this.getObjectPositions();
    const object = this.union[unionIndex];
    const objectPosition = objectPositions.find(
      (objectPosition) => objectPosition.unionIndex === unionIndex,
    );
    if (!objectPosition) {
      return currentVariants;
    }

    // Create new variants for each possible position of the current object.
    const newVariants: ArrayMergerVariant[] = [];
    const { basePosition, oursPosition, theirsPosition } = objectPosition;
    const basePositions = this.getPositionsAsArray(
      basePosition,
      'base',
      currentVariants,
    );
    const oursPositions = this.getPositionsAsArray(
      oursPosition,
      'ours',
      currentVariants,
    );
    const theirsPositions = this.getPositionsAsArray(
      theirsPosition,
      'theirs',
      currentVariants,
    );
    console.log({ object, basePositions, oursPositions, theirsPositions });

    basePositions.forEach((basePosition) => {
      oursPositions.forEach((oursPosition) => {
        theirsPositions.forEach((theirsPosition) => {
          const basePositionIndex = this.getPositionIndex(basePosition);
          const oursPositionIndex = this.getPositionIndex(oursPosition);
          const theirsPositionIndex = this.getPositionIndex(theirsPosition);
          const basePositionScore = this.getPositionScore(basePosition);
          const oursPositionScore = this.getPositionScore(oursPosition);
          const theirsPositionScore = this.getPositionScore(theirsPosition);
          let similarityScore =
            (basePositionScore || 0) +
            (oursPositionScore || 0) +
            (theirsPositionScore || 0);

          // If the object is in the same position in base and ours or base and theirs,
          // it is more likely to be valid.
          if (basePosition != null) {
            if (
              basePositionIndex === oursPositionIndex ||
              basePositionIndex === theirsPositionIndex
            ) {
              similarityScore *= 1.5;
            }
          }

          const variant = {
            seemsValid: true,
            positions: [
              {
                object,
                unionPosition: unionIndex,
                basePosition: basePositionIndex,
                oursPosition: oursPositionIndex,
                theirsPosition: theirsPositionIndex,
              },
            ],
            similarityScore: similarityScore,
          };
          newVariants.push(variant);
        });
      });
    });

    // If there are no variants yet, go to the next object.
    if (currentVariants.length === 0) {
      return this.getNextVariants(newVariants, unionIndex + 1);
    }

    // Append new variants to the current variants.
    const nextVariants: ArrayMergerVariant[] = [];
    currentVariants.forEach((currentVariant) => {
      newVariants.forEach((newVariant) => {
        const variant = {
          seemsValid: currentVariant.seemsValid && newVariant.seemsValid,
          positions: [...currentVariant.positions, ...newVariant.positions],
          similarityScore:
            currentVariant.similarityScore + newVariant.similarityScore,
        };
        nextVariants.push(variant);
      });
    });

    // Go to the next object.
    return this.getNextVariants(nextVariants, unionIndex + 1);
  }

  getVariants(): ArrayMergerVariant[] {
    if (this.variants) {
      return this.variants;
    }

    this.variants = this.getNextVariants([], 0);
    return this.variants;
  }

  generateFromVariant(variant: ArrayMergerVariant): any[] {
    const positions = variant.positions;
    const result: any[] = [];
    positions.forEach((position) => {
      // Deleted object.
      if (
        position.basePosition !== null &&
        (position.oursPosition === null || position.theirsPosition === null)
      ) {
        return;
      }

      // Added object.
      if (
        position.basePosition === null &&
        (position.oursPosition !== null || position.theirsPosition !== null)
      ) {
        const ourObject = position.oursPosition
          ? this.ours[position.oursPosition]
          : null;
        const theirObject = position.theirsPosition
          ? this.theirs[position.theirsPosition]
          : null;
        result.push(this.getMergedObject(theirObject, ourObject));
        return;
      }

      // Modified object.
      let object;
      if (position.theirsPosition !== null && position.oursPosition !== null) {
        object = this.getMergedObject(
          this.theirs[position.theirsPosition],
          this.ours[position.oursPosition],
        );
      } else {
        object = position.object;
      }
      result.push(object);
    });

    return result;
  }

  getMergedObject(theirs: any, ours: any): any {
    const oursIsObject = typeof ours === 'object' || ours == null;
    const theirsIsObject = typeof theirs === 'object' || theirs == null;

    // If one of the objects is not an object, return the other one.
    if ((!oursIsObject && !theirsIsObject) || oursIsObject != theirsIsObject) {
      return this.preferred === 'ours' ? ours : theirs;
    }

    theirs = theirs || {};
    ours = ours || {};

    // If both objects are objects, merge them.
    if (this.preferred === 'ours') {
      return {
        ...theirs,
        ...ours,
      };
    } else {
      return {
        ...ours,
        ...theirs,
      };
    }
  }

  merge(): any[] {
    const variants = this.getVariants()
      .sort((a, b) => {
        return b.similarityScore - a.similarityScore;
      })
      .map((variant) => {
        return {
          ...variant,
          positions: variant.positions.filter((position) => {
            return (
              position.oursPosition !== null || position.theirsPosition !== null
            );
          }),
        };
      });

    const bestVariant = variants[0];
    if (!bestVariant) {
      throw new Error('No valid variant found.');
    }

    console.log(variants.length);
    console.log(JSON.stringify(bestVariant, null, 2));

    const result = this.generateFromVariant(bestVariant);
    return result;
  }
}

export default ArrayMerger;
