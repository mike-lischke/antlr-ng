/*
 * Copyright (c) The ANTLR Project. All rights reserved.
 * Use of this file is governed by the BSD 3-clause license that
 * can be found in the LICENSE.txt file in the project root.
 */

import type { RecognitionException } from "antlr4ng";

import { ANTLRMessage } from "./ANTLRMessage.js";
import { ErrorType } from "./ErrorType.js";

/**
 * A problem with the syntax of your antlr grammar such as
 *  "The '{' came as a complete surprise to me at this point in your program"
 */
export class GrammarSyntaxMessage extends ANTLRMessage {
    public constructor(type: ErrorType,
        fileName: string,
        line: number, column: number,
        antlrException: RecognitionException | null, ...args: unknown[]) {
        super(type, fileName, antlrException, line, column, ...args);
    }
}
