import { DB_NAME, DB_VERSION, DEFAULT_SETTINGS, STORES } from "./config.js";
import { localDate, slugify } from "./utils.js";

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function createSchema(db) {
  if (!db.objectStoreNames.contains("progress")) {
    db.createObjectStore("progress", { keyPath: "lessonId" });
  }

  if (!db.objectStoreNames.contains("attempts")) {
    const store = db.createObjectStore("attempts", { keyPath: "id", autoIncrement: true });
    store.createIndex("date", "date", { unique: false });
    store.createIndex("lessonId", "lessonId", { unique: false });
  }

  if (!db.objectStoreNames.contains("mistakes")) {
    const store = db.createObjectStore("mistakes", { keyPath: "id" });
    store.createIndex("lessonId", "lessonId", { unique: false });
    store.createIndex("sentenceId", "sentenceId", { unique: false });
  }

  if (!db.objectStoreNames.contains("vocabCards")) {
    const store = db.createObjectStore("vocabCards", { keyPath: "id" });
    store.createIndex("dueDate", "dueDate", { unique: false });
  }

  if (!db.objectStoreNames.contains("settings")) {
    db.createObjectStore("settings", { keyPath: "key" });
  }
}

export function openListeningDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => createSchema(request.result);
    request.onsuccess = () => resolve(new ListeningDb(request.result));
    request.onerror = () => reject(request.error);
  });
}

export class ListeningDb {
  constructor(db) {
    this.db = db;
  }

  get(storeName, key) {
    const tx = this.db.transaction(storeName, "readonly");
    return requestToPromise(tx.objectStore(storeName).get(key));
  }

  getAll(storeName) {
    const tx = this.db.transaction(storeName, "readonly");
    return requestToPromise(tx.objectStore(storeName).getAll());
  }

  put(storeName, value) {
    const tx = this.db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    return transactionDone(tx);
  }

  add(storeName, value) {
    const tx = this.db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).add(value);
    return transactionDone(tx);
  }

  delete(storeName, key) {
    const tx = this.db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    return transactionDone(tx);
  }

  async seed(lessons) {
    const settings = await this.get("settings", "user");
    if (!settings) {
      await this.put("settings", { ...DEFAULT_SETTINGS });
    }

    const existingCards = await this.getAll("vocabCards");
    const existingIds = new Set(existingCards.map((card) => card.id));
    const today = localDate();
    const cards = lessons.flatMap((lesson) => lesson.vocab.map((item) => ({
      id: `${lesson.id}-${slugify(item.term)}`,
      lessonId: lesson.id,
      term: item.term,
      meaning: item.meaning,
      example: item.example,
      dueDate: today,
      ease: 2,
      reviewCount: 0,
      lastRating: null
    })));

    await Promise.all(cards.filter((card) => !existingIds.has(card.id)).map((card) => this.put("vocabCards", card)));
  }

  loadSettings() {
    return this.get("settings", "user").then((settings) => ({ ...DEFAULT_SETTINGS, ...settings }));
  }

  saveSettings(settings) {
    return this.put("settings", settings);
  }

  async snapshot() {
    const [progress, attempts, mistakes, vocabCards] = await Promise.all([
      this.getAll("progress"),
      this.getAll("attempts"),
      this.getAll("mistakes"),
      this.getAll("vocabCards")
    ]);
    return { progress, attempts, mistakes, vocabCards };
  }

  async exportData() {
    const stores = {};
    for (const store of STORES) {
      stores[store] = await this.getAll(store);
    }
    return {
      app: "Auralift",
      version: 1,
      exportedAt: new Date().toISOString(),
      stores
    };
  }

  async importData(payload) {
    if (!payload?.stores) {
      throw new Error("导入文件格式不正确");
    }

    const tx = this.db.transaction(STORES, "readwrite");
    for (const store of STORES) {
      const objectStore = tx.objectStore(store);
      objectStore.clear();
      for (const item of payload.stores[store] || []) {
        objectStore.put(item);
      }
    }
    await transactionDone(tx);
  }

  async clearUserData() {
    const tx = this.db.transaction(STORES, "readwrite");
    for (const store of STORES) {
      tx.objectStore(store).clear();
    }
    await transactionDone(tx);
    await this.put("settings", { ...DEFAULT_SETTINGS });
  }
}
