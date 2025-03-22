/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { CharStream, CommonTokenStream } from "antlr4ng";

import { Grammar } from "../src/tool/index.js";
import { InterpreterTreeTextProvider } from "./InterpreterTreeTextProvider.js";
import { ToolTestUtils } from "./ToolTestUtils.js";
import type { IToolParameters } from "../src/tool-parameters.js";

describe("TestUnicodeGrammar", () => {

    const parseTreeForGrammarWithInput = (grammarText: string, rootRule: string, inputText: string): string => {
        const grammar = new Grammar(grammarText);
        grammar.tool.process(grammar, {} as IToolParameters, false);

        const lexEngine = grammar.createLexerInterpreter(CharStream.fromString(inputText));
        const tokens = new CommonTokenStream(lexEngine);
        const parser = grammar.createGrammarParserInterpreter(tokens);
        const parseTree = parser.parse(grammar.rules.get(rootRule)!.index);
        const nodeTextProvider = new InterpreterTreeTextProvider(grammar.getRuleNames());

        return ToolTestUtils.toStringTree(parseTree, nodeTextProvider);
    };

    it("unicodeBMPLiteralInGrammar", () => {
        const grammarText =
            "grammar Unicode;\n" +
            "r : 'hello' WORLD;\n" +
            "WORLD : ('world' | '\\u4E16\\u754C' | '\\u1000\\u1019\\u1039\\u1018\\u102C' );\n" +
            "WS : [ \\t\\r\\n]+ -> skip;\n";
        const inputText = "hello \u4E16\u754C";
        expect(parseTreeForGrammarWithInput(grammarText, "r", inputText)).toBe("(r:1 " + inputText + ")");
    });

    // Disabled in the original Java code. Needs changes in the tool to work.
    it.skip("unicodeSurrogatePairLiteralInGrammar", () => {
        const grammarText =
            "grammar Unicode;\n" +
            "r : 'hello' WORLD;\n" +
            "WORLD : ('\\uD83D\\uDE43' | '\\uD83D\\uDE40' | '\\uD83D\\uDE50'\n" +
            "WS : [ \\t\\r\\n]+ -> skip;\n";
        const inputText = "hello " + String.fromCharCode(0x1F30E);
        expect(parseTreeForGrammarWithInput(grammarText, "r", inputText)).toBe("(r:1 " + inputText + ")");
    });

    it("unicodeSMPLiteralInGrammar", () => {
        const grammarText =
            "grammar Unicode;\n" +
            "r : 'hello' WORLD;\n" +
            "WORLD : ('\\u{1F30D}' | '\\u{1F30E}' | '\\u{1F30F}' );\n" +
            "WS : [ \\t\\r\\n]+ -> skip;\n";
        const inputText = "hello " + String.fromCodePoint(0x1F30E);
        expect(parseTreeForGrammarWithInput(grammarText, "r", inputText)).toBe("(r:1 " + inputText + ")");
    });

    it("unicodeSMPRangeInGrammar", () => {
        const grammarText =
            "grammar Unicode;\n" +
            "r : 'hello' WORLD;\n" +
            "WORLD : ('\\u{1F30D}'..'\\u{1F30F}' );\n" +
            "WS : [ \\t\\r\\n]+ -> skip;\n";
        const inputText = "hello " + String.fromCodePoint(0x1F30E);
        expect(parseTreeForGrammarWithInput(grammarText, "r", inputText)).toBe("(r:1 " + inputText + ")");
    });

    it("matchingDanglingSurrogateInInput", () => {
        const grammarText =
            "grammar Unicode;\n" +
            "r : 'hello' WORLD;\n" +
            "WORLD : ('\\uD83C' | '\\uD83D' | '\\uD83E' );\n" +
            "WS : [ \\t\\r\\n]+ -> skip;\n";
        const inputText = "hello \uD83C";
        expect(parseTreeForGrammarWithInput(grammarText, "r", inputText)).toBe("(r:1 " + inputText + ")");
    });

    /*
    TODO: can this really be considered as parsing binary data? All we do is to treat byte values as characters.
    it("binaryGrammar", () => {
        const grammarText =
            "grammar Binary;\n" +
            "r : HEADER PACKET+ FOOTER;\n" +
            "HEADER : '\\u0002\\u0000\\u0001\\u0007';\n" +
            "PACKET : '\\u00D0' ('\\u00D1' | '\\u00D2' | '\\u00D3') +;\n" +
            "FOOTER : '\\u00FF';\n";
        const toParse = [
            Number(0x02), Number(0x00), Number(0x01), Number(0x07),
            Number(0xD0), Number(0xD2), Number(0xD2), Number(0xD3), Number(0xD3), Number(0xD3),
            Number(0xD0), Number(0xD3), Number(0xD3), Number(0xD1),
            Number(0xFF)
        ];

        let charStream: CharStream;
        {
            // This holds the final error to throw (if any).
            let error: java.lang.Throwable | undefined;

            const is: ByteArrayInputStream = new ByteArrayInputStream(toParse);
            // Note we use ISO_8859_1 to treat all byte values as Unicode "characters" from
            // U+0000 to U+00FF.
            const isr = new InputStreamReader(CharStreams.fromStream.is, StandardCharsets.ISO_8859_1);
            try {
                try {
                    charStream = new ANTLRInputStream(isr);
                } finally {
                    error = closeResources([is, isr]);
                }
            } catch (e) {
                error = handleResourceError(e, error);
            } finally {
                throwResourceError(error);
            }
        }

        const grammar = new Grammar(grammarText);
        const lexEngine = grammar.createLexerInterpreter(charStream);
        const tokens = new CommonTokenStream(lexEngine);
        const parser = grammar.createGrammarParserInterpreter(tokens);
        const parseTree = parser.parse(grammar.rules.get("r").index);
        const nodeTextProvider =
            new InterpreterTreeTextProvider(grammar.getRuleNames());
        const result = Trees.toStringTree(parseTree, nodeTextProvider);

        expect(result).toBe(
            "(r:1 \u0002\u0000\u0001\u0007 \u00D0\u00D2\u00D2\u00D3\u00D3\u00D3 \u00D0\u00D3\u00D3\u00D1 \u00FF)");
    });*/
});
