/**
 * Cafe Kalya — Invoice Mode Frontend Logic
 * Triggered by double-tapping the ♨️ emoji on "قهوه‌های گرم" heading.
 */

(function () {
  'use strict';

  /* ── Persian numeral helpers ── */
  function faToEn(str) {
    if (!str) return '0';
    const m = { '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
    return str.toString().replace(/[۰-۹]/g, c => m[c]);
  }

  function enToFa(str) {
    if (str === null || str === undefined) return '';
    const m = { '0': '۰', '1': '۱', '2': '۲', '3': '۳', '4': '۴', '5': '۵', '6': '۶', '7': '۷', '8': '۸', '9': '۹' };
    return str.toString().replace(/[0-9]/g, c => m[c]);
  }

  function formatPrice(amount) {
    const n = parseInt(amount, 10) || 0;
    return enToFa(n.toLocaleString('fa-IR'));
  }

  /* ── State ── */
  let invoiceActive = false;
  let invoiceItems = new Map(); // name → { name, price, quantity }

  try {
    const saved = sessionStorage.getItem('kalya_invoice_state');
    if (saved) {
      const p = JSON.parse(saved);
      if (Array.isArray(p.items)) p.items.forEach(i => invoiceItems.set(i.name, i));
      invoiceActive = !!p.active;
    }
  } catch (_) { }

  function saveState() {
    try {
      if (!invoiceActive) {
        sessionStorage.removeItem('kalya_invoice_state');
      } else {
        sessionStorage.setItem('kalya_invoice_state', JSON.stringify({
          active: invoiceActive,
          items: Array.from(invoiceItems.values())
        }));
      }
    } catch (_) { }
  }

  /* ─────────────────────────────────────────────────────────
     TOAST NOTIFICATION (Shows when mode is toggled)
  ───────────────────────────────────────────────────────── */
  function showToast(message, isSuccess = true) {
    let toast = document.getElementById('ki-toast-notification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'ki-toast-notification';
      toast.className = 'ki-toast-notification no-print';
      document.body.appendChild(toast);
    }

    toast.className = `ki-toast-notification no-print ${isSuccess ? 'success' : 'off'} show`;
    toast.innerHTML = message;

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  /* ─────────────────────────────────────────────────────────
     DOUBLE TAP ATTACHMENT: Hot Coffee Heading (♨️ قهوه‌های گرم)
  ───────────────────────────────────────────────────────── */
  function attachSecretTrigger() {
    const headings = document.querySelectorAll('h2');
    let targetHeading = null;

    headings.forEach(h => {
      if (h.textContent.includes('قهوه‌های گرم')) {
        targetHeading = h;
      }
    });

    if (!targetHeading) return;

    // Make heading cursor pointer & subtle hint title
    targetHeading.style.cursor = 'pointer';

    // Desktop Double Click
    targetHeading.addEventListener('dblclick', (e) => {
      e.preventDefault();
      toggleInvoiceMode();
    });

    // Mobile Double Tap
    let lastTap = 0;
    targetHeading.addEventListener('touchstart', (e) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      // Trigger toggle on a single tap (or very quick double tap)
      if (tapLength < 300) {
        e.preventDefault();
        toggleInvoiceMode();
      }
      lastTap = currentTime;
    });
  }

  /* ─────────────────────────────────────────────────────────
     INJECT: Sticky bottom bar
  ───────────────────────────────────────────────────────── */
  function injectStickyBar() {
    if (document.getElementById('sticky-invoice-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'sticky-invoice-bar';
    bar.className = 'sticky-invoice-bar no-print';
    bar.innerHTML = `
      <!-- Expandable drawer -->
      <div id="invoice-drawer" class="invoice-drawer">
        <div class="invoice-drawer-scroll" id="invoice-drawer-list"></div>
        <div class="invoice-drawer-inputs">
          <input
            type="text"
            id="invoice-table-num"
            class="ki-input"
            style="width:130px"
            placeholder="شماره میز"
            autocomplete="off"
          />
          <input
            type="text"
            id="invoice-note-input"
            class="ki-input"
            style="width:220px"
            placeholder="یادداشت (اختیاری)"
            autocomplete="off"
          />
        </div>
      </div>

      <!-- Main bar strip -->
      <div class="invoice-bar-content">
        <div class="invoice-bar-left">
          <div class="invoice-summary-count" id="invoice-bar-count">فاکتور خالی است</div>
          <div class="invoice-summary-total" id="invoice-bar-total">
            ۰ تومان
          </div>
        </div>

        <div class="invoice-bar-right">
          <button
            type="button"
            class="btn invoice-drawer-toggle-btn"
            id="invoice-drawer-toggle"
          >
             ریز فاکتور
          </button>
          <button
            type="button"
            class="btn invoice-checkout-btn"
            id="invoice-checkout-btn"
          >
            صدور فاکتور
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(bar);

    document.getElementById('invoice-drawer-toggle').onclick = () => {
      const drawer = document.getElementById('invoice-drawer');
      const btn = document.getElementById('invoice-drawer-toggle');
      const open = drawer.classList.toggle('open');
      btn.classList.toggle('open', open);
    };

    document.getElementById('invoice-checkout-btn').onclick = submitCheckout;
  }

  /* ─────────────────────────────────────────────────────────
     PARSE: Walk menu DOM, attach steppers to each item
  ───────────────────────────────────────────────────────── */
  function parseMenuItems() {
    document.querySelectorAll('.menu-grid').forEach(grid => {
      const titles = grid.querySelectorAll('.menu-item-title');
      const prices = grid.querySelectorAll('.menu-price');

      for (let i = 0; i < Math.min(titles.length, prices.length); i++) {
        const titleEl = titles[i];
        const priceEl = prices[i];

        const name = titleEl.innerText.replace(/\n/g, ' ').trim();
        const rawPrice = priceEl.innerText.trim();

        if (!name || rawPrice === '-') continue;

        const priceNum = parseInt(faToEn(rawPrice.replace(/[^۰-۹0-9]/g, '')), 10) * 1_000;

        const priceParent = priceEl.parentElement;
        if (priceParent.querySelector('.invoice-item-stepper')) continue;

        const stepper = buildStepper(name, priceNum);
        priceParent.appendChild(stepper);
        syncStepper(stepper, name);
      }
    });
  }

  function buildStepper(name, priceNum) {
    const wrap = document.createElement('div');
    wrap.className = 'invoice-item-stepper';
    wrap.dataset.itemName = name;
    wrap.dataset.itemPrice = priceNum;
    wrap.style.display = invoiceActive ? 'flex' : 'none';

    wrap.innerHTML = `
      <button type="button" class="invoice-stepper-btn btn-plus" aria-label="افزودن">+</button>
      <span class="invoice-qty-badge">۰</span>
      <button type="button" class="invoice-stepper-btn btn-minus" aria-label="کاهش">−</button>
    `;

    wrap.querySelector('.btn-plus').onclick = e => { e.stopPropagation(); addItem(name, priceNum); };
    wrap.querySelector('.btn-minus').onclick = e => { e.stopPropagation(); removeItem(name); };

    return wrap;
  }

  function syncStepper(stepper, name) {
    const item = invoiceItems.get(name);
    const qty = item ? item.quantity : 0;
    const badge = stepper.querySelector('.invoice-qty-badge');
    if (badge) badge.textContent = enToFa(qty);
    stepper.classList.toggle('has-qty', qty > 0);
  }

  /* ─────────────────────────────────────────────────────────
     TOGGLE: Invoice mode on/off
  ───────────────────────────────────────────────────────── */
  function toggleInvoiceMode() {
    invoiceActive = !invoiceActive;

    if (invoiceActive) {
          showToast('حالت فاکتور فعال شد', true);
    } else {
          showToast('حالت فاکتور غیرفعال شد', false);
      // Fully reset state on disable
      invoiceItems.clear();
      const drawer = document.getElementById('invoice-drawer');
      const drawerBtn = document.getElementById('invoice-drawer-toggle');
      if (drawer) drawer.classList.remove('open');
      if (drawerBtn) drawerBtn.classList.remove('open');
      const tableNumInput = document.getElementById('invoice-table-num');
      const noteInput = document.getElementById('invoice-note-input');
      if (tableNumInput) tableNumInput.value = '';
      if (noteInput) noteInput.value = '';
      
      // Explicitly hide the sticky bar when disabling invoice mode
      const bar = document.getElementById('sticky-invoice-bar');
      if (bar) {
        bar.classList.remove('show');
        // Optionally, you could remove the element if it's meant to be completely gone
        // bar.remove(); 
      }
    }

    // Force hide/show all steppers on page
    document.querySelectorAll('.invoice-item-stepper').forEach(s => {
      s.style.display = invoiceActive ? 'flex' : 'none';
    });

    updateUI();
    saveState();
  }

  /* ─────────────────────────────────────────────────────────
     ITEM OPS
  ───────────────────────────────────────────────────────── */
  function addItem(name, price) {
    if (invoiceItems.has(name)) {
      invoiceItems.get(name).quantity += 1;
    } else {
      invoiceItems.set(name, { name, price, quantity: 1 });
    }
    updateUI();
    saveState();
  }

  function removeItem(name) {
    const item = invoiceItems.get(name);
    if (!item) return;
    item.quantity -= 1;
    if (item.quantity <= 0) invoiceItems.delete(name);
    updateUI();
    saveState();
  }

  /* ─────────────────────────────────────────────────────────
     UI UPDATE
  ───────────────────────────────────────────────────────── */
  function updateUI() {
    const bar = document.getElementById('sticky-invoice-bar');
    if (!bar) return;

    bar.classList.toggle('show', invoiceActive);

    // Sync all steppers on page
    document.querySelectorAll('.invoice-item-stepper').forEach(s => {
      syncStepper(s, s.dataset.itemName);
    });

    // Totals
    let totalQty = 0;
    let totalPrice = 0;
    invoiceItems.forEach(i => {
      totalQty += i.quantity;
      totalPrice += i.price * i.quantity;
    });

    // Count label
    const countEl = document.getElementById('invoice-bar-count');
    if (countEl) {
      countEl.textContent = totalQty > 0
        ? `${enToFa(totalQty)} آیتم انتخاب شده`
        : 'فاکتور خالی است';
    }

    // Total amount
    const totalEl = document.getElementById('invoice-bar-total');
    if (totalEl) {
      totalEl.innerHTML = `${formatPrice(totalPrice)} تومان`;
    }

    // Checkout button pulse
    const checkoutBtn = document.getElementById('invoice-checkout-btn');
    if (checkoutBtn) {
      checkoutBtn.classList.toggle('has-items', totalQty > 0);
    }

    // Drawer list
    renderDrawerList();
  }

  function renderDrawerList() {
    const list = document.getElementById('invoice-drawer-list');
    if (!list) return;

    if (invoiceItems.size === 0) {
      list.innerHTML = `<div class="invoice-drawer-empty">آیتمی به فاکتور اضافه نشده است.</div>`;
      return;
    }

    let html = '';
    invoiceItems.forEach(item => {
      const lineTotal = formatPrice(item.price * item.quantity);
      html += `
        <div class="invoice-drawer-item">
          <div style="flex:1;min-width:0">
            <span class="ki-drawer-item-name">${item.name}</span>
            <span class="ki-drawer-item-price">&nbsp;(${formatPrice(item.price)} تومان)</span>
          </div>
          <div style="font-weight:bold;color:#d4af37;direction:ltr;white-space:nowrap;margin-left:12px;">
            ${lineTotal}
          </div>
          <div class="ki-drawer-qty-controls">
            <button type="button"
              class="ki-drawer-qty-btn plus"
              data-name="${item.name}"
              data-price="${item.price}"
            >+</button>
            <span class="ki-drawer-qty-num">${enToFa(item.quantity)}</span>
            <button type="button"
              class="ki-drawer-qty-btn minus"
              data-name="${item.name}"
            >−</button>
          </div>
        </div>
      `;
    });
    list.innerHTML = html;

    list.querySelectorAll('.ki-drawer-qty-btn.plus').forEach(b => {
      b.onclick = () => addItem(b.dataset.name, parseInt(b.dataset.price, 10));
    });
    list.querySelectorAll('.ki-drawer-qty-btn.minus').forEach(b => {
      b.onclick = () => removeItem(b.dataset.name);
    });
  }

  /* ─────────────────────────────────────────────────────────
     CHECKOUT — POST to backend
  ───────────────────────────────────────────────────────── */
  async function submitCheckout() {
    if (invoiceItems.size === 0) {
      const bar = document.getElementById('sticky-invoice-bar');
      bar && bar.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-6px)' },
          { transform: 'translateX(6px)' },
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(0)' }
        ],
        { duration: 300, easing: 'ease-out' }
      );
      return;
    }

    const items = Array.from(invoiceItems.values());
    const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
    const tableNumber = document.getElementById('invoice-table-num')?.value.trim() || '';
    const receptionistNote = document.getElementById('invoice-note-input')?.value.trim() || '';

    const btn = document.getElementById('invoice-checkout-btn');
      if (btn) { btn.disabled = true; btn.textContent = 'در حال ثبت...'; }

    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, total, tableNumber, receptionistNote })
      });
      const data = await res.json();

      if (data.success && data.shareUrl) {
        invoiceItems.clear();
        invoiceActive = false;
        saveState();
        window.location.href = data.shareUrl;
      } else {
        alert('خطا: ' + (data.error || 'مشکل ناشناخته'));
        if (btn) { btn.disabled = false; btn.textContent = 'صدور فاکتور'; }
      }
    } catch (err) {
      console.error(err);
      alert('خطا در ارتباط با سرور');
      if (btn) { btn.disabled = false; btn.textContent = 'صدور فاکتور'; }
    }
  }

  /* ─────────────────────────────────────────────────────────
     INIT
  ───────────────────────────────────────────────────────── */
  function init() {
    attachSecretTrigger();
    injectStickyBar();
    parseMenuItems();
    updateUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
