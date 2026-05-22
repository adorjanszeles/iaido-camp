(function () {
  const contentEl = document.getElementById('catering-content');
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

  function selectedDaysFromInputs() {
    return Array.from(contentEl.querySelectorAll('input[name="cateringDay"]'))
      .filter((input) => input.checked)
      .map((input) => String(input.value || '').trim())
      .filter(Boolean);
  }

  function updateAmount() {
    const amountEl = document.getElementById('catering-total');
    if (!amountEl) return;
    amountEl.textContent = formatCurrency(selectedDaysFromInputs().length * 12, 'EUR');
  }

  async function submitForm(event) {
    event.preventDefault();
    const messageEl = document.getElementById('catering-message');
    const submitBtn = document.getElementById('catering-submit-btn');
    const selection = Object.fromEntries(
      Array.from(contentEl.querySelectorAll('input[name="cateringDay"]')).map((input) => [String(input.value || '').trim(), input.checked])
    );

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Redirecting to payment...';
    }
    if (messageEl) {
      messageEl.className = '';
      messageEl.textContent = '';
    }

    try {
      const response = await fetch('/api/catering/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, cateringSelection: selection })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Could not save lunch registration.');
      }
      if (result?.payment?.checkoutUrl) {
        window.location.href = result.payment.checkoutUrl;
        return;
      }
      renderMessage('Lunch Registration Saved', `<p class="muted">Your lunch registration has been saved, but payment is not completed yet. Please contact the organizers at <a href="mailto:info@summerseminar2026.hu">info@summerseminar2026.hu</a>.</p>`);
    } catch (error) {
      if (messageEl) {
        messageEl.className = 'notice error';
        messageEl.textContent = error.message;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save lunch registration and start payment';
      }
    }
  }

  function renderReady(access) {
    const registration = access.registration || {};
    const catering = access.catering || { pricePerDay: 12, days: [] };
    contentEl.innerHTML = `
      <p class="muted">Select the days for which you would like to order lunch at the venue cafeteria.</p>
      <div class="registration-details-grid">
        <div class="registration-detail-item"><div class="registration-detail-label">Name</div><div class="registration-detail-value">${escapeHtml(registration.fullName || '-')}</div></div>
        <div class="registration-detail-item"><div class="registration-detail-label">Email</div><div class="registration-detail-value">${escapeHtml(registration.email || '-')}</div></div>
        <div class="registration-detail-item"><div class="registration-detail-label">Seminar package</div><div class="registration-detail-value">${escapeHtml(registration.campType || '-')}</div></div>
      </div>
      <p class="helper">Lunch is available at the venue cafeteria for ${formatCurrency(catering.pricePerDay || 12, 'EUR')} per person per day. Please note that the cafeteria is part of a university canteen, so individual dietary requests cannot be accommodated.</p>
      <form id="catering-form" novalidate>
        <div class="checkbox-group">
          ${(catering.days || []).map((day) => `<label class="checkline"><input type="checkbox" name="cateringDay" value="${escapeHtml(day.code)}" /> <span>${escapeHtml(day.label)}</span></label>`).join('')}
        </div>
        <section class="price-summary" aria-live="polite">
          <h3>Amount due</h3>
          <p class="price-total">Total: <strong id="catering-total">${formatCurrency(0, 'EUR')}</strong></p>
        </section>
        <div id="catering-message" aria-live="polite"></div>
        <div class="cta-row">
          <button class="btn primary" id="catering-submit-btn" type="submit">Save lunch registration and start payment</button>
        </div>
      </form>
    `;
    contentEl.querySelectorAll('input[name="cateringDay"]').forEach((input) => input.addEventListener('change', updateAmount));
    const form = document.getElementById('catering-form');
    if (form) {
      form.addEventListener('submit', submitForm);
    }
  }

  async function renderUnpaidOrder(orderIdentifier) {
    const amountText = orderIdentifier
      ? `<p class="muted">Lunch order ID: ${escapeHtml(orderIdentifier)}.</p>`
      : '';

    renderMessage(
      'Lunch Registration Saved',
      `<p class="muted">Your lunch registration was saved, but the payment is not completed yet.</p>
       ${amountText}
       <p class="muted">Please contact the organizers at <a href="mailto:info@summerseminar2026.hu">info@summerseminar2026.hu</a> if you need a new payment link.</p>`
    );
  }

  function renderSettled() {
    renderMessage('Everything Is Settled', '<p class="muted">Your lunch order has already been paid. No further action is required.</p>');
  }

  async function init() {
    if (state === 'unpaid') {
      await renderUnpaidOrder(orderId);
      return;
    }
    if (!token) {
      renderMessage('Invalid Lunch Registration Link', '<p class="muted">This lunch registration link is invalid or incomplete.</p>');
      return;
    }

    try {
      const response = await fetch(`/api/catering-access?token=${encodeURIComponent(token)}`);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Could not load this lunch registration page.');
      }

      if (result.state === 'ready') {
        renderReady(result);
        return;
      }
      if (result.state === 'registered_unpaid') {
        await renderUnpaidOrder(result?.cateringOrder?.id || '');
        return;
      }
      if (result.state === 'settled') {
        renderSettled();
        return;
      }

      throw new Error('This lunch registration link is no longer available.');
    } catch (error) {
      renderMessage('Lunch Registration Unavailable', `<p class="muted">${escapeHtml(error.message)}</p>`);
    }
  }

  init();
})();
