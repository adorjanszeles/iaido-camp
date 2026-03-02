(function () {
  const form = document.getElementById('registration-form');
  if (!form) return;

  const wantsExamIaidoEl = document.getElementById('wantsExamIaido');
  const targetGradeIaidoEl = document.getElementById('targetGradeIaido');
  const wantsExamJodoEl = document.getElementById('wantsExamJodo');
  const targetGradeJodoEl = document.getElementById('targetGradeJodo');
  const campTypeEl = document.getElementById('campType');
  const mealPlanEl = document.getElementById('mealPlan');
  const accommodationEl = document.getElementById('accommodation');
  const paymentCurrencyEl = document.getElementById('paymentCurrency');
  const priceLinesEl = document.getElementById('price-lines');
  const priceTotalEl = document.getElementById('price-total');
  const messageEl = document.getElementById('form-message');
  const submitBtn = document.getElementById('submit-btn');

  const fallbackPricing = {
    campType: {
      iaido: { label: 'Iaido seminar', amounts: { EUR: 149, HUF: 59000 } },
      jodo: { label: 'Jodo seminar', amounts: { EUR: 149, HUF: 59000 } },
      both: { label: 'Iaido + Jodo seminar', amounts: { EUR: 249, HUF: 99000 } }
    },
    mealPlan: {
      none: { label: 'No meal', amounts: { EUR: 0, HUF: 0 } },
      lunch: { label: 'Lunch package', amounts: { EUR: 33, HUF: 13000 } },
      full: { label: 'Full meal package', amounts: { EUR: 60, HUF: 24000 } }
    },
    accommodation: {
      none: { label: 'No accommodation', amounts: { EUR: 0, HUF: 0 } },
      dojo: { label: 'Dojo accommodation', amounts: { EUR: 73, HUF: 29000 } },
      guesthouse: { label: 'Guesthouse', amounts: { EUR: 135, HUF: 54000 } }
    }
  };

  let pricingConfig = fallbackPricing;
  let currencyConfig = {
    enabled: ['EUR', 'HUF'],
    default: 'EUR'
  };

  function formatCurrency(value, currency = 'EUR') {
    const decimals = currency === 'HUF' ? 0 : 2;
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
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

  function getEnabledCurrencies() {
    return Array.isArray(currencyConfig.enabled) && currencyConfig.enabled.length > 0
      ? currencyConfig.enabled
      : ['EUR'];
  }

  function renderCurrencyOptions() {
    if (!paymentCurrencyEl) return;

    const enabled = getEnabledCurrencies();
    const current = String(paymentCurrencyEl.value || '').toUpperCase();
    paymentCurrencyEl.innerHTML = enabled
      .map((code) => `<option value="${code}">${code}</option>`)
      .join('');

    const defaultCurrency = enabled.includes(String(currencyConfig.default || '').toUpperCase())
      ? String(currencyConfig.default || '').toUpperCase()
      : enabled[0];

    paymentCurrencyEl.value = enabled.includes(current) ? current : defaultCurrency;
  }

  function getSelectedCurrency() {
    const enabled = getEnabledCurrencies();
    const selected = String(paymentCurrencyEl && paymentCurrencyEl.value ? paymentCurrencyEl.value : '').toUpperCase();
    if (enabled.includes(selected)) return selected;
    return enabled[0];
  }

  function getOption(groupName, code, fallbackCode, currency) {
    const group = pricingConfig[groupName] || {};
    const option = group[code] || group[fallbackCode] || null;
    if (!option) {
      return { label: code || fallbackCode || '-', amount: 0 };
    }

    const amount = Number(option.amounts && option.amounts[currency] != null ? option.amounts[currency] : 0);
    return {
      label: option.label || code || fallbackCode || '-',
      amount
    };
  }

  function getPricingSelection() {
    const campType = String(campTypeEl.value || 'iaido');
    const mealPlan = String(mealPlanEl.value || 'none');
    const accommodation = String(accommodationEl.value || 'none');
    const paymentCurrency = getSelectedCurrency();

    const lineItems = [
      { code: campType, ...getOption('campType', campType, 'iaido', paymentCurrency) },
      { code: mealPlan, ...getOption('mealPlan', mealPlan, 'none', paymentCurrency) },
      { code: accommodation, ...getOption('accommodation', accommodation, 'none', paymentCurrency) }
    ];

    const totalAmount = lineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      campType,
      mealPlan,
      accommodation,
      paymentCurrency,
      lineItems,
      totalAmount
    };
  }

  function renderPriceSummary() {
    const pricing = getPricingSelection();

    priceLinesEl.innerHTML = pricing.lineItems
      .map((item) => `<li><span>${item.label}</span><strong>${formatCurrency(item.amount, pricing.paymentCurrency)}</strong></li>`)
      .join('');

    priceTotalEl.textContent = formatCurrency(pricing.totalAmount, pricing.paymentCurrency);
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
      mealPlan: raw.get('mealPlan'),
      accommodation: raw.get('accommodation'),
      paymentCurrency: getSelectedCurrency(),
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

      if (result && result.currencies) {
        const enabledRaw = Array.isArray(result.currencies.enabled) ? result.currencies.enabled : ['EUR'];
        const enabled = enabledRaw
          .map((item) => String(item || '').trim().toUpperCase())
          .filter((item, index, arr) => (item === 'EUR' || item === 'HUF') && arr.indexOf(item) === index);

        const defaultCurrency = String(result.currencies.default || 'EUR').trim().toUpperCase();
        currencyConfig = {
          enabled: enabled.length > 0 ? enabled : ['EUR'],
          default: enabled.includes(defaultCurrency) ? defaultCurrency : (enabled[0] || 'EUR')
        };
      }
    } catch {
      pricingConfig = fallbackPricing;
      currencyConfig = {
        enabled: ['EUR', 'HUF'],
        default: 'EUR'
      };
    } finally {
      renderCurrencyOptions();
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
      const currency = String(result.pricing?.currency || payload.paymentCurrency || 'EUR').toUpperCase();
      const amountText = formatCurrency(amount, currency);
      form.reset();
      syncExamFields();
      renderCurrencyOptions();
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
  mealPlanEl.addEventListener('change', renderPriceSummary);
  accommodationEl.addEventListener('change', renderPriceSummary);
  if (paymentCurrencyEl) {
    paymentCurrencyEl.addEventListener('change', renderPriceSummary);
  }
  form.addEventListener('submit', submitForm);

  syncExamFields();
  renderCurrencyOptions();
  loadPricingConfig();
})();
