import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractComplianceStoragePath,
  toFileAccessHref,
  normalizeStoredFileRef,
  licenseNumberFromStoragePath,
  isFileRef
} from '../frontend/src/lib/storagePaths.ts';

const PUBLIC =
  'https://hiceshmpjvqfptytlyzo.supabase.co/storage/v1/object/public/compliance-documents/836089/vault/doc.pdf';
const SIGNED =
  'https://hiceshmpjvqfptytlyzo.supabase.co/storage/v1/object/sign/compliance-documents/836089/file.pdf?token=abc';
const PATH = '836089/vault/doc.pdf';

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
  });

  it('detects file refs', () => {
    assert.equal(isFileRef(PATH), true);
    assert.equal(isFileRef(PUBLIC), true);
    assert.equal(isFileRef('notafile'), false);
  });
});
