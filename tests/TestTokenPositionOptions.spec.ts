/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { IntervalSet, type Token } from "antlr4ng";
import { ANTLRv4Parser } from "../src/generated/ANTLRv4Parser.js";
import { Grammar } from "../src/tool/index.js";
import type { IToolParameters } from "../src/tool-parameters.js";

describe("TestTokenPositionOptions", () => {
    it("testLeftRecursionRewrite", () => {
        const g = new Grammar(
            "grammar T;\n" +
            "s : e ';' ;\n" +
            "e : e '*' e\n" +
            "  | e '+' e\n" +
            "  | e '.' ID\n" +
            "  | '-' e\n" +
            "  | ID\n" +
            "  ;\n" +
            "ID : [a-z]+ ;\n"
        );

        const parameters: IToolParameters = {
            grammarFiles: [],
            outputDirectory: "",
            define: { "language": "Java" },
        };
        g.tool.process(g, parameters, false);

        const expectedTree = "(COMBINED_GRAMMAR T (RULES (RULE s (BLOCK (ALT e ';'))) (RULE e (BLOCK (ALT (BLOCK " +
            "(ALT {} ('-' (ELEMENT_OPTIONS (= tokenIndex 43))) (e (ELEMENT_OPTIONS (= tokenIndex 45) (= p 2)))) " +
            "(ALT (ID (ELEMENT_OPTIONS (= tokenIndex 49))))) (* (BLOCK (ALT ({precpred(_ctx, 5)}? (ELEMENT_OPTIONS " +
            "(= p 5))) ('*' (ELEMENT_OPTIONS (= tokenIndex 21))) (e (ELEMENT_OPTIONS (= tokenIndex 23) (= p 6)))) " +
            "(ALT ({precpred(_ctx, 4)}? (ELEMENT_OPTIONS (= p 4))) ('+' (ELEMENT_OPTIONS (= tokenIndex 29))) (e " +
            "(ELEMENT_OPTIONS (= tokenIndex 31) (= p 5)))) (ALT ({precpred(_ctx, 3)}? (ELEMENT_OPTIONS (= p 3))) " +
            "('.' (ELEMENT_OPTIONS (= tokenIndex 37))) (ID (ELEMENT_OPTIONS (= tokenIndex 39)))))))))))";
        expect(g.ast.toStringTree()).toBe(expectedTree);

        const expectedElementTokens =
            "[@5,11:11='s',<9>,2:0]\n" +
            "[@9,15:15='e',<9>,2:4]\n" +
            "[@11,17:19='';'',<11>,2:6]\n" +
            "[@15,23:23='e',<9>,3:0]\n" +
            "[@43,64:66=''-'',<11>,6:4]\n" +
            "[@45,68:68='e',<9>,6:8]\n" +
            "[@49,74:75='ID',<13>,7:4]\n" +
            "[@21,29:31=''*'',<11>,3:6]\n" +
            "[@23,33:33='e',<9>,3:10]\n" +
            "[@29,41:43=''+'',<11>,4:6]\n" +
            "[@31,45:45='e',<9>,4:10]\n" +
            "[@37,53:55=''.'',<11>,5:6]\n" +
            "[@39,57:58='ID',<13>,5:10]";

        const types = new IntervalSet([ANTLRv4Parser.TOKEN_REF, ANTLRv4Parser.STRING_LITERAL, ANTLRv4Parser.RULE_REF]);
        const nodes = g.ast.getNodesWithTypePreorderDFS(types);
        const tokens: Token[] = [];
        for (const node of nodes) {
            tokens.push(node.token!);
        }

        expect(tokens.join("\n")).toBe(expectedElementTokens);
    });

    it("testLeftRecursionWithLabels", () => {
        const g = new Grammar(
            "grammar T;\n" +
            "s : e ';' ;\n" +
            "e : e '*' x=e\n" +
            "  | e '+' e\n" +
            "  | e '.' y=ID\n" +
            "  | '-' e\n" +
            "  | ID\n" +
            "  ;\n" +
            "ID : [a-z]+ ;\n"
        );

        const parameters: IToolParameters = {
            grammarFiles: [],
            outputDirectory: "",
            define: { "language": "Java" },
        };
        g.tool.process(g, parameters, false);

        const expectedTree = "(COMBINED_GRAMMAR T (RULES (RULE s (BLOCK (ALT e ';'))) (RULE e (BLOCK (ALT (BLOCK " +
            "(ALT {} ('-' (ELEMENT_OPTIONS (= tokenIndex 47))) (e (ELEMENT_OPTIONS (= tokenIndex 49) (= p 2)))) " +
            "(ALT (ID (ELEMENT_OPTIONS (= tokenIndex 53))))) (* (BLOCK (ALT ({precpred(_ctx, 5)}? (ELEMENT_OPTIONS " +
            "(= p 5))) ('*' (ELEMENT_OPTIONS (= tokenIndex 21))) (= x (e (ELEMENT_OPTIONS (= tokenIndex 25) (= p " +
            "6))))) (ALT ({precpred(_ctx, 4)}? (ELEMENT_OPTIONS (= p 4))) ('+' (ELEMENT_OPTIONS (= tokenIndex 31))) " +
            "(e (ELEMENT_OPTIONS (= tokenIndex 33) (= p 5)))) (ALT ({precpred(_ctx, 3)}? (ELEMENT_OPTIONS (= p 3))) " +
            "('.' (ELEMENT_OPTIONS (= tokenIndex 39))) (= y (ID (ELEMENT_OPTIONS (= tokenIndex 43))))))))))))";
        expect(g.ast.toStringTree()).toBe(expectedTree);

        const expectedElementTokens =
            "[@5,11:11='s',<9>,2:0]\n" +
            "[@9,15:15='e',<9>,2:4]\n" +
            "[@11,17:19='';'',<11>,2:6]\n" +
            "[@15,23:23='e',<9>,3:0]\n" +
            "[@47,68:70=''-'',<11>,6:4]\n" +
            "[@49,72:72='e',<9>,6:8]\n" +
            "[@53,78:79='ID',<13>,7:4]\n" +
            "[@21,29:31=''*'',<11>,3:6]\n" +
            "[@25,35:35='e',<9>,3:12]\n" +
            "[@31,43:45=''+'',<11>,4:6]\n" +
            "[@33,47:47='e',<9>,4:10]\n" +
            "[@39,55:57=''.'',<11>,5:6]\n" +
            "[@43,61:62='ID',<13>,5:12]";

        const types = new IntervalSet([ANTLRv4Parser.TOKEN_REF, ANTLRv4Parser.STRING_LITERAL, ANTLRv4Parser.RULE_REF]);
        const nodes = g.ast.getNodesWithTypePreorderDFS(types);
        const tokens: Token[] = [];
        for (const node of nodes) {
            tokens.push(node.token!);
        }
        expect(tokens.join("\n")).toBe(expectedElementTokens);
    });

    it("testLeftRecursionWithSet", () => {
        const g = new Grammar(
            "grammar T;\n" +
            "s : e ';' ;\n" +
            "e : e op=('*'|'/') e\n" +
            "  | e '+' e\n" +
            "  | e '.' ID\n" +
            "  | '-' e\n" +
            "  | ID\n" +
            "  ;\n" +
            "ID : [a-z]+ ;\n"
        );

        const parameters: IToolParameters = {
            grammarFiles: [],
            outputDirectory: "",
            define: { "language": "Java" },
        };
        g.tool.process(g, parameters, false);

        const expectedTree = "(COMBINED_GRAMMAR T (RULES (RULE s (BLOCK (ALT e ';'))) (RULE e (BLOCK (ALT (BLOCK " +
            "(ALT {} ('-' (ELEMENT_OPTIONS (= tokenIndex 49))) (e (ELEMENT_OPTIONS (= tokenIndex 51) (= p 2)))) " +
            "(ALT (ID (ELEMENT_OPTIONS (= tokenIndex 55))))) (* (BLOCK (ALT ({precpred(_ctx, 5)}? (ELEMENT_OPTIONS " +
            "(= p 5))) (= op (SET ('*' (ELEMENT_OPTIONS (= tokenIndex 24))) ('/' (ELEMENT_OPTIONS (= tokenIndex 26" +
            "))))) (e (ELEMENT_OPTIONS (= tokenIndex 29) (= p 6)))) (ALT ({precpred(_ctx, 4)}? (ELEMENT_OPTIONS " +
            "(= p 4))) ('+' (ELEMENT_OPTIONS (= tokenIndex 35))) (e (ELEMENT_OPTIONS (= tokenIndex 37) (= p 5)))) " +
            "(ALT ({precpred(_ctx, 3)}? (ELEMENT_OPTIONS (= p 3))) ('.' (ELEMENT_OPTIONS (= tokenIndex 43))) (ID " +
            "(ELEMENT_OPTIONS (= tokenIndex 45)))))))))))";
        expect(g.ast.toStringTree()).toBe(expectedTree);

        const expectedElementTokens =
            "[@5,11:11='s',<9>,2:0]\n" +
            "[@9,15:15='e',<9>,2:4]\n" +
            "[@11,17:19='';'',<11>,2:6]\n" +
            "[@15,23:23='e',<9>,3:0]\n" +
            "[@49,73:75=''-'',<11>,6:4]\n" +
            "[@51,77:77='e',<9>,6:8]\n" +
            "[@55,83:84='ID',<13>,7:4]\n" +
            "[@24,33:35=''*'',<11>,3:10]\n" +
            "[@26,37:39=''/'',<11>,3:14]\n" +
            "[@29,42:42='e',<9>,3:19]\n" +
            "[@35,50:52=''+'',<11>,4:6]\n" +
            "[@37,54:54='e',<9>,4:10]\n" +
            "[@43,62:64=''.'',<11>,5:6]\n" +
            "[@45,66:67='ID',<13>,5:10]";

        const types = new IntervalSet([ANTLRv4Parser.TOKEN_REF, ANTLRv4Parser.STRING_LITERAL, ANTLRv4Parser.RULE_REF]);
        const nodes = g.ast.getNodesWithTypePreorderDFS(types);
        const tokens: Token[] = [];
        for (const node of nodes) {
            tokens.push(node.token!);
        }
        expect(tokens.join("\n")).toBe(expectedElementTokens);
    });

});
