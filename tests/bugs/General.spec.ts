/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ATNSerializer } from "antlr4ng";

import { CodeGenerator } from "../../src/codegen/CodeGenerator.js";
import { DOTGenerator } from "../../src/tool/DOTGenerator.js";
import { Grammar, LexerGrammar } from "../../src/tool/index.js";
import type { IToolParameters } from "../../src/tool-parameters.js";

// Dummy parameters for the tests.
const parameters: IToolConfiguration = {
    grammarFiles: [],
    outputDirectory: "",
};

describe("General", () => {
    it("Bug #33 Escaping issues with backslash in .dot file comparison", async () => {
        const sourcePath = fileURLToPath(new URL("data/abbLexer.g4", import.meta.url));
        const lexerGrammarText = await readFile(sourcePath, "utf8");
        const lexerGrammar = new LexerGrammar(lexerGrammarText);
        lexerGrammar.tool.process(lexerGrammar, parameters, false);

        const rule = lexerGrammar.getRule("EscapeSequence")!;
        const startState = lexerGrammar.atn!.ruleToStartState[rule.index]!;

        const dotGenerator = new DOTGenerator(lexerGrammar);
        const result = dotGenerator.getDOTFromState(startState, true);
        expect(result.indexOf(`s327 -> s335 [fontsize=11, fontname="Courier", arrowsize=.7, ` +
            String.raw`label = "'\\\\'", arrowhead = normal];`)).toBeGreaterThan(-1);
    });

    it("Bug #35 Tool crashes with --atn", async () => {
        const sourcePath = fileURLToPath(new URL("data/GoLexer.g4", import.meta.url));
        const lexerGrammarText = await readFile(sourcePath, "utf8");
        const lexerGrammar = new LexerGrammar(lexerGrammarText);
        lexerGrammar.tool.process(lexerGrammar, parameters, false);

        const rule = lexerGrammar.getRule("EOS")!;
        const startState = lexerGrammar.atn!.ruleToStartState[rule.index]!;

        const dotGenerator = new DOTGenerator(lexerGrammar);
        const result = dotGenerator.getDOTFromState(startState, true);
        expect(result.indexOf(`s833 -> s835 [fontsize=11, fontname="Courier", arrowsize=.7, label = "EOF", ` +
            `arrowhead = normal];`)).toBeGreaterThan(-1);
    });

    it("Grammar with element options", () => {
        // Element options are allowed after an action and after a predicate.
        const grammarText = `grammar T;
            s @after {global.antlrTestWriteLn!($ctx.toStringTree(null, this));} : e ;
            e : a=e op=('*'|'/') b=e  {}{true}?
            | a=e op=('+'|'-') b=e  {}<p=3>{true}?<fail='Message'>
            | INT {}{}
            | '(' x=e ')' {}{}
            ;
            INT : '0'..'9'+ ;
            WS : (' '|'\\n') -> skip;`;

        const grammar = new Grammar(grammarText);
        grammar.tool.process(grammar, parameters, false);

        const rule = grammar.getRule("e")!;
        const startState = grammar.atn!.ruleToStartState[rule.index]!;
        expect(startState).toBeDefined(); // We only need to see if the grammar parses without errors.
    });

    it("Non-greedy optionals", () => {
        const grammarText = `
        grammar T;
            start : statement+ ;
            statement : 'x' | ifStatement;
            ifStatement : 'if' 'y' statement ('else' statement)?? {
            global.antlrTestWriteLn!($text);
            };
            ID : 'a'..'z'+ ;
            WS : (' '|'\\n') -> channel(HIDDEN);
        `;

        const grammar = new Grammar(grammarText);
        grammar.tool.process(grammar, parameters, false);

        const atn = grammar.atn!;
        const expectedSerializedATN: number[] = [
            4, 1, 6, 25, 2, 0, 7, 0, 2, 1, 7, 1, 2, 2, 7, 2, 1, 0, 4, 0, 8, 8, 0, 11, 0, 12, 0, 9, 1, 1, 1,
            1, 3, 1, 14, 8, 1, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 3, 2, 21, 8, 2, 1, 2, 1, 2, 1, 2, 1, 20, 0, 3,
            0, 2, 4, 0, 0, 24, 0, 7, 1, 0, 0, 0, 2, 13, 1, 0, 0, 0, 4, 15, 1, 0, 0, 0, 6, 8, 3, 2, 1, 0, 7,
            6, 1, 0, 0, 0, 8, 9, 1, 0, 0, 0, 9, 7, 1, 0, 0, 0, 9, 10, 1, 0, 0, 0, 10, 1, 1, 0, 0, 0, 11, 14,
            5, 1, 0, 0, 12, 14, 3, 4, 2, 0, 13, 11, 1, 0, 0, 0, 13, 12, 1, 0, 0, 0, 14, 3, 1, 0, 0, 0, 15,
            16, 5, 2, 0, 0, 16, 17, 5, 3, 0, 0, 17, 20, 3, 2, 1, 0, 18, 19, 5, 4, 0, 0, 19, 21, 3, 2, 1,
            0, 20, 21, 1, 0, 0, 0, 20, 18, 1, 0, 0, 0, 21, 22, 1, 0, 0, 0, 22, 23, 6, 2, -1, 0, 23, 5,
            1, 0, 0, 0, 3, 9, 13, 20
        ];

        const serializer = new ATNSerializer(atn);
        const serializedATN = serializer.serialize();
        expect(serializedATN).toEqual(expectedSerializedATN);
    });

    it("Bug #62 Triple quoted strings in actions", () => {
        const grammarText = `grammar T;
                @definitions {
                }

                @parser::members {
                    def here(self, type):
                        """Returns \`True\` iff on the current index of the parser's
                        token stream a token of the given \`type\` exists on the
                        \`HIDDEN\` channel.

                    Args:
                        type (int): the type of the token on the \`HIDDEN\` channel
                        to check.

                    Returns:
                        \`True\` iff on the current index of the parser's
                        token stream a token of the given \`type\` exists on the
                        \`HIDDEN\` channel.
                    """
                }

                s : a ;
                a : a ID {false}?<fail='custom message'>
                | ID
                ;
                ID : 'a'..'z'+ ;
                WS : (' '|'\\n') -> skip ;`;
        const g = new Grammar(grammarText);
        g.tool.process(g, parameters, false);

        const gen = new CodeGenerator(g);
        const outputFileST = gen.generateParser(g.tool.toolConfiguration);
        const outputFile = outputFileST.render();
        expect(outputFile).toContain("FailedPredicateException(this, \"false\", \"custom message\");");
        expect(outputFile).toContain("\"\"\"Returns `True` iff on the current index of the parser's");
    });

});
