import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractComplianceStoragePath,
  toFileAccessHref,
  normalizeStoredFileRef,
  licenseNumberFromStoragePath,
  isFileRef,
  sanitizeStorageObjectPath,
  fullyDecodeURIComponent,
  encodeStorageObjectPath,
  resolveFilesApiPath,
  pathBelongsToLicense
} from '../frontend/src/lib/storagePaths.ts';

const PUBLIC =
  'https://hiceshmpjvqfptytlyzo.supabase.co/storage/v1/object/public/compliance-documents/836089/vault/doc.pdf';
const SIGNED =
  'https://hiceshmpjvqfptytlyzo.supabase.co/storage/v1/object/sign/compliance-documents/836089/file.pdf?token=abc';
const PATH = '836089/vault/doc.pdf';
const BUCKET_BASE =
  'https://hiceshmpjvqfptytlyzo.supabase.co/storage/v1/object/public/compliance-documents';

/** Simulate Next/URLSearchParams once-decoding a query `path` value. */
function queryDecodedPath(rawQueryValue) {
  return new URL(`http://local.invalid/api/files?path=${rawQueryValue}`).searchParams.get('path');
}

describe('storagePaths', () => {
  it('extracts object path from public URLs', () => {
    assert.equal(extractComplianceStoragePath(PUBLIC), PATH);
  });

  it('extracts object path from signed URLs', () => {
    assert.equal(extractComplianceStoragePath(SIGNED), '836089/file.pdf');
  });

  it('accepts raw storage paths', () => {
    assert.equal(extractComplianceStoragePath(PATH), PATH);
  });

  it('extracts path from /api/files hrefs', () => {
    assert.equal(
      extractComplianceStoragePath(`/api/files?path=${encodeURIComponent(PATH)}`),
      PATH
    );
  });

  it('rejects path traversal and external non-bucket URLs', () => {
    assert.equal(extractComplianceStoragePath('../secret'), null);
    assert.equal(extractComplianceStoragePath('https://evil.example/a/b'), null);
    assert.equal(extractComplianceStoragePath('/absolute/path'), null);
  });

  it('builds authorized access hrefs', () => {
    assert.equal(toFileAccessHref(PUBLIC), `/api/files?path=${encodeURIComponent(PATH)}`);
    assert.equal(toFileAccessHref(PATH), `/api/files?path=${encodeURIComponent(PATH)}`);
    assert.equal(toFileAccessHref('https://example.com/coi.pdf'), 'https://example.com/coi.pdf');
  });

  it('normalizes stored refs to paths for our bucket', () => {
    assert.equal(normalizeStoredFileRef(PUBLIC), PATH);
    assert.equal(normalizeStoredFileRef(`/api/files?path=${encodeURIComponent(PATH)}`), PATH);
    assert.equal(normalizeStoredFileRef('https://example.com/coi.pdf'), 'https://example.com/coi.pdf');
  });

  it('reads license number from path prefix', () => {
    assert.equal(licenseNumberFromStoragePath(PATH), '836089');
    assert.equal(licenseNumberFromStoragePath('836089/../999999/x'), null);
  });

  it('detects file refs', () => {
    assert.equal(isFileRef(PATH), true);
    assert.equal(isFileRef(PUBLIC), true);
    assert.equal(isFileRef('notafile'), false);
  });

  it('encodes storage object path segments', () => {
    assert.equal(encodeStorageObjectPath(PATH), '836089/vault/doc.pdf');
    assert.equal(
      encodeStorageObjectPath('836089/vault/my file.pdf'),
      '836089/vault/my%20file.pdf'
    );
  });
});

describe('storagePaths traversal hardening (/api/files resolution)', () => {
  it('fully decodes nested percent-encoding', () => {
    assert.equal(fullyDecodeURIComponent('%252e%252e'), '..');
    assert.equal(fullyDecodeURIComponent('%2e%2e'), '..');
    assert.equal(fullyDecodeURIComponent('%2E%2E'), '..');
  });

  it('sanitize rejects .. . empty segments backslash leading slash and leftover %', () => {
    assert.equal(sanitizeStorageObjectPath('836089/../999999/vault/x.pdf'), null);
    assert.equal(sanitizeStorageObjectPath('836089/./vault/x.pdf'), null);
    assert.equal(sanitizeStorageObjectPath('836089//vault/x.pdf'), null);
    assert.equal(sanitizeStorageObjectPath('/836089/vault/x.pdf'), null);
    assert.equal(sanitizeStorageObjectPath('836089\\vault\\x.pdf'), null);
    assert.equal(sanitizeStorageObjectPath('836089/vault/x.pdf%'), null);
    assert.equal(sanitizeStorageObjectPath('836089/vault/\u0001x.pdf'), null);
    assert.equal(sanitizeStorageObjectPath(PATH), PATH);
  });

  it('rejects %2e%2e via raw path param (URLSearchParams-decoded)', () => {
    // %2e in query → `.` after one decode by the platform
    const once = queryDecodedPath('836089/%2e%2e/999999/vault/secret.pdf');
    assert.equal(once, '836089/../999999/vault/secret.pdf');
    assert.equal(resolveFilesApiPath(once), null);
  });

  it('rejects %252e%252e double-encoded traversal through /api/files path', () => {
    // %252e in query → %2e after platform decode; our full decode → .
    const once = queryDecodedPath('836089/%252e%252e/999999/vault/secret.pdf');
    assert.equal(once, '836089/%2e%2e/999999/vault/secret.pdf');
    assert.equal(resolveFilesApiPath(once), null);
    assert.equal(extractComplianceStoragePath(once), null);
  });

  it('rejects mixed-case %2E%2E traversal', () => {
    const once = queryDecodedPath('836089/%2E%2E/999999/vault/secret.pdf');
    assert.equal(once, '836089/../999999/vault/secret.pdf');
    assert.equal(resolveFilesApiPath(once), null);
  });

  it('rejects backslash and encoded backslash variants', () => {
    assert.equal(resolveFilesApiPath('836089\\..\\999999/vault/secret.pdf'), null);
    const once = queryDecodedPath('836089%5c..%5c999999/vault/secret.pdf');
    assert.equal(once, '836089\\..\\999999/vault/secret.pdf');
    assert.equal(resolveFilesApiPath(once), null);
  });

  it('rejects leading-slash variants', () => {
    assert.equal(resolveFilesApiPath('/836089/vault/doc.pdf'), null);
    const once = queryDecodedPath('%2F836089/vault/doc.pdf');
    assert.equal(once, '/836089/vault/doc.pdf');
    assert.equal(resolveFilesApiPath(once), null);
  });

  it('rejects public-URL path param with double-encoded traversal (review PoC)', () => {
    // Review PoC: /api/files?path=https://…/compliance-documents/836089/%252e%252e/999999/…
    const attackerQuery = new URL(
      `http://local.invalid/api/files?path=${BUCKET_BASE}/836089/%252e%252e/999999/vault/secret.pdf`
    );
    const pathParam = attackerQuery.searchParams.get('path');
    // URL parser decodes %252e → %2e in the path value; we fully decode then reject `..`
    assert.match(pathParam, /%2e%2e/i);
    assert.equal(resolveFilesApiPath(pathParam), null);
    assert.equal(extractComplianceStoragePath(pathParam), null);
  });

  it('rejects /api/files href wrapping a traversal public URL', () => {
    const href = `/api/files?path=${encodeURIComponent(
      `${BUCKET_BASE}/836089/%2e%2e/999999/vault/secret.pdf`
    )}`;
    assert.equal(extractComplianceStoragePath(href), null);
  });

  it('pathBelongsToLicense only accepts final sanitized prefix', () => {
    assert.equal(pathBelongsToLicense(PATH, '836089'), true);
    assert.equal(pathBelongsToLicense('836089/../999999/vault/x.pdf', '836089'), false);
    assert.equal(pathBelongsToLicense('999999/vault/x.pdf', '836089'), false);
  });

  it('still accepts legitimate vault and report paths', () => {
    assert.equal(resolveFilesApiPath('836089/vault/123-coi.pdf'), '836089/vault/123-coi.pdf');
    assert.equal(
      resolveFilesApiPath(`${BUCKET_BASE}/836089/1700000000-photo.jpg`),
      '836089/1700000000-photo.jpg'
    );
  });
});
