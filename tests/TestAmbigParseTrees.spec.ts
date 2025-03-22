/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    BasicBlockStartState, CharStream, CommonTokenStream, DecisionState, PredictionMode, Trees
} from "antlr4ng";

import type { IToolParameters } from "../src/tool-parameters.js";
import { GrammarParserInterpreter } from "../src/tool/GrammarParserInterpreter.js";
import { Grammar, LexerGrammar } from "../src/tool/index.js";

const dummyParameters: IToolParameters = {
    grammarFiles: [],
    outputDirectory: "",
};

describe("TestAmbigParseTrees", () => {
    const testInterpAtSpecificAlt = (lg: LexerGrammar, g: Grammar, startRule: string, startAlt: number, input: string,
        expectedParseTree: string): void => {
        const lexEngine = lg.createLexerInterpreter(CharStream.fromString(input));

        /*const ts = new BufferedTokenStream(lexEngine);
        ts.fill();
        const tt = ts.getTokens();*/

        const tokens = new CommonTokenStream(lexEngine);
        const parser = g.createGrammarParserInterpreter(tokens);
        const ruleStartState = g.atn!.ruleToStartState[g.getRule(startRule)!.index];
        const tr = ruleStartState!.transitions[0];
        const t2 = tr.target;
        if (!(t2 instanceof BasicBlockStartState)) {
            throw new Error("rule has no decision: " + startRule);
        }

        parser.addDecisionOverride((t2 as DecisionState).decision, 0, startAlt);
        const t = parser.parse(g.rules.get(startRule)!.index);

        expect(Trees.toStringTree(t, g.getRuleNames())).toBe(expectedParseTree);
    };

    const testAmbiguousTrees = (lg: LexerGrammar, g: Grammar, startRule: string, input: string, decision: number,
        expectedAmbigAlts: string, overallTree: string, expectedParseTrees: string[]): void => {
        const ruleNames = g.getRuleNames();

        const lexEngine = lg.createLexerInterpreter(CharStream.fromString(input));
        const tokens = new CommonTokenStream(lexEngine);
        const parser = g.createGrammarParserInterpreter(tokens);
        parser.setProfile(true);
        parser.interpreter.predictionMode = PredictionMode.LL_EXACT_AMBIG_DETECTION;

        // PARSE
        const ruleIndex = g.rules.get(startRule)!.index;
        const parseTree = parser.parse(ruleIndex);
        expect(Trees.toStringTree(parseTree, ruleNames)).toBe(overallTree);

        const decisionInfo = parser.getParseInfo()!.getDecisionInfo();
        const ambiguities = decisionInfo[decision].ambiguities;
        expect(ambiguities).toHaveLength(1);

        const ambiguityInfo = ambiguities[0];
        const ambiguousParseTrees = GrammarParserInterpreter.getAllPossibleParseTrees(g, parser, tokens, decision,
            ambiguityInfo.ambigAlts!, ambiguityInfo.startIndex, ambiguityInfo.stopIndex, ruleIndex);
        expect(ambiguityInfo.ambigAlts!.toString()).toBe(expectedAmbigAlts);
        expect(ambiguousParseTrees.length).toBe(ambiguityInfo.ambigAlts!.length);

        for (let i = 0; i < ambiguousParseTrees.length; i++) {
            const t = ambiguousParseTrees[i];
            expect(Trees.toStringTree(t, ruleNames)).toBe(expectedParseTrees[i]);
        }
    };

    it("testParseDecisionWithinAmbiguousStartRule", () => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, dummyParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "s : A x C" +
            "  | A B C" +
            "  ;" +
            "x : B ; \n",
            lg);
        g.tool.process(g, dummyParameters, false);

        testInterpAtSpecificAlt(lg, g, "s", 1, "abc", "(s:1 a (x:1 b) c)");
        testInterpAtSpecificAlt(lg, g, "s", 2, "abc", "(s:2 a b c)");
    });

    it("testAmbigAltsAtRoot", () => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, dummyParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "s : A x C" +
            "  | A B C" +
            "  ;" +
            "x : B ; \n",
            lg);
        g.tool.process(g, dummyParameters, false);

        const startRule = "s";
        const input = "abc";
        const expectedAmbigAlts = "{1, 2}";
        const decision = 0;
        const expectedOverallTree = "(s:1 a (x:1 b) c)";
        const expectedParseTrees = ["(s:1 a (x:1 b) c)",
            "(s:2 a b c)"];

        testAmbiguousTrees(lg, g, startRule, input, decision,
            expectedAmbigAlts,
            expectedOverallTree, expectedParseTrees);
    });

    it("testAmbigAltsNotAtRoot", () => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, dummyParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "s : x ;" +
            "x : y ;" +
            "y : A z C" +
            "  | A B C" +
            "  ;" +
            "z : B ; \n",
            lg);
        g.tool.process(g, dummyParameters, false);

        const startRule = "s";
        const input = "abc";
        const expectedAmbigAlts = "{1, 2}";
        const decision = 0;
        const expectedOverallTree = "(s:1 (x:1 (y:1 a (z:1 b) c)))";
        const expectedParseTrees = ["(y:1 a (z:1 b) c)",
            "(y:2 a b c)"];

        testAmbiguousTrees(lg, g, startRule, input, decision,
            expectedAmbigAlts,
            expectedOverallTree, expectedParseTrees);
    });

    it("testAmbigAltDipsIntoOuterContextToRoot", () => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "SELF : 'self' ;\n" +
            "ID : [a-z]+ ;\n" +
            "DOT : '.' ;\n");
        lg.tool.process(lg, dummyParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "e : p (DOT ID)* ;\n" +
            "p : SELF" +
            "  | SELF DOT ID" +
            "  ;",
            lg);
        g.tool.process(g, dummyParameters, false);

        const startRule = "e";
        const input = "self.x";
        const expectedAmbigAlts = "{1, 2}";
        const decision = 1; // decision in p
        const expectedOverallTree = "(e:1 (p:1 self) . x)";
        const expectedParseTrees = ["(e:1 (p:1 self) . x)",
            "(p:2 self . x)"];

        testAmbiguousTrees(lg, g, startRule, input, decision,
            expectedAmbigAlts,
            expectedOverallTree, expectedParseTrees);
    });

    it("testAmbigAltDipsIntoOuterContextBelowRoot", () => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "SELF : 'self' ;\n" +
            "ID : [a-z]+ ;\n" +
            "DOT : '.' ;\n");
        lg.tool.process(lg, dummyParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "s : e ;\n" +
            "e : p (DOT ID)* ;\n" +
            "p : SELF" +
            "  | SELF DOT ID" +
            "  ;",
            lg);
        g.tool.process(g, dummyParameters, false);

        const startRule = "s";
        const input = "self.x";
        const expectedAmbigAlts = "{1, 2}";
        const decision = 1; // decision in p
        const expectedOverallTree = "(s:1 (e:1 (p:1 self) . x))";
        const expectedParseTrees = ["(e:1 (p:1 self) . x)", // shouldn't include s
            "(p:2 self . x)"]; // shouldn't include e

        testAmbiguousTrees(lg, g, startRule, input, decision,
            expectedAmbigAlts,
            expectedOverallTree, expectedParseTrees);
    });

    it("testAmbigAltInLeftRecursiveBelowStartRule", () => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "SELF : 'self' ;\n" +
            "ID : [a-z]+ ;\n" +
            "DOT : '.' ;\n");
        lg.tool.process(lg, dummyParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "s : e ;\n" +
            "e : p | e DOT ID ;\n" +
            "p : SELF" +
            "  | SELF DOT ID" +
            "  ;",
            lg);
        g.tool.process(g, dummyParameters, false);

        const startRule = "s";
        const input = "self.x";
        const expectedAmbigAlts = "{1, 2}";
        const decision = 1; // decision in p
        const expectedOverallTree = "(s:1 (e:2 (e:1 (p:1 self)) . x))";
        const expectedParseTrees = ["(e:2 (e:1 (p:1 self)) . x)",
            "(p:2 self . x)"];

        testAmbiguousTrees(lg, g, startRule, input, decision,
            expectedAmbigAlts,
            expectedOverallTree, expectedParseTrees);
    });

    it("testAmbigAltInLeftRecursiveStartRule", () => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "SELF : 'self' ;\n" +
            "ID : [a-z]+ ;\n" +
            "DOT : '.' ;\n");
        lg.tool.process(lg, dummyParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "e : p | e DOT ID ;\n" +
            "p : SELF" +
            "  | SELF DOT ID" +
            "  ;",
            lg);
        g.tool.process(g, dummyParameters, false);

        const startRule = "e";
        const input = "self.x";
        const expectedAmbigAlts = "{1, 2}";
        const decision = 1; // decision in p
        const expectedOverallTree = "(e:2 (e:1 (p:1 self)) . x)";
        const expectedParseTrees = ["(e:2 (e:1 (p:1 self)) . x)",
            "(p:2 self . x)"]; // shows just enough for self.x

        testAmbiguousTrees(lg, g, startRule, input, decision,
            expectedAmbigAlts,
            expectedOverallTree, expectedParseTrees);
    });
});
