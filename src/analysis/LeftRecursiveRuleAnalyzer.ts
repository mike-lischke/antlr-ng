/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

/* eslint-disable jsdoc/require-param, jsdoc/require-returns */

import { CommonToken, IntervalSet, Token, type TokenStream } from "antlr4ng";
import { STGroupFile, type STGroup } from "stringtemplate4ts";

import { Constants } from "../Constants.js";
import { Tool } from "../Tool.js";
import { CodeGenerator, type SupportedLanguage } from "../codegen/CodeGenerator.js";
import { ANTLRv4Parser } from "../generated/ANTLRv4Parser.js";
import { OrderedHashMap } from "../misc/OrderedHashMap.js";
import { dupTree } from "../support/helpers.js";
import { IssueCode } from "../tool/Issues.js";
import { AltAST } from "../tool/ast/AltAST.js";
import { GrammarAST } from "../tool/ast/GrammarAST.js";
import { GrammarASTWithOptions } from "../tool/ast/GrammarASTWithOptions.js";
import { RuleRefAST } from "../tool/ast/RuleRefAST.js";
import { CommonTreeNodeStream } from "../tree/CommonTreeNodeStream.js";
import { LeftRecursiveRuleWalker } from "../tree/walkers/LeftRecursiveRuleWalker.js";
import { ILeftRecursiveRuleAltInfo } from "./ILeftRecursiveRuleAltInfo.js";

enum Associativity {
    Left = "left",
    Right = "right"
};

/**
 * Using a tree walker on the rules, determine if a rule is directly left-recursive and if it follows
 *  our pattern.
 */
export class LeftRecursiveRuleAnalyzer extends LeftRecursiveRuleWalker {
    private static readonly templateGroupFile = "/templates/LeftRecursiveRules.stg";
    private static readonly recRuleTemplates = new STGroupFile(LeftRecursiveRuleAnalyzer.templateGroupFile);

    public tool: Tool;
    public binaryAlts = new Map<number, ILeftRecursiveRuleAltInfo>();
    public ternaryAlts = new Map<number, ILeftRecursiveRuleAltInfo>();
    public suffixAlts = new Map<number, ILeftRecursiveRuleAltInfo>();
    public prefixAndOtherAlts = new Array<ILeftRecursiveRuleAltInfo>();

    /** Pointer to ID node of ^(= ID element) */
    public leftRecursiveRuleRefLabels = new Array<[GrammarAST, string | undefined]>();

    /** Tokens from which rule AST comes from */
    public readonly tokenStream: TokenStream;

    public retvals: GrammarAST;
    public readonly codegenTemplates: STGroup;
    public readonly language: string;

    public altAssociativity = new Map<number, Associativity>();

    public constructor(ruleAST: GrammarAST, tool: Tool, ruleName: string, language: SupportedLanguage) {
        super(new CommonTreeNodeStream(ruleAST),
            tool.errorManager);
        this.tool = tool;
        this.ruleName = ruleName;
        this.language = language;
        this.tokenStream = ruleAST.g.tokenStream;

        // use codegen to get correct language templates; that's it though
        this.codegenTemplates = new CodeGenerator(language).templates;
    }

    /**
     * Match (RULE RULE_REF (BLOCK (ALT .*) (ALT RULE_REF[self] .*) (ALT .*)))
     * Match (RULE RULE_REF (BLOCK (ALT .*) (ALT (ASSIGN ID RULE_REF[self]) .*) (ALT .*)))
     */
    public static hasImmediateRecursiveRuleRefs(t: GrammarAST, ruleName: string): boolean {
        const blk = t.getFirstChildWithType(ANTLRv4Parser.BLOCK) as GrammarAST | null;
        if (blk === null) {
            return false;
        }

        const n = blk.children.length;
        for (let i = 0; i < n; i++) {
            const alt = blk.children[i] as GrammarAST;
            let first = alt.children[0];

            if (first.getType() === ANTLRv4Parser.ELEMENT_OPTIONS) {
                first = alt.children[1];
            }

            if (first.getType() === ANTLRv4Parser.RULE_REF && first.getText() === ruleName) {
                return true;
            }

            if (first.children.length > 1) {
                const ruleRef = first.children[1];
                if (ruleRef.getType() === ANTLRv4Parser.RULE_REF &&
                    ruleRef.getText() === ruleName) {
                    return true;
                }
            }
        }

        return false;
    }

    public override setReturnValues(t: GrammarAST): void {
        this.retvals = t;
    }

    public override setAltAssoc(t: AltAST, alt: number): void {
        let assoc = Associativity.Left;
        const a = t.getOptionString("assoc");
        if (a) {
            if (a === Associativity.Right.toString()) {
                assoc = Associativity.Right;
            } else {
                if (a === Associativity.Left.toString()) {
                    assoc = Associativity.Left;
                } else {
                    this.tool.errorManager.grammarError(IssueCode.IllegalOptionValue, t.g.fileName,
                        t.getOptionAST("assoc")!.token!, "assoc", assoc);
                }
            }
        }

        if (this.altAssociativity.get(alt) && this.altAssociativity.get(alt) !== assoc) {
            this.tool.errorManager.toolError(IssueCode.InternalError, "all operators of alt " + alt +
                " of left-recursive rule must have same associativity");
        }
        this.altAssociativity.set(alt, assoc);
    }

    public override binaryAlt(originalAltTree: AltAST, altNum: number): void {
        let altTree = dupTree(originalAltTree);
        const altLabel = altTree.altLabel?.getText();

        let label: string | undefined;
        let isListLabel = false;
        const lrLabel = this.stripLeftRecursion(altTree);
        if (lrLabel) {
            label = lrLabel.getText();
            isListLabel = lrLabel.parent?.getType() === ANTLRv4Parser.PLUS_ASSIGN;
            this.leftRecursiveRuleRefLabels.push([lrLabel, altLabel]);
        }

        this.stripAltLabel(altTree);

        // rewrite e to be e_[rec_arg]
        const nextPrec = this.nextPrecedence(altNum);
        altTree = this.addPrecedenceArgToRules(altTree, nextPrec);

        this.stripAltLabel(altTree);
        let altText = this.text(altTree);
        altText = altText.trim();
        const a: ILeftRecursiveRuleAltInfo = {
            altNum,
            altText,
            leftRecursiveRuleRefLabel: label,
            altLabel,
            isListLabel,
            originalAltAST: originalAltTree,
            nextPrec: 0,
        };
        a.nextPrec = nextPrec;
        this.binaryAlts.set(altNum, a);
    }

    public override prefixAlt(originalAltTree: AltAST, altNum: number): void {
        let altTree = dupTree(originalAltTree);
        this.stripAltLabel(altTree);

        const nextPrec = this.precedence(altNum);

        // rewrite e to be e_[prec]
        altTree = this.addPrecedenceArgToRules(altTree, nextPrec);
        let altText = this.text(altTree);
        altText = altText.trim();
        const altLabel = altTree.altLabel?.getText() ?? undefined;
        const a: ILeftRecursiveRuleAltInfo = {
            altNum,
            altText,
            altLabel,
            isListLabel: false,
            originalAltAST: originalAltTree,
            nextPrec: 0,
        };
        a.nextPrec = nextPrec;
        this.prefixAndOtherAlts.push(a);
    }

    public override suffixAlt(originalAltTree: AltAST, altNum: number): void {
        const altTree = dupTree(originalAltTree);
        const altLabel = altTree.altLabel?.getText();

        let label: string | undefined;
        let isListLabel = false;
        const lrLabel = this.stripLeftRecursion(altTree);
        if (lrLabel) {
            label = lrLabel.getText();
            isListLabel = lrLabel.parent?.getType() === ANTLRv4Parser.PLUS_ASSIGN;
            this.leftRecursiveRuleRefLabels.push([lrLabel, altLabel]);
        }
        this.stripAltLabel(altTree);
        let altText = this.text(altTree);
        altText = altText.trim();
        const a: ILeftRecursiveRuleAltInfo = {
            altNum,
            altText,
            leftRecursiveRuleRefLabel: label,
            altLabel,
            isListLabel,
            originalAltAST: originalAltTree,
            nextPrec: 0,
        };
        this.suffixAlts.set(altNum, a);
    }

    public override otherAlt(originalAltTree: AltAST, altNum: number): void {
        const altTree = dupTree(originalAltTree);
        this.stripAltLabel(altTree);
        const altText = this.text(altTree);
        const altLabel = altTree.altLabel?.getText() ?? undefined;
        const a: ILeftRecursiveRuleAltInfo = {
            altNum,
            altText,
            altLabel,
            isListLabel: false,
            originalAltAST: originalAltTree,
            nextPrec: 0,
        };

        // We keep other alts with prefix alts since they are all added to the start of the generated rule, and
        // we want to retain any prior ordering between them
        this.prefixAndOtherAlts.push(a);
    };

    // --------- get transformed rules ----------------

    public getArtificialOpPrecRule(): string {
        const ruleST = LeftRecursiveRuleAnalyzer.recRuleTemplates.getInstanceOf("recRule")!;
        ruleST.add("ruleName", this.ruleName);
        const ruleArgST = this.codegenTemplates.getInstanceOf("recRuleArg");
        ruleST.add("argName", ruleArgST);
        const setResultST = this.codegenTemplates.getInstanceOf("recRuleSetResultAction");
        ruleST.add("setResultAction", setResultST);
        ruleST.add("userRetvals", this.retvals);

        const opPrecRuleAlts = new OrderedHashMap<number, ILeftRecursiveRuleAltInfo>();
        this.binaryAlts.forEach((value, key) => {
            opPrecRuleAlts.set(key, value);
        });
        this.ternaryAlts.forEach((value, key) => {
            opPrecRuleAlts.set(key, value);
        });
        this.suffixAlts.forEach((value, key) => {
            opPrecRuleAlts.set(key, value);
        });

        for (const [alt, altInfo] of opPrecRuleAlts) {
            const altST = LeftRecursiveRuleAnalyzer.recRuleTemplates.getInstanceOf("recRuleAlt")!;
            const predST = this.codegenTemplates.getInstanceOf("recRuleAltPredicate")!;
            predST.add("opPrec", this.precedence(alt));
            predST.add("ruleName", this.ruleName);
            altST.add("pred", predST);
            altST.add("alt", altInfo);
            altST.add("precOption", Constants.PrecedenceOptionName);
            altST.add("opPrec", this.precedence(alt));
            ruleST.add("opAlts", altST);
        }

        ruleST.add("primaryAlts", this.prefixAndOtherAlts);

        const result = ruleST.render();
        this.tool.logInfo({ component: "left-recursion", msg: result });

        return result;
    }

    public addPrecedenceArgToRules(t: AltAST, prec: number): AltAST {
        // get all top-level rule refs from ALT
        const outerAltRuleRefs = t.getNodesWithTypePreorderDFS(IntervalSet.of(ANTLRv4Parser.RULE_REF,
            ANTLRv4Parser.RULE_REF));
        for (const x of outerAltRuleRefs) {
            const ruleRef = x as RuleRefAST;
            const recursive = ruleRef.getText() === this.ruleName;
            const rightmost = ruleRef === outerAltRuleRefs[outerAltRuleRefs.length - 1];
            if (recursive && rightmost) {
                const dummyValueNode = new GrammarAST(CommonToken.fromType(ANTLRv4Parser.INT, "" + prec));
                ruleRef.setOption(Constants.PrecedenceOptionName, dummyValueNode);
            }
        }

        return t;
    }

    // TODO: this strips the tree properly, but since text()
    // uses the start of stop token index and gets text from that
    // ineffectively ignores this routine.
    public stripLeftRecursion(altAST: GrammarAST): GrammarAST | undefined {
        let lrLabel: GrammarAST | undefined;
        let first = altAST.children[0] as GrammarAST;
        let leftRecurRuleIndex = 0;
        if (first.getType() === ANTLRv4Parser.ELEMENT_OPTIONS) {
            first = altAST.children[1] as GrammarAST;
            leftRecurRuleIndex = 1;
        }
        const rRef = first.children[1]; // if label=rule
        if ((first.getType() === ANTLRv4Parser.RULE_REF && first.getText() === this.ruleName)
            || (rRef.getType() === ANTLRv4Parser.RULE_REF
                && rRef.getText() === this.ruleName)) {
            if (first.getType() === ANTLRv4Parser.ASSIGN
                || first.getType() === ANTLRv4Parser.PLUS_ASSIGN) {
                lrLabel = first.children[0] as GrammarAST;
            }

            // remove rule ref (first child unless options present)
            altAST.deleteChild(leftRecurRuleIndex);

            // reset index so it prints properly (sets token range of
            // ALT to start to right of left recur rule we deleted)
            const newFirstChild = altAST.children[leftRecurRuleIndex] as GrammarAST;
            altAST.setTokenStartIndex(newFirstChild.getTokenStartIndex());
        }

        return lrLabel;
    }

    /** Strip last 2 tokens if → label; alter indexes in altAST */
    public stripAltLabel(altAST: GrammarAST): void {
        const start = altAST.getTokenStartIndex();
        const stop = altAST.getTokenStopIndex();

        // find =>
        for (let i = stop; i >= start; i--) {
            if (this.tokenStream.get(i).type === ANTLRv4Parser.POUND) {
                altAST.setTokenStopIndex(i - 1);

                return;
            }
        }
    }

    public text(t: GrammarAST): string {
        const tokenStartIndex = t.getTokenStartIndex();
        const tokenStopIndex = t.getTokenStopIndex();

        // ignore tokens from existing option subtrees like:
        //    (ELEMENT_OPTIONS (= assoc right))
        //
        // element options are added back according to the values in the map
        // returned by getOptions().
        const ignore = new IntervalSet();
        const optionsSubTrees = t.getNodesWithType(ANTLRv4Parser.ELEMENT_OPTIONS);
        for (const sub of optionsSubTrees) {
            ignore.addRange(sub.getTokenStartIndex(), sub.getTokenStopIndex());
        }

        // Individual labels appear as RULE_REF or TOKEN_REF tokens in the tree,
        // but do not support the ELEMENT_OPTIONS syntax. Make sure to not try
        // and add the tokenIndex option when writing these tokens.
        const noOptions = new IntervalSet();
        const typeSet = new IntervalSet();
        typeSet.addOne(ANTLRv4Parser.ASSIGN);
        typeSet.addOne(ANTLRv4Parser.PLUS_ASSIGN);
        const labeledSubTrees = t.getNodesWithType(typeSet);
        for (const sub of labeledSubTrees) {
            noOptions.addOne(sub.children[0].getTokenStartIndex());
        }

        let result = "";
        let i = tokenStartIndex;
        let skipNext = false;
        while (i <= tokenStopIndex) {
            if (skipNext || ignore.contains(i)) {
                skipNext = false;
                i++;
                continue;
            }

            const tok = this.tokenStream.get(i);
            let text = tok.text;

            // Compute/hold any element options
            let elementOptions = "";
            if (!noOptions.contains(i)) {
                const node = t.getNodeWithTokenIndex(tok.tokenIndex);
                if (node !== null &&
                    (tok.type === ANTLRv4Parser.TOKEN_REF ||
                        tok.type === ANTLRv4Parser.STRING_LITERAL ||
                        tok.type === ANTLRv4Parser.RULE_REF)) {
                    elementOptions += "tokenIndex=" + tok.tokenIndex;
                }

                if (node instanceof GrammarASTWithOptions) {
                    const newText = node.getText();
                    if (newText.endsWith("?")) {
                        // Have to move the trailing ? to the action code (as it is actually a sempred).
                        // In ANTLR3 the entire sempred was read in one go. In ANTLR4 the ? is read as a separate token.
                        text = newText;
                        skipNext = true;
                    }

                    const o = node;
                    for (const [key, value] of o.getOptions().entries()) {
                        if (elementOptions.length > 0) {
                            elementOptions += ",";
                        }

                        elementOptions += key;
                        elementOptions += "=";
                        elementOptions += value!.getText();
                    }
                }
            }

            // Add actual text of the current token to the rewritten alternative.
            result += text;
            i++;

            // Are there args on a rule?
            if (tok.type === ANTLRv4Parser.RULE_REF) {
                while (i <= tokenStopIndex && this.tokenStream.get(i).channel !== Token.DEFAULT_CHANNEL) {
                    ++i;
                }

                if (this.tokenStream.get(i).type === ANTLRv4Parser.BEGIN_ARGUMENT) {
                    while (true) {
                        result += this.tokenStream.get(i).text;

                        if (this.tokenStream.get(i).type === ANTLRv4Parser.END_ARGUMENT) {
                            break;
                        }

                        i++;
                    }
                    i++;
                }
            }

            // now that we have the actual element, we can add the options.
            if (elementOptions.length > 0) {
                result += "<" + elementOptions + ">";
            }
        }

        return result;
    }

    public precedence(alt: number): number {
        return this.numAlts - alt + 1;
    }

    // Assumes left assoc
    public nextPrecedence(alt: number): number {
        const p = this.precedence(alt);
        if (this.altAssociativity.get(alt) === Associativity.Right) {
            return p;
        }

        return p + 1;
    }

    public override toString(): string {
        return "PrecRuleOperatorCollector{" +
            "binaryAlts=" + JSON.stringify(Object.fromEntries(this.binaryAlts)) +
            ", ternaryAlts=" + JSON.stringify(Object.fromEntries(this.ternaryAlts)) +
            ", suffixAlts=" + JSON.stringify(Object.fromEntries(this.suffixAlts)) +
            ", prefixAndOtherAlts=" + JSON.stringify(this.prefixAndOtherAlts) +
            "}";
    }
}
