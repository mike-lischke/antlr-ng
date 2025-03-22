/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

// cspell: ignore MULT

import { describe, expect, it } from "vitest";

import { BufferedTokenStream, CharStream, Token, type TokenSource, type TokenStream } from "antlr4ng";

import type { IToolParameters } from "../src/tool-parameters.js";
import { LexerGrammar } from "../src/tool/index.js";

describe("TestBufferedTokenStream", () => {
    const createTokenStream = (src: TokenSource): TokenStream => {
        return new BufferedTokenStream(src);
    };

    it("testFirstToken", (): void => {
        const g = new LexerGrammar(
            "lexer grammar t;\n" +
            "ID : 'a'..'z'+;\n" +
            "INT : '0'..'9'+;\n" +
            "SEMI : ';';\n" +
            "ASSIGN : '=';\n" +
            "PLUS : '+';\n" +
            "MULT : '*';\n" +
            "WS : ' '+;\n");
        g.tool.process(g, {} as IToolParameters, false);

        // Tokens: 012345678901234567
        // Input:  x = 3 * 0 + 2 * 0;
        const input = CharStream.fromString("x = 3 * 0 + 2 * 0;");
        const lexEngine = g.createLexerInterpreter(input);
        const tokens = createTokenStream(lexEngine);

        const result = tokens.LT(1)!.text;
        const expecting = "x";

        expect(result).toBe(expecting);
    });

    it("test2ndToken", (): void => {
        const g = new LexerGrammar(
            "lexer grammar t;\n" +
            "ID : 'a'..'z'+;\n" +
            "INT : '0'..'9'+;\n" +
            "SEMI : ';';\n" +
            "ASSIGN : '=';\n" +
            "PLUS : '+';\n" +
            "MULT : '*';\n" +
            "WS : ' '+;\n");
        g.tool.process(g, {} as IToolParameters, false);

        // Tokens: 012345678901234567
        // Input:  x = 3 * 0 + 2 * 0;
        const input = CharStream.fromString("x = 3 * 0 + 2 * 0;");
        const lexEngine = g.createLexerInterpreter(input);
        const tokens = createTokenStream(lexEngine);

        const result = tokens.LT(2)!.text;
        const expecting = " ";
        expect(result).toBe(expecting);
    });

    it("testCompleteBuffer", (): void => {
        const g = new LexerGrammar(
            "lexer grammar t;\n" +
            "ID : 'a'..'z'+;\n" +
            "INT : '0'..'9'+;\n" +
            "SEMI : ';';\n" +
            "ASSIGN : '=';\n" +
            "PLUS : '+';\n" +
            "MULT : '*';\n" +
            "WS : ' '+;\n");
        g.tool.process(g, {} as IToolParameters, false);

        // Tokens: 012345678901234567
        // Input:  x = 3 * 0 + 2 * 0;
        const input = CharStream.fromString("x = 3 * 0 + 2 * 0;");
        const lexEngine = g.createLexerInterpreter(input);
        const tokens = createTokenStream(lexEngine);

        let i = 1;
        let t = tokens.LT(i)!;
        while (t.type !== Token.EOF) {
            i++;
            t = tokens.LT(i)!;
        }
        tokens.LT(i++); // push it past end
        tokens.LT(i++);

        const result = tokens.getText();
        const expecting = "x = 3 * 0 + 2 * 0;";
        expect(result).toBe(expecting);
    });

    it("testCompleteBufferAfterConsuming", (): void => {
        const g = new LexerGrammar(
            "lexer grammar t;\n" +
            "ID : 'a'..'z'+;\n" +
            "INT : '0'..'9'+;\n" +
            "SEMI : ';';\n" +
            "ASSIGN : '=';\n" +
            "PLUS : '+';\n" +
            "MULT : '*';\n" +
            "WS : ' '+;\n");
        g.tool.process(g, {} as IToolParameters, false);

        // Tokens: 012345678901234567
        // Input:  x = 3 * 0 + 2 * 0;
        const input = CharStream.fromString("x = 3 * 0 + 2 * 0;");
        const lexEngine = g.createLexerInterpreter(input);
        const tokens = createTokenStream(lexEngine);

        let t = tokens.LT(1)!;
        while (t.type !== Token.EOF) {
            tokens.consume();
            t = tokens.LT(1)!;
        }

        const result = tokens.getText();
        const expecting = "x = 3 * 0 + 2 * 0;";
        expect(result).toBe(expecting);
    });

    it("testLookBack", (): void => {
        const g = new LexerGrammar(
            "lexer grammar t;\n" +
            "ID : 'a'..'z'+;\n" +
            "INT : '0'..'9'+;\n" +
            "SEMI : ';';\n" +
            "ASSIGN : '=';\n" +
            "PLUS : '+';\n" +
            "MULT : '*';\n" +
            "WS : ' '+;\n");
        g.tool.process(g, {} as IToolParameters, false);

        // Tokens: 012345678901234567
        // Input:  x = 3 * 0 + 2 * 0;
        const input = CharStream.fromString("x = 3 * 0 + 2 * 0;");
        const lexEngine = g.createLexerInterpreter(input);
        const tokens = createTokenStream(lexEngine);

        tokens.consume(); // get x into buffer
        let t = tokens.LT(-1);
        expect(t?.text).toBe("x");

        tokens.consume();
        tokens.consume(); // consume '='
        t = tokens.LT(-3);
        expect(t?.text).toBe("x");
        t = tokens.LT(-2);
        expect(t?.text).toBe(" ");
        t = tokens.LT(-1);
        expect(t?.text).toBe("=");
    });

});
