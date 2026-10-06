import {
  AuditLog,
  InventoryMovement,
  Item,
  PaymentRecord,
  PurchaseOrder,
  Sale,
  SaleItem,
  SaleReturn,
  User,
  Customer,
} from '../types';
import { createId } from './idService';

const makeId = createId;
const nowIso = () => new Date().toISOString();

/** Qty transaksi harus angka positif yang valid — mencegah NaN/undefined merusak stok dan saldo. */
const isValidQty = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const createAudit = (
  action: AuditLog['action'],
  entityType: AuditLog['entityType'],
  actorName: string,
  details: string,
  entityId?: string,
  entityLabel?: string,
  actorId?: string,
): AuditLog => ({
  id: makeId('AUD'),
  action,
  actorId,
  actorName,
  entityType,
  entityId,
  entityLabel,
  details,
  createdAt: nowIso(),
});

const createMovement = (
  item: Item,
  quantity: number,
  previousStock: number,
  newStock: number,
  type: InventoryMovement['type'],
  direction: InventoryMovement['direction'],
  referenceNo: string,
  user: User,
  note?: string,
): InventoryMovement => ({
  id: makeId('MOV'),
  itemId: item.id,
  itemName: item.name,
  type,
  direction,
  quantity,
  previousStock,
  newStock,
  referenceNo,
  note,
  warehouseId: item.warehouseId,
  operatorName: user.name,
  operatorId: user.id,
  createdAt: nowIso(),
});

/** Perubahan harga modal (HPP rata-rata) akibat penerimaan barang dari supplier. */
export interface CostChange {
  itemId: string;
  itemName: string;
  oldCost: number;
  newCost: number;
  /** Harga beli per unit di PO ini (setelah diskon PO). */
  purchaseCost: number;
}

export const validateUniqueItem = (items: Item[], target: Item) => {
  const duplicatedCode = items.find(item => item.id !== target.id && item.code === target.code);
  if (duplicatedCode) throw new Error(`Kode barang ${target.code} sudah digunakan.`);

  // Bug #9 fix: Skip barcode check if empty
  if (target.barcode) {
    const duplicatedBarcode = items.find(item => item.id !== target.id && item.barcode === target.barcode);
    if (duplicatedBarcode) throw new Error(`Barcode ${target.barcode} sudah digunakan.`);
  }
};

export const completeSale = (
  items: Item[],
  sale: Sale,
  user: User,
  customers?: Customer[],
): { items: Item[]; movements: InventoryMovement[]; payment: PaymentRecord; audit: AuditLog; updatedCustomer?: Customer; saleItems: SaleItem[] } => {
  if (!Number.isFinite(sale.total) || sale.total < 0) throw new Error('Total penjualan tidak valid.');
  const draftItems = [...items];
  const movements: InventoryMovement[] = [];
  const saleItems: SaleItem[] = [];

  for (const saleItem of sale.items) {
    const targetIndex = draftItems.findIndex(item => item.id === saleItem.itemId);
    if (targetIndex < 0) throw new Error(`Barang ${saleItem.name} tidak ditemukan.`);

    const currentItem = draftItems[targetIndex];
    if (!isValidQty(saleItem.qty)) throw new Error(`Qty jual ${saleItem.name} tidak valid.`);
    if (!Number.isFinite(saleItem.price) || saleItem.price < 0) throw new Error(`Harga jual ${saleItem.name} tidak valid.`);

    // Barang paket: stok yang berkurang adalah stok komponen penyusunnya.
    if (currentItem.isBundle && currentItem.components?.length) {
      const consumed: NonNullable<SaleItem['components']> = [];
      for (const component of currentItem.components) {
        const need = component.qty * saleItem.qty;
        const componentIndex = draftItems.findIndex(item => item.id === component.itemId);
        if (componentIndex < 0) throw new Error(`Komponen ${component.name} untuk paket ${currentItem.name} tidak ditemukan.`);
        const componentItem = draftItems[componentIndex];
        if (componentItem.stock < need) throw new Error(`Stok ${componentItem.name} (komponen paket ${currentItem.name}) tidak mencukupi.`);
        const newStock = componentItem.stock - need;
        draftItems[componentIndex] = { ...componentItem, stock: newStock };
        movements.push(createMovement(componentItem, need, componentItem.stock, newStock, 'SALE', 'OUT', sale.invoiceNo, user, `Paket ${currentItem.name}`));
        consumed.push({ itemId: componentItem.id, name: componentItem.name, qty: need });
      }
      saleItems.push({ ...saleItem, components: consumed });
      continue;
    }

    if (currentItem.stock < saleItem.qty) throw new Error(`Stok ${saleItem.name} tidak mencukupi.`);
    const newStock = currentItem.stock - saleItem.qty;
    draftItems[targetIndex] = { ...currentItem, stock: newStock };
    movements.push(createMovement(currentItem, saleItem.qty, currentItem.stock, newStock, 'SALE', 'OUT', sale.invoiceNo, user));
    saleItems.push(saleItem);
  }

  const payment: PaymentRecord = {
    id: makeId('PAY'),
    referenceNo: sale.invoiceNo,
    referenceType: 'SALE',
    amount: sale.total,
    method: sale.paymentMethod || sale.paymentType,
    direction: 'IN',
    createdAt: nowIso(),
    operatorName: user.name,
    operatorId: user.id,
  };

  let updatedCustomer: Customer | undefined;
  if (customers && sale.customerId) {
    const cust = customers.find(c => c.id === sale.customerId);
    if (cust) {
      const pEarned = sale.pointsEarned || 0;
      const pUsed = sale.pointsUsed || 0;
      if (pEarned > 0 || pUsed > 0) {
        updatedCustomer = { ...cust, rewardPoints: Math.max(0, (cust.rewardPoints || 0) + pEarned - pUsed) };
      }
    }
  }

  return {
    items: draftItems,
    movements,
    payment,
    audit: createAudit('SALE_COMPLETED', 'SALE', user.name, `Penjualan ${sale.invoiceNo} selesai sebesar Rp ${sale.total.toLocaleString()}.`, sale.id, sale.invoiceNo, user.id),
    updatedCustomer,
    saleItems,
  };
};

/**
 * Kembalikan stok untuk `baseQty` unit dari satu baris penjualan.
 * Baris paket mengembalikan stok komponennya secara proporsional.
 */
const restoreSaleLineStock = (
  draftItems: Item[],
  saleLine: SaleItem,
  baseQty: number,
  referenceNo: string,
  type: InventoryMovement['type'],
  user: User,
  movements: InventoryMovement[],
  note?: string,
) => {
  if (saleLine.components?.length) {
    const ratio = baseQty / saleLine.qty;
    for (const component of saleLine.components) {
      const qty = Math.round(component.qty * ratio);
      if (qty <= 0) continue;
      const index = draftItems.findIndex(item => item.id === component.itemId);
      if (index < 0) throw new Error(`Komponen ${component.name} tidak ditemukan pada master barang.`);
      const current = draftItems[index];
      const newStock = current.stock + qty;
      draftItems[index] = { ...current, stock: newStock };
      movements.push(createMovement(current, qty, current.stock, newStock, type, 'IN', referenceNo, user, note || `Paket ${saleLine.name}`));
    }
    return;
  }
  const index = draftItems.findIndex(item => item.id === saleLine.itemId);
  if (index < 0) throw new Error(`Barang ${saleLine.name} tidak ditemukan pada master barang.`);
  const current = draftItems[index];
  const newStock = current.stock + baseQty;
  draftItems[index] = { ...current, stock: newStock };
  movements.push(createMovement(current, baseQty, current.stock, newStock, type, 'IN', referenceNo, user, note));
};

/** Batalkan (void) penjualan: seluruh stok dikembalikan. Validasi bisnis (shift, retur, piutang) di pemanggil. */
export const voidSaleStock = (
  items: Item[],
  sale: Sale,
  user: User,
  reason: string,
): { items: Item[]; movements: InventoryMovement[]; payment: PaymentRecord; audit: AuditLog } => {
  if (sale.status === 'VOID') throw new Error(`Faktur ${sale.invoiceNo} sudah dibatalkan.`);
  const draftItems = [...items];
  const movements: InventoryMovement[] = [];
  sale.items.forEach(line => restoreSaleLineStock(draftItems, line, line.qty, sale.invoiceNo, 'SALE_VOID', user, movements, `Void: ${reason}`));
  return {
    items: draftItems,
    movements,
    payment: {
      id: makeId('PAY'),
      referenceNo: sale.invoiceNo,
      referenceType: 'SALE',
      amount: sale.total,
      method: 'VOID',
      direction: 'OUT',
      createdAt: nowIso(),
      operatorName: user.name,
      operatorId: user.id,
      note: reason,
    },
    audit: createAudit('SALE_VOIDED', 'SALE', user.name, `Penjualan ${sale.invoiceNo} (Rp ${sale.total.toLocaleString('id-ID')}) dibatalkan. Alasan: ${reason}`, sale.id, sale.invoiceNo, user.id),
  };
};

export const completeReturn = (
  items: Item[],
  sales: Sale[],
  returns: SaleReturn[],
  ret: SaleReturn,
  user: User,
): { items: Item[]; movements: InventoryMovement[]; payment: PaymentRecord; audit: AuditLog } => {
  const originSale = sales.find(sale => sale.invoiceNo === ret.originalInvoiceNo);
  if (!originSale) throw new Error(`Faktur asal ${ret.originalInvoiceNo} tidak ditemukan.`);
  if (originSale.status === 'VOID') throw new Error(`Faktur ${ret.originalInvoiceNo} sudah dibatalkan (void).`);
  if (!Array.isArray(ret.items) || ret.items.length === 0) throw new Error('Pilih minimal satu barang yang diretur.');
  if (!Number.isFinite(ret.totalReturn) || ret.totalReturn < 0) throw new Error('Nilai retur tidak valid.');

  const existingReturnQty: Record<string, number> = {};
  returns
    .filter(item => item.originalInvoiceNo === ret.originalInvoiceNo)
    .forEach(existingReturn => {
      existingReturn.items.forEach(returnItem => {
        existingReturnQty[returnItem.itemId] = (existingReturnQty[returnItem.itemId] || 0) + returnItem.qty;
      });
    });

  const nextItems = [...items];
  const movements: InventoryMovement[] = [];

  for (const returnItem of ret.items) {
    // Satu barang bisa muncul di beberapa baris (mis. per Botol dan per Dus) — qty dihitung dalam satuan dasar.
    const saleLines = originSale.items.filter(item => item.itemId === returnItem.itemId);
    if (saleLines.length === 0) throw new Error(`Item ${returnItem.name} tidak ada di faktur asal.`);
    const soldQty = saleLines.reduce((sum, line) => sum + line.qty, 0);

    const maxReturnable = soldQty - (existingReturnQty[returnItem.itemId] || 0);
    if (!isValidQty(returnItem.qty) || returnItem.qty > maxReturnable) {
      throw new Error(`Qty retur ${returnItem.name} melebihi qty yang bisa diretur.`);
    }

    const bundleLine = saleLines.find(line => line.components?.length);
    restoreSaleLineStock(nextItems, bundleLine || saleLines[0], returnItem.qty, ret.returnNo, 'RETURN', user, movements, returnItem.reason);
  }

  const payment: PaymentRecord = {
    id: makeId('PAY'),
    referenceNo: ret.returnNo,
    referenceType: 'RETURN',
    amount: ret.totalReturn,
    method: 'REFUND',
    direction: 'OUT',
    createdAt: nowIso(),
    operatorName: user.name,
    operatorId: user.id,
  };

  return {
    items: nextItems,
    movements,
    payment,
    audit: createAudit('RETURN_COMPLETED', 'RETURN', user.name, `Retur ${ret.returnNo} diproses untuk faktur ${ret.originalInvoiceNo}.`, ret.id, ret.returnNo, user.id),
  };
};

export const receivePurchaseOrderStock = (
  items: Item[],
  po: PurchaseOrder,
  updates: { itemId: string; receivedQty: number }[],
  user: User,
): { items: Item[]; movements: InventoryMovement[]; audit: AuditLog; costChanges: CostChange[] } => {
  const nextItems = [...items];
  const movements: InventoryMovement[] = [];
  const costChanges: CostChange[] = [];

  for (const update of updates) {
    const poItem = po.items.find(item => item.itemId === update.itemId);
    if (!poItem) throw new Error(`Item penerimaan tidak ada di PO ${po.id}.`);
    const remainingQty = poItem.orderedQty - poItem.receivedQty;
    if (!Number.isFinite(update.receivedQty) || update.receivedQty < 0 || update.receivedQty > remainingQty) {
      throw new Error(`Qty terima ${poItem.name} tidak valid.`);
    }
    if (update.receivedQty === 0) continue;

    const itemIndex = nextItems.findIndex(item => item.id === update.itemId);
    if (itemIndex < 0) throw new Error(`Barang ${poItem.name} tidak ditemukan di master data.`);

    const currentItem = nextItems[itemIndex];
    const newStock = currentItem.stock + update.receivedQty;
    const effectiveUnitCost = poItem.cost * (1 - Math.min(100, Math.max(0, po.discount || 0)) / 100);
    const weightedCost = newStock > 0
      ? ((currentItem.stock * currentItem.basePrice) + (update.receivedQty * effectiveUnitCost)) / newStock
      : effectiveUnitCost;
    const newCost = Math.round(weightedCost);
    nextItems[itemIndex] = { ...currentItem, stock: newStock, basePrice: newCost };
    movements.push(createMovement(currentItem, update.receivedQty, currentItem.stock, newStock, 'PURCHASE_RECEIPT', 'IN', po.id, user));
    if (newCost !== currentItem.basePrice) {
      const existing = costChanges.find(change => change.itemId === currentItem.id);
      if (existing) existing.newCost = newCost;
      else costChanges.push({ itemId: currentItem.id, itemName: currentItem.name, oldCost: currentItem.basePrice, newCost, purchaseCost: Math.round(effectiveUnitCost) });
    }
  }

  return {
    items: nextItems,
    movements,
    costChanges,
    audit: createAudit('PO_RECEIVED', 'PURCHASE_ORDER', user.name, `Penerimaan barang untuk ${po.id} berhasil diposting.`, po.id, po.id, user.id),
  };
};

export const adjustStock = (
  items: Item[],
  itemId: string,
  actualStock: number,
  referenceNo: string,
  note: string,
  user: User,
): { items: Item[]; movement: InventoryMovement; audit: AuditLog } => {
  const itemIndex = items.findIndex(item => item.id === itemId);
  if (itemIndex < 0) throw new Error('Barang opname tidak ditemukan.');
  if (!Number.isFinite(actualStock) || actualStock < 0) throw new Error('Stok fisik tidak boleh negatif.');

  const target = items[itemIndex];
  const nextItems = [...items];
  nextItems[itemIndex] = { ...target, stock: actualStock };

  return {
    items: nextItems,
    movement: createMovement(
      target,
      Math.abs(actualStock - target.stock),
      target.stock,
      actualStock,
      'STOCK_OPNAME',
      'ADJUSTMENT',
      referenceNo,
      user,
      note,
    ),
    audit: createAudit('STOCK_ADJUSTED', 'INVENTORY', user.name, `Opname ${referenceNo} mengubah stok ${target.name} dari ${target.stock} ke ${actualStock}.`, itemId, target.name, user.id),
  };
};
