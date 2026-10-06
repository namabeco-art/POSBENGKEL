import { describe, expect, it } from 'vitest';
import { adjustStock, completeReturn, completeSale, receivePurchaseOrderStock, validateUniqueItem } from '../services/posOperations';
import { UserRole, type Item, type PurchaseOrder, type Sale, type SaleReturn, type User } from '../types';

const makeUser = (): User => ({
  id: 'U1',
  name: 'Owner',
  username: 'owner',
  passwordHash: 'hashed',
  role: UserRole.OWNER,
  permissions: ['sale.create', 'return.approve', 'purchase.receive', 'stock.adjust', 'dashboard.view'],
  schedule: { enabled: false, startTime: '08:00', endTime: '17:00' },
  isActive: true,
});

const makeItems = (): Item[] => [
  {
    id: 'I1',
    code: 'BRG-001',
    barcode: '111',
    name: 'Produk A',
    category: 'Snack',
    brand: 'BrandA',
    basePrice: 1000,
    memberPrices: [1500, 1450, 1400, 1350],
    units: [{ name: 'Pcs', conversion: 1, price: 1500 }],
    stock: 10,
    warehouseId: 'W1',
  },
  {
    id: 'I2',
    code: 'BRG-002',
    barcode: '222',
    name: 'Produk B',
    category: 'Drink',
    brand: 'BrandB',
    basePrice: 2000,
    memberPrices: [3000, 2900, 2800, 2700],
    units: [{ name: 'Pcs', conversion: 1, price: 3000 }],
    stock: 5,
    warehouseId: 'W1',
  },
];

describe('posOperations', () => {
  it('completes sale and deducts stock', () => {
    const result = completeSale(
      makeItems(),
      {
        id: 'S1',
        invoiceNo: 'INV-001',
        date: '10/04/2026 10:00:00',
        customerId: 'C1',
        customerName: 'Retail',
        items: [{ itemId: 'I1', name: 'Produk A', qty: 2, price: 1500, total: 3000 }],
        subtotal: 3000,
        tax: 0,
        total: 3000,
        paymentType: 'TUNAI',
        paymentMethod: 'TUNAI',
        amountReceived: 5000,
        changeAmount: 2000,
        operatorName: 'Owner',
      },
      makeUser(),
    );

    expect(result.items.find(item => item.id === 'I1')?.stock).toBe(8);
    expect(result.movements).toHaveLength(1);
    expect(result.payment.amount).toBe(3000);
  });

  it('restores stock on approved return', () => {
    const sale: Sale = {
      id: 'S1',
      invoiceNo: 'INV-001',
      date: '10/04/2026 10:00:00',
      customerId: 'C1',
      customerName: 'Retail',
      items: [{ itemId: 'I1', name: 'Produk A', qty: 2, price: 1500, total: 3000 }],
      subtotal: 3000,
      tax: 0,
      total: 3000,
      paymentType: 'TUNAI',
      paymentMethod: 'TUNAI',
      amountReceived: 5000,
      changeAmount: 2000,
      operatorName: 'Owner',
    };

    const soldItems = completeSale(makeItems(), sale, makeUser()).items;
    const ret: SaleReturn = {
      id: 'R1',
      returnNo: 'RET-001',
      originalInvoiceNo: 'INV-001',
      date: '10/04/2026 11:00:00',
      customerId: 'C1',
      customerName: 'Retail',
      items: [{ itemId: 'I1', name: 'Produk A', qty: 1, price: 1500, reason: 'Rusak' }],
      totalReturn: 1500,
      operatorName: 'Owner',
      status: 'APPROVED',
    };

    const result = completeReturn(soldItems, [sale], [], ret, makeUser());
    expect(result.items.find(item => item.id === 'I1')?.stock).toBe(9);
  });

  it('receives purchase order stock', () => {
    const po: PurchaseOrder = {
      id: 'PO-001',
      date: '10/04/2026',
      dueDate: '17/04/2026',
      termOfPayment: 7,
      discount: 0,
      supplierId: 'SUP-1',
      supplierName: 'Supplier',
      items: [{ itemId: 'I2', name: 'Produk B', orderedQty: 3, receivedQty: 0, cost: 1800 }],
      subtotal: 5400,
      total: 5400,
      status: 'PENDING',
      isPaid: false,
    };

    const result = receivePurchaseOrderStock(makeItems(), po, [{ itemId: 'I2', receivedQty: 3 }], makeUser());
    expect(result.items.find(item => item.id === 'I2')?.stock).toBe(8);
    expect(result.items.find(item => item.id === 'I2')?.basePrice).toBe(1925);
  });

  it('receives only the remaining PO quantity and rejects duplicate receipt', () => {
    const po: PurchaseOrder = {
      id: 'PO-002', date: '10/04/2026', dueDate: '17/04/2026', termOfPayment: 7, discount: 0,
      supplierId: 'SUP-1', supplierName: 'Supplier',
      items: [{ itemId: 'I2', name: 'Produk B', orderedQty: 5, receivedQty: 3, cost: 1800 }],
      subtotal: 9000, total: 9000, status: 'PENDING', isPaid: false,
    };
    expect(() => receivePurchaseOrderStock(makeItems(), po, [{ itemId: 'I2', receivedQty: 3 }], makeUser())).toThrow(/tidak valid/i);
    expect(receivePurchaseOrderStock(makeItems(), po, [{ itemId: 'I2', receivedQty: 2 }], makeUser()).items.find(item => item.id === 'I2')?.stock).toBe(7);
  });

  it('adjusts stock from opname', () => {
    const result = adjustStock(makeItems(), 'I2', 7, 'SO-001', 'Audit', makeUser());
    expect(result.items.find(item => item.id === 'I2')?.stock).toBe(7);
    expect(result.movement.type).toBe('STOCK_OPNAME');
  });

  it('rejects duplicate code or barcode', () => {
    expect(() => validateUniqueItem(makeItems(), { ...makeItems()[0], id: 'I3' })).toThrow();
  });

  it('rejects sale above stock', () => {
    const items = makeItems();
    items[0].stock = 1;
    expect(() =>
      completeSale(
        items,
        {
          id: 'S2',
          invoiceNo: 'INV-002',
          date: '10/04/2026 12:00:00',
          customerId: 'C1',
          customerName: 'Retail',
          items: [{ itemId: 'I1', name: 'Produk A', qty: 2, price: 1500, total: 3000 }],
          subtotal: 3000,
          tax: 0,
          total: 3000,
          paymentType: 'TUNAI',
          paymentMethod: 'TUNAI',
          amountReceived: 3000,
          changeAmount: 0,
          operatorName: 'Owner',
        },
        makeUser(),
      ),
    ).toThrow(/tidak mencukupi/i);
  });
});

describe('posOperations: validasi data rusak', () => {
  const baseSale = (): Sale => ({
    id: 'S9',
    invoiceNo: 'INV-009',
    date: '10/04/2026 10:00:00',
    customerId: 'C1',
    customerName: 'Retail',
    items: [
      { itemId: 'I1', name: 'Produk A', qty: 2, price: 1500, total: 3000 },
      { itemId: 'I2', name: 'Produk B', qty: 1, price: 3000, total: 3000 },
    ],
    subtotal: 6000,
    tax: 0,
    total: 6000,
    paymentType: 'TUNAI',
    paymentMethod: 'TUNAI',
    amountReceived: 6000,
    changeAmount: 0,
    operatorName: 'Owner',
  });

  it('menolak retur dengan qty kosong/NaN agar stok tidak menjadi NaN', () => {
    const ret = {
      id: 'R9',
      returnNo: 'RET-009',
      originalInvoiceNo: 'INV-009',
      date: '-',
      customerId: 'C1',
      customerName: 'Retail',
      items: [
        { itemId: 'I1', name: 'Produk A', qty: 1, price: 1500, reason: 'Rusak' },
        { itemId: 'I2', name: 'Produk B', qty: undefined as unknown as number, price: 3000, reason: 'cek' },
      ],
      totalReturn: 1500,
      operatorName: 'Owner',
    } as SaleReturn;
    expect(() => completeReturn(makeItems(), [baseSale()], [], ret, makeUser())).toThrow(/tidak valid|melebihi/);
  });

  it('menolak penjualan dengan qty NaN', () => {
    const sale = baseSale();
    sale.items[0].qty = Number.NaN;
    expect(() => completeSale(makeItems(), sale, makeUser())).toThrow(/tidak valid/);
  });

  it('melaporkan perubahan harga modal rata-rata saat menerima PO', () => {
    const po: PurchaseOrder = {
      id: 'PO-9',
      date: '-',
      dueDate: '-',
      termOfPayment: 0,
      discount: 0,
      supplierId: 'S1',
      supplierName: 'Supplier',
      items: [{ itemId: 'I1', name: 'Produk A', orderedQty: 10, receivedQty: 0, cost: 1300 }],
      subtotal: 13000,
      total: 13000,
      status: 'PENDING',
      isPaid: false,
    };
    const result = receivePurchaseOrderStock(makeItems(), po, [{ itemId: 'I1', receivedQty: 10 }], makeUser());
    // (10 x 1000 + 10 x 1300) / 20 = 1150
    expect(result.items.find(i => i.id === 'I1')!.basePrice).toBe(1150);
    expect(result.costChanges).toEqual([{ itemId: 'I1', itemName: 'Produk A', oldCost: 1000, newCost: 1150, purchaseCost: 1300 }]);
  });
});
