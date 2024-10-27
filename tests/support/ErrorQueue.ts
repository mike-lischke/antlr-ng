/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 */

import type { ANTLRMessage } from "../../src/tool/ANTLRMessage.js";
import type { ANTLRToolListener } from "../../src/tool/ANTLRToolListener.js";
import { ErrorManager } from "../../src/tool/ErrorManager.js";
import type { ToolMessage } from "../../src/tool/ToolMessage.js";

export class ErrorQueue implements ANTLRToolListener {
    public readonly infos: string[] = [];
    public readonly errors: ANTLRMessage[] = [];
    public readonly warnings: ANTLRMessage[] = [];
    public readonly all: ANTLRMessage[] = [];

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

    public errorToolMessage(msg: ToolMessage): void {
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
            const st = ErrorManager.get().getMessageTemplate(m)!;
            buf += st.render() + "\n";
        }

        return buf;
    }
}