import { Sale, PurchaseOrder, Item, Customer, Account } from '../types';

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

export const printReceipt = (sale: Sale) => {
  const win = window.open('', '_blank');
  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>Struk ${sale.invoiceNo}</title>
        <style>${thermalStyles}</style>
      </head>
      <body>
        <div class="center">
          <div class="bold" style="font-size: 14px;">HGROUP ENTERPRISE</div>
          <div>Sistem iPOS 5 Pro</div>
          <div>--------------------------</div>
        </div>
        <div>No: ${sale.invoiceNo}</div>
        <div>Tgl: ${sale.date}</div>
        <div>Pel: ${sale.customerName}</div>
        <div class="line"></div>
        ${sale.items.map(item => `
          <div class="bold">${item.name.toUpperCase()}</div>
          <div class="item-row">
            <span>${item.qty} x ${item.price.toLocaleString()}</span>
            <span>${item.total.toLocaleString()}</span>
          </div>
        `).join('')}
        <div class="line"></div>
        <div class="item-row bold">
          <span>TOTAL</span>
          <span>${sale.total.toLocaleString()}</span>
        </div>
        <div class="item-row">
          <span>BAYAR</span>
          <span>${sale.amountReceived.toLocaleString()}</span>
        </div>
        <div class="item-row">
          <span>KEMBALI</span>
          <span>${sale.changeAmount.toLocaleString()}</span>
        </div>
        <div class="line"></div>
        <div class="center footer">
          KASIR: ${sale.operatorName}<br>
          Terima kasih atas kunjungan Anda.<br>
          Powered by H-AI Enterprise
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
        <title>PO ${po.id}</title>
        <style>${documentStyles}</style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">Purchase Order</div>
            <div style="font-weight: bold; margin-top: 5px;">HGROUP ENTERPRISE V5</div>
          </div>
          <div style="text-align: right;">
            <div>NO: ${po.id}</div>
            <div>TGL: ${po.date}</div>
          </div>
        </div>
        <div style="margin-bottom: 20px;">
          <strong>KEPADA SUPPLIER:</strong><br>
          ${po.supplierName}<br>
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
                <td>${i.name}</td>
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
            ( ${po.supplierName} )
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
        <title>${title}</title>
        <style>${documentStyles}</style>
      </head>
      <body>
        <div class="header">
          <div class="title">${title}</div>
          <div>Cetak: ${new Date().toLocaleString()}</div>
        </div>
        <table>
          <thead>
            <tr>
              ${columns.map(col => `<th>${col}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${data.map(row => `
              <tr>
                ${row.map(cell => `<td>${cell}</td>`).join('')}
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
    columns.join(','),
    ...data.map(row => row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(','))
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
};