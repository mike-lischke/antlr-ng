/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

// cspell: ignore abdc aaaaaab aabd

import { describe, expect, it } from "vitest";

import { BlockStartState, DFA, Lexer, LexerATNSimulator, NoViableAltException, type ATNState } from "antlr4ng";

import type { IToolParameters } from "../src/tool-parameters.js";
import { Grammar, LexerGrammar } from "../src/tool/index.js";
import { MockIntTokenStream } from "./MockIntTokenStream.js";
import { ParserInterpreterForTesting } from "./ParserInterpreterForTesting.js";
import { ToolTestUtils } from "./ToolTestUtils.js";

describe("TestATNInterpreter", () => {
    const checkMatchedAlt = (lg: LexerGrammar, g: Grammar, inputString: string, expected: number): void => {
        //const lexerATN = ToolTestUtils.createATN(lg, true);
        const lexerATN = lg.atn!;
        const lexInterp = new LexerATNSimulator(null, lexerATN,
            [new DFA(lexerATN.modeToStartState[Lexer.DEFAULT_MODE])]);
        const types = ToolTestUtils.getTokenTypesViaATN(inputString, lexInterp);

        g.importVocab(lg);

        const atn = g.atn!;

        const input = new MockIntTokenStream(types);
        const interp = new ParserInterpreterForTesting(g, input);
        let startState: ATNState = atn.ruleToStartState[g.getRule("a")!.index]!;
        if (startState.transitions[0].target instanceof BlockStartState) {
            startState = startState.transitions[0].target;
        }

        const result = interp.matchATN(input, startState);
        expect(result).toBe(expected);
    };

    it("testSimpleNoBlock", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A B ;");

        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "ab", 1);
    });

    it("testSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "tokens {A,B,C}\n" +
            "a : ~A ;");

        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "b", 1);
    });

    it("testPEGAchillesHeel", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A | A B ;");

        g.tool.process(g, {} as IToolParameters, false);

        //checkMatchedAlt(lg, g, "a", 1);
        checkMatchedAlt(lg, g, "ab", 2);
        //checkMatchedAlt(lg, g, "abc", 2);
    });

    it("testMustTrackPreviousGoodAlt", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A | A B ;");

        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "a", 1);
        checkMatchedAlt(lg, g, "ab", 2);

        checkMatchedAlt(lg, g, "ac", 1);
        checkMatchedAlt(lg, g, "abc", 2);
    });

    it("testMustTrackPreviousGoodAltWithEOF", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : (A | A B) EOF;");

        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "a", 1);
        checkMatchedAlt(lg, g, "ab", 2);

        let error: NoViableAltException | undefined;
        expect(() => {
            try {
                checkMatchedAlt(lg, g, "ac", 1);
            } catch (e) {
                error = e as NoViableAltException;
                throw e;
            }
        }).toThrowError(NoViableAltException);

        expect(error!.offendingToken?.tokenIndex).toBe(1);
        expect(error!.offendingToken?.type).toBe(3);
    });

    it("testMustTrackPreviousGoodAlt2", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A | A B | A B C ;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "a", 1);
        checkMatchedAlt(lg, g, "ab", 2);
        checkMatchedAlt(lg, g, "abc", 3);

        checkMatchedAlt(lg, g, "ad", 1);
        checkMatchedAlt(lg, g, "abd", 2);
        checkMatchedAlt(lg, g, "abcd", 3);
    });

    it("testMustTrackPreviousGoodAlt2WithEOF", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : (A | A B | A B C) EOF;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "a", 1);
        checkMatchedAlt(lg, g, "ab", 2);
        checkMatchedAlt(lg, g, "abc", 3);

        let error: NoViableAltException | undefined;
        expect(() => {
            try {
                checkMatchedAlt(lg, g, "abd", 1);
            } catch (e) {
                error = e as NoViableAltException;
                throw e;
            }
        }).toThrowError(NoViableAltException);

        expect(error!.offendingToken?.tokenIndex).toBe(2);
        expect(error!.offendingToken?.type).toBe(4);
    });

    it("testMustTrackPreviousGoodAlt3", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A B | A | A B C ;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "a", 2);
        checkMatchedAlt(lg, g, "ab", 1);
        checkMatchedAlt(lg, g, "abc", 3);

        checkMatchedAlt(lg, g, "ad", 2);
        checkMatchedAlt(lg, g, "abd", 1);
        checkMatchedAlt(lg, g, "abcd", 3);
    });

    it("testMustTrackPreviousGoodAlt3WithEOF", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : (A B | A | A B C) EOF;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "a", 2);
        checkMatchedAlt(lg, g, "ab", 1);
        checkMatchedAlt(lg, g, "abc", 3);

        let error: NoViableAltException | undefined;
        expect(() => {
            try {
                checkMatchedAlt(lg, g, "abd", 1);
            } catch (e) {
                error = e as NoViableAltException;
                throw e;
            }
        }).toThrowError(NoViableAltException);

        expect(error!.offendingToken?.tokenIndex).toBe(2);
        expect(error!.offendingToken?.type).toBe(4);
    });

    it("testAmbigAltChooseFirst", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A B | A B ;"); // first alt
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "ab", 1);
        checkMatchedAlt(lg, g, "abc", 1);
    });

    it("testAmbigAltChooseFirstWithFollowingToken", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : (A B | A B) C ;"); // first alt
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "abc", 1);
        checkMatchedAlt(lg, g, "abcd", 1);
    });

    it("testAmbigAltChooseFirstWithFollowingToken2", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : (A B | A B | C) D ;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "abd", 1);
        checkMatchedAlt(lg, g, "abdc", 1);
        checkMatchedAlt(lg, g, "cd", 3);
    });

    it("testAmbigAltChooseFirst2", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A B | A B | A B C ;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "ab", 1);
        checkMatchedAlt(lg, g, "abc", 3);

        checkMatchedAlt(lg, g, "abd", 1);
        checkMatchedAlt(lg, g, "abcd", 3);
    });

    it("testAmbigAltChooseFirst2WithEOF", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : (A B | A B | A B C) EOF;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "ab", 1);
        checkMatchedAlt(lg, g, "abc", 3);

        let error: NoViableAltException | undefined;
        expect(() => {
            try {
                checkMatchedAlt(lg, g, "abd", 1);
            } catch (e) {
                error = e as NoViableAltException;
                throw e;
            }
        }).toThrowError(NoViableAltException);

        expect(error!.offendingToken?.tokenIndex).toBe(2);
        expect(error!.offendingToken?.type).toBe(4);
    });

    it("testSimpleLoop", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "D : 'd' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A+ B ;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "ab", 1);
        checkMatchedAlt(lg, g, "aab", 1);
        checkMatchedAlt(lg, g, "aaaaaab", 1);
        checkMatchedAlt(lg, g, "aabd", 1);
    });

    it("testCommonLeftPrefix", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A B | A C ;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "ab", 1);
        checkMatchedAlt(lg, g, "ac", 2);
    });

    it("testArbitraryLeftPrefix", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A+ B | A+ C ;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "aac", 2);
    });

    it("testRecursiveLeftPrefix", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n" +
            "LP : '(' ;\n" +
            "RP : ')' ;\n" +
            "INT : '0'..'9'+ ;\n"
        );
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "tokens {A,B,C,LP,RP,INT}\n" +
            "a : e B | e C ;\n" +
            "e : LP e RP\n" +
            "  | INT\n" +
            "  ;");
        g.tool.process(g, {} as IToolParameters, false);

        checkMatchedAlt(lg, g, "34b", 1);
        checkMatchedAlt(lg, g, "34c", 2);
        checkMatchedAlt(lg, g, "(34)b", 1);
        checkMatchedAlt(lg, g, "(34)c", 2);
        checkMatchedAlt(lg, g, "((34))b", 1);
        checkMatchedAlt(lg, g, "((34))c", 2);
    });

});
