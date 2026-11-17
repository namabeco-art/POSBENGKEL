/**
 * Layar pelanggan (customer display) di jendela/monitor kedua lewat BroadcastChannel.
 * Tidak butuh hardware khusus: buka POS → tombol "Layar Pelanggan" → seret jendela ke monitor kedua.
 */
export const CUSTOMER_DISPLAY_HASH = '#customer-display';
const CHANNEL = 'poshulio-customer-display';

export interface CustomerDisplayState {
  storeName: string;
  customerName: string;
  lines: Array<{ name: string; qtyText: string; total: number; discount?: number }>;
  subtotal: number;
  discount: number;
  total: number;
  paid?: number;
  change?: number;
  message?: string;
  updatedAt: string;
}

let channel: BroadcastChannel | null = null;
const getChannel = () => {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!channel) channel = new BroadcastChannel(CHANNEL);
  return channel;
};

export const publishCustomerDisplay = (state: CustomerDisplayState) => {
  try { getChannel()?.postMessage(state); } catch { /* jendela tertutup */ }
};

export const subscribeCustomerDisplay = (handler: (state: CustomerDisplayState) => void) => {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const listener = new BroadcastChannel(CHANNEL);
  listener.onmessage = event => handler(event.data as CustomerDisplayState);
  return () => listener.close();
};

export const openCustomerDisplayWindow = () => {
  const url = `${window.location.origin}${window.location.pathname}${CUSTOMER_DISPLAY_HASH}`;
  window.open(url, 'poshulio-customer-display', 'width=900,height=600');
};
