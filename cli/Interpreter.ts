#!/usr/bin/env node

/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { Option, program } from "commander";
import { memfs } from "memfs";
import * as nodeFs from "node:fs";

import { CharStream, CommonToken, CommonTokenStream, DecisionInfo, ParseInfo } from "antlr4ng";

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFolderToMemFs } from "../src/support/fs-helpers.js";
import { useFileSystem, type IToolParameters } from "../src/tool-parameters.js";
import { Tool } from "../src/Tool.js";
import type { GrammarParserInterpreter } from "../src/tool/GrammarParserInterpreter.js";
import { Grammar, LexerGrammar } from "../src/tool/index.js";
import { ToolListener } from "../src/tool/ToolListener.js";
import { encodings, parseBoolean } from "./cli-options.js";
import { IgnoreTokenVocabGrammar } from "./IgnoreTokenVocabGrammar.js";

/** CLI parameters for the interpreter tool. */
export interface IInterpreterCliParameters {
    grammars: string[],
    inputFile?: string,
    startRuleName: string,
    encoding: BufferEncoding,
    tokens?: boolean,
    tree?: boolean,
    trace?: boolean,
    profile?: string,
}

program
    .argument("startRuleName", "Name of the parser start rule")
    .option<boolean>("--tree", "Print out the parse tree", parseBoolean, false)
    .option<boolean>("--tokens", "Print out the tokens for each input symbol", parseBoolean, false)
    .option<boolean>("--trace", "Print out tracing information (rule enter/exit etc.).", parseBoolean, false)
    .addOption(new Option("--encoding [string]", "The input file encoding (default: utf-8)")
        .choices(encodings).default("utf-8"))
    .option("--profile filename.csv", "Profile the parser and generate profiling information.", "filename.csv")
    .argument("<input-filename>", "Input file")
    .argument("[grammar...]", "Lexer/Parser/Combined grammar files")
    .parse();

const interpreterOptions = program.opts<IInterpreterCliParameters>();
interpreterOptions.startRuleName = program.args[0];
interpreterOptions.inputFile = program.args[1];
interpreterOptions.grammars = program.args.slice(2);

// Prepare the virtual file system.
const { fs } = memfs();
useFileSystem(fs);

/** Interpret a lexer/parser, optionally printing tree string and dumping profile info */
export class Interpreter {
    public static readonly profilerColumnNames = [
        "Rule", "Invocations", "Time (ms)", "Total k", "Max k", "Ambiguities", "DFA cache miss",
    ];

    public static getValue(decisionInfo: DecisionInfo, ruleNamesByDecision: string[], decision: number,
        col: number): number | string {
        switch (col) { // laborious but more efficient than reflection
            case 0: {
                return `${ruleNamesByDecision[decision]}:${decision}`;
            }

            case 1: {
                return decisionInfo.invocations;
            }

            case 2: {
                return decisionInfo.timeInPrediction / (1000.0 * 1000.0);
            }

            case 3: {
                return decisionInfo.llTotalLook + decisionInfo.sllTotalLook;
            }

            case 4: {
                return Math.max(decisionInfo.llMaxLook, decisionInfo.sllMaxLook);
            }

            case 5: {
                return decisionInfo.ambiguities.length;
            }

            case 6: {
                return decisionInfo.sllATNTransitions + decisionInfo.llATNTransitions;
            }

            default:

        }

        return "n/a";
    }

    public async run(): Promise<ParseInfo | undefined> {
        if (interpreterOptions.grammars.length === 0 || !interpreterOptions.inputFile) {
            return undefined;
        }

        let g: Grammar;
        let lg = null;

        const tool = new Tool();
        const listener = new ToolListener(tool.errorManager);

        const parameters: IToolParameters = {
            grammarFiles: interpreterOptions.grammars,
            outputDirectory: ".",
            encoding: interpreterOptions.encoding,
            generateListener: false,
            generateVisitor: false,
            atn: false,
            longMessages: false,
            msgFormat: "antlr",
            warningsAreErrors: false,
            forceAtn: false,
            log: false,
            exactOutputDir: false,
        };

        if (interpreterOptions.grammars.length === 1) {
            // Must be a combined grammar.
            const grammarContent = await fs.promises.readFile(interpreterOptions.grammars[0], "utf8") as string;
            g = Grammar.forFile(IgnoreTokenVocabGrammar, interpreterOptions.grammars[0], grammarContent,
                undefined, listener);
            g.tool.process(g, parameters, false);
        } else {
            const lexerGrammarContent = await fs.promises.readFile(interpreterOptions.grammars[1], "utf8") as string;
            lg = new LexerGrammar(lexerGrammarContent);
            lg.tool.errorManager.addListener(listener);
            lg.tool.process(lg, parameters, false);

            const parserGrammarContent = await fs.promises.readFile(interpreterOptions.grammars[0], "utf8") as string;
            g = Grammar.forFile(IgnoreTokenVocabGrammar, interpreterOptions.grammars[0],
                parserGrammarContent, lg, listener);
            g.tool.process(g, parameters, false);
        }

        const input = await nodeFs.promises.readFile(interpreterOptions.inputFile, interpreterOptions.encoding);
        const charStream = CharStream.fromString(input);
        const lexEngine = lg ? lg.createLexerInterpreter(charStream) : g.createLexerInterpreter(charStream);
        const tokens = new CommonTokenStream(lexEngine);

        tokens.fill();

        if (interpreterOptions.tokens) {
            for (const tok of tokens.getTokens()) {
                if (tok instanceof CommonToken) {
                    console.log(tok.toString(lexEngine));
                } else {

                    console.log(tok.toString());
                }
            }
        }

        const parser = g.createGrammarParserInterpreter(tokens);
        if (interpreterOptions.profile) {
            parser.setProfile(true);
        }
        parser.setTrace(interpreterOptions.trace ?? false);

        const r = g.rules.get(interpreterOptions.startRuleName);
        if (!r) {
            console.error("No such start rule: " + interpreterOptions.startRuleName);

            return undefined;
        }

        const t = parser.parse(r.index);
        const parseInfo = parser.getParseInfo();

        if (interpreterOptions.tree) {
            console.log(t.toStringTree(parser));
        }

        if (interpreterOptions.profile && parseInfo) {
            this.dumpProfilerCSV(parser, parseInfo);
        }

        return parseInfo ?? undefined;
    }

    private dumpProfilerCSV(parser: GrammarParserInterpreter, parseInfo: ParseInfo): void {
        const ruleNamesByDecision = new Array<string>(parser.atn.decisionToState.length);
        const ruleNames = parser.ruleNames;
        for (let i = 0; i < ruleNamesByDecision.length; ++i) {
            ruleNamesByDecision[i] = ruleNames[parser.atn.getDecisionState(i)!.ruleIndex];
        }

        const decisionInfo = parseInfo.getDecisionInfo();
        const table: string[][] = [];

        for (let decision = 0; decision < decisionInfo.length; ++decision) {
            table.push([]);
            for (let col = 0; col < Interpreter.profilerColumnNames.length; col++) {
                const colVal = Interpreter.getValue(decisionInfo[decision], ruleNamesByDecision, decision, col);
                table[decision].push(colVal.toString());
            }
        }

        const writer = nodeFs.createWriteStream(interpreterOptions.profile!);

        for (let i = 0; i < Interpreter.profilerColumnNames.length; i++) {
            if (i > 0) {
                writer.write(",");
            }

            writer.write(Interpreter.profilerColumnNames[i]);
        }

        writer.write("\n");
        for (const row of table) {
            for (let i = 0; i < Interpreter.profilerColumnNames.length; i++) {
                if (i > 0) {
                    writer.write(",");
                }
                writer.write(row[i]);
            }
            writer.write("\n");
        }
        writer.close();
    }
}

// Provide the templates in the virtual file system.
fs.mkdirSync("/templates", { recursive: true });
copyFolderToMemFs(fs, fileURLToPath(dirname(import.meta.url) + "/../templates"), "/templates", true);

// Copy all files to the memfs file system. We use the same path in both file systems. It doesn't matter for memfs.
for (const grammarFile of interpreterOptions.grammars) {
    const parentDir = dirname(grammarFile);

    fs.mkdirSync(parentDir, { recursive: true });
    copyFolderToMemFs(fs, parentDir, parentDir, false, /\.g4/);
    copyFolderToMemFs(fs, parentDir, parentDir, false, /\.tokens/);
}

const interpreter = new Interpreter();
await interpreter.run();
