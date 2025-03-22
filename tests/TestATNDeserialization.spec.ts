/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { ATNDeserializer, ATNSerializer } from "antlr4ng";

import type { IToolParameters } from "../src/tool-parameters.js";
import { Grammar, LexerGrammar } from "../src/tool/index.js";
import { ATNDescriber } from "./ATNDescriber.js";
import { ToolTestUtils } from "./ToolTestUtils.js";

describe("TestATNDeserialization", () => {
    const checkDeserializationIsStable = (g: Grammar): void => {
        g.tool.process(g, {} as IToolParameters, false);
        const atn = ToolTestUtils.createATN(g, false);
        const serialized = ATNSerializer.getSerialized(atn);
        const atnData = new ATNDescriber(atn, g.getTokenNames()).decode(serialized);

        const atn2 = new ATNDeserializer().deserialize(serialized);
        const serialized1 = ATNSerializer.getSerialized(atn2);
        const atn2Data = new ATNDescriber(atn2, g.getTokenNames()).decode(serialized1);

        expect(atn2Data).toBe(atnData);
    };

    it("testSimpleNoBlock", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A B ;");
        checkDeserializationIsStable(g);
    });

    it("testEOF", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : EOF ;");
        checkDeserializationIsStable(g);
    });

    it("testEOFInSet", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : (EOF|A) ;");
        checkDeserializationIsStable(g);
    });

    it("testNot", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "tokens {A, B, C}\n" +
            "a : ~A ;");
        checkDeserializationIsStable(g);
    });

    it("testWildcard", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "tokens {A, B, C}\n" +
            "a : . ;");
        checkDeserializationIsStable(g);
    });

    it("testPEGAchillesHeel", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A | A B ;");
        checkDeserializationIsStable(g);
    });

    it("test3Alts", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A | A B | A B C ;");
        checkDeserializationIsStable(g);
    });

    it("testSimpleLoop", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A+ B ;");
        checkDeserializationIsStable(g);
    });

    it("testRuleRef", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : e ;\n" +
            "e : E ;\n");
        checkDeserializationIsStable(g);
    });

    it("testLexerTwoRules", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n");
        checkDeserializationIsStable(lg);
    });

    it("testLexerEOF", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' EOF ;\n");
        checkDeserializationIsStable(lg);
    });

    it("testLexerEOFInSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' (EOF|'\\n') ;\n");
        checkDeserializationIsStable(lg);
    });

    it("testLexerRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : '0'..'9' ;\n");
        checkDeserializationIsStable(lg);
    });

    it("testLexerLoops", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : '0'..'9'+ ;\n");
        checkDeserializationIsStable(lg);
    });

    it("testLexerNotSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b')\n ;");
        checkDeserializationIsStable(lg);
    });

    it("testLexerNotSetWithRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b'|'e'|'p'..'t')\n ;");
        checkDeserializationIsStable(lg);
    });

    it("testLexerNotSetWithRange2", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b') ~('e'|'p'..'t')\n ;");
        checkDeserializationIsStable(lg);
    });

    it("test2ModesInLexer", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a'\n ;\n" +
            "mode M;\n" +
            "B : 'b';\n" +
            "mode M2;\n" +
            "C : 'c';\n");
        checkDeserializationIsStable(lg);
    });

    it("testLastValidBMPCharInSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : 'Ā'..'\\uFFFC'; // 0xFFFD+ are not valid char\n");
        checkDeserializationIsStable(lg);
    });

});
