import { DB_NAME, DB_VERSION, DEFAULT_SETTINGS, STORE_NAMES, type StoreName } from "./config";
import { localDate, slugify } from "./utils";
import type {
  AttemptRecord,
  DataSnapshot,
  ExportPayload,
  Lesson,
  MistakeRecord,
  ProgressRecord,
  UserSettings,
  VocabCard
} from "../types/domain";

type StoreRecordMap = {
  progress: ProgressRecord;
  attempts: AttemptRecord;
  mistakes: MistakeRecord;
  vocabCards: VocabCard;
  settings: UserSettings;
};

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function createSchema(db: IDBDatabase): void {
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

function assertExportPayload(payload: unknown): asserts payload is ExportPayload {
  if (!payload || typeof payload !== "object" || !("stores" in payload)) {
    throw new Error("导入文件格式不正确");
  }
}

export function openListeningDb(): Promise<ListeningDb> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => createSchema(request.result);
    request.onsuccess = () => resolve(new ListeningDb(request.result));
    request.onerror = () => reject(request.error);
  });
}

export class ListeningDb {
  constructor(private readonly db: IDBDatabase) {}

  get<T extends StoreName>(storeName: T, key: IDBValidKey): Promise<StoreRecordMap[T] | undefined> {
    const tx = this.db.transaction(storeName, "readonly");
    return requestToPromise<StoreRecordMap[T] | undefined>(tx.objectStore(storeName).get(key));
  }

  getAll<T extends StoreName>(storeName: T): Promise<StoreRecordMap[T][]> {
    const tx = this.db.transaction(storeName, "readonly");
    return requestToPromise<StoreRecordMap[T][]>(tx.objectStore(storeName).getAll());
  }

  async put<T extends StoreName>(storeName: T, value: StoreRecordMap[T]): Promise<void> {
    const tx = this.db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(value);
    await transactionDone(tx);
  }

  async add<T extends StoreName>(storeName: T, value: StoreRecordMap[T]): Promise<void> {
    const tx = this.db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).add(value);
    await transactionDone(tx);
  }

  async delete(storeName: StoreName, key: IDBValidKey): Promise<void> {
    const tx = this.db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(key);
    await transactionDone(tx);
  }

  async seed(lessons: Lesson[]): Promise<void> {
    const settings = await this.get("settings", "user");
    if (!settings) {
      await this.put("settings", { ...DEFAULT_SETTINGS });
    } else {
      await this.put("settings", { ...DEFAULT_SETTINGS, ...settings });
    }

    const existingCards = await this.getAll("vocabCards");
    const existingIds = new Set(existingCards.map((card) => card.id));
    const today = localDate();
    const cards = lessons.flatMap((lesson) => lesson.vocab.map((item): VocabCard => ({
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

  async loadSettings(): Promise<UserSettings> {
    const settings = await this.get("settings", "user");
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  saveSettings(settings: UserSettings): Promise<void> {
    return this.put("settings", settings);
  }

  async snapshot(): Promise<DataSnapshot> {
    const [progress, attempts, mistakes, vocabCards] = await Promise.all([
      this.getAll("progress"),
      this.getAll("attempts"),
      this.getAll("mistakes"),
      this.getAll("vocabCards")
    ]);
    return { progress, attempts, mistakes, vocabCards };
  }

  async exportData(): Promise<ExportPayload> {
    const [progress, attempts, mistakes, vocabCards, settings] = await Promise.all([
      this.getAll("progress"),
      this.getAll("attempts"),
      this.getAll("mistakes"),
      this.getAll("vocabCards"),
      this.getAll("settings")
    ]);
    return {
      app: "Auralift",
      version: 2,
      exportedAt: new Date().toISOString(),
      stores: { progress, attempts, mistakes, vocabCards, settings }
    };
  }

  async importData(payload: unknown): Promise<void> {
    assertExportPayload(payload);
    const tx = this.db.transaction([...STORE_NAMES], "readwrite");
    for (const store of STORE_NAMES) {
      const objectStore = tx.objectStore(store);
      objectStore.clear();
      for (const item of payload.stores[store] || []) {
        objectStore.put(item);
      }
    }
    await transactionDone(tx);
  }

  async clearUserData(): Promise<void> {
    const tx = this.db.transaction([...STORE_NAMES], "readwrite");
    for (const store of STORE_NAMES) {
      tx.objectStore(store).clear();
    }
    await transactionDone(tx);
    await this.put("settings", { ...DEFAULT_SETTINGS });
  }
}
