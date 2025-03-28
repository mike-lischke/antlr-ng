/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

/* eslint-disable jsdoc/require-param, jsdoc/require-returns */

import {
    ATN, ATNDeserializer, ATNSerializer, CharStream, DFA, IntervalSet, LexerInterpreter, ParserInterpreter,
    SemanticContext, Token, TokenStream, Vocabulary
} from "antlr4ng";

import { ANTLRv4Parser } from "..//generated/ANTLRv4Parser.js";
import { TreeVisitor } from "../tree/TreeVisitor.js";
import { TreeWizard } from "../tree/TreeWizard.js";

import { GrammarTreeVisitor } from "../tree/walkers/GrammarTreeVisitor.js";

import { ClassFactory } from "../ClassFactory.js";

import { targetLanguages, type SupportedLanguage } from "../codegen/CodeGenerator.js";
import { Constants } from "../Constants.js";

import { CharSupport } from "../misc/CharSupport.js";
import { Utils, type Constructor } from "../misc/Utils.js";

import { TokenVocabParser } from "../parse/TokenVocabParser.js";
import { GrammarType } from "../support/GrammarType.js";
import type { IGrammar, ITool } from "../types.js";

import { basename } from "../support/fs-helpers.js";
import type { CommonTree } from "../tree/CommonTree.js";
import type { CommonTreeNodeStream } from "../tree/CommonTreeNodeStream.js";
import { ANTLRMessage } from "./ANTLRMessage.js";
import type { ActionAST } from "./ast/ActionAST.js";
import type { GrammarAST } from "./ast/GrammarAST.js";
import type { GrammarASTWithOptions } from "./ast/GrammarASTWithOptions.js";
import type { GrammarRootAST } from "./ast/GrammarRootAST.js";
import type { PredAST } from "./ast/PredAST.js";
import type { TerminalAST } from "./ast/TerminalAST.js";
import type { AttributeDict } from "./AttributeDict.js";
import type { GrammarParserInterpreter } from "./GrammarParserInterpreter.js";
import type { IAttribute } from "./IAttribute.js";
import type { IAttributeResolver } from "./IAttributeResolver.js";
import { IssueCode } from "./Issues.js";
import type { LexerGrammar } from "./LexerGrammar.js";
import type { Rule } from "./Rule.js";
import { ToolListener } from "./ToolListener.js";

export class Grammar implements IGrammar, IAttributeResolver {
    /**
     * This value is used in the following situations to indicate that a token type does not have an associated
     * name which can be directly referenced in a grammar.
     *
     * - This value is the name and display name for the token with type {@link Token.INVALID_TYPE}.
     * - This value is the name for tokens with a type not represented by a named token. The display name for these
     *   tokens is simply the string representation of the token type as an integer.
     */
    public static readonly INVALID_TOKEN_NAME = "<INVALID>";

    public static readonly caseInsensitiveOptionName = "caseInsensitive";

    public static readonly parserOptions = new Set<string>();

    public static readonly lexerOptions = Grammar.parserOptions;

    public static readonly lexerRuleOptions = new Set<string>([
        Grammar.caseInsensitiveOptionName,
        Constants.PrecedenceOptionName,
        Constants.TokenIndexOptionName,
    ]);

    public static readonly parseRuleOptions = new Set<string>();

    public static readonly parserBlockOptions = new Set<string>();

    public static readonly lexerBlockOptions = new Set<string>();

    /** Legal options for rule refs like id&lt;key=value&gt; */
    public static readonly ruleRefOptions = new Set<string>([
        Constants.PrecedenceOptionName,
        Constants.TokenIndexOptionName,
    ]);

    /** Legal options for terminal refs like ID&lt;assoc=right&gt; */
    public static readonly tokenOptions = new Set<string>([
        "assoc",
        Constants.TokenIndexOptionName,

    ]);

    public static readonly actionOptions = new Set<string>();

    public static readonly semPredOptions = new Set<string>();

    public static readonly doNotCopyOptionsToLexer = new Set<string>();

    public static readonly grammarAndLabelRefTypeToScope = new Map<string, AttributeDict>();

    public static readonly AUTO_GENERATED_TOKEN_NAME_PREFIX = "T__";

    public name = "<not set>";

    /**
     * The ATN that represents the grammar with edges labelled with tokens or epsilon. It is more suitable to analysis
     * than an AST representation.
     */
    public atn?: ATN;

    public ast: GrammarRootAST;

    /** Track token stream used to create this grammar */
    public tokenStream: TokenStream;

    /**
     * If we transform grammar, track original unaltered token stream. This is set to the same value as tokenStream
     * when tokenStream is initially set.
     *
     * If this field differs from tokenStream, then we have transformed the grammar.
     */
    public originalTokenStream: TokenStream;

    public fileName: string;

    /**
     * Was this parser grammar created from a COMBINED grammar? If so, this is what we extracted.
     */
    public implicitLexer: LexerGrammar | undefined;

    /** If this is an extracted/implicit lexer, we point at original grammar. */
    public originalGrammar?: Grammar;

    /** All rules defined in this specific grammar, not imported. Also does not include lexical rules if combined. */
    public rules = new Map<string, Rule>();

    public decisionLookahead: IntervalSet[][];

    public tool: ITool;

    /** Map token like `ID` (but not literals like `'while'`) to its token type. */
    public readonly tokenNameToTypeMap = new Map<string, number>();

    /**
     * Map token literals like `'while'` to its token type. It may be that `WHILE="while"=35`, in which case
     * both {@link #tokenNameToTypeMap} and this field will have entries both mapped to 35.
     */
    public readonly stringLiteralToTypeMap = new Map<string, number>();

    /** Reverse index for {@link stringLiteralToTypeMap}. Indexed with raw token type. 0 is invalid. */
    public readonly typeToStringLiteralList = new Array<string | null>();

    /**
     * Map channel like `COMMENTS_CHANNEL` to its constant channel value. Only user-defined channels are
     * defined in this map.
     */
    public readonly channelNameToValueMap = new Map<string, number>();

    /**
     * Map a constant channel value to its name. Indexed with raw channel value. The predefined channels
     * {@link Token.DEFAULT_CHANNEL} and {@link Token.HIDDEN_CHANNEL} are not stored in this list, so the values
     * at the corresponding indexes is `null`.
     */
    public readonly channelValueToNameList = new Array<string>();

    /**
     * Map a name to an action. The code generator will use this to fill holes in the output files. I track the AST
     * node for the action in case I need the line number for errors.
     */
    public namedActions = new Map<string, ActionAST>();

    /**
     * Tracks all user lexer actions in all alternatives of all rules. Doesn't track sempreds. Maps tree node to
     * action index (alt number 1..n).
     */
    public lexerActions = new Map<ActionAST, number>();

    /** Map a token type to its token name. Indexed with raw token type. 0 is invalid. */
    public readonly typeToTokenList: Array<string | null> = [];

    /** All sempreds found in grammar; maps tree node to sempred index; sempred index is 0..n - 1. */
    public sempreds = new Map<PredAST, number>();

    private importedGrammars: Grammar[] = [];

    /** Used to invent rule names for 'keyword', ';', ... (0..n - 1). */
    private indexToRule = new Array<Rule>();

    private decisionDFAs = new Map<number, DFA>();

    /** Map the other direction upon demand. */
    private indexToPredMap: Map<number, PredAST> | null = null;

    /** used to get rule indexes (0..n-1) */
    private ruleNumber = 0;
    private stringLiteralRuleNumber = 0;

    /**
     * Token names and literal tokens like "void" are uniquely indexed, with -1 implying EOF. Characters are
     * different. They go from -1 (EOF) to \uFFFE. For example, 0 could be a binary byte you want to lexer. Labels
     * of DFA/ATN transitions can be both tokens and characters. I use negative numbers for bookkeeping labels
     * like EPSILON. Char/String literals and token types overlap in the same space, however.
     */
    private maxTokenType = Token.MIN_USER_TOKEN_TYPE - 1;

    /**
     * The maximum channel value which is assigned by this grammar. Values below {@link Token.MIN_USER_CHANNEL_VALUE}
     * are assumed to be predefined.
     */
    private maxChannelType = Token.MIN_USER_CHANNEL_VALUE - 1;

    /** If we're imported, who imported us? If null, implies grammar is root. */
    private parent: Grammar | null = null;

    public constructor(tool: ITool, ast: GrammarRootAST);
    /** For testing */
    public constructor(grammarText: string, tokenVocabSource?: LexerGrammar);
    public constructor(...args: unknown[]) {
        if (typeof args[0] !== "string") {
            [this.tool, this.ast] = args as [ITool, GrammarRootAST];
            this.name = (this.ast.children[0]).getText()!;
            this.tokenStream = this.ast.tokenStream;
            this.originalTokenStream = this.tokenStream;

            this.initTokenSymbolTables();
        } else {
            // This branch for all testing scenarios. Must at least give the grammar text.
            const grammarText = args[0];
            let tokenVocabSource: LexerGrammar | undefined;

            if (args.length > 1) {
                tokenVocabSource = args[1] as LexerGrammar;
            }

            this.fileName = Constants.GrammarFromStringName;
            this.tool = ClassFactory.createTool();

            const hush = {
                info: (msg: string): void => { /* ignored */ },
                error: (msg: ANTLRMessage): void => { /* ignored */ },
                warning: (msg: ANTLRMessage): void => { /* ignored */ },
            };

            this.tool.errorManager.addListener(hush as ToolListener);
            const input = CharStream.fromString(grammarText);
            input.name = this.fileName;

            const root = this.tool.parse(input);
            if (!root) {
                throw new Error("Could not parse grammar");
            }

            this.ast = root;
            this.tokenStream = root.tokenStream;
            this.originalTokenStream = this.tokenStream;

            // Ensure each node has pointer to surrounding grammar.
            const v = new TreeVisitor();
            v.visit(this.ast, {
                pre: (t): CommonTree => {
                    (t as GrammarAST).g = this;

                    return t;
                },
                post: (t: CommonTree): CommonTree => {
                    return t;
                },
            });
            this.initTokenSymbolTables();

            if (tokenVocabSource) {
                this.importVocab(tokenVocabSource);
            }
        }
    }

    public static forFile<T extends Grammar>(c: Constructor<T>, fileName: string, grammarText: string,
        tokenVocabSource?: Grammar, listener?: ToolListener): T {
        const grammar = new c(grammarText, tokenVocabSource);

        grammar.fileName = fileName;
        grammar.tool = ClassFactory.createTool();

        const hush = {
            info: (msg: string): void => { /* ignored */ },
            error: (msg: ANTLRMessage): void => { /* ignored */ },
            warning: (msg: ANTLRMessage): void => { /* ignored */ },
        };

        grammar.tool.errorManager.addListener(hush as ToolListener);
        if (listener) {
            grammar.tool.errorManager.addListener(listener);
        }
        const input = CharStream.fromString(grammarText);
        input.name = basename(fileName);

        const root = grammar.tool.parse(input);
        if (!root) {
            throw new Error("Could not parse grammar");
        }

        grammar.ast = root;
        grammar.tokenStream = root.tokenStream;
        grammar.originalTokenStream = root.tokenStream;

        // Ensure each node has pointer to surrounding grammar.
        const v = new TreeVisitor();
        v.visit(grammar.ast, {
            pre: (t): CommonTree => {
                (t as GrammarAST).g = grammar;

                return t;
            },
            post: (t: CommonTree): CommonTree => {
                return t;
            },
        });
        grammar.initTokenSymbolTables();

        if (tokenVocabSource) {
            grammar.importVocab(tokenVocabSource);
        }

        return grammar;
    }

    public static getGrammarTypeToFileNameSuffix(type: GrammarType): string {
        switch (type) {
            case GrammarType.Lexer: {
                return "Lexer";
            }

            case GrammarType.Parser: {
                return "Parser";
            }

            // If combined grammar, gen Parser and Lexer will be done later.
            case GrammarType.Combined: {
                return "Parser";
            }

            default: {
                return "<invalid>";
            }

        }
    }

    /**
     * Given ^(TOKEN_REF ^(OPTIONS ^(ELEMENT_OPTIONS (= assoc right)))) sets option assoc=right in TOKEN_REF.
     */
    public static setNodeOptions(node: GrammarAST, options: GrammarAST): void {
        const t = node as GrammarASTWithOptions;
        if (t.children.length === 0 || options.children.length === 0) {
            return;
        }

        for (const o of options.children) {
            const c = o as GrammarAST;
            if (c.getType() === ANTLRv4Parser.ASSIGN) {
                t.setOption(c.children[0].getText(), c.children[1] as GrammarAST);
            } else {
                // No arg such as ID<VarNodeType>.
                t.setOption(c.getText(), null);
            }
        }
    }

    /** @returns list of (TOKEN_NAME node, 'literal' node) pairs */
    public static getStringLiteralAliasesFromLexerRules(ast: GrammarRootAST): Array<[GrammarAST, GrammarAST]> | null {
        const patterns = [
            "(RULE %name:TOKEN_REF (BLOCK (ALT %lit:STRING_LITERAL)))",
            "(RULE %name:TOKEN_REF (BLOCK (ALT %lit:STRING_LITERAL ACTION)))",
            "(RULE %name:TOKEN_REF (BLOCK (ALT %lit:STRING_LITERAL SEMPRED)))",
            "(RULE %name:TOKEN_REF (BLOCK (LEXER_ALT_ACTION (ALT %lit:STRING_LITERAL) .)))",
            "(RULE %name:TOKEN_REF (BLOCK (LEXER_ALT_ACTION (ALT %lit:STRING_LITERAL) . .)))",
            "(RULE %name:TOKEN_REF (BLOCK (LEXER_ALT_ACTION (ALT %lit:STRING_LITERAL) (LEXER_ACTION_CALL . .))))",
            "(RULE %name:TOKEN_REF (BLOCK (LEXER_ALT_ACTION (ALT %lit:STRING_LITERAL) . (LEXER_ACTION_CALL . .))))",
            "(RULE %name:TOKEN_REF (BLOCK (LEXER_ALT_ACTION (ALT %lit:STRING_LITERAL) (LEXER_ACTION_CALL . .) .)))",
        ];

        const wiz = new TreeWizard(ANTLRv4Parser.symbolicNames);
        const lexerRuleToStringLiteral = new Array<[GrammarAST, GrammarAST]>();

        const ruleNodes = ast.getNodesWithType(ANTLRv4Parser.RULE);
        if (ruleNodes.length === 0) {
            return null;
        }

        for (const r of ruleNodes) {
            const name = r.children[0];
            if (name.getType() === ANTLRv4Parser.TOKEN_REF) {
                // Check rule against patterns.
                let isLitRule: boolean;
                for (const pattern of patterns) {
                    isLitRule = Grammar.defAlias(r, pattern, wiz, lexerRuleToStringLiteral);
                    if (isLitRule) {
                        break;
                    }
                }
            }
        }

        return lexerRuleToStringLiteral;
    }

    protected static defAlias(r: GrammarAST, pattern: string, wiz: TreeWizard,
        lexerRuleToStringLiteral: Array<[GrammarAST, GrammarAST]>): boolean {
        const nodes = new Map<string, GrammarAST>();
        if (wiz.parse(r, pattern, nodes)) {
            const litNode = nodes.get("lit")!;
            const nameNode = nodes.get("name")!;
            lexerRuleToStringLiteral.push([nameNode, litNode]);

            return true;
        }

        return false;
    }

    public loadImportedGrammars(visited: Set<string>): void {
        const i = this.ast.getFirstChildWithType(ANTLRv4Parser.IMPORT) as GrammarAST | null;
        if (i === null) {
            return;
        }

        visited.add(this.name);
        for (const c of i.children) {
            let t = c as GrammarAST;
            let importedGrammarName = null;
            if (t.getType() === ANTLRv4Parser.ASSIGN) {
                t = t.children[1] as GrammarAST;
                importedGrammarName = t.getText();
            } else {
                if (t.getType() === ANTLRv4Parser.ID) {
                    importedGrammarName = t.getText();
                }
            }

            if (!importedGrammarName || visited.has(importedGrammarName)) { // Ignore circular refs.
                continue;
            }

            let g: Grammar | null;
            try {
                g = this.tool.loadImportedGrammar(this, t);
                if (!g) {
                    continue;
                }
            } catch {
                this.tool.errorManager.grammarError(IssueCode.ErrorReadingImportedGrammar, importedGrammarName,
                    t.token!, importedGrammarName, this.name);

                continue;
            }

            g.parent = this;
            this.importedGrammars.push(g);

            // Recursively pursue any imports in this import.
            g.loadImportedGrammars(visited);
        }
    }

    public defineAction(atAST: GrammarAST): void {
        if (atAST.children.length === 2) {
            const name = atAST.children[0].getText();
            this.namedActions.set(name, atAST.children[1] as ActionAST);
        } else {
            const scope = atAST.children[0].getText();
            const grammarType = this.getTypeString();
            if (scope === grammarType || (scope === "parser" && grammarType === "combined")) {
                const name = atAST.children[1].getText();
                this.namedActions.set(name, atAST.children[2] as ActionAST);
            }
        }
    }

    /**
     * Defines the specified rule in the grammar. This method assigns the rule's {@link Rule.index} according to
     * the {@link ruleNumber} field, and adds the {@link Rule} instance to {@link rules} and {@link indexToRule}.
     *
     * @param r The rule to define in the grammar.
     * @returns `true` if the rule was added to the {@link Grammar} instance; otherwise, `false` if a rule with
     * this name already existed in the grammar instance.
     */
    public defineRule(r: Rule): boolean {
        if (this.rules.has(r.name)) {
            return false;
        }

        this.rules.set(r.name, r);
        r.index = this.ruleNumber++;
        this.indexToRule.push(r);

        return true;
    }

    public getRule(name: string | number): Rule | null;
    public getRule(grammarName: string, ruleName: string): Rule | null;
    public getRule(...args: unknown[]): Rule | null {
        switch (args.length) {
            case 1: {
                if (typeof args[0] === "string") {
                    const [name] = args as [string];

                    const r = this.rules.get(name);
                    if (r) {
                        return r;
                    }

                    return null;
                } else {
                    const [index] = args as [number];

                    return this.indexToRule[index];
                }
            }

            case 2: {
                const [grammarName, ruleName] = args as [string, string];

                if (grammarName) { // scope override
                    const g = this.getImportedGrammar(grammarName);
                    if (g === null) {
                        return null;
                    }

                    return g.rules.get(ruleName) ?? null;
                }

                return this.getRule(ruleName);
            }

            default: {
                return null;
            }
        }
    }

    /** Needed for tests. */
    public getATN(): ATN {
        if (!this.atn) {
            const factory = ClassFactory.createParserATNFactory(this);
            this.atn = factory.createATN();
        }

        return this.atn;
    }

    /**
     * Get list of all imports from all grammars in the delegate subtree of g. The grammars are in import tree
     * preorder. Don't include ourselves in list as we're not a delegate of ourselves.
     */
    public getAllImportedGrammars(): Grammar[] {
        const delegates = new Map<string, Grammar>();
        for (const d of this.importedGrammars) {
            delegates.set(d.fileName, d);
            const ds = d.getAllImportedGrammars();
            for (const imported of ds) {
                delegates.set(imported.fileName, imported);
            }
        }

        return Array.from(delegates.values());
    }

    public getImportedGrammars(): Grammar[] {
        return this.importedGrammars;
    }

    /**
     * Return list of imported grammars from root down to our parent. Order is [root, ..., this.parent]
     * (us not included).
     */
    public getGrammarAncestors(): Grammar[] | null {
        const root = this.getOutermostGrammar();
        if (this === root) {
            return null;
        }

        const grammars = new Array<Grammar>();

        // Walk backwards to root, collecting grammars.
        let p = this.parent;
        while (p !== null) {
            grammars.unshift(p); // Add to head so in order later.
            p = p.parent;
        }

        return grammars;
    }

    /**
     * @returns the grammar that imported us and our parents, or this if we're root.
     */
    public getOutermostGrammar(): Grammar {
        if (this.parent === null) {
            return this;
        }

        return this.parent.getOutermostGrammar();
    }

    /**
     * Gets the name of the generated recognizer; may or may not be same as grammar name. Recognizer is TParser and
     * TLexer from T if combined, else just use T regardless of grammar type.
     */
    public getRecognizerName(): string {
        let suffix = "";
        const grammarsFromRootToMe = this.getOutermostGrammar().getGrammarAncestors();
        let qualifiedName = this.name;
        if (grammarsFromRootToMe !== null) {
            qualifiedName = "";
            for (const g of grammarsFromRootToMe) {
                qualifiedName += g.name;
                qualifiedName += "_";
            }
            qualifiedName += this.name;
        }

        if (this.isCombined()) {
            suffix = Grammar.getGrammarTypeToFileNameSuffix(this.type);
        }

        return qualifiedName + suffix;
    }

    public getStringLiteralLexerRuleName(_literal: string): string {
        return `${Grammar.AUTO_GENERATED_TOKEN_NAME_PREFIX}${this.stringLiteralRuleNumber++}`;
    }

    /** @returns grammar directly imported by this grammar. */
    public getImportedGrammar(name: string): Grammar | null {
        for (const g of this.importedGrammars) {
            if (g.name === name) {
                return g;
            }
        }

        return null;
    }

    public getTokenType(token: string): number {
        let index: number | undefined;
        if (token.startsWith("'")) {
            index = this.stringLiteralToTypeMap.get(token);
        } else {
            // Must be a label like ID.
            index = this.tokenNameToTypeMap.get(token);
        }

        return index ?? Token.INVALID_TYPE;
    }

    /**
     * Gets the name by which a token can be referenced in the generated code. For tokens defined in a `tokens{}`
     * block or via a lexer rule, this is the declared name of the token. For token types generated by the use
     * of a string literal within a parser rule of a combined grammar, this is the automatically generated token
     * type which includes the {@link AUTO_GENERATED_TOKEN_NAME_PREFIX} prefix. For types which are not
     * associated with a defined token, this method returns {@link INVALID_TOKEN_NAME}.
     *
     * @param literalOrTokenType The token type.
     *
     * @returns The name of the token with the specified type.
     */
    public getTokenName(literalOrTokenType: number | string): string | null {
        if (typeof literalOrTokenType === "string") {
            // eslint-disable-next-line @typescript-eslint/no-this-alias
            let grammar: Grammar | null = this;
            while (grammar !== null) {
                if (grammar.stringLiteralToTypeMap.has(literalOrTokenType)) {
                    return grammar.getTokenName(grammar.stringLiteralToTypeMap.get(literalOrTokenType)!);
                }

                grammar = grammar.parent;
            }

            return null;
        } else {
            // Inside any target's char range and is lexer grammar?
            if (this.isLexer() &&
                // TODO: make the min and max char values from the lexer options available here.
                literalOrTokenType >= 0 && literalOrTokenType <= 0x1FFFF) {
                return CharSupport.getANTLRCharLiteralForChar(literalOrTokenType);
            }

            if (literalOrTokenType === Token.EOF) {
                return "EOF";
            }

            if (literalOrTokenType >= 0 && literalOrTokenType < this.typeToTokenList.length
                && this.typeToTokenList[literalOrTokenType]) {
                return this.typeToTokenList[literalOrTokenType];
            }

            return Grammar.INVALID_TOKEN_NAME;
        }
    }

    /**
     * Given a token type, get a meaningful name for it such as the ID or string literal. If this is a lexer and
     * the ttype is in the char vocabulary, compute an ANTLR-valid (possibly escaped) char literal.
     */
    public getTokenDisplayName(ttype: number): string {
        // Inside any target's char range and is lexer grammar?
        // TODO: make the min and max char values from the lexer options available here.
        if (this.isLexer() && ttype >= 0 && ttype <= 0x1FFFF) {
            return CharSupport.getANTLRCharLiteralForChar(ttype);
        }

        if (ttype === Token.EOF) {
            return "EOF";
        }

        if (ttype === Token.INVALID_TYPE) {
            return Grammar.INVALID_TOKEN_NAME;
        }

        if (ttype >= 0 && ttype < this.typeToStringLiteralList.length && this.typeToStringLiteralList[ttype] != null) {
            return this.typeToStringLiteralList[ttype] ?? String(ttype);
        }

        if (ttype >= 0 && ttype < this.typeToTokenList.length && this.typeToTokenList[ttype] != null) {
            return this.typeToTokenList[ttype] ?? String(ttype);
        }

        return String(ttype);
    }

    /**
     * Gets the constant channel value for a user-defined channel.
     *
     * This method only returns channel values for user-defined channels. All other channels, including the
     * predefined channels {@link Token.DEFAULT_CHANNEL} and {@link Token:HIDDEN_CHANNEL} along with
     * any channel defined in code (e.g. in a `@members{}` block), are ignored.
     *
     * @param channel The channel name.
     *
     * @returns The channel value, if `channel` is the name of a known user-defined token channel; otherwise, -1.
     */
    public getChannelValue(channel: string): number {
        const index = this.channelNameToValueMap.get(channel);

        return index ?? -1;
    }

    /**
     * Gets an array of rule names for rules defined or imported by the grammar. The array index is the rule index,
     * and the value is the name of the rule with the corresponding {@link Rule.index}.
     *
     * If no rule is defined with an index for an element of the resulting array, the value of that element is
     * {@link INVALID_RULE_NAME}.
     *
     * @returns The names of all rules defined in the grammar.
     */
    public getRuleNames(): string[] {
        return [...this.rules.keys()];
    }

    /**
     * Gets an array of token names for tokens defined or imported by the grammar. The array index is the token type,
     * and the value is the result of {@link getTokenName} for the corresponding token type.
     *
     * @returns The token names of all tokens defined in the grammar.
     */
    public getTokenNames(): Array<string | null> {
        const max = this.getMaxTokenType();
        const tokenNames: Array<string | null> = [];
        for (let i = 0; i <= max; ++i) {
            tokenNames.push(this.getTokenName(i));
        }

        return tokenNames;
    }

    /**
     * Gets an array of display names for tokens defined or imported by the grammar. The array index is the token
     * type, and the value is the result of {@link getTokenDisplayName} for the corresponding token type.
     *
     * @returns The display names of all tokens defined in the grammar.
     */
    public getTokenDisplayNames(): Array<string | null> {
        const numTokens = this.getMaxTokenType();
        const tokenNames = new Array<string | null>(numTokens + 1);
        tokenNames.fill(null);
        for (let i = 0; i < tokenNames.length; i++) {
            tokenNames[i] = this.getTokenDisplayName(i);
        }

        return tokenNames;
    }

    /**
     * Gets the literal names assigned to tokens in the grammar.
     */
    public getTokenLiteralNames(): Array<string | null> {
        const numTokens = this.getMaxTokenType();
        const literalNames = new Array<string | null>(numTokens + 1);
        literalNames.fill(null);

        for (let i = 0; i < Math.min(literalNames.length, this.typeToStringLiteralList.length); i++) {
            literalNames[i] = this.typeToStringLiteralList[i];
        }

        for (const [key, value] of this.stringLiteralToTypeMap) {
            if (value >= 0 && value < literalNames.length && !literalNames[value]) {
                literalNames[value] = key;
            }
        }

        return literalNames;
    }

    /**
     * Gets the symbolic names assigned to tokens in the grammar.
     */
    public getTokenSymbolicNames(): Array<string | null> {
        const numTokens = this.getMaxTokenType();
        const symbolicNames = new Array<string | null>(numTokens + 1);
        symbolicNames.fill(null);

        for (let i = 0; i < Math.min(symbolicNames.length, this.typeToTokenList.length); i++) {
            const name = this.typeToTokenList[i];
            if (!name || name.startsWith(Grammar.AUTO_GENERATED_TOKEN_NAME_PREFIX)) {
                continue;
            }

            symbolicNames[i] = name;
        }

        return symbolicNames;
    }

    /**
     * Gets a {@link Vocabulary} instance describing the vocabulary used by the grammar.
     */
    public getVocabulary(): Vocabulary {
        return new Vocabulary(this.getTokenLiteralNames(), this.getTokenSymbolicNames());
    }

    public getIndexToPredicateMap(): Map<number, PredAST> {
        const indexToPredMap = new Map<number, PredAST>();
        for (const r of this.rules.values()) {
            for (const a of r.actions) {
                if (a.astType === "PredAST") {
                    indexToPredMap.set(this.sempreds.get(a)!, a);
                }
            }
        }

        return indexToPredMap;
    }

    public getPredicateDisplayString(pred: SemanticContext.Predicate): string {
        if (this.indexToPredMap === null) {
            this.indexToPredMap = this.getIndexToPredicateMap();
        }
        const actionAST = this.indexToPredMap.get(pred.predIndex)!;

        return actionAST.getText();
    }

    /**
     * What is the max char value possible for this grammar's target? Use unicode max if no target defined.
     */
    public getMaxCharValue(): number {
        // TODO: make the min and max char values from the lexer options available here.
        return 0x1FFFF;
    }

    /** @returns a set of all possible token or char types for this grammar. */
    public getTokenTypes(): IntervalSet {
        if (this.isLexer()) {
            return this.getAllCharValues();
        }

        return IntervalSet.of(Token.MIN_USER_TOKEN_TYPE, this.getMaxTokenType());
    }

    /**
     * @returns min to max char as defined by the target. If no target, use max unicode char value.
     */
    public getAllCharValues(): IntervalSet {
        // TODO: make the min and max char values from the lexer options available here.
        return IntervalSet.of(0, this.getMaxCharValue());
    }

    /** How many token types have been allocated so far? */
    public getMaxTokenType(): number {
        return this.typeToTokenList.length - 1; // Don't count 0 (invalid).
    }

    /** @returns a new unique integer in the token type space. */
    public getNewTokenType(): number {
        this.maxTokenType++;

        return this.maxTokenType;
    }

    /** @returns a new unique integer in the channel value space. */
    public getNewChannelNumber(): number {
        this.maxChannelType++;

        return this.maxChannelType;
    }

    public importTokensFromTokensFile(): void {
        const vocab = this.getOptionString("tokenVocab");
        if (vocab) {
            const vParser = new TokenVocabParser(this, this.tool.getOutputDirectory(this.fileName),
                this.tool.toolConfiguration.lib);
            const tokens = vParser.load();
            this.tool.logInfo({ component: "grammar", msg: `tokens=${String(tokens)}` });

            for (const t of tokens.keys()) {
                if (t.startsWith("'")) {
                    this.defineStringLiteral(t, tokens.get(t));
                } else {
                    this.defineTokenName(t, tokens.get(t));
                }
            }
        }
    }

    public importVocab(importG: Grammar): void {
        for (const tokenName of importG.tokenNameToTypeMap.keys()) {
            this.defineTokenName(tokenName, importG.tokenNameToTypeMap.get(tokenName));
        }

        for (const tokenName of importG.stringLiteralToTypeMap.keys()) {
            this.defineStringLiteral(tokenName, importG.stringLiteralToTypeMap.get(tokenName));
        }

        for (const [key, value] of importG.channelNameToValueMap) {
            this.defineChannelName(key, value);
        }

        let max = Math.max(this.typeToTokenList.length, importG.typeToTokenList.length);
        Utils.setSize(this.typeToTokenList, max);
        for (let ttype = 0; ttype < importG.typeToTokenList.length; ttype++) {
            this.maxTokenType = Math.max(this.maxTokenType, ttype);
            this.typeToTokenList[ttype] = importG.typeToTokenList[ttype];
        }

        max = Math.max(this.channelValueToNameList.length, importG.channelValueToNameList.length);
        Utils.setSize(this.channelValueToNameList, max);
        for (let channelValue = 0; channelValue < importG.channelValueToNameList.length; channelValue++) {
            this.maxChannelType = Math.max(this.maxChannelType, channelValue);
            this.channelValueToNameList[channelValue] = importG.channelValueToNameList[channelValue];
        }
    }

    public defineTokenName(name: string, ttype?: number): number {
        const prev = this.tokenNameToTypeMap.get(name);
        if (prev !== undefined) {
            return prev;
        }

        ttype ??= this.getNewTokenType();

        this.tokenNameToTypeMap.set(name, ttype);
        this.setTokenForType(ttype, name);
        this.maxTokenType = Math.max(this.maxTokenType, ttype);

        return ttype;
    }

    public defineStringLiteral(lit: string, ttype?: number): number {
        if (ttype === undefined) {
            if (this.stringLiteralToTypeMap.has(lit)) {
                return this.stringLiteralToTypeMap.get(lit)!;
            }

            ttype = this.getNewTokenType();
        }

        if (!this.stringLiteralToTypeMap.has(lit)) {
            this.stringLiteralToTypeMap.set(lit, ttype);

            // Track in reverse index too.
            if (ttype >= this.typeToStringLiteralList.length) {
                Utils.setSize(this.typeToStringLiteralList, ttype + 1);
            }

            this.typeToStringLiteralList[ttype] = lit;
            this.setTokenForType(ttype, lit);

            return ttype;
        }

        return Token.INVALID_TYPE;
    }

    public defineTokenAlias(name: string, lit: string): number {
        const ttype = this.defineTokenName(name);
        this.stringLiteralToTypeMap.set(lit, ttype);
        this.setTokenForType(ttype, name);

        return ttype;
    }

    public setTokenForType(ttype: number, text: string): void {
        if (ttype === Token.EOF) {
            // Ignore EOF, it will be reported as an error separately.
            return;
        }

        if (ttype >= this.typeToTokenList.length) {
            Utils.setSize(this.typeToTokenList, ttype + 1);
        }

        const prevToken = this.typeToTokenList[ttype];
        if (prevToken === null || prevToken.startsWith("'")) {
            // Only record if nothing there before or if thing before was a literal.
            this.typeToTokenList[ttype] = text;
        }
    }

    /**
     * Defines a token channel with a specified name. If a channel with the specified name already exists, the
     * previously assigned channel value is not altered.
     *
     * @param name The channel name.
     *
     * @returns The constant channel value assigned to the channel.
     */
    public defineChannelName(name: string, value?: number): number {
        if (value === undefined) {
            const prev = this.channelNameToValueMap.get(name);
            if (prev === undefined) {
                return this.defineChannelName(name, this.getNewChannelNumber());
            }

            return prev;
        }

        const prev = this.channelNameToValueMap.get(name);
        if (prev !== undefined) {
            return prev;
        }

        this.channelNameToValueMap.set(name, value);
        this.setChannelNameForValue(value, name);
        this.maxChannelType = Math.max(this.maxChannelType, value);

        return value;
    }

    /**
     * Sets the channel name associated with a particular channel value. If a name has already been assigned to the
     * channel with constant value `channelValue`, this method does nothing.
     *
     * @param channelValue The constant value for the channel.
     * @param name The channel name.
     */
    public setChannelNameForValue(channelValue: number, name: string): void {
        if (channelValue >= this.channelValueToNameList.length) {
            Utils.setSize(this.channelValueToNameList, channelValue + 1);
        }

        const prevChannel = this.channelValueToNameList[channelValue];
        if (!prevChannel) {
            this.channelValueToNameList[channelValue] = name;
        }
    }

    public resolveToAttribute(x: string, node: ActionAST): IAttribute;
    public resolveToAttribute(x: string, y: string, node: ActionAST): IAttribute | null;
    public resolveToAttribute(...args: unknown[]): IAttribute | null {
        return null;
    }

    public resolvesToLabel(x: string, node: ActionAST): boolean {
        return false;
    }

    public resolvesToListLabel(x: string, node: ActionAST): boolean {
        return false;
    }

    public resolvesToToken(x: string, node: ActionAST): boolean {
        return false;
    }

    public resolvesToAttributeDict(x: string, node: ActionAST): boolean {
        return false;
    }

    /**
     * Given a grammar type, what should be the default action scope?
     * If I say `@members` in a COMBINED grammar, for example, the default scope should be "parser".
     */
    public getDefaultActionScope(): string | null {
        switch (this.type) {
            case GrammarType.Lexer: {
                return "lexer";
            }

            case GrammarType.Parser:
            case GrammarType.Combined: {
                return "parser";
            }

            default:

        }

        return null;
    }

    public get type(): GrammarType {
        return this.ast.grammarType;
    }

    public isLexer(): boolean {
        return this.type === GrammarType.Lexer;
    }

    public isParser(): boolean {
        return this.type === GrammarType.Parser;
    }

    public isCombined(): boolean {
        return this.type === GrammarType.Combined;
    }

    public getTypeString(): string | null {
        if (this.isLexer()) {
            return "lexer";
        }

        if (this.isParser()) {
            return "parser";
        }

        return "combined";
    }

    public getLanguage(): SupportedLanguage {
        const language = this.getOptionString("language") as SupportedLanguage | undefined;
        if (language && !targetLanguages.includes(language)) {
            this.tool.errorManager.toolError(IssueCode.CannotCreateTargetGenerator, language);
        }

        return language ?? "Java";
    }

    public getOptionString(key: string): string | undefined {
        return this.ast.getOptionString(key);
    }

    public getStringLiterals(): Set<string> {
        const strings = new Set<string>();
        const collector = new class extends GrammarTreeVisitor {
            public override stringRef(ref: TerminalAST): void {
                strings.add(ref.getText());
            }
        }(this.tool.errorManager, {} as CommonTreeNodeStream);
        collector.visitGrammar(this.ast);

        return strings;
    }

    public createLexerInterpreter(input: CharStream): LexerInterpreter {
        if (!this.atn) {
            throw new Error("The ATN must be created before creating a lexer interpreter. " +
                "Have you called `Grammar.tool.process()`?");
        }

        if (this.isParser()) {
            throw new Error("A lexer interpreter can only be created for a lexer or combined grammar.");
        }

        if (this.isCombined()) {
            return this.implicitLexer!.createLexerInterpreter(input);
        }

        const allChannels: string[] = [];
        allChannels.push("DEFAULT_TOKEN_CHANNEL");
        allChannels.push("HIDDEN");
        allChannels.push(...this.channelValueToNameList);

        // mMst run ATN through serializer to set some state flags.
        const serialized = ATNSerializer.getSerialized(this.atn);
        const deserializedATN = new ATNDeserializer().deserialize(serialized);

        return new LexerInterpreter(this.fileName, this.getVocabulary(), this.getRuleNames(), allChannels,
            [...(this as unknown as LexerGrammar).modes.keys()], deserializedATN, input);
    }

    public createGrammarParserInterpreter(tokenStream: TokenStream): GrammarParserInterpreter {
        if (!this.atn) {
            throw new Error("The ATN must be created before creating a lexer interpreter. " +
                "Have you called `Grammar.tool.process()`?");
        }

        if (this.isLexer()) {
            throw new Error("A parser interpreter can only be created for a parser or combined grammar.");
        }

        // Must run ATN through serializer to set some state flags.
        const serialized = ATNSerializer.getSerialized(this.atn);
        const deserializedATN = new ATNDeserializer().deserialize(serialized);

        return ClassFactory.createGrammarParserInterpreter(this, deserializedATN, tokenStream);
    }

    /** For testing. */
    public createParserInterpreter(tokenStream: TokenStream): ParserInterpreter {
        if (!this.atn) {
            throw new Error("The ATN must be created before creating a lexer interpreter. " +
                "Have you called `Grammar.tool.process()`?");
        }

        if (this.isLexer()) {
            throw new Error("A parser interpreter can only be created for a parser or combined grammar.");
        }

        // Must run ATN through serializer to set some state flags.
        const serialized = ATNSerializer.getSerialized(this.atn);
        const deserializedATN = new ATNDeserializer().deserialize(serialized);

        return new ParserInterpreter(this.fileName, this.getVocabulary(), this.getRuleNames(), deserializedATN,
            tokenStream);
    }

    /**
     * Undefines the specified rule from this {@link Grammar} instance. The instance `r` is removed from
     * {@link rules} and {@link indexToRule}. This method updates the {@link Rule.index} field for all rules defined
     * after `r`, and decrements {@link ruleNumber} in preparation for adding new rules.
     *
     * This method does nothing if the current {@link Grammar} does not contain the instance `r` at index
     * `r.index` in {@link indexToRule}.
     *
     * @returns `true` if the rule was removed from the {@link Grammar} instance; otherwise, `false` if the
     *          specified rule was not defined in the grammar.
     */
    protected undefineRule(r: Rule): boolean {
        if (r.index < 0 || r.index >= this.indexToRule.length || this.indexToRule[r.index] !== r) {
            return false;
        }

        this.rules.delete(r.name);
        this.indexToRule.splice(r.index, 1);
        for (let i = r.index; i < this.indexToRule.length; i++) {
            --this.indexToRule[i].index;
        }

        --this.ruleNumber;

        return true;
    }

    protected initTokenSymbolTables(): void {
        this.tokenNameToTypeMap.set("EOF", Token.EOF);

        // reserve a spot for the INVALID token
        this.typeToTokenList.push(null);
    }

    static {
        ClassFactory.createGrammar = (tool: ITool, grammar: GrammarRootAST): IGrammar => {
            return new Grammar(tool, grammar);
        };

        Grammar.parserOptions.add("superClass");
        Grammar.parserOptions.add("contextSuperClass");
        Grammar.parserOptions.add("TokenLabelType");
        Grammar.parserOptions.add("tokenVocab");
        Grammar.parserOptions.add("language");
        Grammar.parserOptions.add("accessLevel");
        Grammar.parserOptions.add("exportMacro");
        Grammar.parserOptions.add(Grammar.caseInsensitiveOptionName);

        Grammar.tokenOptions.add("assoc");
        Grammar.tokenOptions.add(Constants.TokenIndexOptionName);

        Grammar.semPredOptions.add(Constants.PrecedenceOptionName);
        Grammar.semPredOptions.add("fail");

        Grammar.doNotCopyOptionsToLexer.add("superClass");
        Grammar.doNotCopyOptionsToLexer.add("TokenLabelType");
        Grammar.doNotCopyOptionsToLexer.add("tokenVocab");

        Grammar.grammarAndLabelRefTypeToScope.set("parser:RULE_LABEL", Constants.predefinedRulePropertiesDict);
        Grammar.grammarAndLabelRefTypeToScope.set("parser:TOKEN_LABEL", Constants.predefinedTokenDict);
        Grammar.grammarAndLabelRefTypeToScope.set("combined:RULE_LABEL", Constants.predefinedRulePropertiesDict);
        Grammar.grammarAndLabelRefTypeToScope.set("combined:TOKEN_LABEL", Constants.predefinedTokenDict);
    }
}
