/**
 * IndexedDB helpers for operator offline drafts + pending report queue.
 * Form field data and file Blobs are stored locally; uploads flush via the
 * existing cookie-authenticated POST /api/operator/submit-report when online.
 */

const DB_NAME = 'rmo-operator-offline';
const DB_VERSION = 1;
const STORE_QUEUE = 'pending_reports';
const STORE_FILES = 'pending_files';
const STORE_CONTEXT = 'context_cache';

export type ProjectPayload = {
  id?: string | null;
  address: string;
  contractValue: string;
  trades: string[];
  permitNumber: string;
  startDate: string | null;
  endDate: string | null;
  closed: boolean;
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
};

export type SubPayload = {
  id?: string | null;
  company: string;
  contactName?: string;
  phone?: string;
  email?: string;
  cslbLicense: string;
  trade: string;
  coiExpiration: string;
  coiDocumentUrl: string | null;
};

export type CrewPayload = {
  hasEmployees: boolean;
  explanation: string;
};

export type QueuedFileMeta = {
  key: string;
  field: 'permits' | 'photos' | `coi_${number}`;
  name: string;
  type: string;
  size: number;
};

export type QueuedReport = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'sending' | 'failed';
  lastError?: string;
  operatorName: string;
  licenseId: string;
  projects: ProjectPayload[];
  subcontractors: SubPayload[];
  crewStatus: CrewPayload;
  notes: string;
  files: QueuedFileMeta[];
  /** True when the operator selected files that could not be kept in IndexedDB. */
  needsFileReattach: boolean;
  skippedFileNames: string[];
};

export type CachedLicense = {
  id: string;
  license_number: string;
  entity_name: string;
};

export type CachedContext = {
  licenseId: string;
  savedAt: string;
  projects: Array<{
    id?: string;
    address: string;
    contractValue: string;
    trades: string;
    permitNumber: string;
    startDate: string;
    endDate: string;
    closeOut: boolean;
  }>;
  subcontractors: Array<{
    id?: string;
    company: string;
    contactName?: string;
    phone?: string;
    email?: string;
    cslbLicense: string;
    trade: string;
    coiExpiration: string;
    coiDocumentUrl: string;
  }>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) {
        db.createObjectStore(STORE_QUEUE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_CONTEXT)) {
        db.createObjectStore(STORE_CONTEXT, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
  });
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('offline')
  );
}

export function friendlyNetworkMessage(err?: unknown): string {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return "You're offline. Changes stay on this phone until you're back online.";
  }
  if (isNetworkError(err)) {
    return "Can't reach the server right now. Check your connection and try again.";
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Something went wrong. Please try again.';
}

async function putFileBlob(
  db: IDBDatabase,
  key: string,
  blob: Blob,
  meta: { name: string; type: string }
): Promise<void> {
  const tx = db.transaction(STORE_FILES, 'readwrite');
  tx.objectStore(STORE_FILES).put({ key, blob, name: meta.name, type: meta.type });
  await txDone(tx);
}

async function deleteFileKeys(db: IDBDatabase, keys: string[]): Promise<void> {
  if (!keys.length) return;
  const tx = db.transaction(STORE_FILES, 'readwrite');
  const store = tx.objectStore(STORE_FILES);
  for (const key of keys) store.delete(key);
  await txDone(tx);
}

export type EnqueueInput = {
  operatorName: string;
  licenseId: string;
  projects: ProjectPayload[];
  subcontractors: SubPayload[];
  crewStatus: CrewPayload;
  notes: string;
  coiFiles: Array<{ index: number; file: File }>;
  permits: File[];
  photos: File[];
};

export async function enqueueReport(input: EnqueueInput): Promise<QueuedReport> {
  const db = await openDb();
  const id = uuid();
  const now = new Date().toISOString();
  const files: QueuedFileMeta[] = [];
  const skippedFileNames: string[] = [];

  async function tryStore(field: QueuedFileMeta['field'], file: File): Promise<void> {
    const key = `${id}:${field}:${file.name}:${file.size}`;
    try {
      await putFileBlob(db, key, file, { name: file.name, type: file.type || 'application/octet-stream' });
      files.push({
        key,
        field,
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size
      });
    } catch {
      skippedFileNames.push(file.name);
    }
  }

  for (const { index, file } of input.coiFiles) {
    await tryStore(`coi_${index}`, file);
  }
  for (const file of input.permits) {
    await tryStore('permits', file);
  }
  for (const file of input.photos) {
    await tryStore('photos', file);
  }

  const record: QueuedReport = {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'pending',
    operatorName: input.operatorName,
    licenseId: input.licenseId,
    projects: input.projects,
    subcontractors: input.subcontractors,
    crewStatus: input.crewStatus,
    notes: input.notes,
    files,
    needsFileReattach: skippedFileNames.length > 0,
    skippedFileNames
  };

  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).put(record);
  await txDone(tx);
  return record;
}

export async function listQueuedReports(): Promise<QueuedReport[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).getAll();
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const rows = (req.result as QueuedReport[]) || [];
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(rows);
    };
  });
}

export async function getQueuedReport(id: string): Promise<QueuedReport | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).get(id);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve((req.result as QueuedReport) || null);
  });
}

export async function updateQueuedReport(report: QueuedReport): Promise<void> {
  const db = await openDb();
  const next = { ...report, updatedAt: new Date().toISOString() };
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).put(next);
  await txDone(tx);
}

export async function deleteQueuedReport(id: string): Promise<void> {
  const db = await openDb();
  const existing = await getQueuedReport(id);
  const keys = existing?.files.map((f) => f.key) || [];
  await deleteFileKeys(db, keys);
  const tx = db.transaction(STORE_QUEUE, 'readwrite');
  tx.objectStore(STORE_QUEUE).delete(id);
  await txDone(tx);
}

async function readFileBlob(db: IDBDatabase, key: string): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readonly');
    const req = tx.objectStore(STORE_FILES).get(key);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const row = req.result as { blob?: Blob } | undefined;
      resolve(row?.blob || null);
    };
  });
}

export function buildFormDataFromQueue(
  report: QueuedReport,
  fileBlobs: Map<string, Blob>
): FormData {
  const formData = new FormData();
  formData.append('operatorName', report.operatorName);
  formData.append('licenseId', report.licenseId);
  formData.append('projects', JSON.stringify(report.projects));
  formData.append('subcontractors', JSON.stringify(report.subcontractors));
  formData.append('crewStatus', JSON.stringify(report.crewStatus));
  formData.append('notes', report.notes);

  for (const meta of report.files) {
    const blob = fileBlobs.get(meta.key);
    if (!blob) continue;
    const file = new File([blob], meta.name, { type: meta.type || blob.type || 'application/octet-stream' });
    formData.append(meta.field, file);
  }
  return formData;
}

export async function flushQueuedReport(id: string): Promise<{ ok: true; logId?: string } | { ok: false; error: string; needsFileReattach?: boolean }> {
  const report = await getQueuedReport(id);
  if (!report) return { ok: false, error: 'Queued report not found' };

  if (report.needsFileReattach) {
    return {
      ok: false,
      error: `Re-attach skipped files before sending: ${report.skippedFileNames.join(', ')}`,
      needsFileReattach: true
    };
  }

  const sending: QueuedReport = { ...report, status: 'sending', lastError: undefined };
  await updateQueuedReport(sending);

  const db = await openDb();
  const blobs = new Map<string, Blob>();
  for (const meta of report.files) {
    const blob = await readFileBlob(db, meta.key);
    if (!blob) {
      const failed: QueuedReport = {
        ...report,
        status: 'failed',
        needsFileReattach: true,
        skippedFileNames: Array.from(new Set([...report.skippedFileNames, meta.name])),
        lastError: `Missing local file: ${meta.name}`
      };
      await updateQueuedReport(failed);
      return {
        ok: false,
        error: `A saved attachment is missing (${meta.name}). Re-attach the file and try again.`,
        needsFileReattach: true
      };
    }
    blobs.set(meta.key, blob);
  }

  try {
    const formData = buildFormDataFromQueue(report, blobs);
    const res = await fetch('/api/operator/submit-report', {
      method: 'POST',
      body: formData
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const failed: QueuedReport = {
        ...report,
        status: 'failed',
        lastError: data.error || `Submit failed (${res.status})`
      };
      await updateQueuedReport(failed);
      return { ok: false, error: failed.lastError || 'Submit failed' };
    }
    await deleteQueuedReport(id);
    return { ok: true, logId: data.logId };
  } catch (err) {
    const failed: QueuedReport = {
      ...report,
      status: 'failed',
      lastError: friendlyNetworkMessage(err)
    };
    await updateQueuedReport(failed);
    return { ok: false, error: failed.lastError || 'Submit failed' };
  }
}

export async function flushAllQueuedReports(): Promise<{
  sent: number;
  failed: number;
  errors: string[];
}> {
  const queued = await listQueuedReports();
  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  for (const item of queued) {
    if (item.status === 'sending') continue;
    const result = await flushQueuedReport(item.id);
    if (result.ok) sent += 1;
    else {
      failed += 1;
      errors.push(result.error);
    }
  }
  return { sent, failed, errors };
}

export async function saveLicensesCache(licenses: CachedLicense[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_CONTEXT, 'readwrite');
  tx.objectStore(STORE_CONTEXT).put({
    key: 'licenses',
    savedAt: new Date().toISOString(),
    licenses
  });
  await txDone(tx);
}

export async function loadLicensesCache(): Promise<CachedLicense[] | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONTEXT, 'readonly');
    const req = tx.objectStore(STORE_CONTEXT).get('licenses');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const row = req.result as { licenses?: CachedLicense[] } | undefined;
      resolve(row?.licenses || null);
    };
  });
}

export async function saveOperatorContextCache(ctx: CachedContext): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_CONTEXT, 'readwrite');
  tx.objectStore(STORE_CONTEXT).put({
    key: `context:${ctx.licenseId}`,
    ...ctx
  });
  await txDone(tx);
}

export async function loadOperatorContextCache(licenseId: string): Promise<CachedContext | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CONTEXT, 'readonly');
    const req = tx.objectStore(STORE_CONTEXT).get(`context:${licenseId}`);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const row = req.result as (CachedContext & { key?: string }) | undefined;
      if (!row) {
        resolve(null);
        return;
      }
      resolve({
        licenseId: row.licenseId,
        savedAt: row.savedAt,
        projects: row.projects,
        subcontractors: row.subcontractors
      });
    };
  });
}

/** Attach replacement files onto an existing queued report (re-attach path). */
export async function attachFilesToQueuedReport(
  id: string,
  additions: {
    coiFiles?: Array<{ index: number; file: File }>;
    permits?: File[];
    photos?: File[];
  }
): Promise<QueuedReport> {
  const report = await getQueuedReport(id);
  if (!report) throw new Error('Queued report not found');
  const db = await openDb();
  const files = [...report.files];
  const stillSkipped = [...report.skippedFileNames];

  async function store(field: QueuedFileMeta['field'], file: File) {
    const key = `${id}:${field}:${file.name}:${file.size}:${Date.now()}`;
    await putFileBlob(db, key, file, { name: file.name, type: file.type || 'application/octet-stream' });
    files.push({
      key,
      field,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size
    });
    const idx = stillSkipped.indexOf(file.name);
    if (idx >= 0) stillSkipped.splice(idx, 1);
  }

  for (const item of additions.coiFiles || []) {
    await store(`coi_${item.index}`, item.file);
  }
  for (const file of additions.permits || []) {
    await store('permits', file);
  }
  for (const file of additions.photos || []) {
    await store('photos', file);
  }

  const next: QueuedReport = {
    ...report,
    files,
    skippedFileNames: stillSkipped,
    needsFileReattach: stillSkipped.length > 0,
    status: 'pending',
    lastError: undefined,
    updatedAt: new Date().toISOString()
  };
  await updateQueuedReport(next);
  return next;
}
