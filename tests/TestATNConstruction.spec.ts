/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { ATNState } from "antlr4ng";

import { ATNPrinter } from "../src/automata/ATNPrinter.js";
import { LexerATNFactory } from "../src/automata/LexerATNFactory.js";
import { ANTLRv4Parser } from "../src/generated/ANTLRv4Parser.js";
import { convertMapToString } from "../src/support/helpers.js";
import type { IToolParameters } from "../src/tool-parameters.js";
import { LexerGrammar } from "../src/tool/LexerGrammar.js";
import type { GrammarAST } from "../src/tool/ast/GrammarAST.js";
import type { RuleAST } from "../src/tool/ast/RuleAST.js";
import { Grammar, Tool } from "../src/tool/index.js";
import { ErrorQueue } from "./support/ErrorQueue.js";

describe("TestATNConstruction", () => {
    const checkRuleATN = (g: Grammar, ruleName: string, expecting: string): void => {
        g.tool.process(g, {} as IToolParameters, false);

        const r = g.getRule(ruleName)!;
        const startState = g.getATN().ruleToStartState[r.index];
        const serializer = new ATNPrinter(g, startState!);
        const result = serializer.asString();

        expect(result).toBe(expecting);
    };

    const checkTokensRule = (g: LexerGrammar, modeName: string, expecting: string): void => {
        g.tool.process(g, {} as IToolParameters, false);

        if (!modeName) {
            modeName = "DEFAULT_MODE";
        }

        if (!g.modes.get(modeName)) {
            console.error("no such mode " + modeName);

            return;
        }

        const f = new LexerATNFactory(g);
        const nfa = f.createATN();
        const startState = nfa.modeNameToStartState.get(modeName);
        const serializer = new ATNPrinter(g, startState!);
        const result = serializer.asString();

        expect(result).toBe(expecting);
    };

    it("testA", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : A;");

        const expecting =
            "RuleStart_a_0->s2\n" +
            "s2-A->s3\n" +
            "s3->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s4\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAB", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : A B ;");

        const expecting =
            "RuleStart_a_0->s2\n" +
            "s2-A->s3\n" +
            "s3-B->s4\n" +
            "s4->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s5\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAorB", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : A | B {;} ;");

        const expecting =
            "RuleStart_a_0->BlockStart_5\n" +
            "BlockStart_5->s2\n" +
            "BlockStart_5->s3\n" +
            "s2-A->BlockEnd_6\n" +
            "s3-B->s4\n" +
            "BlockEnd_6->RuleStop_a_1\n" +
            "s4-action_0:-1->BlockEnd_6\n" +
            "RuleStop_a_1-EOF->s7\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testSetAorB", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : A | B ;");

        const expecting =
            "RuleStart_a_0->s2\n" +
            "s2-{A, B}->s3\n" +
            "s3->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s4\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testLexerIsNotSetMultiCharString", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : ('0x' | '0X') ;");

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->BlockStart_7\n" +
            "BlockStart_7->s3\n" +
            "BlockStart_7->s5\n" +
            "s3-'0'->s4\n" +
            "s5-'0'->s6\n" +
            "s4-'x'->BlockEnd_8\n" +
            "s6-'X'->BlockEnd_8\n" +
            "BlockEnd_8->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testRange", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : 'a'..'c' ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-'a'..'c'->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSet", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [abc] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-{97..99}->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSetRange", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [a-c] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-{97..99}->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSetUnicodeBMPEscape", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [\\uABCD] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-43981->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSetUnicodeBMPEscapeRange", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [a-c\\uABCD-\\uABFF] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-{97..99, 43981..44031}->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSetUnicodeSMPEscape", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [\\u{10ABCD}] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-1092557->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSetUnicodeSMPEscapeRange", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [a-c\\u{10ABCD}-\\u{10ABFF}] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-{97..99, 1092557..1092607}->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSetUnicodePropertyEscape", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [\\p{Gothic}] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-{66352..66383}->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSetUnicodePropertyInvertEscape", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [\\P{Gothic}] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-{0..66351, 66384..1114111}->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSetUnicodeMultiplePropertyEscape", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [\\p{Gothic}\\p{Mahajani}] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-{66352..66383, 69968..70015}->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testCharSetUnicodePropertyOverlap", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : [\\p{ASCII_Hex_Digit}\\p{Hex_Digit}] ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->s3\n" +
            "s3-{48..57, 65..70, 97..102, 65296..65305, 65313..65318, 65345..65350}->s4\n" +
            "s4->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testRangeOrRange", (): void => {
        const g = new LexerGrammar(
            "lexer grammar P;\n" +
            "A : ('a'..'c' 'h' | 'q' 'j'..'l') ;"
        );

        const expecting =
            "s0->RuleStart_A_1\n" +
            "RuleStart_A_1->BlockStart_7\n" +
            "BlockStart_7->s3\n" +
            "BlockStart_7->s5\n" +
            "s3-'a'..'c'->s4\n" +
            "s5-'q'->s6\n" +
            "s4-'h'->BlockEnd_8\n" +
            "s6-'j'..'l'->BlockEnd_8\n" +
            "BlockEnd_8->RuleStop_A_2\n";
        checkTokensRule(g, "", expecting);
    });

    it("testStringLiteralInParser", (): void => {
        const g = new Grammar(
            "grammar P;\n" +
            "a : A|'b' ;"
        );

        const expecting =
            "RuleStart_a_0->s2\n" +
            "s2-{'b', A}->s3\n" +
            "s3->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s4\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testABorCD", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : A B | C D;");

        const expecting =
            "RuleStart_a_0->BlockStart_6\n" +
            "BlockStart_6->s2\n" +
            "BlockStart_6->s4\n" +
            "s2-A->s3\n" +
            "s4-C->s5\n" +
            "s3-B->BlockEnd_7\n" +
            "s5-D->BlockEnd_7\n" +
            "BlockEnd_7->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s8\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testBA", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : b A ;\n" +
            "b : B ;");
        let expecting =
            "RuleStart_a_0->s4\n" +
            "s4-b->RuleStart_b_2\n" +
            "s5-A->s6\n" +
            "s6->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s9\n";
        checkRuleATN(g, "a", expecting);
        expecting =
            "RuleStart_b_2->s7\n" +
            "s7-B->s8\n" +
            "s8->RuleStop_b_3\n" +
            "RuleStop_b_3->s5\n";
        checkRuleATN(g, "b", expecting);
    });

    it("testFollow", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : b A ;\n" +
            "b : B ;\n" +
            "c : b C;");

        const expecting =
            "RuleStart_b_2->s9\n" +
            "s9-B->s10\n" +
            "s10->RuleStop_b_3\n" +
            "RuleStop_b_3->s7\n" +
            "RuleStop_b_3->s12\n";
        checkRuleATN(g, "b", expecting);
    });

    it("testAorEpsilon", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : A | ;");

        const expecting =
            "RuleStart_a_0->BlockStart_4\n" +
            "BlockStart_4->s2\n" +
            "BlockStart_4->s3\n" +
            "s2-A->BlockEnd_5\n" +
            "s3->BlockEnd_5\n" +
            "BlockEnd_5->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s6\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAOptional", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : A?;");

        const expecting =
            "RuleStart_a_0->BlockStart_3\n" +
            "BlockStart_3->s2\n" +
            "BlockStart_3->BlockEnd_4\n" +
            "s2-A->BlockEnd_4\n" +
            "BlockEnd_4->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s5\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAorBOptional", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : (A{;}|B)?;");

        const expecting =
            "RuleStart_a_0->BlockStart_5\n" +
            "BlockStart_5->s2\n" +
            "BlockStart_5->s4\n" +
            "BlockStart_5->BlockEnd_6\n" +
            "s2-A->s3\n" +
            "s4-B->BlockEnd_6\n" +
            "BlockEnd_6->RuleStop_a_1\n" +
            "s3-action_0:-1->BlockEnd_6\n" +
            "RuleStop_a_1-EOF->s7\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testSetAorBOptional", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : (A|B)?;");

        const expecting =
            "RuleStart_a_0->BlockStart_3\n" +
            "BlockStart_3->s2\n" +
            "BlockStart_3->BlockEnd_4\n" +
            "s2-{A, B}->BlockEnd_4\n" +
            "BlockEnd_4->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s5\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAorBThenC", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : (A | B) C;");

        const expecting =
            "RuleStart_a_0->s2\n" +
            "s2-{A, B}->s3\n" +
            "s3-C->s4\n" +
            "s4->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s5\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAplus", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : A+;");

        const expecting =
            "RuleStart_a_0->PlusBlockStart_3\n" +
            "PlusBlockStart_3->s2\n" +
            "s2-A->BlockEnd_4\n" +
            "BlockEnd_4->PlusLoopBack_5\n" +
            "PlusLoopBack_5->PlusBlockStart_3\n" +
            "PlusLoopBack_5->s6\n" +
            "s6->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s7\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAplusSingleAltHasPlusASTPointingAtLoopBackState", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "s : a B ;\n" + // (RULE a (BLOCK (ALT (+ (BLOCK (ALT A))))))
            "a : A+;");

        const expecting =
            "RuleStart_a_2->PlusBlockStart_8\n" +
            "PlusBlockStart_8->s7\n" +
            "s7-A->BlockEnd_9\n" +
            "BlockEnd_9->PlusLoopBack_10\n" +
            "PlusLoopBack_10->PlusBlockStart_8\n" +
            "PlusLoopBack_10->s11\n" +
            "s11->RuleStop_a_3\n" +
            "RuleStop_a_3->s5\n";
        checkRuleATN(g, "a", expecting);

        // Get all AST -> ATNState relationships. Make sure loopback is covered when no loop entry decision
        const ruleNodes = g.ast.getNodesWithType(ANTLRv4Parser.RULE);
        const a = ruleNodes[1] as RuleAST;
        const nodesInRule = a.getNodesWithType(null);
        const covered = new Map<GrammarAST, ATNState>();
        for (const node of nodesInRule) {
            if (node.atnState) {
                covered.set(node, node.atnState);
            }
        }

        expect(convertMapToString(covered)).toBe("{RULE=2, BLOCK=8, +=10, BLOCK=8, A=7}");
    });

    it("testAorBPlus", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : (A|B{;})+;");

        const expecting =
            "RuleStart_a_0->PlusBlockStart_5\n" +
            "PlusBlockStart_5->s2\n" +
            "PlusBlockStart_5->s3\n" +
            "s2-A->BlockEnd_6\n" +
            "s3-B->s4\n" +
            "BlockEnd_6->PlusLoopBack_7\n" +
            "s4-action_0:-1->BlockEnd_6\n" +
            "PlusLoopBack_7->PlusBlockStart_5\n" +
            "PlusLoopBack_7->s8\n" +
            "s8->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s9\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAorBorEmptyPlus", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : (A | B | )+ ;");

        const expecting =
            "RuleStart_a_0->PlusBlockStart_5\n" +
            "PlusBlockStart_5->s2\n" +
            "PlusBlockStart_5->s3\n" +
            "PlusBlockStart_5->s4\n" +
            "s2-A->BlockEnd_6\n" +
            "s3-B->BlockEnd_6\n" +
            "s4->BlockEnd_6\n" +
            "BlockEnd_6->PlusLoopBack_7\n" +
            "PlusLoopBack_7->PlusBlockStart_5\n" +
            "PlusLoopBack_7->s8\n" +
            "s8->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s9\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testEmptyOrEmpty", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : | ;");

        const expecting =
            "RuleStart_a_0->BlockStart_4\n" +
            "BlockStart_4->s2\n" +
            "BlockStart_4->s3\n" +
            "s2->BlockEnd_5\n" +
            "s3->BlockEnd_5\n" +
            "BlockEnd_5->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s6\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAStar", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : A*;");

        const expecting =
            "RuleStart_a_0->StarLoopEntry_5\n" +
            "StarLoopEntry_5->StarBlockStart_3\n" +
            "StarLoopEntry_5->s6\n" +
            "StarBlockStart_3->s2\n" +
            "s6->RuleStop_a_1\n" +
            "s2-A->BlockEnd_4\n" +
            "RuleStop_a_1-EOF->s8\n" +
            "BlockEnd_4->StarLoopBack_7\n" +
            "StarLoopBack_7->StarLoopEntry_5\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testNestedAStar", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : (COMMA ID*)*;");

        const expecting =
            "RuleStart_a_0->StarLoopEntry_11\n" +
            "StarLoopEntry_11->StarBlockStart_9\n" +
            "StarLoopEntry_11->s12\n" +
            "StarBlockStart_9->s2\n" +
            "s12->RuleStop_a_1\n" +
            "s2-COMMA->StarLoopEntry_6\n" +
            "RuleStop_a_1-EOF->s14\n" +
            "StarLoopEntry_6->StarBlockStart_4\n" +
            "StarLoopEntry_6->s7\n" +
            "StarBlockStart_4->s3\n" +
            "s7->BlockEnd_10\n" +
            "s3-ID->BlockEnd_5\n" +
            "BlockEnd_10->StarLoopBack_13\n" +
            "BlockEnd_5->StarLoopBack_8\n" +
            "StarLoopBack_13->StarLoopEntry_11\n" +
            "StarLoopBack_8->StarLoopEntry_6\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testAorBStar", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : (A | B{;})* ;");

        const expecting =
            "RuleStart_a_0->StarLoopEntry_7\n" +
            "StarLoopEntry_7->StarBlockStart_5\n" +
            "StarLoopEntry_7->s8\n" +
            "StarBlockStart_5->s2\n" +
            "StarBlockStart_5->s3\n" +
            "s8->RuleStop_a_1\n" +
            "s2-A->BlockEnd_6\n" +
            "s3-B->s4\n" +
            "RuleStop_a_1-EOF->s10\n" +
            "BlockEnd_6->StarLoopBack_9\n" +
            "s4-action_0:-1->BlockEnd_6\n" +
            "StarLoopBack_9->StarLoopEntry_7\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testPredicatedAorB", (): void => {
        const g = new Grammar(
            "parser grammar P;\n" +
            "a : {p1}? A | {p2}? B ;");

        const expecting =
            "RuleStart_a_0->BlockStart_6\n" +
            "BlockStart_6->s2\n" +
            "BlockStart_6->s4\n" +
            "s2-pred_0:0->s3\n" +
            "s4-pred_0:1->s5\n" +
            "s3-A->BlockEnd_7\n" +
            "s5-B->BlockEnd_7\n" +
            "BlockEnd_7->RuleStop_a_1\n" +
            "RuleStop_a_1-EOF->s8\n";
        checkRuleATN(g, "a", expecting);
    });

    it("testParserRuleRefInLexerRule", (): void => {
        const grammarString =
            "grammar U;\n" +
            "a : A;\n" +
            "A : a;\n"; // Error: parser rule referenced in lexer rule.

        const tool = new Tool();

        const errorQueue = new ErrorQueue(tool.errorManager);
        tool.errorManager.removeListeners();
        tool.errorManager.addListener(errorQueue);

        const t = tool.parseGrammarFromString(grammarString);

        expect(t).toBeUndefined();
        expect(errorQueue.size()).toBe(1);
        expect(errorQueue.errors[0].toString()).toContain("no viable alternative at input 'a'");

    });

    /**
     * Test for https://github.com/antlr/antlr4/issues/1369
     * Repeated edges:
     * ```
     * RuleStop_e_3->BlockEnd_26
     * RuleStop_e_3->BlockEnd_26
     * RuleStop_e_3->BlockEnd_26
     * ```
     */
    it("testForRepeatedTransitionsToStopState", (): void => {
        // This is a left recursive rule which is rewritten to use precedence predicates, hence the pred entries.
        const grammarString =
            "grammar T;\n" +
            "\t s : e EOF;\n" +
            "\t e :<assoc=right> e '*' e\n" +
            "\t   |<assoc=right> e '+' e\n" +
            "\t   |<assoc=right> e '?' e ':' e\n" +
            "\t   |<assoc=right> e '=' e\n" +
            "\t   | ID\n" +
            "\t   ;\n" +
            "\t ID : 'a'..'z'+ ;\n" +
            "\t WS : (' '|'\\n') -> skip ;";
        const g = new Grammar(grammarString);
        g.tool.process(g, {} as IToolParameters, false);

        const expecting =
            "RuleStart_e_2->s7\n" +
            "s7-action_1:-1->s8\n" +
            "s8-ID->s9\n" +
            "s9->StarLoopEntry_27\n" +
            "StarLoopEntry_27->StarBlockStart_25\n" +
            "StarLoopEntry_27->s28\n" +
            "StarBlockStart_25->s10\n" +
            "StarBlockStart_25->s13\n" +
            "StarBlockStart_25->s16\n" +
            "StarBlockStart_25->s22\n" +
            "s28->RuleStop_e_3\n" +
            "s10-5 >= _p->s11\n" +
            "s13-4 >= _p->s14\n" +
            "s16-3 >= _p->s17\n" +
            "s22-2 >= _p->s23\n" +
            "RuleStop_e_3->s5\n" +
            "RuleStop_e_3->BlockEnd_26\n" +
            "RuleStop_e_3->s19\n" +
            "RuleStop_e_3->s21\n" +
            "s11-'*'->s12\n" +
            "s14-'+'->s15\n" +
            "s17-'?'->s18\n" +
            "s23-'='->s24\n" +
            "s12-e->RuleStart_e_2\n" +
            "s15-e->RuleStart_e_2\n" +
            "s18-e->RuleStart_e_2\n" +
            "s24-e->RuleStart_e_2\n" +
            "BlockEnd_26->StarLoopBack_29\n" +
            "s19-':'->s20\n" +
            "StarLoopBack_29->StarLoopEntry_27\n" +
            "s20-e->RuleStart_e_2\n" +
            "s21->BlockEnd_26\n";
        checkRuleATN(g, "e", expecting);
    });

    it("testDefaultMode", (): void => {
        const g = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "X : 'x' ;\n" +
            "mode FOO;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");

        const expecting =
            "s0->RuleStart_A_2\n" +
            "s0->RuleStart_X_4\n" +
            "RuleStart_A_2->s10\n" +
            "RuleStart_X_4->s12\n" +
            "s10-'a'->s11\n" +
            "s12-'x'->s13\n" +
            "s11->RuleStop_A_3\n" +
            "s13->RuleStop_X_5\n";
        checkTokensRule(g, "DEFAULT_MODE", expecting);
    });

    it("testMode", (): void => {
        const g = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "X : 'x' ;\n" +
            "mode FOO;\n" +
            "B : 'b' ;\n" +
            "C : 'c' ;\n");

        const expecting =
            "s1->RuleStart_B_6\n" +
            "s1->RuleStart_C_8\n" +
            "RuleStart_B_6->s14\n" +
            "RuleStart_C_8->s16\n" +
            "s14-'b'->s15\n" +
            "s16-'c'->s17\n" +
            "s15->RuleStop_B_7\n" +
            "s17->RuleStop_C_9\n";
        checkTokensRule(g, "FOO", expecting);
    });
});
