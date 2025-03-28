/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import {
    AutoIndentWriter, InstanceScope, Interpreter, ST, StringWriter, type IErrorManager, type ISTGroup, type STWriter
} from "stringtemplate4ts";

import { LexerATNFactory } from "../src/automata/LexerATNFactory.js";
import { ParserATNFactory } from "../src/automata/ParserATNFactory.js";
import { CodeGenerator } from "../src/codegen/CodeGenerator.js";
import { SemanticPipeline } from "../src/semantics/SemanticPipeline.js";
import type { IToolParameters } from "../src/tool-parameters.js";
import { Grammar, type LexerGrammar } from "../src/tool/index.js";

describe("TestCodeGeneration", () => {

    /** Add tags around each attribute/template/value write */
    // eslint-disable-next-line @typescript-eslint/naming-convention
    const DebugInterpreter = class DebugInterpreter extends Interpreter {
        public evals = new Array<string>();

        protected myErrMgrCopy: IErrorManager;
        protected tab = 0;

        public constructor(group: ISTGroup, errMgr: IErrorManager, debug: boolean) {
            super(group, errMgr); //, debug);
            this.myErrMgrCopy = errMgr;
        }

        protected override indent(out: STWriter): void {
            for (let i = 1; i <= this.tab; i++) {
                out.write("\t");
            }
        }

        protected override writeObject(out: STWriter, scope: InstanceScope, o: object, options: string[]): number {
            if (o instanceof ST) {
                let name = (o).getName();
                name = name.substring(1);
                if (!name.startsWith("_sub")) {
                    out.write("<ST:" + name + ">");
                    this.evals.push("<ST:" + name + ">");
                    const r = super.writeObject(out, scope, o, options);
                    out.write("</ST:" + name + ">");
                    this.evals.push("</ST:" + name + ">");

                    return r;
                }
            }

            return super.writeObject(out, scope, o, options);
        }

        protected override writePOJO(out: STWriter, scope: InstanceScope, o: object, options: string[]): number {
            const name = o.constructor.name;
            out.write("<pojo:" + name + ">" + JSON.stringify(o) + "</pojo:" + name + ">");
            this.evals.push("<pojo:" + name + ">" + JSON.stringify(o) + "</pojo:" + name + ">");

            return super.writePOJO(out, scope, o, options);
        };
    };

    const getEvalInfoForString = (grammarString: string, pattern: string): string[] => {
        const g = new Grammar(grammarString);
        g.tool.process(g, {} as IToolParameters, false);

        const evals: string[] = [];
        if (!g.ast.hasErrors) {
            const sem = new SemanticPipeline(g);
            sem.process();

            let factory = new ParserATNFactory(g);
            if (g.isLexer()) {
                factory = new LexerATNFactory(g as LexerGrammar);
            }

            g.atn = factory.createATN();

            const gen = new CodeGenerator(g);
            const outputFileST = gen.generateParser(g.tool.toolConfiguration);

            const debug = false;
            const interp = new DebugInterpreter(outputFileST.groupThatCreatedThisInstance,
                outputFileST.impl!.nativeGroup.errMgr, debug);
            const scope = new InstanceScope(undefined, outputFileST as ST);
            const sw = new StringWriter();
            const out = new AutoIndentWriter(sw);
            interp.exec(out, scope);

            for (const e of interp.evals) {
                if (e.includes(pattern)) {
                    evals.push(e);
                }
            }
        }

        return evals;
    };

    it("testArgDecl", (): void => { // should use template not string
        const g =
            "grammar T;\n" +
            "a[int xyz] : 'a' ;\n";

        const evals = getEvalInfoForString(g, "int xyz");
        for (const entry of evals) {
            expect(entry.startsWith("<pojo:"), "eval should not be POJO: " + entry).toBe(false);
        }
    });

    it("AssignTokenNamesToStringLiteralsInGeneratedParserRuleContexts", (): void => {
        const g =
            "grammar T;\n" +
            "root: 't1';\n" +
            "Token: 't1';";

        const evals = getEvalInfoForString(g, "() { return getToken(");
        expect(evals.length).toBeGreaterThan(0);
    });

    it("AssignTokenNamesToStringLiteralArraysInGeneratedParserRuleContexts", (): void => {
        const g =
            "grammar T;\n" +
            "root: 't1' 't1';\n" +
            "Token: 't1';";

        const evals = getEvalInfoForString(g, "() { return getTokens(");
        expect(evals.length).toBeGreaterThan(0);
    });

});
