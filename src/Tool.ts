/*
 * Copyright (c) The ANTLR Project. All rights reserved.
 * Use of this file is governed by the BSD 3-clause license that
 * can be found in the LICENSE.txt file in the project root.
 */

/* eslint-disable jsdoc/require-param, jsdoc/require-returns */

import { ATNSerializer, CharStream, CommonTokenStream, type ParserRuleContext, type TokenStream } from "antlr4ng";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path, { basename } from "path";

import {
    ANTLRv4Parser, GrammarSpecContext, type IdentifierContext, type OptionContext, type RuleSpecContext
} from "./generated/ANTLRv4Parser.js";

import { ClassFactory } from "./ClassFactory.js";
import { UndefChecker } from "./UndefChecker.js";
import { AnalysisPipeline } from "./analysis/AnalysisPipeline.js";
import { IATNFactory } from "./automata/IATNFactory.js";
import { LexerATNFactory } from "./automata/LexerATNFactory.js";
import { ParserATNFactory } from "./automata/ParserATNFactory.js";
import { CodeGenPipeline } from "./codegen/CodeGenPipeline.js";
import { CodeGenerator } from "./codegen/CodeGenerator.js";
import { grammarOptions } from "./grammar-options.js";
import { Graph } from "./misc/Graph.js";
import { GrammarASTAdaptor } from "./parse/GrammarASTAdaptor.js";
import { ToolANTLRLexer } from "./parse/ToolANTLRLexer.js";
import { ToolANTLRParser } from "./parse/ToolANTLRParser.js";
import { SemanticPipeline } from "./semantics/SemanticPipeline.js";
import { LogManager } from "./support/LogManager.js";
import { BuildDependencyGenerator } from "./tool/BuildDependencyGenerator.js";
import { DOTGenerator } from "./tool/DOTGenerator.js";
import { ErrorManager } from "./tool/ErrorManager.js";
import { ErrorType } from "./tool/ErrorType.js";
import type { Grammar } from "./tool/Grammar.js";
import { GrammarTransformPipeline } from "./tool/GrammarTransformPipeline.js";
import type { LexerGrammar } from "./tool/LexerGrammar.js";
import { Rule } from "./tool/Rule.js";
import { GrammarAST } from "./tool/ast/GrammarAST.js";
import { GrammarRootAST } from "./tool/ast/GrammarRootAST.js";
import type { IGrammar, ITool } from "./types.js";

export class Tool implements ITool {
    public static readonly GRAMMAR_EXTENSION = ".g4";
    public static readonly LEGACY_GRAMMAR_EXTENSION = ".g";

    public static readonly ALL_GRAMMAR_EXTENSIONS = [Tool.GRAMMAR_EXTENSION, Tool.LEGACY_GRAMMAR_EXTENSION];

    public inputDirectory: string;

    public readonly args: string[];

    public logMgr = new LogManager();

    // helper vars for option management
    protected haveOutputDir = false;

    protected grammarFiles = new Array<string>();

    private readonly importedGrammars = new Map<string, Grammar>();

    public constructor(args?: string[]) {
        this.args = args ?? [];
    }

    public static main(args: string[]): void {
        const antlr = new Tool(args);
        try {
            antlr.processGrammarsOnCommandLine();
        } finally {
            if (grammarOptions.log) {
                try {
                    const logName = antlr.logMgr.save();
                    console.log("wrote " + logName);
                } catch (ioe) {
                    ErrorManager.get().toolError(ErrorType.INTERNAL_ERROR, ioe);
                }
            }
        }

        antlr.exit(0);
    }

    public static generateInterpreterData(g: Grammar): string {
        let content = "";

        content += "token literal names:\n";
        let names = g.getTokenLiteralNames();
        content += names.join("\n") + "\n\n";

        content += "token symbolic names:\n";
        names = g.getTokenSymbolicNames();
        content += names.join("\n") + "\n\n";

        content += "rule names:\n";
        names = g.getRuleNames();
        content += names.join("\n") + "\n\n";

        if (g.isLexer()) {
            content += "channel names:\n";
            content += "DEFAULT_TOKEN_CHANNEL\n";
            content += "HIDDEN\n";
            content += g.channelValueToNameList.join("\n") + "\n\n";
            content += "mode names:\n";
            content += [...(g as LexerGrammar).modes.keys()].join("\n") + "\n";
        }
        content += "\n";

        const serializedATN = ATNSerializer.getSerialized(g.atn);
        content += "atn:\n";
        content += serializedATN.toString();

        return content.toString();
    }

    /** Manually get option node from tree; return null if not defined. */
    private static findOptionValueAST(root: GrammarRootAST, option: string): GrammarAST | null {
        const options = root.getFirstChildWithType(ANTLRv4Parser.OPTIONS) as GrammarAST | null;
        if (options !== null && options.getChildCount() > 0) {
            for (const o of options.getChildren()) {
                const c = o as GrammarAST;
                if (c.getType() === ANTLRv4Parser.ASSIGN && c.getChild(0)?.getText() === option) {
                    return c.getChild(1) as GrammarAST;
                }
            }
        }

        return null;
    }

    public processGrammarsOnCommandLine(): void {
        const sortedGrammars = this.sortGrammarByTokenVocab(this.grammarFiles);

        for (const t of sortedGrammars) {
            const g = this.createGrammar(t);
            // TODO: g.fileName = t.fileName;
            if (grammarOptions.generateDependencies) {
                const dep = new BuildDependencyGenerator(this, g);
                console.log(dep.getDependencies().render());
            } else {
                if (ErrorManager.get().errors === 0) {
                    this.process(g, true);
                }
            }
        }
    };

    /**
     * To process a grammar, we load all of its imported grammars into
     * subordinate grammar objects. Then we merge the imported rules
     * into the root grammar. If a root grammar is a combined grammar,
     * we have to extract the implicit lexer. Once all this is done, we
     * process the lexer first, if present, and then the parser grammar
     */
    public process(g: Grammar, genCode: boolean): void {
        g.loadImportedGrammars(new Set());

        const transform = new GrammarTransformPipeline(g, this);
        transform.process();

        let lexerGrammar: LexerGrammar;
        let lexerContext: GrammarSpecContext | undefined;
        if (g.parseTree?.grammarDecl().grammarType().GRAMMAR()) {
            lexerContext = transform.extractImplicitLexer(g); // alters g.ast
            if (lexerContext) {
                lexerGrammar = ClassFactory.createLexerGrammar(this, lexerContext);
                lexerGrammar.fileName = g.fileName;
                lexerGrammar.originalGrammar = g;
                g.implicitLexer = lexerGrammar;
                lexerGrammar.implicitLexerOwner = g;
                this.processNonCombinedGrammar(lexerGrammar, genCode);
            }
        }

        g.importVocab(g.implicitLexer);

        this.processNonCombinedGrammar(g, genCode);
    }

    public processNonCombinedGrammar(g: Grammar, genCode: boolean): void {
        if (!g.parseTree) {
            return;
        }

        const ruleFail = this.checkForRuleIssues(g);
        if (ruleFail) {
            return;
        }

        const prevErrors = ErrorManager.get().errors;

        // MAKE SURE GRAMMAR IS SEMANTICALLY CORRECT (FILL IN GRAMMAR OBJECT)
        const sem = new SemanticPipeline(g);
        sem.process();

        if (ErrorManager.get().errors > prevErrors) {
            return;
        }

        const codeGenerator = new CodeGenerator(this, g, g.getLanguage());

        // BUILD ATN FROM AST
        let factory: IATNFactory;
        if (g.isLexer()) {
            factory = new LexerATNFactory(g as LexerGrammar, codeGenerator);
        } else {
            factory = new ParserATNFactory(g);
        }

        g.atn = factory.createATN();
        if (grammarOptions.generateATNDot) {
            this.generateATNs(g);
        }

        if (genCode && g.tool.getNumErrors() === 0) {
            const interpFile = Tool.generateInterpreterData(g);
            try {
                const fileName = this.getOutputFile(g, g.name + ".interp");
                writeFileSync(fileName, interpFile);
            } catch (ioe) {
                ErrorManager.get().toolError(ErrorType.CANNOT_WRITE_FILE, ioe);
            }
        }

        // PERFORM GRAMMAR ANALYSIS ON ATN: BUILD DECISION DFAs
        const anal = new AnalysisPipeline(g);
        anal.process();

        if (g.tool.getNumErrors() > prevErrors) {
            return;
        }

        // GENERATE CODE
        if (genCode) {
            const gen = new CodeGenPipeline(g, codeGenerator);
            gen.process();
        }
    }

    /**
     * Important enough to avoid multiple definitions that we do very early,
     * right after AST construction. Also check for undefined rules in
     * parser/lexer to avoid exceptions later. Return true if we find multiple
     * definitions of the same rule or a reference to an undefined rule or
     * parser rule ref in lexer rule.
     */
    public checkForRuleIssues(g: Grammar): boolean {
        // check for redefined rules
        const rules: ParserRuleContext[] = [];
        g.parseTree!.rules().ruleSpec().forEach((ruleSpec: RuleSpecContext) => {
            if (ruleSpec.parserRuleSpec()) {
                rules.push(ruleSpec.parserRuleSpec()!);
            } else if (ruleSpec.lexerRuleSpec()) {
                rules.push(ruleSpec.lexerRuleSpec()!);
            }
        });
        g.parseTree!.modeSpec().forEach((modeSpec) => {
            modeSpec.lexerRuleSpec().forEach((lexerRuleSpec) => {
                rules.push(lexerRuleSpec);
            });
        });

        let redefinition = false;
        const ruleToContext = new Map<string, ParserRuleContext>();
        for (const rule of rules) {
            const id = rule.getChild(0) as GrammarAST;
            const ruleName = id.getText();
            const prev = ruleToContext.get(ruleName);
            if (prev) {
                const prevChild = prev.getChild(0) as GrammarAST;
                ErrorManager.get().grammarError(ErrorType.RULE_REDEFINITION, g.fileName, id.token!, ruleName,
                    prevChild.token!.line);
                redefinition = true;
                continue;
            }
            ruleToContext.set(ruleName, rule);
        }

        const chk = new UndefChecker(g.isLexer());
        chk.visitGrammar(g.parseTree!);

        return redefinition; // || chk.badRef;
    }

    public sortGrammarByTokenVocab(fileNames: string[]): GrammarSpecContext[] {
        const g = new Graph();
        const roots = new Array<GrammarSpecContext>();
        for (const fileName of fileNames) {
            const t = this.parseGrammar(fileName);
            if (!t) {
                continue;
            }

            const root = t[0];
            roots.push(root);
            // TODO: root.fileName = fileName;
            const grammarName = root.grammarDecl().identifier().getText();

            // Look for tokenVocab option in the grammar
            let tokenVocabNode: OptionContext | undefined;
            const prequels = root.prequelConstruct();
            prequels.forEach((prequel) => {
                if (prequel.optionsSpec()) {
                    const options = prequel.optionsSpec()!.option();
                    for (const option of options) {
                        if (option.identifier().getText() === "tokenVocab") {
                            tokenVocabNode = option;
                            break;
                        }
                    }
                }
            });

            // Make grammars depend on any tokenVocab options.
            if (tokenVocabNode) {
                let vocabName = tokenVocabNode.optionValue().getText();

                // Strip quote characters if any.
                const len = vocabName.length;
                const firstChar = vocabName.charAt(0);
                const lastChar = vocabName.charAt(len - 1);
                if (len >= 2 && firstChar === "'" && lastChar === "'") {
                    vocabName = vocabName.substring(1, len - 1);
                }

                // If the name contains a path delimited by forward slashes,
                // use only the part after the last slash as the name
                const lastSlash = vocabName.lastIndexOf("/");
                if (lastSlash >= 0) {
                    vocabName = vocabName.substring(lastSlash + 1);
                }
                g.addEdge(grammarName, vocabName);
            }
            // add cycle to graph so we always process a grammar if no error
            // even if no dependency
            g.addEdge(grammarName, grammarName);
        }

        const sortedGrammarNames = g.sort();

        const sortedRoots = new Array<GrammarSpecContext>();
        for (const grammarName of sortedGrammarNames) {
            for (const root of roots) {
                if (root.grammarDecl().identifier().getText() === grammarName) {
                    sortedRoots.push(root);
                    break;
                }
            }
        }

        return sortedRoots;
    };

    /**
         Given the raw AST of a grammar, create a grammar object
        associated with the AST. Once we have the grammar object, ensure
        that all nodes in tree referred to this grammar. Later, we will
        use it for error handling and generally knowing from where a rule
        comes from.
     */
    public createGrammar(context: GrammarSpecContext): IGrammar {
        let g: IGrammar;
        if (context.grammarDecl().grammarType().LEXER() !== null) {
            g = ClassFactory.createLexerGrammar(this, context);
        } else {
            g = ClassFactory.createGrammar(this, context);
        }

        // ensure each node has pointer to surrounding grammar
        // TODO: GrammarTransformPipeline.setGrammarPtr(g, context);

        return g;
    }

    public parseGrammar(fileName: string): [GrammarSpecContext, TokenStream] | undefined {
        try {
            const fullPath = path.join(this.inputDirectory, fileName);
            const content = readFileSync(fullPath, { encoding: grammarOptions.grammarEncoding as BufferEncoding });
            const input = CharStream.fromString(content.toString());

            return this.parse(fileName, input);
        } catch (ioe) {
            ErrorManager.get().toolError(ErrorType.CANNOT_OPEN_FILE, ioe, fileName);
            throw ioe;
        }
    }

    /**
     * Convenience method to load and process an ANTLR grammar. Useful
     *  when creating interpreters.  If you need to access to the lexer
     *  grammar created while processing a combined grammar, use
     *  getImplicitLexer() on returned grammar.
     */
    public loadGrammar(fileName: string): Grammar {
        const [grammarSpecContext] = this.parseGrammar(fileName)!;
        const g = this.createGrammar(grammarSpecContext);
        g.fileName = fileName;
        this.process(g, false);

        return g;
    }

    /**
     * Try current dir then dir of g then lib dir
     *
     * @param g The grammar to import.
     * @param nameNode The node associated with the imported grammar name.
     */
    public loadImportedGrammar(g: Grammar, nameNode: IdentifierContext): Grammar | null {
        const name = nameNode.getText();
        let imported = this.importedGrammars.get(name);
        if (!imported) {
            g.tool.logInfo({ component: "grammar", msg: `load ${name} from ${g.fileName}` });

            let importedFile;
            for (const extension of Tool.ALL_GRAMMAR_EXTENSIONS) {
                importedFile = this.getImportedGrammarFile(g, name + extension);
                if (importedFile) {
                    break;
                }
            }

            if (!importedFile) {
                ErrorManager.get().grammarError(ErrorType.CANNOT_FIND_IMPORTED_GRAMMAR, g.fileName, nameNode.start,
                    name);

                return null;
            }

            const grammarEncoding = grammarOptions.grammarEncoding as BufferEncoding;
            const content = readFileSync(importedFile, { encoding: grammarEncoding });
            const input = CharStream.fromString(content.toString());
            const result = this.parse(g.fileName, input);
            if (!result) {
                return null;
            }

            imported = this.createGrammar(result[0]);
            imported.fileName = importedFile;
            this.importedGrammars.set(result[0].grammarDecl().identifier().getText(), imported);
        }

        return imported;
    }

    public parseGrammarFromString(grammar: string): [GrammarSpecContext, TokenStream] | undefined {
        return this.parse("<string>", CharStream.fromString(grammar));
    }

    public parse(fileName: string, input: CharStream): [GrammarSpecContext, TokenStream] | undefined {
        const adaptor = new GrammarASTAdaptor(input);
        const lexer = new ToolANTLRLexer(input, this);
        const tokens = new CommonTokenStream(lexer);
        //lexer.tokens = tokens;
        const p = new ToolANTLRParser(tokens, this);
        //p.setTreeAdaptor(adaptor);

        const root = p.grammarSpec();

        return p.numberOfSyntaxErrors > 0 ? undefined : [root, tokens];
    }

    public generateATNs(g: Grammar): void {
        const dotGenerator = new DOTGenerator(g);
        const grammars = new Array<Grammar>();
        grammars.push(g);
        const imported = g.getAllImportedGrammars();
        grammars.push(...imported);

        for (const ig of grammars) {
            for (const r of ig.rules.values()) {
                try {
                    const dot = dotGenerator.getDOTFromState(g.atn.ruleToStartState[r.index]!, g.isLexer());
                    this.writeDOTFile(g, r, dot);
                } catch (ioe) {
                    ErrorManager.get().toolError(ErrorType.CANNOT_WRITE_FILE, ioe);
                    throw ioe;
                }
            }
        }
    }

    /**
     * This method is used by all code generators to create new output
     *  files. If the outputDir set by -o is not present it will be created.
     *  The final filename is sensitive to the output directory and
     *  the directory where the grammar file was found.  If -o is /tmp
     *  and the original grammar file was foo/t.g4 then output files
     *  go in /tmp/foo.
     *
     *  The output dir -o spec takes precedence if it's absolute.
     *  E.g., if the grammar file dir is absolute the output dir is given
     *  precedence. "-o /tmp /usr/lib/t.g4" results in "/tmp/T.java" as
     *  output (assuming t.g4 holds T.java).
     *
     *  If no -o is specified, then just write to the directory where the
     *  grammar file was found.
     *
     *  If outputDirectory==null then write a String.
     */
    public getOutputFile(g: Grammar, fileName: string): string {
        const outputDirectory = grammarOptions.outputDirectory;
        if (!outputDirectory) {
            return "";
        }

        // output directory is a function of where the grammar file lives
        // for subDir/T.g4, you get subDir here.  Well, depends on -o etc...
        const outputDir = this.getOutputDirectory(g.fileName);
        const outputFile = path.join(outputDir, fileName);

        if (!existsSync(outputDir)) {
            mkdirSync(outputDir, { recursive: true });
        }

        return outputFile;
    }

    public getImportedGrammarFile(g: Grammar, fileName: string): string | undefined {
        let importedFile = path.join(this.inputDirectory, fileName);
        if (!existsSync(importedFile)) {
            const parentDir = basename(importedFile); // Check the parent dir of input directory.
            importedFile = path.join(parentDir, fileName);
            if (!existsSync(importedFile)) { // try in lib dir
                const libDirectory = grammarOptions.libDirectory;
                if (libDirectory) {
                    importedFile = path.join(libDirectory, fileName);
                    if (!existsSync(importedFile)) {
                        return undefined;
                    }
                }
            }
        }

        return importedFile;
    }

    /**
     * Return the location where ANTLR will generate output files for a given
     * file. This is a base directory and output files will be relative to
     * here in some cases such as when -o option is used and input files are
     * given relative to the input directory.
     *
     * @param fileNameWithPath path to input source
     */
    public getOutputDirectory(fileNameWithPath: string): string {
        if (this.haveOutputDir) {
            return grammarOptions.outputDirectory ?? "";
        } else {
            return path.dirname(fileNameWithPath);
        }
    }

    public logInfo(info: { component?: string, msg: string; }): void {
        this.logMgr.log(info);
    }

    public getNumErrors(): number {
        return ErrorManager.get().errors;
    }

    public exit(e: number): void {
        process.exit(e);
    }

    public panic(): void {
        throw new Error("ANTLR panic");
    }

    protected writeDOTFile(g: Grammar, rulOrName: Rule | string, dot: string): void {
        const name = rulOrName instanceof Rule ? rulOrName.g.name + "." + rulOrName.name : rulOrName;
        const fileName = this.getOutputFile(g, name + ".dot");
        writeFileSync(fileName, dot);
    }

    static {
        ClassFactory.createTool = () => {
            return new Tool();
        };
    }
}