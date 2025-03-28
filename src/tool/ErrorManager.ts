/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

/* eslint-disable jsdoc/require-param, jsdoc/require-returns */

import type { RecognitionException } from "antlr4ng";
import { ErrorBuffer, IST, STGroup, STGroupString } from "stringtemplate4ts";

import { ANTLRMessage } from "./ANTLRMessage.js";
import { IssueCode, IssueSeverity, severityMap } from "./Issues.js";
import { ToolListener } from "./ToolListener.js";
import { basename } from "../support/fs-helpers.js";

// The supported ANTLR message formats. Using ST here is overkill and will later be replaced with a simpler solution.
const messageTemplate = `
location(file, line, column) ::= "<file>:<line>:<column>:"
message(id, text) ::= "(<id>) <text>"
report(location, message, type) ::= "<type>(<message.id>): <location> <message.text>"
wantsSingleLineMessage() ::= "false"
`;

/**
 * A class to take care of individual {@link ANTLRMessage}s. It can notify registered listeners about incomming
 * messages and ensures proper formatting of the messages.
 */
export class ErrorManager {
    private static readonly loadedFormats = new Map<string, STGroupString>();

    public errors = 0;
    public warnings = 0;

    /** All errors that have been generated */
    public errorTypes = new Set<IssueCode>();

    /** The group of templates that represent the current message format. */
    private format: STGroup;

    private formatName: string;

    private initSTListener = new ErrorBuffer();
    private listeners = new Array<ToolListener>();

    private longMessages = false;
    private warningsAreErrors = false;

    /**
     * Track separately so if someone adds a listener, it's the only one instead of it and the default stderr listener.
     */
    private defaultListener = new ToolListener(this);

    public static fatalInternalError(error: string, e: Error): void {
        ErrorManager.internalError(error, e);
        throw new Error(error, { cause: e });
    }

    public static internalError(error: string, e?: Error): void {
        if (e) {
            const location = ErrorManager.getLastNonErrorManagerCodeLocation(e);
            ErrorManager.internalError(`Exception ${e}@${location}: ${error}`);
        } else {
            const location = ErrorManager.getLastNonErrorManagerCodeLocation(new Error());
            const msg = location + ": " + error;
            console.error("internal error: " + msg);
        }
    }

    /** @returns The first non ErrorManager code location for generating messages. */
    private static getLastNonErrorManagerCodeLocation(e: Error): string {
        const stack = e.stack!.split("\n");
        let entry = "";
        for (entry of stack) {
            if (!entry.includes("ErrorManager")) {
                break;
            }
        }

        return entry;
    }

    public configure(longMessages?: boolean, warningsAreErrors?: boolean) {
        this.errors = 0;
        this.warnings = 0;
        this.longMessages = longMessages ?? false;
        this.warningsAreErrors = warningsAreErrors ?? false;

        this.loadFormat();
    }

    public formatWantsSingleLineMessage(): boolean {
        const result = this.format.getInstanceOf("wantsSingleLineMessage")?.render();

        return result === "true" ? true : false;
    }

    public getMessageTemplate(msg: ANTLRMessage): IST | null {
        const messageST = msg.getMessageTemplate(this.longMessages);
        const locationST = this.getLocationFormat();
        const reportST = this.getReportFormat(msg.issue.severity);
        const messageFormatST = this.getMessageFormat();

        let locationValid = false;
        if (msg.line !== -1) {
            locationST.add("line", msg.line);
            locationValid = true;
        }

        if (msg.column !== -1) {
            locationST.add("column", msg.column);
            locationValid = true;
        }

        if (msg.fileName) {
            let displayFileName = msg.fileName;
            if (this.formatName === "antlr") {
                // Don't show path to file in messages in ANTLR format, they're too long.
                displayFileName = basename(msg.fileName);
            } else {
                // For other message formats, use the full filename in the message. This assumes that these formats
                // are intended to be parsed by IDEs, and so they need the full path to resolve correctly.
            }
            locationST.add("file", displayFileName);
            locationValid = true;
        }

        messageFormatST.add("id", msg.issueCode);
        messageFormatST.add("text", messageST);

        if (locationValid) {
            reportST?.add("location", locationST);
        }

        reportST?.add("message", messageFormatST);

        return reportST;
    }

    /**
     * Raise a predefined message with some number of parameters for the StringTemplate but for which there
     * is no location information possible.
     *
     * @param errorType The identifier of the issue.
     * @param args The arguments to pass to the StringTemplate
     */
    public toolError(errorType: IssueCode, ...args: unknown[]): void;
    public toolError(errorType: IssueCode, e: Error, ...args: unknown[]): void;
    public toolError(...allArgs: unknown[]): void {
        let msg: ANTLRMessage;

        if (allArgs.length < 1) {
            throw new Error("Invalid number of arguments");
        }

        const issueType = allArgs.shift() as IssueCode;

        if (allArgs.length > 0) {
            const error = allArgs[0];
            if (error instanceof Error) {
                allArgs.shift();
                msg = new ANTLRMessage(issueType, "", error, -1, -1, ...allArgs);
            } else {
                msg = new ANTLRMessage(issueType, "", -1, -1, ...allArgs);
            }
        } else {
            msg = new ANTLRMessage(issueType, "", -1, -1);
        }

        this.emit(msg);
    }

    public grammarError(errorType: IssueCode, fileName: string, position: { line: number, column: number; } | null,
        ...args: unknown[]): void {
        const msg = new ANTLRMessage(errorType, fileName, position?.line ?? -1, position?.column ?? -1,
            ...args);
        this.emit(msg);
    }

    public addListener(tl: ToolListener): void {
        this.listeners.push(tl);
    }

    public removeListener(tl: ToolListener): void {
        const index = this.listeners.indexOf(tl);
        if (index >= 0) {
            this.listeners.splice(index, 1);
        }
    }

    public removeListeners(): void {
        this.listeners = [];
    }

    public syntaxError(errorType: IssueCode, fileName: string, line: number, column: number,
        antlrException: RecognitionException | null, ...args: unknown[]): void {
        const msg = new ANTLRMessage(errorType, fileName, antlrException, line, column, ...args);
        this.emit(msg);
    }

    public info(msg: string): void {
        if (this.listeners.length === 0) {
            this.defaultListener.info(msg);

            return;
        }

        for (const l of this.listeners) {
            l.info(msg);
        }
    }

    public error(msg: ANTLRMessage): void {
        ++this.errors;
        if (this.listeners.length === 0) {
            this.defaultListener.error(msg);

            return;
        }

        for (const l of this.listeners) {
            l.error(msg);
        }
    }

    public warning(msg: ANTLRMessage): void {
        if (this.listeners.length === 0) {
            this.defaultListener.warning(msg);
        } else {
            for (const l of this.listeners) {
                l.warning(msg);
            }
        }

        if (this.warningsAreErrors) {
            this.emit(new ANTLRMessage(IssueCode.WarningTreatedAsErrors, msg.fileName, msg.line, msg.column));
        }
    }

    public emit(msg: ANTLRMessage): void {
        switch (msg.issue.severity) {
            case IssueSeverity.WarningOneOff: {
                if (this.errorTypes.has(msg.issueCode)) {
                    break;
                }

                // [fall-through]
            }

            case IssueSeverity.Warning: {
                this.warnings++;
                this.warning(msg);

                break;
            }

            case IssueSeverity.ErrorOneOff: {
                if (this.errorTypes.has(msg.issueCode)) {
                    break;
                }

                // [fall-through]
            }

            case IssueSeverity.Error:
            case IssueSeverity.Fatal: {
                this.error(msg);
                break;
            }

            default:
        }

        this.errorTypes.add(msg.issueCode);
    }

    /**
     * Return a StringTemplate that refers to the current format used for emitting messages.
     */
    private getLocationFormat(): IST {
        return this.format.getInstanceOf("location")!;
    }

    private getReportFormat(severity: IssueSeverity): IST | null {
        const st = this.format.getInstanceOf("report");
        st?.add("type", severityMap.get(severity));

        return st;
    }

    private getMessageFormat(): IST {
        return this.format.getInstanceOf("message")!;
    }

    /**
     * The format gets reset either from the Tool if the user supplied a command line option to that effect.
     * Otherwise we just use the default "antlr".
     */
    private loadFormat(): void {
        this.format = new STGroupString("ErrorManager", messageTemplate, "<", ">");

        if (this.initSTListener.size > 0) {
            throw new Error("Can't load messages format file:\n" + this.initSTListener.toString());
        }

        const formatOK = this.verifyFormat();
        if (!formatOK) {
            throw new Error("antlr-ng messages format is invalid");
        }
    }

    /** Verify the message format template group */
    private verifyFormat(): boolean {
        let ok = true;
        if (!this.format.isDefined("location")) {
            console.error("Format template 'location' not found in " + this.formatName);
            ok = false;
        }

        if (!this.format.isDefined("message")) {
            console.error("Format template 'message' not found in " + this.formatName);
            ok = false;
        }

        if (!this.format.isDefined("report")) {
            console.error("Format template 'report' not found in " + this.formatName);
            ok = false;
        }

        return ok;
    }
}
