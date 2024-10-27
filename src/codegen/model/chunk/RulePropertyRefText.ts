/*
 * Copyright (c) The ANTLR Project. All rights reserved.
 * Use of this file is governed by the BSD 3-clause license that
 * can be found in the LICENSE.txt file in the project root.
 */

import { StructDecl } from "../decl/StructDecl.js";
import { RulePropertyRef } from "./RulePropertyRef.js";

export class RulePropertyRefText extends RulePropertyRef {
    public constructor(ctx: StructDecl, label: string) {
        super(ctx, label);
    }
}