/*
 * Copyright (c) 2012-2017 The ANTLR Project. All rights reserved.
 * Use of this file is governed by the BSD 3-clause license that
 * can be found in the LICENSE.txt file in the project root.
 */

import { describe, expect, it } from "vitest";

import { UnicodeEscapes } from "../src/codegen/UnicodeEscapes.js";

describe("TestUnicodeEscapes", () => {
    const checkUnicodeEscape = (expected: string, input: number, language: string): void => {
        expect(UnicodeEscapes.escapeCodePoint(input, language)).toBe(expected);
    };

    it("latinJavaEscape", () => {
        checkUnicodeEscape("\\u0061", 0x0061, "Java");
    });

    it("latinPythonEscape", () => {
        checkUnicodeEscape("\\u0061", 0x0061, "Python3");
    });

    it("latinSwiftEscape", () => {
        checkUnicodeEscape("\\u{0061}", 0x0061, "Swift");
    });

    it("bmpJavaEscape", () => {
        checkUnicodeEscape("\\uABCD", 0xABCD, "Java");
    });

    it("bmpPythonEscape", () => {
        checkUnicodeEscape("\\uABCD", 0xABCD, "Python3");
    });

    it("bmpSwiftEscape", () => {
        checkUnicodeEscape("\\u{ABCD}", 0xABCD, "Swift");
    });

    it("smpJavaEscape", () => {
        checkUnicodeEscape("\\uD83D\\uDCA9", 0x1F4A9, "Java");
    });

    it("smpPythonEscape", () => {
        checkUnicodeEscape("\\U0001F4A9", 0x1F4A9, "Python3");
    });

    it("smpSwiftEscape", () => {
        checkUnicodeEscape("\\u{1F4A9}", 0x1F4A9, "Swift");
    });

});