// This browser's history of generations (IndexedDB, so the PNGs fit). Falls back to memory when IndexedDB is blocked.

const DB_NAME = "ref-prototyper";
const STORE = "generations";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function run(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = work(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}

export async function openHistory() {
  let db = null;
  try {
    db = await openDb();
  } catch (err) {
    console.warn("History is kept in memory only: IndexedDB is unavailable.", err);
  }
  const memory = new Map();
  return {
    persistent: Boolean(db),
    async list() {
      const all = db ? await run(db, "readonly", (s) => s.getAll()) : [...memory.values()];
      return all.sort((a, b) => b.createdAt - a.createdAt);
    },
    async get(id) {
      return db ? run(db, "readonly", (s) => s.get(id)) : memory.get(id);
    },
    async add(entry) {
      if (db) await run(db, "readwrite", (s) => s.put(entry));
      else memory.set(entry.id, entry);
    },
    async remove(id) {
      if (db) await run(db, "readwrite", (s) => s.delete(id));
      else memory.delete(id);
    },
  };
}
