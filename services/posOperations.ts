import {
  AuditLog,
  InventoryMovement,
  Item,
  PaymentRecord,
  PurchaseOrder,
  Sale,
  SaleReturn,
  User,
  Customer,
} from '../types';

const makeId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();

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
): { items: Item[]; movements: InventoryMovement[]; payment: PaymentRecord; audit: AuditLog; updatedCustomer?: Customer } => {
  const draftItems = [...items];
  const movements: InventoryMovement[] = [];

  for (const saleItem of sale.items) {
    const targetIndex = draftItems.findIndex(item => item.id === saleItem.itemId);
    if (targetIndex < 0) throw new Error(`Barang ${saleItem.name} tidak ditemukan.`);

    const currentItem = draftItems[targetIndex];
    if (saleItem.qty <= 0) throw new Error(`Qty jual ${saleItem.name} tidak valid.`);
    if (currentItem.stock < saleItem.qty) throw new Error(`Stok ${saleItem.name} tidak mencukupi.`);

    const newStock = currentItem.stock - saleItem.qty;
    draftItems[targetIndex] = { ...currentItem, stock: newStock };
    movements.push(createMovement(currentItem, saleItem.qty, currentItem.stock, newStock, 'SALE', 'OUT', sale.invoiceNo, user));
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
    const saleItem = originSale.items.find(item => item.itemId === returnItem.itemId);
    if (!saleItem) throw new Error(`Item ${returnItem.name} tidak ada di faktur asal.`);

    const maxReturnable = saleItem.qty - (existingReturnQty[returnItem.itemId] || 0);
    if (returnItem.qty <= 0 || returnItem.qty > maxReturnable) {
      throw new Error(`Qty retur ${returnItem.name} melebihi qty yang bisa diretur.`);
    }

    const itemIndex = nextItems.findIndex(item => item.id === returnItem.itemId);
    if (itemIndex < 0) throw new Error(`Barang ${returnItem.name} tidak ditemukan pada master barang.`);

    const currentItem = nextItems[itemIndex];
    const newStock = currentItem.stock + returnItem.qty;
    nextItems[itemIndex] = { ...currentItem, stock: newStock };
    movements.push(createMovement(currentItem, returnItem.qty, currentItem.stock, newStock, 'RETURN', 'IN', ret.returnNo, user, returnItem.reason));
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
): { items: Item[]; movements: InventoryMovement[]; audit: AuditLog } => {
  const nextItems = [...items];
  const movements: InventoryMovement[] = [];

  for (const update of updates) {
    const poItem = po.items.find(item => item.itemId === update.itemId);
    if (!poItem) throw new Error(`Item penerimaan tidak ada di PO ${po.id}.`);
    if (update.receivedQty < 0 || update.receivedQty > poItem.orderedQty) {
      throw new Error(`Qty terima ${poItem.name} tidak valid.`);
    }

    const itemIndex = nextItems.findIndex(item => item.id === update.itemId);
    if (itemIndex < 0) throw new Error(`Barang ${poItem.name} tidak ditemukan di master data.`);

    const currentItem = nextItems[itemIndex];
    const newStock = currentItem.stock + update.receivedQty;
    nextItems[itemIndex] = { ...currentItem, stock: newStock, basePrice: poItem.cost };
    movements.push(createMovement(currentItem, update.receivedQty, currentItem.stock, newStock, 'PURCHASE_RECEIPT', 'IN', po.id, user));
  }

  return {
    items: nextItems,
    movements,
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
  if (actualStock < 0) throw new Error('Stok fisik tidak boleh negatif.');

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
