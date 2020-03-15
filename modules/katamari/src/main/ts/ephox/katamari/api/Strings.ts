import * as StrAppend from '../str/StrAppend';
import * as Arr from './Arr';

const checkRange = (str: string, substr: string, start: number): boolean =>
  substr === '' || str.length >= substr.length && str.substr(start, start + substr.length) === substr;

/** Given a string and object, perform template-replacements on the string, as specified by the object.
 * Any template fields of the form ${name} are replaced by the string or number specified as obj["name"]
 * Based on Douglas Crockford's 'supplant' method for template-replace of strings. Uses different template format.
 */
export const supplant = function (str: string, obj: {[key: string]: string | number}) {
  const isStringOrNumber = function (a) {
    const t = typeof a;
    return t === 'string' || t === 'number';
  };

  return str.replace(/\$\{([^{}]*)\}/g,
    function (fullMatch: string, key: string) {
      const value = obj[key];
      return isStringOrNumber(value) ? value.toString() : fullMatch;
    }
  );
};

export const removeLeading = function (str: string, prefix: string) {
  return startsWith(str, prefix) ? StrAppend.removeFromStart(str, prefix.length) : str;
};

export const removeTrailing = function (str: string, suffix: string) {
  return endsWith(str, suffix) ? StrAppend.removeFromEnd(str, suffix.length) : str;
};

export const ensureLeading = function (str: string, prefix: string) {
  return startsWith(str, prefix) ? str : StrAppend.addToStart(str, prefix);
};

export const ensureTrailing = function (str: string, suffix: string) {
  return endsWith(str, suffix) ? str : StrAppend.addToEnd(str, suffix);
};

export const contains = function (str: string, substr: string) {
  return str.indexOf(substr) !== -1;
};

export const containsAll = (str: string, substrs: string[]): boolean => {
  return Arr.forall(substrs, (substr) => contains(str, substr));
};

export const capitalize = function (str: string) {
  return str === '' ? '' : str.charAt(0).toUpperCase() + str.substring(1);
};

/** Does 'str' start with 'prefix'?
 *  Note: all strings start with the empty string.
 *        More formally, for all strings x, startsWith(x, "").
 *        This is so that for all strings x and y, startsWith(y + x, y)
 */
export const startsWith = function (str: string, prefix: string) {
  return checkRange(str, prefix, 0);
};

/** Does 'str' end with 'suffix'?
 *  Note: all strings end with the empty string.
 *        More formally, for all strings x, endsWith(x, "").
 *        This is so that for all strings x and y, endsWith(x + y, y)
 */
export const endsWith = function (str: string, suffix: string) {
  return checkRange(str, suffix, str.length - suffix.length);
};

const blank = (r: RegExp) => (s: string): string =>
  s.replace(r, '');

/** removes all leading and trailing spaces */
export const trim: (s: string) => string =
  blank(/^\s+|\s+$/g);

export const lTrim: (s: string) => string =
  blank(/^\s+/g);

export const rTrim: (s: string) => string =
  blank(/\s+$/g);
