(function () {
  const form = document.getElementById('registration-form');
  if (!form) return;

  const wantsExamEl = document.getElementById('wantsExam');
  const targetGradeEl = document.getElementById('targetGrade');
  const campTypeEl = document.getElementById('campType');
  const mealPlanEl = document.getElementById('mealPlan');
  const accommodationEl = document.getElementById('accommodation');
  const priceLinesEl = document.getElementById('price-lines');
  const priceTotalEl = document.getElementById('price-total');
  const messageEl = document.getElementById('form-message');
  const submitBtn = document.getElementById('submit-btn');

  const fallbackPricing = {
    campType: {
      iaido: { label: 'Iaidō tábor', amountHuf: 59000 },
      jodo: { label: 'Jōdō tábor', amountHuf: 59000 },
      both: { label: 'Iaidō + Jōdō tábor', amountHuf: 99000 }
    },
    mealPlan: {
      none: { label: 'Étkezés nélkül', amountHuf: 0 },
      lunch: { label: 'Ebéd csomag', amountHuf: 13000 },
      full: { label: 'Teljes étkezés', amountHuf: 24000 }
    },
    accommodation: {
      none: { label: 'Szállás nélkül', amountHuf: 0 },
      dojo: { label: 'Dojo szállás', amountHuf: 29000 },
      guesthouse: { label: 'Vendégház', amountHuf: 54000 }
    }
  };

  let pricingConfig = fallbackPricing;

  function formatHuf(value) {
    return `${Number(value || 0).toLocaleString('hu-HU')} HUF`;
  }

  function toggleTargetGrade() {
    const enabled = wantsExamEl.checked;
    targetGradeEl.disabled = !enabled;
    if (!enabled) {
      targetGradeEl.value = '';
    }
  }

  function showMessage(type, text) {
    messageEl.className = `notice ${type}`;
    messageEl.textContent = text;
  }

  function getOption(groupName, code, fallbackCode) {
    const group = pricingConfig[groupName] || {};
    return group[code] || group[fallbackCode] || { label: code, amountHuf: 0 };
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
      .map((item) => `<li><span>${item.label}</span><strong>${formatHuf(item.amountHuf)}</strong></li>`)
      .join('');

    priceTotalEl.textContent = formatHuf(pricing.totalHuf);
  }

  function formDataToPayload() {
    const raw = new FormData(form);
    return {
      fullName: raw.get('fullName'),
      email: raw.get('email'),
      phone: raw.get('phone'),
      dateOfBirth: raw.get('dateOfBirth'),
      city: raw.get('city'),
      currentGrade: raw.get('currentGrade'),
      campType: raw.get('campType'),
      mealPlan: raw.get('mealPlan'),
      accommodation: raw.get('accommodation'),
      wantsExam: Boolean(raw.get('wantsExam')),
      targetGrade: raw.get('targetGrade'),
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
    submitBtn.textContent = 'Továbbítás a fizetéshez...';

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
        const errorText = Array.isArray(result.errors) ? result.errors.join(' ') : result.error || 'Hiba történt.';
        showMessage('error', errorText);
        return;
      }

      const amountText = result.pricing ? formatHuf(result.pricing.totalHuf) : 'ismeretlen összeg';
      form.reset();
      toggleTargetGrade();
      renderPriceSummary();
      showMessage(
        'ok',
        `Sikeres mentés (${result.registrationId}). Kalkulált végösszeg: ${amountText}. Demo módban a Stripe átirányítás még nincs bekötve.`
      );
    } catch (error) {
      showMessage('error', `Nem sikerült elküldeni az űrlapot: ${error.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Jelentkezés és fizetés indítása';
    }
  }

  wantsExamEl.addEventListener('change', toggleTargetGrade);
  campTypeEl.addEventListener('change', renderPriceSummary);
  mealPlanEl.addEventListener('change', renderPriceSummary);
  accommodationEl.addEventListener('change', renderPriceSummary);
  form.addEventListener('submit', submitForm);

  toggleTargetGrade();
  loadPricingConfig();
})();
