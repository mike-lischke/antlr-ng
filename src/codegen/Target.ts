/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

/* eslint-disable jsdoc/require-param, jsdoc/require-returns */

// cspell: ignore unnnn

import { RuntimeMetaData, Token } from "antlr4ng";
import {
    NumberRenderer, STGroup, STGroupFile, StringRenderer, type IST, type STErrorListener, type STMessage
} from "stringtemplate4ts";

import { ANTLRv4Parser } from "../generated/ANTLRv4Parser.js";
import { CharSupport } from "../misc/CharSupport.js";
import { Utils } from "../misc/Utils.js";
import { Character } from "../support/Character.js";
import { Grammar } from "../tool/Grammar.js";
import { IssueCode } from "../tool/Issues.js";
import { Rule } from "../tool/Rule.js";
import { GrammarAST } from "../tool/ast/GrammarAST.js";
import { antlrVersion } from "../version.js";
import { CodeGenerator } from "./CodeGenerator.js";
import { UnicodeEscapes } from "./UnicodeEscapes.js";
import { RuleFunction } from "./model/RuleFunction.js";

/** Represets a single code point in Unicode. */
export type CodePoint = number;

export abstract class Target {
    protected static readonly defaultCharValueEscape = new Map<CodePoint, string>([
        ["\t".codePointAt(0)!, "\\t"],
        ["\b".codePointAt(0)!, "\\b"],
        ["\n".codePointAt(0)!, "\\n"],
        ["\r".codePointAt(0)!, "\\r"],
        ["\f".codePointAt(0)!, "\\f"],
        ["'".codePointAt(0)!, "\\'"],
        ['"'.codePointAt(0)!, '\\"'],
        ["\\".codePointAt(0)!, "\\\\"],
    ]);

    private static readonly languageTemplates = new Map<string, STGroup>();

    public constructor(protected gen: CodeGenerator) {
    }

    protected static addEscapedChar(map: Map<Character, string>, key: number, representation?: number): void {
        representation = representation ?? key;
        map.set(key, "\\" + representation);
    }

    /**
     * For pure strings of Unicode char, how can we display it in the target language as a literal. Useful for dumping
     * predicates and such that may refer to chars that need to be escaped when represented as strings. Also,
     * templates need to be escaped so that the target language can hold them as a string. Each target can have
     * a different set in memory at same time.
     */
    public getTargetCharValueEscape(): Map<CodePoint, string> | undefined {
        return Target.defaultCharValueEscape;
    }

    public getCodeGenerator(): CodeGenerator {
        return this.gen;
    }

    /**
     * ANTLR tool should check output templates / target are compatible with tool code generation. For now, a simple
     * string match used on x.y of x.y.z scheme. We use a method to avoid mismatches between a template called
     * VERSION. This value is checked against Tool.VERSION during load of templates.
     *
     * This additional method forces all targets 4.3 and beyond to add this method.
     */
    public getVersion(): string {
        return antlrVersion;
    }

    public get templates(): STGroup {
        const language = this.gen.language;
        let templates = Target.languageTemplates.get(language);

        if (!templates) {
            const version = this.getVersion();
            const theirVersion = RuntimeMetaData.getMajorMinorVersion(version);
            const ourVersion = RuntimeMetaData.getMajorMinorVersion(antlrVersion);
            if (theirVersion !== ourVersion) {
                this.gen.g!.tool.errorManager.toolError(IssueCode.IncompatibleToolAndTemplates, version,
                    antlrVersion, language);
            }
            templates = this.loadTemplates();
            Target.languageTemplates.set(language, templates);
        }

        return templates;
    }

    public escapeIfNeeded(identifier: string): string {
        return this.reservedWords.has(identifier) ? this.escapeWord(identifier) : identifier;
    }

    /**
     * Get a meaningful name for a token type useful during code generation. Literals without associated names
     * are converted to the string equivalent of their integer values. Used to generate x==ID and x==34 type
     * comparisons etc...  Essentially we are looking for the most obvious way to refer to a token type in the
     * generated code.
     */
    public getTokenTypeAsTargetLabel(g: Grammar, ttype: number): string {
        const name = this.escapeIfNeeded(g.getTokenName(ttype)!);

        // If name is not valid, return the token type instead.
        if (Grammar.INVALID_TOKEN_NAME === name) {
            return String(ttype);
        }

        return name;
    }

    public getTokenTypesAsTargetLabels(g: Grammar, tokenTypes: number[]): string[] {
        const labels = new Array<string>(tokenTypes.length);
        for (let i = 0; i < tokenTypes.length; i++) {
            labels[i] = this.getTokenTypeAsTargetLabel(g, tokenTypes[i]);
        }

        return labels;
    }

    /**
     * Given a random string of unicode chars, return a new string with optionally appropriate quote characters for
     * target language and possibly with some escaped characters. For example, if the incoming string has actual
     * newline characters, the output of this method would convert them to the two char sequence \n for Java, C,
     * C++, ... The new string has double-quotes around it as well. Example string in memory:
     *```
     *     a"[newlineChar]b'c[carriageReturnChar]d[tab]e\f
     *```
     * would be converted to the valid s:
     *```
     *     "a\"\nb'c\rd\te\\f"
     *```
     * or
     *```
     *     a\"\nb'c\rd\te\\f
     *```
     * depending on the quoted arg.
     */
    public getTargetStringLiteralFromString(s: string, quoted?: boolean): string {
        quoted ??= true;

        let result = "";
        if (quoted) {
            result += '"';
        }

        for (let i = 0; i < s.length;) {
            const c = s.codePointAt(i)!;
            const escaped = (c <= Character.MAX_VALUE) ? this.getTargetCharValueEscape()?.get(Number(c)) : undefined;
            if (c !== 0x27 && escaped) { // Don't escape single quotes in strings for Java.
                result += escaped;
            } else if (this.shouldUseUnicodeEscapeForCodePointInDoubleQuotedString(c)) {
                result += this.createUnicodeEscapedCodePoint(i);
            } else {
                result += String.fromCodePoint(c);
            }

            i += Character.charCount(c);
        }

        if (quoted) {
            result += '"';
        }

        return result;
    }

    /**
     * Convert from an ANTLR string literal found in a grammar file to an equivalent string literal in the target
     * language.
     *
     * For Java, this is the translation `'a\n"'` -> `"a\n\""`. Expect single quotes around the incoming literal.
     * Just flip the quotes and replace double quotes with `\"`.
     *
     * Note that we have decided to allow people to use '\"' without penalty, so we must build the target string in
     * a loop as {@link String.replaceAll} cannot handle both `\"` and `"` without a lot of messing around.
     */
    public getTargetStringLiteralFromANTLRStringLiteral(generator: CodeGenerator, literal: string, addQuotes: boolean,
        escapeSpecial?: boolean): string {
        escapeSpecial ??= false;

        let result = "";
        if (addQuotes) {
            result += '"';
        }

        for (let i = 1; i < literal.length - 1;) {
            const codePoint = literal.codePointAt(i)!;
            let toAdvance = Character.charCount(codePoint);
            if (codePoint === 0x5C) { // backslash
                // Anything escaped is what it is! We assume that people know how to escape characters correctly.
                // However we catch anything that does not need an escape in Java (which is what the default
                // implementation is dealing with and remove the escape. The C target does this for instance.
                const escapedChar = literal.charAt(i + toAdvance);
                toAdvance++;
                switch (escapedChar) {
                    // Pass through any escapes that Java also needs
                    case "n":
                    case "r":
                    case "t":
                    case "b":
                    case "f":
                    case "\\": {
                        // Pass the escape through.
                        if (escapeSpecial && escapedChar !== "\\") {
                            result += "\\";
                        }
                        result += "\\" + escapedChar;
                        break;
                    }

                    case "u": { // Either unnnn or u{nnnnnn}.
                        if (literal.charAt(i + toAdvance) === "{") {
                            while (literal.charAt(i + toAdvance) !== "}") {
                                ++toAdvance;
                            }
                            ++toAdvance;
                        } else {
                            toAdvance += 4;
                        }

                        if (i + toAdvance <= literal.length) { // We might have an invalid \\uAB or something.
                            const fullEscape = literal.substring(i, i + toAdvance);
                            result += this.createUnicodeEscapedCodePoint(
                                CharSupport.getCharValueFromCharInGrammarLiteral(fullEscape), escapeSpecial);
                        }

                        break;
                    }

                    default: {
                        const codePoint = literal.codePointAt(i + toAdvance)!;
                        if (this.shouldUseUnicodeEscapeForCodePointInDoubleQuotedString(codePoint)) {
                            result += this.createUnicodeEscapedCodePoint(codePoint, escapeSpecial);
                        } else {
                            result += escapedChar;
                        }

                        break;
                    }
                }
            } else {
                if (codePoint === 0x22) {
                    // ANTLR doesn't escape " in literal strings, but every other language needs to do so.
                    result += "\\\"";
                } else if (this.shouldUseUnicodeEscapeForCodePointInDoubleQuotedString(codePoint)) {
                    result += this.createUnicodeEscapedCodePoint(codePoint, escapeSpecial);
                } else {
                    result += String.fromCodePoint(codePoint);
                }
            }

            i += toAdvance;
        }

        if (addQuotes) {
            result += '"';
        }

        return result;
    }

    /** Assume 16-bit char. */
    public encodeInt16AsCharEscape(v: number): string {
        if (v < Character.MIN_VALUE || v > Character.MAX_VALUE) {
            throw new Error(`Cannot encode the specified value: ${v}`);
        }

        if (this.isATNSerializedAsInts()) {
            return String(v);
        }

        const escaped = this.getTargetCharValueEscape()?.get(v);
        if (escaped) {
            return escaped;
        }

        switch (Character.getType(v)) {
            case Character.CONTROL:
            case Character.LINE_SEPARATOR:
            case Character.PARAGRAPH_SEPARATOR: {
                return this.escapeChar(v);
            }

            default: {
                if (v <= 127) {
                    return String.fromCodePoint(v); // ASCII chars can be as-is, no encoding.
                }

                // Else we use hex encoding to ensure pure ascii chars generated.
                return this.escapeChar(v);
            }
        }
    }

    public getLoopLabel(ast: GrammarAST): string {
        return "loop" + ast.token!.tokenIndex;
    }

    public getLoopCounter(ast: GrammarAST): string {
        return "cnt" + ast.token!.tokenIndex;
    }

    public getListLabel(label: string): string {
        const st = this.templates.getInstanceOf("ListLabelName")!;
        st.add("label", label);

        return st.render();
    }

    /**
     * If we know which actual function, we can provide the actual ctx type. This will contain implicit labels etc...
     * From outside, though, we see only ParserRuleContext unless there are externally visible stuff like args, locals,
     * explicit labels, etc...
     */
    public getRuleFunctionContextStructName(ruleOrFunction: Rule | RuleFunction): string {
        const rule = ruleOrFunction instanceof Rule ? ruleOrFunction : ruleOrFunction.rule;
        if (rule.g.isLexer()) {
            return this.templates.getInstanceOf("LexerRuleContext")!.render();
        }

        return Utils.capitalize(rule.name) + this.templates.getInstanceOf("RuleContextNameSuffix")!.render();
    }

    public getAltLabelContextStructName(label: string): string {
        return Utils.capitalize(label) + this.templates.getInstanceOf("RuleContextNameSuffix")!.render();
    }

    /**
     * Should be same for all refs to same token like ctx.ID within single rule function for literals like 'while',
     * we gen _s<ttype>
     */
    public getImplicitTokenLabel(tokenName: string): string {
        const st = this.templates.getInstanceOf("ImplicitTokenLabel")!;
        const ttype = this.getCodeGenerator().g!.getTokenType(tokenName);
        if (tokenName.startsWith("'")) {
            return "s" + ttype;
        }

        const text = this.getTokenTypeAsTargetLabel(this.getCodeGenerator().g!, ttype);
        st.add("tokenName", text);

        return st.render();
    }

    /** x=(A|B) */
    public getImplicitSetLabel(id: string): string {
        const st = this.templates.getInstanceOf("ImplicitSetLabel")!;
        st.add("id", id);

        return st.render();
    }

    public getImplicitRuleLabel(ruleName: string): string {
        const st = this.templates.getInstanceOf("ImplicitRuleLabel")!;
        st.add("ruleName", ruleName);

        return st.render();
    }

    public getElementListName(name: string): string {
        const st = this.templates.getInstanceOf("ElementListName")!;
        st.add("elemName", this.getElementName(name));

        return st.render();
    }

    public getElementName(name: string): string {
        if (name === ".") {
            return "_wild";
        }

        if (this.getCodeGenerator().g!.getRule(name) !== null) {
            return name;
        }

        const ttype = this.getCodeGenerator().g!.getTokenType(name);
        if (ttype === Token.INVALID_TYPE) {
            return name;
        }

        return this.getTokenTypeAsTargetLabel(this.getCodeGenerator().g!, ttype);
    }

    /**
     * Generate TParser.java and TLexer.java from T.g4 if combined, else just use T.java as output regardless of type.
     */
    public getRecognizerFileName(header: boolean): string {
        const extST = this.templates.getInstanceOf("codeFileExtension")!;
        const recognizerName = this.gen.g!.getRecognizerName();

        return recognizerName + extST.render();
    }

    /**
     * A given grammar T, return the listener name such as TListener.java, if we're using the Java target.
     */
    public getListenerFileName(header: boolean): string {

        /* assert gen.g.name != null; */
        const extST = this.templates.getInstanceOf("codeFileExtension")!;
        const listenerName = this.gen.g!.name + "Listener";

        return listenerName + extST.render();
    }

    /**
     * A given grammar T, return the visitor name such as TVisitor.java, if we're using the Java target.
     */
    public getVisitorFileName(header: boolean): string {

        /* assert gen.g.name != null; */
        const extST = this.templates.getInstanceOf("codeFileExtension")!;
        const listenerName = this.gen.g!.name + "Visitor";

        return listenerName + extST.render();
    }

    /**
     * A given grammar T, return a blank listener implementation such as TBaseListener.java, if we're using the
     * Java target.
     */
    public getBaseListenerFileName(header: boolean): string {
        const extST = this.templates.getInstanceOf("codeFileExtension")!;
        const listenerName = this.gen.g!.name + "BaseListener";

        return listenerName + extST.render();
    }

    /**
     * A given grammar T, return a blank listener implementation such as TBaseListener.java, if we're using the
     * Java target.
     */
    public getBaseVisitorFileName(header: boolean): string {
        const extST = this.templates.getInstanceOf("codeFileExtension")!;
        const listenerName = this.gen.g!.name + "BaseVisitor";

        return listenerName + extST.render();
    }

    /**
     * Gets the maximum number of 16-bit unsigned integers that can be encoded in a single segment (a declaration in
     * target language) of the serialized ATN. E.g., in C++, a small segment length results in multiple decls like:
     *
     *   static const int32_t serializedATNSegment1[] = {
     *     0x7, 0x12, 0x2, 0x13, 0x7, 0x13, 0x2, 0x14, 0x7, 0x14, 0x2, 0x15, 0x7,
     *        0x15, 0x2, 0x16, 0x7, 0x16, 0x2, 0x17, 0x7, 0x17, 0x2, 0x18, 0x7,
     *        0x18, 0x2, 0x19, 0x7, 0x19, 0x2, 0x1a, 0x7, 0x1a, 0x2, 0x1b, 0x7,
     *        0x1b, 0x2, 0x1c, 0x7, 0x1c, 0x2, 0x1d, 0x7, 0x1d, 0x2, 0x1e, 0x7,
     *        0x1e, 0x2, 0x1f, 0x7, 0x1f, 0x2, 0x20, 0x7, 0x20, 0x2, 0x21, 0x7,
     *        0x21, 0x2, 0x22, 0x7, 0x22, 0x2, 0x23, 0x7, 0x23, 0x2, 0x24, 0x7,
     *        0x24, 0x2, 0x25, 0x7, 0x25, 0x2, 0x26,
     *   };
     *
     * instead of one big one. Targets are free to ignore this like JavaScript does.
     *
     * This is primarily needed by Java target to limit size of any single ATN string to 65k length.
     *
     * {@link SerializedATN.getSegments}
     *
     * @returns the serialized ATN segment limit
     */
    public getSerializedATNSegmentLimit(): number {
        return Number.MAX_VALUE;
    }

    /**
     * How many bits should be used to do inline token type tests? Java assumes a 64-bit word for bitsets. Must be a
     * valid word size for your target like 8, 16, 32, 64, etc...
     */
    public getInlineTestSetWordSize(): number {
        return 64;
    }

    public grammarSymbolCausesIssueInGeneratedCode(idNode: GrammarAST): boolean {
        switch (idNode.parent?.getType()) {
            case ANTLRv4Parser.ASSIGN: {
                switch (idNode.parent.parent?.getType()) {
                    case ANTLRv4Parser.ELEMENT_OPTIONS:
                    case ANTLRv4Parser.OPTIONS: {
                        return false;
                    }

                    default: {
                        break;
                    }
                }

                break;
            }

            case ANTLRv4Parser.AT:
            case ANTLRv4Parser.ELEMENT_OPTIONS: {
                return false;
            }

            case ANTLRv4Parser.LEXER_ACTION_CALL: {
                if (idNode.childIndex === 0) {
                    // First child is the command name which is part of the ANTLR language.
                    return false;
                }

                // Arguments to the command should be checked.
                break;
            }

            default: {
                break;
            }

        }

        return this.reservedWords.has(idNode.getText());
    }

    public templatesExist(): boolean {
        return this.loadTemplatesHelper(false) !== undefined;
    }

    public wantsBaseListener(): boolean {
        return true;
    }

    public wantsBaseVisitor(): boolean {
        return true;
    }

    public supportsOverloadedMethods(): boolean {
        return true;
    }

    public isATNSerializedAsInts(): boolean {
        return true;
    }

    public needsHeader(): boolean {
        return false;
    }

    public genFile(g: Grammar | undefined, outputFileST: IST, fileName: string): void {
        this.getCodeGenerator().write(outputFileST, fileName);
    }

    protected abstract get reservedWords(): Set<string>;

    protected escapeWord(word: string): string {
        return word + "_";
    }

    /**
     * Escape the Unicode code point appropriately for this language and append the escaped value to {@code sb}.
     * It exists for flexibility and backward compatibility with external targets, The static method
     * {@link UnicodeEscapes.appendEscapedCodePoint(StringBuilder, int, String)} can be used as well
     * if default escaping method (Java) is used or language is officially supported
     */
    protected createUnicodeEscapedCodePoint(codePoint: number, escape?: boolean): string {
        let result = UnicodeEscapes.escapeCodePoint(codePoint, this.gen.language);

        if (escape) {
            result = "\\" + result;
        }

        return result;
    }

    protected shouldUseUnicodeEscapeForCodePointInDoubleQuotedString(codePoint: number): boolean {
        return codePoint < 0x20   // Control characters up to but not including space.
            || codePoint === 0x5C // backslash
            || codePoint >= 0x7F; // DEL and beyond (keeps source code 7-bit US-ASCII).
    }

    protected escapeChar(v: number): string {
        return `\\u${v.toString(16).padStart(4, "0")}`;
    }

    protected loadTemplates(): STGroup {
        const result = this.loadTemplatesHelper(true)!;

        result.registerRenderer(Number, new NumberRenderer());
        result.registerRenderer(String, new StringRenderer());
        result.setListener(new class implements STErrorListener {
            public constructor(private $outer: Target) {
            }

            public compileTimeError(msg: STMessage): void {
                this.reportError(msg);
            }

            public runTimeError(msg: STMessage): void {
                this.reportError(msg);
            }

            public internalError(msg: STMessage): void {
                this.reportError(msg);
            }

            public iOError(msg: STMessage): void {
                this.reportError(msg);
            };

            private reportError(msg: STMessage): void {
                this.$outer.gen.g!.tool.errorManager.toolError(IssueCode.StringTemplateWarning, msg.toString());
            }
        }(this));

        return result;
    }

    private loadTemplatesHelper(reportErrorIfFail: boolean): STGroup | undefined {
        const language = this.gen.language;
        const groupFileName = "/templates/codegen/" + language + "/" + language + STGroup.GROUP_FILE_EXTENSION;

        try {
            return new STGroupFile(groupFileName);
        } catch (e) {
            if (reportErrorIfFail) {
                this.gen.g!.tool.errorManager.toolError(IssueCode.MissingCodeGenTemplates, e, this.gen.language);
            }

            return undefined;
        }
    }
}
