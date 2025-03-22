/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

// cspell: ignore MULT

import { describe, expect, it } from "vitest";

import { CharStream, CommonTokenStream, InterpreterRuleContext, Trees } from "antlr4ng";

import type { IToolParameters } from "../src/tool-parameters.js";
import { Grammar, LexerGrammar } from "../src/tool/index.js";

/**
 * Tests to ensure GrammarParserInterpreter subclass of ParserInterpreter
 *  hasn't messed anything up.
 */
describe("TestGrammarParserInterpreter", () => {
    const lexerGrammar = (() => {
        const lg = new LexerGrammar("lexer grammar L;\n" +
            "PLUS : '+' ;\n" +
            "MULT : '*' ;\n" +
            "ID : [a-z]+ ;\n" +
            "INT : [0-9]+ ;\n" +
            "WS : [ \\r\\t\\n]+ ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        return lg;
    })();

    const testInterp = (g: Grammar, startRule: string, input: string,
        expectedParseTree: string): InterpreterRuleContext => {
        const lexEngine = lexerGrammar.createLexerInterpreter(CharStream.fromString(input));
        const tokens = new CommonTokenStream(lexEngine);
        const parser = g.createGrammarParserInterpreter(tokens);
        const t = parser.parse(g.rules.get(startRule)!.index);
        const treeStr = Trees.toStringTree(t, g.getRuleNames());

        expect(treeStr).toBe(expectedParseTree);

        return t as InterpreterRuleContext;
    };

    it("testAlts", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ID\n" +
            "  | INT{;}\n" +
            "  ;\n",
            lexerGrammar);
        g.tool.process(g, {} as IToolParameters, false);

        testInterp(g, "s", "a", "(s:1 a)");
        testInterp(g, "s", "3", "(s:2 3)");
    });

    it("testAltsAsSet", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ID\n" +
            "  | INT\n" +
            "  ;\n",
            lexerGrammar);
        g.tool.process(g, {} as IToolParameters, false);

        testInterp(g, "s", "a", "(s:1 a)");
        testInterp(g, "s", "3", "(s:1 3)");
    });

    it("testAltsWithLabels", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ID  # foo\n" +
            "  | INT # bar\n" +
            "  ;\n",
            lexerGrammar);
        g.tool.process(g, {} as IToolParameters, false);

        // it won't show the labels here because my simple node text provider above just shows the alternative
        testInterp(g, "s", "a", "(s:1 a)");
        testInterp(g, "s", "3", "(s:2 3)");
    });

    it("testOneAlt", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ID\n" +
            "  ;\n",
            lexerGrammar);
        g.tool.process(g, {} as IToolParameters, false);

        testInterp(g, "s", "a", "(s:1 a)");
    });

    it("testLeftRecursionWithMultiplePrimaryAndRecursiveOps", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : e EOF ;\n" +
            "e : e MULT e\n" +
            "  | e PLUS e\n" +
            "  | INT\n" +
            "  | ID\n" +
            "  ;\n",
            lexerGrammar);
        g.tool.process(g, {} as IToolParameters, false);

        testInterp(g, "s", "a", "(s:1 (e:4 a) <EOF>)");
        testInterp(g, "e", "a", "(e:4 a)");
        testInterp(g, "e", "34", "(e:3 34)");
        testInterp(g, "e", "a+1", "(e:2 (e:4 a) + (e:3 1))");
        testInterp(g, "e", "1+2*a", "(e:2 (e:3 1) + (e:1 (e:3 2) * (e:4 a)))");
    });

});
