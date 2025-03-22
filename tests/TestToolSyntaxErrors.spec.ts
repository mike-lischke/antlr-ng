/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

// cspell: ignore popmode AABG

import { describe, expect, it } from "vitest";

import { IssueCode, issueTypes } from "../src/tool/Issues.js";
import { ToolTestUtils } from "./ToolTestUtils.js";
import { antlrVersion } from "../src/version.js";

/**
 * This class depended on lexer actions for customized error messages. In the official ANTLR4 grammar these action
 * do not exist and hence the error messages are different. The messages in the tests have therefore been adjusted t
 * o reflect that.
 */
describe("TestToolSyntaxErrors", () => {
    const testData = [
        // INPUT
        "grammar A;\n" +
        "",
        // YIELDS
        "error(" + IssueCode.NoRules + "): A.g4::: grammar A has no rules\n",

        "lexer grammar A;\n" +
        "",
        "error(" + IssueCode.NoRules + "): A.g4::: grammar A has no rules\n",

        "A;",
        "error(" + IssueCode.SyntaxError + "): A.g4:1:0: syntax error: mismatched input 'A' expecting " +
        "{'lexer', 'parser', 'grammar'}\n",

        "grammar ;",
        "error(" + IssueCode.SyntaxError + "): A.g4:1:8: syntax error: missing {RULE_REF, TOKEN_REF} at ';'\n",

        "grammar A\n" +
        "a : ID ;\n",
        "error(" + IssueCode.SyntaxError + "): A.g4:2:0: syntax error: missing ';' at 'a'\n",

        "grammar A;\n" +
        "a : ID ;;\n" +
        "b : B ;",
        "error(" + IssueCode.SyntaxError + "): A.g4:2:8: syntax error: mismatched input ';' expecting {<EOF>, " +
        "'mode'}\n",

        "grammar A;;\n" +
        "a : ID ;\n",
        "error(" + IssueCode.SyntaxError + "): A;.g4:1:10: syntax error: extraneous input ';' expecting " +
        "{<EOF>, RULE_REF, TOKEN_REF, OPTIONS, TOKENS, CHANNELS, 'import', 'fragment', 'protected', 'public', " +
        "'private', 'mode', '@'}\n",

        "grammar A;\n" +
        "a @init : ID ;\n",
        "error(" + IssueCode.SyntaxError + "): A.g4:2:8: syntax error: missing ACTION at ':'\n",

        "grammar A;\n" +
        "a  ( A | B ) D ;\n" +
        "b : B ;",
        "error(" + IssueCode.SyntaxError + "): A.g4:2:3: syntax error: mismatched input '(' expecting {'[', OPTIONS, " +
        "'returns', 'locals', 'throws', ':', '@'}\n" +
        "error(" + IssueCode.SyntaxError + "): A.g4:2:7: syntax error: mismatched input '|' expecting " +
        "{OPTIONS, ':'}\n" +
        "error(" + IssueCode.SyntaxError + "): A.g4:2:11: syntax error: mismatched input ')' expecting {OPTIONS, " +
        "':'}\n" +
        "error(" + IssueCode.SyntaxError + "): A.g4:2:15: syntax error: mismatched input ';' expecting {OPTIONS, " +
        "':'}\n",
    ];

    it("AllErrorCodesDistinct", () => {
        const issues = Object.keys(IssueCode);
        const codes = new Set<IssueCode>();
        for (const [code] of issueTypes) {
            codes.add(code); // Duplicates would just be ignored.
        }

        expect(codes.size).toBe(issues.length / 2); // IssueCode is an enum with two entries per value.
    });

    it("testA", () => {
        ToolTestUtils.testErrors(testData, true);
    });

    it("testExtraColon", () => {
        const pair = [
            "grammar A;\n" +
            "a : : A ;\n" +
            "b : B ;",
            "error(" + IssueCode.SyntaxError + "): A.g4:2:4: syntax error: no viable alternative at input ':'\n",
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testMissingRuleSemi", () => {
        const pair = [
            "grammar A;\n" +
            "a : A \n" +
            "b : B ;",
            "error(" + IssueCode.SyntaxError + "): A.g4:3:2: syntax error: no viable alternative at input ':'\n",
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testMissingRuleSemi2", () => {
        const pair = [
            "lexer grammar A;\n" +
            "A : 'a' \n" +
            "B : 'b' ;",
            "error(" + IssueCode.SyntaxError + "): A.g4:3:2: syntax error: mismatched input ':' expecting ';'\n",
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testMissingRuleSemi3", () => {
        const pair = [
            "grammar A;\n" +
            "a : A \n" +
            "b[int i] returns [int y] : B ;",
            "error(" + IssueCode.SyntaxError + "): A.g4:3:9: syntax error: no viable alternative at input " +
            "'returns'\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testMissingRuleSemi4", () => {
        const pair = [
            "grammar A;\n" +
            "a : b \n" +
            "  catch [Exception e] {...}\n" +
            "b : B ;\n",

            "error(" + IssueCode.SyntaxError + "): A.g4:3:2: syntax error: no viable alternative at input " +
            "'catch'\nerror(" + IssueCode.SyntaxError + "): A.g4:4:2: syntax error: no viable alternative at " +
            "input ':'\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testMissingRuleSemi5", () => {
        const pair = [
            "grammar A;\n" +
            "a : A \n" +
            "  catch [Exception e] {...}\n",

            "error(" + IssueCode.SyntaxError + "): A.g4:3:2: syntax error: no viable alternative at input " +
            "'catch'\nerror(" + IssueCode.SyntaxError + "): A.g4:4:0: syntax error: missing ';' at '<EOF>'\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testBadRulePrequelStart", () => {
        const pair = [
            "grammar A;\n" +
            "a @ options {k=1;} : A ;\n" +
            "b : B ;",

            "error(" + IssueCode.SyntaxError + "): A.g4:2:4: syntax error: extraneous input 'options {' " +
            "expecting {RULE_REF, TOKEN_REF}\nerror(" + IssueCode.SyntaxError + "): A.g4:2:14: syntax error: " +
            "mismatched input '=' expecting ACTION\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testBadRulePrequelStart2", () => {
        const pair = [
            "grammar A;\n" +
            "a } : A ;\n" +
            "b : B ;",

            "error(" + IssueCode.SyntaxError + "): A.g4:2:2: syntax error: extraneous input '}' expecting " +
            "{'[', OPTIONS, 'returns', 'locals', 'throws', ':', '@'}\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testModeInParser", () => {
        const pair = [
            "grammar A;\n" +
            "a : A ;\n" +
            "mode foo;\n" +
            "b : B ;",

            "error(" + IssueCode.SyntaxError + "): A.g4:4:0: syntax error: extraneous input 'b' expecting " +
            "{<EOF>, 'mode'}\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#243
     * "Generate a good message for unterminated strings"
     * https://github.com/antlr/antlr4/issues/243
     * ml: Also this test was based on a lexer action which is not part of the official ANTLR4 grammar.
     */
    it("testUnterminatedStringLiteral", () => {
        const pair = [
            "grammar A;\n" +
            "a : 'x\n" +
            "  ;\n",

            "error(" + IssueCode.SyntaxError + "): A.g4:2:4: syntax error: no viable alternative " +
            "at input ''x'\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#262
     * "Parser Rule Name Starting With an Underscore"
     * https://github.com/antlr/antlr4/issues/262
     */
    it("testParserRuleNameStartingWithUnderscore", () => {
        const pair = [
            "grammar A;\n" +
            "_a : 'x' ;\n",

            "error(" + IssueCode.SyntaxError + "): A.g4:2:0: syntax error: token recognition error at: '_'\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#194
     * "NullPointerException on 'options{}' in grammar file"
     * https://github.com/antlr/antlr4/issues/194
     */
    it("testEmptyGrammarOptions", () => {
        const pair = [
            "grammar A;\n" +
            "options {}\n" +
            "a : 'x' ;\n",

            ""
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a "related" regression test for antlr/antlr4#194
     * "NullPointerException on 'options{}' in grammar file"
     * https://github.com/antlr/antlr4/issues/194
     */
    it("testEmptyRuleOptions", () => {
        const pair = [
            "grammar A;\n" +
            "a options{} : 'x' ;\n",

            ""
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a "related" regression test for antlr/antlr4#194
     * "NullPointerException on 'options{}' in grammar file"
     * https://github.com/antlr/antlr4/issues/194
     */
    it("testEmptyBlockOptions", () => {
        const pair = [
            "grammar A;\n" +
            "a : (options{} : 'x') ;\n",
            ""
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    it("testEmptyTokensBlock", () => {
        const pair = [
            "grammar A;\n" +
            "tokens {}\n" +
            "a : 'x' ;\n",

            ""
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#190
     * "NullPointerException building lexer grammar using bogus 'token' action"
     * https://github.com/antlr/antlr4/issues/190
     */
    it("testInvalidLexerCommand", () => {
        const pair = [
            "grammar A;\n" +
            "tokens{Foo}\n" +
            "b : Foo ;\n" +
            "X : 'foo1' -> popmode;\n" + // "meant" to use -> popMode
            "Y : 'foo2' -> token(Foo);", // "meant" to use -> type(Foo)

            "error(" + IssueCode.InvalidLexerCommand + "): A.g4:4:14: lexer command popmode does not exist " +
            "or is not supported by the current target\n" +
            "error(" + IssueCode.InvalidLexerCommand + "): A.g4:5:14: lexer command token does not exist or " +
            "is not supported by the current target\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testLexerCommandArgumentValidation", () => {
        const pair = [
            "grammar A;\n" +
            "tokens{Foo}\n" +
            "b : Foo ;\n" +
            "X : 'foo1' -> popMode(Foo);\n" + // "meant" to use -> popMode
            "Y : 'foo2' -> type;", // "meant" to use -> type(Foo)

            "error(" + IssueCode.UnwantedLexerCommandArgument + "): A.g4:4:14: lexer command popMode does " +
            "not take any arguments\n" +
            "error(" + IssueCode.MisingLexerCommandArgument + "): A.g4:5:14: missing argument for lexer " +
            "command type\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testRuleRedefinition", () => {
        const pair = [
            "grammar Oops;\n" +
            "\n" +
            "ret_ty : A ;\n" +
            "ret_ty : B ;\n" +
            "\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n",

            "error(" + IssueCode.RuleRedefinition + "): Oops.g4:4:0: rule ret_ty redefinition; previous at " +
            "line 3\n"
        ];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testEpsilonClosureAnalysis", () => {
        const grammar =
            "grammar A;\n"
            + "x : ;\n"
            + "y1 : x+;\n"
            + "y2 : x*;\n"
            + "z1 : ('foo' | 'bar'? 'bar2'?)*;\n"
            + "z2 : ('foo' | 'bar' 'bar2'? | 'bar2')*;\n";
        const expected =
            "error(" + IssueCode.EpsilonClosure + "): A.g4:3:0: rule y1 contains a closure with at least one " +
            "alternative that can match an empty string\n" +
            "error(" + IssueCode.EpsilonClosure + "): A.g4:4:0: rule y2 contains a closure with at least one " +
            "alternative that can match an empty string\n" +
            "error(" + IssueCode.EpsilonClosure + "): A.g4:5:0: rule z1 contains a closure with at least one " +
            "alternative that can match an empty string\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    // Test for https://github.com/antlr/antlr4/issues/1203
    it("testEpsilonNestedClosureAnalysis", () => {
        const grammar =
            "grammar T;\n" +
            "s : (a a)* ;\n" +
            "a : 'foo'* ;\n";
        const expected =
            "error(" + IssueCode.EpsilonClosure + "): T.g4:2:0: rule s contains a closure with at least one " +
            "alternative that can match an empty string\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    // Test for https://github.com/antlr/antlr4/issues/2860, https://github.com/antlr/antlr4/issues/1105
    it("testEpsilonClosureInLexer", () => {
        const grammar =
            "lexer grammar T;\n" +
            "TOKEN: '\\'' FRAGMENT '\\'';\n" +
            "fragment FRAGMENT: ('x'|)+;";

        const expected =
            "error(" + IssueCode.EpsilonClosure + "): T.g4:3:9: rule FRAGMENT contains a closure with at " +
            "least one alternative that can match an empty string\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    // Test for https://github.com/antlr/antlr4/issues/3359
    it("testEofClosure", () => {
        const grammar =
            "lexer grammar EofClosure;\n" +
            "EofClosure: 'x' EOF*;\n" +
            "EofInAlternative: 'y' ('z' | EOF);";

        const expected =
            "error(" + IssueCode.EofClosure + "): EofClosure.g4:2:0: rule EofClosure contains a closure with " +
            "at least one alternative that can match EOF\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    // Test for https://github.com/antlr/antlr4/issues/1203
    it("testEpsilonOptionalAndClosureAnalysis", () => {
        const grammar =
            "grammar T;\n" +
            "s : (a a)? ;\n" +
            "a : 'foo'* ;\n";
        const expected =
            "warning(" + IssueCode.EpsilonOptional + "): T.g4:2:0: rule s contains an optional block with at " +
            "least one alternative that can match an empty string\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, false);
    });

    it("testEpsilonOptionalAnalysis", () => {
        const grammar =
            "grammar A;\n"
            + "x : ;\n"
            + "y  : x?;\n"
            + "z1 : ('foo' | 'bar'? 'bar2'?)?;\n"
            + "z2 : ('foo' | 'bar' 'bar2'? | 'bar2')?;\n";
        const expected =
            "warning(" + IssueCode.EpsilonOptional + "): A.g4:3:0: rule y contains an optional block with at " +
            "least one alternative that can match an empty string\n" +
            "warning(" + IssueCode.EpsilonOptional + "): A.g4:4:0: rule z1 contains an optional block with at " +
            "least one alternative that can match an empty string\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, false);
    });

    /**
     * This is a regression test for antlr/antlr4#315
     * "Inconsistent lexer error msg for actions"
     * https://github.com/antlr/antlr4/issues/315
     */
    it("testActionAtEndOfOneLexerAlternative", () => {
        const grammar =
            "grammar A;\n" +
            "stat : 'start' CharacterLiteral 'end' EOF;\n" +
            "\n" +
            "// Lexer\n" +
            "\n" +
            "CharacterLiteral\n" +
            "    :   '\\'' SingleCharacter '\\''\n" +
            "    |   '\\'' ~[\\r\\n] {notifyErrorListeners(\"unclosed character literal\");}\n" +
            "    ;\n" +
            "\n" +
            "fragment\n" +
            "SingleCharacter\n" +
            "    :   ~['\\\\\\r\\n]\n" +
            "    ;\n" +
            "\n" +
            "WS   : [ \\r\\t\\n]+ -> skip ;\n";
        const expected =
            "";

        const pair = [grammar, expected];
        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#308 "NullPointer exception"
     * https://github.com/antlr/antlr4/issues/308
     */
    it("testDoubleQuotedStringLiteral", () => {
        const grammar =
            "lexer grammar A;\n"
            + "WHITESPACE : (\" \" | \"\\t\" | \"\\n\" | \"\\r\" | \"\\f\");\n";
        const expected =
            "error(" + IssueCode.SyntaxError + "): A.g4:2:14: syntax error: token recognition error at: '\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:16: syntax error: token recognition error at: '\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:20: syntax error: token recognition error at: '\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:21: syntax error: token recognition error at: '\\'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:22: syntax error: no viable alternative at input " +
            "'t'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:23: syntax error: token recognition error at: '\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:27: syntax error: token recognition error at: '\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:28: syntax error: token recognition error at: '\\'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:25: syntax error: mismatched input '|' expecting " +
            "{'[', OPTIONS, 'returns', 'locals', 'throws', ':', '@'}\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:30: syntax error: token recognition error at: '\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:34: syntax error: token recognition error at: '\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:35: syntax error: token recognition error at: '\\'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:32: syntax error: mismatched input '|' expecting " +
            "{'[', OPTIONS, 'returns', 'locals', 'throws', ':', '@'}\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:37: syntax error: token recognition error at: '\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:41: syntax error: token recognition error at: '\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:42: syntax error: token recognition error at: '\\'" +
            "\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:39: syntax error: mismatched input '|' expecting " +
            "{'[', OPTIONS, 'returns', 'locals', 'throws', ':', '@'}\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:44: syntax error: token recognition error at: " +
            "'\"'\n" +
            "error(" + IssueCode.SyntaxError + "): A.g4:2:45: syntax error: mismatched input ')' expecting " +
            "{'[', OPTIONS, 'returns', 'locals', 'throws', ':', '@'}\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for https://github.com/antlr/antlr4/issues/1815
     * "Null ptr exception in SqlBase.g4"
     */
    it("testDoubleQuoteInTwoStringLiterals", () => {
        const grammar =
            "lexer grammar A;\n" +
            "STRING : '\\\"' '\\\"' 'x' ;";
        const expected =
            "error(" + IssueCode.InvalidEscapeSequence + "): A.g4:2:10: invalid escape sequence \\\"\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): A.g4:2:15: invalid escape sequence \\\"\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This test ensures that the {@link IssueCode#INVALID_ESCAPE_SEQUENCE}
     * error is not reported for escape sequences that are known to be valid.
     */
    it("testValidEscapeSequences", () => {
        const grammar =
            "lexer grammar A;\n" +
            "NORMAL_ESCAPE : '\\b \\t \\n \\f \\r \\' \\\\';\n" +
            "UNICODE_ESCAPE : '\\u0001 \\u00A1 \\u00a1 \\uaaaa \\uAAAA';\n";
        const expected =
            "";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#507 "NullPointerException When
     * Generating Code from Grammar".
     * https://github.com/antlr/antlr4/issues/507
     */
    it("testInvalidEscapeSequences", () => {
        const grammar =
            "lexer grammar A;\n" +
            "RULE : 'Foo \\uAABG \\x \\u';\n";
        const expected =
            "error(" + IssueCode.InvalidEscapeSequence + "): A.g4:2:12: invalid escape sequence \\uAABG\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): A.g4:2:19: invalid escape sequence \\x\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): A.g4:2:22: invalid escape sequence \\u\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#959 "NullPointerException".
     * https://github.com/antlr/antlr4/issues/959
     */
    it("testNotAllowedEmptyStrings", () => {
        const grammar =
            "lexer grammar T;\n" +
            "Error0: '''test''';\n" +
            "Error1: '' 'test';\n" +
            "Error2: 'test' '';\n" +
            "Error3: '';\n" +
            "NotError: ' ';";
        const expected =
            "error(" + IssueCode.EmptyStringAndSetsNotAllowed + "): T.g4:2:8: string literals and sets " +
            "cannot be empty: ''\n" +
            "error(" + IssueCode.EmptyStringAndSetsNotAllowed + "): T.g4:2:16: string literals and sets " +
            "cannot be empty: ''\n" +
            "error(" + IssueCode.EmptyStringAndSetsNotAllowed + "): T.g4:3:8: string literals and sets " +
            "cannot be empty: ''\n" +
            "error(" + IssueCode.EmptyStringAndSetsNotAllowed + "): T.g4:4:15: string literals and sets " +
            "cannot be empty: ''\n" +
            "error(" + IssueCode.EmptyStringAndSetsNotAllowed + "): T.g4:5:8: string literals and sets " +
            "cannot be empty: ''\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    it("testInvalidCharSetsAndStringLiterals", () => {
        const grammar =
            "lexer grammar Test;\n" +
            "INVALID_STRING_LITERAL_RANGE: 'GH'..'LM';\n" +
            "INVALID_CHAR_SET:             [\\u24\\uA2][\\{];\n" + //https://github.com/antlr/antlr4/issues/1077
            "EMPTY_STRING_LITERAL_RANGE:   'F'..'A' | 'Z';\n" +
            "EMPTY_CHAR_SET:               [f-az][];\n" +
            "START_HYPHEN_IN_CHAR_SET:     [-z];\n" +
            "END_HYPHEN_IN_CHAR_SET:       [a-];\n" +
            "SINGLE_HYPHEN_IN_CHAR_SET:    [-];\n" +
            "VALID_STRING_LITERALS:        '\\u1234' | '\\t' | '\\'';\n" +
            "VALID_CHAR_SET:               [`\\-=\\]];" +
            "EMPTY_CHAR_SET_WITH_INVALID_ESCAPE_SEQUENCE: [\\'];"; // https://github.com/antlr/antlr4/issues/1556

        const expected =
            "error(" + IssueCode.InvalidLiteralInLexerSet + "): Test.g4:2:30: multi-character literals are " +
            "not allowed in lexer sets: 'GH'\n" +
            "error(" + IssueCode.InvalidLiteralInLexerSet + "): Test.g4:2:36: multi-character literals are " +
            "not allowed in lexer sets: 'LM'\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:3:30: invalid escape sequence \\u24\\u\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:3:40: invalid escape sequence \\{\n" +
            "error(" + IssueCode.EmptyStringAndSetsNotAllowed + "): Test.g4:4:30: string literals and " +
            "sets cannot be empty: 'F'..'A'\n" +
            "error(" + IssueCode.EmptyStringAndSetsNotAllowed + "): Test.g4:5:30: string literals and " +
            "sets cannot be empty: 'f'..'a'\n" +
            "error(" + IssueCode.EmptyStringAndSetsNotAllowed + "): Test.g4:5:36: string literals and " +
            "sets cannot be empty: []\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:10:84: invalid escape sequence \\'\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    it("testInvalidUnicodeEscapesInCharSet", () => {
        const grammar =
            "lexer grammar Test;\n" +
            "INVALID_EXTENDED_UNICODE_EMPTY: [\\u{}];\n" +
            "INVALID_EXTENDED_UNICODE_NOT_TERMINATED: [\\u{];\n" +
            "INVALID_EXTENDED_UNICODE_TOO_LONG: [\\u{110000}];\n" +
            "INVALID_UNICODE_PROPERTY_EMPTY: [\\p{}];\n" +
            "INVALID_UNICODE_PROPERTY_NOT_TERMINATED: [\\p{];\n" +
            "INVALID_INVERTED_UNICODE_PROPERTY_EMPTY: [\\P{}];\n" +
            "INVALID_UNICODE_PROPERTY_UNKNOWN: [\\p{NotAProperty}];\n" +
            "INVALID_INVERTED_UNICODE_PROPERTY_UNKNOWN: [\\P{NotAProperty}];\n" +
            "UNICODE_PROPERTY_NOT_ALLOWED_IN_RANGE: [\\p{Uppercase_Letter}-\\p{Lowercase_Letter}];\n" +
            "UNICODE_PROPERTY_NOT_ALLOWED_IN_RANGE_2: [\\p{Letter}-Z];\n" +
            "UNICODE_PROPERTY_NOT_ALLOWED_IN_RANGE_3: [A-\\p{Number}];\n" +
            "INVERTED_UNICODE_PROPERTY_NOT_ALLOWED_IN_RANGE: [\\P{Uppercase_Letter}-\\P{Number}];\n" +
            "EMOJI_MODIFIER: [\\p{Grapheme_Cluster_Break=E_Base}];\n";

        const expected =
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:2:32: invalid escape sequence \\u{}\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:3:41: invalid escape sequence \\u{\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:4:35: invalid escape sequence \\u{110\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:5:32: invalid escape sequence \\p{}\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:6:41: invalid escape sequence \\p{\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:7:41: invalid escape sequence \\P{}\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:8:34: invalid escape sequence " +
            "\\p{NotAProperty}\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:9:43: invalid escape sequence " +
            "\\P{NotAProperty}\n" +
            "error(" + IssueCode.UnicodePropertyNotAllowedInRange + "): Test.g4:10:39: unicode property " +
            "escapes not allowed in lexer charset range: [\\p{Uppercase_Letter}-\\p{Lowercase_Letter}]\n" +
            "error(" + IssueCode.UnicodePropertyNotAllowedInRange + "): Test.g4:11:41: unicode property " +
            "escapes not allowed in lexer charset range: [\\p{Letter}-Z]\n" +
            "error(" + IssueCode.UnicodePropertyNotAllowedInRange + "): Test.g4:12:41: unicode property " +
            "escapes not allowed in lexer charset range: [A-\\p{Number}]\n" +
            "error(" + IssueCode.UnicodePropertyNotAllowedInRange + "): Test.g4:13:48: unicode property " +
            "escapes not allowed in lexer charset range: [\\P{Uppercase_Letter}-\\P{Number}]\n" +
            "error(" + IssueCode.InvalidEscapeSequence + "): Test.g4:14:16: invalid escape sequence " +
            "\\p{Grapheme_Cluster_Break=E_Base}\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This test ensures the {@link IssueCode#UNRECOGNIZED_ASSOC_OPTION} warning
     * is produced as described in the documentation.
     */
    it("testUnrecognizedAssocOption", () => {
        const grammar =
            "grammar A;\n" +
            "x : 'x'\n" +
            "  | x '+'<assoc=right> x   // warning 157\n" +
            "  |<assoc=right> x '*' x   // ok\n" +
            "  ;\n";
        const expected =
            "warning(" + IssueCode.UnrecognizedAsscoOption + "): A.g4:3:10: rule x contains an assoc terminal " +
            "option in an unrecognized location\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, false);
    });

    /**
     * This test ensures the {@link IssueCode#FRAGMENT_ACTION_IGNORED} warning
     * is produced as described in the documentation.
     */
    it("testFragmentActionIgnored", () => {
        const grammar =
            "lexer grammar A;\n" +
            "X1 : 'x' -> more    // ok\n" +
            "   ;\n" +
            "Y1 : 'x' {more();}  // ok\n" +
            "   ;\n" +
            "fragment\n" +
            "X2 : 'x' -> more    // warning 158\n" +
            "   ;\n" +
            "fragment\n" +
            "Y2 : 'x' {more();}  // warning 158\n" +
            "   ;\n";
        const expected =
            "warning(" + IssueCode.FragmentActionIgnored + "): A.g4:7:12: fragment rule X2 contains an " +
            "action or command which can never be executed\n" +
            "warning(" + IssueCode.FragmentActionIgnored + "): A.g4:10:9: fragment rule Y2 contains an " +
            "action or command which can never be executed\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, false);
    });

    /**
     * This is a regression test for antlr/antlr4#500 "Array Index Out Of
     * Bounds".
     * https://github.com/antlr/antlr4/issues/500
     */
    it("testTokenNamedEOF", () => {
        const grammar =
            "lexer grammar A;\n" +
            "WS : ' ';\n" +
            " EOF : 'a';\n";
        const expected =
            "error(" + IssueCode.ReservedRuleName + "): A.g4:3:1: cannot declare a rule with reserved " +
            "name EOF\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#649 "unknown target causes null ptr exception.".
     * https://github.com/antlr/antlr4/issues/649
     * Stops before processing the lexer
     */
    it("testInvalidLanguageInGrammarWithLexerCommand", () => {
        const grammar =
            "grammar T;\n" +
            "options { language=Foo; }\n" +
            "start : 'T' EOF;\n" +
            "Something : 'something' -> channel(CUSTOM);";
        const expected =
            "error(" + IssueCode.CannotCreateTargetGenerator + "):  ANTLR cannot generate Foo code as of " +
            "version " + antlrVersion + "\n" +
            "error(" + IssueCode.ImplicitStringDefinition + "): T.g4:3:8: cannot create implicit token for " +
            "string literal in non-combined grammar: 'T'\n";
        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#649 "unknown target causes
     * null ptr exception.".
     * https://github.com/antlr/antlr4/issues/649
     */
    it("testInvalidLanguageInGrammar", () => {
        const grammar =
            "grammar T;\n" +
            "options { language=Foo; }\n" +
            "start : 'T' EOF;\n";
        const expected =
            "error(" + IssueCode.CannotCreateTargetGenerator + "):  ANTLR cannot generate Foo code as of " +
            "version " + antlrVersion + "\n" +
            "error(" + IssueCode.ImplicitStringDefinition + "): T.g4:3:8: cannot create implicit token for " +
            "string literal in non-combined grammar: 'T'\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    it("testChannelDefinitionInLexer", () => {
        const grammar =
            "lexer grammar T;\n" +
            "\n" +
            "channels {\n" +
            "	WHITESPACE_CHANNEL,\n" +
            "	COMMENT_CHANNEL\n" +
            "}\n" +
            "\n" +
            "COMMENT:    '//' ~[\\n]+ -> channel(COMMENT_CHANNEL);\n" +
            "WHITESPACE: [ \\t]+      -> channel(WHITESPACE_CHANNEL);\n";

        const expected = "";

        const pair = [grammar, expected];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testChannelDefinitionInParser", () => {
        const grammar =
            "parser grammar T;\n" +
            "\n" +
            "channels {\n" +
            "	WHITESPACE_CHANNEL,\n" +
            "	COMMENT_CHANNEL\n" +
            "}\n" +
            "\n" +
            "start : EOF;\n";

        const expected =
            "error(" + IssueCode.ChannelsBlockInParserGrammar + "): T.g4:3:0: custom channels are not " +
            "supported in parser grammars\n";

        const pair = [grammar, expected];
        ToolTestUtils.testErrors(pair, true);
    });

    it("testChannelDefinitionInCombined", () => {
        const grammar =
            "grammar T;\n" +
            "\n" +
            "channels {\n" +
            "	WHITESPACE_CHANNEL,\n" +
            "	COMMENT_CHANNEL\n" +
            "}\n" +
            "\n" +
            "start : EOF;\n" +
            "\n" +
            "COMMENT:    '//' ~[\\n]+ -> channel(COMMENT_CHANNEL);\n" +
            "WHITESPACE: [ \\t]+      -> channel(WHITESPACE_CHANNEL);\n";

        const expected =
            "error(" + IssueCode.ConstantValueIsNotARecognizedChannelName + "): T.g4:10:35: " +
            "COMMENT_CHANNEL is not a recognized channel name\n" +
            "error(" + IssueCode.ConstantValueIsNotARecognizedChannelName + "): T.g4:11:35: " +
            "WHITESPACE_CHANNEL is not a recognized channel name\n" +
            "error(" + IssueCode.ChannelsBlockInCombinedGrammar + "): T.g4:3:0: custom channels are not " +
            "supported in combined grammars\n";

        const pair = [grammar, expected];
        ToolTestUtils.testErrors(pair, true);
    });

    /**
     * This is a regression test for antlr/antlr4#497 now that antlr/antlr4#309
     * is resolved.
     * https://github.com/antlr/antlr4/issues/497
     * https://github.com/antlr/antlr4/issues/309
     */
    it("testChannelDefinitions", () => {
        const grammar =
            "lexer grammar T;\n" +
            "\n" +
            "channels {\n" +
            "	WHITESPACE_CHANNEL,\n" +
            "	COMMENT_CHANNEL\n" +
            "}\n" +
            "\n" +
            "COMMENT:    '//' ~[\\n]+ -> channel(COMMENT_CHANNEL);\n" +
            "WHITESPACE: [ \\t]+      -> channel(WHITESPACE_CHANNEL);\n" +
            "NEWLINE:    '\\r'? '\\n' -> channel(NEWLINE_CHANNEL);";

        // WHITESPACE_CHANNEL and COMMENT_CHANNEL are defined, but NEWLINE_CHANNEL is not
        const expected =
            "error(" + IssueCode.ConstantValueIsNotARecognizedChannelName + "): T.g4:10:34: " +
            "NEWLINE_CHANNEL is not a recognized channel name\n";

        const pair = [grammar, expected];
        ToolTestUtils.testErrors(pair, true);
    });

    // Test for https://github.com/antlr/antlr4/issues/1556
    it("testRangeInParserGrammar", () => {
        const grammar =
            "grammar T;\n" +
            "a:  'A'..'Z' ;\n";
        const expected = "error(" + IssueCode.SyntaxError + "): T.g4:2:7: syntax error: no viable alternative " +
            "at input '..'\n";

        const pair = [
            grammar,
            expected
        ];

        ToolTestUtils.testErrors(pair, true);
    });

    it("testRuleNamesAsTree", () => {
        const grammar =
            "grammar T;\n" +
            "tree : 'X';";
        ToolTestUtils.testErrors([grammar, ""], true);
    });

    it("testLexerRuleLabel", () => {
        const grammar =
            "grammar T;\n" +
            "a : A;\n" +
            "A : h=~('b'|'c') ;";
        ToolTestUtils.testErrors([
            grammar,
            "error(" + IssueCode.SyntaxError + "): T.g4:3:4: syntax error: no viable alternative at input 'h'\n" +
            "error(" + IssueCode.SyntaxError + "): T.g4:3:5: syntax error: mismatched input '=' expecting " +
            "{'[', OPTIONS, 'returns', 'locals', 'throws', ':', '@'}\n"
        ], false);
    });
});
