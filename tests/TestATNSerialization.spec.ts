/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

// cspell: ignore FFFC FFFD

import { describe, expect, it } from "vitest";

import { ATNDeserializer, ATNSerializer } from "antlr4ng";

import type { IToolParameters } from "../src/tool-parameters.js";
import { Grammar, LexerGrammar } from "../src/tool/index.js";
import { ATNDescriber } from "./ATNDescriber.js";
import { ToolTestUtils } from "./ToolTestUtils.js";

describe("TestATNSerialization", () => {
    const checkResults = (g: Grammar, expecting: string): void => {
        g.tool.process(g, {} as IToolParameters, false);

        const atn = ToolTestUtils.createATN(g, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const atnData = new ATNDescriber(atn, g.getTokenNames()).decode(serialized);
        expect(atnData).toBe(expecting);

        const atn2 = new ATNDeserializer().deserialize(serialized);
        const serialized2 = ATNSerializer.getSerialized(atn2);

        expect(serialized2).toEqual(serialized);
    };

    it("testSimpleNoBlock", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A B ;");

        const expecting =
            "max type 2\n" +
            "0:RULE_START 0\n" +
            "1:RULE_STOP 0\n" +
            "2:BASIC 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "5:BASIC 0\n" +
            "rule 0:0\n" +
            "0->2 EPSILON 0,0,0\n" +
            "2->3 ATOM 1,0,0\n" +
            "3->4 ATOM 2,0,0\n" +
            "4->1 EPSILON 0,0,0\n";
        checkResults(g, expecting);
    });

    it("testEOF", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A EOF ;");
        const expecting =
            "max type 1\n" +
            "0:RULE_START 0\n" +
            "1:RULE_STOP 0\n" +
            "2:BASIC 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "5:BASIC 0\n" +
            "rule 0:0\n" +
            "0->2 EPSILON 0,0,0\n" +
            "2->3 ATOM 1,0,0\n" +
            "3->4 ATOM 0,0,1\n" +
            "4->1 EPSILON 0,0,0\n";
        checkResults(g, expecting);
    });

    it("testEOFInSet", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : (A|EOF) ;");

        const expecting =
            "max type 1\n" +
            "0:RULE_START 0\n" +
            "1:RULE_STOP 0\n" +
            "2:BASIC 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:0\n" +
            "0:EOF, A..A\n" +
            "0->2 EPSILON 0,0,0\n" +
            "2->3 SET 0,0,0\n" +
            "3->1 EPSILON 0,0,0\n";

        checkResults(g, expecting);
    });

    it("testNot", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "tokens {A, B, C}\n" +
            "a : ~A ;");
        g.tool.process(g, {} as IToolParameters, false);

        const expecting =
            "max type 3\n" +
            "0:RULE_START 0\n" +
            "1:RULE_STOP 0\n" +
            "2:BASIC 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:0\n" +
            "0:A..A\n" +
            "0->2 EPSILON 0,0,0\n" +
            "2->3 NOT_SET 0,0,0\n" +
            "3->1 EPSILON 0,0,0\n";

        const atn = ToolTestUtils.createATN(g, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, g.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testWildcard", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "tokens {A, B, C}\n" +
            "a : . ;");

        const expecting =
            "max type 3\n" +
            "0:RULE_START 0\n" +
            "1:RULE_STOP 0\n" +
            "2:BASIC 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:0\n" +
            "0->2 EPSILON 0,0,0\n" +
            "2->3 WILDCARD 0,0,0\n" +
            "3->1 EPSILON 0,0,0\n";

        checkResults(g, expecting);
    });

    it("testPEGAchillesHeel", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A | A B ;");

        const expecting =
            "max type 2\n" +
            "0:RULE_START 0\n" +
            "1:RULE_STOP 0\n" +
            "2:BASIC 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "5:BLOCK_START 0 6\n" +
            "6:BLOCK_END 0\n" +
            "7:BASIC 0\n" +
            "rule 0:0\n" +
            "0->5 EPSILON 0,0,0\n" +
            "2->6 ATOM 1,0,0\n" +
            "3->4 ATOM 1,0,0\n" +
            "4->6 ATOM 2,0,0\n" +
            "5->2 EPSILON 0,0,0\n" +
            "5->3 EPSILON 0,0,0\n" +
            "6->1 EPSILON 0,0,0\n" +
            "0:5\n";

        checkResults(g, expecting);
    });

    it("test3Alts", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A | A B | A B C ;");

        const expecting =
            "max type 3\n" +
            "0:RULE_START 0\n" +
            "1:RULE_STOP 0\n" +
            "2:BASIC 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "5:BASIC 0\n" +
            "6:BASIC 0\n" +
            "7:BASIC 0\n" +
            "8:BLOCK_START 0 9\n" +
            "9:BLOCK_END 0\n" +
            "10:BASIC 0\n" +
            "rule 0:0\n" +
            "0->8 EPSILON 0,0,0\n" +
            "2->9 ATOM 1,0,0\n" +
            "3->4 ATOM 1,0,0\n" +
            "4->9 ATOM 2,0,0\n" +
            "5->6 ATOM 1,0,0\n" +
            "6->7 ATOM 2,0,0\n" +
            "7->9 ATOM 3,0,0\n" +
            "8->2 EPSILON 0,0,0\n" +
            "8->3 EPSILON 0,0,0\n" +
            "8->5 EPSILON 0,0,0\n" +
            "9->1 EPSILON 0,0,0\n" +
            "0:8\n";

        checkResults(g, expecting);
    });

    it("testSimpleLoop", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A+ B ;");

        const expecting =
            "max type 2\n" +
            "0:RULE_START 0\n" +
            "1:RULE_STOP 0\n" +
            "2:BASIC 0\n" +
            "3:PLUS_BLOCK_START 0 4\n" +
            "4:BLOCK_END 0\n" +
            "5:PLUS_LOOP_BACK 0\n" +
            "6:LOOP_END 0 5\n" +
            "7:BASIC 0\n" +
            "8:BASIC 0\n" +
            "9:BASIC 0\n" +
            "rule 0:0\n" +
            "0->3 EPSILON 0,0,0\n" +
            "2->4 ATOM 1,0,0\n" +
            "3->2 EPSILON 0,0,0\n" +
            "4->5 EPSILON 0,0,0\n" +
            "5->3 EPSILON 0,0,0\n" +
            "5->6 EPSILON 0,0,0\n" +
            "6->7 EPSILON 0,0,0\n" +
            "7->8 ATOM 2,0,0\n" +
            "8->1 EPSILON 0,0,0\n" +
            "0:5\n";

        checkResults(g, expecting);
    });

    it("testRuleRef", (): void => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : e ;\n" +
            "e : E ;\n");

        const expecting =
            "max type 1\n" +
            "0:RULE_START 0\n" +
            "1:RULE_STOP 0\n" +
            "2:RULE_START 1\n" +
            "3:RULE_STOP 1\n" +
            "4:BASIC 0\n" +
            "5:BASIC 0\n" +
            "6:BASIC 1\n" +
            "7:BASIC 1\n" +
            "8:BASIC 1\n" +
            "rule 0:0\n" +
            "rule 1:2\n" +
            "0->4 EPSILON 0,0,0\n" +
            "2->6 EPSILON 0,0,0\n" +
            "4->5 RULE 2,1,0\n" +
            "5->1 EPSILON 0,0,0\n" +
            "6->7 ATOM 1,0,0\n" +
            "7->3 EPSILON 0,0,0\n";
        checkResults(g, expecting);
    });

    it("testLexerTwoRules", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 2\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:RULE_START 1\n" +
            "4:RULE_STOP 1\n" +
            "5:BASIC 0\n" +
            "6:BASIC 0\n" +
            "7:BASIC 1\n" +
            "8:BASIC 1\n" +
            "rule 0:1 1\n" +
            "rule 1:3 2\n" +
            "mode 0:0\n" +
            "0->1 EPSILON 0,0,0\n" +
            "0->3 EPSILON 0,0,0\n" +
            "1->5 EPSILON 0,0,0\n" +
            "3->7 EPSILON 0,0,0\n" +
            "5->6 ATOM 97,0,0\n" +
            "6->2 EPSILON 0,0,0\n" +
            "7->8 ATOM 98,0,0\n" +
            "8->4 EPSILON 0,0,0\n" +
            "0:0\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeSMPLiteralSerializedToSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : '\\u{1F4A9}' ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 ATOM 128169,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeSMPRangeSerializedToSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : ('a'..'\\u{1F4A9}') ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 RANGE 97,128169,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeSMPAndBMPSetSerialized", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "SMP : ('\\u{1F4A9}' | '\\u{1F4AF}') ;\n" +
            "BMP : ('a' | 'x') ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 2\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:RULE_START 1\n" +
            "4:RULE_STOP 1\n" +
            "5:BASIC 0\n" +
            "6:BASIC 0\n" +
            "7:BASIC 1\n" +
            "8:BASIC 1\n" +
            "rule 0:1 1\n" +
            "rule 1:3 2\n" +
            "mode 0:0\n" +
            "0:128169..128169, 128175..128175\n" +
            "1:'a'..'a', 'x'..'x'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "0->3 EPSILON 0,0,0\n" +
            "1->5 EPSILON 0,0,0\n" +
            "3->7 EPSILON 0,0,0\n" +
            "5->6 SET 0,0,0\n" +
            "6->2 EPSILON 0,0,0\n" +
            "7->8 SET 1,0,0\n" +
            "8->4 EPSILON 0,0,0\n" +
            "0:0\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerWith0xFFFCInSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ([A-Z_]|'Ā'..'\\uFFFC') ([A-Z_0-9]|'Ā'..'\\uFFFC')*; // FFFD+ are not valid char\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BLOCK_START 0 5\n" +
            "5:BLOCK_END 0\n" +
            "6:BASIC 0\n" +
            "7:STAR_BLOCK_START 0 8\n" +
            "8:BLOCK_END 0\n" +
            "9:STAR_LOOP_ENTRY 0\n" +
            "10:LOOP_END 0 11\n" +
            "11:STAR_LOOP_BACK 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'A'..'Z', '_'..'_', '\\u0100'..'\\uFFFC'\n" +
            "1:'0'..'9', 'A'..'Z', '_'..'_', '\\u0100'..'\\uFFFC'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->4 EPSILON 0,0,0\n" +
            "3->5 SET 0,0,0\n" +
            "4->3 EPSILON 0,0,0\n" +
            "5->9 EPSILON 0,0,0\n" +
            "6->8 SET 1,0,0\n" +
            "7->6 EPSILON 0,0,0\n" +
            "8->11 EPSILON 0,0,0\n" +
            "9->7 EPSILON 0,0,0\n" +
            "9->10 EPSILON 0,0,0\n" +
            "10->2 EPSILON 0,0,0\n" +
            "11->9 EPSILON 0,0,0\n" +
            "0:0\n" +
            "1:4\n" +
            "2:7\n" +
            "3:9\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerNotLiteral", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : ~'a' ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'a'..'a'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : '0'..'9' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 RANGE 48,57,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerEOF", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : 'a' EOF ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "5:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 ATOM 97,0,0\n" +
            "4->5 ATOM 0,0,1\n" +
            "5->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerEOFInSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : 'a' (EOF|'\\n') ;\n");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "5:BLOCK_START 0 6\n" +
            "6:BLOCK_END 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:EOF, '\\n'..'\\n'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->5 ATOM 97,0,0\n" +
            "4->6 SET 0,0,0\n" +
            "5->4 EPSILON 0,0,0\n" +
            "6->2 EPSILON 0,0,0\n" +
            "0:0\n" +
            "1:5\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerLoops", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : '0'..'9'+ ;\n");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:PLUS_BLOCK_START 0 5\n" +
            "5:BLOCK_END 0\n" +
            "6:PLUS_LOOP_BACK 0\n" +
            "7:LOOP_END 0 6\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->4 EPSILON 0,0,0\n" +
            "3->5 RANGE 48,57,0\n" +
            "4->3 EPSILON 0,0,0\n" +
            "5->6 EPSILON 0,0,0\n" +
            "6->4 EPSILON 0,0,0\n" +
            "6->7 EPSILON 0,0,0\n" +
            "7->2 EPSILON 0,0,0\n" +
            "0:0\n" +
            "1:6\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerAction", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' {a} ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' {c} ;\n");
        const expecting =
            "max type 3\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:RULE_START 1\n" +
            "4:RULE_STOP 1\n" +
            "5:RULE_START 2\n" +
            "6:RULE_STOP 2\n" +
            "7:BASIC 0\n" +
            "8:BASIC 0\n" +
            "9:BASIC 0\n" +
            "10:BASIC 1\n" +
            "11:BASIC 1\n" +
            "12:BASIC 2\n" +
            "13:BASIC 2\n" +
            "14:BASIC 2\n" +
            "rule 0:1 1\n" +
            "rule 1:3 2\n" +
            "rule 2:5 3\n" +
            "mode 0:0\n" +
            "0->1 EPSILON 0,0,0\n" +
            "0->3 EPSILON 0,0,0\n" +
            "0->5 EPSILON 0,0,0\n" +
            "1->7 EPSILON 0,0,0\n" +
            "3->10 EPSILON 0,0,0\n" +
            "5->12 EPSILON 0,0,0\n" +
            "7->8 ATOM 97,0,0\n" +
            "8->9 ACTION 0,0,0\n" +
            "9->2 EPSILON 0,0,0\n" +
            "10->11 ATOM 98,0,0\n" +
            "11->4 EPSILON 0,0,0\n" +
            "12->13 ATOM 99,0,0\n" +
            "13->14 ACTION 2,1,0\n" +
            "14->6 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerNotSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b')\n ;");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'a'..'b'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";
        checkResults(lg, expecting);
    });

    it("testLexerSetWithRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ('a'|'b'|'e'|'p'..'t')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'a'..'b', 'e'..'e', 'p'..'t'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerNotSetWithRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b'|'e'|'p'..'t')\n ;");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'a'..'b', 'e'..'e', 'p'..'t'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeUnescapedBMPNotSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\u4E9C'|'\u4E9D')\n ;");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'\\u4E9C'..'\\u4E9D'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeUnescapedBMPSetWithRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ('\u4E9C'|'\u4E9D'|'\u6C5F'|'\u305F'..'\u307B')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'\\u305F'..'\\u307B', '\\u4E9C'..'\\u4E9D', '\\u6C5F'..'\\u6C5F'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeUnescapedBMPNotSetWithRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\u4E9C'|'\u4E9D'|'\u6C5F'|'\u305F'..'\u307B')\n ;");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'\\u305F'..'\\u307B', '\\u4E9C'..'\\u4E9D', '\\u6C5F'..'\\u6C5F'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeEscapedBMPNotSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\\u4E9C'|'\\u4E9D')\n ;");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'\\u4E9C'..'\\u4E9D'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeEscapedBMPSetWithRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ('\\u4E9C'|'\\u4E9D'|'\\u6C5F'|'\\u305F'..'\\u307B')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'\\u305F'..'\\u307B', '\\u4E9C'..'\\u4E9D', '\\u6C5F'..'\\u6C5F'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeEscapedBMPNotSetWithRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\\u4E9C'|'\\u4E9D'|'\\u6C5F'|'\\u305F'..'\\u307B')\n ;");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'\\u305F'..'\\u307B', '\\u4E9C'..'\\u4E9D', '\\u6C5F'..'\\u6C5F'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeEscapedSMPNotSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\\u{1F4A9}'|'\\u{1F4AA}')\n ;");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:128169..128170\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeEscapedSMPSetWithRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ('\\u{1F4A9}'|'\\u{1F4AA}'|'\\u{1F441}'|'\\u{1D40F}'..'\\u{1D413}')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:119823..119827, 128065..128065, 128169..128170\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";

        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerUnicodeEscapedSMPNotSetWithRange", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\\u{1F4A9}'|'\\u{1F4AA}'|'\\u{1F441}'|'\\u{1D40F}'..'\\u{1D413}')\n ;");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:119823..119827, 128065..128065, 128169..128170\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerWildcardWithMode", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : 'a'..'z'+ ;\n" +
            "mode CMT;" +
            "COMMENT : '*/' {skip(); popMode();} ;\n" +
            "JUNK : . {more();} ;\n");
        const expecting =
            "max type 3\n" +
            "0:TOKEN_START -1\n" +
            "1:TOKEN_START -1\n" +
            "2:RULE_START 0\n" +
            "3:RULE_STOP 0\n" +
            "4:RULE_START 1\n" +
            "5:RULE_STOP 1\n" +
            "6:RULE_START 2\n" +
            "7:RULE_STOP 2\n" +
            "8:BASIC 0\n" +
            "9:PLUS_BLOCK_START 0 10\n" +
            "10:BLOCK_END 0\n" +
            "11:PLUS_LOOP_BACK 0\n" +
            "12:LOOP_END 0 11\n" +
            "13:BASIC 1\n" +
            "14:BASIC 1\n" +
            "15:BASIC 1\n" +
            "16:BASIC 1\n" +
            "17:BASIC 1\n" +
            "18:BASIC 2\n" +
            "19:BASIC 2\n" +
            "20:BASIC 2\n" +
            "rule 0:2 1\n" +
            "rule 1:4 2\n" +
            "rule 2:6 3\n" +
            "mode 0:0\n" +
            "mode 1:1\n" +
            "0->2 EPSILON 0,0,0\n" +
            "1->4 EPSILON 0,0,0\n" +
            "1->6 EPSILON 0,0,0\n" +
            "2->9 EPSILON 0,0,0\n" +
            "4->13 EPSILON 0,0,0\n" +
            "6->18 EPSILON 0,0,0\n" +
            "8->10 RANGE 97,122,0\n" +
            "9->8 EPSILON 0,0,0\n" +
            "10->11 EPSILON 0,0,0\n" +
            "11->9 EPSILON 0,0,0\n" +
            "11->12 EPSILON 0,0,0\n" +
            "12->3 EPSILON 0,0,0\n" +
            "13->14 ATOM 42,0,0\n" +
            "14->15 ATOM 47,0,0\n" +
            "15->16 EPSILON 0,0,0\n" +
            "16->17 ACTION 1,0,0\n" +
            "17->5 EPSILON 0,0,0\n" +
            "18->19 WILDCARD 0,0,0\n" +
            "19->20 ACTION 2,1,0\n" +
            "20->7 EPSILON 0,0,0\n" +
            "0:0\n" +
            "1:1\n" +
            "2:11\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testLexerNotSetWithRange2", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b') ~('e'|'p'..'t')\n ;");
        const expecting =
            "max type 1\n" +
            "0:TOKEN_START -1\n" +
            "1:RULE_START 0\n" +
            "2:RULE_STOP 0\n" +
            "3:BASIC 0\n" +
            "4:BASIC 0\n" +
            "5:BASIC 0\n" +
            "rule 0:1 1\n" +
            "mode 0:0\n" +
            "0:'a'..'b'\n" +
            "1:'e'..'e', 'p'..'t'\n" +
            "0->1 EPSILON 0,0,0\n" +
            "1->3 EPSILON 0,0,0\n" +
            "3->4 NOT_SET 0,0,0\n" +
            "4->5 NOT_SET 1,0,0\n" +
            "5->2 EPSILON 0,0,0\n" +
            "0:0\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("testModeInLexer", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a'\n ;\n" +
            "B : 'b';\n" +
            "mode M;\n" +
            "C : 'c';\n" +
            "D : 'd';\n");
        const expecting =
            "max type 4\n" +
            "0:TOKEN_START -1\n" +
            "1:TOKEN_START -1\n" +
            "2:RULE_START 0\n" +
            "3:RULE_STOP 0\n" +
            "4:RULE_START 1\n" +
            "5:RULE_STOP 1\n" +
            "6:RULE_START 2\n" +
            "7:RULE_STOP 2\n" +
            "8:RULE_START 3\n" +
            "9:RULE_STOP 3\n" +
            "10:BASIC 0\n" +
            "11:BASIC 0\n" +
            "12:BASIC 1\n" +
            "13:BASIC 1\n" +
            "14:BASIC 2\n" +
            "15:BASIC 2\n" +
            "16:BASIC 3\n" +
            "17:BASIC 3\n" +
            "rule 0:2 1\n" +
            "rule 1:4 2\n" +
            "rule 2:6 3\n" +
            "rule 3:8 4\n" +
            "mode 0:0\n" +
            "mode 1:1\n" +
            "0->2 EPSILON 0,0,0\n" +
            "0->4 EPSILON 0,0,0\n" +
            "1->6 EPSILON 0,0,0\n" +
            "1->8 EPSILON 0,0,0\n" +
            "2->10 EPSILON 0,0,0\n" +
            "4->12 EPSILON 0,0,0\n" +
            "6->14 EPSILON 0,0,0\n" +
            "8->16 EPSILON 0,0,0\n" +
            "10->11 ATOM 97,0,0\n" +
            "11->3 EPSILON 0,0,0\n" +
            "12->13 ATOM 98,0,0\n" +
            "13->5 EPSILON 0,0,0\n" +
            "14->15 ATOM 99,0,0\n" +
            "15->7 EPSILON 0,0,0\n" +
            "16->17 ATOM 100,0,0\n" +
            "17->9 EPSILON 0,0,0\n" +
            "0:0\n" +
            "1:1\n";
        const atn = ToolTestUtils.createATN(lg, true);
        const serialized = ATNSerializer.getSerialized(atn);
        const result = new ATNDescriber(atn, lg.getTokenNames()).decode(serialized);
        expect(result).toBe(expecting);
    });

    it("test2ModesInLexer", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a'\n ;\n" +
            "mode M;\n" +
            "B : 'b';\n" +
            "mode M2;\n" +
            "C : 'c';\n");
        const expecting =
            "max type 3\n" +
            "0:TOKEN_START -1\n" +
            "1:TOKEN_START -1\n" +
            "2:TOKEN_START -1\n" +
            "3:RULE_START 0\n" +
            "4:RULE_STOP 0\n" +
            "5:RULE_START 1\n" +
            "6:RULE_STOP 1\n" +
            "7:RULE_START 2\n" +
            "8:RULE_STOP 2\n" +
            "9:BASIC 0\n" +
            "10:BASIC 0\n" +
            "11:BASIC 1\n" +
            "12:BASIC 1\n" +
            "13:BASIC 2\n" +
            "14:BASIC 2\n" +
            "rule 0:3 1\n" +
            "rule 1:5 2\n" +
            "rule 2:7 3\n" +
            "mode 0:0\n" +
            "mode 1:1\n" +
            "mode 2:2\n" +
            "0->3 EPSILON 0,0,0\n" +
            "1->5 EPSILON 0,0,0\n" +
            "2->7 EPSILON 0,0,0\n" +
            "3->9 EPSILON 0,0,0\n" +
            "5->11 EPSILON 0,0,0\n" +
            "7->13 EPSILON 0,0,0\n" +
            "9->10 ATOM 97,0,0\n" +
            "10->4 EPSILON 0,0,0\n" +
            "11->12 ATOM 98,0,0\n" +
            "12->6 EPSILON 0,0,0\n" +
            "13->14 ATOM 99,0,0\n" +
            "14->8 EPSILON 0,0,0\n" +
            "0:0\n" +
            "1:1\n" +
            "2:2\n";
        checkResults(lg, expecting);
    });

});
