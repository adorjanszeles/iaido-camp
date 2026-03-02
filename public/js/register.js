(function () {
  const form = document.getElementById('registration-form');
  if (!form) return;

  const wantsExamIaidoEl = document.getElementById('wantsExamIaido');
  const targetGradeIaidoEl = document.getElementById('targetGradeIaido');
  const wantsExamJodoEl = document.getElementById('wantsExamJodo');
  const targetGradeJodoEl = document.getElementById('targetGradeJodo');
  const campTypeEl = document.getElementById('campType');
  const priceLinesEl = document.getElementById('price-lines');
  const priceTotalEl = document.getElementById('price-total');
  const messageEl = document.getElementById('form-message');
  const submitBtn = document.getElementById('submit-btn');

  const fallbackPricing = {
    campType: {
      iaido: { label: 'Iaido seminar', amount: 149 },
      jodo: { label: 'Jodo seminar', amount: 149 },
      both: { label: 'Iaido + Jodo seminar', amount: 249 }
    }
  };

  let pricingConfig = fallbackPricing;

  function formatCurrency(value, currency = 'EUR') {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function toggleTargetGrade(checkboxEl, targetEl) {
    const enabled = checkboxEl.checked;
    targetEl.disabled = !enabled;
    if (!enabled) {
      targetEl.value = '';
    }
  }

  function syncExamFields() {
    toggleTargetGrade(wantsExamIaidoEl, targetGradeIaidoEl);
    toggleTargetGrade(wantsExamJodoEl, targetGradeJodoEl);
  }

  function showMessage(type, text) {
    messageEl.className = `notice ${type}`;
    messageEl.textContent = text;
  }

  function getOption(groupName, code, fallbackCode) {
    const group = pricingConfig[groupName] || {};
    const option = group[code] || group[fallbackCode] || null;
    if (!option) {
      return { label: code || fallbackCode || '-', amount: 0 };
    }

    return {
      label: option.label || code || fallbackCode || '-',
      amount: Number(option.amount || 0)
    };
  }

  function getPricingSelection() {
    const campType = String(campTypeEl.value || 'iaido');
    const lineItems = [{ code: campType, ...getOption('campType', campType, 'iaido') }];

    const totalAmount = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      campType,
      lineItems,
      totalAmount
    };
  }

  function renderPriceSummary() {
    const pricing = getPricingSelection();

    priceLinesEl.innerHTML = pricing.lineItems
      .map((item) => `<li><span>${item.label}</span><strong>${formatCurrency(item.amount, 'EUR')}</strong></li>`)
      .join('');

    priceTotalEl.textContent = formatCurrency(pricing.totalAmount, 'EUR');
  }

  function formDataToPayload() {
    const raw = new FormData(form);
    return {
      fullName: raw.get('fullName'),
      email: raw.get('email'),
      phone: raw.get('phone'),
      dateOfBirth: raw.get('dateOfBirth'),
      city: raw.get('city'),
      currentGradeIaido: raw.get('currentGradeIaido'),
      currentGradeJodo: raw.get('currentGradeJodo'),
      campType: raw.get('campType'),
      wantsExamIaido: Boolean(raw.get('wantsExamIaido')),
      targetGradeIaido: raw.get('targetGradeIaido'),
      wantsExamJodo: Boolean(raw.get('wantsExamJodo')),
      targetGradeJodo: raw.get('targetGradeJodo'),
      billingFullName: raw.get('billingFullName'),
      billingZip: raw.get('billingZip'),
      billingCity: raw.get('billingCity'),
      billingAddress: raw.get('billingAddress'),
      billingCountry: raw.get('billingCountry'),
      foodNotes: raw.get('foodNotes'),
      privacyConsent: Boolean(raw.get('privacyConsent')),
      termsConsent: Boolean(raw.get('termsConsent'))
    };
  }

  async function loadPricingConfig() {
    try {
      const response = await fetch('/api/pricing');
      if (!response.ok) {
        throw new Error('Pricing config request failed.');
      }

      const result = await response.json();
      if (result && result.pricing) {
        pricingConfig = result.pricing;
      }
    } catch {
      pricingConfig = fallbackPricing;
    } finally {
      renderPriceSummary();
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    messageEl.className = '';
    messageEl.textContent = '';

    const payload = formDataToPayload();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Redirecting to payment...';

    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        const errorText = Array.isArray(result.errors) ? result.errors.join(' ') : result.error || 'An error occurred.';
        showMessage('error', errorText);
        return;
      }

      const amount = Number(result.pricing?.total ?? result.pricing?.totalAmount ?? result.pricing?.totalHuf ?? 0);
      const currency = String(result.pricing?.currency || 'EUR').toUpperCase();
      const amountText = formatCurrency(amount, currency);
      form.reset();
      syncExamFields();
      renderPriceSummary();
      showMessage(
        'ok',
        `Saved successfully (${result.registrationId}). Calculated total: ${amountText}. Stripe redirect is not enabled in demo mode yet.`
      );
    } catch (error) {
      showMessage('error', `Failed to submit the form: ${error.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Registration and Start Payment';
    }
  }

  wantsExamIaidoEl.addEventListener('change', syncExamFields);
  wantsExamJodoEl.addEventListener('change', syncExamFields);
  campTypeEl.addEventListener('change', renderPriceSummary);
  form.addEventListener('submit', submitForm);

  syncExamFields();
  loadPricingConfig();
})();
