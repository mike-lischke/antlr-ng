/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { generateRandomFilename } from "../src/support/fs-helpers.js";
import { convertMapToString } from "../src/support/helpers.js";
import { fileSystem } from "../src/tool-parameters.js";
import { ANTLRMessage } from "../src/tool/ANTLRMessage.js";
import { Grammar } from "../src/tool/index.js";
import { IssueCode } from "../src/tool/Issues.js";
import { ErrorQueue } from "./support/ErrorQueue.js";
import { ToolTestUtils } from "./ToolTestUtils.js";

describe("TestCompositeGrammars", () => {
    const sort = <K extends string, V extends number>(data: Map<K, V>): Map<K, V> => {
        const dup = new Map<K, V>();

        const keys = [...data.keys()];
        keys.sort((a, b) => {
            return a.localeCompare(b);
        });

        for (const k of keys) {
            dup.set(k, data.get(k)!);
        }

        return dup;
    };

    const checkGrammarSemanticsWarning = (errorQueue: ErrorQueue, expectedMessage: ANTLRMessage): void => {
        let foundMsg: ANTLRMessage | undefined;
        for (const m of errorQueue.warnings) {
            if (m.issueCode === expectedMessage.issueCode) {
                foundMsg = m;
            }
        }

        expect(foundMsg).toBeDefined();
        expect(foundMsg).instanceOf(ANTLRMessage);

        expect(foundMsg!.args.join(", ")).toBe(expectedMessage.args.join(", "));
        if (errorQueue.size() !== 1) {
            console.error(errorQueue);
        }
    };

    it("testImportFileLocationInSubdir", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        try {
            const slave =
                "parser grammar S;\n" +
                "a : B {System.out.println(\"S.a\");} ;\n";

            const subdir = tempDir + "/sub";
            fileSystem.mkdirSync(subdir, { recursive: true });
            fileSystem.writeFileSync(subdir + "/S.g4", slave);

            const master =
                "grammar M;\n" +
                "import S;\n" +
                "s : a ;\n" +
                "B : 'b' ;" + // defines B from inherited token space
                "WS : (' '|'\\n') -> skip ;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: subdir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    // Test for https://github.com/antlr/antlr4/issues/1317
    it("testImportSelfLoop", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const master =
                "grammar M;\n" +
                "import M;\n" +
                "s : 'a' ;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testImportIntoLexerGrammar", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const master =
                "lexer grammar M;\n" +
                "import S;\n" +
                "A : 'a';\n" +
                "B : 'b';\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const slave =
                "lexer grammar S;\n" +
                "C : 'c';\n";
            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testImportModesIntoLexerGrammar", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const master =
                "lexer grammar M;\n" +
                "import S;\n" +
                "A : 'a' -> pushMode(X);\n" +
                "B : 'b';\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const slave =
                "lexer grammar S;\n" +
                "D : 'd';\n" +
                "mode X;\n" +
                "C : 'c' -> popMode;\n";
            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testImportChannelsIntoLexerGrammar", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const master =
                "lexer grammar M;\n" +
                "import S;\n" +
                "channels {CH_A, CH_B}\n" +
                "A : 'a' -> channel(CH_A);\n" +
                "B : 'b' -> channel(CH_B);\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const slave =
                "lexer grammar S;\n" +
                "C : 'c';\n";
            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testImportMixedChannelsIntoLexerGrammar", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const master =
                "lexer grammar M;\n" +
                "import S;\n" +
                "channels {CH_A, CH_B}\n" +
                "A : 'a' -> channel(CH_A);\n" +
                "B : 'b' -> channel(CH_B);\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const slave =
                "lexer grammar S;\n" +
                "channels {CH_C}\n" +
                "C : 'c' -> channel(CH_C);\n";
            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testImportClashingChannelsIntoLexerGrammar", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const master =
                "lexer grammar M;\n" +
                "import S;\n" +
                "channels {CH_A, CH_B, CH_C}\n" +
                "A : 'a' -> channel(CH_A);\n" +
                "B : 'b' -> channel(CH_B);\n" +
                "C : 'C' -> channel(CH_C);\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const slave =
                "lexer grammar S;\n" +
                "channels {CH_C}\n" +
                "C : 'c' -> channel(CH_C);\n";
            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testMergeModesIntoLexerGrammar", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const master =
                "lexer grammar M;\n" +
                "import S;\n" +
                "A : 'a' -> pushMode(X);\n" +
                "mode X;\n" +
                "B : 'b';\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const slave =
                "lexer grammar S;\n" +
                "D : 'd';\n" +
                "mode X;\n" +
                "C : 'c' -> popMode;\n";
            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testEmptyModesInLexerGrammar", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const master =
                "lexer grammar M;\n" +
                "import S;\n" +
                "A : 'a';\n" +
                "C : 'e';\n" +
                "B : 'b';\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const slave =
                "lexer grammar S;\n" +
                "D : 'd';\n" +
                "mode X;\n" +
                "C : 'c' -> popMode;\n";
            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testCombinedGrammarImportsModalLexerGrammar", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const master =
                "grammar M;\n" +
                "import S;\n" +
                "A : 'a';\n" +
                "B : 'b';\n" +
                "r : A B;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const slave =
                "lexer grammar S;\n" +
                "D : 'd';\n" +
                "mode X;\n" +
                "C : 'c' -> popMode;\n";
            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all).toHaveLength(1);

            const msg = queue.all[0];
            expect(msg.issueCode).toBe(IssueCode.ModeNotInLexer);
            expect(msg.args[0]).toBe("X");
            expect(msg.line).toBe(3);
            expect(msg.column).toBe(5);
            expect(basename(msg.fileName)).toBe("M.g4");
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testDelegatesSeeSameTokenType", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slaveS =
                "parser grammar S;\n" +
                "tokens { A, B, C }\n" +
                "x : A ;\n";
            const slaveT =
                "parser grammar T;\n" +
                "tokens { C, B, A } // reverse order\n" +
                "y : A ;\n";

            fileSystem.writeFileSync(tempDir + "/S.g4", slaveS);
            fileSystem.writeFileSync(join(tempDir, "T.g4"), slaveT);

            const master =
                "// The lexer will create rules to match letters a, b, c.\n" +
                "// The associated token types A, B, C must have the same value\n" +
                "// and all import'd parsers.  Since ANTLR regenerates all imports\n" +
                "// for use with the delegator M, it can generate the same token type\n" +
                "// mapping in each parser:\n" +
                "// public static final int C=6;\n" +
                "// public static final int EOF=-1;\n" +
                "// public static final int B=5;\n" +
                "// public static final int WS=7;\n" +
                "// public static final int A=4;\n" +
                "grammar M;\n" +
                "import S,T;\n" +
                "s : x y ; // matches AA, which should be 'aa'\n" +
                "B : 'b' ; // another order: B, A, C\n" +
                "A : 'a' ;\n" +
                "C : 'c' ;\n" +
                "WS : (' '|'\\n') -> skip ;\n";

            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const g = Grammar.forFile(Grammar, tempDir + "/M.g4", master);

            const errors = new ErrorQueue(g.tool.errorManager);
            g.tool.errorManager.addListener(errors);

            const parameters = {
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
            };
            g.tool.process(g, parameters, false);

            const expectedTokenIDToTypeMap = "{EOF=-1, B=1, A=2, C=3, WS=4}";
            const expectedStringLiteralToTypeMap = "{'a'=2, 'b'=1, 'c'=3}";
            const expectedTypeToTokenList = "B,A,C,WS";

            expect(convertMapToString(g.tokenNameToTypeMap)).toBe(expectedTokenIDToTypeMap);
            expect(convertMapToString(sort(g.stringLiteralToTypeMap))).toBe(expectedStringLiteralToTypeMap);
            expect(ToolTestUtils.realElements(g.typeToTokenList).toString()).toBe(expectedTypeToTokenList);
            expect(errors.errors).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testErrorInImportedGetsRightFilename", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "parser grammar S;\n" +
                "a : 'a' | c;\n";
            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const master =
                "grammar M;\n" +
                "import S;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            const msg = queue.errors[0];

            expect(msg.issueCode).toBe(IssueCode.UndefinedRuleRef);
            expect(msg.args[0]).toBe("c");
            expect(msg.line).toBe(2);
            expect(msg.column).toBe(10);
            expect(basename(msg.fileName)).toBe("S.g4");
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testImportFileNotSearchedForInOutputDir", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "parser grammar S;\n" +
                "a : B {System.out.println(\"S.a\");} ;\n";

            const outdir = tempDir + "/out";
            fileSystem.mkdirSync(outdir);
            fileSystem.writeFileSync(join(outdir, "S.g4"), slave);

            const master =
                "grammar M;\n" +
                "import S;\n" +
                "s : a ;\n" +
                "B : 'b' ;" + // defines B from inherited token space
                "WS : (' '|'\\n') -> skip ;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: tempDir
            }, false);
            expect(queue.all[0].issueCode).toBe(IssueCode.CannotFindImportedGrammar);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testOutputDirShouldNotEffectImports", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "parser grammar S;\n" +
                "a : B {System.out.println(\"S.a\");} ;\n";

            const subdir = tempDir + "/sub";
            fileSystem.mkdirSync(subdir);
            fileSystem.writeFileSync(join(subdir, "S.g4"), slave);

            const master =
                "grammar M;\n" +
                "import S;\n" +
                "s : a ;\n" +
                "B : 'b' ;" + // defines B from inherited token space
                "WS : (' '|'\\n') -> skip ;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);
            const outdir = tempDir + "/out";
            fileSystem.mkdirSync(outdir);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: outdir,
                grammarFiles: [tempDir + "/M.g4"],
                lib: subdir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testTokensFileInOutputDirAndImportFileInSubdir", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "parser grammar S;\n" +
                "a : B {System.out.println(\"S.a\");} ;\n";

            const subdir = tempDir + "/sub";
            fileSystem.mkdirSync(subdir);
            fileSystem.writeFileSync(join(subdir, "S.g4"), slave);

            const parser =
                "parser grammar MParser;\n" +
                "import S;\n" +
                "options {tokenVocab=MLexer;}\n" +
                "s : a ;\n";
            fileSystem.writeFileSync(join(tempDir, "MParser.g4"), parser);

            const lexer =
                "lexer grammar MLexer;\n" +
                "B : 'b' ;" + // defines B from inherited token space
                "WS : (' '|'\\n') -> skip ;\n";
            fileSystem.writeFileSync(join(tempDir, "MLexer.g4"), lexer);

            const outdir = tempDir + "/out";
            fileSystem.mkdirSync(outdir);

            let queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/MLexer.g4"],
                lib: outdir
            }, false);
            expect(queue.all).toHaveLength(0);

            queue = ToolTestUtils.antlrOnFile({
                outputDirectory: outdir,
                grammarFiles: [tempDir + "/MParser.g4"],
                lib: subdir
            }, false);
            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testImportedTokenVocabIgnoredWithWarning", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "parser grammar S;\n" +
                "options {tokenVocab=whatever;}\n" +
                "tokens { A }\n" +
                "x : A {System.out.println(\"S.x\");} ;\n";

            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const master =
                "grammar M;\n" +
                "import S;\n" +
                "s : x ;\n" +
                "WS : (' '|'\\n') -> skip ;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const g = Grammar.forFile(Grammar, tempDir + "/M.g4", master);
            const queue = new ErrorQueue(g.tool.errorManager);
            g.tool.errorManager.addListener(queue);

            const parameters = {
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
            };
            g.tool.process(g, parameters, false);

            const expectedArg = "S";
            const expectedMsgID = IssueCode.OptionsInDelegate;
            const expectedMessage = new ANTLRMessage(expectedMsgID, g.fileName, -1, -1, expectedArg);
            checkGrammarSemanticsWarning(queue, expectedMessage);

            expect(queue.errors).toHaveLength(0);
            expect(queue.warnings).toHaveLength(1);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testSyntaxErrorsInImportsNotThrownOut", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "parser grammar S;\n" +
                "options {toke\n";

            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const master =
                "grammar M;\n" +
                "import S;\n" +
                "s : x ;\n" +
                "WS : (' '|'\\n') -> skip ;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);
            const g = Grammar.forFile(Grammar, tempDir + "/M.g4", master);
            const errors = new ErrorQueue(g.tool.errorManager);
            g.tool.errorManager.addListener(errors);

            const parameters = {
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
            };
            g.tool.process(g, parameters, false);

            expect(errors.errors[0].issueCode).toBe(IssueCode.SyntaxError);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    // Make sure that M can import S that imports T.
    it("test3LevelImport", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "parser grammar T;\n" +
                "a : T ;\n";

            fileSystem.writeFileSync(join(tempDir, "T.g4"), slave);
            const slave2 =
                "parser grammar S;\n" +
                "import T;\n" +
                "a : S ;\n";

            fileSystem.writeFileSync(tempDir + "/S.g4", slave2);

            const master =
                "grammar M;\n" +
                "import S;\n" +
                "a : M ;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const g = Grammar.forFile(Grammar, tempDir + "/M.g4", master);
            g.name = "M";
            const errors = new ErrorQueue(g.tool.errorManager);
            g.tool.errorManager.addListener(errors);

            const parameters = {
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
            };
            g.tool.process(g, parameters, false);

            const expectedTokenIDToTypeMap = "{EOF=-1, M=1}"; // S and T aren't imported; overridden
            const expectedStringLiteralToTypeMap = "{}";
            const expectedTypeToTokenList = "M";

            expect(convertMapToString(g.tokenNameToTypeMap)).toBe(expectedTokenIDToTypeMap);
            expect(convertMapToString(g.stringLiteralToTypeMap)).toBe(expectedStringLiteralToTypeMap);
            expect(ToolTestUtils.realElements(g.typeToTokenList).toString()).toBe(expectedTypeToTokenList);

            expect(errors.errors).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testBigTreeOfImports", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            let slave =
                "parser grammar T;\n" +
                "tokens{T}\n" +
                "x : T ;\n";

            fileSystem.writeFileSync(join(tempDir, "T.g4"), slave);
            slave =
                "parser grammar S;\n" +
                "import T;\n" +
                "tokens{S}\n" +
                "y : S ;\n";

            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            slave =
                "parser grammar C;\n" +
                "tokens{C}\n" +
                "i : C ;\n";

            fileSystem.writeFileSync(join(tempDir, "C.g4"), slave);
            slave =
                "parser grammar B;\n" +
                "tokens{B}\n" +
                "j : B ;\n";

            fileSystem.writeFileSync(join(tempDir, "B.g4"), slave);
            slave =
                "parser grammar A;\n" +
                "import B,C;\n" +
                "tokens{A}\n" +
                "k : A ;\n";

            fileSystem.writeFileSync(join(tempDir, "A.g4"), slave);

            const master =
                "grammar M;\n" +
                "import S,A;\n" +
                "tokens{M}\n" +
                "a : M ;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const g = Grammar.forFile(Grammar, tempDir + "/M.g4", master);
            const errors = new ErrorQueue(g.tool.errorManager);
            g.tool.errorManager.addListener(errors);

            const parameters = {
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
            };
            g.tool.process(g, parameters, false);

            expect(errors.all).toHaveLength(0);

            const expectedTokenIDToTypeMap = "{EOF=-1, M=1, S=2, T=3, A=4, B=5, C=6}";
            const expectedStringLiteralToTypeMap = "{}";
            const expectedTypeToTokenList = "M,S,T,A,B,C";

            expect(convertMapToString(g.tokenNameToTypeMap)).toBe(expectedTokenIDToTypeMap);
            expect(convertMapToString(g.stringLiteralToTypeMap)).toBe(expectedStringLiteralToTypeMap);
            expect(ToolTestUtils.realElements(g.typeToTokenList).toString()).toBe(expectedTypeToTokenList);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testRulesVisibleThroughMultilevelImport", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "parser grammar T;\n" +
                "x : T ;\n";

            fileSystem.writeFileSync(join(tempDir, "T.g4"), slave);
            const slave2 =
                "parser grammar S;\n" + // A, B, C token type order
                "import T;\n" +
                "a : S ;\n";

            fileSystem.writeFileSync(tempDir + "/S.g4", slave2);

            const master =
                "grammar M;\n" +
                "import S;\n" +
                "a : M x ;\n"; // x MUST BE VISIBLE TO M
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const g = Grammar.forFile(Grammar, tempDir + "/M.g4", master);
            const errors = new ErrorQueue(g.tool.errorManager);
            g.tool.errorManager.addListener(errors);

            const parameters = {
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
            };
            g.tool.process(g, parameters, false);

            const expectedTokenIDToTypeMap = "{EOF=-1, M=1, T=2}";
            const expectedStringLiteralToTypeMap = "{}";
            const expectedTypeToTokenList = "M,T";

            expect(convertMapToString(g.tokenNameToTypeMap)).toBe(expectedTokenIDToTypeMap);
            expect(convertMapToString(g.stringLiteralToTypeMap)).toBe(expectedStringLiteralToTypeMap);
            expect(ToolTestUtils.realElements(g.typeToTokenList).toString()).toBe(expectedTypeToTokenList);

            expect(errors.errors).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testNestedComposite", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            // Wasn't compiling. http://www.antlr.org/jira/browse/ANTLR-438
            let grammarString =
                "lexer grammar L;\n" +
                "T1: '1';\n" +
                "T2: '2';\n" +
                "T3: '3';\n" +
                "T4: '4';\n";

            fileSystem.writeFileSync(join(tempDir, "L.g4"), grammarString);
            grammarString =
                "parser grammar G1;\n" +
                "s: a | b;\n" +
                "a: T1;\n" +
                "b: T2;\n";

            fileSystem.writeFileSync(join(tempDir, "G1.g4"), grammarString);

            grammarString =
                "parser grammar G2;\n" +
                "import G1;\n" +
                "a: T3;\n";

            fileSystem.writeFileSync(join(tempDir, "G2.g4"), grammarString);
            const grammar3String =
                "grammar G3;\n" +
                "import G2;\n" +
                "b: T4;\n";

            fileSystem.writeFileSync(join(tempDir, "G3.g4"), grammar3String);

            const g = Grammar.forFile(Grammar, tempDir + "/G3.g4", grammar3String);
            const errors = new ErrorQueue(g.tool.errorManager);
            g.tool.errorManager.addListener(errors);

            const parameters = {
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
            };
            g.tool.process(g, parameters, false);

            const expectedTokenIDToTypeMap = "{EOF=-1, T4=1, T3=2}";
            const expectedStringLiteralToTypeMap = "{}";
            const expectedTypeToTokenList = "T4,T3";

            expect(convertMapToString(g.tokenNameToTypeMap)).toBe(expectedTokenIDToTypeMap);
            expect(convertMapToString(g.stringLiteralToTypeMap)).toBe(expectedStringLiteralToTypeMap);
            expect(ToolTestUtils.realElements(g.typeToTokenList).toString()).toBe(expectedTypeToTokenList);

            expect(errors.errors).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    it("testHeadersPropagatedCorrectlyToImportedGrammars", () => {
        const tempDir = generateRandomFilename("/tmp/AntlrComposite-");
        fileSystem.mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "parser grammar S;\n" +
                "a : B {System.out.print(\"S.a\");} ;\n";

            fileSystem.writeFileSync(tempDir + "/S.g4", slave);

            const master =
                "grammar M;\n" +
                "import S;\n" +
                "@header{package myPackage;}\n" +
                "s : a ;\n" +
                "B : 'b' ;" + // defines B from inherited token space
                "WS : (' '|'\\n') -> skip ;\n";
            fileSystem.writeFileSync(tempDir + "/M.g4", master);

            const queue = ToolTestUtils.antlrOnFile({
                outputDirectory: tempDir,
                grammarFiles: [tempDir + "/M.g4"],
            }, false);

            expect(queue.all).toHaveLength(0);
        } finally {
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    /**
     * This is a regression test for antlr/antlr4#670 "exception when importing
     * grammar".  I think this one always worked but I found that a different
     * Java grammar caused an error and so I made the testImportLeftRecursiveGrammar() test below.
     * https://github.com/antlr/antlr4/issues/670
     *
     * Note: all tests that execute a parser must run on a physical file system, to allow tsx to transpile
     *       the generated files.
     */
    it("testImportLargeGrammar", async () => {
        const tempDir = mkdtempSync(tmpdir() + "/AntlrComposite-");
        mkdirSync(tempDir, { recursive: true });

        try {
            const sourcePath = fileURLToPath(new URL("./grammars/Java.g4", import.meta.url));
            const slave = readFileSync(sourcePath, "utf-8");
            const master =
                "grammar NewJava;\n" +
                "import Java;\n";

            // Use the same folder in the virtual file system. It doesn't matter where we store the files.
            fileSystem.mkdirSync(tempDir, { recursive: true });
            fileSystem.writeFileSync(join(tempDir, "Java.g4"), slave);

            const originalLog = console.log;
            try {
                let output = "";
                console.log = (str) => {
                    output += str;
                };

                const queue = await ToolTestUtils.execParser("NewJava.g4", master, "NewJavaParser", "NewJavaLexer",
                    "compilationUnit", "package Foo;", false, false, tempDir);

                expect(output).toBe("");
                expect(queue.errors).toHaveLength(0);
            } finally {
                console.log = originalLog;
            }
        } finally {
            rmSync(tempDir, { recursive: true });
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    /**
     * This is a regression test for antlr/antlr4#670 "exception when importing
     * grammar".
     * https://github.com/antlr/antlr4/issues/670
     */
    it("testImportLeftRecursiveGrammar", async () => {
        const tempDir = mkdtempSync(tmpdir() + "/AntlrComposite-");
        mkdirSync(tempDir, { recursive: true });

        try {
            const slave =
                "grammar Java;\n" +
                "e : '(' e ')'\n" +
                "  | e '=' e\n" +
                "  | ID\n" +
                "  ;\n" +
                "ID : [a-z]+ ;\n";
            const master =
                "grammar T;\n" +
                "import Java;\n" +
                "s : e ;\n";

            fileSystem.mkdirSync(tempDir, { recursive: true });
            fileSystem.writeFileSync(join(tempDir, "Java.g4"), slave);

            const originalLog = console.log;
            try {
                let output = "";
                console.log = (str) => {
                    output += str;
                };

                const queue = await ToolTestUtils.execParser("T.g4", master, "TParser", "TLexer", "s", "a=b", false,
                    false, tempDir);
                expect(output).toBe("");
                expect(queue.errors).toHaveLength(0);
                expect("", output);
            } finally {
                console.log = originalLog;
            }
        } finally {
            rmSync(tempDir, { recursive: true });
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });

    // ISSUE: https://github.com/antlr/antlr4/issues/2296
    it("testCircularGrammarInclusion", async () => {
        const tempDir = mkdtempSync(tmpdir() + "/AntlrComposite-");
        mkdirSync(tempDir, { recursive: true });

        try {
            const g1 =
                "grammar G1;\n" +
                "import  G2;\n" +
                "r : 'R1';";

            const g2 =
                "grammar G2;\n" +
                "import  G1;\n" +
                "r : 'R2';";

            fileSystem.mkdirSync(tempDir, { recursive: true });
            fileSystem.writeFileSync(join(tempDir, "G1.g4"), g1);
            const queue = await ToolTestUtils.execParser("G2.g4", g2, "G2Parser", "G2Lexer", "r", "R2", false, false,
                tempDir);
            expect(queue.errors).toHaveLength(0);
        } finally {
            rmSync(tempDir, { recursive: true });
            fileSystem.rmSync(tempDir, { recursive: true });
        }
    });
});
