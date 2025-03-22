/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

// cspell: disable

import { describe, expect, it } from "vitest";

import { IssueCode } from "../src/tool/Issues.js";
import { LexerGrammar } from "../src/tool/index.js";
import { ToolTestUtils } from "./ToolTestUtils.js";
import { convertArrayToString, convertMapToString } from "../src/support/helpers.js";
import type { IToolParameters } from "../src/tool-parameters.js";

describe("TestSymbolIssues", () => {
    const testDataA = [
        // INPUT
        "grammar A;\n" +
        "options { opt='sss'; k=3; }\n" +
        "\n" +
        "@members {foo}\n" +
        "@members {bar}\n" +
        "@lexer::header {package jj;}\n" +
        "@lexer::header {package kk;}\n" +
        "\n" +
        "a[int i] returns [foo f] : X ID a[3] b[34] c ;\n" +
        "b returns [int g] : Y 'y' 'if' a ;\n" +
        "c : FJKD ;\n" +
        "\n" +
        "ID : 'a'..'z'+ ID ;",
        // YIELDS
        "error(" + IssueCode.ActionRedefinition + "): A.g4:5:1: redefinition of members action\n" +
        "error(" + IssueCode.ActionRedefinition + "): A.g4:7:1: redefinition of header action\n" +
        "warning(" + IssueCode.IllegalOption + "): A.g4:2:10: unsupported option opt\n" +
        "warning(" + IssueCode.IllegalOption + "): A.g4:2:21: unsupported option k\n" +
        "error(" + IssueCode.ActionRedefinition + "): A.g4:5:1: redefinition of members action\n" +
        "warning(" + IssueCode.ImplicitTokenDefinition +
        "): A.g4:9:27: implicit definition of token X in parser\n" +
        "warning(" + IssueCode.ImplicitTokenDefinition +
        "): A.g4:10:20: implicit definition of token Y in parser\n" +
        "warning(" + IssueCode.ImplicitTokenDefinition +
        "): A.g4:11:4: implicit definition of token FJKD in parser\n" +
        "error(" + IssueCode.RuleHasNoArgs + "): A.g4:9:37: rule b has no defined parameters\n" +
        "error(" + IssueCode.MissingRuleArgs + "): A.g4:10:31: missing argument(s) on rule reference: a\n"
    ];

    const testDataB = [
        // INPUT
        "parser grammar B;\n" +
        "tokens { ID, FOO, X, Y }\n" +
        "\n" +
        "a : s=ID b+=ID X=ID '.' ;\n" +
        "\n" +
        "b : x=ID x+=ID ;\n" +
        "\n" +
        "s : FOO ;",
        // YIELDS
        "error(" + IssueCode.LabelConflictsWithRule
        + "): B.g4:4:4: label s conflicts with rule with same name\n" +
        "error(" + IssueCode.LabelConflictsWithRule +
        "): B.g4:4:9: label b conflicts with rule with same name\n" +
        "error(" + IssueCode.LabelConflictsWithToken +
        "): B.g4:4:15: label X conflicts with token with same name\n" +
        "error(" + IssueCode.LabelTypeConflict +
        "): B.g4:6:9: label x type mismatch with previous definition: TOKEN_LIST_LABEL!=TOKEN_LABEL\n" +
        "error(" + IssueCode.ImplicitStringDefinition +
        "): B.g4:4:20: cannot create implicit token for string literal in non-combined grammar: '.'\n"
    ];

    const testDataD = [
        // INPUT
        "parser grammar D;\n" +
        "tokens{ID}\n" +
        "a[int j] \n" +
        "        :       i=ID j=ID ;\n" +
        "\n" +
        "b[int i] returns [int i] : ID ;\n" +
        "\n" +
        "c[int i] returns [String k]\n" +
        "        :       ID ;",

        // YIELDS
        "error(" + IssueCode.LabelConflictsWithArg +
        "): D.g4:4:21: label j conflicts with parameter with same name\n" +
        "error(" + IssueCode.RetValuConflictsWithArg +
        "): D.g4:6:22: return value i conflicts with parameter with same name\n"
    ];

    const testDataE = [
        // INPUT
        "grammar E;\n" +
        "tokens {\n" +
        "	A, A,\n" +
        "	B,\n" +
        "	C\n" +
        "}\n" +
        "a : A ;\n",

        // YIELDS
        "warning(" + IssueCode.TokenNameReassignment + "): E.g4:3:4: token name A is already defined\n"
    ];

    const testDataF = [
        // INPUT
        "lexer grammar F;\n" +
        "A: 'a';\n" +
        "mode M1;\n" +
        "A1: 'a';\n" +
        "mode M2;\n" +
        "A2: 'a';\n" +
        "M1: 'b';\n",

        // YIELDS
        "error(" + IssueCode.ModeConflictsWithToken +
        "): F.g4:3:0: mode M1 conflicts with token with same name\n"
    ];

    it("testA", () => {
        ToolTestUtils.testErrors(testDataA, false);
    });

    it("testB", () => {
        ToolTestUtils.testErrors(testDataB, false);
    });

    it("testD", () => {
        ToolTestUtils.testErrors(testDataD, false);
    });

    it("testE", () => {
        ToolTestUtils.testErrors(testDataE, false);
    });

    it("testF", () => {
        ToolTestUtils.testErrors(testDataF, false);
    });

    it("testStringLiteralRedefs", () => {
        const grammar =
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "mode X;\n" +
            "B : 'a' ;\n" +
            "mode Y;\n" +
            "C : 'a' ;\n";

        const g = new LexerGrammar(grammar);
        g.tool.process(g, {} as IToolParameters, false);

        const expectedTokenIDToTypeMap = "{EOF=-1, A=1, B=2, C=3}";
        const expectedStringLiteralToTypeMap = "{}";
        const expectedTypeToTokenList = "[A, B, C]";

        expect(convertMapToString(g.tokenNameToTypeMap)).toBe(expectedTokenIDToTypeMap);
        expect(convertMapToString(g.stringLiteralToTypeMap)).toBe(expectedStringLiteralToTypeMap);
        expect(convertArrayToString(ToolTestUtils.realElements(g.typeToTokenList))).toBe(expectedTypeToTokenList);
    });

    it("testEmptyLexerModeDetection", () => {
        const test = [
            "lexer grammar L;\n" +
            "A : 'a';\n" +
            "mode X;\n" +
            "fragment B : 'b';",

            "error(" + IssueCode.ModeWithoutRules +
            "): L.g4:3:5: lexer mode X must contain at least one non-fragment rule\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testEmptyLexerRuleDetection", () => {
        const test = [
            "lexer grammar L;\n" +
            "A : 'a';\n" +
            "WS : [ \t]* -> skip;\n" +
            "mode X;\n" +
            "  B : C;\n" +
            "  fragment C : A | (A C)?;",

            "warning(" + IssueCode.EpsilonToken +
            "): L.g4:3:0: non-fragment lexer rule WS can match the empty string\n" +
            "warning(" + IssueCode.EpsilonToken +
            "): L.g4:5:2: non-fragment lexer rule B can match the empty string\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testTokensModesChannelsDeclarationConflictsWithReserved", () => {
        const test = [
            "lexer grammar L;\n" +
            "channels { SKIP, HIDDEN, channel0 }\n" +
            "A: 'a';\n" +
            "mode MAX_CHAR_VALUE;\n" +
            "MIN_CHAR_VALUE: 'a';\n" +
            "mode DEFAULT_MODE;\n" +
            "B: 'b';\n" +
            "mode M;\n" +
            "C: 'c';",

            "error(" + IssueCode.ReservedRuleName +
            "): L.g4:5:0: cannot declare a rule with reserved name MIN_CHAR_VALUE\n" +
            "error(" + IssueCode.ModeConflictsWithCommonConstants +
            "): L.g4:4:0: cannot use or declare mode with reserved name MAX_CHAR_VALUE\n" +
            "error(" + IssueCode.ChannelConflictsWithCommonConstants +
            "): L.g4:2:11: cannot use or declare channel with reserved name SKIP\n" +
            "error(" + IssueCode.ChannelConflictsWithCommonConstants +
            "): L.g4:2:17: cannot use or declare channel with reserved name HIDDEN\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testTokensModesChannelsUsingConflictsWithReserved", () => {
        const test = [
            "lexer grammar L;\n" +
            "A: 'a' -> channel(SKIP);\n" +
            "B: 'b' -> type(MORE);\n" +
            "C: 'c' -> mode(SKIP);\n" +
            "D: 'd' -> channel(HIDDEN);\n" +
            "E: 'e' -> type(EOF);\n" +
            "F: 'f' -> pushMode(DEFAULT_MODE);",

            "error(" + IssueCode.ChannelConflictsWithCommonConstants +
            "): L.g4:2:18: cannot use or declare channel with reserved name SKIP\n" +
            "error(" + IssueCode.TokenConflictsWithCommonConstants +
            "): L.g4:3:15: cannot use or declare token with reserved name MORE\n" +
            "error(" + IssueCode.ModeConflictsWithCommonConstants +
            "): L.g4:4:15: cannot use or declare mode with reserved name SKIP\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    // https://github.com/antlr/antlr4/issues/1411
    it("testWrongIdForTypeChannelModeCommand", () => {
        const test = [
            "lexer grammar L;\n" +
            "tokens { TOKEN1 }\n" +
            "channels { CHANNEL1 }\n" +
            "TOKEN: 'asdf' -> type(CHANNEL1), channel(MODE1), mode(TOKEN1);\n" +
            "mode MODE1;\n" +
            "MODE1_TOKEN: 'qwer';",

            "error(" + IssueCode.ConstantValueIsNotARecognizedTokenName +
            "): L.g4:4:22: CHANNEL1 is not a recognized token name\n" +
            "error(" + IssueCode.ConstantValueIsNotARecognizedChannelName +
            "): L.g4:4:41: MODE1 is not a recognized channel name\n" +
            "error(" + IssueCode.ConstantValueIsNotARecognizedModeName +
            "): L.g4:4:54: TOKEN1 is not a recognized mode name\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    // https://github.com/antlr/antlr4/issues/1388
    it("testDuplicatedCommands", () => {
        const test = [
            "lexer grammar Lexer;\n" +
            "channels { CHANNEL1, CHANNEL2 }\n" +
            "tokens { TEST1, TEST2 }\n" +
            "TOKEN: 'a' -> mode(MODE1), mode(MODE2);\n" +
            "TOKEN1: 'b' -> pushMode(MODE1), mode(MODE2);\n" +
            "TOKEN2: 'c' -> pushMode(MODE1), pushMode(MODE2); // pushMode is not duplicate\n" +
            "TOKEN3: 'd' -> popMode, popMode;                 // popMode is not duplicate\n" +
            "mode MODE1;\n" +
            "MODE1_TOKEN: 'e';\n" +
            "mode MODE2;\n" +
            "MODE2_TOKEN: 'f';\n" +
            "MODE2_TOKEN1: 'g' -> type(TEST1), type(TEST2);\n" +
            "MODE2_TOKEN2: 'h' -> channel(CHANNEL1), channel(CHANNEL2), channel(DEFAULT_TOKEN_CHANNEL);",

            "warning(" + IssueCode.DuplicatedCommand + "): Lexer.g4:4:27: duplicated command mode\n" +
            "warning(" + IssueCode.DuplicatedCommand + "): Lexer.g4:12:34: duplicated command type\n" +
            "warning(" + IssueCode.DuplicatedCommand + "): Lexer.g4:13:40: duplicated command channel\n" +
            "warning(" + IssueCode.DuplicatedCommand + "): Lexer.g4:13:59: duplicated command channel\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    // https://github.com/antlr/antlr4/issues/1388
    it("testIncompatibleCommands", () => {
        const test = [
            "lexer grammar L;\n" +
            "channels { CHANNEL1 }\n" +
            "tokens { TYPE1 }\n" +
            "// Incompatible\n" +
            "T00: 'a00' -> skip, more;\n" +
            "T01: 'a01' -> skip, type(TYPE1);\n" +
            "T02: 'a02' -> skip, channel(CHANNEL1);\n" +
            "T03: 'a03' -> more, type(TYPE1);\n" +
            "T04: 'a04' -> more, channel(CHANNEL1);\n" +
            "T05: 'a05' -> more, skip;\n" +
            "T06: 'a06' -> type(TYPE1), skip;\n" +
            "T07: 'a07' -> type(TYPE1), more;\n" +
            "T08: 'a08' -> channel(CHANNEL1), skip;\n" +
            "T09: 'a09' -> channel(CHANNEL1), more;\n" +
            "// Allowed\n" +
            "T10: 'a10' -> type(TYPE1), channel(CHANNEL1);\n" +
            "T11: 'a11' -> channel(CHANNEL1), type(TYPE1);",

            "warning(" + IssueCode.IncompatibleCommands + "): L.g4:5:20: incompatible commands skip and more\n" +
            "warning(" + IssueCode.IncompatibleCommands + "): L.g4:6:20: incompatible commands skip and type\n" +
            "warning(" + IssueCode.IncompatibleCommands +
            "): L.g4:7:20: incompatible commands skip and channel\n" +
            "warning(" + IssueCode.IncompatibleCommands + "): L.g4:8:20: incompatible commands more and type\n" +
            "warning(" + IssueCode.IncompatibleCommands +
            "): L.g4:9:20: incompatible commands more and channel\n" +
            "warning(" + IssueCode.IncompatibleCommands + "): L.g4:10:20: incompatible commands more and skip\n" +
            "warning(" + IssueCode.IncompatibleCommands + "): L.g4:11:27: incompatible commands type and skip\n" +
            "warning(" + IssueCode.IncompatibleCommands + "): L.g4:12:27: incompatible commands type and more\n" +
            "warning(" + IssueCode.IncompatibleCommands +
            "): L.g4:13:33: incompatible commands channel and skip\n" +
            "warning(" + IssueCode.IncompatibleCommands +
            "): L.g4:14:33: incompatible commands channel and more\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    // https://github.com/antlr/antlr4/issues/1409
    it("testLabelsForTokensWithMixedTypes", () => {
        const test = [
            "grammar L;\n" +
            "\n" +
            "rule1                                      // Correct (Alternatives)\n" +
            "    : t1=a  #aLabel\n" +
            "    | t1=b  #bLabel\n" +
            "    ;\n" +
            "rule2                         //Incorrect type casting in generated code (RULE_LABEL)\n" +
            "    : t2=a | t2=b\n" +
            "    ;\n" +
            "rule3\n" +
            "    : t3+=a+ b t3+=c+     //Incorrect type casting in generated code (RULE_LIST_LABEL)\n" +
            "    ;\n" +
            "rule4\n" +
            "    : a t4=A b t4=B c                  // Correct (TOKEN_LABEL)\n" +
            "    ;\n" +
            "rule5\n" +
            "    : a t5+=A b t5+=B c                // Correct (TOKEN_LIST_LABEL)\n" +
            "    ;\n" +
            "rule6                     // Correct (https://github.com/antlr/antlr4/issues/1543)\n" +
            "    : t6=a                          #t6_1_Label\n" +
            "    | t6=rule6 b (t61=c)? t62=rule6 #t6_2_Label\n" +
            "    | t6=A     a (t61=B)? t62=A     #t6_3_Label\n" +
            "    ;\n" +
            "rule7                     // Incorrect (https://github.com/antlr/antlr4/issues/1543)\n" +
            "    : a\n" +
            "    | t7=rule7 b (t71=c)? t72=rule7 \n" +
            "    | t7=A     a (t71=B)? t72=A     \n" +
            "    ;\n" +
            "rule8                     // Correct (https://github.com/antlr/antlr4/issues/1543)\n" +
            "    : a\n" +
            "    | t8=rule8 a t8=rule8\n" +
            "    | t8=rule8 b t8=rule8\n" +
            "    ;\n" +
            "a: A;\n" +
            "b: B;\n" +
            "c: C;\n" +
            "A: 'a';\n" +
            "B: 'b';\n" +
            "C: 'c';\n",

            "error(" + IssueCode.LabelTypeConflict +
            "): L.g4:8:13: label t2=b type mismatch with previous definition: t2=a\n" +
            "error(" + IssueCode.LabelTypeConflict +
            "): L.g4:11:15: label t3+=c type mismatch with previous definition: t3+=a\n" +

            "error(" + IssueCode.LabelTypeConflict +
            "): L.g4:24:0: label t7 type mismatch with previous definition: TOKEN_LABEL!=RULE_LABEL\n" +
            "error(" + IssueCode.LabelTypeConflict +
            "): L.g4:24:0: label t71 type mismatch with previous definition: RULE_LABEL!=TOKEN_LABEL\n" +
            "error(" + IssueCode.LabelTypeConflict +
            "): L.g4:24:0: label t72 type mismatch with previous definition: RULE_LABEL!=TOKEN_LABEL\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    // https://github.com/antlr/antlr4/issues/1543
    it("testLabelsForTokensWithMixedTypesLRWithLabels", () => {
        const test = [
            "grammar L;\n" +
            "\n" +
            "expr\n" +
            "    : left=A '+' right=A        #primary\n" +
            "    | left=expr '-' right=expr  #sub\n" +
            "    ;\n" +
            "\n" +
            "A: 'a';\n" +
            "B: 'b';\n" +
            "C: 'c';\n",

            ""
        ];

        ToolTestUtils.testErrors(test, false);
    });

    // https://github.com/antlr/antlr4/issues/1543
    it("testLabelsForTokensWithMixedTypesLRWithoutLabels", () => {
        const test = [
            "grammar L;\n" +
            "\n" +
            "expr\n" +
            "    : left=A '+' right=A\n" +
            "    | left=expr '-' right=expr\n" +
            "    ;\n" +
            "\n" +
            "A: 'a';\n" +
            "B: 'b';\n" +
            "C: 'c';\n",

            "error(" + IssueCode.LabelTypeConflict +
            "): L.g4:3:0: label left type mismatch with previous definition: TOKEN_LABEL!=RULE_LABEL\n" +
            "error(" + IssueCode.LabelTypeConflict +
            "): L.g4:3:0: label right type mismatch with previous definition: RULE_LABEL!=TOKEN_LABEL\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testCharsCollision", () => {
        const test = [
            "lexer grammar L;\n" +
            "TOKEN_RANGE:      [aa-f];\n" +
            "TOKEN_RANGE_2:    [A-FD-J];\n" +
            "TOKEN_RANGE_3:    'Z' | 'K'..'R' | 'O'..'V';\n" +
            "TOKEN_RANGE_4:    'g'..'l' | [g-l];\n" +
            "TOKEN_RANGE_WITHOUT_COLLISION: '_' | [a-zA-Z];\n" +
            "TOKEN_RANGE_WITH_ESCAPED_CHARS: [\\n-\\r] | '\\n'..'\\r';",

            "warning(" + IssueCode.CharactersCollisionInSet +
            "): L.g4:2:18: chars a-f used multiple times in set [aa-f]\n" +
            "warning(" + IssueCode.CharactersCollisionInSet +
            "): L.g4:3:18: chars D-J used multiple times in set [A-FD-J]\n" +
            "warning(" + IssueCode.CharactersCollisionInSet +
            "): L.g4:4:35: chars O-V used multiple times in set 'Z' | 'K'..'R' | 'O'..'V'\n" +
            "warning(" + IssueCode.CharactersCollisionInSet +
            "): L.g4::: chars 'g' used multiple times in set 'g'..'l'\n" +
            "warning(" + IssueCode.CharactersCollisionInSet +
            "): L.g4::: chars '\\n' used multiple times in set '\\n'..'\\r'\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testCaseInsensitiveCharsCollision", () => {
        const test = [
            "lexer grammar L;\n" +
            "options { caseInsensitive = true; }\n" +
            "TOKEN_RANGE:      [a-fA-F0-9];\n" +
            "TOKEN_RANGE_2:    'g'..'l' | 'G'..'L';\n" +
            "TOKEN_RANGE_3:    'm'..'q' | [M-Q];\n",

            "warning(" + IssueCode.CharactersCollisionInSet +
            "): L.g4:3:18: chars a-f used multiple times in set [a-fA-F0-9]\n" +
            "warning(" + IssueCode.CharactersCollisionInSet +
            "): L.g4:4:29: chars g-l used multiple times in set 'g'..'l' | 'G'..'L'\n" +
            "warning(" + IssueCode.CharactersCollisionInSet +
            "): L.g4::: chars 'M' used multiple times in set 'M'..'Q' | 'm'..'q'\n" +
            "warning(" + IssueCode.CharactersCollisionInSet +
            "): L.g4::: chars 'm' used multiple times in set 'M'..'Q' | 'm'..'q'\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testCaseInsensitiveWithUnicodeRanges", () => {
        const test = [
            "lexer grammar L;\n" +
            "options { caseInsensitive=true; }\n" +
            "FullWidthLetter\n" +
            "    : '\\u00c0'..'\\u00d6' // ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ\n" +
            "    | '\\u00f8'..'\\u00ff' // øùúûüýþÿ\n" +
            "    ;",

            ""
        ];

        // Don't transform øùúûüýþÿ to uppercase because of different length of lower and UPPER range
        ToolTestUtils.testErrors(test, false);
    });

    it("testUnreachableTokens", () => {
        const test = [
            "lexer grammar Test;\n" +
            "TOKEN1: 'as' 'df' | 'qwer';\n" +
            "TOKEN2: [0-9];\n" +
            "TOKEN3: 'asdf';\n" +
            "TOKEN4: 'q' 'w' 'e' 'r' | A;\n" +
            "TOKEN5: 'aaaa';\n" +
            "TOKEN6: 'asdf';\n" +
            "TOKEN7: 'qwer'+;\n" +
            "TOKEN8: 'a' 'b' | 'b' | 'a' 'b';\n" +
            "fragment\n" +
            "TOKEN9: 'asdf' | 'qwer' | 'qwer';\n" +
            "TOKEN10: '\\r\\n' | '\\r\\n';\n" +
            "TOKEN11: '\\r\\n';\n" +
            "\n" +
            "mode MODE1;\n" +
            "TOKEN12: 'asdf';\n" +
            "\n" +
            "fragment A: 'A';",

            "warning(" + IssueCode.TokenUnreachable +
            "): Test.g4:4:0: One of the token TOKEN3 values unreachable. asdf is always overlapped by token TOKEN1\n" +
            "warning(" + IssueCode.TokenUnreachable +
            "): Test.g4:5:0: One of the token TOKEN4 values unreachable. qwer is always overlapped by token TOKEN1\n" +
            "warning(" + IssueCode.TokenUnreachable +
            "): Test.g4:7:0: One of the token TOKEN6 values unreachable. asdf is always overlapped by token TOKEN1\n" +
            "warning(" + IssueCode.TokenUnreachable +
            "): Test.g4:7:0: One of the token TOKEN6 values unreachable. asdf is always overlapped by token TOKEN3\n" +
            "warning(" + IssueCode.TokenUnreachable +
            "): Test.g4:9:0: One of the token TOKEN8 values unreachable. ab is always overlapped by token TOKEN8\n" +
            "warning(" + IssueCode.TokenUnreachable +
            "): Test.g4:11:0: One of the token TOKEN9 values unreachable. qwer is always overlapped by token TOKEN9\n" +
            "warning(" + IssueCode.TokenUnreachable +
            "): Test.g4:12:0: One of the token TOKEN10 values unreachable. \\r\\n is always " +
            "overlapped by token TOKEN10\n" +
            "warning(" + IssueCode.TokenUnreachable +
            "): Test.g4:13:0: One of the token TOKEN11 values unreachable. \\r\\n is always " +
            "overlapped by token TOKEN10\n" +
            "warning(" + IssueCode.TokenUnreachable +
            "): Test.g4:13:0: One of the token TOKEN11 values unreachable. \\r\\n is always " +
            "overlapped by token TOKEN10\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testIllegalCaseInsensitiveOptionValue", () => {
        const test = [
            "lexer grammar L;\n" +
            "options { caseInsensitive = badValue; }\n" +
            "TOKEN_1 options { caseInsensitive = badValue; } : [A-F]+;\n",

            "warning(" + IssueCode.IllegalOptionValue +
            "): L.g4:2:28: unsupported option value caseInsensitive=badValue\n" +
            "warning(" + IssueCode.IllegalOptionValue +
            "): L.g4:3:36: unsupported option value caseInsensitive=badValue\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testRedundantCaseInsensitiveLexerRuleOption", () => {
        const test = [
            "lexer grammar L;\n" +
            "options { caseInsensitive = true; }\n" +
            "TOKEN options { caseInsensitive = true; } : [A-F]+;\n",

            "warning(" + IssueCode.RedundantCaseInsensitiveLexerRuleOption +
            "): L.g4:3:16: caseInsensitive lexer rule option is redundant because its value equals to " +
            "global value (true)\n"
        ];
        ToolTestUtils.testErrors(test, false);

        const test2 = [
            "lexer grammar L;\n" +
            "options { caseInsensitive = false; }\n" +
            "TOKEN options { caseInsensitive = false; } : [A-F]+;\n",

            "warning(" + IssueCode.RedundantCaseInsensitiveLexerRuleOption +
            "): L.g4:3:16: caseInsensitive lexer rule option is redundant because its value equals to " +
            "global value (false)\n"
        ];
        ToolTestUtils.testErrors(test2, false);
    });

    it("testCaseInsensitiveOptionInParseRule", () => {
        const test = [
            "grammar G;\n" +
            "root options { caseInsensitive=true; } : 'token';",

            "warning(" + IssueCode.IllegalOption + "): G.g4:2:15: unsupported option caseInsensitive\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testNotImpliedCharacters", () => {
        const test = [
            "lexer grammar Test;\n" +
            "TOKEN1: 'A'..'g';\n" +
            "TOKEN2: [C-m];\n" +
            "TOKEN3: [А-я]; // OK since range does not contain intermediate characters\n" +
            "TOKEN4: '\\u0100'..'\\u1fff'; // OK since range borders are unicode characters",

            "warning(" + IssueCode.RangeProbablyContainsNotImpliedCharacter +
            "): Test.g4:2:8: Range A..g probably contains not implied characters [\\]^_`. Both bounds should " +
            "be defined in lower or UPPER case\n" +
            "warning(" + IssueCode.RangeProbablyContainsNotImpliedCharacter +
            "): Test.g4:3:8: Range C..m probably contains not implied characters [\\]^_`. Both bounds should " +
            "be defined in lower or UPPER case\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    it("testNotImpliedCharactersWithCaseInsensitiveOption", () => {
        const test = [
            "lexer grammar Test;\n" +
            "options { caseInsensitive=true; }\n" +
            "TOKEN: [A-z];",

            "warning(" + IssueCode.RangeProbablyContainsNotImpliedCharacter +
            "): Test.g4:3:7: Range A..z probably contains not implied characters [\\]^_`. Both bounds should " +
            "be defined in lower or UPPER case\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });

    // ISSUE: https://github.com/antlr/antlr4/issues/2788
    it("testUndefinedLabel", () => {
        // This test is weird. It uses arguments for a rule that doesn't have any.
        // The expected error has been adjusted to reflect that.
        const test = [
            "grammar Test;" +
            "root\n" +
            "    : root a\n" +
            "    | b [error]\n" +
            "    ;\n" +
            "\n" +
            "a: 'a';\n" +
            "b: 'b';",

            //"error(" + IssueCode.INTERNAL_ERROR + "): Test.g4:2:30: internal error: Rule error undefined \n"
            "error(" + IssueCode.RuleHasNoArgs + "): Test.g4:2:13: rule b has no defined parameters\n"
        ];

        ToolTestUtils.testErrors(test, false);
    });
});
