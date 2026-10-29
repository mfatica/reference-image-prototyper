import { test } from "node:test";
import assert from "node:assert/strict";
import { MULTIVIEW_PROMPT, VIEW_ORDER, quadrants } from "../js/multiview.js";
import { buildEditRequest, editImages } from "../js/api.js";

const settings = { model: "gpt-image-edit-test", size: "1024x1536", quality: "high", n: 1, background: "transparent" };

test("the views are front, back, left and right, in the grid's reading order", () => {
  assert.deepEqual(VIEW_ORDER, ["front", "back", "left", "right"]);
});

test("the prompt asks for that 2 by 2 layout with the attached image as the front", () => {
  assert.match(MULTIVIEW_PROMPT, /attached image as the front view/);
  assert.match(MULTIVIEW_PROMPT, /2 across and 2 down/);
  assert.match(MULTIVIEW_PROMPT, /top row: front \(the attached image, unchanged\), back/);
  assert.match(MULTIVIEW_PROMPT, /bottom row: left side, right side/);
});

test("the prompt keeps the front's lighting instead of forcing its own", () => {
  assert.match(MULTIVIEW_PROMPT, /same lighting and shading as the front view/);
  assert.doesNotMatch(MULTIVIEW_PROMPT, /flat, even lighting/i);
});

test("quadrants cut an even grid into four equal cells", () => {
  assert.deepEqual(quadrants(1024, 1536), {
    front: { x: 0, y: 0, w: 512, h: 768 },
    back: { x: 512, y: 0, w: 512, h: 768 },
    left: { x: 0, y: 768, w: 512, h: 768 },
    right: { x: 512, y: 768, w: 512, h: 768 },
  });
});

test("quadrants cover every pixel of an odd-sized grid", () => {
  const q = quadrants(1023, 1535);
  assert.equal(q.front.w + q.back.w, 1023);
  assert.equal(q.front.h + q.left.h, 1535);
  assert.equal(q.right.x + q.right.w, 1023);
  assert.equal(q.right.y + q.right.h, 1535);
});

test("the edit request sends the settings and the image as multipart form data", async () => {
  const image = new Blob(["png bytes"], { type: "image/png" });
  const { url, init } = buildEditRequest("sk-test", settings, "make a grid", [image]);
  assert.equal(url, "https://api.openai.com/v1/images/edits");
  assert.equal(init.headers.Authorization, "Bearer sk-test");
  assert.equal(init.headers["Content-Type"], undefined, "fetch sets the multipart boundary itself");
  const form = init.body;
  assert.equal(form.get("model"), "gpt-image-edit-test");
  assert.equal(form.get("prompt"), "make a grid");
  assert.equal(form.get("size"), "1024x1536");
  assert.equal(form.get("quality"), "high");
  assert.equal(form.get("n"), "1");
  assert.equal(form.get("background"), "transparent");
  assert.equal(form.get("output_format"), "png");
  const sent = form.getAll("image[]");
  assert.equal(sent.length, 1);
  assert.equal(await sent[0].text(), "png bytes");
});

test("an edit returns PNG blobs", async (t) => {
  const png = Buffer.from("grid png").toString("base64");
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ data: [{ b64_json: png }] }), { status: 200 }));
  const [grid] = await editImages({ apiKey: "sk-test", settings, prompt: "x", images: [new Blob(["a"])] });
  assert.equal(grid.type, "image/png");
  assert.equal(await grid.text(), "grid png");
});

test("an edit passes on OpenAI's error message", async (t) => {
  const body = { error: { message: "Invalid image file." } };
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(body), { status: 400 }));
  await assert.rejects(editImages({ apiKey: "sk-test", settings, prompt: "x", images: [new Blob(["a"])] }),
    /OpenAI \(400\): Invalid image file\./);
});

test("an edit without a key or an image fails before any request", async () => {
  await assert.rejects(editImages({ apiKey: "", settings, prompt: "x", images: [new Blob(["a"])] }), /API key/);
  await assert.rejects(editImages({ apiKey: "sk-test", settings, prompt: "x", images: [] }), /image/);
});
