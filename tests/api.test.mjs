import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEditRequest, buildRequest, generateImages } from "../js/api.js";

const settings = { model: "gpt-image-test", size: "1024x1024", quality: "high", n: 2, background: "auto" };

test("the request body carries the prompt and the settings", () => {
  const { url, init } = buildRequest("sk-test", settings, "an ice tower");
  assert.equal(url, "https://api.openai.com/v1/images/generations");
  assert.equal(init.headers.Authorization, "Bearer sk-test");
  assert.deepEqual(JSON.parse(init.body), {
    model: "gpt-image-test", prompt: "an ice tower", size: "1024x1024", quality: "high", n: 2,
    background: "auto", output_format: "png",
  });
});

test("a missing key or prompt fails before any request", async () => {
  await assert.rejects(generateImages({ apiKey: "", settings, prompt: "x" }), /API key/);
  await assert.rejects(generateImages({ apiKey: "sk-test", settings, prompt: " " }), /prompt/);
});

test("images come back as PNG blobs", async (t) => {
  const png = Buffer.from("fake png").toString("base64");
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ data: [{ b64_json: png }, { b64_json: png }] }), { status: 200 }));
  const blobs = await generateImages({ apiKey: "sk-test", settings, prompt: "x" });
  assert.equal(blobs.length, 2);
  assert.equal(blobs[0].type, "image/png");
  assert.equal(await blobs[0].text(), "fake png");
});

test("OpenAI's own error message is passed on", async (t) => {
  const body = { error: { message: "Your organization must be verified." } };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(body), { status: 403 }));
  await assert.rejects(generateImages({ apiKey: "sk-test", settings, prompt: "x" }), /OpenAI \(403\): Your organization must be verified\./);
});

test("an error without a JSON body still names the status", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("gateway down", { status: 502 }));
  await assert.rejects(generateImages({ apiKey: "sk-test", settings, prompt: "x" }), /OpenAI \(502\)/);
});

test("a reply without images is an error", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
  await assert.rejects(generateImages({ apiKey: "sk-test", settings, prompt: "x" }), /no images/);
});

test("an edit request sends every image with a file name matching its type", async () => {
  const images = [new Blob(["a"], { type: "image/png" }), new Blob(["b"], { type: "image/jpeg" }), new Blob(["c"], { type: "image/webp" })];
  const { url, init } = buildEditRequest("sk-test", settings, "follow it", images);
  assert.equal(url, "https://api.openai.com/v1/images/edits");
  const files = init.body.getAll("image[]");
  assert.deepEqual(files.map((f) => f.name), ["image-1.png", "image-2.jpg", "image-3.webp"]);
  assert.equal(init.body.get("prompt"), "follow it");
  assert.equal(init.headers["Content-Type"], undefined);
});
