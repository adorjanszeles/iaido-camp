(function () {
  const form = document.getElementById('registration-form');
  if (!form) return;

  const wantsExamIaidoEl = document.getElementById('wantsExamIaido');
  const targetGradeIaidoEl = document.getElementById('targetGradeIaido');
  const wantsExamJodoEl = document.getElementById('wantsExamJodo');
  const targetGradeJodoEl = document.getElementById('targetGradeJodo');
  const currentGradeIaidoEl = document.getElementById('currentGradeIaido');
  const currentGradeJodoEl = document.getElementById('currentGradeJodo');
  const dateOfBirthEl = document.getElementById('dateOfBirth');
  const dateOfBirthPickerEl = document.getElementById('dateOfBirthPicker');
  const dateOfBirthTriggerEl = document.querySelector('.date-picker-single');
  const campTypeEl = document.getElementById('campType');
  const attendanceDayWrapEl = document.getElementById('attendanceDayWrap');
  const attendanceDayEl = document.getElementById('attendanceDay');
  const halfDayFixedNoticeEl = document.getElementById('halfDayFixedNotice');
  const priceLinesEl = document.getElementById('price-lines');
  const priceTotalEl = document.getElementById('price-total');
  const messageEl = document.getElementById('form-message');
  const submitBtn = document.getElementById('submit-btn');
  const campTypesRequiringAttendanceDay = new Set(['one_day', 'one_and_half_days']);
  const halfDayFixedAttendanceDay = '2026-08-01';
  const gradeOrder = [
    'Mukyu',
    '2. kyu',
    '1. kyu',
    '1. dan',
    '2. dan',
    '3. dan',
    '4. dan',
    '5. dan',
    '6. dan',
    '7. dan',
    '8. dan'
  ];
  const allowedExamTargets = new Set(['2. kyu', '1. kyu', '1. dan', '2. dan', '3. dan', '4. dan', '5. dan']);

  const fallbackPricing = {
    campType: {
      full_seminar: { label: 'Full seminar', amount: 249 },
      jodo_part_only: { label: 'Jodo part only', amount: 149 },
      iaido_part_only: { label: 'Iaido part only', amount: 149 },
      one_and_half_days: { label: 'One and a half days', amount: 189 },
      one_day: { label: 'One day', amount: 129 },
      half_day: { label: 'Half day', amount: 79 }
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

  function getNextGrade(currentGrade) {
    const index = gradeOrder.indexOf(String(currentGrade || '').trim());
    if (index < 0) return '';
    return gradeOrder[index + 1] || '';
  }

  function setTargetOptions(targetEl, nextGrade) {
    targetEl.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = nextGrade ? 'Select target grade' : 'No eligible target grade';
    targetEl.appendChild(placeholder);

    if (nextGrade) {
      const option = document.createElement('option');
      option.value = nextGrade;
      option.textContent = nextGrade;
      targetEl.appendChild(option);
      targetEl.value = nextGrade;
    } else {
      targetEl.value = '';
    }
  }

  function syncExamField(checkboxEl, currentGradeEl, targetEl) {
    const currentGrade = String(currentGradeEl.value || '').trim();
    const nextGrade = getNextGrade(currentGrade);
    const allowedNextGrade = allowedExamTargets.has(nextGrade) ? nextGrade : '';

    if (!checkboxEl.checked) {
      targetEl.disabled = true;
      targetEl.value = '';
      return;
    }

    targetEl.disabled = !allowedNextGrade;
    setTargetOptions(targetEl, allowedNextGrade);
  }

  function syncExamFields() {
    syncExamField(wantsExamIaidoEl, currentGradeIaidoEl, targetGradeIaidoEl);
    syncExamField(wantsExamJodoEl, currentGradeJodoEl, targetGradeJodoEl);
  }

  function showMessage(type, text) {
    messageEl.className = `notice ${type}`;
    messageEl.textContent = text;
  }

  function dottedFromIsoDate(isoDate) {
    const match = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    return `${match[1]}.${match[2]}.${match[3]}`;
  }

  function isoFromDottedDate(dottedDate) {
    const match = String(dottedDate || '').match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    if (!match) return '';
    return `${match[1]}-${match[2]}-${match[3]}`;
  }

  function syncBirthDateFromPicker() {
    if (!dateOfBirthEl || !dateOfBirthPickerEl) return;
    dateOfBirthEl.value = dottedFromIsoDate(dateOfBirthPickerEl.value);
  }

  function openBirthDatePicker() {
    if (!dateOfBirthPickerEl) return;
    if (typeof dateOfBirthPickerEl.showPicker === 'function') {
      dateOfBirthPickerEl.showPicker();
      return;
    }
    dateOfBirthPickerEl.focus();
    dateOfBirthPickerEl.click();
  }

  function showPaymentReturnMessage() {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const payment = String(params.get('payment') || '').trim().toLowerCase();
    if (!payment) return;

    if (payment === 'success') {
      showMessage('ok', 'Payment process completed. Your payment status will be finalized shortly.');
    } else if (payment === 'cancel') {
      showMessage('error', 'Payment was cancelled. You can try again using your payment link.');
    }

    params.delete('payment');
    params.delete('registrationId');
    const nextUrl = `${url.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    window.history.replaceState({}, document.title, nextUrl);
  }

  function syncAttendanceDayField() {
    const campType = String(campTypeEl?.value || '').trim();
    const isHalfDay = campType === 'half_day';
    const required = campTypesRequiringAttendanceDay.has(campType);
    if (!attendanceDayWrapEl || !attendanceDayEl) return;

    attendanceDayWrapEl.hidden = !required;
    attendanceDayEl.required = required;
    attendanceDayEl.disabled = !required;
    if (isHalfDay) {
      attendanceDayEl.value = halfDayFixedAttendanceDay;
    } else if (!required) {
      attendanceDayEl.value = '';
    }
    if (halfDayFixedNoticeEl) {
      halfDayFixedNoticeEl.hidden = !isHalfDay;
    }
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
    const campType = String(campTypeEl.value || 'full_seminar');
    const lineItems = [{ code: campType, ...getOption('campType', campType, 'full_seminar') }];

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
    const campType = String(raw.get('campType') || '').trim();
    const attendanceDay = campType === 'half_day'
      ? halfDayFixedAttendanceDay
      : raw.get('attendanceDay');
    return {
      fullName: raw.get('fullName'),
      email: raw.get('email'),
      phone: raw.get('phone'),
      dateOfBirth: raw.get('dateOfBirth'),
      city: raw.get('city'),
      currentGradeIaido: raw.get('currentGradeIaido'),
      currentGradeJodo: raw.get('currentGradeJodo'),
      campType,
      attendanceDay,
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

  function validateExamProgression(payload) {
    const errors = [];

    if (campTypesRequiringAttendanceDay.has(String(payload.campType || '').trim()) && !String(payload.attendanceDay || '').trim()) {
      errors.push('Please select the attendance day for this participation type.');
    }
    if (String(payload.campType || '').trim() === 'half_day' && String(payload.attendanceDay || '').trim() !== halfDayFixedAttendanceDay) {
      errors.push('Half-day participation is fixed to the transition day (Day 3).');
    }

    if (payload.wantsExamIaido) {
      const nextIaido = getNextGrade(payload.currentGradeIaido);
      if (!allowedExamTargets.has(nextIaido)) {
        errors.push('Iaido exam is only available when the next grade is between 2. kyu and 5. dan.');
      } else if (String(payload.targetGradeIaido || '').trim() !== nextIaido) {
        errors.push('Iaido exam target grade must be exactly one level above the current Iaido grade.');
      }
    }

    if (payload.wantsExamJodo) {
      const nextJodo = getNextGrade(payload.currentGradeJodo);
      if (!allowedExamTargets.has(nextJodo)) {
        errors.push('Jodo exam is only available when the next grade is between 2. kyu and 5. dan.');
      } else if (String(payload.targetGradeJodo || '').trim() !== nextJodo) {
        errors.push('Jodo exam target grade must be exactly one level above the current Jodo grade.');
      }
    }

    return errors;
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
    const examErrors = validateExamProgression(payload);
    if (examErrors.length > 0) {
      showMessage('error', examErrors.join(' '));
      return;
    }

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
      const checkoutUrl = String(result.payment?.checkoutUrl || '').trim();
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      form.reset();
      if (dateOfBirthPickerEl) dateOfBirthPickerEl.value = '';
      if (dateOfBirthEl) dateOfBirthEl.value = '';
      syncExamFields();
      syncAttendanceDayField();
      renderPriceSummary();
      showMessage('error', `Registration saved (${result.registrationId}), but payment link creation failed. Amount: ${amountText}. Please contact the organizer.`);
    } catch (error) {
      showMessage('error', `Failed to submit the form: ${error.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Registration and Start Payment';
    }
  }

  wantsExamIaidoEl.addEventListener('change', syncExamFields);
  wantsExamJodoEl.addEventListener('change', syncExamFields);
  currentGradeIaidoEl.addEventListener('change', syncExamFields);
  currentGradeJodoEl.addEventListener('change', syncExamFields);
  if (dateOfBirthPickerEl) {
    dateOfBirthPickerEl.addEventListener('change', syncBirthDateFromPicker);
  }
  if (dateOfBirthEl) {
    dateOfBirthEl.addEventListener('click', openBirthDatePicker);
  }
  if (dateOfBirthTriggerEl) {
    dateOfBirthTriggerEl.addEventListener('click', (event) => {
      const clickedPicker = event.target === dateOfBirthPickerEl;
      if (clickedPicker) return;
      openBirthDatePicker();
    });
  }
  campTypeEl.addEventListener('change', () => {
    syncAttendanceDayField();
    renderPriceSummary();
  });
  form.addEventListener('submit', submitForm);

  if (dateOfBirthEl && dateOfBirthPickerEl && dateOfBirthEl.value) {
    dateOfBirthPickerEl.value = isoFromDottedDate(dateOfBirthEl.value);
  }
  showPaymentReturnMessage();
  syncExamFields();
  syncAttendanceDayField();
  loadPricingConfig();
})();
