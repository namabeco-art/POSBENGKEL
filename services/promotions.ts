import { PromotionCampaign } from '../types';

const toMinutes = (hhmm?: string): number | null => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
};

/**
 * Apakah promo berlaku saat ini: aktif, dalam rentang tanggal, hari & jam yang ditentukan,
 * dan level pelanggan memenuhi. Jam yang melewati tengah malam (22:00–02:00) didukung.
 */
export const isPromotionActiveAt = (promo: PromotionCampaign, now: Date, customerLevel = 1): boolean => {
  if (!promo.isActive) return false;
  const time = now.getTime();
  const start = new Date(promo.startAt).getTime();
  if (Number.isFinite(start) && time < start) return false;
  if (promo.endAt) {
    const end = new Date(promo.endAt).getTime();
    if (Number.isFinite(end) && time > end) return false;
  }
  if (customerLevel < (promo.minCustomerLevel || 1)) return false;
  if (Array.isArray(promo.daysOfWeek) && promo.daysOfWeek.length > 0 && !promo.daysOfWeek.includes(now.getDay())) return false;
  const startMin = toMinutes(promo.timeStart);
  const endMin = toMinutes(promo.timeEnd);
  if (startMin !== null && endMin !== null) {
    const current = now.getHours() * 60 + now.getMinutes();
    const inside = startMin <= endMin ? current >= startMin && current <= endMin : current >= startMin || current <= endMin;
    if (!inside) return false;
  }
  return true;
};

const byPriority = (a: PromotionCampaign, b: PromotionCampaign) => (a.priority ?? 99) - (b.priority ?? 99);

/** Promo faktur (diskon %/Rp) yang bisa dipilih kasir, diurutkan prioritas. */
export const getTransactionPromotions = (promos: PromotionCampaign[], now: Date, customerLevel: number, subtotal: number) =>
  promos
    .filter(promo => (promo.kind || 'TRANSACTION') === 'TRANSACTION')
    .filter(promo => isPromotionActiveAt(promo, now, customerLevel))
    .filter(promo => !(promo.minSubtotal && subtotal < promo.minSubtotal))
    .sort(byPriority);

export const computePromotionDiscount = (promo: PromotionCampaign | null | undefined, subtotal: number): number => {
  if (!promo || subtotal <= 0) return 0;
  if (promo.type === 'PERCENT') return Math.min(subtotal, Math.round(subtotal * (Math.min(100, Math.max(0, promo.value)) / 100)));
  return Math.min(subtotal, Math.max(0, Math.round(promo.value)));
};

export interface PromoGift {
  promoId: string;
  promoName: string;
  freeItemId: string;
  /** Jumlah bonus dalam satuan dasar. */
  freeQty: number;
}

/**
 * Bonus Beli X Gratis Y. `boughtQty` = jumlah yang dibeli per barang (satuan dasar, tanpa baris bonus).
 * Satu barang pembelian hanya memicu satu promo (prioritas tertinggi) agar bonus tidak dobel.
 */
export const computePromoGifts = (
  promos: PromotionCampaign[],
  boughtQty: Map<string, number>,
  now: Date,
  customerLevel: number,
): PromoGift[] => {
  const gifts: PromoGift[] = [];
  const usedBuyItems = new Set<string>();
  promos
    .filter(promo => promo.kind === 'BUY_X_GET_Y')
    .filter(promo => isPromotionActiveAt(promo, now, customerLevel))
    .sort(byPriority)
    .forEach(promo => {
      if (!promo.buyItemId || !promo.freeItemId || !(promo.buyQty && promo.buyQty > 0) || !(promo.freeQty && promo.freeQty > 0)) return;
      if (usedBuyItems.has(promo.buyItemId)) return;
      const bought = boughtQty.get(promo.buyItemId) || 0;
      if (bought < promo.buyQty) return;
      const times = promo.isMultiple ? Math.floor(bought / promo.buyQty) : 1;
      usedBuyItems.add(promo.buyItemId);
      gifts.push({ promoId: promo.id, promoName: promo.name, freeItemId: promo.freeItemId, freeQty: times * promo.freeQty });
    });
  return gifts;
};
