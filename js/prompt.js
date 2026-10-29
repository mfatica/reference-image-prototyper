// The style categories (from the "3D Style Elements Reference" sheet), the prompt they compose, and share codes.

export const CATEGORIES = [
  { id: "shape", label: "Shape language", hint: "Overall form and silhouette",
    options: ["Chunky", "Angular", "Rounded", "Exaggerated", "Organic", "Geometric", "Sharp", "Blocky"] },
  { id: "surface", label: "Surface detail", hint: "Amount and type of surface detail",
    options: ["Smooth", "Weathered", "Rough", "Sculpted", "Intricate", "Minimal", "Textured", "Carved"] },
  { id: "shading", label: "Shading", hint: "How light and shadow are rendered",
    options: ["Flat-shaded", "Soft-shaded", "Smooth-shaded", "Painterly", "Cel-shaded", "High contrast", "Realistic shading", "Emissive glow"] },
  { id: "texture", label: "Texture style", hint: "How materials and textures look",
    options: ["Hand-painted", "Procedural", "Photorealistic", "Untextured (clay)", "Gradient-based", "Stylized texture", "Tileable texture", "Custom painted"] },
  { id: "lighting", label: "Lighting", hint: "Scene and lighting environment",
    options: ["Soft ambient", "Dramatic", "Diffuse", "Studio lighting", "Cinematic", "High contrast", "Warm rim light", "Cold atmosphere"] },
  { id: "complexity", label: "Visual complexity", hint: "Overall detail level",
    options: ["Minimalist", "Simplified", "Medium-detail", "Highly detailed", "Ornate", "Cluttered", "Clean", "Rich detail"] },
  { id: "proportions", label: "Proportions", hint: "Relative size and form",
    options: ["Realistic", "Exaggerated", "Heroic", "Oversized", "Squat", "Compact", "Tall / Vertical", "Wide"] },
  { id: "material", label: "Material finish", hint: "Surface material look",
    options: ["Matte", "Glossy", "Metallic", "Rough", "Polished", "Weathered", "Icy / Translucent", "Mixed materials"] },
];

export const MAX_TEXT = 4000;

// The reference rules switch adds two blocks around the subject: STYLE before it and REFERENCE_RULES after it.

export const STYLE = `Stylized dark-fantasy 3D game asset in the general style of Warcraft and Diablo, with a classic gothic fantasy feel. Chunky, readable shapes with exaggerated proportions and a strong, recognizable silhouette; compact, sturdy construction for a top-down tower defense game. Hand-painted textures: weathered dark grey graveyard stone; dark grey aged iron; bright aged brass trim along rims, bands and edges, clearly lighter than the stone. One supernatural glow: a large glowing area on an upward-facing part, painted in a single solid saturated colour, with no light spilling onto the surrounding surfaces.

Show exactly one complete tower standing upright on its own small integrated stone base, with clear separation between all parts and sharp details.`;

export const REFERENCE_RULES = `This is a single-object modeling reference, not concept art or a scene illustration. Geometry must be physically plausible, with clearly defined solid forms and distinct components that could be reconstructed as a 3D mesh. Avoid excessive surface detail, thin floating decorations, transparent materials, particle effects, dramatic perspective, and cinematic lighting. No characters, no text, no labels, no watermarks.

Image requirements (for turning the image into a 3D model):
- One object only, shown whole and centred, with a small empty margin on every side; nothing cut off by the frame.
- Fully transparent background, saved as a PNG. No ground, floor, shadow, scenery, text, border or watermark.
- Straight-on front view at eye level: the object faces the camera squarely, the camera level with its middle, not looking down from above or turned to one side. Little perspective, as if shot with a long lens.
- Flat, even lighting: no cast shadows, no strong highlights, no rim light, no fog or glow haze around the object.
- Glowing parts in one solid, saturated colour that appears nowhere else on the object.
- Square image, at least 1024 x 1024 pixels.`;

export const DEFAULT_PIECES = { rules: true };

const BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

/** Only the selections that name a known category and one of its options. */
function cleanSelections(selections) {
  const clean = {};
  for (const [id, option] of Object.entries(selections || {})) {
    const category = BY_ID.get(id);
    if (category && category.options.includes(option)) clean[id] = option;
  }
  return clean;
}

/**
 * The prompt: [style] [subject] [keywords] [reference rules], blocks separated by a blank line; style and rules only
 * with the rules switch on, and then the text is labelled "Subject:".
 * Empty when there is neither text nor a keyword: the rules alone describe nothing.
 */
export function composePrompt(selections, text, pieces = {}) {
  const clean = cleanSelections(selections);
  const lines = CATEGORIES.filter((c) => clean[c.id]).map((c) => `${c.label}: ${clean[c.id].toLowerCase()}.`);
  const body = (text || "").trim();
  if (!body && !lines.length) return "";
  const parts = [];
  if (pieces.rules) parts.push(STYLE);
  if (body) parts.push(pieces.rules ? `Subject: ${body}` : body);
  if (lines.length) parts.push(lines.join("\n"));
  if (pieces.rules) parts.push(REFERENCE_RULES);
  return parts.join("\n\n");
}

function cleanPieces(raw) {
  const pieces = { ...DEFAULT_PIECES };
  for (const key of Object.keys(DEFAULT_PIECES)) if (raw && typeof raw[key] === "boolean") pieces[key] = raw[key];
  return pieces;
}

function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code) {
  const binary = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(binary, (ch) => ch.charCodeAt(0)));
}

/** A URL-safe code for the form: {text, selections, pieces}. */
export function encodeState({ text, selections, pieces }) {
  return toBase64Url(JSON.stringify({ t: text || "", k: cleanSelections(selections), p: cleanPieces(pieces) }));
}

/** The form from a share code, cleaned (missing switches get the defaults, unknown ones are dropped); null when damaged. */
export function decodeState(code) {
  if (!code) return null;
  try {
    const raw = JSON.parse(fromBase64Url(code));
    const text = typeof raw.t === "string" ? raw.t.slice(0, MAX_TEXT) : "";
    return { text, selections: cleanSelections(raw.k), pieces: cleanPieces(raw.p) };
  } catch {
    return null;
  }
}

/** The form to open with: a share link's code first, then the form this browser saved, else an empty form. */
export function startState(sharedCode, savedCode) {
  return decodeState(sharedCode) || decodeState(savedCode) || { text: "", selections: {}, pieces: { ...DEFAULT_PIECES } };
}
