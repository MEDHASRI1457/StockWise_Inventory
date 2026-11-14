import api from '../api/client';

const DB = 'stockwise-offline';
const QUEUE = 'stock-operations';
const SNAPSHOTS = 'snapshots';
const businessId = () => {
  try { return JSON.parse(localStorage.getItem('smartInventoryUser') || 'null')?.businessId || null; } catch { return null; }
};

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(QUEUE)) db.createObjectStore(QUEUE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SNAPSHOTS)) db.createObjectStore(SNAPSHOTS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSnapshot(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SNAPSHOTS, 'readwrite');
    tx.objectStore(SNAPSHOTS).put(value, `${businessId()}:${key}`);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSnapshot(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SNAPSHOTS, 'readonly').objectStore(SNAPSHOTS).get(`${businessId()}:${key}`);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function queueStockOperation(operation) {
  const record = {
    ...operation,
    id: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    businessId: businessId(),
    status: 'pending',
    queuedAt: new Date().toISOString(),
    error: '',
  };
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE, 'readwrite');
    tx.objectStore(QUEUE).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event('stockwise-queue-change'));
  return record;
}

export async function getQueue() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(QUEUE, 'readonly').objectStore(QUEUE).getAll();
    request.onsuccess = () => resolve(request.result.filter((item) => item.businessId === businessId() && item.status !== 'synced'));
    request.onerror = () => reject(request.error);
  });
}

export async function deleteQueueItem(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE, 'readwrite');
    tx.objectStore(QUEUE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  window.dispatchEvent(new Event('stockwise-queue-change'));
}

export async function syncQueue() {
  if (!navigator.onLine || !localStorage.getItem('smartInventoryToken')) return [];
  const queue = (await getQueue()).filter((item) => item.status === 'pending');
  const outcomes = [];
  for (let offset = 0; offset < queue.length; offset += 50) {
    const batch = queue.slice(offset, offset + 50);
    const { data } = await api.post('/sync/stock-operations', { operations: batch });
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE, 'readwrite');
      const store = tx.objectStore(QUEUE);
      for (const result of data.results) {
        const item = batch.find((candidate) => candidate.id === result.id);
        if (!item) continue;
        const next = result.synchronized
          ? { ...item, status: 'synced', syncedAt: new Date().toISOString(), error: '' }
          : {
            ...item,
            status: result.retryable ? 'pending' : 'conflict',
            error: result.message || 'Server rejected the operation.',
          };
        store.put(next);
        outcomes.push({ ...result, productName: item.productName });
      }
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  window.dispatchEvent(new Event('stockwise-queue-change'));
  return outcomes;
}
