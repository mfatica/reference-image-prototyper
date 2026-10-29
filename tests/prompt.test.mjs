import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, DEFAULT_PIECES, REFERENCE_RULES, STYLE, composePrompt, encodeState, decodeState, startState } from "../js/prompt.js";

test("there are eight categories with eight options each", () => {
  assert.equal(CATEGORIES.length, 8);
  for (const c of CATEGORIES) assert.equal(c.options.length, 8, c.id);
});

test("an empty form composes an empty prompt", () => {
  assert.equal(composePrompt({}, "   "), "");
});

test("text alone is used as it is, trimmed", () => {
  assert.equal(composePrompt({}, "  an ice tower  "), "an ice tower");
});

test("keywords alone are listed one per line in category order", () => {
  const prompt = composePrompt({ shading: "Cel-shaded", shape: "Chunky" }, "");
  assert.equal(prompt, "Shape language: chunky.\nShading: cel-shaded.");
});

test("text comes first, then a blank line, then the keywords", () => {
  const prompt = composePrompt({ material: "Icy / Translucent" }, "an ice tower");
  assert.equal(prompt, "an ice tower\n\nMaterial finish: icy / translucent.");
});

test("unknown categories and options are ignored", () => {
  assert.equal(composePrompt({ shape: "Wobbly", nope: "Chunky" }, ""), "");
});

test("a state survives a round trip through a share code", () => {
  const state = { text: "a frost obelisk — with ünïcode", selections: { shape: "Chunky", lighting: "Cold atmosphere" }, pieces: { rules: true } };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("a share code is safe in a URL", () => {
  const code = encodeState({ text: "???///+++", selections: {} });
  assert.match(code, /^[A-Za-z0-9_-]*$/);
});

test("decoding drops unknown categories and options", () => {
  const code = encodeState({ text: "x", selections: { shape: "Chunky", shading: "Wobbly", nope: "Chunky" } });
  assert.deepEqual(decodeState(code), { text: "x", selections: { shape: "Chunky" }, pieces: DEFAULT_PIECES });
});

test("a damaged share code decodes to null", () => {
  assert.equal(decodeState("%%%not-base64%%%"), null);
  assert.equal(decodeState(""), null);
});

test("decoding caps very long text", () => {
  const code = encodeState({ text: "a".repeat(10000), selections: {} });
  assert.equal(decodeState(code).text.length, 4000);
});

// ---------------------------------------------------------------- reference rules (style paragraph + rules)

test("with the rules on, the style comes first and the rules last", () => {
  const prompt = composePrompt({ shading: "Cel-shaded" }, "an ice tower", { rules: true });
  const order = [STYLE, "Subject: an ice tower", "Shading: cel-shaded.", REFERENCE_RULES].map((part) => prompt.indexOf(part));
  assert.ok(order.every((at) => at >= 0), "every part is present");
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(prompt.endsWith(REFERENCE_RULES), "rules are the last block");
});

test("the rules say it is a modeling reference on a transparent background", () => {
  assert.match(REFERENCE_RULES, /not concept art or a scene illustration/);
  assert.match(REFERENCE_RULES, /Fully transparent background/);
});

test("the style names Warcraft and Diablo as a general style, not a single game", () => {
  assert.match(STYLE, /general style of Warcraft and Diablo/);
  assert.doesNotMatch(STYLE, /Warcraft III/);
});

test("the rules alone, without text or keywords, compose nothing", () => {
  assert.equal(composePrompt({}, " ", { rules: true }), "");
});

test("with the rules off the text is not labelled as a subject", () => {
  assert.equal(composePrompt({}, "an ice tower", { rules: false }), "an ice tower");
});

test("the rules switch survives a share code", () => {
  const state = { text: "x", selections: {}, pieces: { rules: false } };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("a share code from before the switch opens with the default", () => {
  const old = Buffer.from(JSON.stringify({ t: "x", k: {} })).toString("base64url");
  assert.deepEqual(decodeState(old).pieces, DEFAULT_PIECES);
});

test("a share code with the old look switch keeps only the rules switch", () => {
  const old = Buffer.from(JSON.stringify({ t: "x", k: {}, p: { rules: false, look: true } })).toString("base64url");
  assert.deepEqual(decodeState(old).pieces, { rules: false });
});

// ---------------------------------------------------------------- the form at start

test("a share link wins over the saved form", () => {
  const shared = encodeState({ text: "shared", selections: {} });
  const saved = encodeState({ text: "saved", selections: {} });
  assert.equal(startState(shared, saved).text, "shared");
});

test("without a share link the saved form comes back", () => {
  const saved = encodeState({ text: "saved", selections: { shape: "Chunky" }, pieces: { rules: false } });
  assert.deepEqual(startState("", saved), { text: "saved", selections: { shape: "Chunky" }, pieces: { rules: false } });
});

test("a damaged share link falls back to the saved form", () => {
  assert.equal(startState("%%%", encodeState({ text: "saved", selections: {} })).text, "saved");
});

test("with nothing saved the form starts empty with the default switch", () => {
  assert.deepEqual(startState(null, null), { text: "", selections: {}, pieces: DEFAULT_PIECES });
});
