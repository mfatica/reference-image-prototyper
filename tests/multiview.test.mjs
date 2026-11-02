import { test } from "node:test";
import assert from "node:assert/strict";
import { MULTIVIEW_PROMPT, VIEW_ORDER, gutterCut, viewCells, objectBox, placeViews } from "../js/multiview.js";
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

test("viewCells of a grid with no gaps cut at the halves and cover every pixel", () => {
  const cells = viewCells(image(101, 151, [[0, 0, 101, 151]]));
  assert.deepEqual(cells.front, { x: 0, y: 0, w: 50, h: 75 });
  assert.equal(cells.back.x + cells.back.w, 101);
  assert.equal(cells.right.x + cells.right.w, 101);
  assert.equal(cells.left.y + cells.left.h, 151);
});

/** A transparent RGBA image with opaque rectangles [x, y, w, h]. */
function image(width, height, rects) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x0, y0, w, h] of rects)
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) data[(y * width + x) * 4 + 3] = 255;
  return { width, height, data };
}

test("gutterCut cuts in the middle of the empty run nearest the middle", () => {
  const counts = Array(100).fill(5);
  counts.fill(0, 30, 35);
  counts.fill(0, 60, 71);
  assert.equal(gutterCut(counts), 65);
});

test("gutterCut ignores the outer margins and falls back to the middle without a gap", () => {
  const counts = Array(100).fill(5);
  counts.fill(0, 0, 6);
  counts.fill(0, 94, 100);
  assert.equal(gutterCut(counts), 50);
});

test("gutterCut ignores a gap far from the middle, such as one inside a view", () => {
  const counts = Array(100).fill(5);
  counts.fill(0, 10, 16);
  assert.equal(gutterCut(counts), 50);
});

test("gutterCut sees through a stray speck in the gap", () => {
  const counts = Array(100).fill(5);
  counts.fill(0, 60, 71);
  counts[64] = 1;
  assert.equal(gutterCut(counts), 65);
});

test("viewCells cut along the gap between the rows, not at half height", () => {
  // Top views end at y 59, bottom views start at y 70: half height (75) would cut the bottom row's tops off.
  const img = image(100, 150, [[10, 5, 30, 55], [60, 5, 30, 55], [10, 70, 30, 70], [60, 70, 30, 70]]);
  const cells = viewCells(img);
  assert.equal(cells.front.y + cells.front.h, 65);
  assert.equal(cells.left.y, 65);
  assert.equal(cells.left.h, 85);
});

test("viewCells cut each row along its own column gap", () => {
  const img = image(100, 150, [[5, 5, 30, 55], [45, 5, 50, 55], [5, 80, 55, 60], [70, 80, 25, 60]]);
  const cells = viewCells(img);
  assert.equal(cells.back.x, 40);
  assert.equal(cells.right.x, 65);
  assert.equal(cells.left.w, 65);
  assert.equal(cells.right.w, 35);
});

test("objectBox is the opaque area grown by a few pixels, kept inside the cell", () => {
  const img = image(100, 100, [[10, 20, 30, 40]]);
  assert.deepEqual(objectBox(img, { x: 0, y: 0, w: 50, h: 50 }, 4), { x: 6, y: 16, w: 38, h: 34 });
});

test("objectBox of an empty cell is null", () => {
  const img = image(100, 100, [[10, 20, 30, 40]]);
  assert.equal(objectBox(img, { x: 60, y: 60, w: 40, h: 40 }), null);
});

test("placeViews puts every view on one canvas size, centred and standing on one ground line", () => {
  const cells = { front: { w: 50, h: 70 }, back: { w: 50, h: 70 }, left: { w: 50, h: 80 }, right: { w: 50, h: 80 } };
  const boxes = { front: { w: 20, h: 40 }, back: { w: 30, h: 40 }, left: { w: 20, h: 50 }, right: { w: 10, h: 50 } };
  const { width, height, at } = placeViews(boxes, cells, 5);
  assert.deepEqual([width, height], [50, 80]);
  assert.deepEqual(at.front, { x: 15, y: 35 });
  assert.deepEqual(at.left, { x: 15, y: 25 });
  for (const view of VIEW_ORDER) assert.equal(at[view].y + boxes[view].h, 80 - 5, view);
});

test("placeViews grows the canvas for a view bigger than the cells, keeping one scale", () => {
  const cells = { front: { w: 50, h: 70 }, back: { w: 50, h: 70 }, left: { w: 50, h: 70 }, right: { w: 50, h: 70 } };
  const boxes = { front: { w: 60, h: 40 }, back: { w: 20, h: 40 }, left: { w: 20, h: 40 }, right: { w: 20, h: 40 } };
  const { width, at } = placeViews(boxes, cells, 5);
  assert.equal(width, 70);
  assert.equal(at.front.x, 5);
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
