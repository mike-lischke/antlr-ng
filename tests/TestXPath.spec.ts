/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ParserRuleContext, ParseTree, TerminalNode, XPath, type Parser } from "antlr4ng";

import { describe, expect, it } from "vitest";

import { ToolTestUtils, xpathTestGrammar } from "./ToolTestUtils.js";

describe("TestXPath", () => {
    const sampleProgram =
        "def f(x,y) { x = 3+4; y; ; }\n" +
        "def g(x) { return 1+2*x; }\n";

    const testError = async (grammarFileName: string, grammar: string, input: string, xpath: string, expected: string,
        startRuleName: string, parserName: string, lexerName: string, tempDir: string): Promise<void> => {

        await expect(async () => {
            await compileAndExtract(grammarFileName, grammar, input, xpath, startRuleName, parserName, lexerName,
                tempDir);
        }).rejects.toThrow(expected);
    };

    const parse = async (grammarFileName: string, grammar: string, input: string, startRuleName: string,
        parserName: string, lexerName: string, tempDir: string): Promise<[Parser, ParseTree]> => {
        const runOptions = ToolTestUtils.createOptionsForToolTests(grammarFileName, grammar, parserName, lexerName,
            false, false, startRuleName, input, false, false);

        const [_, parser] = await ToolTestUtils.setupRecognizers(runOptions, tempDir);

        return [parser, ToolTestUtils.callParserMethod(parser, startRuleName) as ParseTree];
    };

    const compileAndExtract = async (grammarFileName: string, grammar: string, input: string, xpath: string,
        startRuleName: string, parserName: string, lexerName: string,
        tempDir: string): Promise<[string[], Set<ParseTree>]> => {
        const [parser, parseTree] = await parse(grammarFileName, grammar, input, startRuleName, parserName, lexerName,
            tempDir);
        const found = XPath.findAll(parseTree, xpath, parser);

        return [parser.ruleNames, found];
    };

    it("testValidPaths", async () => {
        const xpath = [
            "/prog/func", // all funcs under prog at root
            "/prog/*", // all children of prog at root
            "/*/func", // all func kids of any root node
            "prog", // prog must be root node
            "/prog", // prog must be root node
            "/*", // any root
            "*", // any root
            "//ID", // any ID in tree
            "//expr/primary/ID",// any ID child of a primary under any expr
            "//body//ID", // any ID under a body
            "//'return'", // any 'return' literal in tree, matched by literal name
            "//RETURN", // any 'return' literal in tree, matched by symbolic name
            "//primary/*", // all kids of any primary
            "//func/*/stat",	// all stat nodes grand kids of any func node
            "/prog/func/'def'",	// all def literal kids of func kid of prog
            "//stat/';'", // all ';' under any stat node
            "//expr/primary/!ID",	// anything but ID under primary under any expr node
            "//expr/!primary",	// anything but primary under any expr node
            "//!*", // nothing anywhere
            "/!*", // nothing at root
            "//expr//ID", // any ID under any expression (tests antlr/antlr4#370)
        ];
        const expected = [
            "[func, func]",
            "[func, func]",
            "[func, func]",
            "[prog]",
            "[prog]",
            "[prog]",
            "[prog]",
            "[f, x, y, x, y, g, x, x]",
            "[y, x]",
            "[x, y, x]",
            "[return]",
            "[return]",
            "[3, 4, y, 1, 2, x]",
            "[stat, stat, stat, stat]",
            "[def, def]",
            "[;, ;, ;, ;]",
            "[3, 4, 1, 2]",
            "[expr, expr, expr, expr, expr, expr]",
            "[]",
            "[]",
            "[y, x]",
        ];

        const tempDir = mkdtempSync(join(tmpdir(), "AntlrXPathTest"));
        try {
            const [parser, parseTree] = await parse("Expr.g4", xpathTestGrammar, sampleProgram, "prog", "ExprParser",
                "ExprLexer", tempDir);

            for (let i = 0; i < xpath.length; i++) {
                const found = XPath.findAll(parseTree, xpath[i], parser);

                const ruleNames: string[] = [];
                for (const t of found) {
                    if (t instanceof ParserRuleContext) {
                        const r = t;
                        ruleNames.push(parser.ruleNames[r.ruleIndex]);
                    } else {
                        const token = t as TerminalNode;
                        ruleNames.push(token.getText());
                    }
                }

                const result = `[${ruleNames.join(", ")}]`;

                expect(result, "path " + xpath[i] + " failed").to.equal(expected[i]);
            }
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testWeirdChar", async () => {
        const path = "&";
        const expected = "Invalid tokens or characters at index 0 in path '&'";

        const tempDir = mkdtempSync(join(tmpdir(), "AntlrXPathTest"));
        try {
            await testError("Expr.g4", xpathTestGrammar, sampleProgram, path, expected, "prog", "ExprParser",
                "ExprLexer", tempDir);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testWeirdChar2", async () => {
        const path = "//w&e/";
        const expected = "Invalid tokens or characters at index 3 in path '//w&e/'";

        const tempDir = mkdtempSync(join(tmpdir(), "AntlrXPathTest"));
        try {
            await testError("Expr.g4", xpathTestGrammar, sampleProgram, path, expected, "prog", "ExprParser",
                "ExprLexer", tempDir);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testBadSyntax", async () => {
        const path = "///";
        const expected = "/ at index 2 isn't a valid rule name";

        const tempDir = mkdtempSync(join(tmpdir(), "AntlrXPathTest"));
        try {
            await testError("Expr.g4", xpathTestGrammar, sampleProgram, path, expected, "prog", "ExprParser",
                "ExprLexer", tempDir);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testMissingWordAtEnd", async () => {
        const path = "//";
        const expected = "Missing path element at end of path";

        const tempDir = mkdtempSync(join(tmpdir(), "AntlrXPathTest"));
        try {
            await testError("Expr.g4", xpathTestGrammar, sampleProgram, path, expected, "prog", "ExprParser",
                "ExprLexer", tempDir);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testBadTokenName", async () => {
        const path = "//Ick";
        const expected = "Ick at index 2 isn't a valid token name";

        const tempDir = mkdtempSync(join(tmpdir(), "AntlrXPathTest"));
        try {
            await testError("Expr.g4", xpathTestGrammar, sampleProgram, path, expected, "prog", "ExprParser",
                "ExprLexer", tempDir);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

    it("testBadRuleName", async () => {
        const path = "/prog/ick";
        const expected = "ick at index 6 isn't a valid rule name";

        const tempDir = mkdtempSync(join(tmpdir(), "AntlrXPathTest"));
        try {
            await testError("Expr.g4", xpathTestGrammar, sampleProgram, path, expected, "prog", "ExprParser",
                "ExprLexer", tempDir);
        } finally {
            rmSync(tempDir, { recursive: true });
        }
    });

});
