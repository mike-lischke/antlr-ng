/*
 * Copyright (c) Mike Lischke. All rights reserved.
 * Licensed under the BSD 3-clause License. See License.txt in the project root for license information.
 */

import { describe, expect, it } from "vitest";

import { ScopeParser } from "../src/parse/ScopeParser.js";
import type { IToolParameters } from "../src/tool-parameters.js";
import { IAttribute } from "../src/tool/IAttribute.js";
import { Grammar } from "../src/tool/index.js";

interface IParameter {
    input: string;
    output: string;
}

describe("TestScopeParsing", () => {

    const argPairs = [
        "", "",
        " ", "",
        "int i", "i:int",
        "int[] i, int j[]", "i:int[], j:int []",
        "Map<A,B>[] i, int j[]", "i:Map<A,B>[], j:int []",
        "Map<A,List<B>>[] i", "i:Map<A,List<B>>[]",
        "int i = 34+a[3], int j[] = new int[34]",
        "i:int=34+a[3], j:int []=new int[34]",
        // not valid C really, C is "type name" however so this is cool (this was broken in 4.5 anyway)
        "char *[3] foo = {1,2,3}", "foo:char *[3]={1,2,3}",
        "String[] headers", "headers:String[]",

        // C++
        "std::vector<std::string> x", "x:std::vector<std::string>", // yuck. Don't choose :: as the : of a declaration

        // python/ruby style
        "i", "i",
        "i,j", "i, j",
        "i\t,j, k", "i, j, k",

        // swift style
        "x: int", "x:int",
        "x :int", "x:int",
        "x:int", "x:int",
        "x:int=3", "x:int=3",
        "r:Rectangle=Rectangle(fromLength: 6, fromBreadth: 12)", "r:Rectangle=Rectangle(fromLength: 6, " +
        "fromBreadth: 12)",
        "p:pointer to int", "p:pointer to int",
        "a: array[3] of int", "a:array[3] of int",
        "a \t:\tfunc(array[3] of int)", "a:func(array[3] of int)",
        "x:int, y:float", "x:int, y:float",
        "x:T?, f:func(array[3] of int), y:int", "x:T?, f:func(array[3] of int), y:int",

        // go is postfix type notation like "x int" but must use either "int x" or "x:int" in [...] actions
        "float64 x = 3", "x:float64=3",
        "map[string]int x", "x:map[string]int",
    ];

    const getAllTestDescriptors = (): IParameter[] => {
        const tests: IParameter[] = [];
        for (let i = 0; i < argPairs.length; i += 2) {
            const input = argPairs[i];
            const output = argPairs[i + 1];
            tests.push({ input, output });
        }

        return tests;
    };

    it.each(getAllTestDescriptors())("testArgs: %s", (parameter: IParameter): void => {
        const dummy = new Grammar("grammar T; a:'a';");
        dummy.tool.process(dummy, {} as IToolParameters, false);

        const attributes = ScopeParser.parseTypedArgList(null, parameter.input, dummy).attributes;
        const out: string[] = [];
        for (const arg of attributes.keys()) {
            const attr = attributes.get(arg)!;
            out.push(IAttribute.toString(attr));
        }
        const actual = out.join(", ");
        expect(actual).toBe(parameter.output);
    });

});
