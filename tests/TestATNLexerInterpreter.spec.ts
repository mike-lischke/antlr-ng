/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

// cspell: ignore xyqz KEND

import { describe, expect, it } from "vitest";

import { ATN, CharStream, DFA, Lexer, LexerATNSimulator, Token } from "antlr4ng";
import type { IToolParameters } from "../src/tool-parameters.js";
import { LexerGrammar } from "../src/tool/index.js";
import { ToolTestUtils } from "./ToolTestUtils.js";

/**
 * Lexer rules are little quirky when it comes to wildcards. Problem
 * stems from the fact that we want the longest match to win among
 * several rules and even within a rule. However, that conflicts
 * with the notion of non-greedy, which by definition tries to match
 * the fewest possible. During ATN construction, non-greedy loops
 * have their entry and exit branches reversed so that the ATN
 * simulator will see the exit branch 1st, giving it a priority. The
 * 1st path to the stop state kills any other paths for that rule
 * that begin with the wildcard. In general, this does everything we
 * want, but occasionally there are some quirks as you'll see from
 * the tests below.
 */
describe("TestATNLexerInterpreter", () => {

    const getTokenTypes = (lg: LexerGrammar, atn: ATN, input: CharStream): string[] => {
        const interp = new LexerATNSimulator(null, atn, [new DFA(atn.modeToStartState[Lexer.DEFAULT_MODE])]);
        const tokenTypes: string[] = [];
        let ttype: number;
        let hitEOF = false;
        do {
            if (hitEOF) {
                tokenTypes.push("EOF");
                break;
            }
            const t = input.LA(1);
            ttype = interp.match(input, Lexer.DEFAULT_MODE);
            if (ttype === Token.EOF) {
                tokenTypes.push("EOF");
            } else {
                tokenTypes.push(lg.typeToTokenList[ttype]!);
            }

            if (t === Token.EOF) {
                hitEOF = true;
            }
        } while (ttype !== Token.EOF);

        return tokenTypes;
    };

    const checkLexerMatches = (lg: LexerGrammar, inputString: string, expecting: string): void => {
        const atn = ToolTestUtils.createATN(lg, true);
        const input = CharStream.fromString(inputString);
        const tokenTypes = getTokenTypes(lg, atn, input);

        expect(tokenTypes.join(", ")).toBe(expecting);
    };

    const execLexer = (grammar: string, grammarFileName: string, input: string): string => {
        const lg = new LexerGrammar(grammar);
        lg.fileName = grammarFileName;
        lg.tool.process(lg, {} as IToolParameters, false);

        const atn = ToolTestUtils.createATN(lg, true);
        const inputString = CharStream.fromString(input);
        try {
            getTokenTypes(lg, atn, inputString);

            return "";
        } catch (e) {
            return String(e);
        }
    };

    it("testLexerTwoRules", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" +
            "B : 'b' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "A, B, A, B, EOF";
        checkLexerMatches(lg, "abab", expecting);
    });

    it("testShortLongRule", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'xy'\n" +
            "  | 'xyz'\n" + // this alt is preferred since there are no non-greedy configs
            "  ;\n" +
            "Z : 'z'\n" +
            "  ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        checkLexerMatches(lg, "xy", "A, EOF");
        checkLexerMatches(lg, "xyz", "A, EOF");
    });

    it("testShortLongRule2", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'xyz'\n" + // make sure nongreedy mech cut off doesn't kill this alt
            "  | 'xy'\n" +
            "  ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        checkLexerMatches(lg, "xy", "A, EOF");
        checkLexerMatches(lg, "xyz", "A, EOF");
    });

    it("testWildOnEndFirstAlt", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'xy' .\n" + // should pursue '.' since xyz hits stop first, before 2nd alt
            "  | 'xy'\n" +
            "  ;\n" +
            "Z : 'z'\n" +
            "  ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        checkLexerMatches(lg, "xy", "A, EOF");
        checkLexerMatches(lg, "xyz", "A, EOF");
    });

    it("testWildOnEndLastAlt", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'xy'\n" +
            "  | 'xy' .\n" + // this alt is preferred since there are no non-greedy configs
            "  ;\n" +
            "Z : 'z'\n" +
            "  ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        checkLexerMatches(lg, "xy", "A, EOF");
        checkLexerMatches(lg, "xyz", "A, EOF");
    });

    it("testWildcardNonQuirkWhenSplitBetweenTwoRules", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'xy' ;\n" +
            "B : 'xy' . 'z' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        checkLexerMatches(lg, "xy", "A, EOF");
        checkLexerMatches(lg, "xyqz", "B, EOF");
    });

    it("testLexerLoops", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : '0'..'9'+ ;\n" +
            "ID : 'a'..'z'+ ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, INT, ID, INT, EOF";
        checkLexerMatches(lg, "a34bde3", expecting);
    });

    it("testLexerNotSet", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, "c", expecting);
    });

    it("testLexerSetUnicodeBMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ('\u611B'|'\u611C')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, "\u611B", expecting);
    });

    it("testLexerNotSetUnicodeBMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\u611B'|'\u611C')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, "\u611D", expecting);
    });

    it("testLexerNotSetUnicodeBMPMatchesSMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\u611B'|'\u611C')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, String.fromCodePoint(0x1F4A9), expecting);
    });

    it("testLexerSetUnicodeSMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ('\\u{1F4A9}'|'\\u{1F4AA}')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, String.fromCodePoint(0x1F4A9), expecting);
    });

    it("testLexerNotBMPSetMatchesUnicodeSMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, String.fromCodePoint(0x1F4A9), expecting);
    });

    it("testLexerNotBMPSetMatchesBMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, "\u611B", expecting);
    });

    it("testLexerNotBMPSetMatchesSMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('a'|'b')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, String.fromCodePoint(0x1F4A9), expecting);
    });

    it("testLexerNotSMPSetMatchesBMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\\u{1F4A9}'|'\\u{1F4AA}')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, "\u611B", expecting);
    });

    it("testLexerNotSMPSetMatchesSMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ~('\\u{1F4A9}'|'\\u{1F4AA}')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, String.fromCodePoint(0x1D7C0), expecting);
    });

    it("testLexerRangeUnicodeSMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ('\\u{1F4A9}'..'\\u{1F4B0}')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, String.fromCodePoint(0x1F4AF), expecting);
    });

    it("testLexerRangeUnicodeBMPToSMP", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "ID : ('\\u611B'..'\\u{1F4B0}')\n ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "ID, EOF";
        checkLexerMatches(lg, String.fromCodePoint(0x12001), expecting);
    });

    it("testLexerKeywordIDAmbiguity", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "KEND : 'end' ;\n" +
            "ID : 'a'..'z'+ ;\n" +
            "WS : (' '|'\\n')+ ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        let expecting = "ID, EOF";
        expecting = "KEND, EOF";
        checkLexerMatches(lg, "end", expecting);
        expecting = "ID, EOF";
        checkLexerMatches(lg, "ending", expecting);
        expecting = "ID, WS, KEND, WS, ID, EOF";
        checkLexerMatches(lg, "a end bcd", expecting);
    });

    it("testLexerRuleRef", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "INT : DIGIT+ ;\n" +
            "fragment DIGIT : '0'..'9' ;\n" +
            "WS : (' '|'\\n')+ ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "INT, WS, INT, EOF";
        checkLexerMatches(lg, "32 99", expecting);
    });

    it("testRecursiveLexerRuleRef", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '/*' (CMT | ~'*')+ '*/' ;\n" +
            "WS : (' '|'\\n')+ ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, WS, CMT, EOF";
        checkLexerMatches(lg, "/* ick */\n/* /*nested*/ */", expecting);
    });

    it("testRecursiveLexerRuleRefWithWildcard", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '/*' (CMT | .)*? '*/' ;\n" +
            "WS : (' '|'\\n')+ ;");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, WS, CMT, WS, EOF";
        checkLexerMatches(lg,
            "/* ick */\n" +
            "/* /* */\n" +
            "/* /*nested*/ */\n",
            expecting);
    });

    it("testLexerWildcardGreedyLoopByDefault", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '//' .* '\\n' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, EOF";
        checkLexerMatches(lg, "//x\n//y\n", expecting);
    });

    it("testLexerWildcardLoopExplicitNonGreedy", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '//' .*? '\\n' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, CMT, EOF";
        checkLexerMatches(lg, "//x\n//y\n", expecting);
    });

    it("testLexerEscapeInString", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "STR : '[' ('~' ']' | .)* ']' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        checkLexerMatches(lg, "[a~]b]", "STR, EOF");
        checkLexerMatches(lg, "[a]", "STR, EOF");
    });

    it("testLexerWildcardGreedyPlusLoopByDefault", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '//' .+ '\\n' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, EOF";
        checkLexerMatches(lg, "//x\n//y\n", expecting);
    });

    it("testLexerWildcardExplicitNonGreedyPlusLoop", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '//' .+? '\\n' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, CMT, EOF";
        checkLexerMatches(lg, "//x\n//y\n", expecting);
    });

    // does not fail since ('*/')? can't match and have rule succeed
    it("testLexerGreedyOptionalShouldWorkAsWeExpect", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '/*' ('*/')? '*/' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, EOF";
        checkLexerMatches(lg, "/**/", expecting);
    });

    it("testGreedyBetweenRules", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : '<a>' ;\n" +
            "B : '<' .+ '>' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "B, EOF";
        checkLexerMatches(lg, "<a><x>", expecting);
    });

    it("testNonGreedyBetweenRules", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : '<a>' ;\n" +
            "B : '<' .+? '>' ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "A, B, EOF";
        checkLexerMatches(lg, "<a><x>", expecting);
    });

    it("testEOFAtEndOfLineComment", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '//' ~('\\n')* ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, EOF";
        checkLexerMatches(lg, "//x", expecting);
    });

    it("testEOFAtEndOfLineComment2", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '//' ~('\\n'|'\\r')* ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, EOF";
        checkLexerMatches(lg, "//x", expecting);
    });

    /**
     * only positive sets like (EOF|'\n') can match EOF and not in wildcard or ~foo sets
     *  EOF matches but does not advance cursor.
     */
    it("testEOFInSetAtEndOfLineComment", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "CMT : '//' .* (EOF|'\\n') ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "CMT, EOF";
        checkLexerMatches(lg, "//", expecting);
    });

    it("testEOFSuffixInSecondRule", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' ;\n" + // shorter than 'a' EOF, despite EOF being 0 width
            "B : 'a' EOF ;\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "B, EOF";
        checkLexerMatches(lg, "a", expecting);
    });

    it("testEOFSuffixInFirstRule", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "A : 'a' EOF ;\n" +
            "B : 'a';\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "A, EOF";
        checkLexerMatches(lg, "a", expecting);
    });

    it("testEOFByItself", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "DONE : EOF ;\n" +
            "A : 'a';\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const expecting = "A, DONE, EOF";
        checkLexerMatches(lg, "a", expecting);
    });

    // cspell: disable

    it("testLexerCaseInsensitive", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "\n" +
            "options { caseInsensitive = true; }\n" +
            "\n" +
            "WS:             [ \\t\\r\\n] -> skip;\n" +
            "\n" +
            "SIMPLE_TOKEN:           'and';\n" +
            "TOKEN_WITH_SPACES:      'as' 'd' 'f';\n" +
            "TOKEN_WITH_DIGITS:      'INT64';\n" +
            "TOKEN_WITH_UNDERSCORE:  'TOKEN_WITH_UNDERSCORE';\n" +
            "BOOL:                   'true' | 'FALSE';\n" +
            "SPECIAL:                '==';\n" +
            "SET:                    [a-z0-9]+;\n" + // [a-zA-Z0-9]
            "RANGE:                  ('а'..'я')+;"
        );
        lg.tool.process(lg, {} as IToolParameters, false);

        const inputString =
            "and AND aND\n" +
            "asdf ASDF\n" +
            "int64\n" +
            "token_WITH_underscore\n" +
            "TRUE FALSE\n" +
            "==\n" +
            "A0bcDE93\n" +
            "АБВабв\n";

        const expecting = [
            "SIMPLE_TOKEN", "SIMPLE_TOKEN", "SIMPLE_TOKEN",
            "TOKEN_WITH_SPACES", "TOKEN_WITH_SPACES",
            "TOKEN_WITH_DIGITS",
            "TOKEN_WITH_UNDERSCORE",
            "BOOL", "BOOL",
            "SPECIAL",
            "SET",
            "RANGE",
            "EOF"
        ].join(", WS, ");

        checkLexerMatches(lg, inputString, expecting);
    });

    it("testLexerCaseInsensitiveLiteralWithNegation", (): void => {
        const grammar =
            "lexer grammar L;\n" +
            "options { caseInsensitive = true; }\n" +
            "LITERAL_WITH_NOT:   ~'f';\n";

        // This test differs from the Java version because that consist of the fully generated code
        // just to test a simple lexer parse error. All other tests here just run the simulator directly.
        // Because of that the returned error message is different.
        const result = execLexer(grammar, "L", "F");
        expect(result).toBe("LexerNoViableAltException(F)");

        //expect(errors).toBe("line 1:0 token recognition error at: 'F'\n");
    });

    it("testLexerCaseInsensitiveSetWithNegation", (): void => {
        const grammar =
            "lexer grammar L;\n" +
            "options { caseInsensitive = true; }\n" +
            "SET_WITH_NOT: ~[a-c];\n"; // ~[a-cA-C]
        const result = execLexer(grammar, "L", "B");

        expect(result).toBe("LexerNoViableAltException(B)");
    });

    it("testLexerCaseInsensitiveFragments", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "options { caseInsensitive = true; }\n" +
            "TOKEN_0:         FRAGMENT 'd'+;\n" +
            "TOKEN_1:         FRAGMENT 'e'+;\n" +
            "FRAGMENT:        'abc';\n");
        lg.tool.process(lg, {} as IToolParameters, false);

        const inputString =
            "ABCDDD";

        const expecting = "TOKEN_0, EOF";

        checkLexerMatches(lg, inputString, expecting);
    });

    it("testLexerCaseInsensitiveWithDifferentCultures", (): void => {
        // From http://www.periodni.com/unicode_utf-8_encoding.html
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "options { caseInsensitive = true; }\n" +
            "ENGLISH_TOKEN:   [a-z]+;\n" +
            "GERMAN_TOKEN:    [äéöüß]+;\n" +
            "FRENCH_TOKEN:    [àâæ-ëîïôœùûüÿ]+;\n" +
            "CROATIAN_TOKEN:  [ćčđšž]+;\n" +
            "ITALIAN_TOKEN:   [àèéìòù]+;\n" +
            "SPANISH_TOKEN:   [áéíñóúü¡¿]+;\n" +
            "GREEK_TOKEN:     [α-ω]+;\n" +
            "RUSSIAN_TOKEN:   [а-я]+;\n" +
            "WS:              [ ]+ -> skip;"
        );
        lg.tool.process(lg, {} as IToolParameters, false);

        const inputString = "abcXYZ äéöüßÄÉÖÜß àâæçÙÛÜŸ ćčđĐŠŽ àèéÌÒÙ áéÚÜ¡¿ αβγΧΨΩ абвЭЮЯ ";

        const expecting = [
            "ENGLISH_TOKEN",
            "GERMAN_TOKEN",
            "FRENCH_TOKEN",
            "CROATIAN_TOKEN",
            "ITALIAN_TOKEN",
            "SPANISH_TOKEN",
            "GREEK_TOKEN",
            "RUSSIAN_TOKEN",
            "EOF"].join(", WS, ");

        checkLexerMatches(lg, inputString, expecting);
    });

    it("testNotImpliedCharactersWithEnabledCaseInsensitiveOption", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "options { caseInsensitive = true; }\n" +
            "TOKEN: ('A'..'z')+;\n"
        );
        lg.tool.process(lg, {} as IToolParameters, false);

        // No range transformation because of mixed character case in range borders
        const inputString = "ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz";
        checkLexerMatches(lg, inputString, "TOKEN, EOF");
    });

    it("testCaseInsensitiveInLexerRule", (): void => {
        const lg = new LexerGrammar(
            "lexer grammar L;\n" +
            "TOKEN1 options { caseInsensitive=true; } : [a-f]+;\n" +
            "WS: [ ]+ -> skip;"
        );
        lg.tool.process(lg, {} as IToolParameters, false);

        checkLexerMatches(lg, "ABCDEF", "TOKEN1, EOF");
    });

    it("testCaseInsensitiveInLexerRuleOverridesGlobalValue", (): void => {
        const grammar =
            "lexer grammar L;\n" +
            "options { caseInsensitive=true; }\n" +
            "STRING options { caseInsensitive=false; } : 'N'? '\\'' (~'\\'' | '\\'\\'')* '\\'';\n";

        const result = execLexer(grammar, "L", "n'sample'");
        expect(result).toBe("LexerNoViableAltException(n)");
    });

});
