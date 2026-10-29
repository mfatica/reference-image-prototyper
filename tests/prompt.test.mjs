import { test } from "node:test";
import assert from "node:assert/strict";
import { CATEGORIES, DEFAULT_PIECES, DEFAULT_REFERENCE, MAX_REFERENCE, REFERENCE_RULES, STYLE, composePrompt, encodeState, decodeState, startState } from "../js/prompt.js";

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
  const state = { text: "a frost obelisk — with ünïcode", selections: { shape: "Chunky", lighting: "Cold atmosphere" }, pieces: { rules: true }, reference: null };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("a share code is safe in a URL", () => {
  const code = encodeState({ text: "???///+++", selections: {} });
  assert.match(code, /^[A-Za-z0-9_-]*$/);
});

test("decoding drops unknown categories and options", () => {
  const code = encodeState({ text: "x", selections: { shape: "Chunky", shading: "Wobbly", nope: "Chunky" } });
  assert.deepEqual(decodeState(code), { text: "x", selections: { shape: "Chunky" }, pieces: DEFAULT_PIECES, reference: null });
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

test("the rules say it is a modeling reference on an empty background", () => {
  assert.match(REFERENCE_RULES, /not concept art or a scene illustration/);
  assert.match(REFERENCE_RULES, /Plain empty background/);
});

/** Every word or phrase a dropdown can add, e.g. "Icy / Translucent" -> ["icy", "translucent"], "Untextured (clay)" -> ["untextured", "clay"]. */
function optionTerms() {
  return CATEGORIES.flatMap((c) => c.options)
    .flatMap((o) => o.toLowerCase().replace(/[()]/g, " / ").split("/"))
    .map((t) => t.trim()).filter(Boolean);
}

test("the style and rules use none of the dropdowns' words, so they never clash", () => {
  const text = `${STYLE}
${REFERENCE_RULES}`.toLowerCase();
  const clashes = optionTerms().filter((term) => new RegExp(`(^|[^a-z-])${term}([^a-z-]|$)`).test(text));
  assert.deepEqual(clashes, []);
});

test("the style and rules leave lighting, image shape and background colour to the options", () => {
  const text = `${STYLE}
${REFERENCE_RULES}`;
  for (const word of [/lighting/i, /square image/i, /1024/, /transparent/i, /shadows?,? no strong highlights/i]) assert.doesNotMatch(text, word);
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
  const state = { text: "x", selections: {}, pieces: { rules: false }, reference: null };
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
  assert.deepEqual(startState("", saved), { text: "saved", selections: { shape: "Chunky" }, pieces: { rules: false }, reference: null });
});

test("a damaged share link falls back to the saved form", () => {
  assert.equal(startState("%%%", encodeState({ text: "saved", selections: {} })).text, "saved");
});

test("with nothing saved the form starts empty with the default switch", () => {
  assert.deepEqual(startState(null, null), { text: "", selections: {}, pieces: DEFAULT_PIECES, reference: null });
});

// ---------------------------------------------------------------- an edited reference prompt

test("an edited reference prompt replaces the default, in the same places", () => {
  const reference = { style: "A tidy wizard tower.", rules: "One object, white background." };
  const prompt = composePrompt({ shape: "Chunky" }, "an ice tower", { rules: true }, reference);
  assert.equal(prompt, "A tidy wizard tower.\n\nSubject: an ice tower\n\nShape language: chunky.\n\nOne object, white background.");
});

test("an emptied part of the reference prompt is left out", () => {
  const prompt = composePrompt({}, "an ice tower", { rules: true }, { style: "  ", rules: "Rules." });
  assert.equal(prompt, "Subject: an ice tower\n\nRules.");
});

test("with the rules off an edited reference prompt is not used", () => {
  assert.equal(composePrompt({}, "an ice tower", { rules: false }, { style: "S", rules: "R" }), "an ice tower");
});

test("an edited reference prompt survives a share code", () => {
  const state = { text: "x", selections: {}, pieces: { rules: true }, reference: { style: "S", rules: "R" } };
  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("the default reference prompt is not put in share codes", () => {
  const plain = encodeState({ text: "x", selections: {} });
  const same = encodeState({ text: "x", selections: {}, reference: { ...DEFAULT_REFERENCE } });
  assert.equal(same, plain);
  assert.equal(decodeState(same).reference, null);
});

test("a damaged reference in a share code falls back to the default", () => {
  const code = Buffer.from(JSON.stringify({ t: "x", k: {}, r: { s: 5, r: ["no"] } })).toString("base64url");
  assert.equal(decodeState(code).reference, null);
});

test("decoding caps a very long reference prompt", () => {
  const code = encodeState({ text: "x", selections: {}, reference: { style: "s".repeat(20000), rules: "r" } });
  assert.equal(decodeState(code).reference.style.length, MAX_REFERENCE);
});

test("the style leaves the materials to the subject and keywords", () => {
  assert.doesNotMatch(STYLE, /Materials:|iron|brass|graveyard stone/i);
});
