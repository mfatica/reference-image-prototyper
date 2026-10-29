import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, composePrompt, encodeState, decodeState } from "../js/prompt.js";

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
  const state = { text: "a frost obelisk — with ünïcode", selections: { shape: "Chunky", lighting: "Cold atmosphere" } };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("a share code is safe in a URL", () => {
  const code = encodeState({ text: "???///+++", selections: {} });
  assert.match(code, /^[A-Za-z0-9_-]*$/);
});

test("decoding drops unknown categories and options", () => {
  const code = encodeState({ text: "x", selections: { shape: "Chunky", shading: "Wobbly", nope: "Chunky" } });
  assert.deepEqual(decodeState(code), { text: "x", selections: { shape: "Chunky" } });
});

test("a damaged share code decodes to null", () => {
  assert.equal(decodeState("%%%not-base64%%%"), null);
  assert.equal(decodeState(""), null);
});

test("decoding caps very long text", () => {
  const code = encodeState({ text: "a".repeat(10000), selections: {} });
  assert.equal(decodeState(code).text.length, 4000);
});
