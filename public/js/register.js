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
  const priceLinesEl = document.getElementById('price-lines');
  const priceTotalEl = document.getElementById('price-total');
  const messageEl = document.getElementById('form-message');
  const submitBtn = document.getElementById('submit-btn');

  const fallbackPricing = {
    campType: {
      iaido: { label: 'Iaido seminar', amountHuf: 149 },
      jodo: { label: 'Jodo seminar', amountHuf: 149 },
      both: { label: 'Iaido + Jodo seminar', amountHuf: 249 }
    },
    mealPlan: {
      none: { label: 'No meal', amountHuf: 0 },
      lunch: { label: 'Lunch package', amountHuf: 33 },
      full: { label: 'Full meal package', amountHuf: 60 }
    },
    accommodation: {
      none: { label: 'No accommodation', amountHuf: 0 },
      dojo: { label: 'Dojo accommodation', amountHuf: 73 },
      guesthouse: { label: 'Guesthouse', amountHuf: 135 }
    }
  };

  const displayLabels = {
    campType: {
      iaido: 'Iaido seminar',
      jodo: 'Jodo seminar',
      both: 'Iaido + Jodo seminar'
    },
    mealPlan: {
      none: 'No meal',
      lunch: 'Lunch package',
      full: 'Full meal package'
    },
    accommodation: {
      none: 'No accommodation',
      dojo: 'Dojo accommodation',
      guesthouse: 'Guesthouse'
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
    const fallbackGroup = displayLabels[groupName] || {};
    const pricingOption = group[code] || group[fallbackCode] || { amountHuf: 0 };
    const label = fallbackGroup[code] || fallbackGroup[fallbackCode] || code;
    return { label, amountHuf: Number(pricingOption.amountHuf || 0) };
  }

  function getPricingSelection() {
    const campType = String(campTypeEl.value || 'iaido');
    const mealPlan = String(mealPlanEl.value || 'none');
    const accommodation = String(accommodationEl.value || 'none');

    const lineItems = [
      { code: campType, ...getOption('campType', campType, 'iaido') },
      { code: mealPlan, ...getOption('mealPlan', mealPlan, 'none') },
      { code: accommodation, ...getOption('accommodation', accommodation, 'none') }
    ];

    const totalHuf = lineItems.reduce((sum, item) => sum + Number(item.amountHuf || 0), 0);

    return {
      campType,
      mealPlan,
      accommodation,
      lineItems,
      totalHuf
    };
  }

  function renderPriceSummary() {
    const pricing = getPricingSelection();

    priceLinesEl.innerHTML = pricing.lineItems
      .map((item) => `<li><span>${item.label}</span><strong>${formatCurrency(item.amountHuf, 'EUR')}</strong></li>`)
      .join('');

    priceTotalEl.textContent = formatCurrency(pricing.totalHuf, 'EUR');
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
      if (!response.ok) return;

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

      const amountText = result.pricing ? formatCurrency(result.pricing.totalHuf, result.pricing.currency || 'EUR') : 'unknown amount';
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
  mealPlanEl.addEventListener('change', renderPriceSummary);
  accommodationEl.addEventListener('change', renderPriceSummary);
  form.addEventListener('submit', submitForm);

  syncExamFields();
  loadPricingConfig();
})();
