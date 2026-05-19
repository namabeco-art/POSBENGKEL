import { describe, it, expect, beforeEach } from 'vitest';
import { saveAppDataIndexedDB, loadAppDataIndexedDB } from '../services/indexedDbService';

// Note: jsdom doesn't fully support IndexedDB, so these tests verify
// the localStorage fallback path works correctly.

describe('indexedDbService (localStorage fallback)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('should save and load data via localStorage fallback', async () => {
    const testData = {
      users: [{ id: 'U1', name: 'Test' }],
      items: [{ id: 'I1', name: 'Item 1' }],
      sales: [],
      customers: [],
      suppliers: [],
      accounts: [],
      purchaseOrders: [],
      returns: [],
      inventoryLogs: [],
      inventoryMovements: [],
      auditLogs: [],
      cashSessions: [],
      paymentRecords: [],
      promotions: [],
      branches: [],
      aiConsultantHistory: [],
      floatingChatHistory: [],
    };

    await saveAppDataIndexedDB(testData as any);
    const loaded = await loadAppDataIndexedDB();
    expect(loaded).toBeTruthy();
    expect(loaded?.users?.[0]?.id).toBe('U1');
  });

  it('should return null when no data exists', async () => {
    const loaded = await loadAppDataIndexedDB();
    expect(loaded).toBeNull();
  });
});
