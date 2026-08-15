const DB_NAME = 'framed'
const STORE_NAME = 'kv'

export type IdbMutation =
  | { type: 'set'; key: string; value: unknown }
  | { type: 'delete'; key: string }

let dbPromise: Promise<IDBDatabase> | null = null

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function getDatabase(): Promise<IDBDatabase> {
  if (!dbPromise) {
    const opening = openDatabase()
    dbPromise = opening
    // An unavailable/temporarily blocked database should be retryable on
    // the next operation rather than poisoning this module for the rest
    // of the page lifetime.
    void opening.catch(() => {
      if (dbPromise === opening) dbPromise = null
    })
  }
  return dbPromise
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

export async function idbDel(key: string): Promise<void> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function prefixRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`)
}

// Reads every string-keyed entry below one namespace. Keeping the key in
// the result is useful to callers that need to atomically replace or move
// individually persisted records without storing a second manifest.
export async function idbGetEntriesByPrefix<T>(prefix: string): Promise<Array<[string, T]>> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const entries: Array<[string, T]> = []
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .openCursor(prefixRange(prefix))

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) {
        resolve(entries)
        return
      }
      if (typeof cursor.key === 'string') entries.push([cursor.key, cursor.value as T])
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}

function runMutations(store: IDBObjectStore, mutations: readonly IdbMutation[]): void {
  for (const mutation of mutations) {
    if (mutation.type === 'set') store.put(mutation.value, mutation.key)
    else store.delete(mutation.key)
  }
}

function abortAfterSchedulingError(tx: IDBTransaction, reject: (reason?: unknown) => void, error: unknown): void {
  // A request such as put() can throw synchronously (notably
  // DataCloneError). Abort explicitly so requests scheduled before it in
  // this transaction cannot still commit a partial mutation.
  try {
    tx.abort()
  } catch {
    // The original scheduling error remains the useful failure reason.
  }
  reject(error)
}

// Applies related key changes in one read/write transaction. This is used
// for cross-grid object moves, where the old record must never survive after
// the new one has been committed (or vice versa).
export async function idbMutate(mutations: readonly IdbMutation[]): Promise<void> {
  if (mutations.length === 0) return
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
    try {
      runMutations(tx.objectStore(STORE_NAME), mutations)
    } catch (error) {
      abortAfterSchedulingError(tx, reject, error)
    }
  })
}

// Atomically clears one namespace, writes its replacement entries, and can
// update metadata outside that namespace in the same transaction.
export async function idbReplacePrefix(
  prefix: string,
  entries: ReadonlyArray<readonly [string, unknown]>,
  additionalMutations: readonly IdbMutation[] = []
): Promise<void> {
  for (const [key] of entries) {
    if (!key.startsWith(prefix)) throw new Error(`IndexedDB replacement key does not match prefix: ${key}`)
  }

  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
    try {
      const store = tx.objectStore(STORE_NAME)
      store.delete(prefixRange(prefix))
      for (const [key, value] of entries) store.put(value, key)
      runMutations(store, additionalMutations)
    } catch (error) {
      abortAfterSchedulingError(tx, reject, error)
    }
  })
}

export async function idbDeletePrefix(prefix: string): Promise<void> {
  return idbReplacePrefix(prefix, [])
}
