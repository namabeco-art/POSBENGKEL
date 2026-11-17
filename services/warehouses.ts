import { InventoryMovement, Item, StockTransfer, User, Warehouse } from '../types';
import { createId } from './idService';

export const DEFAULT_WAREHOUSE_ID = 'W1';
export const DEFAULT_WAREHOUSE: Warehouse = { id: DEFAULT_WAREHOUSE_ID, name: 'Gudang Utama', location: 'Toko', isActive: true };

/** Daftar gudang dengan gudang utama selalu ada di urutan pertama. */
export const withDefaultWarehouse = (warehouses: Warehouse[] = []): Warehouse[] => {
  const others = warehouses.filter(warehouse => warehouse.id !== DEFAULT_WAREHOUSE_ID);
  const main = warehouses.find(warehouse => warehouse.id === DEFAULT_WAREHOUSE_ID) || DEFAULT_WAREHOUSE;
  return [main, ...others];
};

/** Stok barang di satu gudang. Gudang utama = stok total - stok gudang lain. */
export const getWarehouseStock = (item: Pick<Item, 'stock' | 'stockByWarehouse'>, warehouseId: string): number => {
  const others = item.stockByWarehouse || {};
  if (warehouseId === DEFAULT_WAREHOUSE_ID) {
    const allocated = Object.values(others).reduce((sum, qty) => sum + (Number(qty) || 0), 0);
    return (item.stock || 0) - allocated;
  }
  return Number(others[warehouseId] || 0);
};

/** Ubah stok satu gudang non-utama sebesar delta (stok total ikut berubah oleh pemanggil bila perlu). */
export const shiftWarehouseStock = (item: Item, warehouseId: string, delta: number): Item => {
  if (warehouseId === DEFAULT_WAREHOUSE_ID || !delta) return item;
  const current = Number(item.stockByWarehouse?.[warehouseId] || 0);
  const nextQty = current + delta;
  const nextMap = { ...(item.stockByWarehouse || {}) };
  if (nextQty === 0) delete nextMap[warehouseId];
  else nextMap[warehouseId] = nextQty;
  return { ...item, stockByWarehouse: Object.keys(nextMap).length ? nextMap : undefined };
};

/**
 * Pindahkan stok antar gudang. Stok total tidak berubah; dua mutasi TRANSFER dicatat
 * (keluar dari gudang asal, masuk ke gudang tujuan) dengan stok total sebelum = sesudah.
 */
export const transferStock = (
  items: Item[],
  transfer: Omit<StockTransfer, 'createdAt' | 'operatorName' | 'operatorId'>,
  user: Pick<User, 'id' | 'name'>,
  now = new Date().toISOString(),
): { items: Item[]; movements: InventoryMovement[]; transfer: StockTransfer } => {
  if (transfer.fromWarehouseId === transfer.toWarehouseId) throw new Error('Gudang asal dan tujuan harus berbeda.');
  if (!transfer.items.length) throw new Error('Pilih minimal satu barang yang dipindahkan.');
  const nextItems = [...items];
  const movements: InventoryMovement[] = [];
  for (const line of transfer.items) {
    if (!(Number.isFinite(line.qty) && line.qty > 0)) throw new Error(`Qty pindah ${line.name} tidak valid.`);
    const index = nextItems.findIndex(item => item.id === line.itemId);
    if (index < 0) throw new Error(`Barang ${line.name} tidak ditemukan.`);
    const item = nextItems[index];
    if (item.itemType === 'JASA' || item.isBundle) throw new Error(`${item.name} tidak punya stok fisik.`);
    const available = getWarehouseStock(item, transfer.fromWarehouseId);
    if (available < line.qty) throw new Error(`Stok ${item.name} di gudang asal hanya ${available}.`);
    let moved = shiftWarehouseStock(item, transfer.fromWarehouseId, -line.qty);
    moved = shiftWarehouseStock(moved, transfer.toWarehouseId, line.qty);
    nextItems[index] = moved;
    const base = {
      itemId: item.id,
      itemName: item.name,
      type: 'TRANSFER' as const,
      direction: 'ADJUSTMENT' as const,
      quantity: line.qty,
      previousStock: item.stock,
      newStock: item.stock,
      referenceNo: transfer.transferNo,
      operatorName: user.name,
      operatorId: user.id,
      createdAt: now,
      unitCost: item.basePrice || 0,
    };
    movements.push({ ...base, id: createId('MOV'), warehouseId: transfer.fromWarehouseId, note: `Pindah ke ${transfer.toWarehouseId}` });
    movements.push({ ...base, id: createId('MOV'), warehouseId: transfer.toWarehouseId, note: `Dari ${transfer.fromWarehouseId}` });
  }
  return { items: nextItems, movements, transfer: { ...transfer, createdAt: now, operatorName: user.name, operatorId: user.id } };
};

/**
 * Perubahan stok satu gudang akibat sebuah mutasi.
 * TRANSFER: keluar = baris dengan catatan "Pindah ke", masuk = "Dari".
 */
export const warehouseMovementDelta = (movement: InventoryMovement): number => {
  if (movement.type === 'TRANSFER') {
    return (movement.note || '').startsWith('Pindah ke') ? -movement.quantity : movement.quantity;
  }
  if (movement.direction === 'OUT') return -movement.quantity;
  if (movement.direction === 'IN') return movement.quantity;
  return (movement.newStock ?? 0) - (movement.previousStock ?? 0);
};
