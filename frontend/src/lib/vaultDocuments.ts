import type { ExtractedData } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractComplianceStoragePath, toFileAccessHref } from './storagePaths';

export type VaultDocType = 'COI' | 'PERMIT' | 'PHOTO' | 'OTHER';

export type VaultDocumentItem = {
  id: string;
  title: string;
  doc_type: VaultDocType;
  /** Authorized app href (`/api/files?path=…`) or external URL — never a permanent public storage link. */
  file_url: string;
  storage_path: string | null;
  expires_on: string | null;
  related_name: string | null;
  source: 'upload' | 'subcontractor' | 'compliance_log';
  created_at: string | null;
};

function asFileRef(value: unknown): string | null {
  if (typeof value === 'string') {
    return toFileAccessHref(value);
  }
  if (value && typeof value === 'object') {
    const obj = value as { url?: unknown; storage_path?: unknown };
    if (typeof obj.storage_path === 'string') {
      return toFileAccessHref(obj.storage_path);
    }
    if (typeof obj.url === 'string') {
      return toFileAccessHref(obj.url);
    }
  }
  return null;
}

function asStoragePath(value: unknown): string | null {
  if (typeof value === 'string') {
    return extractComplianceStoragePath(value);
  }
  if (value && typeof value === 'object') {
    const obj = value as { url?: unknown; storage_path?: unknown };
    if (typeof obj.storage_path === 'string') {
      return extractComplianceStoragePath(obj.storage_path);
    }
    if (typeof obj.url === 'string') {
      return extractComplianceStoragePath(obj.url);
    }
  }
  return null;
}

/** Aggregate uploaded compliance files for membership-scoped license ids. */
export async function loadVaultDocuments(
  supabase: SupabaseClient,
  licenseIds: string[]
): Promise<VaultDocumentItem[]> {
  if (!licenseIds.length) return [];

  const items: VaultDocumentItem[] = [];
  const seen = new Set<string>();

  const push = (item: VaultDocumentItem) => {
    const key = item.storage_path || item.file_url;
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  const [uploadedRes, subcontractorsRes, logsRes] = await Promise.all([
    supabase
      .from('documents')
      .select('id, title, doc_type, file_url, storage_path, expires_on, related_name, created_at')
      .in('license_id', licenseIds)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('subcontractors')
      .select('id, company_name, trade, coi_expiration_date, notes, updated_at')
      .in('license_id', licenseIds)
      .order('updated_at', { ascending: false })
      .limit(200),
    supabase
      .from('compliance_logs')
      .select('id, extracted_data, created_at')
      .in('license_id', licenseIds)
      .order('created_at', { ascending: false })
      .limit(80)
  ]);

  // documents table may be missing on older environments — still surface log/sub files
  const uploaded = uploadedRes.error ? [] : uploadedRes.data;
  const subcontractors = subcontractorsRes.data;
  const logs = logsRes.data;

  for (const doc of uploaded || []) {
    const storagePath =
      (typeof doc.storage_path === 'string' && doc.storage_path) ||
      extractComplianceStoragePath(doc.file_url) ||
      null;
    const href = toFileAccessHref(storagePath || doc.file_url);
    if (!href) continue;
    push({
      id: `upload:${doc.id}`,
      title: doc.title || 'Document',
      doc_type: (doc.doc_type as VaultDocType) || 'OTHER',
      file_url: href,
      storage_path: storagePath,
      expires_on: doc.expires_on || null,
      related_name: doc.related_name || null,
      source: 'upload',
      created_at: doc.created_at || null
    });
  }

  for (const sub of subcontractors || []) {
    const href = asFileRef(sub.notes);
    if (!href) continue;
    push({
      id: `sub:${sub.id}`,
      title: `COI — ${sub.company_name}`,
      doc_type: 'COI',
      file_url: href,
      storage_path: asStoragePath(sub.notes),
      expires_on: sub.coi_expiration_date || null,
      related_name: sub.company_name || null,
      source: 'subcontractor',
      created_at: sub.updated_at || null
    });
  }

  for (const log of logs || []) {
    const extracted = (log.extracted_data || {}) as ExtractedData;
    const fileUrls = extracted.file_urls;
    if (!fileUrls) continue;

    (fileUrls.cois || []).forEach((item, i) => {
      const href = asFileRef(item);
      if (!href) return;
      const company =
        typeof item === 'object' && item && 'company_name' in item
          ? (item as { company_name?: string | null }).company_name
          : null;
      push({
        id: `log:${log.id}:coi:${i}`,
        title: company ? `COI — ${company}` : `COI ${i + 1}`,
        doc_type: 'COI',
        file_url: href,
        storage_path: asStoragePath(item),
        expires_on: null,
        related_name: company || null,
        source: 'compliance_log',
        created_at: log.created_at || null
      });
    });

    (fileUrls.permits || []).forEach((item, i) => {
      const href = asFileRef(item);
      if (!href) return;
      push({
        id: `log:${log.id}:permit:${i}`,
        title: `Permit ${i + 1}`,
        doc_type: 'PERMIT',
        file_url: href,
        storage_path: asStoragePath(item),
        expires_on: null,
        related_name: null,
        source: 'compliance_log',
        created_at: log.created_at || null
      });
    });

    (fileUrls.photos || []).forEach((item, i) => {
      const href = asFileRef(item);
      if (!href) return;
      push({
        id: `log:${log.id}:photo:${i}`,
        title: `Photo ${i + 1}`,
        doc_type: 'PHOTO',
        file_url: href,
        storage_path: asStoragePath(item),
        expires_on: null,
        related_name: null,
        source: 'compliance_log',
        created_at: log.created_at || null
      });
    });
  }

  items.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });

  return items;
}
