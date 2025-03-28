/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import type { IST } from "stringtemplate4ts";

import type { IToolConfiguration } from "../config/config.js";
import { Grammar } from "../tool/Grammar.js";
import { CodeGenerator } from "./CodeGenerator.js";

export class CodeGenPipeline {
    protected readonly g: Grammar;
    protected readonly gen: CodeGenerator;

    public constructor(g: Grammar, gen: CodeGenerator, private generateListener?: boolean,
        private generateVisitor?: boolean) {
        this.g = g;
        this.gen = gen;
    }

    public process(configuration: IToolConfiguration): void {
        // All templates are generated in memory to report the most complete error information possible, but actually
        // writing output files stops after the first error is reported.
        const errorCount = this.g.tool.errorManager.errors;

        if (this.g.isLexer()) {
            if (this.gen.target.needsHeader()) {
                const lexer = this.gen.generateLexer(configuration, true); // Header file if needed.
                if (this.g.tool.errorManager.errors === errorCount) {
                    this.writeRecognizer(lexer, this.gen, true);
                }
            }

            const lexer = this.gen.generateLexer(configuration, false);
            if (this.g.tool.errorManager.errors === errorCount) {
                this.writeRecognizer(lexer, this.gen, false);
            }
        } else {
            if (this.gen.target.needsHeader()) {
                const parser = this.gen.generateParser(configuration, true);
                if (this.g.tool.errorManager.errors === errorCount) {
                    this.writeRecognizer(parser, this.gen, true);
                }
            }

            const parser = this.gen.generateParser(configuration, false);
            if (this.g.tool.errorManager.errors === errorCount) {
                this.writeRecognizer(parser, this.gen, false);
            }

            if (this.generateListener) {
                if (this.gen.target.needsHeader()) {
                    const listener = this.gen.generateListener(configuration, true);
                    if (this.g.tool.errorManager.errors === errorCount) {
                        this.gen.writeListener(listener, true);
                    }
                }

                const listener = this.gen.generateListener(configuration, false);
                if (this.g.tool.errorManager.errors === errorCount) {
                    this.gen.writeListener(listener, false);
                }

                if (this.gen.target.needsHeader()) {
                    const baseListener = this.gen.generateBaseListener(configuration, true);
                    if (this.g.tool.errorManager.errors === errorCount) {
                        this.gen.writeBaseListener(baseListener, true);
                    }
                }

                if (this.gen.target.wantsBaseListener()) {
                    const baseListener = this.gen.generateBaseListener(configuration, false);
                    if (this.g.tool.errorManager.errors === errorCount) {
                        this.gen.writeBaseListener(baseListener, false);
                    }
                }
            }

            if (this.generateVisitor) {
                if (this.gen.target.needsHeader()) {
                    const visitor = this.gen.generateVisitor(configuration, true);
                    if (this.g.tool.errorManager.errors === errorCount) {
                        this.gen.writeVisitor(visitor, true);
                    }
                }

                const visitor = this.gen.generateVisitor(configuration, false);
                if (this.g.tool.errorManager.errors === errorCount) {
                    this.gen.writeVisitor(visitor, false);
                }

                if (this.gen.target.needsHeader()) {
                    const baseVisitor = this.gen.generateBaseVisitor(configuration, true);
                    if (this.g.tool.errorManager.errors === errorCount) {
                        this.gen.writeBaseVisitor(baseVisitor, true);
                    }
                }

                if (this.gen.target.wantsBaseVisitor()) {
                    const baseVisitor = this.gen.generateBaseVisitor(configuration, false);
                    if (this.g.tool.errorManager.errors === errorCount) {
                        this.gen.writeBaseVisitor(baseVisitor, false);
                    }
                }
            }
        }

        this.gen.writeVocabFile();
    }

    protected writeRecognizer(template: IST, gen: CodeGenerator, header: boolean): void {
        gen.writeRecognizer(template, header);
    }
}
