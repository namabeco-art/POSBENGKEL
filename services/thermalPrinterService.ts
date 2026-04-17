import { Sale } from '../types';

export const isWebSerialSupported = () => {
  return 'serial' in navigator;
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
      cachedPort = await navigator.serial.requestPort({
        filters: [{ usbVendorId: 0x04b8 }] // Epson & standard thermal printers vendor ID. We can make it empty to allow all.
      });
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

export const printReceiptWebSerial = async (sale: Sale, companyName = "HULIO RETAIL") => {
  if (!isWebSerialSupported()) throw new Error('Web Serial API tidak didukung');

  const port = await connectThermalPrinter();
  const writer = port.writable.getWriter();
  
  const encoder = new TextEncoder();
  let cmds = '';

  // Header
  cmds += INIT;
  cmds += CENTER;
  cmds += BOLD_ON + companyName.toUpperCase() + BOLD_OFF + NEWLINE;
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
    const priceLine = `${item.qty} x ${item.price}`;
    const totalLine = `${item.total}`;
    cmds += formatLine(priceLine, totalLine) + NEWLINE;
  }
  cmds += '--------------------------------' + NEWLINE;
  
  // Totals
  cmds += formatLine('Subtotal', sale.subtotal.toString()) + NEWLINE;
  if (sale.discountAmount && sale.discountAmount > 0) {
    cmds += formatLine('Diskon', '-' + sale.discountAmount.toString()) + NEWLINE;
  }
  cmds += BOLD_ON + formatLine('TOTAL', sale.total.toString()) + BOLD_OFF + NEWLINE;
  cmds += formatLine(sale.paymentType, sale.amountReceived.toString()) + NEWLINE;
  cmds += formatLine('KEMBALI', sale.changeAmount.toString()) + NEWLINE;
  
  // Footer
  cmds += CENTER;
  cmds += '--------------------------------' + NEWLINE;
  if (sale.pointsEarned && sale.pointsEarned > 0) {
      cmds += `Anda mendapat ${sale.pointsEarned} Poin!` + NEWLINE;
  }
  cmds += 'Terima Kasih atas Kunjungan Anda' + NEWLINE;
  cmds += 'Barang yang sudah dibeli' + NEWLINE;
  cmds += 'tidak dapat ditukar/dikembalikan' + NEWLINE;
  
  // Cut paper
  cmds += NEWLINE + NEWLINE + NEWLINE;
  cmds += CUT;

  await writer.write(encoder.encode(cmds));
  writer.releaseLock();
};
