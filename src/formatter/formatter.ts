export interface FormatterOptions {
  doubleEscape?: boolean;
  fixEmptyObjects?: boolean;
  fixEmptyArrays?: boolean;
  addNewLineAtEndOfFile?: boolean;
  tabSize?: number;
}

/**
 * Format JSONs similarly to how Shopify does it.
 */
export const formatJson = (source: string, options: FormatterOptions = {}): string => {
  const defaultOptions: FormatterOptions = {
    doubleEscape: true,
    fixEmptyObjects: true,
    fixEmptyArrays: true,
    addNewLineAtEndOfFile: true,
    tabSize: 2,
  };

  options = {
    ...defaultOptions,
    ...options,
  };

  let formatted;

  // Double escape forward slashes
  if (options.doubleEscape) {
    const replacer = (key: any, value: any) => {
      if (typeof value === 'string') {
        return value.replace(/\//g, '\\=-=-=\\/');
      }
      return value;
    };
    formatted = JSON.stringify(source, replacer, options.tabSize).replaceAll(`\\\\=-=-=\\\\`, '\\');
  } else {
    formatted = JSON.stringify(source, null, options.tabSize);
  }

  // Fix empty objects - {} becomes {\n}
  if (options.fixEmptyObjects) {
    formatted = formatted.replace(/\n(\s+)([^{\n]+)\{\}/g, '\n$1$2{\n$1}');
  }

  // Fix empty arrays - {} becomes [\n\n]
  if (options.fixEmptyArrays) {
    formatted = formatted.replace(/\n(\s+)([^{\n]+)\[\]/g, '\n$1$2[\n\n$1]');
  }

  // Add new line at the end of the file
  if (options.addNewLineAtEndOfFile) {
    formatted += '\n';
  }

  return formatted;
};

export default formatJson;
