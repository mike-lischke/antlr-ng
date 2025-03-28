/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { Token } from "antlr4ng";
import { AutoIndentWriter, ST, StringWriter, type IST, type STGroup } from "stringtemplate4ts";

import { Constants } from "../Constants.js";
import { Tool } from "../Tool.js";
import { Grammar } from "../tool/Grammar.js";
import { IssueCode } from "../tool/Issues.js";
import { OutputModelObject } from "./model/OutputModelObject.js";
import { OutputModelController } from "./OutputModelController.js";
import { OutputModelWalker } from "./OutputModelWalker.js";
import { ParserFactory } from "./ParserFactory.js";
import { Target } from "./Target.js";

// Possible targets:
import { fileSystem } from "../tool-parameters.js";
import { CppTarget } from "./target/CppTarget.js";
import { CSharpTarget } from "./target/CSharpTarget.js";
import { DartTarget } from "./target/DartTarget.js";
import { GoTarget } from "./target/GoTarget.js";
import { JavaScriptTarget } from "./target/JavaScriptTarget.js";
import { JavaTarget } from "./target/JavaTarget.js";
import { PHPTarget } from "./target/PHPTarget.js";
import { Python3Target } from "./target/Python3Target.js";
import { SwiftTarget } from "./target/SwiftTarget.js";
import { TypeScriptTarget } from "./target/TypeScriptTarget.js";
import type { IToolConfiguration } from "../config/config.js";

export const targetLanguages = [
    "Cpp", "CSharp", "Dart", "Go", "JavaScript", "Java", "PHP", "Python3", "Swift", "TypeScript"
] as const;

export type SupportedLanguage = typeof targetLanguages[number];

/**  General controller for code gen.  Can instantiate sub generator(s). */
export class CodeGenerator {
    private static readonly vocabFilePattern =
        "<tokens.keys:{t | <t>=<tokens.(t)>\n}>" +
        "<literals.keys:{t | <t>=<literals.(t)>\n}>";

    private static languageMap = new Map<SupportedLanguage, new (generator: CodeGenerator) => Target>([
        ["Cpp", CppTarget],
        ["CSharp", CSharpTarget],
        ["Dart", DartTarget],
        ["Go", GoTarget],
        ["JavaScript", JavaScriptTarget],
        ["Java", JavaTarget],
        ["PHP", PHPTarget],
        ["Python3", Python3Target],
        ["Swift", SwiftTarget],
        ["TypeScript", TypeScriptTarget],
    ]);

    public target: Target;
    public readonly g?: Grammar;
    public readonly language: SupportedLanguage;

    private readonly tool?: Tool;
    private readonly lineWidth = 72;

    public constructor(grammarOrLanguage: Grammar | SupportedLanguage) {
        this.g = grammarOrLanguage instanceof Grammar ? grammarOrLanguage : undefined;
        this.tool = this.g?.tool;

        this.language = (grammarOrLanguage instanceof Grammar) ? this.g!.getLanguage() : grammarOrLanguage;
        this.target = new (CodeGenerator.languageMap.get(this.language)!)(this);
    }

    public get templates(): STGroup {
        return this.target.templates;
    }

    public generateLexer(toolConfiguration: IToolConfiguration, header?: boolean): IST {
        this.ensureAtnExists();
        header ??= false;

        return this.walk(this.createController(toolConfiguration.atn)
            .buildLexerOutputModel(header, toolConfiguration), header);

    }

    public generateParser(toolConfiguration: IToolConfiguration, header?: boolean): IST {
        this.ensureAtnExists();
        header ??= false;

        return this.walk(this.createController().buildParserOutputModel(header, toolConfiguration), header);
    }

    public generateListener(toolConfiguration: IToolConfiguration, header?: boolean): IST {
        this.ensureAtnExists();
        header ??= false;

        return this.walk(this.createController().buildListenerOutputModel(header, toolConfiguration), header);

    }

    public generateBaseListener(toolConfiguration: IToolConfiguration, header?: boolean): IST {
        this.ensureAtnExists();
        header ??= false;

        return this.walk(this.createController().buildBaseListenerOutputModel(header, toolConfiguration), header);
    }

    public generateVisitor(toolConfiguration: IToolConfiguration, header?: boolean): IST {
        this.ensureAtnExists();
        header ??= false;

        return this.walk(this.createController().buildVisitorOutputModel(header, toolConfiguration), header);
    }

    public generateBaseVisitor(toolConfiguration: IToolConfiguration, header?: boolean): IST {
        this.ensureAtnExists();
        header ??= false;

        return this.walk(this.createController().buildBaseVisitorOutputModel(header, toolConfiguration), header);
    }

    public writeRecognizer(outputFileST: IST, header: boolean): void {
        this.target.genFile(this.g, outputFileST, this.getRecognizerFileName(header));
    }

    public writeListener(outputFileST: IST, header: boolean): void {
        this.target.genFile(this.g, outputFileST, this.getListenerFileName(header));
    }

    public writeBaseListener(outputFileST: IST, header: boolean): void {
        this.target.genFile(this.g, outputFileST, this.getBaseListenerFileName(header));
    }

    public writeVisitor(outputFileST: IST, header: boolean): void {
        this.target.genFile(this.g, outputFileST, this.getVisitorFileName(header));
    }

    public writeBaseVisitor(outputFileST: IST, header: boolean): void {
        this.target.genFile(this.g, outputFileST, this.getBaseVisitorFileName(header));
    }

    public writeVocabFile(): void {
        // write out the vocab interchange file; used by antlr,
        // does not change per target
        const tokenVocabSerialization = this.getTokenVocabOutput();
        const fileName = this.getVocabFileName();
        if (fileName !== undefined) {
            this.target.genFile(this.g, tokenVocabSerialization, fileName);
        }
    }

    public write(code: IST, fileName: string): void {
        if (this.tool === undefined) {
            return;
        }

        try {
            fileName = this.tool.getOutputFile(this.g!, fileName);
            const w = new StringWriter();
            const wr = new AutoIndentWriter(w);
            wr.setLineWidth(this.lineWidth);
            code.write(wr);

            fileSystem.writeFileSync(fileName, w.toString(), { encoding: "utf8" });
        } catch (cause) {
            if (cause instanceof Error) {
                this.g!.tool.errorManager.toolError(IssueCode.CannotWriteFile, cause, fileName);
            } else {
                throw cause;
            }
        }
    }

    public getRecognizerFileName(header?: boolean): string {
        header ??= false;

        return this.target.getRecognizerFileName(header);
    }

    public getListenerFileName(header?: boolean): string {
        header ??= false;

        return this.target.getListenerFileName(header);
    }

    public getVisitorFileName(header?: boolean): string {
        header ??= false;

        return this.target.getVisitorFileName(header);
    }

    public getBaseListenerFileName(header?: boolean): string {
        header ??= false;

        return this.target.getBaseListenerFileName(header);
    }

    public getBaseVisitorFileName(header?: boolean): string {
        header ??= false;

        return this.target.getBaseVisitorFileName(header);
    }

    /**
     * What is the name of the vocab file generated for this grammar?
     *
     * @returns undefined if no ".tokens" file should be generated.
     */
    public getVocabFileName(): string | undefined {
        return this.g!.name + Constants.VocabFileExtension;
    }

    public getHeaderFileName(): string | undefined {
        const extST = this.templates.getInstanceOf("headerFileExtension");
        if (extST === null) {
            return undefined;
        }

        const recognizerName = this.g!.getRecognizerName();

        return recognizerName + extST.render();
    }

    /**
     * Generates a token vocab file with all the token names/types. For example:
     * ```
     *  ID=7
     *  FOR=8
     *  'for'=8
     * ```
     * This is independent of the target language and used by antlr internally.
     *
     * @returns The token vocab file as a string template.
     */
    protected getTokenVocabOutput(): ST {
        const vocabFileST = new ST(CodeGenerator.vocabFilePattern);
        const tokens = new Map<string, number>();

        // Make constants for the token names.
        for (const [key, value] of this.g!.tokenNameToTypeMap) {
            if (value >= Token.MIN_USER_TOKEN_TYPE) {
                tokens.set(key, value);
            }
        }
        vocabFileST.add("tokens", tokens);

        // Now dump the strings.
        const literals = new Map<string, number>();
        for (const [key, value] of this.g!.stringLiteralToTypeMap) {
            if (value >= Token.MIN_USER_TOKEN_TYPE) {
                literals.set(key, value);
            }
        }
        vocabFileST.add("literals", literals);

        return vocabFileST;
    }

    // CREATE TEMPLATES BY WALKING MODEL

    private createController(forceAtn?: boolean): OutputModelController {
        const factory = new ParserFactory(this, forceAtn);
        const controller = new OutputModelController(factory);
        factory.controller = controller;

        return controller;
    }

    private walk(outputModel: OutputModelObject, header: boolean): IST {
        if (this.tool === undefined) {
            throw new Error("Tool is undefined.");
        }

        const walker = new OutputModelWalker(this.tool, this.templates);

        return walker.walk(outputModel, header);
    }

    private ensureAtnExists(): void {
        if (this.g === undefined) {
            throw new Error("Grammar is undefined.");
        }

        if (this.g.atn === undefined) {
            throw new Error("ATN is undefined.");
        }
    }
}
