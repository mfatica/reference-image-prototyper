// OpenAI image generation and editing, straight from the browser with the viewer's own key.

const GENERATE_ENDPOINT = "https://api.openai.com/v1/images/generations";
const EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";

export function buildRequest(apiKey, settings, prompt) {
  const body = {
    model: settings.model,
    prompt,
    size: settings.size,
    quality: settings.quality,
    n: settings.n,
    background: settings.background,
    output_format: "png",
  };
  return {
    url: GENERATE_ENDPOINT,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  };
}

/** Multipart form for /images/edits; no Content-Type header, so fetch adds the boundary. */
export function buildEditRequest(apiKey, settings, prompt, images) {
  const form = new FormData();
  form.append("model", settings.model);
  form.append("prompt", prompt);
  form.append("size", settings.size);
  form.append("quality", settings.quality);
  form.append("n", String(settings.n));
  form.append("background", settings.background);
  form.append("output_format", "png");
  images.forEach((blob, i) => form.append("image[]", blob, `image-${i + 1}.png`));
  return { url: EDIT_ENDPOINT, init: { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form } };
}

function base64ToBlob(b64, type) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** The reply's images as PNG blobs; errors carry OpenAI's own message. */
async function readImages(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail = body && body.error && body.error.message ? body.error.message : res.statusText || "request failed";
    throw new Error(`OpenAI (${res.status}): ${detail}`);
  }
  const images = (body && body.data) || [];
  if (!images.length) throw new Error("OpenAI returned no images.");
  return images.map((d) => base64ToBlob(d.b64_json, "image/png"));
}

/** Generates settings.n images from the prompt; resolves to PNG blobs. */
export async function generateImages({ apiKey, settings, prompt, signal }) {
  if (!apiKey) throw new Error("No API key: add yours in Settings.");
  if (!prompt || !prompt.trim()) throw new Error("The prompt is empty: pick a keyword or write something.");
  const { url, init } = buildRequest(apiKey, settings, prompt);
  return readImages(await fetch(url, { ...init, signal }));
}

/** Makes settings.n images from the prompt and the input images; resolves to PNG blobs. */
export async function editImages({ apiKey, settings, prompt, images, signal }) {
  if (!apiKey) throw new Error("No API key: add yours in Settings.");
  if (!images || !images.length) throw new Error("No image to work from.");
  const { url, init } = buildEditRequest(apiKey, settings, prompt, images);
  return readImages(await fetch(url, { ...init, signal }));
}
