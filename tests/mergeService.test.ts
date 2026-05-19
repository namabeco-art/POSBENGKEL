import { describe, it, expect } from 'vitest';
import { mergeAppData } from '../services/mergeService';

describe('mergeService', () => {
  describe('mergeAppData', () => {
    it('should merge sales from both local and remote (union)', () => {
      const local = {
        sales: [
          { id: 'S1', invoiceNo: 'INV-001', createdAt: '2026-01-01T10:00:00Z' },
          { id: 'S2', invoiceNo: 'INV-002', createdAt: '2026-01-02T10:00:00Z' },
        ],
      };
      const remote = {
        sales: [
          { id: 'S2', invoiceNo: 'INV-002', createdAt: '2026-01-02T10:00:00Z' },
          { id: 'S3', invoiceNo: 'INV-003', createdAt: '2026-01-03T10:00:00Z' },
        ],
      };

      const merged = mergeAppData(local as any, remote as any);
      expect(merged.sales).toHaveLength(3);
      expect(merged.sales!.map(s => s.id).sort()).toEqual(['S1', 'S2', 'S3']);
    });

    it('should sort merged sales by createdAt descending', () => {
      const local = {
        sales: [
          { id: 'S1', invoiceNo: 'INV-001', createdAt: '2026-01-01T10:00:00Z' },
        ],
      };
      const remote = {
        sales: [
          { id: 'S2', invoiceNo: 'INV-002', createdAt: '2026-01-03T10:00:00Z' },
        ],
      };

      const merged = mergeAppData(local as any, remote as any);
      expect(merged.sales![0].id).toBe('S2'); // newer first
      expect(merged.sales![1].id).toBe('S1');
    });

    it('should prefer remote for mutable entities (items)', () => {
      const local = {
        items: [
          { id: 'I1', name: 'Local Name', stock: 10 },
        ],
      };
      const remote = {
        items: [
          { id: 'I1', name: 'Remote Name', stock: 15 },
        ],
      };

      const merged = mergeAppData(local as any, remote as any);
      expect(merged.items![0].name).toBe('Remote Name');
      expect((merged.items![0] as any).stock).toBe(15);
    });

    it('should keep local AI state (per-device)', () => {
      const local = {
        aiConsultantHistory: [{ id: 'M1', role: 'user', content: 'hello', timestamp: '' }],
      };
      const remote = {
        aiConsultantHistory: [{ id: 'M2', role: 'assistant', content: 'hi', timestamp: '' }],
      };

      const merged = mergeAppData(local as any, remote as any);
      expect(merged.aiConsultantHistory![0].id).toBe('M1'); // local wins
    });

    it('should cap audit logs at 2000', () => {
      const local = {
        auditLogs: Array.from({ length: 1500 }, (_, i) => ({
          id: `L${i}`,
          createdAt: new Date(2026, 0, 1, 0, 0, i).toISOString(),
        })),
      };
      const remote = {
        auditLogs: Array.from({ length: 1500 }, (_, i) => ({
          id: `R${i}`,
          createdAt: new Date(2026, 0, 2, 0, 0, i).toISOString(),
        })),
      };

      const merged = mergeAppData(local as any, remote as any);
      expect(merged.auditLogs!.length).toBeLessThanOrEqual(2000);
    });

    it('should handle empty arrays gracefully', () => {
      const merged = mergeAppData({}, {});
      expect(merged.sales).toEqual([]);
      expect(merged.items).toEqual([]);
      expect(merged.users).toEqual([]);
    });
  });
});
