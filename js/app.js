import { CATEGORIES, DEFAULT_PIECES, DEFAULT_REFERENCE, cleanReference, composePrompt, encodeState, startState } from "./prompt.js";
import { editImages, generateImages } from "./api.js";
import { MULTIVIEW_PROMPT, MULTIVIEW_SIZE, VIEW_ORDER, splitGrid } from "./multiview.js";
import { openHistory } from "./store.js";

const DEFAULT_MODEL = "gpt-image-2.5-flare";
const DEFAULT_EDIT_MODEL = "gpt-image-2.5-sunburst"; // the tower lab's model for image edits (its multi-view grids)
const KEYS = { apiKey: "rp.apiKey", model: "rp.model", editModel: "rp.editModel", options: "rp.options.v2", form: "rp.form" };
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
const editModel = () => readLocal(KEYS.editModel, "") || DEFAULT_EDIT_MODEL;

// ---------------------------------------------------------------- form

let reference = null; // the edited reference prompt {style, rules}, or null for the default

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
  return { text: $("text").value, selections, pieces, reference };
}

function applyState(state) {
  for (const c of CATEGORIES) $(`cat-${c.id}`).value = state.selections[c.id] || "";
  $("text").value = state.text || "";
  const pieces = state.pieces || DEFAULT_PIECES; // history from before the pieces has none
  $("piece-rules").checked = pieces.rules;
  reference = state.reference || null;
  showReferenceState();
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
  const prompt = composePrompt(state.selections, state.text, state.pieces, state.reference);
  $("prompt-preview").textContent = prompt || "Pick a keyword or write a description.";
  $("prompt-preview").classList.toggle("empty", !prompt);
  if (!running) $("generate").disabled = !prompt;
  const code = encodeState(state);
  history.replaceState(null, "", `#s=${code}`);
  writeLocal(KEYS.form, code);
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
  const prompt = composePrompt(state.selections, state.text, state.pieces, state.reference);
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

const urls = new Map(); // "<entry id>/..." -> object URL

function blobUrl(key, blob) {
  if (!urls.has(key)) urls.set(key, URL.createObjectURL(blob));
  return urls.get(key);
}

function forgetUrls(prefix) {
  for (const [key, url] of urls) {
    if (key.startsWith(prefix)) {
      URL.revokeObjectURL(url);
      urls.delete(key);
    }
  }
}

function imageUrls(entry) {
  return entry.images.map((blob, i) => blobUrl(`${entry.id}/img/${i}`, blob));
}

// ---------------------------------------------------------------- multiview

const mvJobs = new Map(); // "<entry id>/<image index>" -> { started } while running, { error } after a failure

async function makeMultiview(entry, index) {
  const key = `${entry.id}/${index}`;
  if (mvJobs.get(key)?.started) return;
  if (!apiKey()) {
    openSettings();
    setStatus("Add your OpenAI API key first.", true);
    return;
  }
  mvJobs.set(key, { started: Date.now() });
  await renderResults();
  try {
    const settings = { model: editModel(), size: MULTIVIEW_SIZE, quality: formOptions().quality, n: 1, background: "transparent" };
    const [grid] = await editImages({ apiKey: apiKey(), settings, prompt: MULTIVIEW_PROMPT, images: [entry.images[index]] });
    const views = await splitGrid(grid);
    const latest = await store.get(entry.id); // re-read: another grid for this result may have finished meanwhile
    mvJobs.delete(key);
    if (latest) {
      const mv = { id: crypto.randomUUID(), imageIndex: index, createdAt: Date.now(), settings, grid, views };
      latest.multiviews = [...(latest.multiviews || []), mv];
      await store.add(latest);
      toast("Multiview ready");
    }
  } catch (err) {
    mvJobs.set(key, { error: err.message });
  }
  await renderResults();
}

function downloadAll(files) {
  files.forEach(([url, name], i) => setTimeout(() => el("a", { href: url, download: name }).click(), i * 250));
}

function multiviewSection(entry) {
  const box = el("div", { className: "multiviews" });
  entry.images.forEach((_, index) => {
    const job = mvJobs.get(`${entry.id}/${index}`);
    if (job && job.error) box.append(el("p", { className: "mv-error", textContent: `Multiview of image ${index + 1} failed: ${job.error}` }));
  });
  const list = [...(entry.multiviews || [])].sort((a, b) => b.createdAt - a.createdAt);
  for (const mv of list) {
    const base = `ref-${stamp(entry.createdAt)}-${mv.imageIndex + 1}`;
    const prefix = `${entry.id}/mv/${mv.id}`;
    const files = VIEW_ORDER.map((view) => [blobUrl(`${prefix}/${view}`, mv.views[view]), `${base}-${view}.png`]);
    const gridUrl = blobUrl(`${prefix}/grid`, mv.grid);

    const views = el("div", { className: "mv-views" });
    VIEW_ORDER.forEach((view, i) => {
      const [url, name] = files[i];
      views.append(el("figure", {},
        el("a", { href: url, target: "_blank", rel: "noopener", title: "Open full size" },
          el("img", { src: url, alt: `${view} view`, loading: "lazy" })),
        el("figcaption", {}, el("span", { textContent: view }),
          el("a", { href: url, download: name, textContent: "Download" }))));
    });

    const all = el("button", { type: "button", className: "ghost small", textContent: "Download all 4" });
    all.onclick = () => downloadAll(files);
    const grid = el("a", { className: "button-link", href: gridUrl, download: `${base}-grid.png`, textContent: "Grid" });
    const remove = el("button", { type: "button", className: "ghost small danger", textContent: "Remove" });
    remove.onclick = async () => {
      if (!window.confirm("Remove this multiview from this browser's history?")) return;
      const latest = await store.get(entry.id);
      if (latest) {
        latest.multiviews = (latest.multiviews || []).filter((m) => m.id !== mv.id);
        await store.add(latest);
      }
      forgetUrls(prefix);
      await renderResults();
    };
    const when = new Date(mv.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    box.append(el("section", { className: "mv" },
      el("div", { className: "mv-head" },
        el("span", { className: "mv-title", textContent: `Multiview of image ${mv.imageIndex + 1} · ${when} · ${mv.settings.quality}` }),
        el("div", { className: "mv-actions" }, all, grid, remove)),
      views));
  }
  return box.childElementCount ? box : null;
}

function card(entry) {
  const list = imageUrls(entry);
  const imgs = el("div", { className: `imgs n${list.length}` });
  list.forEach((url, i) => {
    const name = `ref-${stamp(entry.createdAt)}-${i + 1}.png`;
    const job = mvJobs.get(`${entry.id}/${i}`);
    const mvButton = el("button", { type: "button", className: "tool", textContent: "Multiview" });
    if (job && job.started) {
      mvButton.disabled = true;
      mvButton.dataset.started = String(job.started);
      mvButton.textContent = "Making grid…";
    }
    mvButton.onclick = () => makeMultiview(entry, i);
    imgs.append(el("figure", {},
      el("a", { href: url, target: "_blank", rel: "noopener", title: "Open full size" },
        el("img", { src: url, alt: `Generated image ${i + 1}`, loading: "lazy" })),
      el("div", { className: "img-tools" }, mvButton,
        el("a", { className: "tool", href: url, download: name, textContent: "Download" }))));
  });

  const chips = el("div", { className: "chips" });
  for (const c of CATEGORIES) {
    const value = entry.state.selections[c.id];
    if (value) chips.append(el("span", { className: "chip", title: c.label, textContent: value }));
  }
  const used = entry.state.pieces || { rules: false };
  if (used.rules) {
    const label = entry.state.reference ? "Reference rules (edited)" : "Reference rules";
    chips.append(el("span", { className: "chip piece", textContent: label }));
  }
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
    forgetUrls(`${entry.id}/`);
    await renderResults();
  };

  return el("article", { className: "card" }, imgs, multiviewSection(entry),
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

// ---------------------------------------------------------------- reference prompt

function showReferenceState() {
  $("reference-state").textContent = reference ? "Edited" : "Default";
  $("reset-reference").disabled = !reference;
}

function openReferenceEditor() {
  const current = reference || DEFAULT_REFERENCE;
  $("ref-style").value = current.style;
  $("ref-rules").value = current.rules;
  $("reference-dialog").showModal();
}

function onReferenceEditorClose() {
  if ($("reference-dialog").returnValue !== "save") return;
  reference = cleanReference({ style: $("ref-style").value, rules: $("ref-rules").value });
  showReferenceState();
  onFormChange();
  toast(reference ? "Reference prompt saved" : "Reference prompt is the default");
}

function resetReference() {
  if (!window.confirm("Put the default reference prompt back? Your edits will be lost.")) return;
  reference = null;
  showReferenceState();
  onFormChange();
  toast("Default reference prompt restored");
}

// ---------------------------------------------------------------- settings dialog

function openSettings() {
  $("api-key").value = apiKey();
  $("model").value = model();
  $("edit-model").value = editModel();
  $("settings").showModal();
}

function onSettingsClose() {
  if ($("settings").returnValue !== "save") return;
  const key = $("api-key").value.trim();
  if (!writeLocal(KEYS.apiKey, key)) sessionKey = key;
  const m = $("model").value.trim();
  writeLocal(KEYS.model, m && m !== DEFAULT_MODEL ? m : "");
  const em = $("edit-model").value.trim();
  writeLocal(KEYS.editModel, em && em !== DEFAULT_EDIT_MODEL ? em : "");
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
  applyState(startState(new URLSearchParams(location.hash.slice(1)).get("s"), readLocal(KEYS.form, "")));

  $("form").addEventListener("input", onFormChange);
  $("form").addEventListener("change", () => writeLocal(KEYS.options, JSON.stringify(formOptions())));
  $("form").addEventListener("submit", onGenerate);
  $("reset").onclick = () => applyState({ text: "", selections: {}, pieces: DEFAULT_PIECES });
  $("copy-link").onclick = () => copy(shareUrl(formState()), "Link");
  $("open-settings").onclick = openSettings;
  $("edit-reference").onclick = openReferenceEditor;
  $("reset-reference").onclick = resetReference;
  $("reference-dialog").addEventListener("close", onReferenceEditorClose);
  $("settings").addEventListener("close", onSettingsClose);
  setInterval(() => {
    for (const button of document.querySelectorAll("button[data-started]")) {
      button.textContent = `Making grid · ${Math.round((Date.now() - Number(button.dataset.started)) / 1000)} s`;
    }
  }, 1000);
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
