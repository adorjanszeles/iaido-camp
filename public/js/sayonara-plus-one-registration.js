(function () {
  const contentEl = document.getElementById('sayonara-guest-content');
  if (!contentEl) return;

  const url = new URL(window.location.href);
  const token = String(url.searchParams.get('token') || '').trim();
  const state = String(url.searchParams.get('state') || '').trim();
  const orderId = String(url.searchParams.get('order_id') || '').trim();

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCurrency(value, currency = 'EUR') {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function renderMessage(title, bodyHtml) {
    contentEl.innerHTML = `<h2 class="section-title">${escapeHtml(title)}</h2>${bodyHtml}`;
  }

  function getPackageCount() {
    return Math.max(0, Math.floor(Number(document.getElementById('sayonara-guest-spirits-package-count')?.value || 0) || 0));
  }

  function updateAmount() {
    const amountEl = document.getElementById('sayonara-guest-total');
    if (!amountEl) return;
    amountEl.textContent = formatCurrency(69 + (getPackageCount() * 30), 'EUR');
  }

  async function submitForm(event) {
    event.preventDefault();
    const messageEl = document.getElementById('sayonara-guest-message');
    const submitBtn = document.getElementById('sayonara-guest-submit-btn');
    const spiritsPackageCount = getPackageCount();
    const guestFullName = String(document.getElementById('sayonara-guest-full-name')?.value || '').trim();

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Redirecting to payment...';
    }
    if (messageEl) {
      messageEl.className = '';
      messageEl.textContent = '';
    }

    try {
      const response = await fetch('/api/sayonara-guest/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, guestFullName, spiritsPackageCount })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Could not save Sayonara +1 registration.');
      }
      if (result?.payment?.checkoutUrl) {
        window.location.href = result.payment.checkoutUrl;
        return;
      }
      renderMessage('Sayonara +1 Registration Saved', '<p class="muted">Your Sayonara Party +1 registration has been saved, but payment is not completed yet. Please contact the organizers at <a href="mailto:info@summerseminar2026.hu">info@summerseminar2026.hu</a>.</p>');
    } catch (error) {
      if (messageEl) {
        messageEl.className = 'notice error';
        messageEl.textContent = error.message;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save +1 registration and start payment';
      }
    }
  }

  function renderReady(access) {
    const registration = access.registration || {};
    const sayonara = access.sayonara || { basePrice: 69, spiritsPackagePrice: 30 };
    contentEl.innerHTML = `
      <p class="muted">Use this page to register one additional guest for the Saturday evening Sayonara Party.</p>
      <div class="registration-details-grid">
        <div class="registration-detail-item"><div class="registration-detail-label">Host registration</div><div class="registration-detail-value">${escapeHtml(registration.fullName || '-')}</div></div>
        <div class="registration-detail-item"><div class="registration-detail-label">Host email</div><div class="registration-detail-value">${escapeHtml(registration.email || '-')}</div></div>
        <div class="registration-detail-item"><div class="registration-detail-label">Seminar package</div><div class="registration-detail-value">${escapeHtml(registration.campType || '-')}</div></div>
      </div>
      <p class="helper">Sayonara Party guest price: ${formatCurrency(sayonara.basePrice || 69, 'EUR')} per person. Optional pálinka coupon package: ${formatCurrency(sayonara.spiritsPackagePrice || 30, 'EUR')} per package (10 shots).</p>
      <form id="sayonara-guest-form" novalidate>
        <div class="form-grid">
          <div class="field">
            <label for="sayonara-guest-full-name">Guest full name</label>
            <input id="sayonara-guest-full-name" maxlength="200" required />
          </div>
          <div class="field">
            <label for="sayonara-guest-spirits-package-count">Pálinka coupon packages</label>
            <input id="sayonara-guest-spirits-package-count" type="number" min="0" step="1" value="0" />
          </div>
        </div>
        <section class="price-summary" aria-live="polite">
          <h3>Amount due</h3>
          <p class="price-total">Total: <strong id="sayonara-guest-total">${formatCurrency(sayonara.basePrice || 69, 'EUR')}</strong></p>
        </section>
        <div id="sayonara-guest-message" aria-live="polite"></div>
        <div class="cta-row">
          <button class="btn primary" id="sayonara-guest-submit-btn" type="submit">Save +1 registration and start payment</button>
        </div>
      </form>
    `;
    document.getElementById('sayonara-guest-spirits-package-count')?.addEventListener('input', updateAmount);
    document.getElementById('sayonara-guest-form')?.addEventListener('submit', submitForm);
  }

  async function renderUnpaidOrder(orderIdentifier) {
    const amountText = orderIdentifier
      ? `<p class="muted">Sayonara +1 order ID: ${escapeHtml(orderIdentifier)}.</p>`
      : '';

    renderMessage(
      'Sayonara +1 Registration Saved',
      `<p class="muted">Your Sayonara Party +1 registration was saved, but the payment is not completed yet.</p>
       ${amountText}
       <p class="muted">Please contact the organizers at <a href="mailto:info@summerseminar2026.hu">info@summerseminar2026.hu</a> if you need a new payment link.</p>`
    );
  }

  function renderSettled() {
    renderMessage('Everything Is Settled', '<p class="muted">Your Sayonara Party +1 order has already been paid. No further action is required.</p>');
  }

  async function init() {
    if (state === 'unpaid') {
      await renderUnpaidOrder(orderId);
      return;
    }
    if (!token) {
      renderMessage('Invalid Sayonara +1 Registration Link', '<p class="muted">This Sayonara +1 registration link is invalid or incomplete.</p>');
      return;
    }

    try {
      const response = await fetch(`/api/sayonara-guest-access?token=${encodeURIComponent(token)}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Could not load this Sayonara +1 registration page.');
      }

      if (result.state === 'ready') {
        renderReady(result);
        return;
      }
      if (result.state === 'registered_unpaid') {
        await renderUnpaidOrder(result?.sayonaraGuestOrder?.id || '');
        return;
      }
      if (result.state === 'settled') {
        renderSettled();
        return;
      }

      throw new Error('This Sayonara +1 registration link is no longer available.');
    } catch (error) {
      renderMessage('Sayonara +1 Registration Unavailable', `<p class="muted">${escapeHtml(error.message)}</p>`);
    }
  }

  init();
})();
