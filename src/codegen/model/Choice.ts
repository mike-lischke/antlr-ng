/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { IntervalSet } from "antlr4ng";

import { ModelElement } from "../../misc/ModelElement.js";
import { GrammarAST } from "../../tool/ast/GrammarAST.js";
import { IOutputModelFactory } from "../IOutputModelFactory.js";
import { CaptureNextTokenType } from "./CaptureNextTokenType.js";
import { CodeBlockForAlt } from "./CodeBlockForAlt.js";
import { RuleElement } from "./RuleElement.js";
import { SrcOp } from "./SrcOp.js";
import { TestSetInline } from "./TestSetInline.js";
import { ThrowNoViableAlt } from "./ThrowNoViableAlt.js";
import { ITokenInfo } from "./ITokenInfo.js";
import { Decl } from "./decl/Decl.js";
import { TokenTypeDecl } from "./decl/TokenTypeDecl.js";

/**
 * The class hierarchy underneath SrcOp is pretty deep but makes sense that, for example LL1StarBlock is a kind of
 * LL1Loop which is a kind of Choice. The problem is it's impossible to figure out how to construct one of these
 * deeply nested objects because of the long super constructor call chain. Instead, I decided to in-line all of
 * this and then look for opportunities to re-factor code into functions. It makes sense to use a class hierarchy
 * to share data fields, but I don't think it makes sense to factor code using super constructors because
 * it has too much work to do.
 */
export abstract class Choice extends RuleElement {
    public decision = -1;
    public label: Decl;

    @ModelElement
    public alts: CodeBlockForAlt[] = [];

    @ModelElement
    public preamble: SrcOp[] = [];

    public constructor(factory: IOutputModelFactory,
        blkOrEbnfRootAST: GrammarAST,
        alts: CodeBlockForAlt[]) {
        super(factory, blkOrEbnfRootAST);

        this.alts = alts;
    }

    public addPreambleOp(op: SrcOp): void {
        this.preamble.push(op);
    }

    public getAltLookaheadAsStringLists(altLookSets: IntervalSet[]): ITokenInfo[][] {
        const altLook: ITokenInfo[][] = [];
        const target = this.factory!.getGenerator()!.target;
        const grammar = this.factory!.g;

        for (const s of altLookSets) {
            const list = s.toArray();
            const info: ITokenInfo[] = [];
            for (const set of list) {
                info.push({ type: set, name: target.getTokenTypeAsTargetLabel(grammar, set) });
            }
            altLook.push(info);
        }

        return altLook;
    }

    public addCodeForLookaheadTempVar(look: IntervalSet): TestSetInline | null {
        const testOps = this.factory!.getLL1Test(look, this.ast!)!;
        const expr = testOps.find((op) => {
            return (op instanceof TestSetInline);
        });

        if (expr !== undefined) {
            const d = new TokenTypeDecl(this.factory!, expr.varName);
            this.factory!.getCurrentRuleFunction()!.addLocalDecl(d);
            const nextType = new CaptureNextTokenType(this.factory!, expr.varName);
            this.addPreambleOp(nextType);
        }

        return expr ?? null;
    }

    public getThrowNoViableAlt(factory: IOutputModelFactory, blkAST: GrammarAST): ThrowNoViableAlt {
        return new ThrowNoViableAlt(factory, blkAST);
    }
}
