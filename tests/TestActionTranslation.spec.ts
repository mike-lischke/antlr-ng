/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

// cspell: ignore xmltag fdkj

import { STGroupString } from "stringtemplate4ts";
import { describe, expect, it } from "vitest";

import "../src/Tool.js"; // To kick off the loading of the tool

import { AnalysisPipeline } from "../src/analysis/AnalysisPipeline.js";
import { LexerATNFactory } from "../src/automata/LexerATNFactory.js";
import { ParserATNFactory } from "../src/automata/ParserATNFactory.js";
import { CodeGenerator } from "../src/codegen/CodeGenerator.js";
import type { IToolConfiguration } from "../src/config/config.js";
import { SemanticPipeline } from "../src/semantics/SemanticPipeline.js";
import { Grammar } from "../src/tool/Grammar.js";
import type { LexerGrammar } from "../src/tool/LexerGrammar.js";
import { ErrorQueue } from "./support/ErrorQueue.js";

describe("TestActionTranslation", () => {
    const attributeTemplate =
        "attributeTemplate(members,init,inline,finally,inline2) ::= <<\n" +
        "parser grammar A;\n" +
        "@members {#members#<members>#end-members#}\n" +
        "a[int x, int x1] returns [int y]\n" +
        "@init {#init#<init>#end-init#}\n" +
        "    :   id=ID ids+=ID lab=b[34] c d {\n" +
        "		 #inline#<inline>#end-inline#\n" +
        "		 }\n" +
        "		 c\n" +
        "    ;\n" +
        "    finally {#finally#<finally>#end-finally#}\n" +
        "b[int d] returns [int e]\n" +
        "    :   {#inline2#<inline2>#end-inline2#}\n" +
        "    ;\n" +
        "c returns [int x, int y] : ;\n" +
        "d	 :   ;\n" +
        ">>";

    const testActions = (templates: string, actionName: string, action: string, expected: string): void => {
        const lp = templates.indexOf("(");
        const name = templates.substring(0, lp);
        const group = new STGroupString(templates);
        const st = group.getInstanceOf(name)!;
        st.add(actionName, action);
        const grammar = st.render();
        const g = new Grammar(grammar);

        const errorQueue = new ErrorQueue(g.tool.errorManager);
        g.tool.errorManager.addListener(errorQueue);

        const parameters: IToolConfiguration = {
            outputDirectory: "/",
            grammarFiles: [],
            language: "Java",
        };
        g.tool.process(g, parameters, false);

        if (!g.ast.hasErrors) {
            const sem = new SemanticPipeline(g);
            sem.process();

            let factory = new ParserATNFactory(g);
            if (g.isLexer()) {
                factory = new LexerATNFactory(g as LexerGrammar);
            }

            g.atn = factory.createATN();

            const pipeline = new AnalysisPipeline(g);
            pipeline.process();

            const gen = new CodeGenerator(g);
            const outputFileST = gen.generateParser(g.tool.toolConfiguration, false);
            const output = outputFileST.render(72);

            const b = "#" + actionName + "#";
            const start = output.indexOf(b);
            const e = "#end-" + actionName + "#";
            const end = output.indexOf(e);
            const snippet = output.substring(start + b.length, end);
            expect(snippet).toEqual(expected);
        }
    };

    it("testEscapedLessThanInAction", (): void => {
        const action = "i<3; '<xmltag>'";
        const expected = "i<3; '<xmltag>'";
        testActions(attributeTemplate, "members", action, expected);
        testActions(attributeTemplate, "init", action, expected);
        testActions(attributeTemplate, "inline", action, expected);
        testActions(attributeTemplate, "finally", action, expected);
        testActions(attributeTemplate, "inline2", action, expected);
    });

    it("testEscapedInAction", (): void => {
        const action = "int \\$n; \"\\$in string\\$\"";
        const expected = "int $n; \"$in string$\"";
        testActions(attributeTemplate, "members", action, expected);
        testActions(attributeTemplate, "init", action, expected);
        testActions(attributeTemplate, "inline", action, expected);
        testActions(attributeTemplate, "finally", action, expected);
        testActions(attributeTemplate, "inline2", action, expected);
    });

    /**
     * Regression test for "in antlr v4 lexer, $ translation issue in action".
     * https://github.com/antlr/antlr4/issues/176
     */
    it("testUnescapedInAction", (): void => {
        const action = "\\$string$";
        const expected = "$string$";
        testActions(attributeTemplate, "members", action, expected);
        testActions(attributeTemplate, "init", action, expected);
        testActions(attributeTemplate, "inline", action, expected);
        testActions(attributeTemplate, "finally", action, expected);
        testActions(attributeTemplate, "inline2", action, expected);
    });

    it("testEscapedSlash", (): void => {
        const action = "x = '\\n';"; // x = '\n'; -> x = '\n';
        const expected = "x = '\\n';";
        testActions(attributeTemplate, "members", action, expected);
        testActions(attributeTemplate, "init", action, expected);
        testActions(attributeTemplate, "inline", action, expected);
        testActions(attributeTemplate, "finally", action, expected);
        testActions(attributeTemplate, "inline2", action, expected);
    });

    it("testComplicatedArgParsing", (): void => {
        const action = "x, (*a).foo(21,33), 3.2+1, '\\n', " +
            "\"a,oo\\nick\", {bl, \"fdkj\"eck}";
        const expected = "x, (*a).foo(21,33), 3.2+1, '\\n', " +
            "\"a,oo\\nick\", {bl, \"fdkj\"eck}";
        testActions(attributeTemplate, "members", action, expected);
        testActions(attributeTemplate, "init", action, expected);
        testActions(attributeTemplate, "inline", action, expected);
        testActions(attributeTemplate, "finally", action, expected);
        testActions(attributeTemplate, "inline2", action, expected);
    });

    it("testComplicatedArgParsingWithTranslation", (): void => {
        const action = "x, $ID.text+\"3242\", (*$ID).foo(21,33), 3.2+1, '\\n', " +
            "\"a,oo\\nick\", {bl, \"fdkj\"eck}";
        const expected =
            "x, (((AContext)_localctx).ID!=null?((AContext)_localctx).ID.getText():null)+\"3242\", " +
            "(*((AContext)_localctx).ID).foo(21,33), 3.2+1, '\\n', \"a,oo\\nick\", {bl, \"fdkj\"eck}";
        testActions(attributeTemplate, "inline", action, expected);
    });

    it("testArguments", (): void => {
        const action = "$x; $ctx.x";
        const expected = "_localctx.x; _localctx.x";
        testActions(attributeTemplate, "inline", action, expected);
    });

    it("testReturnValue", (): void => {
        const action = "$y; $ctx.y";
        const expected = "_localctx.y; _localctx.y";
        testActions(attributeTemplate, "inline", action, expected);
    });

    it("testReturnValueWithNumber", (): void => {
        const action = "$ctx.x1";
        const expected = "_localctx.x1";
        testActions(attributeTemplate, "inline", action, expected);
    });

    it("testReturnValuesCurrentRule", (): void => {
        const action = "$y; $ctx.y;";
        const expected = "_localctx.y; _localctx.y;";
        testActions(attributeTemplate, "inline", action, expected);
    });

    it("testReturnValues", (): void => {
        const action = "$lab.e; $b.e; $y.e = \"\";";
        const expected = "((AContext)_localctx).lab.e; ((AContext)_localctx).b.e; _localctx.y.e = \"\";";
        testActions(attributeTemplate, "inline", action, expected);
    });

    it("testReturnWithMultipleRuleRefs", (): void => {
        const action = "$c.x; $c.y;";
        const expected = "((AContext)_localctx).c.x; ((AContext)_localctx).c.y;";
        testActions(attributeTemplate, "inline", action, expected);
    });

    it("testTokenRefs", (): void => {
        const action = "$id; $ID; $id.text; $id.getText(); $id.line;";
        const expected = "((AContext)_localctx).id; ((AContext)_localctx).ID; (((AContext)_localctx).id!=" +
            "null?((AContext)_localctx).id.getText():null); ((AContext)_localctx).id.getText(); " +
            "(((AContext)_localctx).id!=null?((AContext)_localctx).id.getLine():0);";
        testActions(attributeTemplate, "inline", action, expected);
    });

    it("testRuleRefs", (): void => {
        const action = "$lab.start; $c.text;";
        const expected = "(((AContext)_localctx).lab!=null?(((AContext)_localctx).lab.start):null); " +
            "(((AContext)_localctx).c!=null?_input.getText(((AContext)_localctx).c.start,((AContext)_localctx)." +
            "c.stop):null);";
        testActions(attributeTemplate, "inline", action, expected);
    });

    /** Added in response to https://github.com/antlr/antlr4/issues/1211 */
    it("testUnknownAttr", (): void => {
        const action = "$qqq.text";
        const expected = ""; // was causing an exception
        testActions(attributeTemplate, "inline", action, expected);
    });

    /**
     * Regression test for issue #1295
     * $e.v yields incorrect value 0 in "e returns [int v] : '1' {$v = 1;} | '(' e ')' {$v = $e.v;} ;"
     * https://github.com/antlr/antlr4/issues/1295
     */
    it("testRuleRefsRecursive", (): void => {
        const recursiveTemplate =
            "recursiveTemplate(inline) ::= <<\n" +
            "parser grammar A;\n" +
            "e returns [int v]\n" +
            "    :   INT {$v = $INT.int;}\n" +
            "    |   '(' e ')' {\n" +
            "		 #inline#<inline>#end-inline#\n" +
            "		 }\n" +
            "    ;\n" +
            ">>";
        const leftRecursiveTemplate =
            "recursiveTemplate(inline) ::= <<\n" +
            "parser grammar A;\n" +
            "e returns [int v]\n" +
            "    :   a=e op=('*'|'/') b=e  {$v = eval($a.v, $op.type, $b.v);}\n" +
            "    |   INT {$v = $INT.int;}\n" +
            "    |   '(' e ')' {\n" +
            "		 #inline#<inline>#end-inline#\n" +
            "		 }\n" +
            "    ;\n" +
            ">>";

        // ref to value returned from recursive call to rule
        let action = "$v = $e.v;";
        let expected = "((EContext)_localctx).v = ((EContext)_localctx).e.v;";
        testActions(recursiveTemplate, "inline", action, expected);
        testActions(leftRecursiveTemplate, "inline", action, expected);

        // ref to predefined attribute obtained from recursive call to rule
        action = "$v = $e.text.length();";
        expected = "((EContext)_localctx).v = (((EContext)_localctx).e!=null?_input.getText(((EContext)_localctx)." +
            "e.start,((EContext)_localctx).e.stop):null).length();";
        testActions(recursiveTemplate, "inline", action, expected);
        testActions(leftRecursiveTemplate, "inline", action, expected);
    });

    it("testRefToTextAttributeForCurrentRule", (): void => {
        const action = "$ctx.text; $text";

        // this is the expected translation for all cases
        const expected =
            "_localctx.text; _input.getText(_localctx.start, _input.LT(-1))";

        testActions(attributeTemplate, "init", action, expected);
        testActions(attributeTemplate, "inline", action, expected);
        testActions(attributeTemplate, "finally", action, expected);
    });

    it("testEmptyActions", (): void => {
        const gS =
            "grammar A;\n" +
            "a[] : 'a' ;\n" +
            "c : a[] c[] ;\n";
        const _g = new Grammar(gS);
    });
});
