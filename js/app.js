import { CATEGORIES, DEFAULT_PIECES, composePrompt, decodeState, encodeState } from "./prompt.js";
import { generateImages } from "./api.js";
import { openHistory } from "./store.js";

const DEFAULT_MODEL = "gpt-image-2.5-flare";
const KEYS = { apiKey: "rp.apiKey", model: "rp.model", options: "rp.options.v2" };
const OPTION_IDS = ["size", "quality", "n", "background"];

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const child of children) if (child != null) node.append(child);
  return node;
};

// ---------------------------------------------------------------- local settings

function readLocal(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeLocal(key, value) {
  try {
    if (value == null || value === "") localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

let sessionKey = ""; // used when localStorage is blocked
const apiKey = () => readLocal(KEYS.apiKey, "") || sessionKey;
const model = () => readLocal(KEYS.model, "") || DEFAULT_MODEL;

// ---------------------------------------------------------------- form

function buildCategories() {
  const box = $("categories");
  for (const c of CATEGORIES) {
    const select = el("select", { id: `cat-${c.id}`, name: c.id });
    select.append(el("option", { value: "", textContent: "Any" }));
    for (const option of c.options) select.append(el("option", { value: option, textContent: option }));
    box.append(el("label", { className: "field" },
      el("span", { className: "label", textContent: c.label }),
      el("span", { className: "hint", textContent: c.hint }),
      select));
  }
}

function formState() {
  const selections = {};
  for (const c of CATEGORIES) {
    const value = $(`cat-${c.id}`).value;
    if (value) selections[c.id] = value;
  }
  const pieces = { rules: $("piece-rules").checked };
  return { text: $("text").value, selections, pieces };
}

function applyState(state) {
  for (const c of CATEGORIES) $(`cat-${c.id}`).value = state.selections[c.id] || "";
  $("text").value = state.text || "";
  const pieces = state.pieces || DEFAULT_PIECES; // history from before the pieces has none
  $("piece-rules").checked = pieces.rules;
  onFormChange();
}

function formOptions() {
  return {
    size: $("size").value,
    quality: $("quality").value,
    n: Number($("n").value),
    background: $("background").value,
  };
}

function applyOptions(options) {
  for (const id of OPTION_IDS) {
    if (options[id] == null) continue;
    const select = $(id);
    const value = String(options[id]);
    if ([...select.options].some((o) => o.value === value)) select.value = value;
  }
}

function shareUrl(state) {
  return `${location.origin}${location.pathname}#s=${encodeState(state)}`;
}

function onFormChange() {
  const state = formState();
  const prompt = composePrompt(state.selections, state.text, state.pieces);
  $("prompt-preview").textContent = prompt || "Pick a keyword or write a description.";
  $("prompt-preview").classList.toggle("empty", !prompt);
  if (!running) $("generate").disabled = !prompt;
  history.replaceState(null, "", `#s=${encodeState(state)}`);
}

// ---------------------------------------------------------------- feedback

let toastTimer = 0;
function toast(message) {
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

async function copy(text, what) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    window.prompt(`Copy the ${what.toLowerCase()}:`, text);
  }
}

function setStatus(message, isError = false) {
  $("status").textContent = message;
  $("status").classList.toggle("error", isError);
}

// ---------------------------------------------------------------- generation

let running = null; // { controller, timer }
let store = null;

function stamp(ms) {
  const d = new Date(ms);
  const p = (v) => String(v).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function onGenerate(event) {
  event.preventDefault();
  if (running) {
    running.controller.abort();
    return;
  }
  if (!apiKey()) {
    openSettings();
    setStatus("Add your OpenAI API key first.", true);
    return;
  }
  const state = formState();
  const prompt = composePrompt(state.selections, state.text, state.pieces);
  if (!prompt) return;
  const options = formOptions();
  const settings = { ...options, model: model() };
  const controller = new AbortController();
  const started = Date.now();
  const label = `Generating ${options.n} image${options.n > 1 ? "s" : ""}`;
  const pending = el("div", { className: "card pending" }, el("div", { className: "spinner" }), el("span"));
  $("results").prepend(pending);
  const tick = () => {
    const text = `${label} · ${Math.round((Date.now() - started) / 1000)} s`;
    pending.lastChild.textContent = text;
    setStatus(text);
  };
  tick();
  running = { controller, timer: setInterval(tick, 1000) };
  $("generate").textContent = "Cancel";
  $("generate").classList.add("cancel");
  try {
    const images = await generateImages({ apiKey: apiKey(), settings, prompt, signal: controller.signal });
    const entry = { id: crypto.randomUUID(), createdAt: Date.now(), prompt, state, settings, images };
    await store.add(entry);
    setStatus(`Done in ${Math.round((Date.now() - started) / 1000)} s.`);
    await renderResults();
  } catch (err) {
    if (err.name === "AbortError") setStatus("Cancelled. (OpenAI may still bill a request that had already started.)");
    else setStatus(err.message, true);
  } finally {
    clearInterval(running.timer);
    running = null;
    pending.remove();
    $("generate").textContent = "Generate";
    $("generate").classList.remove("cancel");
    onFormChange();
  }
}

// ---------------------------------------------------------------- results

const urls = new Map(); // entry id -> object URLs

function imageUrls(entry) {
  if (!urls.has(entry.id)) urls.set(entry.id, entry.images.map((b) => URL.createObjectURL(b)));
  return urls.get(entry.id);
}

function card(entry) {
  const list = imageUrls(entry);
  const imgs = el("div", { className: `imgs n${list.length}` });
  list.forEach((url, i) => {
    const name = `ref-${stamp(entry.createdAt)}-${i + 1}.png`;
    imgs.append(el("figure", {},
      el("a", { href: url, target: "_blank", rel: "noopener", title: "Open full size" },
        el("img", { src: url, alt: `Generated image ${i + 1}`, loading: "lazy" })),
      el("a", { className: "dl", href: url, download: name, textContent: "Download" })));
  });

  const chips = el("div", { className: "chips" });
  for (const c of CATEGORIES) {
    const value = entry.state.selections[c.id];
    if (value) chips.append(el("span", { className: "chip", title: c.label, textContent: value }));
  }
  const used = entry.state.pieces || { rules: false };
  if (used.rules) chips.append(el("span", { className: "chip piece", textContent: "Reference rules" }));
  const s = entry.settings;
  const meta = el("p", { className: "meta",
    textContent: `${new Date(entry.createdAt).toLocaleString()} · ${s.size} · ${s.quality} · ${s.model}` });
  const text = entry.state.text.trim() ? el("p", { className: "text", textContent: entry.state.text.trim() }) : null;

  const use = el("button", { type: "button", className: "ghost", textContent: "Use these settings" });
  use.onclick = () => {
    applyState(entry.state);
    applyOptions(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Settings loaded");
  };
  const link = el("button", { type: "button", className: "ghost", textContent: "Copy link" });
  link.onclick = () => copy(shareUrl(entry.state), "Link");
  const prompt = el("button", { type: "button", className: "ghost", textContent: "Copy prompt" });
  prompt.onclick = () => copy(entry.prompt, "Prompt");
  const del = el("button", { type: "button", className: "ghost danger", textContent: "Delete" });
  del.onclick = async () => {
    if (!window.confirm("Delete these images from this browser's history?")) return;
    await store.remove(entry.id);
    (urls.get(entry.id) || []).forEach((u) => URL.revokeObjectURL(u));
    urls.delete(entry.id);
    await renderResults();
  };

  return el("article", { className: "card" }, imgs,
    el("div", { className: "info" }, meta, chips, text, el("div", { className: "card-actions" }, use, link, prompt, del)));
}

async function renderResults() {
  const entries = await store.list();
  const box = $("results");
  const pending = box.querySelector(".pending");
  box.replaceChildren(...(pending ? [pending] : []), ...entries.map(card));
  if (!entries.length && !pending) {
    box.append(el("p", { className: "empty", textContent: "Nothing yet. Generated images appear here and stay in this browser." }));
  }
}

// ---------------------------------------------------------------- settings dialog

function openSettings() {
  $("api-key").value = apiKey();
  $("model").value = model();
  $("settings").showModal();
}

function onSettingsClose() {
  if ($("settings").returnValue !== "save") return;
  const key = $("api-key").value.trim();
  if (!writeLocal(KEYS.apiKey, key)) sessionKey = key;
  const m = $("model").value.trim();
  writeLocal(KEYS.model, m && m !== DEFAULT_MODEL ? m : "");
  setStatus(key ? "" : "No API key saved.", !key);
  toast("Settings saved");
}

// ---------------------------------------------------------------- start

async function main() {
  buildCategories();
  try {
    applyOptions(JSON.parse(readLocal(KEYS.options, "{}")));
  } catch {
    /* keep the defaults */
  }
  const shared = decodeState(new URLSearchParams(location.hash.slice(1)).get("s"));
  applyState(shared || { text: "", selections: {}, pieces: DEFAULT_PIECES });

  $("form").addEventListener("input", onFormChange);
  $("form").addEventListener("change", () => writeLocal(KEYS.options, JSON.stringify(formOptions())));
  $("form").addEventListener("submit", onGenerate);
  $("reset").onclick = () => applyState({ text: "", selections: {}, pieces: DEFAULT_PIECES });
  $("copy-link").onclick = () => copy(shareUrl(formState()), "Link");
  $("open-settings").onclick = openSettings;
  $("settings").addEventListener("close", onSettingsClose);
  $("forget-key").onclick = () => {
    writeLocal(KEYS.apiKey, "");
    sessionKey = "";
    $("api-key").value = "";
    toast("Key removed from this browser");
  };

  store = await openHistory();
  $("history-note").textContent = store.persistent
    ? "Kept in this browser only. Download images or copy a link to share them."
    : "This browser blocks storage, so results disappear when you close the page. Download what you want to keep.";
  await renderResults();
  if (!apiKey()) setStatus("Add your OpenAI API key in Settings to start.");
}

main();
