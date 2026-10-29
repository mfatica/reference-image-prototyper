// OpenAI image generation, straight from the browser with the viewer's own key.

const ENDPOINT = "https://api.openai.com/v1/images/generations";

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
    url: ENDPOINT,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  };
}

function base64ToBlob(b64, type) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

/** Generates settings.n images; resolves to PNG blobs. Errors carry OpenAI's own message. */
export async function generateImages({ apiKey, settings, prompt, signal }) {
  if (!apiKey) throw new Error("No API key: add yours in Settings.");
  if (!prompt || !prompt.trim()) throw new Error("The prompt is empty: pick a keyword or write something.");
  const { url, init } = buildRequest(apiKey, settings, prompt);
  const res = await fetch(url, { ...init, signal });
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
