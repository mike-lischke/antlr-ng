#!/usr/bin/env node

/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import * as nodeFs from "fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { program } from "commander";

import {
    CharStream, CommonToken, CommonTokenStream, DiagnosticErrorListener, Lexer, Parser, ParserRuleContext,
    PredictionMode, type ATNSimulator, type Recognizer
} from "antlr4ng";

import { memfs } from "memfs";
import { parseBoolean } from "./cli-options.js";
import { useFileSystem } from "../src/tool-parameters.js";
import { copyFolderToMemFs, dirname } from "../src/support/fs-helpers.js";

type Constructor<T extends Recognizer<ATNSimulator>> = abstract new (...args: unknown[]) => T;

interface ModuleType<T extends Recognizer<ATNSimulator>> {
    [key: string]: unknown;
    Parser: Constructor<T>;
}

/** Allows to test for instance members (like rule methods). */
type IndexableParser = Parser & Record<string, unknown>;

/** The common form of a rule method in a parser. */
type RuleMethod = () => ParserRuleContext;

/** CLI parameters for the interpreter tool. */
interface ITestRigCliParameters {
    grammar: string,
    startRuleName: string,
    inputFiles?: string[],
    tokens?: boolean,
    tree?: boolean,
    trace?: boolean,
    diagnostics?: boolean,
    sll?: boolean,
}

program
    .argument("<grammar>", "The path of the grammar with no extension")
    .argument("<startRuleName>", "Name of the start rule")
    .option<boolean>("--tree", "Print out the parse tree", parseBoolean, false)
    .option<boolean>("--tokens", "Print out the tokens for each input symbol", parseBoolean, false)
    .option<boolean>("--trace", "Print out tracing information (rule enter/exit etc.).", parseBoolean, false)
    .option<boolean>("--diagnostics", "Print out diagnostic information", parseBoolean, false)
    .option<boolean>("--sll", "Use SLL prediction mode (instead of LL)", parseBoolean, false)
    .argument("[inputFiles...]", "Input files")
    .parse();

const testRigOptions = program.opts<ITestRigCliParameters>();
testRigOptions.grammar = program.args[0];
testRigOptions.startRuleName = program.args[1];
testRigOptions.inputFiles = program.args.slice(2);

// Prepare the virtual file system.
const { fs } = memfs();
useFileSystem(fs);

/**
 * Run a lexer/parser combo, optionally printing tree string. Optionally taking input file.
 *
 *  $ java org.antlr.v4.runtime.misc.TestRig GrammarName startRuleName
 *        [-tree]
 *        [-tokens] [-gui] [-ps file.ps]
 *        [-trace]
 *        [-diagnostics]
 *        [-SLL]
 *        [input-filename(s)]
 */
export class TestRig {
    public static readonly LEXER_START_RULE_NAME = "tokens";

    public async run(): Promise<void> {
        // Try to load the lexer and parser classes.
        const lexerName = resolve(testRigOptions.grammar + "Lexer");
        const lexer = await this.loadClass(Lexer, lexerName + ".ts");

        let parser: IndexableParser | undefined;
        if (testRigOptions.startRuleName !== TestRig.LEXER_START_RULE_NAME) {
            const parserName = resolve(testRigOptions.grammar + "Parser");
            parser = await this.loadClass(Parser, parserName + ".ts");
        }

        const files = testRigOptions.inputFiles ?? [];
        for (const inputFile of files) {
            const content = await nodeFs.promises.readFile(resolve(inputFile), { encoding: "utf-8" });
            const charStream = CharStream.fromString(content);
            if (files.length > 1) {
                console.log(inputFile);
            }
            this.process(charStream, lexer, parser);
        }
    }

    protected process(input: CharStream, lexer: Lexer, parser?: IndexableParser): void {
        lexer.inputStream = input;
        const tokens = new CommonTokenStream(lexer);

        tokens.fill();

        if (testRigOptions.tokens) {
            for (const tok of tokens.getTokens()) {
                if (tok instanceof CommonToken) {
                    console.log(tok.toString(lexer));
                } else {
                    console.log(tok.toString());
                }
            }
        }

        if (testRigOptions.startRuleName === TestRig.LEXER_START_RULE_NAME) {
            return;
        }

        if (!parser) {
            throw new Error("Parser is required for non-lexer start rule");
        }

        if (testRigOptions.diagnostics) {
            parser.addErrorListener(new DiagnosticErrorListener());
            parser.interpreter.predictionMode = PredictionMode.LL_EXACT_AMBIG_DETECTION;
        }

        if (testRigOptions.tree) {
            parser.buildParseTrees = true;
        }

        if (testRigOptions.sll) { // overrides diagnostics
            parser.interpreter.predictionMode = PredictionMode.SLL;
        }

        parser.tokenStream = tokens;
        parser.setTrace(testRigOptions.trace ?? false);

        let tree: ParserRuleContext | undefined;
        if (typeof parser[testRigOptions.startRuleName] === "function") {
            tree = (parser[testRigOptions.startRuleName] as RuleMethod)();
        } else {
            console.error(`\nMethod ${testRigOptions.startRuleName} not found in the class or it is not a function\n`);

            process.exit(1);
        }

        if (testRigOptions.tree) {
            console.log(tree.toStringTree(parser));
        }
    }

    private async loadClass<T extends Recognizer<ATNSimulator>>(t: Constructor<T>,
        fileName: string): Promise<T & Record<string, unknown>> {
        try {
            const module = await import(fileName) as ModuleType<T>;

            // Helper function to check if a class extends another class (directly or indirectly).
            // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
            const extendsClass = (child: Function, parent: Function): boolean => {
                let proto = child.prototype as unknown;
                while (proto) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    if (proto.constructor.name === parent.prototype.constructor.name) {
                        return true;
                    }
                    proto = Object.getPrototypeOf(proto);
                }

                return false;
            };

            // Find the first class that extends the base class (directly or indirectly)
            const targetClass = Object.values(module).find((candidate): candidate is Constructor<T> => {
                return typeof candidate === "function" &&
                    candidate.prototype instanceof Object &&
                    candidate !== t &&
                    extendsClass(candidate, t);
            });

            if (!targetClass) {
                throw new Error("Could not find a recognizer class in " + fileName);
            }

            // @ts-expect-error - We know that TargetClass is a non-abstract constructor
            return new targetClass() as T;
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error(`\nCould not load class ${t.name} from ${fileName}: \n${message}\n`);

            process.exit(1);
        }
    }
}

// Provide the templates in the virtual file system.
fs.mkdirSync("/templates", { recursive: true });
copyFolderToMemFs(fs, fileURLToPath(dirname(import.meta.url) + "/../templates"), "/templates", true);

const testRig = new TestRig();
await testRig.run();
