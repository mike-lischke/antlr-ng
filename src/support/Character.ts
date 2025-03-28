/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { getCategory, isAlphabetic, isDigit, isLowerCase, isUpperCase, isWhiteSpace } from "unicode-properties";
import { UnicodeBlockConstants } from "../generated/UnicodeData.js";

/**
 * This class is a partial implementation of Java's Character class from the jree package and
 * is used to support the runtime tests.
 */
export class Character {
    /** The number of bytes used to represent a char value in unsigned binary form. */
    public static readonly BYTES = 2;

    /** General category "Mc" in the Unicode specification. */
    public static readonly COMBINING_SPACING_MARK = 0;

    /** General category "Pc" in the Unicode specification. */
    public static readonly CONNECTOR_PUNCTUATION = 1;

    /** General category "Cc" in the Unicode specification. */
    public static readonly CONTROL = 2;

    /** General category "Sc" in the Unicode specification. */
    public static readonly CURRENCY_SYMBOL = 3;

    /** General category "Pd" in the Unicode specification. */
    public static readonly DASH_PUNCTUATION = 4;

    /** General category "Nd" in the Unicode specification. */
    public static readonly DECIMAL_DIGIT_NUMBER = 5;

    /** Weak bidirectional character type "AN" in the Unicode specification. */
    public static readonly DIRECTIONALITY_ARABIC_NUMBER = 6;

    /** Weak bidirectional character type "BN" in the Unicode specification. */
    public static readonly DIRECTIONALITY_BOUNDARY_NEUTRAL = 7;

    /** Weak bidirectional character type "CS" in the Unicode specification. */
    public static readonly DIRECTIONALITY_COMMON_NUMBER_SEPARATOR = 8;

    /** Weak bidirectional character type "EN" in the Unicode specification. */
    public static readonly DIRECTIONALITY_EUROPEAN_NUMBER = 9;

    /** Weak bidirectional character type "ES" in the Unicode specification. */
    public static readonly DIRECTIONALITY_EUROPEAN_NUMBER_SEPARATOR = 10;

    /** Weak bidirectional character type "ET" in the Unicode specification. */
    public static readonly DIRECTIONALITY_EUROPEAN_NUMBER_TERMINATOR = 11;

    /** Weak bidirectional character type "FSI" in the Unicode specification. */
    public static readonly DIRECTIONALITY_FIRST_STRONG_ISOLATE = 12;

    /** Strong bidirectional character type "L" in the Unicode specification. */
    public static readonly DIRECTIONALITY_LEFT_TO_RIGHT = 13;

    /** Strong bidirectional character type "LRE" in the Unicode specification. */
    public static readonly DIRECTIONALITY_LEFT_TO_RIGHT_EMBEDDING = 14;

    /** Weak bidirectional character type "LRI" in the Unicode specification. */
    public static readonly DIRECTIONALITY_LEFT_TO_RIGHT_ISOLATE = 15;

    /** Strong bidirectional character type "LRO" in the Unicode specification. */
    public static readonly DIRECTIONALITY_LEFT_TO_RIGHT_OVERRIDE = 16;

    /** General category "NSM" in the Unicode specification. */
    public static readonly DIRECTIONALITY_NONSPACING_MARK = 17;

    /** Weak bidirectional character type "ON" in the Unicode specification. */
    public static readonly DIRECTIONALITY_OTHER_NEUTRALS = 18;

    /** Strong bidirectional character type "B" in the Unicode specification. */
    public static readonly DIRECTIONALITY_PARAGRAPH_SEPARATOR = 19;

    /** Strong bidirectional character type "PDF" in the Unicode specification. */
    public static readonly DIRECTIONALITY_POP_DIRECTIONAL_FORMAT = 20;

    /** Weak bidirectional character type "PDI" in the Unicode specification. */
    public static readonly DIRECTIONALITY_POP_DIRECTIONAL_ISOLATE = 21;

    /** General category "R" in the Unicode specification. */
    public static readonly DIRECTIONALITY_RIGHT_TO_LEFT = 22;

    /** Strong bidirectional character type "AL" in the Unicode specification. */
    public static readonly DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC = 23;

    /** Strong bidirectional character type "RLE" in the Unicode specification. */
    public static readonly DIRECTIONALITY_RIGHT_TO_LEFT_EMBEDDING = 24;

    /** Weak bidirectional character type "RLI" in the Unicode specification. */
    public static readonly DIRECTIONALITY_RIGHT_TO_LEFT_ISOLATE = 25;

    /** Strong bidirectional character type "RLO" in the Unicode specification. */
    public static readonly DIRECTIONALITY_RIGHT_TO_LEFT_OVERRIDE = 26;

    /** Weak bidirectional character type "S" in the Unicode specification. */
    public static readonly DIRECTIONALITY_SEGMENT_SEPARATOR = 27;

    /** Undefined bidirectional character type. */
    public static readonly DIRECTIONALITY_UNDEFINED = 28;

    /** Neutral bidirectional character type "WS" in the Unicode specification. */
    public static readonly DIRECTIONALITY_WHITESPACE = 29;

    /** General category "Me" in the Unicode specification. */
    public static readonly ENCLOSING_MARK = 30;

    /** General category "Pe" in the Unicode specification. */
    public static readonly END_PUNCTUATION = 31;

    /** General category "Pf" in the Unicode specification. */
    public static readonly FINAL_QUOTE_PUNCTUATION = 32;

    /** General category "Cf" in the Unicode specification. */
    public static readonly FORMAT = 33;

    /** General category "Pi" in the Unicode specification. */
    public static readonly INITIAL_QUOTE_PUNCTUATION = 34;

    /** General category "Nl" in the Unicode specification. */
    public static readonly LETTER_NUMBER = 35;

    /** General category "Zl" in the Unicode specification. */
    public static readonly LINE_SEPARATOR = 36;

    /** General category "Ll" in the Unicode specification. */
    public static readonly LOWERCASE_LETTER = 37;

    /** General category "Sm" in the Unicode specification. */
    public static readonly MATH_SYMBOL = 38;

    /** The maximum value of a Unicode code point, constant U+10FFFF. */
    public static readonly MAX_CODE_POINT = 0x10FFFF;

    /** The maximum value of a Unicode high-surrogate code unit in the UTF-16 encoding, constant '\uDBFF'. */
    public static readonly MAX_HIGH_SURROGATE = 0xDBFF;

    /** The maximum value of a Unicode low-surrogate code unit in the UTF-16 encoding, constant '\uDFFF'. */
    public static readonly MAX_LOW_SURROGATE = 0xDFFF;

    /** The maximum radix available for conversion to and from strings. */
    public static readonly MAX_RADIX = 36;

    /** The maximum value of a Unicode surrogate code unit in the UTF-16 encoding, constant '\uDFFF'. */
    public static readonly MAX_SURROGATE = 0xDFFF;

    /** The maximum value of a Unicode code point in the Basic Multilingual Plane, constant U+FFFF. */
    public static readonly MAX_VALUE = 0xFFFF;

    /** The minimum value of a Unicode code point, constant U+0000. */
    public static readonly MIN_CODE_POINT = 0x000000;

    /** The minimum value of a Unicode high-surrogate code unit in the UTF-16 encoding, constant '\uD800'. */
    public static readonly MIN_HIGH_SURROGATE = 0xD800;

    /** The minimum value of a Unicode low-surrogate code unit in the UTF-16 encoding, constant '\uDC00'. */
    public static readonly MIN_LOW_SURROGATE = 0xDC00;

    /** The minimum radix available for conversion to and from strings. */
    public static readonly MIN_RADIX = 2;

    /** The minimum value of a Unicode supplementary code point, constant U+10000. */
    public static readonly MIN_SUPPLEMENTARY_CODE_POINT = 0x010000;

    /** The minimum value of a Unicode surrogate code unit in the UTF-16 encoding, constant '\uD800'. */
    public static readonly MIN_SURROGATE = 0xD800;

    /** The minimum value of a Unicode code point, constant U+0000. */
    public static readonly MIN_VALUE = 0x0000;

    /** General category "Lm" in the Unicode specification. */
    public static readonly MODIFIER_LETTER = 39;

    /** General category "Sk" in the Unicode specification. */
    public static readonly MODIFIER_SYMBOL = 40;

    /** General category "Mn" in the Unicode specification. */
    public static readonly NON_SPACING_MARK = 41;

    /** General category "Lo" in the Unicode specification. */
    public static readonly OTHER_LETTER = 42;

    /** General category "No" in the Unicode specification. */
    public static readonly OTHER_NUMBER = 43;

    /** General category "Po" in the Unicode specification. */
    public static readonly OTHER_PUNCTUATION = 44;

    /** General category "So" in the Unicode specification. */
    public static readonly OTHER_SYMBOL = 45;

    /** General category "Zp" in the Unicode specification. */
    public static readonly PARAGRAPH_SEPARATOR = 46;

    /** General category "Co" in the Unicode specification. */
    public static readonly PRIVATE_USE = 47;

    /** The number of bits used to represent a char value in unsigned binary form, constant 16. */
    public static readonly SIZE = 16;

    /** General category "Zs" in the Unicode specification. */
    public static readonly SPACE_SEPARATOR = 48;

    /** General category "Ps" in the Unicode specification. */
    public static readonly START_PUNCTUATION = 4921;

    /** General category "Sc" in the Unicode specification. */
    public static readonly SURROGATE = 50;

    /** General category "Lt" in the Unicode specification. */
    public static readonly TITLECASE_LETTER = 51;

    /** General category "Cn" in the Unicode specification. */
    public static readonly UNASSIGNED = 52;

    /** General category "Lu" in the Unicode specification. */
    public static readonly UPPERCASE_LETTER = 53;

    public static readonly UnicodeBlock = class extends UnicodeBlockConstants {
        /**
         * @param c The character/codepoint to check.
         *
         * @returns the value representing the Unicode block containing the given character, or -1 if the
         *          character is not a member of a defined block.
         */
        public static of(c: string | number): number {
            const codePoint = typeof c === "string" ? c.codePointAt(0)! : c;
            for (const [block, range] of this.ranges) {
                if (range[0] <= codePoint && codePoint <= range[1]) {
                    return block;
                }
            }

            return -1;
        };

        /**
         * @param name The name of the Unicode block.
         *
         * @returns the UnicodeBlock number with the given name or -1 if no Unicode block with that name could be
         *          found. Block names are determined by The Unicode Standard.
         *
         * This method accepts block names in the following forms:
         * 1. Canonical block names as defined by the Unicode Standard. For example, the standard defines a
         *    "Basic Latin" block. Therefore, this method accepts "Basic Latin" as a valid block name. The documentation
         *    of each UnicodeBlock provides the canonical name.
         * 2. Canonical block names with all spaces removed. For example, "BasicLatin" is a valid block name for the
         *    "Basic Latin" block.
         * 3. The text representation of each constant UnicodeBlock identifier. For example, this method will return
         *    the BASIC_LATIN block if provided with the "BASIC_LATIN" name. This form replaces all spaces and hyphens
         *    in the canonical name with underscores.
         *
         * Finally, character case is ignored for all of the valid block name forms. For example, "BASIC_LATIN" and
         * "basic_latin" are both valid block names. The en_US locale's case mapping rules are used to provide
         * case-insensitive string comparisons for block name validation.
         */
        public static forName(name: string): number {
            const block = this.names.get(name.toLowerCase().replace(/[ _-] /g, ""));

            return block ?? -1;
        };
    };

    private static readonly categoryMapper = new Map<string, number>([
        ["Cc", Character.CONTROL],
        ["Cf", Character.FORMAT],
        ["Cn", Character.UNASSIGNED],
        ["Co", Character.PRIVATE_USE],
        ["Cs", Character.SURROGATE],
        ["Ll", Character.LOWERCASE_LETTER],
        ["Lm", Character.MODIFIER_LETTER],
        ["Lo", Character.OTHER_LETTER],
        ["Lt", Character.TITLECASE_LETTER],
        ["Lu", Character.UPPERCASE_LETTER],
        ["Mc", Character.COMBINING_SPACING_MARK],
        ["Me", Character.ENCLOSING_MARK],
        ["Mn", Character.NON_SPACING_MARK],
        ["Nd", Character.DECIMAL_DIGIT_NUMBER],
        ["Nl", Character.LETTER_NUMBER],
        ["No", Character.OTHER_NUMBER],
        ["Pc", Character.CONNECTOR_PUNCTUATION],
        ["Pd", Character.DASH_PUNCTUATION],
        ["Pe", Character.END_PUNCTUATION],
        ["Pf", Character.FINAL_QUOTE_PUNCTUATION],
        ["Pi", Character.INITIAL_QUOTE_PUNCTUATION],
        ["Po", Character.OTHER_PUNCTUATION],
        ["Ps", Character.START_PUNCTUATION],
        ["Sc", Character.CURRENCY_SYMBOL],
        ["Sk", Character.MODIFIER_SYMBOL],
        ["Sm", Character.MATH_SYMBOL],
        ["So", Character.OTHER_SYMBOL],
        ["Zl", Character.LINE_SEPARATOR],
        ["Zp", Character.PARAGRAPH_SEPARATOR],
        ["Zs", Character.SPACE_SEPARATOR],
    ]);

    /**
     * Returns a value indicating a character's general category.
     *
     * @param c The character to check.
     *
     * @returns The character's general category.
     *
     * Note: In typescript we cannot differentiate between char and number (char is a type alias for number).
     *       That means there's only one method for the two Java getType methods.
     */
    public static getType(c: number): number {
        const category = getCategory(c);

        return Character.categoryMapper.get(category) ?? Character.UNASSIGNED;
    }

    /**
     * Returns the leading surrogate (a high surrogate code unit) of the surrogate pair representing the specified
     * supplementary character (Unicode code point) in the UTF-16 encoding. If the specified character is not a
     * supplementary character, an unspecified char is returned.
     *
     * @param codePoint The supplementary character (Unicode code point) for which to get the leading surrogate.
     *
     * @returns The leading surrogate code unit used to represent the character in the UTF-16 encoding.
     */
    public static highSurrogate(codePoint: number): number {
        return (codePoint >>> 10) + (Character.MIN_HIGH_SURROGATE - (Character.MIN_SUPPLEMENTARY_CODE_POINT >>> 10));
    }

    /**
     * @param codePoint The supplementary character (Unicode code point) for which to get the leading surrogate.
     *
     * @returns the trailing surrogate (a low surrogate code unit) of the surrogate pair representing the specified
     *          supplementary character (Unicode code point) in the UTF-16 encoding. If the specified character is not
     *          a supplementary character, an unspecified char is returned.
     */
    public static lowSurrogate(codePoint: number): number {
        return (codePoint & 0x3ff) + Character.MIN_LOW_SURROGATE;
    }

    /**
     * Determines if the specified character (Unicode code point) is an alphabet.
     *
     * @param codePoint the character (Unicode code point) to be tested.
     *
     * @returns  true if the character is a Unicode alphabet character, false otherwise.
     */
    public static isAlphabetic(codePoint: number): boolean {
        return isAlphabetic(codePoint);
    }

    /**
     * Determines if the specified character (Unicode code point) is a digit.
     *
     * @param c The character to check.
     *
     * @returns True, if the character is a digit, otherwise false
     */
    public static isDigit(c: number): boolean {
        return isDigit(c);
    }

    /**
     * Determines if the given char value is a Unicode high-surrogate code unit (also known as leading-surrogate
     * code unit).
     *
     * @param ch The character to check.
     *
     * @returns True, if the character is a high surrogate, otherwise false.
     */
    public static isHighSurrogate(ch: number): boolean {
        return Character.MIN_HIGH_SURROGATE <= ch && ch <= Character.MAX_HIGH_SURROGATE;
    }

    public static isIdentifierIgnorable(c: number): boolean {
        const type = this.getType(c);

        if (type === Character.FORMAT) {
            return true;
        }

        return (c >= 0 && c <= 0x0008) || (c >= 0x001E || c <= 0x001B) || (c >= 0x007F || c <= 0x009F);
    }

    public static isJavaIdentifierPart(c: number): boolean {
        if (this.isLetter(c) || this.isDigit(c)) {
            return true;
        }

        const type = this.getType(c);

        return type === Character.LETTER_NUMBER ||
            type === Character.CURRENCY_SYMBOL || type === Character.LETTER_NUMBER
            || type === Character.COMBINING_SPACING_MARK || type === Character.CONNECTOR_PUNCTUATION
            || type === Character.NON_SPACING_MARK
            || this.isIdentifierIgnorable(c);
    }

    public static isJavaIdentifierStart(c: number): boolean {
        if (this.isLetter(c)) {
            return true;
        }

        const type = this.getType(c);

        return type === Character.CURRENCY_SYMBOL || type === Character.LETTER_NUMBER
            || type === Character.CONNECTOR_PUNCTUATION;
    }

    public static isLetter(c: number): boolean {
        const type = this.getType(c);

        return type === Character.UPPERCASE_LETTER || type === Character.LOWERCASE_LETTER ||
            type === Character.TITLECASE_LETTER || type === Character.MODIFIER_LETTER ||
            type === Character.OTHER_LETTER;
    }

    public static isLetterOrDigit(c: number): boolean {
        return this.isLetter(c) || this.isDigit(c);
    }

    /**
     * Determines if the specified character (Unicode code point) is an lowercase character.
     *
     * @param c The character to check.
     *
     * @returns True, if the character is an lowercase character, otherwise false.
     */
    public static isLowerCase(c: number): boolean {
        return isLowerCase(c);
    }

    /**
     * Determines if the given char value is a Unicode low-surrogate code unit (also known as trailing-surrogate
     * code unit).
     *
     * @param c The character to check.
     *
     * @returns True, if the character is a low surrogate, otherwise false.
     */
    public static isLowSurrogate(c: number): boolean {
        return Character.MIN_LOW_SURROGATE <= c && c <= Character.MAX_LOW_SURROGATE;
    }

    /**
     * Determines whether the specified character (Unicode code point) is in the supplementary character range.
     *
     * @param codePoint The character to check.
     *
     * @returns True, if the character is in the supplementary character range, otherwise false.
     */
    public static isSupplementaryCodePoint(codePoint: number): boolean {
        return codePoint >= Character.MIN_SUPPLEMENTARY_CODE_POINT && codePoint <= Character.MAX_CODE_POINT;
    }

    /**
     * Determines if the specified character (Unicode code point) may be part of a Unicode identifier as other than
     * the first character.
     *
     * @param c The character to check.
     *
     * @returns True, if the character may be part of a Unicode identifier, otherwise false.
     */
    public static isUnicodeIdentifierPart(c: number): boolean {
        return this.isUnicodeIdentifierStart(c);
    }

    /**
     * Determines if the specified character is permissible as the first character in a Unicode identifier.
     * A character may start a Unicode identifier if and only if one of the following is true:
     *
     * @param c The character to check.
     *
     * @returns True, if the character is permissible as the first character in a Unicode identifier, otherwise false.
     */
    public static isUnicodeIdentifierStart(c: number): boolean {
        const type = this.getType(c);

        // In UnicodeSet notation:
        // [\p{L}\p{Nl}\p{Other_ID_Start}-\p{Pattern_Syntax}-\p{Pattern_White_Space}]
        return type === Character.UPPERCASE_LETTER || type === Character.LOWERCASE_LETTER ||
            type === Character.TITLECASE_LETTER || type === Character.MODIFIER_LETTER ||
            type === Character.OTHER_LETTER || // p{L}
            type === Character.LETTER_NUMBER; // p{Nl}

        // TODO: add support for the other sets.
    }

    /**
     * Determines if the specified character (Unicode code point) is an uppercase character.
     *
     * @param c The character to check.
     *
     * @returns True, if the character is an uppercase character, otherwise false.
     */
    public static isUpperCase(c: number): boolean {
        return isUpperCase(c);
    }

    public static isISOControl(c: number): boolean {
        return c <= 0x1F || (c >= 0x7F && c <= 0x9F);
    }

    public static isWhitespace(c: number): boolean {
        return isWhiteSpace(c);
    }

    /**
     * Converts the specified surrogate pair to its supplementary code point value.
     *
     * @param high The leading surrogate.
     * @param low The trailing surrogate.
     *
     * @returns The computed Unicode codepoint.
     */
    public static toCodePoint(high: number, low: number): number {
        return (high << 10) + low + Character.MIN_SUPPLEMENTARY_CODE_POINT - (Character.MIN_HIGH_SURROGATE << 10) -
            Character.MIN_LOW_SURROGATE;
    }

    public static toString(c: number): string {
        return String.fromCodePoint(c);
    }

    public static toUpperCase(s: string): string;
    public static toUpperCase(c: number): number;
    public static toUpperCase(s: string | number): string | number {
        if (typeof s === "number") {
            return String.fromCodePoint(s).toUpperCase().codePointAt(0)!;
        }

        return s.toUpperCase();
    }

    public static toLowerCase(s: string): string;
    public static toLowerCase(c: number): number;
    public static toLowerCase(s: string | number): string | number {
        if (typeof s === "number") {
            return String.fromCodePoint(s).toLowerCase().codePointAt(0)!;
        }

        return s.toLowerCase();
    }

    /**
     * Determines the number of char values needed to represent the specified character (Unicode code point).
     * If the specified character is equal to or greater than 0x10000, then the method returns 2.
     * Otherwise, the method returns 1.
     *
     * @param codePoint The character (Unicode code point) to check.
     *
     * @returns The number of char values needed to represent the specified character.
     */
    public static charCount(codePoint: number): number {
        return codePoint >= 0x10000 ? 2 : 1;
    }
};
