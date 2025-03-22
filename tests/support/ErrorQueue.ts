/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import type { ANTLRMessage } from "../../src/tool/ANTLRMessage.js";
import { ToolListener } from "../../src/tool/ToolListener.js";
import { ErrorManager } from "../../src/tool/ErrorManager.js";

export class ErrorQueue extends ToolListener {
    public readonly infos: string[] = [];
    public readonly errors: ANTLRMessage[] = [];
    public readonly warnings: ANTLRMessage[] = [];
    public readonly all: ANTLRMessage[] = [];

    // TODO: reorganize the error manager to avoid cross-references.
    public constructor(errorManager: ErrorManager) {
        super(errorManager);
    }

    public info(msg: string): void {
        this.infos.push(msg);
    }

    public error(msg: ANTLRMessage): void {
        this.errors.push(msg);
        this.all.push(msg);
    }

    public warning(msg: ANTLRMessage): void {
        this.warnings.push(msg);
        this.all.push(msg);
    }

    public errorToolMessage(msg: ANTLRMessage): void {
        this.errors.push(msg);
        this.all.push(msg);
    }

    public size(): number {
        return this.all.length + this.infos.length;
    }

    public toString(rendered = false): string {
        if (!rendered) {
            return this.all.join("\n");
        }

        let buf = "";
        for (const m of this.all) {
            const st = this.errorManager.getMessageTemplate(m)!;
            buf += st.render() + "\n";
        }

        return buf;
    }
}
