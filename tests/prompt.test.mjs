import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, DEFAULT_PIECES, LOOK, REFERENCE_RULES, composePrompt, encodeState, decodeState } from "../js/prompt.js";

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
  const state = { text: "a frost obelisk — with ünïcode", selections: { shape: "Chunky", lighting: "Cold atmosphere" }, pieces: { rules: true, look: false } };
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

// ---------------------------------------------------------------- prompt pieces (reference rules, Grammar Ghouls look)

test("the reference rules come last and say it is a modeling reference", () => {
  const prompt = composePrompt({ shape: "Chunky" }, "an ice tower", { rules: true });
  assert.ok(prompt.startsWith("Subject: an ice tower\n\nShape language: chunky."), prompt);
  assert.match(prompt, /not concept art or a scene illustration/);
  assert.match(prompt, /Fully transparent background/);
  assert.ok(prompt.endsWith(REFERENCE_RULES), "rules are the last block");
});

test("the look comes first, then the subject, the keywords and the rules", () => {
  const prompt = composePrompt({ shading: "Cel-shaded" }, "an ice tower", { rules: true, look: true });
  const order = [LOOK, "Subject: an ice tower", "Shading: cel-shaded.", REFERENCE_RULES].map((part) => prompt.indexOf(part));
  assert.ok(order.every((at) => at >= 0), "every part is present");
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("the pieces alone, without text or keywords, compose nothing", () => {
  assert.equal(composePrompt({}, " ", { rules: true, look: true }), "");
});

test("without pieces the text is not labelled as a subject", () => {
  assert.equal(composePrompt({}, "an ice tower", { rules: false, look: false }), "an ice tower");
});

test("the pieces survive a share code", () => {
  const state = { text: "x", selections: {}, pieces: { rules: false, look: true } };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("a share code from before the pieces opens with the default pieces", () => {
  const old = Buffer.from(JSON.stringify({ t: "x", k: {} })).toString("base64url");
  assert.deepEqual(decodeState(old).pieces, DEFAULT_PIECES);
});
