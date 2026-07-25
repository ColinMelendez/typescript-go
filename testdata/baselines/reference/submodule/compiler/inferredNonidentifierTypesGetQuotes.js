//// [tests/cases/compiler/inferredNonidentifierTypesGetQuotes.ts] ////

//// [inferredNonidentifierTypesGetQuotes.ts]
var x = [{ "a-b": "string" }, {}];

var y = [{ ["a-b"]: "string" }, {}];

//// [inferredNonidentifierTypesGetQuotes.js]
"use strict";
var x = [{ "a-b": "string" }, {}];
var y = [{ ["a-b"]: "string" }, {}];


//// [inferredNonidentifierTypesGetQuotes.d.ts]
declare var x: Array<{
    "a-b": string;
} | {
    "a-b"?: undefined;
}>;
declare var y: Array<{
    "a-b": string;
} | {
    "a-b"?: undefined;
}>;
