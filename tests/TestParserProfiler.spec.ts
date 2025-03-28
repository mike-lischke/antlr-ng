/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

// cspell: ignore MULT

import { beforeAll, describe, expect, it } from "vitest";

import { CharStream, CommonTokenStream, DecisionInfo } from "antlr4ng";

import { Grammar, LexerGrammar } from "../src/tool/index.js";
import { ToolTestUtils, xpathTestGrammar } from "./ToolTestUtils.js";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { IToolParameters } from "../src/tool-parameters.js";

describe("TestParserProfiler", () => {
    let lg: LexerGrammar;

    beforeAll(() => {
        lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "WS : [ \\r\\t\\n]+ -> channel(HIDDEN) ;\n" +
            "SEMI : ';' ;\n" +
            "DOT : '.' ;\n" +
            "ID : [a-zA-Z]+ ;\n" +
            "INT : [0-9]+ ;\n" +
            "PLUS : '+' ;\n" +
            "MULT : '*' ;\n");

        const parameters: IToolConfiguration = {
            grammarFiles: ["L.g4"],
            outputDirectory: ".",
        };
        lg.tool.process(lg, parameters, false);
    });

    const interpAndGetDecisionInfo = (lg: LexerGrammar, g: Grammar, startRule: string,
        ...input: string[]): DecisionInfo[] => {

        const lexEngine = lg.createLexerInterpreter(CharStream.fromString(""));
        const tokens = new CommonTokenStream(lexEngine);
        const parser = g.createParserInterpreter(tokens);
        parser.setProfile(true);

        for (const s of input) {
            lexEngine.reset();
            parser.reset();
            lexEngine.inputStream = CharStream.fromString(s);
            const tokens = new CommonTokenStream(lexEngine);
            parser.inputStream = tokens;
            const r = g.rules.get(startRule);
            if (!r) {
                return parser.getParseInfo()!.getDecisionInfo();
            }
            parser.parse(r.index);
        }

        return parser.getParseInfo()!.getDecisionInfo();
    };

    it("testLL1", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ';'{}\n" +
            "  | '.'\n" +
            "  ;\n",
            lg);

        const parameters: IToolConfiguration = {
            grammarFiles: ["L.g4"],
            outputDirectory: ".",
        };
        g.tool.process(g, parameters, false);

        const info = interpAndGetDecisionInfo(lg, g, "s", ";");
        expect(info.length).toBe(1);
        const expecting =
            "{decision=0, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=1, " +
            "sllATNTransitions=1, sllDFATransitions=0, llFallback=0, llLookahead=0, llATNTransitions=0}";
        expect(info[0].toString()).toBe(expecting);
    });

    it("testLL2", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ID ';'{}\n" +
            "  | ID '.'\n" +
            "  ;\n",
            lg);

        const parameters: IToolConfiguration = {
            grammarFiles: ["L.g4"],
            outputDirectory: ".",
        };
        g.tool.process(g, parameters, false);

        const info = interpAndGetDecisionInfo(lg, g, "s", "xyz;");
        expect(info.length).toBe(1);
        const expecting =
            "{decision=0, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=2, " +
            "sllATNTransitions=2, sllDFATransitions=0, llFallback=0, llLookahead=0, llATNTransitions=0}";
        expect(info[0].toString()).toBe(expecting);
    });

    it("testRepeatedLL2", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ID ';'{}\n" +
            "  | ID '.'\n" +
            "  ;\n",
            lg);

        const parameters: IToolConfiguration = {
            grammarFiles: ["L.g4"],
            outputDirectory: ".",
        };
        g.tool.process(g, parameters, false);

        const info = interpAndGetDecisionInfo(lg, g, "s", "xyz;", "abc;");
        expect(info.length).toBe(1);
        const expecting =
            "{decision=0, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=4, " +
            "sllATNTransitions=2, sllDFATransitions=2, llFallback=0, llLookahead=0, llATNTransitions=0}";
        expect(info[0].toString()).toBe(expecting);
    });

    it("test3xLL2", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ID ';'{}\n" +
            "  | ID '.'\n" +
            "  ;\n",
            lg);

        const parameters: IToolConfiguration = {
            grammarFiles: ["L.g4"],
            outputDirectory: ".",
        };
        g.tool.process(g, parameters, false);

        // The '.' vs ';' causes another ATN transition
        const info = interpAndGetDecisionInfo(lg, g, "s", "xyz;", "abc;", "z.");
        expect(info.length).toBe(1);
        const expecting =
            "{decision=0, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=6, " +
            "sllATNTransitions=3, sllDFATransitions=3, llFallback=0, llLookahead=0, llATNTransitions=0}";
        expect(info[0].toString()).toBe(expecting);
    });

    it("testOptional", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ID ('.' ID)? ';'\n" +
            "  | ID INT \n" +
            "  ;\n",
            lg);

        const parameters: IToolConfiguration = {
            grammarFiles: ["L.g4"],
            outputDirectory: ".",
        };
        g.tool.process(g, parameters, false);

        const info = interpAndGetDecisionInfo(lg, g, "s", "a.b;");
        expect(info.length).toBe(2);

        const expecting =
            "[{decision=0, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=1, " +
            "sllATNTransitions=1, sllDFATransitions=0, llFallback=0, llLookahead=0, llATNTransitions=0}, " +
            "{decision=1, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=2, " +
            "sllATNTransitions=2, sllDFATransitions=0, llFallback=0, llLookahead=0, llATNTransitions=0}]";
        expect(`[${info.join(", ")}]`).toBe(expecting);
    });

    it("test2xOptional", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : ID ('.' ID)? ';'\n" +
            "  | ID INT \n" +
            "  ;\n",
            lg);

        const parameters: IToolConfiguration = {
            grammarFiles: ["L.g4"],
            outputDirectory: ".",
        };
        g.tool.process(g, parameters, false);

        const info = interpAndGetDecisionInfo(lg, g, "s", "a.b;", "a.b;");
        expect(info.length).toBe(2);
        const expecting =
            "[{decision=0, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=2, " +
            "sllATNTransitions=1, sllDFATransitions=1, llFallback=0, llLookahead=0, llATNTransitions=0}, " +
            "{decision=1, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=4, " +
            "sllATNTransitions=2, sllDFATransitions=2, llFallback=0, llLookahead=0, llATNTransitions=0}]";
        expect(`[${info.join(", ")}]`).toBe(expecting);
    });

    it("testContextSensitivity", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "a : '.' e ID \n" +
            "  | ';' e INT ID ;\n" +
            "e : INT | ;\n",
            lg);

        const parameters: IToolConfiguration = {
            grammarFiles: [],
            outputDirectory: ".",
        };
        g.tool.process(g, parameters, false);

        const info = interpAndGetDecisionInfo(lg, g, "a", "; 1 x");
        expect(info.length).toBe(2);
        const expecting =
            "{decision=1, contextSensitivities=1, errors=0, ambiguities=0, sllLookahead=3, sllATNTransitions=2, " +
            "sllDFATransitions=0, llFallback=1, llLookahead=3, llATNTransitions=2}";
        expect(info[1].toString()).toBe(expecting);
    });

    it.skip("testSimpleLanguage", () => {
        const g = new Grammar(xpathTestGrammar);
        const input =
            "def f(x,y) { x = 3+4*1*1/5*1*1+1*1+1; y; ; }\n" +
            "def g(x,a,b,c,d,e) { return 1+2*x; }\n" +
            "def h(x) { a=3; x=0+1; return a*x; }\n";
        const info = interpAndGetDecisionInfo(g.implicitLexer!, g, "prog", input);
        const expecting =
            "[{decision=0, contextSensitivities=1, errors=0, ambiguities=0, sllLookahead=3, " +
            "sllATNTransitions=2, sllDFATransitions=0, llFallback=1, llATNTransitions=1}]";

        expect(info.toString()).toBe(expecting);
        expect(info.length).toBe(1);
    });

    it.skip("testDeepLookahead", () => {
        const g = new Grammar(
            "parser grammar T;\n" +
            "s : e ';'\n" +
            "  | e '.' \n" +
            "  ;\n" +
            "e : (ID|INT) ({true}? '+' e)*\n" + // d=1 entry, d=2 bypass
            "  ;\n",
            lg);

        const parameters: IToolConfiguration = {
            grammarFiles: [],
            outputDirectory: ".",
        };
        g.tool.process(g, parameters, false);

        // pred forces to
        // ambig and ('+' e)* tail recursion forces lookahead to fall out of e
        // any non-precedence predicates are always evaluated as true by the interpreter
        const info = interpAndGetDecisionInfo(lg, g, "s", "a+b+c;");
        // at "+b" it uses k=1 and enters loop then calls e for b...
        // e matches and d=2 uses "+c;" for k=3
        expect(info.length).toBe(2);
        const expecting =
            "[{decision=0, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=6, " +
            "sllATNTransitions=6, sllDFATransitions=0, llFallback=0, llLookahead=0, llATNTransitions=0}, " +
            "{decision=1, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=4, " +
            "sllATNTransitions=2, sllDFATransitions=2, llFallback=0, llLookahead=0, llATNTransitions=0}]";
        expect(`[${info.join(", ")}]`).toBe(expecting);
    });

    it("testProfilerGeneratedCode", async () => {
        const grammar =
            "grammar T;\n" +
            "s : a+ ID EOF ;\n" +
            "a : ID ';'{}\n" +
            "  | ID '.'\n" +
            "  ;\n" +
            "WS : [ \\r\\t\\n]+ -> channel(HIDDEN) ;\n" +
            "SEMI : ';' ;\n" +
            "DOT : '.' ;\n" +
            "ID : [a-zA-Z]+ ;\n" +
            "INT : [0-9]+ ;\n" +
            "PLUS : '+' ;\n" +
            "MULT : '*' ;\n";

        const tempDirPath = mkdtempSync(join(tmpdir(), "AntlrParserProfiler"));
        try {
            let generationErrors = "";
            const output = await ToolTestUtils.captureTerminalOutput(async () => {
                const queue = await ToolTestUtils.execParser("T.g4", grammar, "TParser", "TLexer", "s", "xyz;abc;z.q",
                    true, false, tempDirPath);
                generationErrors = queue.toString(true);
            });

            const expecting =
                "[{decision=0, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=6, sllATNTransitions=" +
                "4, sllDFATransitions=2, llFallback=0, llLookahead=0, llATNTransitions=0}," +
                " {decision=1, contextSensitivities=0, errors=0, ambiguities=0, sllLookahead=6, " +
                "sllATNTransitions=3, sllDFATransitions=3, llFallback=0, llLookahead=0, llATNTransitions=0}]\n";

            expect(generationErrors).toBe("");
            expect(output.output).toBe(expecting);

        } finally {
            rmSync(tempDirPath, { recursive: true });
        }
    });

});
