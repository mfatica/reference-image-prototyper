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

export const STYLE = `Dark-fantasy 3D game asset in the general style of Warcraft and Diablo, with a classic gothic fantasy feel, made for a top-down tower defense game and with a strong, recognizable silhouette. Materials: dark grey graveyard stone; dark grey iron; brass trim along rims, bands and edges, clearly lighter than the stone. One supernatural glow: a large glowing area on an upward-facing part, painted in a single solid saturated colour, with no light spilling onto the surrounding surfaces.

Show exactly one complete tower standing upright on its own small integrated stone base, with clear separation between all parts.`;

// Shape, surface detail, shading, texture, lighting, complexity, proportions and material finish are left to the
// dropdowns, and image size and background colour to the options, so nothing here contradicts a choice.
export const REFERENCE_RULES = `This is a single-object modeling reference, not concept art or a scene illustration. Geometry must be physically plausible, with clearly defined solid forms and distinct components that could be reconstructed as a 3D mesh. Avoid thin floating decorations and particle effects. No characters, no text, no labels, no watermarks.

Image requirements (for turning the image into a 3D model):
- One object only, shown whole and centred, with a small empty margin on every side; nothing cut off by the frame.
- Plain empty background: no ground, floor, shadow, scenery, text, border or watermark.
- Straight-on front view at eye level: the object faces the camera squarely, the camera level with its middle, not looking down from above or turned to one side. Little perspective, as if shot with a long lens.
- Glowing parts in one solid, saturated colour that appears nowhere else on the object.`;

export const DEFAULT_PIECES = { rules: true };

/** The reference prompt's two parts as the editor shows them; a form's `reference: null` means these. */
export const DEFAULT_REFERENCE = { style: STYLE, rules: REFERENCE_RULES };
export const MAX_REFERENCE = 8000;

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
 * The prompt: [style] [subject] [keywords] [rules], blocks separated by a blank line; style and rules only with the
 * rules switch on, and then the text is labelled "Subject:". `reference` is an edited {style, rules}, or null for the
 * defaults; an emptied part is left out.
 * Empty when there is neither text nor a keyword: the rules alone describe nothing.
 */
export function composePrompt(selections, text, pieces = {}, reference = null) {
  const clean = cleanSelections(selections);
  const lines = CATEGORIES.filter((c) => clean[c.id]).map((c) => `${c.label}: ${clean[c.id].toLowerCase()}.`);
  const body = (text || "").trim();
  if (!body && !lines.length) return "";
  const { style, rules } = reference || DEFAULT_REFERENCE;
  const parts = [];
  if (pieces.rules && style.trim()) parts.push(style.trim());
  if (body) parts.push(pieces.rules ? `Subject: ${body}` : body);
  if (lines.length) parts.push(lines.join("\n"));
  if (pieces.rules && rules.trim()) parts.push(rules.trim());
  return parts.join("\n\n");
}

function cleanPieces(raw) {
  const pieces = { ...DEFAULT_PIECES };
  for (const key of Object.keys(DEFAULT_PIECES)) if (raw && typeof raw[key] === "boolean") pieces[key] = raw[key];
  return pieces;
}

/** An edited reference prompt, or null when it is missing, damaged or the same as the default. */
export function cleanReference(raw) {
  if (!raw || typeof raw.style !== "string" || typeof raw.rules !== "string") return null;
  const reference = { style: raw.style.slice(0, MAX_REFERENCE), rules: raw.rules.slice(0, MAX_REFERENCE) };
  const isDefault = reference.style === DEFAULT_REFERENCE.style && reference.rules === DEFAULT_REFERENCE.rules;
  return isDefault ? null : reference;
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

/** A URL-safe code for the form: {text, selections, pieces, reference}; a default reference prompt is left out. */
export function encodeState({ text, selections, pieces, reference }) {
  const raw = { t: text || "", k: cleanSelections(selections), p: cleanPieces(pieces) };
  const edited = cleanReference(reference);
  if (edited) raw.r = { s: edited.style, r: edited.rules };
  return toBase64Url(JSON.stringify(raw));
}

/** The form from a share code, cleaned (missing switches get the defaults, unknown ones are dropped); null when damaged. */
export function decodeState(code) {
  if (!code) return null;
  try {
    const raw = JSON.parse(fromBase64Url(code));
    const text = typeof raw.t === "string" ? raw.t.slice(0, MAX_TEXT) : "";
    const reference = raw.r ? cleanReference({ style: raw.r.s, rules: raw.r.r }) : null;
    return { text, selections: cleanSelections(raw.k), pieces: cleanPieces(raw.p), reference };
  } catch {
    return null;
  }
}

/** The form to open with: a share link's code first, then the form this browser saved, else an empty form. */
export function startState(sharedCode, savedCode) {
  return decodeState(sharedCode) || decodeState(savedCode) || { text: "", selections: {}, pieces: { ...DEFAULT_PIECES }, reference: null };
}
