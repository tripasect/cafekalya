const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Ensure invoices storage directory exists
const INVOICES_DIR = path.join(__dirname, 'invoices');
if (!fs.existsSync(INVOICES_DIR)) {
  fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

// Serve static assets from project root
app.use(express.static(__dirname));
app.use('/invoices', express.static(INVOICES_DIR));

// Helper: Convert English digits to Persian
function toPersianDigits(str) {
  if (str === null || str === undefined) return '';
  const map = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return str.toString().replace(/[0-9]/g, (w) => map[parseInt(w, 10)]);
}

// Helper: Format price with thousand separators
function formatPrice(amount) {
  const num = parseInt(amount, 10) || 0;
  return toPersianDigits(num.toLocaleString('fa-IR'));
}

// Generate static HTML for an invoice
function renderInvoiceHtml(invoiceData) {
  const { id, items, total, date, tableNumber, receptionistNote, shareUrl, qrCodeDataUrl, cardNumber, phoneNumber } = invoiceData;

  const itemsHtml = items.map((item, index) => {
    const itemTotal = (parseInt(item.price, 10) || 0) * (parseInt(item.quantity, 10) || 1);
    return `
      <tr>
        <td class="col-num">${toPersianDigits(index + 1)}</td>
        <td class="col-name"><strong>${item.name}</strong></td>
        <td class="col-qty"><span class="qty-pill">${toPersianDigits(item.quantity)}</span></td>
        <td class="col-price">${formatPrice(item.price)}</td>
        <td class="col-total"><strong>${formatPrice(itemTotal)}</strong></td>
      </tr>
    `;
  }).join('');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاکتور ${toPersianDigits(id)} - کافه کالیا</title>
  <link rel="stylesheet" type="text/css" href="/css/bootstrap.min.css">
  <link rel="stylesheet" type="text/css" href="/style.css">
  <link rel="stylesheet" type="text/css" href="/fonts/noto/fonts.css">
  <link rel="stylesheet" type="text/css" href="/css/invoice.css">
  <script src="/js/html2canvas.min.js"></script>
</head>
<body class="invoice-page-body">
  <div class="container py-4">
    
    <!-- Top Action Bar (Hidden when printing) -->
    <div class="no-print invoice-actions-bar">
      <div class="invoice-action-buttons">
       <button onclick="window.print()" class="ki-btn-print">
         چاپ
       </button>
         <a href="https://ble.ir/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('فاکتور خرید شما از کافه کالیا:')}" target="_blank" class="ki-share-btn ki-share-bale">
           بله
         </a>
         <a href="https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('فاکتور خرید شما از کافه کالیا:')}" target="_blank" class="ki-share-btn ki-share-telegram">
           تلگرام
         </a>
         <a href="https://api.whatsapp.com/send?text=${encodeURIComponent('فاکتور خرید شما از کافه کالیا: ' + shareUrl)}" target="_blank" class="ki-share-btn ki-share-whatsapp">
           واتساپ
         </a>
         <a href="sms:?body=${encodeURIComponent('فاکتور خرید شما از کافه کالیا: ' + shareUrl)}" class="ki-share-btn ki-share-sms">
           پیامک
         </a>
      </div>
      <button onclick="saveToGallery()" class="ki-btn-gallery">
        ذخیره در گالری
      </button>
    </div>

    <!-- Printable High-Contrast Invoice Card -->
    <div class="invoice-card mx-auto">
      
      <!-- Brand Header -->
      <div class="invoice-header-strip">
        <h1 class="invoice-brand-name">کافه کالیا</h1>
        <div class="invoice-brand-sub">دهکده المپیک - بوستان جوانمردان</div>
        <div class="invoice-header-ornament"></div>
      </div>

      <!-- Invoice Details Grid -->
      <div class="invoice-meta-row">
        <div class="invoice-meta-item">
          <span class="ki-label">شماره فاکتور</span>
          <span class="ki-value">${toPersianDigits(id)}</span>
        </div>
        <div class="invoice-meta-item">
          <span class="ki-label">تاریخ و زمان</span>
          <span class="ki-value">${toPersianDigits(date)}</span>
        </div>
        ${tableNumber ? `
        <div class="invoice-meta-item">
          <span class="ki-label">شماره میز</span>
          <span class="ki-value">${toPersianDigits(tableNumber)}</span>
        </div>` : ''}
      </div>

      ${receptionistNote ? `
      <div class="invoice-note-box mt-3 mb-1">
        <strong>توضیحات:</strong> ${receptionistNote}
      </div>` : ''}

      <!-- Items Table -->
      <div class="invoice-body">
        <table class="invoice-table">
          <thead>
            <tr>
              <th style="width: 8%;">#</th>
              <th class="col-name">شرح آیتم</th>
              <th style="width: 14%;">تعداد</th>
              <th style="width: 25%;">قیمت (تومان)</th>
              <th style="width: 25%;">جمع (تومان)</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <!-- Totals Card -->
        <div class="invoice-total-section">
          <div class="invoice-total-card">
            <span class="invoice-total-label">جمع کل فاکتور:</span>
            <div class="invoice-total-amount">
              ${formatPrice(total)} <span class="invoice-total-currency">تومان</span>
            </div>
          </div>
        </div>

        <!-- Footer & QR Code -->
        <div class="invoice-footer">
          <p class="invoice-footer-text">از حضور و سفارش گرم شما در کافه کالیا سپاسگزاریم!</p>
          <div class="invoice-footer-contact">
            ${cardNumber ? `<p><strong>شماره کارت:</strong> ${toPersianDigits(cardNumber)}</p>` : ''}
            ${phoneNumber ? `<p><strong>موبایل:</strong> ${toPersianDigits(phoneNumber)}</p>` : ''}
          </div>
          <div class="invoice-qr-block no-print">
            <img src="${qrCodeDataUrl}" alt="QR Code فاکتور" class="qr-code-img" />
            <span class="invoice-qr-label">اسکن کنید جهت مشاهده آنلاین فاکتور</span>
          </div>
        </div>

      </div>

    </div>
  </div>

  <script>
    async function saveToGallery() {
      const btn = document.querySelector('.ki-btn-gallery');
      const originalText = btn.innerHTML;
      btn.innerHTML = 'در حال آماده‌سازی...';
      btn.disabled = true;

      try {
        console.log('Attempting to save to gallery...');
        const card = document.querySelector('.invoice-card');
        const canvas = await html2canvas(card, {
          useCORS: true,
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false
        });
        console.log('Canvas created:', canvas);

        canvas.toBlob(async (blob) => {
          console.log('Blob callback executed, blob:', blob);
          if (!blob) {
            console.error('Blob creation failed.');
            alert('خطا در ایجاد تصویر فاکتور');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
          }

          const fileName = 'invoice-${id}.png';
          const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

          if (isMobile && navigator.share && navigator.canShare) {
            try {
              const file = new File([blob], fileName, { type: 'image/png' });
              if (navigator.canShare({ files: [file] })) {
                await navigator.share({
                  files: [file],
                  title: 'فاکتور کافه کالیا',
                  text: 'فاکتور خرید شما از کافه کالیا'
                });
                btn.innerHTML = originalText;
                btn.disabled = false;
                return;
              }
            } catch (shareErr) {
              console.log('Share failed or was canceled, falling back to download:', shareErr);
            }
          }

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          
          setTimeout(() => {
            URL.revokeObjectURL(url);
            btn.innerHTML = originalText;
            btn.disabled = false;
          }, 100);

        }, 'image/png');

      } catch (err) {
        console.error('Error saving image:', err);
        alert('خطا در ذخیره فاکتور: ' + err.message);
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>`;
}

// API: Create new invoice
app.post('/api/invoices', async (req, res) => {
  try {
    const { items, total } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'منو / آیتم‌های فاکتور خالی است.' });
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('fa-IR', { timeZone: 'Asia/Tehran' }) + ' ' + 
                    now.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tehran' });

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoiceId = `KAL-${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}-${randomSuffix}`;

    const cardNumber = '۶۲۱۹‌‎ ۸۶۱۹‌‎ ۲۴۲۰‌‎ ۱۵۶۸';
    const phoneNumber = '۰۹۱۲۲۷۰۲۷۶۴';

    // Compute shareable URL
    const host = req.get('host');
    const protocol = req.protocol;
    const shareUrl = `${protocol}://${host}/invoices/${invoiceId}.html`;

    // Generate QR Code
    const qrCodeDataUrl = await QRCode.toDataURL(shareUrl, {
      margin: 1,
      width: 180,
      color: {
        dark: '#2c1810',
        light: '#ffffff'
      }
    });

    const invoiceData = {
      id: invoiceId,
      items,
      total,
      date: dateStr,
      shareUrl,
      qrCodeDataUrl,
      cardNumber,
      phoneNumber
    };

    // Save JSON data
    fs.writeFileSync(path.join(INVOICES_DIR, `${invoiceId}.json`), JSON.stringify(invoiceData, null, 2));

    // Save rendered HTML file
    const htmlContent = renderInvoiceHtml(invoiceData);
    fs.writeFileSync(path.join(INVOICES_DIR, `${invoiceId}.html`), htmlContent);

    return res.json({
      success: true,
      invoiceId,
      shareUrl,
      qrCodeDataUrl
    });

  } catch (err) {
    console.error('Error generating invoice:', err);
    res.status(500).json({ error: 'خطا در ثبت فاکتور' });
  }
});

// API: Get invoice JSON data
app.get('/api/invoices/:id', (req, res) => {
  const filePath = path.join(INVOICES_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'فاکتور یافت نشد' });
  }
  const data = fs.readFileSync(filePath, 'utf8');
  res.json(JSON.parse(data));
});

const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`☕ Cafe Kalya server running at http://localhost:${port}`);
  });
  
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error(err);
    }
  });
};

startServer(PORT);
