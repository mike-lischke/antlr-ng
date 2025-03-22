/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { Token } from "antlr4ng";

import { describe, expect, it } from "vitest";
import { Grammar, LexerGrammar } from "../src/tool/index.js";
import { convertArrayToString, convertMapToString } from "../src/support/helpers.js";
import type { IToolParameters } from "../src/tool-parameters.js";

describe("TestTokenTypeAssignment", () => {
    const checkSymbols = (g: Grammar, rules: string[], allValidTokens: string[]): void => {
        const typeToTokenName = g.getTokenNames();
        const tokens = new Set<string>();
        for (let i = 0; i < typeToTokenName.length; i++) {
            const t = typeToTokenName[i];
            if (t !== null) {
                if (t.startsWith(Grammar.AUTO_GENERATED_TOKEN_NAME_PREFIX)) {
                    tokens.add(g.getTokenDisplayName(i));
                } else {
                    tokens.add(t);
                }
            }
        }

        // make sure expected tokens are there
        allValidTokens.forEach((tokenName) => {
            expect(g.getTokenType(tokenName)).not.toBe(Token.INVALID_TYPE);
            tokens.delete(tokenName);
        });

        // make sure there are not any others (other than <EOF> etc...)
        for (const tokenName of tokens) {
            expect(g.getTokenType(tokenName)).toBeLessThan(Token.MIN_USER_TOKEN_TYPE);
        }

        // make sure all expected rules are there
        for (const rule of rules) {
            expect(g.getRule(rule)).not.toBeNull();
        }

        // make sure there are no extra rules
        expect(rules.length).toBe(g.rules.size);
    };

    it("testParserSimpleTokens", () => {
        const g = new Grammar(
            "parser grammar t;\n" +
            "a : A | B;\n" +
            "b : C ;");
        g.tool.process(g, {} as IToolParameters, false);

        const rules = ["a", "b"];
        const tokenNames = ["A", "B", "C"];
        checkSymbols(g, rules, tokenNames);
    });

    it("testParserTokensSection", () => {
        const g = new Grammar(
            "parser grammar t;\n" +
            "tokens {\n" +
            "  C,\n" +
            "  D" +
            "}\n" +
            "a : A | B;\n" +
            "b : C ;");
        g.tool.process(g, {} as IToolParameters, false);

        const rules = ["a", "b"];
        const tokenNames = ["A", "B", "C", "D"];
        checkSymbols(g, rules, tokenNames);
    });

    it("testLexerTokensSection", () => {
        const g = new LexerGrammar(
            "lexer grammar t;\n" +
            "tokens {\n" +
            "  C,\n" +
            "  D" +
            "}\n" +
            "A : 'a';\n" +
            "C : 'c' ;");
        g.tool.process(g, {} as IToolParameters, false);

        const rules = ["A", "C"];
        const tokenNames = ["A", "C", "D"];
        checkSymbols(g, rules, tokenNames);
    });

    it("testCombinedGrammarLiterals", () => {
        const g = new Grammar(
            "grammar t;\n" +
            "a : 'begin' b 'end';\n" +
            "b : C ';' ;\n" +
            "ID : 'a' ;\n" +
            "FOO : 'foo' ;\n" + // "foo" is not a token name
            "C : 'c' ;\n"); // nor is 'c'
        g.tool.process(g, {} as IToolParameters, false);

        const rules = ["a", "b"];
        const tokenNames = ["C", "FOO", "ID", "'begin'", "'end'", "';'"];
        checkSymbols(g, rules, tokenNames);
    });

    it("testLiteralInParserAndLexer", () => {
        // 'x' is token and char in lexer rule
        const g = new Grammar(
            "grammar t;\n" +
            "a : 'x' E ; \n" +
            "E: 'x' '0' ;\n");
        g.tool.process(g, {} as IToolParameters, false);

        const literals = "['x']";
        let foundLiterals = convertArrayToString([...g.stringLiteralToTypeMap.keys()]);
        expect(foundLiterals).toBe(literals);

        foundLiterals = convertArrayToString([...g.implicitLexer!.stringLiteralToTypeMap.keys()]);
        expect(foundLiterals).toBe("['x']"); // pushed in lexer from parser

        const typeToTokenName = g.getTokenDisplayNames();
        const tokens = new Set<string>();
        for (const t of typeToTokenName) {
            if (t !== null) {
                tokens.add(t);
            }
        }

        expect(convertArrayToString([...tokens])).toBe("[<INVALID>, 'x', E]");
    });

    it("testPredDoesNotHideNameToLiteralMapInLexer", () => {
        // 'x' is token and char in lexer rule
        const g = new Grammar(
            "grammar t;\n" +
            "a : 'x' X ; \n" +
            "X: 'x' {true}?;\n"); // must match as alias even with pred
        g.tool.process(g, {} as IToolParameters, false);

        expect(convertMapToString(g.stringLiteralToTypeMap)).toBe("{'x'=1}");
        expect(convertMapToString(g.tokenNameToTypeMap)).toBe("{EOF=-1, X=1}");

        // pushed in lexer from parser
        expect(convertMapToString(g.implicitLexer!.stringLiteralToTypeMap)).toBe("{'x'=1}");
        expect(convertMapToString(g.implicitLexer!.tokenNameToTypeMap)).toBe("{EOF=-1, X=1}");
    });

    it("testCombinedGrammarWithRefToLiteralButNoTokenIDRef", () => {
        const g = new Grammar(
            "grammar t;\n" +
            "a : 'a' ;\n" +
            "A : 'a' ;\n");
        g.tool.process(g, {} as IToolParameters, false);

        const rules = ["a"];
        const tokenNames = ["A", "'a'"];
        checkSymbols(g, rules, tokenNames);
    });

    it("testSetDoesNotMissTokenAliases", () => {
        const g = new Grammar(
            "grammar t;\n" +
            "a : 'a'|'b' ;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n");
        g.tool.process(g, {} as IToolParameters, false);

        const rules = ["a"];
        const tokenNames = ["A", "'a'", "B", "'b'"];
        checkSymbols(g, rules, tokenNames);
    });

    // T E S T  L I T E R A L  E S C A P E S

    it("testParserCharLiteralWithEscape", () => {
        const g = new Grammar(
            "grammar t;\n" +
            "a : '\\n';\n");
        g.tool.process(g, {} as IToolParameters, false);

        const literals = g.stringLiteralToTypeMap.keys();

        // must store literals how they appear in the antlr grammar
        expect([...literals][0]).toBe("'\\n'");
    });

    it("testParserCharLiteralWithBasicUnicodeEscape", () => {
        const g = new Grammar(
            "grammar t;\n" +
            "a : '\\uABCD';\n");
        g.tool.process(g, {} as IToolParameters, false);

        const literals = g.stringLiteralToTypeMap.keys();

        // must store literals how they appear in the antlr grammar
        expect([...literals][0]).toBe("'\\uABCD'");
    });

    it("testParserCharLiteralWithExtendedUnicodeEscape", () => {
        const g = new Grammar(
            "grammar t;\n" +
            "a : '\\u{1ABCD}';\n");
        g.tool.process(g, {} as IToolParameters, false);

        const literals = g.stringLiteralToTypeMap.keys();

        // must store literals how they appear in the antlr grammar
        expect([...literals][0]).toBe("'\\u{1ABCD}'");
    });

});
