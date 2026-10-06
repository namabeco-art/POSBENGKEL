import { Sale, StoreProfile } from '../types';
import { describeSaleLine } from './pricing';

export const isWebSerialSupported = () => {
  return 'serial' in navigator;
};

const THERMAL_PRINTER_KEY = 'POS_THERMAL_PRINTER';

/** Cetak langsung ke printer thermal (Web Serial) hanya jika diaktifkan di perangkat ini. */
export const isThermalPrinterEnabled = () => {
  try {
    return isWebSerialSupported() && localStorage.getItem(THERMAL_PRINTER_KEY) === 'on';
  } catch {
    return false;
  }
};

export const setThermalPrinterEnabled = (enabled: boolean) => {
  try {
    localStorage.setItem(THERMAL_PRINTER_KEY, enabled ? 'on' : 'off');
  } catch { /* storage penuh/diblokir */ }
};

// Common ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';
const INIT = ESC + '@'; // Initialize printer
const BOLD_ON = ESC + 'E' + '\x01';
const BOLD_OFF = ESC + 'E' + '\x00';
const CENTER = ESC + 'a' + '\x01';
const LEFT = ESC + 'a' + '\x00';
const CUT = GS + 'V' + '\x41' + '\x03'; // Partial cut
const NEWLINE = '\x0A';

let cachedPort: any = null;

export const connectThermalPrinter = async () => {
  if (!isWebSerialSupported()) {
    throw new Error('Browser tidak mendukung Web Serial API. Gunakan Chrome/Edge M89+');
  }

  try {
    if (!cachedPort) {
      // @ts-ignore
      // Tanpa filter vendor: printer thermal murah (bukan Epson) memakai vendor ID beragam.
      cachedPort = await navigator.serial.requestPort();
    }
    
    if (cachedPort.readable === null && cachedPort.writable === null) {
      await cachedPort.open({ baudRate: 9600 });
    }
    
    return cachedPort;
  } catch (err) {
    cachedPort = null;
    throw new Error('Gagal menghubungkan ke printer kasir.');
  }
};

const formatLine = (left: string, right: string, maxLength: number = 32) => {
  const spaceLength = maxLength - left.length - right.length;
  if (spaceLength > 0) {
    return left + ' '.repeat(spaceLength) + right;
  }
  return left + ' ' + right;
};

const rp = (value: number) => Math.round(value || 0).toLocaleString('id-ID');

export const printReceiptWebSerial = async (sale: Sale, profile?: StoreProfile) => {
  if (!isWebSerialSupported()) throw new Error('Web Serial API tidak didukung');
  const companyName = profile?.name?.trim() || 'POS HULIO';

  const port = await connectThermalPrinter();
  const writer = port.writable.getWriter();
  
  const encoder = new TextEncoder();
  let cmds = '';

  // Header
  cmds += INIT;
  cmds += CENTER;
  cmds += BOLD_ON + companyName.toUpperCase() + BOLD_OFF + NEWLINE;
  if (profile?.address) cmds += profile.address + NEWLINE;
  if (profile?.phone) cmds += profile.phone + NEWLINE;
  cmds += 'Struk Penjualan' + NEWLINE;
  cmds += '--------------------------------' + NEWLINE;
  
  // Info
  cmds += LEFT;
  cmds += `Inv   : ${sale.invoiceNo}` + NEWLINE;
  cmds += `Waktu : ${sale.date}` + NEWLINE;
  cmds += `Kasir : ${sale.operatorName}` + NEWLINE;
  cmds += '--------------------------------' + NEWLINE;
  
  // Items
  for (const item of sale.items) {
    cmds += item.name + NEWLINE;
    const label = describeSaleLine(item);
    const priceLine = `${label.qtyText} x ${label.priceText}`;
    const totalLine = rp(item.total);
    cmds += formatLine(priceLine, totalLine) + NEWLINE;
  }
  cmds += '--------------------------------' + NEWLINE;
  
  // Totals
  cmds += formatLine('Subtotal', rp(sale.subtotal)) + NEWLINE;
  if (sale.discountAmount && sale.discountAmount > 0) {
    cmds += formatLine('Diskon', '-' + rp(sale.discountAmount)) + NEWLINE;
  }
  cmds += BOLD_ON + formatLine('TOTAL', rp(sale.total)) + BOLD_OFF + NEWLINE;
  cmds += formatLine(sale.paymentMethod || sale.paymentType, rp(sale.amountReceived)) + NEWLINE;
  cmds += formatLine('KEMBALI', rp(sale.changeAmount)) + NEWLINE;
  
  // Footer
  cmds += CENTER;
  cmds += '--------------------------------' + NEWLINE;
  if (sale.pointsEarned && sale.pointsEarned > 0) {
      cmds += `Anda mendapat ${sale.pointsEarned} Poin!` + NEWLINE;
  }
  cmds += 'Terima Kasih atas Kunjungan Anda' + NEWLINE;
  if (profile?.receiptFooter) cmds += profile.receiptFooter + NEWLINE;
  
  // Cut paper
  cmds += NEWLINE + NEWLINE + NEWLINE;
  cmds += CUT;

  await writer.write(encoder.encode(cmds));
  writer.releaseLock();
};
