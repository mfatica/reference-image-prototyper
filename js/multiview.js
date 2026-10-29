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

/** The four cells of a width x height grid, keyed by view; together they cover every pixel. */
export function quadrants(width, height) {
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);
  return {
    front: { x: 0, y: 0, w, h },
    back: { x: w, y: 0, w: width - w, h },
    left: { x: 0, y: h, w, h: height - h },
    right: { x: w, y: h, w: width - w, h: height - h },
  };
}

/** Cuts a grid image into {front, back, left, right} PNG blobs (browser only: uses a canvas). */
export async function splitGrid(gridBlob) {
  const bitmap = await createImageBitmap(gridBlob);
  try {
    const views = {};
    for (const [view, r] of Object.entries(quadrants(bitmap.width, bitmap.height))) {
      const canvas = document.createElement("canvas");
      canvas.width = r.w;
      canvas.height = r.h;
      canvas.getContext("2d").drawImage(bitmap, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      views[view] = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error(`Could not cut the ${view} view out of the grid.`))), "image/png"));
    }
    return views;
  } finally {
    bitmap.close();
  }
}
