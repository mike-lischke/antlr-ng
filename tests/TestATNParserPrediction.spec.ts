/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

/* eslint-disable jsdoc/require-param */

// cspell: ignore ifstat blort

import { describe, expect, it } from "vitest";

import { DFA, Lexer, LexerATNSimulator, ParserRuleContext, PredictionContextCache } from "antlr4ng";

import type { IToolParameters } from "../src/tool-parameters.js";
import { Grammar, LexerGrammar } from "../src/tool/index.js";
import { LeftRecursiveRule } from "../src/tool/LeftRecursiveRule.js";
import { MockIntTokenStream } from "./MockIntTokenStream.js";
import { ParserInterpreterForTesting } from "./ParserInterpreterForTesting.js";
import { ToolTestUtils } from "./ToolTestUtils.js";

describe("TestATNParserPrediction", () => {
    /** first check that the ATN predicts right alt. Then check adaptive prediction. */
    const checkPredictedAlt = (lg: LexerGrammar, g: Grammar, decision: number,
        inputString: string, expectedAlt: number): void => {
        const lexATN = ToolTestUtils.createATN(lg, true);
        const lexInterp = new LexerATNSimulator(null, lexATN, [new DFA(lexATN.modeToStartState[Lexer.DEFAULT_MODE])],
            new PredictionContextCache());
        const types = ToolTestUtils.getTokenTypesViaATN(inputString, lexInterp);

        ToolTestUtils.semanticProcess(lg);
        g.importVocab(lg);
        ToolTestUtils.semanticProcess(g);

        // Check ATN prediction
        const input = new MockIntTokenStream(types);
        const interp = new ParserInterpreterForTesting(g, input);
        let alt = interp.adaptivePredict(input, decision, ParserRuleContext.empty);

        expect(alt).toBe(expectedAlt);

        // Check adaptive prediction
        input.seek(0);
        alt = interp.adaptivePredict(input, decision, null);
        expect(alt).toBe(expectedAlt);

        // run 2x; first time creates DFA in atn
        input.seek(0);
        alt = interp.adaptivePredict(input, decision, null);
        expect(alt).toBe(expectedAlt);
    };

    const checkDFAConstruction = (lg: LexerGrammar, g: Grammar, decision: number,
        inputString: string[], dfaString: string[]): void => {
        const lexATN = ToolTestUtils.createATN(lg, true);
        const lexInterp = new LexerATNSimulator(null, lexATN, [new DFA(lexATN.getDecisionState(Lexer.DEFAULT_MODE))],
            new PredictionContextCache());

        ToolTestUtils.semanticProcess(lg);
        g.importVocab(lg);
        ToolTestUtils.semanticProcess(g);

        const interp = new ParserInterpreterForTesting(g, null);
        for (let i = 0; i < inputString.length; i++) {
            // Check DFA
            const types = ToolTestUtils.getTokenTypesViaATN(inputString[i], lexInterp);
            const input = new MockIntTokenStream(types);
            interp.adaptivePredict(input, decision, ParserRuleContext.empty);
            const dfa = interp.parser.decisionToDFA[decision];
            expect(dfa.toString(g.getVocabulary())).toBe(dfaString[i]);
        }
    };

    it("testAorB", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A{;} | B ;");
        g.tool.process(g, {} as IToolParameters, false);

        const decision = 0;
        checkPredictedAlt(lg, g, decision, "a", 1);
        checkPredictedAlt(lg, g, decision, "b", 2);

        // After matching these inputs for decision, what is DFA after each prediction?
        const inputs = [
            "a",
            "b",
            "a"
        ];

        const dfa = [
            "s0-'a'->:s1=>1\n",

            "s0-'a'->:s1=>1\n" +
            "s0-'b'->:s2=>2\n",

            "s0-'a'->:s1=>1\n" + // don't change after it works
            "s0-'b'->:s2=>2\n",
        ];
        checkDFAConstruction(lg, g, decision, inputs, dfa);
    });

    it("testEmptyInput", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A | ;");
        g.tool.process(g, {} as IToolParameters, false);

        const decision = 0;
        checkPredictedAlt(lg, g, decision, "a", 1);
        checkPredictedAlt(lg, g, decision, "", 2);

        // After matching these inputs for decision, what is DFA after each prediction?
        const inputs = [
            "a",
            "",
        ];
        const dfa = [
            "s0-'a'->:s1=>1\n",

            "s0-EOF->:s2=>2\n" +
            "s0-'a'->:s1=>1\n",
        ];
        checkDFAConstruction(lg, g, decision, inputs, dfa);
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

        checkPredictedAlt(lg, g, 0, "a", 1);
        checkPredictedAlt(lg, g, 0, "ab", 2);
        checkPredictedAlt(lg, g, 0, "abc", 2);

        const inputs = [
            "a",
            "ab",
            "abc"
        ];
        const dfa = [
            "s0-'a'->s1\n" +
            "s1-EOF->:s2=>1\n",

            "s0-'a'->s1\n" +
            "s1-EOF->:s2=>1\n" +
            "s1-'b'->:s3=>2\n",

            "s0-'a'->s1\n" +
            "s1-EOF->:s2=>1\n" +
            "s1-'b'->:s3=>2\n"
        ];
        checkDFAConstruction(lg, g, 0, inputs, dfa);
    });

    it("testRuleRefXorY", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : x | y ;\n" +
            "x : A ;\n" +
            "y : B ;\n");
        g.tool.process(g, {} as IToolParameters, false);

        const decision = 0;
        checkPredictedAlt(lg, g, decision, "a", 1);
        checkPredictedAlt(lg, g, decision, "b", 2);

        // After matching these inputs for decision, what is DFA after each prediction?
        const inputs = [
            "a",
            "b",
            "a"
        ];
        const dfa = [
            "s0-'a'->:s1=>1\n",

            "s0-'a'->:s1=>1\n" +
            "s0-'b'->:s2=>2\n",

            "s0-'a'->:s1=>1\n" + // don't change after it works
            "s0-'b'->:s2=>2\n",
        ];
        checkDFAConstruction(lg, g, decision, inputs, dfa);
    });

    it("testOptionalRuleChasesGlobalFollow", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "tokens {A,B,C}\n" +
            "a : x B ;\n" +
            "b : x C ;\n" +
            "x : A | ;\n");
        g.tool.process(g, {} as IToolParameters, false);

        const decision = 0;
        checkPredictedAlt(lg, g, decision, "a", 1);
        checkPredictedAlt(lg, g, decision, "b", 2);
        checkPredictedAlt(lg, g, decision, "c", 2);

        // After matching these inputs for decision, what is DFA after each prediction?
        const inputs = [
            "a",
            "b",
            "c",
            "c",
        ];
        const dfa = [
            "s0-'a'->:s1=>1\n",

            "s0-'a'->:s1=>1\n" +
            "s0-'b'->:s2=>2\n",

            "s0-'a'->:s1=>1\n" +
            "s0-'b'->:s2=>2\n" +
            "s0-'c'->:s3=>2\n",

            "s0-'a'->:s1=>1\n" +
            "s0-'b'->:s2=>2\n" +
            "s0-'c'->:s3=>2\n",
        ];
        checkDFAConstruction(lg, g, decision, inputs, dfa);
    });

    it("testLL1Ambig", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A | A | A B ;");
        g.tool.process(g, {} as IToolParameters, false);

        const decision = 0;
        checkPredictedAlt(lg, g, decision, "a", 1);
        checkPredictedAlt(lg, g, decision, "ab", 3);

        // After matching these inputs for decision, what is DFA after each prediction?
        const inputs = [
            "a",
            "ab",
            "ab"
        ];
        const dfa = [
            "s0-'a'->s1\n" +
            "s1-EOF->:s2^=>1\n",

            "s0-'a'->s1\n" +
            "s1-EOF->:s2^=>1\n" +
            "s1-'b'->:s3=>3\n",

            "s0-'a'->s1\n" +
            "s1-EOF->:s2^=>1\n" +
            "s1-'b'->:s3=>3\n",
        ];
        checkDFAConstruction(lg, g, decision, inputs, dfa);
    });

    it("testLL2Ambig", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "a : A B | A B | A B C ;");
        g.tool.process(g, {} as IToolParameters, false);

        const decision = 0;
        checkPredictedAlt(lg, g, decision, "ab", 1);
        checkPredictedAlt(lg, g, decision, "abc", 3);

        // After matching these inputs for decision, what is DFA after each prediction?
        const inputs = [
            "ab",
            "abc",
            "ab"
        ];
        const dfa = [
            "s0-'a'->s1\n" +
            "s1-'b'->s2\n" +
            "s2-EOF->:s3^=>1\n",

            "s0-'a'->s1\n" +
            "s1-'b'->s2\n" +
            "s2-EOF->:s3^=>1\n" +
            "s2-'c'->:s4=>3\n",

            "s0-'a'->s1\n" +
            "s1-'b'->s2\n" +
            "s2-EOF->:s3^=>1\n" +
            "s2-'c'->:s4=>3\n",
        ];
        checkDFAConstruction(lg, g, decision, inputs, dfa);
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

        const decision = 0;
        checkPredictedAlt(lg, g, decision, "34b", 1);
        checkPredictedAlt(lg, g, decision, "34c", 2);
        checkPredictedAlt(lg, g, decision, "((34))b", 1);
        checkPredictedAlt(lg, g, decision, "((34))c", 2);

        // After matching these inputs for decision, what is DFA after each prediction?
        const inputs = [
            "34b",
            "34c",
            "((34))b",
            "((34))c"
        ];
        const dfa = [
            "s0-INT->s1\n" +
            "s1-'b'->:s2=>1\n",

            "s0-INT->s1\n" +
            "s1-'b'->:s2=>1\n" +
            "s1-'c'->:s3=>2\n",

            "s0-'('->s4\n" +
            "s0-INT->s1\n" +
            "s1-'b'->:s2=>1\n" +
            "s1-'c'->:s3=>2\n" +
            "s4-'('->s5\n" +
            "s5-INT->s6\n" +
            "s6-')'->s7\n" +
            "s7-')'->s1\n",

            "s0-'('->s4\n" +
            "s0-INT->s1\n" +
            "s1-'b'->:s2=>1\n" +
            "s1-'c'->:s3=>2\n" +
            "s4-'('->s5\n" +
            "s5-INT->s6\n" +
            "s6-')'->s7\n" +
            "s7-')'->s1\n",
        ];
        checkDFAConstruction(lg, g, decision, inputs, dfa);
    });

    it("testRecursiveLeftPrefixWithAorABIssue", (): void => {
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
            "a : e A | e A B ;\n" +
            "e : LP e RP\n" +
            "  | INT\n" +
            "  ;");
        g.tool.process(g, {} as IToolParameters, false);

        const decision = 0;
        checkPredictedAlt(lg, g, decision, "34a", 1);
        checkPredictedAlt(lg, g, decision, "34ab", 2); // PEG would miss this one!
        checkPredictedAlt(lg, g, decision, "((34))a", 1);
        checkPredictedAlt(lg, g, decision, "((34))ab", 2);

        // After matching these inputs for decision, what is DFA after each prediction?
        const inputs = [
            "34a",
            "34ab",
            "((34))a",
            "((34))ab",
        ];
        const dfa = [
            "s0-INT->s1\n" +
            "s1-'a'->s2\n" +
            "s2-EOF->:s3=>1\n",

            "s0-INT->s1\n" +
            "s1-'a'->s2\n" +
            "s2-EOF->:s3=>1\n" +
            "s2-'b'->:s4=>2\n",

            "s0-'('->s5\n" +
            "s0-INT->s1\n" +
            "s1-'a'->s2\n" +
            "s2-EOF->:s3=>1\n" +
            "s2-'b'->:s4=>2\n" +
            "s5-'('->s6\n" +
            "s6-INT->s7\n" +
            "s7-')'->s8\n" +
            "s8-')'->s1\n",

            "s0-'('->s5\n" +
            "s0-INT->s1\n" +
            "s1-'a'->s2\n" +
            "s2-EOF->:s3=>1\n" +
            "s2-'b'->:s4=>2\n" +
            "s5-'('->s6\n" +
            "s6-INT->s7\n" +
            "s7-')'->s8\n" +
            "s8-')'->s1\n",
        ];
        checkDFAConstruction(lg, g, decision, inputs, dfa);
    });

    it("testContinuePrediction", (): void => {
        // Sam found prev def of ambiguity was too restrictive.
        // E.g., (13, 1, []), (13, 2, []), (12, 2, []) should not
        // be declared ambig since (12, 2, []) can take us to
        // unambiguous state maybe. keep going.
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : 'a'..'z' ;\n" + // one char
            "SEMI : ';' ;\n" +
            "INT : '0'..'9'+ ;\n"
        );
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "tokens {ID,SEMI,INT}\n" +
            "a : (ID | ID ID?) SEMI ;");
        g.tool.process(g, {} as IToolParameters, false);

        const decision = 1;
        checkPredictedAlt(lg, g, decision, "a;", 1);
        checkPredictedAlt(lg, g, decision, "ab;", 2);
    });

    it("testContinuePrediction2", (): void => {
        // ID is ambig for first two alts, but ID SEMI lets us move forward with alt 3
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : 'a'..'z' ;\n" + // one char
            "SEMI : ';' ;\n" +
            "INT : '0'..'9'+ ;\n"
        );
        lg.tool.process(lg, {} as IToolParameters, false);

        const g = new Grammar(
            "parser grammar T;\n" +
            "tokens {ID,SEMI,INT}\n" +
            "a : ID | ID | ID SEMI ;\n");
        g.tool.process(g, {} as IToolParameters, false);

        const decision = 0;
        checkPredictedAlt(lg, g, decision, "a", 1);
        checkPredictedAlt(lg, g, decision, "a;", 3);
    });

    it("testAltsForLRRuleComputation", (): void => {
        const g = new Grammar(
            "grammar T;\n" +
            "e : e '*' e\n" +
            "  | INT\n" +
            "  | e '+' e\n" +
            "  | ID\n" +
            "  ;\n" +
            "ID : [a-z]+ ;\n" +
            "INT : [0-9]+ ;\n" +
            "WS : [ \\r\\t\\n]+ ;");
        g.tool.process(g, {} as IToolParameters, false);

        const e = g.getRule("e");
        expect(e instanceof LeftRecursiveRule).toBe(true);

        const lr = e as LeftRecursiveRule;
        expect(lr.getPrimaryAlts().join(", ")).toBe("0, 2, 4");
        expect(lr.getRecursiveOpAlts().join(", ")).toBe("0, 1, 3");
    });

    it("testAltsForLRRuleComputation2", (): void => {
        const g = new Grammar(
            "grammar T;\n" +
            "e : INT\n" +
            "  | e '*' e\n" +
            "  | ID\n" +
            "  ;\n" +
            "ID : [a-z]+ ;\n" +
            "INT : [0-9]+ ;\n" +
            "WS : [ \\r\\t\\n]+ ;");
        g.tool.process(g, {} as IToolParameters, false);

        const e = g.getRule("e");
        expect(e instanceof LeftRecursiveRule).toBe(true);

        const lr = e as LeftRecursiveRule;
        expect(lr.getPrimaryAlts().join(", ")).toBe("0, 1, 3");
        expect(lr.getRecursiveOpAlts().join(", ")).toBe("0, 2");
    });

    it("testAltsForLRRuleComputation3", (): void => {
        const g = new Grammar(
            "grammar T;\n" +
            "random : 'blort';\n" + // should have no effect
            "e : '--' e\n" +
            "  | e '*' e\n" +
            "  | e '+' e\n" +
            "  | e '--'\n" +
            "  | ID\n" +
            "  ;\n" +
            "ID : [a-z]+ ;\n" +
            "INT : [0-9]+ ;\n" +
            "WS : [ \\r\\t\\n]+ ;");
        g.tool.process(g, {} as IToolParameters, false);

        const e = g.getRule("e");
        expect(e instanceof LeftRecursiveRule).toBe(true);

        const lr = e as LeftRecursiveRule;
        expect(lr.getPrimaryAlts().join(", ")).toBe("0, 1, 5");
        expect(lr.getRecursiveOpAlts().join(", ")).toBe("0, 2, 3, 4");
    });

});
