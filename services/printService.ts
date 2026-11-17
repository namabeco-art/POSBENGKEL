import { Sale, PurchaseOrder, StoreProfile } from '../types';
import { describeSaleLine } from './pricing';
import { PAYMENT_METHOD_LABEL } from './salePayments';

const escapeHtml = (value: unknown): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const csvCell = (value: unknown): string => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const thermalStyles = `
  @page { margin: 0; }
  body { 
    margin: 0; 
    padding: 5mm; 
    font-family: 'Courier New', Courier, monospace; 
    font-size: 11px; 
    line-height: 1.2;
    width: 48mm; /* Safe width for 58mm thermal paper */
    color: #000;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: bold; }
  .line { border-bottom: 1px dashed #000; margin: 4px 0; }
  .item-row { display: flex; justify-content: space-between; margin: 2px 0; }
  .footer { margin-top: 10px; font-size: 9px; }
`;

const documentStyles = `
  body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; font-size: 12px; }
  .header { border-bottom: 3px solid #000; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
  .title { font-size: 24px; font-weight: 900; text-transform: uppercase; }
  table { width: 100%; border-collapse: collapse; margin: 15px 0; }
  th { text-align: left; background: #f1f5f9; padding: 10px; border: 1px solid #cbd5e1; text-transform: uppercase; font-size: 10px; }
  td { padding: 10px; border: 1px solid #cbd5e1; }
  .total-box { margin-top: 20px; text-align: right; font-weight: bold; font-size: 14px; border-top: 2px solid #000; padding-top: 10px; }
`;

const rupiah = (value: number) => Math.round(value || 0).toLocaleString('id-ID');

export const printReceipt = (sale: Sale, profile?: StoreProfile) => {
  const win = window.open('', '_blank');
  if (!win) {
    alert('Jendela cetak diblokir browser. Izinkan pop-up untuk aplikasi ini lalu coba cetak lagi.');
    return;
  }
  const storeName = profile?.name?.trim() || 'POS HULIO';

  win.document.write(`
    <html>
      <head>
        <title>Struk ${escapeHtml(sale.invoiceNo)}</title>
        <style>${thermalStyles}</style>
      </head>
      <body>
        <div class="center">
          <div class="bold" style="font-size: 14px;">${escapeHtml(storeName.toUpperCase())}</div>
          ${profile?.address ? `<div>${escapeHtml(profile.address)}</div>` : ''}
          ${profile?.phone ? `<div>${escapeHtml(profile.phone)}</div>` : ''}
          <div>--------------------------</div>
        </div>
        ${sale.status === 'VOID' ? '<div class="center bold" style="font-size: 14px;">*** VOID / DIBATALKAN ***</div>' : ''}
        <div>No: ${escapeHtml(sale.invoiceNo)}</div>
        <div>Tgl: ${escapeHtml(sale.date)}</div>
        <div>Pel: ${escapeHtml(sale.customerName)}</div>
        <div class="line"></div>
        ${sale.items.map(item => `
          <div class="bold">${escapeHtml(item.name.toUpperCase())}</div>
          <div class="item-row">
            <span>${escapeHtml(describeSaleLine(item).qtyText)} x ${describeSaleLine(item).priceText}</span>
            <span>${rupiah(item.discountAmount ? (item.grossTotal ?? item.total + item.discountAmount) : item.total)}</span>
          </div>
          ${item.discountAmount ? `<div class="item-row"><span>${item.isPromoGift ? 'BONUS PROMO' : `DISKON ${escapeHtml(item.discountText || '')}`}</span><span>-${rupiah(item.discountAmount)}</span></div>` : ''}
          ${item.serialNumbers?.length ? `<div>SN: ${escapeHtml(item.serialNumbers.join(', '))}</div>` : ''}
          ${item.warrantyDays ? `<div>Garansi ${item.warrantyDays} hari</div>` : ''}
        `).join('')}
        <div class="line"></div>
        <div class="item-row">
          <span>SUBTOTAL</span>
          <span>${rupiah(sale.subtotal)}</span>
        </div>
        ${sale.discountAmount && sale.discountAmount > 0 ? `
        <div class="item-row">
          <span>DISKON${sale.promoName ? ` (${escapeHtml(sale.promoName)})` : ''}</span>
          <span>-${rupiah(sale.discountAmount)}</span>
        </div>` : ''}
        <div class="item-row bold">
          <span>TOTAL</span>
          <span>${rupiah(sale.total)}</span>
        </div>
        ${sale.payments?.length
          ? sale.payments.map(payment => `<div class="item-row"><span>${escapeHtml(PAYMENT_METHOD_LABEL[payment.method] || payment.method).toUpperCase()}</span><span>${rupiah(payment.method === 'TUNAI' ? sale.amountReceived : payment.amount)}</span></div>`).join('')
          : `<div class="item-row">
          <span>BAYAR (${escapeHtml(sale.paymentMethod || sale.paymentType)})</span>
          <span>${rupiah(sale.amountReceived)}</span>
        </div>`}
        <div class="item-row">
          <span>KEMBALI</span>
          <span>${rupiah(sale.changeAmount)}</span>
        </div>
        <div class="line"></div>
        <div class="center footer">
          KASIR: ${escapeHtml(sale.operatorName)}<br>
          Terima kasih atas kunjungan Anda.
          ${profile?.receiptFooter ? `<br>${escapeHtml(profile.receiptFooter)}` : ''}
        </div>
        <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
      </body>
    </html>
  `);
  win.document.close();
};

export const printPurchaseOrder = (po: PurchaseOrder) => {
  const win = window.open('', '_blank');
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>PO ${escapeHtml(po.id)}</title>
        <style>${documentStyles}</style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Purchase Order</div>
            <div style="font-weight: bold; margin-top: 5px;">POS HULIO</div>
          </div>
          <div style="text-align: right;">
            <div>NO: ${escapeHtml(po.id)}</div>
            <div>TGL: ${escapeHtml(po.date)}</div>
          </div>
        </div>
        <div style="margin-bottom: 20px;">
          <strong>KEPADA SUPPLIER:</strong><br>
          ${escapeHtml(po.supplierName)}<br>
          Status: ${po.isPaid ? 'LUNAS' : 'TEMPO'}
        </div>
        <table>
          <thead>
            <tr>
              <th>No</th>
              <th>Nama Barang</th>
              <th>Qty Pesan</th>
              <th>Harga Satuan</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${po.items.map((i, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(i.name)}</td>
                <td>${i.orderedQty}</td>
                <td>Rp ${i.cost.toLocaleString()}</td>
                <td>Rp ${(i.orderedQty * i.cost).toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="total-box">
          TOTAL PEMBELIAN: Rp ${po.total.toLocaleString()}
        </div>
        <div style="margin-top: 40px; display: flex; justify-content: space-between;">
          <div style="text-align: center; width: 200px;">
            Dibuat Oleh,<br><br><br><br>
            ( .................... )
          </div>
          <div style="text-align: center; width: 200px;">
            Supplier,<br><br><br><br>
            ( ${escapeHtml(po.supplierName)} )
          </div>
        </div>
        <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
      </body>
    </html>
  `);
  win.document.close();
};

export const printSimpleReport = (title: string, columns: string[], data: any[][]) => {
  const win = window.open('', '_blank');
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>${documentStyles}</style>
      </head>
      <body>
        <div class="header">
          <div class="title">${escapeHtml(title)}</div>
          <div>Cetak: ${new Date().toLocaleString()}</div>
        </div>
        <table>
          <thead>
            <tr>
              ${columns.map(col => `<th>${escapeHtml(col)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>
                ${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
        <script>setTimeout(() => { window.print(); window.close(); }, 500);</script>
      </body>
    </html>
  `);
  win.document.close();
};

export const exportToExcel = (title: string, columns: string[], data: any[][]) => {
  const csvContent = [
    columns.map(csvCell).join(','),
    ...data.map(row => row.map(csvCell).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${title.toLowerCase().replace(/\s+/g, '_')}_${new Date().getTime()}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};
