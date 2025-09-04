// src/setupGlobals.js
import * as cptable from 'codepage';
globalThis.cptable = cptable;
globalThis.QUOTE = 34;  // Definisce QUOTE come 34 (virgolette doppie)
console.log("setupGlobals.js: cptable definito:", globalThis.cptable);
console.log("setupGlobals.js: QUOTE definito:", globalThis.QUOTE);

