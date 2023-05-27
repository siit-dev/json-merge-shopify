export interface ComparisonResult {
  equal: boolean;
  couldBeEqual?: boolean;
  similarity?: number;
}

export class Comparer {
  public compareObjects(
    a: any,
    b: any,
    parentPath: string[] | null = null,
    filename: string | null = null,
  ): ComparisonResult {
    // If they are equal, return that they are equal :)
    if (JSON.stringify(a) === JSON.stringify(b)) {
      return this.equal();
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
    } else if (parentPathString.match(/\d+/) && a.name && b.name) {
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
          similarity: intersection.length / union.length,
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
    if (!!a.settings != !!b.settings) {
      return {
        equal: false,
        couldBeEqual: true,
        similarity: 0.5,
      };
    }

    // If both have settings, compare the setting IDs
    const aSettingIds = a.settings.map((setting: any) => setting.id);
    const bSettingIds = b.settings.map((setting: any) => setting.id);
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

  private unequal(): ComparisonResult {
    return {
      equal: false,
      couldBeEqual: false,
      similarity: 0,
    };
  }

  private equal(): ComparisonResult {
    return {
      equal: true,
      couldBeEqual: true,
      similarity: 1,
    };
  }
}

export default Comparer;
