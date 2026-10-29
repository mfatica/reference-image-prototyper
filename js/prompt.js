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

/** The user's text first, then one "Category: keyword." line per chosen keyword, in category order. */
export function composePrompt(selections, text) {
  const clean = cleanSelections(selections);
  const lines = CATEGORIES.filter((c) => clean[c.id]).map((c) => `${c.label}: ${clean[c.id].toLowerCase()}.`);
  const parts = [];
  const body = (text || "").trim();
  if (body) parts.push(body);
  if (lines.length) parts.push(lines.join("\n"));
  return parts.join("\n\n");
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

/** A URL-safe code for the form: {text, selections}. */
export function encodeState({ text, selections }) {
  return toBase64Url(JSON.stringify({ t: text || "", k: cleanSelections(selections) }));
}

/** The form from a share code, cleaned; null when the code is damaged. */
export function decodeState(code) {
  if (!code) return null;
  try {
    const raw = JSON.parse(fromBase64Url(code));
    const text = typeof raw.t === "string" ? raw.t.slice(0, MAX_TEXT) : "";
    return { text, selections: cleanSelections(raw.k) };
  } catch {
    return null;
  }
}
