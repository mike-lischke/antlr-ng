/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { ST } from "stringtemplate4ts";

import { IssueCode, issueTypes, type IssueDetails } from "./Issues.js";

/** The class that covers any of the tool messages (like errors) */
export class ANTLRMessage {
    public readonly fileName: string;
    public readonly line: number = -1;
    public readonly column: number = -1;

    public readonly args: unknown[] = [];

    public readonly issueCode: IssueCode;
    public readonly issue: IssueDetails;

    private readonly e: Error | null = null;

    public constructor(errorType: IssueCode, fileName: string, line: number, column: number, ...args: unknown[]);
    public constructor(errorType: IssueCode, fileName: string, e: Error | null, line: number, column: number,
        ...args: unknown[]);
    public constructor(...args: unknown[]) {
        this.issueCode = args.shift() as IssueCode;
        this.issue = issueTypes.get(this.issueCode)!;
        this.fileName = args.shift() as string;

        let next = args.shift();
        if (typeof next !== "number") {
            this.e = next as Error;
            next = args.shift();
        }

        this.line = next as number;
        this.column = args.shift() as number;

        if (args.length > 0) {
            this.args = args;
        }
    }

    /**
     * @param verbose Whether to include additional information in the message.
     *
     * @returns a template for the message, which can be used to render the final message.
     */
    public getMessageTemplate(verbose: boolean): ST {
        const messageST = new ST(this.issue.message);
        messageST.impl!.name = IssueCode[this.issueCode];

        messageST.add("verbose", verbose);
        for (let i = 0; i < this.args.length; i++) {
            let attr = "arg";
            if (i > 0) {
                attr += String(i + 1);
            }

            messageST.add(attr, this.args[i]);
        }

        if (this.args.length < 2) {
            messageST.add("arg2", null);
        }

        // Some messages ref arg2.
        if (this.e !== null) {
            messageST.add("exception", this.e);
            messageST.add("stackTrace", this.e.stack);
        } else {
            messageST.add("exception", null); // avoid ST error msg
            messageST.add("stackTrace", null);
        }

        return messageST;
    }

    public toString(): string {
        const name = IssueCode[this.issueCode];

        return `Message{errorType=${name}, args=${this.args.join(", ")}, e=${this.e}, fileName=` +
            `'${this.fileName}', line=${this.line}, charPosition=${this.column}}`;
    }
}
