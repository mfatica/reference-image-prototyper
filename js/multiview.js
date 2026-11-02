// A 2 by 2 turnaround (front, back / left, right) made from one result image, and cutting it into its four views.
// The wording follows the tower lab's multi-view prompt; the lighting line keeps the front's look instead of forcing
// flat light, so it agrees with whatever the Lighting dropdown chose.

export const VIEW_ORDER = ["front", "back", "left", "right"];

export const MULTIVIEW_SIZE = "1024x1536"; // cells taller than wide, for towers

export const MULTIVIEW_PROMPT = `Use the attached image as the front view. Make a grid of equal cells, 2 across and 2 down, showing four views of this exact same object, as an orthographic turnaround for 3D modelling:
- top row: front (the attached image, unchanged), back
- bottom row: left side, right side

Make all four views:
- of the same object, with the same parts, materials, colours and glow, consistent from every side;
- at the same scale, each centred in its cell with empty space around it, all standing on the same ground line;
- straight on, with no perspective;
- with the same lighting and shading as the front view, and no cast shadows.

Use a fully transparent background with no grid lines, borders, labels, text or shadows.`;

// The model rarely centres each view in its half of the grid (2026-11-02: the bottom row's horns reached 45 px above
// half height), so the grid is cut along the empty gaps between the views, not at the halves.
export const CUT_VERSION = 2; // multiviews saved with an older cut are cut again from their grid
const OPAQUE = 128;           // alpha at or above this is part of a view; glow haze is fainter
const SPECK = 2;              // a row or column with this few opaque pixels still counts as part of a gap
const SOFT_EDGE = 6;          // px kept around a view's outline, so its soft edges survive the trim
const VIEW_MARGIN = 0.03;     // empty border under and beside each view, as a share of the tallest cell

/** Where to cut a strip of per-row (or per-column) opaque counts: the middle of the empty run nearest the middle.
 *  Only the middle half is searched, so the outer margins and gaps inside one view don't count; with no gap there,
 *  the middle. */
export function gutterCut(counts) {
  const n = counts.length;
  let best = null;
  for (let i = 0; i < n; ) {
    if (counts[i] > SPECK) {
      i++;
      continue;
    }
    const start = i;
    while (i < n && counts[i] <= SPECK) i++;
    const cut = Math.floor((start + i) / 2);
    const inside = start > 0 && i < n && cut >= n / 4 && cut <= (3 * n) / 4;
    if (inside && (best === null || Math.abs(cut - n / 2) < Math.abs(best - n / 2))) best = cut;
  }
  return best ?? Math.floor(n / 2);
}

/** Opaque pixels per row (byRow) or per column of a rectangle of an RGBA image {width, height, data}. */
function opaqueCounts(img, x0, y0, w, h, byRow) {
  const counts = new Array(byRow ? h : w).fill(0);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (img.data[((y0 + y) * img.width + x0 + x) * 4 + 3] >= OPAQUE) counts[byRow ? y : x]++;
  return counts;
}

/** The grid's four cells, keyed by view: cut between the rows, then each row between its two views. */
export function viewCells(img) {
  const { width: W, height: H } = img;
  const row = gutterCut(opaqueCounts(img, 0, 0, W, H, true));
  const top = gutterCut(opaqueCounts(img, 0, 0, W, row, false));
  const bottom = gutterCut(opaqueCounts(img, 0, row, W, H - row, false));
  return {
    front: { x: 0, y: 0, w: top, h: row },
    back: { x: top, y: 0, w: W - top, h: row },
    left: { x: 0, y: row, w: bottom, h: H - row },
    right: { x: bottom, y: row, w: W - bottom, h: H - row },
  };
}

/** The opaque part of a cell grown by `pad` px and kept inside the cell, or null when the cell is empty. */
export function objectBox(img, cell, pad = SOFT_EDGE) {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = cell.y; y < cell.y + cell.h; y++)
    for (let x = cell.x; x < cell.x + cell.w; x++)
      if (img.data[(y * img.width + x) * 4 + 3] >= OPAQUE) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  if (x1 < 0) return null;
  x0 = Math.max(cell.x, x0 - pad);
  y0 = Math.max(cell.y, y0 - pad);
  x1 = Math.min(cell.x + cell.w - 1, x1 + pad);
  y1 = Math.min(cell.y + cell.h - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** One canvas size for all four views (the biggest cell, grown to fit any view with its margin) and where each view
 *  goes on it: centred across, standing on one ground line `margin` px above the bottom. Nothing is scaled. */
export function placeViews(boxes, cells, margin) {
  let width = 0, height = 0;
  for (const view of VIEW_ORDER) {
    width = Math.max(width, cells[view].w, boxes[view].w + 2 * margin);
    height = Math.max(height, cells[view].h, boxes[view].h + 2 * margin);
  }
  const at = {};
  for (const view of VIEW_ORDER)
    at[view] = { x: Math.round((width - boxes[view].w) / 2), y: height - margin - boxes[view].h };
  return { width, height, at };
}

/** Cuts a grid image into {front, back, left, right} PNG blobs (browser only: uses a canvas). */
export async function splitGrid(gridBlob) {
  const bitmap = await createImageBitmap(gridBlob);
  try {
    const source = document.createElement("canvas");
    source.width = bitmap.width;
    source.height = bitmap.height;
    const ctx = source.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0);
    const img = ctx.getImageData(0, 0, bitmap.width, bitmap.height);

    const cells = viewCells(img);
    const boxes = {};
    for (const view of VIEW_ORDER) {
      boxes[view] = objectBox(img, cells[view]);
      if (!boxes[view]) throw new Error(`The grid's ${view} view is empty.`);
    }
    const margin = Math.round(VIEW_MARGIN * Math.max(...VIEW_ORDER.map((view) => cells[view].h)));
    const { width, height, at } = placeViews(boxes, cells, margin);

    const views = {};
    for (const view of VIEW_ORDER) {
      const b = boxes[view];
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(bitmap, b.x, b.y, b.w, b.h, at[view].x, at[view].y, b.w, b.h);
      views[view] = await new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(`Could not cut the ${view} view out of the grid.`))), "image/png"));
    }
    return views;
  } finally {
    bitmap.close();
  }
}
