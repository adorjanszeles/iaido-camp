(function () {
  const statsEl = document.getElementById('stats');
  const rowsEl = document.getElementById('rows');
  const logoutBtn = document.getElementById('logout-btn');
  const refreshDataBtn = document.getElementById('refresh-data-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');
  const createBackupBtn = document.getElementById('create-backup-btn');
  const backupMessageEl = document.getElementById('backup-message');
  const pricingFormEl = document.getElementById('pricing-form');
  const pricingMessageEl = document.getElementById('pricing-message');
  const passwordFormEl = document.getElementById('admin-password-form');
  const passwordMessageEl = document.getElementById('password-message');
  const savePasswordBtn = document.getElementById('save-password-btn');
  const emailSendFormEl = document.getElementById('email-send-form');
  const emailRecipientModeEl = document.getElementById('email-recipient-mode');
  const emailTemplateEl = document.getElementById('email-template');
  const emailRecipientSearchEl = document.getElementById('email-recipient-search');
  const emailRecipientMetaEl = document.getElementById('email-recipient-meta');
  const emailRecipientRowsEl = document.getElementById('email-recipient-rows');
  const emailSelectVisibleBtn = document.getElementById('email-select-visible-btn');
  const emailClearSelectionBtn = document.getElementById('email-clear-selection-btn');
  const emailSelectAllBtn = document.getElementById('email-select-all-btn');
  const emailSubjectEl = document.getElementById('email-subject');
  const emailBodyEl = document.getElementById('email-body');
  const emailSendMessageEl = document.getElementById('email-send-message');
  const emailJobStatusEl = document.getElementById('email-job-status');
  const sendEmailBtn = document.getElementById('send-email-btn');
  const invoiceRowsEl = document.getElementById('invoice-rows');
  const invoiceSearchEl = document.getElementById('invoice-search');
  const invoiceTypeFilterEl = document.getElementById('invoice-type-filter');
  const invoiceSearchMetaEl = document.getElementById('invoice-search-meta');
  const registrationSearchEl = document.getElementById('registration-search');
  const registrationStatusFilterEl = document.getElementById('registration-status-filter');
  const registrationSearchMetaEl = document.getElementById('registration-search-meta');
  const cateringOrderRowsEl = document.getElementById('catering-order-rows');
  const cateringOrderSearchEl = document.getElementById('catering-order-search');
  const cateringOrderStatusFilterEl = document.getElementById('catering-order-status-filter');
  const cateringOrderSearchMetaEl = document.getElementById('catering-order-search-meta');
  const cateringInviteMetaEl = document.getElementById('catering-invite-meta');
  const sendAllCateringInvitesBtn = document.getElementById('send-all-catering-invites-btn');
  const exportCateringCsvBtn = document.getElementById('export-catering-csv-btn');
  const examModalEl = document.getElementById('exam-modal');
  const examModalFormEl = document.getElementById('exam-modal-form');
  const examModalRegistrationMetaEl = document.getElementById('exam-modal-registration-meta');
  const examModalIaidoEnabledEl = document.getElementById('exam-modal-iaido-enabled');
  const examModalIaidoGradeEl = document.getElementById('exam-modal-iaido-grade');
  const examModalJodoEnabledEl = document.getElementById('exam-modal-jodo-enabled');
  const examModalJodoGradeEl = document.getElementById('exam-modal-jodo-grade');
  const examModalMessageEl = document.getElementById('exam-modal-message');
  const examModalCloseBtn = document.getElementById('exam-modal-close-btn');
  const examModalCancelBtn = document.getElementById('exam-modal-cancel-btn');
  const examModalSaveBtn = document.getElementById('exam-modal-save-btn');
  let allRegistrations = [];
  let allInvoices = [];
  let allCateringOrders = [];
  let emailTemplates = [];
  let emailCapabilities = {
    provider: 'disabled',
    maxRecipients: 0
  };
  const selectedEmailRecipientIds = new Set();
  let currentEmailJob = null;
  let emailJobPollTimer = null;
  let examModalRegistrationId = '';

  const examGradeOptions = ['', '6. kyu', '5. kyu', '4. kyu', '3. kyu', '2. kyu', '1. kyu', '1. dan', '2. dan', '3. dan', '4. dan', '5. dan', '6. dan', '7. dan', '8. dan'];

  const labels = {
    campType: {
      full_seminar: 'Full seminar',
      jodo_part_only: 'Jodo part only',
      iaido_part_only: 'Iaido part only',
      one_and_half_days: 'One and a half days',
      one_day: 'One day',
      half_day: 'Half day',
      iaido: 'Iaido only (legacy)',
      jodo: 'Jodo only (legacy)',
      both: 'Iaido + Jodo (legacy)'
    },
    attendanceDay: {
      '2026-07-30': 'Day 1 - July 30, 2026 (Jodo)',
      '2026-07-31': 'Day 2 - July 31, 2026 (Jodo)',
      '2026-08-01': 'Day 3 - August 1, 2026 (Jodo + Iaido)',
      '2026-08-02': 'Day 4 - August 2, 2026 (Iaido)',
      '2026-08-03': 'Day 5 - August 3, 2026 (Iaido)'
    }
  };

  function formatCurrency(value, currency = 'EUR') {
    return new Intl.NumberFormat('en-IE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function renderStatCard(label, value) {
    return `
      <article class="card">
        <h3>${label}</h3>
        <p style="font-size: 1.6rem; margin: 0; font-weight: 700;">${value}</p>
      </article>
    `;
  }

  function renderStats(stats) {
    const projectedRevenue = Number(stats.projectedRevenueEur || 0);
    const lunchRegistrantCount = Number(stats.lunchRegistrantCount || 0);
    const totalLunchSelections = Number(stats.totalLunchSelections || 0);
    const lunchSummaryCards = stats.lunchDaySummary && typeof stats.lunchDaySummary === 'object'
      ? Object.entries(stats.lunchDaySummary).map(([day, count]) => renderStatCard(`Lunch ${formatOption('attendanceDay', day)}`, Number(count || 0)))
      : [];

    statsEl.innerHTML = [
      renderStatCard('Active registrations', stats.total),
      renderStatCard('Iaido applicants', stats.iaidoApplicants || 0),
      renderStatCard('Jodo applicants', stats.jodoApplicants || 0),
      renderStatCard('Deleted status', stats.deletedCount || 0),
      renderStatCard('Anonymized', stats.anonymizedCount || 0),
      renderStatCard('Iaido exam applicants', stats.wantsExamIaido || 0),
      renderStatCard('Jodo exam applicants', stats.wantsExamJodo || 0),
      renderStatCard('Projected revenue (EUR)', formatCurrency(projectedRevenue, 'EUR')),
      renderStatCard('Lunch registrants', lunchRegistrantCount),
      renderStatCard('Total lunch day selections', totalLunchSelections),
      ...lunchSummaryCards
    ].join('');
  }

  function formatOption(groupName, code) {
    const group = labels[groupName] || {};
    return group[code] || code || '-';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function readJsonResponseOrThrow(response) {
    const raw = await response.text();
    if (!raw) return {};

    try {
      return JSON.parse(raw);
    } catch {
      const snippet = raw.slice(0, 180).replace(/\s+/g, ' ').trim();
      const hint = snippet.startsWith('<!DOCTYPE') || snippet.startsWith('<html')
        ? 'The server returned an HTML page instead of JSON (session timeout or reverse proxy error page).'
        : 'The server returned an invalid JSON response.';
      throw new Error(`${hint} HTTP ${response.status}.`);
    }
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-GB');
  }

  function renderInvoiceXmlBlock(label, value) {
    const safeValue = String(value || '').trim();
    return `
      <div style="margin-top:0.6rem;">
        <div class="registration-detail-label">${escapeHtml(label)}</div>
        <pre style="white-space: pre-wrap; margin: 0.3rem 0 0; font-size: 0.8rem; line-height: 1.35; max-height: 260px; overflow: auto;">${escapeHtml(safeValue || '-')}</pre>
      </div>
    `;
  }

  function boolToYesNo(value) {
    return value ? 'Yes' : 'No';
  }

  function setExamModalMessage(type, text) {
    if (!examModalMessageEl) return;
    if (!text) {
      examModalMessageEl.className = '';
      examModalMessageEl.textContent = '';
      return;
    }
    examModalMessageEl.className = `notice ${type}`;
    examModalMessageEl.textContent = text;
  }

  function syncExamModalGradeState() {
    if (examModalIaidoGradeEl) {
      examModalIaidoGradeEl.disabled = !examModalIaidoEnabledEl?.checked;
      if (examModalIaidoGradeEl.disabled) {
        examModalIaidoGradeEl.value = '';
      }
    }
    if (examModalJodoGradeEl) {
      examModalJodoGradeEl.disabled = !examModalJodoEnabledEl?.checked;
      if (examModalJodoGradeEl.disabled) {
        examModalJodoGradeEl.value = '';
      }
    }
  }

  function populateExamGradeSelect(selectEl) {
    if (!selectEl) return;
    selectEl.innerHTML = examGradeOptions
      .map((grade, index) => `<option value="${escapeHtml(grade)}">${index === 0 ? 'No target grade' : escapeHtml(grade)}</option>`)
      .join('');
  }

  function closeExamModal() {
    examModalRegistrationId = '';
    setExamModalMessage('', '');
    if (examModalFormEl) {
      examModalFormEl.reset();
    }
    syncExamModalGradeState();
    if (examModalEl) {
      examModalEl.hidden = true;
    }
  }

  function openExamModal(registration) {
    examModalRegistrationId = registration.id;
    if (examModalRegistrationMetaEl) {
      examModalRegistrationMetaEl.textContent = `${registration.fullName} (${registration.email})`;
    }
    if (examModalIaidoEnabledEl) {
      examModalIaidoEnabledEl.checked = Boolean(registration.wantsExamIaido);
    }
    if (examModalIaidoGradeEl) {
      examModalIaidoGradeEl.value = String(registration.targetGradeIaido || '');
    }
    if (examModalJodoEnabledEl) {
      examModalJodoEnabledEl.checked = Boolean(registration.wantsExamJodo);
    }
    if (examModalJodoGradeEl) {
      examModalJodoGradeEl.value = String(registration.targetGradeJodo || '');
    }
    setExamModalMessage('', '');
    syncExamModalGradeState();
    if (examModalEl) {
      examModalEl.hidden = false;
    }
  }

  function buildOptionsText(item) {
    const gradeIaido = `Iaido grade: ${escapeHtml(item.currentGradeIaido || '-')}`;
    const gradeJodo = `Jodo grade: ${escapeHtml(item.currentGradeJodo || '-')}`;
    const examIaido = item.wantsExamIaido
      ? `Iaido exam: yes (${escapeHtml(item.targetGradeIaido || '-')})`
      : 'Iaido exam: no';
    const examJodo = item.wantsExamJodo
      ? `Jodo exam: yes (${escapeHtml(item.targetGradeJodo || '-')})`
      : 'Jodo exam: no';
    const attendanceDay = `Attendance day: ${escapeHtml(formatOption('attendanceDay', item.attendanceDay || '-'))}`;
    return `<span class="helper">${gradeIaido} | ${gradeJodo}<br />${examIaido} | ${examJodo}<br />${attendanceDay}</span>`;
  }

  function formatCateringDays(selection) {
    const values = selection && typeof selection === 'object'
      ? Object.entries(selection).filter(([, enabled]) => enabled).map(([day]) => formatOption('attendanceDay', day))
      : [];
    return values.length > 0 ? values.join(', ') : '-';
  }

  function renderDetailField(label, value) {
    return `
      <div class="registration-detail-item">
        <div class="registration-detail-label">${escapeHtml(label)}</div>
        <div class="registration-detail-value">${escapeHtml(value || '-')}</div>
      </div>
    `;
  }

  function buildRegistrationDetails(item) {
    return `
      <div class="registration-details-grid">
        ${renderDetailField('Registration ID', item.id)}
        ${renderDetailField('Created at', formatDateTime(item.createdAt))}
        ${renderDetailField('Status', item.status)}
        ${renderDetailField('Package', formatOption('campType', item.campType))}
        ${renderDetailField('Attendance day', formatOption('attendanceDay', item.attendanceDay))}
        ${renderDetailField('Amount', formatCurrency(Number(item.amount ?? item.amountHuf ?? 0), item.currency || 'EUR'))}
        ${renderDetailField('Currency', item.currency || 'EUR')}
        ${renderDetailField('Lunch days', formatCateringDays(item.cateringSelection))}
        ${renderDetailField('Lunch day count', String(item.cateringDaysCount || 0))}
        ${renderDetailField('Lunch amount', formatCurrency(Number(item.cateringAmount || 0), item.currency || 'EUR'))}

        ${renderDetailField('Full name', item.fullName)}
        ${renderDetailField('Email', item.email)}
        ${renderDetailField('Phone', item.phone)}
        ${renderDetailField('Date of birth', item.dateOfBirth)}
        ${renderDetailField('City', item.city)}

        ${renderDetailField('Current Iaido grade', item.currentGradeIaido)}
        ${renderDetailField('Iaido exam', item.wantsExamIaido ? `Yes (${item.targetGradeIaido || '-'})` : 'No')}
        ${renderDetailField('Current Jodo grade', item.currentGradeJodo)}
        ${renderDetailField('Jodo exam', item.wantsExamJodo ? `Yes (${item.targetGradeJodo || '-'})` : 'No')}

        ${renderDetailField('Billing full name', item.billingFullName)}
        ${renderDetailField('Billing ZIP', item.billingZip)}
        ${renderDetailField('Billing city', item.billingCity)}
        ${renderDetailField('Billing address', item.billingAddress)}
        ${renderDetailField('Billing country', item.billingCountry)}
        ${renderDetailField('Stripe checkout session', item.stripeCheckoutSessionId)}
        ${renderDetailField('Stripe payment intent', item.stripePaymentIntentId)}
        ${renderDetailField('Stripe customer', item.stripeCustomerId)}
        ${renderDetailField('Stripe last event', item.stripeLastEventType)}
        ${renderDetailField('Stripe event at', item.stripeLastEventAt)}
        ${renderDetailField('Paid at', item.paidAt)}

        ${renderDetailField('Privacy consent', boolToYesNo(item.privacyConsent))}
        ${renderDetailField('Terms consent', boolToYesNo(item.termsConsent))}
        ${renderDetailField('Privacy consent at', item.privacyConsentAt)}
        ${renderDetailField('Terms consent at', item.termsConsentAt)}
      </div>
      <div class="registration-note-block">
        <div class="registration-detail-label">Note</div>
        <div class="registration-note-value">${escapeHtml(item.foodNotes || '-')}</div>
      </div>
    `;
  }

  function renderRows(registrations, options = {}) {
    const hasFilter = Boolean(options.hasFilter);
    if (!registrations.length) {
      rowsEl.innerHTML = hasFilter
        ? '<tr><td colspan="7">No matching registrations.</td></tr>'
        : '<tr><td colspan="7">No registrations yet.</td></tr>';
      return;
    }

    rowsEl.innerHTML = registrations
      .slice()
      .reverse()
      .map((item) => {
        const camp = formatOption('campType', item.campType);
        const normalizedStatus = String(item.status || '').trim().toUpperCase();
        const isDeleted = normalizedStatus === 'DELETED';
        const isAnonymized = normalizedStatus === 'ANONYMIZED';
        const isPaid = normalizedStatus === 'PAID';
        const isPendingPayment = normalizedStatus === 'PENDING_PAYMENT';
        const hasMainLunchSelection = Number(item.cateringDaysCount || 0) > 0;
        const hasSeparateCateringOrder = Boolean(item.hasCateringOrder);
        const canHardDelete = isDeleted || isAnonymized;
        const amount = Number(item.amount ?? item.amountHuf ?? 0);
        const deleteAction = isDeleted || isAnonymized
          ? '<span class="helper">-</span>'
          : `<button class="btn secondary btn-small js-mark-deleted" data-registration-id="${item.id}" type="button">Set deleted</button>`;
        const anonymizeAction = isAnonymized
          ? '<span class="helper">Anonymized</span>'
          : `<button class="btn secondary btn-small js-anonymize" data-registration-id="${item.id}" type="button">GDPR anonymize</button>`;
        const hardDeleteAction = canHardDelete
          ? `<button class="btn danger btn-small js-hard-delete" data-registration-id="${item.id}" type="button">Hard delete (permanent)</button>`
          : '<span class="helper">-</span>';
        const stripeCheckAction = isPendingPayment
          ? `<button class="btn secondary btn-small js-check-stripe-payment" data-registration-id="${item.id}" type="button">Check Stripe payment</button>`
          : '<span class="helper">-</span>';
        const retryEmailAction = isDeleted || isAnonymized || isPaid
          ? '<span class="helper">-</span>'
          : `<button class="btn secondary btn-small js-send-retry-email" data-registration-id="${item.id}" type="button">Send payment link email</button>`;
        const examEditAction = isDeleted || isAnonymized
          ? '<span class="helper">-</span>'
          : `<button class="btn secondary btn-small js-edit-exams" data-registration-id="${item.id}" type="button">Update exams</button>`;
        const cateringInviteAction = isPaid && !hasMainLunchSelection && !hasSeparateCateringOrder
          ? `<button class="btn secondary btn-small js-send-catering-invite" data-registration-id="${item.id}" type="button">Send lunch invite</button>`
          : '<span class="helper">-</span>';
        const detailsToggle = `<button class="btn secondary btn-small js-toggle-details" data-registration-id="${item.id}" aria-expanded="false" type="button">Show details</button>`;
        const actionButtons = `${detailsToggle}<div style="height:0.35rem"></div>${stripeCheckAction}<div style="height:0.35rem"></div>${retryEmailAction}<div style="height:0.35rem"></div>${examEditAction}<div style="height:0.35rem"></div>${cateringInviteAction}<div style="height:0.35rem"></div>${deleteAction}<div style="height:0.35rem"></div>${anonymizeAction}<div style="height:0.35rem"></div>${hardDeleteAction}`;
        const detailRow = `
          <tr class="registration-details-row" data-details-row="${item.id}" hidden>
            <td colspan="7">
              ${buildRegistrationDetails(item)}
            </td>
          </tr>
        `;

        return `
          <tr>
            <td>${formatDateTime(item.createdAt)}</td>
            <td>${escapeHtml(item.fullName)}<br /><span class="helper">${escapeHtml(item.email)}</span></td>
            <td>${escapeHtml(camp)}</td>
            <td>${buildOptionsText(item)}</td>
            <td>${formatCurrency(amount, item.currency || 'EUR')}</td>
            <td>${escapeHtml(item.status)}</td>
            <td>${actionButtons}</td>
          </tr>
          ${detailRow}
        `;
      })
      .join('');
  }

  function updateInvoiceSearchMeta(visibleCount, totalCount, query, typeFilter) {
    if (!invoiceSearchMetaEl) return;
    if (!query && !typeFilter) {
      invoiceSearchMetaEl.textContent = `Showing ${totalCount} invoice records.`;
      return;
    }

    const parts = [];
    if (query) parts.push(`query "${query}"`);
    if (typeFilter) parts.push(`type "${typeFilter}"`);
    invoiceSearchMetaEl.textContent = `Showing ${visibleCount} of ${totalCount} invoice records for ${parts.join(' and ')}.`;
  }

  function renderInvoiceRows(invoices, options = {}) {
    if (!invoiceRowsEl) return;
    const hasFilter = Boolean(options.hasFilter);

    if (!invoices.length) {
      invoiceRowsEl.innerHTML = hasFilter
        ? '<tr><td colspan="8">No matching invoice records.</td></tr>'
        : '<tr><td colspan="8">No invoice records yet.</td></tr>';
      return;
    }

    invoiceRowsEl.innerHTML = invoices
      .slice()
      .map((item) => {
        const invoiceId = String(item.id || '');
        const status = String(item.status || '-');
        const entityType = String(item.entityType || 'registration').trim();
        const entityLabel = entityType === 'catering_order' ? 'Catering' : 'Registration';
        const registrationId = String(item.registrationId || '');
        const person = String(item.registrationFullName || '').trim();
        const email = String(item.registrationEmail || '').trim();
        const identity = person || email ? `${escapeHtml(person)}<br /><span class="helper">${escapeHtml(email)}</span>` : '-';
        const errorText = String(item.errorMessage || item.errorCode || '').trim();
        const detailsToggle = `<button class="btn secondary btn-small js-toggle-invoice-details" data-invoice-id="${invoiceId}" aria-expanded="false" type="button">Show response</button>`;

        const detailRow = `
          <tr class="invoice-details-row" data-invoice-details-row="${invoiceId}" hidden>
            <td colspan="8">
              <div class="registration-details-grid">
                ${renderDetailField('Record ID', item.id)}
                ${renderDetailField('Type', entityLabel)}
                ${renderDetailField('Entity ID', item.entityId || '-')}
                ${renderDetailField('Registration ID', item.registrationId)}
                ${renderDetailField('Invoice number', item.invoiceNumber)}
                ${renderDetailField('Status', status)}
                ${renderDetailField('Provider', item.provider)}
                ${renderDetailField('Trigger source', item.triggerSource)}
                ${renderDetailField('External ID', item.externalId)}
                ${renderDetailField('Gross amount', formatCurrency(Number(item.grossAmount || 0), item.currency || 'EUR'))}
                ${renderDetailField('Net amount', formatCurrency(Number(item.netAmount || 0), item.currency || 'EUR'))}
                ${renderDetailField('Error code', item.errorCode || '-')}
                ${renderDetailField('Error message', errorText || '-')}
                ${renderDetailField('Created at', formatDateTime(item.createdAt))}
                ${renderDetailField('Updated at', formatDateTime(item.updatedAt))}
              </div>
              ${renderInvoiceXmlBlock('Request XML', item.requestXml)}
              ${renderInvoiceXmlBlock('Raw response', item.rawResponse)}
            </td>
          </tr>
        `;

        return `
          <tr>
            <td>${formatDateTime(item.updatedAt)}</td>
            <td>${escapeHtml(entityLabel)}</td>
            <td>${escapeHtml(registrationId)}<br />${identity}</td>
            <td>${escapeHtml(item.invoiceNumber || '-')}</td>
            <td>${escapeHtml(status)}</td>
            <td>${escapeHtml(item.triggerSource || '-')}</td>
            <td>${escapeHtml(errorText || '-')}</td>
            <td>${detailsToggle}</td>
          </tr>
          ${detailRow}
        `;
      })
      .join('');
  }

  function filterInvoices() {
    const query = String(invoiceSearchEl?.value || '').trim();
    const normalized = query.toLowerCase();
    const typeFilter = String(invoiceTypeFilterEl?.value || '').trim();

    const filtered = allInvoices.filter((item) => {
        const matchesType = !typeFilter || String(item.entityType || '').trim() === typeFilter;
        const fields = [
          item.entityType,
          item.entityId,
          item.registrationId,
          item.registrationFullName,
          item.registrationEmail,
          item.invoiceNumber,
          item.status,
          item.triggerSource,
          item.errorCode,
          item.errorMessage
        ];
        const matchesQuery = !normalized || fields.some((value) => String(value || '').toLowerCase().includes(normalized));
        return matchesType && matchesQuery;
      });

    renderInvoiceRows(filtered, { hasFilter: normalized.length > 0 || Boolean(typeFilter) });
    updateInvoiceSearchMeta(filtered.length, allInvoices.length, query, typeFilter);
  }

  function updateSearchMeta(visibleCount, totalCount, query, statusFilter) {
    if (!registrationSearchMetaEl) return;
    if (!query && !statusFilter) {
      registrationSearchMetaEl.textContent = `Showing ${totalCount} registrations.`;
      return;
    }

    const parts = [];
    if (query) parts.push(`query "${query}"`);
    if (statusFilter) parts.push(`status "${statusFilter}"`);
    registrationSearchMetaEl.textContent = `Showing ${visibleCount} of ${totalCount} registrations for ${parts.join(' and ')}.`;
  }

  function filterRegistrations() {
    const query = String(registrationSearchEl?.value || '').trim();
    const normalized = query.toLowerCase();
    const statusFilter = String(registrationStatusFilterEl?.value || '').trim();

    const filtered = allRegistrations.filter((item) => {
      const fullName = String(item.fullName || '').toLowerCase();
      const email = String(item.email || '').toLowerCase();
      const status = String(item.status || '').trim();
      const matchesQuery = !normalized || fullName.includes(normalized) || email.includes(normalized);
      const matchesStatus = !statusFilter || status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    renderRows(filtered, { hasFilter: normalized.length > 0 || Boolean(statusFilter) });
    updateSearchMeta(filtered.length, allRegistrations.length, query, statusFilter);
  }

  function updateCateringOrderSearchMeta(visibleCount, totalCount, query, statusFilter) {
    if (!cateringOrderSearchMetaEl) return;
    if (!query && !statusFilter) {
      cateringOrderSearchMetaEl.textContent = `Showing ${totalCount} catering orders.`;
      return;
    }
    const parts = [];
    if (query) parts.push(`query "${query}"`);
    if (statusFilter) parts.push(`status "${statusFilter}"`);
    cateringOrderSearchMetaEl.textContent = `Showing ${visibleCount} of ${totalCount} catering orders for ${parts.join(' and ')}.`;
  }

  function renderCateringOrderRows(orders, options = {}) {
    if (!cateringOrderRowsEl) return;
    const hasFilter = Boolean(options.hasFilter);
    if (!orders.length) {
      cateringOrderRowsEl.innerHTML = hasFilter
        ? '<tr><td colspan="7">No matching catering orders.</td></tr>'
        : '<tr><td colspan="7">No catering orders yet.</td></tr>';
      return;
    }

    cateringOrderRowsEl.innerHTML = orders
      .slice()
      .reverse()
      .map((item) => {
        const isPendingPayment = String(item.status || '').trim().toUpperCase() === 'PENDING_PAYMENT';
        const stripeCheckAction = isPendingPayment
          ? `<button class="btn secondary btn-small js-check-catering-stripe-payment" data-catering-order-id="${item.id}" type="button">Check Stripe payment</button>`
          : '<span class="helper">-</span>';
        const retryEmailAction = isPendingPayment
          ? `<button class="btn secondary btn-small js-send-catering-retry-email" data-catering-order-id="${item.id}" type="button">Send payment link email</button>`
          : '<span class="helper">-</span>';
        return `
          <tr>
            <td>${formatDateTime(item.createdAt)}</td>
            <td>${escapeHtml(item.registrationFullName || '-')}<br /><span class="helper">${escapeHtml(item.registrationEmail || '-')}</span></td>
            <td>${escapeHtml(formatOption('campType', item.campType || ''))}</td>
            <td><span class="helper">${escapeHtml(formatCateringDays(item.cateringSelection))}</span></td>
            <td>${formatCurrency(Number(item.amount || 0), item.currency || 'EUR')}</td>
            <td>${escapeHtml(item.status || '-')}<br /><span class="helper">${escapeHtml(item.invoiceStatus || '-')}</span></td>
            <td>${stripeCheckAction}<div style="height:0.35rem"></div>${retryEmailAction}</td>
          </tr>
        `;
      })
      .join('');
  }

  function filterCateringOrders() {
    const query = String(cateringOrderSearchEl?.value || '').trim().toLowerCase();
    const statusFilter = String(cateringOrderStatusFilterEl?.value || '').trim();
    const filtered = allCateringOrders.filter((item) => {
      const fullName = String(item.registrationFullName || '').toLowerCase();
      const email = String(item.registrationEmail || '').toLowerCase();
      const status = String(item.status || '').trim();
      const matchesQuery = !query || fullName.includes(query) || email.includes(query);
      const matchesStatus = !statusFilter || status === statusFilter;
      return matchesQuery && matchesStatus;
    });

    renderCateringOrderRows(filtered, { hasFilter: Boolean(query) || Boolean(statusFilter) });
    updateCateringOrderSearchMeta(filtered.length, allCateringOrders.length, String(cateringOrderSearchEl?.value || '').trim(), statusFilter);
  }

  function showPricingMessage(type, text) {
    if (!pricingMessageEl) return;
    pricingMessageEl.className = `notice ${type}`;
    pricingMessageEl.textContent = text;
  }

  function showBackupMessage(type, text) {
    if (!backupMessageEl) return;
    backupMessageEl.className = `notice ${type}`;
    backupMessageEl.textContent = text;
  }

  function showPasswordMessage(type, text) {
    if (!passwordMessageEl) return;
    passwordMessageEl.className = `notice ${type}`;
    passwordMessageEl.textContent = text;
  }

  function showEmailMessage(type, text) {
    if (!emailSendMessageEl) return;
    emailSendMessageEl.className = `notice ${type}`;
    emailSendMessageEl.textContent = text;
  }

  function isEmailJobRunning(job = currentEmailJob) {
    const status = String(job?.status || '').trim();
    return status === 'queued' || status === 'running';
  }

  function updateSendEmailButtonState() {
    if (!sendEmailBtn) return;

    if (emailCapabilities.provider === 'disabled') {
      sendEmailBtn.disabled = true;
      sendEmailBtn.textContent = 'Send email';
      return;
    }

    if (isEmailJobRunning()) {
      sendEmailBtn.disabled = true;
      sendEmailBtn.textContent = 'Sending in background...';
      return;
    }

    sendEmailBtn.disabled = false;
    sendEmailBtn.textContent = 'Send email';
  }

  function getEligibleCateringInviteRecipients() {
    return allRegistrations.filter((item) => {
      const status = String(item.status || '').trim();
      const email = String(item.email || '').trim();
      const hasMainLunchSelection = Number(item.cateringDaysCount || 0) > 0;
      const hasSeparateCateringOrder = Boolean(item.hasCateringOrder);
      return status === 'PAID' && email.length > 0 && !hasMainLunchSelection && !hasSeparateCateringOrder;
    });
  }

  function updateCateringInviteControls() {
    const eligibleCount = getEligibleCateringInviteRecipients().length;
    if (cateringInviteMetaEl) {
      cateringInviteMetaEl.textContent = `Eligible paid registrations for lunch invite: ${eligibleCount}.`;
    }
    if (!sendAllCateringInvitesBtn) return;
    if (isEmailJobRunning()) {
      sendAllCateringInvitesBtn.disabled = true;
      sendAllCateringInvitesBtn.textContent = 'Email job running...';
      return;
    }
    sendAllCateringInvitesBtn.disabled = eligibleCount === 0;
    sendAllCateringInvitesBtn.textContent = 'Send lunch invites to all eligible paid registrations';
  }

  function stopEmailJobPolling() {
    if (!emailJobPollTimer) return;
    window.clearInterval(emailJobPollTimer);
    emailJobPollTimer = null;
  }

  function renderEmailJobStatus(job, deliveries) {
    if (!emailJobStatusEl) return;
    if (!job) {
      emailJobStatusEl.innerHTML = '';
      return;
    }

    const status = String(job.status || '-');
    const total = Number(job.totalRecipients || 0);
    const processed = Number(job.processedCount || 0);
    const success = Number(job.successCount || 0);
    const failed = Number(job.failedCount || 0);
    const startedAt = formatDateTime(job.startedAt || job.createdAt || '');
    const finishedAt = formatDateTime(job.finishedAt || '');
    const recentDeliveries = Array.isArray(deliveries) ? deliveries : [];

    const deliveryMarkup = recentDeliveries.length === 0
      ? '<p class="helper" style="margin: 0.5rem 0 0;">No recipient logs yet.</p>'
      : `
        <div style="margin-top: 0.65rem;">
          <div class="registration-detail-label">Recent recipient logs</div>
          <div style="display: grid; gap: 0.35rem; margin-top: 0.45rem;">
            ${recentDeliveries.map((item) => `
              <div style="padding: 0.45rem 0.6rem; border: 1px solid rgba(0,0,0,0.08); border-radius: 0.6rem;">
                <strong>${escapeHtml(item.recipientName || item.recipientEmail || '-')}</strong>
                <span class="helper"> (${escapeHtml(item.recipientEmail || '-')})</span><br />
                <span class="helper">${escapeHtml(item.status || '-')} at ${escapeHtml(formatDateTime(item.createdAt || ''))}</span>
                ${item.errorMessage ? `<br /><span class="helper">${escapeHtml(item.errorMessage)}</span>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
      `;

    emailJobStatusEl.innerHTML = `
      <div class="card" style="margin-top: 0.5rem;">
        <div class="registration-details-grid">
          ${renderDetailField('Email job ID', job.id)}
          ${renderDetailField('Status', status)}
          ${renderDetailField('Recipient mode', job.recipientMode)}
          ${renderDetailField('Template', job.templateKey || 'custom')}
          ${renderDetailField('Subject', job.subject)}
          ${renderDetailField('Started at', startedAt)}
          ${renderDetailField('Finished at', finishedAt || '-')}
          ${renderDetailField('Processed', `${processed} / ${total}`)}
          ${renderDetailField('Succeeded', String(success))}
          ${renderDetailField('Failed', String(failed))}
          ${renderDetailField('Fatal error', job.fatalError || '-')}
        </div>
        ${deliveryMarkup}
      </div>
    `;
  }

  function applyEmailJobState(job, deliveries) {
    const previousStatus = String(currentEmailJob?.status || '').trim();
    const previousId = String(currentEmailJob?.id || '').trim();
    currentEmailJob = job || null;

    renderEmailJobStatus(currentEmailJob, deliveries);
    updateSendEmailButtonState();
    updateCateringInviteControls();

    if (isEmailJobRunning(currentEmailJob)) {
      if (emailCapabilities.provider !== 'disabled') {
        showEmailMessage('ok', 'Email job is running in the background. Progress is shown below.');
      }
      if (!emailJobPollTimer) {
        emailJobPollTimer = window.setInterval(() => {
          fetchEmailJobStatus().catch((error) => {
            showEmailMessage('error', error.message);
            stopEmailJobPolling();
          });
        }, 3000);
      }
      return;
    }

    stopEmailJobPolling();

    if (currentEmailJob && previousId === currentEmailJob.id && (previousStatus === 'queued' || previousStatus === 'running')) {
      if (currentEmailJob.status === 'completed') {
        showEmailMessage('ok', `Email job completed successfully. Sent to ${currentEmailJob.successCount} recipient(s).`);
      } else if (currentEmailJob.status === 'completed_with_failures') {
        showEmailMessage(
          'error',
          `Email job completed with failures. Success: ${currentEmailJob.successCount}, Failed: ${currentEmailJob.failedCount}.`
        );
      } else if (currentEmailJob.status === 'failed') {
        showEmailMessage('error', currentEmailJob.fatalError || 'Email job failed.');
      }
      return;
    }

    if (emailCapabilities.provider !== 'disabled') {
      showEmailMessage('ok', 'Choose recipients, select a template or custom content, then send.');
    }
  }

  async function fetchEmailJobStatus() {
    const response = await fetch('/api/admin/email/job');
    if (response.status === 401) {
      window.location.href = '/admin';
      return null;
    }

    const result = await readJsonResponseOrThrow(response);
    if (!response.ok) {
      throw new Error(result.error || 'Failed to load email job status.');
    }

    applyEmailJobState(result.job || null, Array.isArray(result.deliveries) ? result.deliveries : []);
    return result;
  }

  function getEmailRecipientMode() {
    return String(emailRecipientModeEl?.value || 'selected').trim() || 'selected';
  }

  function getEmailEligibleRecipients() {
    return allRegistrations.filter((item) => {
      const status = String(item.status || '');
      const email = String(item.email || '').trim();
      return status !== 'DELETED' && status !== 'ANONYMIZED' && email.length > 0;
    });
  }

  function getFilteredEmailRecipients() {
    const query = String(emailRecipientSearchEl?.value || '').trim().toLowerCase();
    const recipients = getEmailEligibleRecipients();
    if (!query) return recipients;

    return recipients.filter((item) => {
      const fullName = String(item.fullName || '').toLowerCase();
      const email = String(item.email || '').toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }

  function updateEmailRecipientMeta(visibleCount, totalCount) {
    if (!emailRecipientMetaEl) return;
    const selectedCount = selectedEmailRecipientIds.size;
    emailRecipientMetaEl.textContent = `Showing ${visibleCount} of ${totalCount} recipients. Selected: ${selectedCount}.`;
  }

  function renderEmailRecipientRows() {
    if (!emailRecipientRowsEl) return;

    const eligible = getEmailEligibleRecipients();
    const filtered = getFilteredEmailRecipients();
    const mode = getEmailRecipientMode();
    const selectionEnabled = mode === 'selected';

    if (!filtered.length) {
      emailRecipientRowsEl.innerHTML = '<tr><td colspan="4">No matching recipients.</td></tr>';
      updateEmailRecipientMeta(0, eligible.length);
      return;
    }

    emailRecipientRowsEl.innerHTML = filtered
      .slice()
      .reverse()
      .map((item) => {
        const id = String(item.id || '');
        const checked = selectedEmailRecipientIds.has(id) ? 'checked' : '';
        const disabled = selectionEnabled ? '' : 'disabled';
        return `
          <tr>
            <td><input class="js-email-recipient-check" type="checkbox" data-registration-id="${id}" ${checked} ${disabled} /></td>
            <td>${escapeHtml(item.fullName || '-')}</td>
            <td>${escapeHtml(item.email || '-')}</td>
            <td>${escapeHtml(item.status || '-')}</td>
          </tr>
        `;
      })
      .join('');

    updateEmailRecipientMeta(filtered.length, eligible.length);
  }

  function setEmailSelectionControlsState() {
    const selectionEnabled = getEmailRecipientMode() === 'selected';
    if (emailRecipientSearchEl) emailRecipientSearchEl.disabled = !selectionEnabled;
    if (emailSelectVisibleBtn) emailSelectVisibleBtn.disabled = !selectionEnabled;
    if (emailClearSelectionBtn) emailClearSelectionBtn.disabled = !selectionEnabled;
    if (emailSelectAllBtn) emailSelectAllBtn.disabled = !selectionEnabled;

    if (emailCapabilities.provider === 'disabled') {
      showEmailMessage('error', 'Email provider is not configured. Set SMTP env values first.');
      updateSendEmailButtonState();
      return;
    }

    if (isEmailJobRunning()) {
      showEmailMessage('ok', 'Email job is running in the background. Progress is shown below.');
      updateSendEmailButtonState();
      return;
    }

    if (!selectionEnabled) {
      showEmailMessage('ok', 'Recipient group mode is active. Manual selection is disabled.');
    } else {
      showEmailMessage('ok', 'Choose recipients, select a template or custom content, then send.');
    }
    updateSendEmailButtonState();
  }

  function populateEmailTemplates(templates) {
    if (!emailTemplateEl) return;
    const normalizedTemplates = Array.isArray(templates) ? templates : [];
    const previous = String(emailTemplateEl.value || 'custom');

    emailTemplateEl.innerHTML = '<option value="custom">Custom email</option>';
    normalizedTemplates.forEach((template) => {
      const key = String(template?.key || '').trim();
      if (!key) return;
      const label = String(template?.label || key);
      emailTemplateEl.insertAdjacentHTML('beforeend', `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`);
    });

    emailTemplateEl.value = normalizedTemplates.some((template) => template.key === previous) ? previous : 'custom';
  }

  function applySelectedTemplateDefaults() {
    if (!emailTemplateEl) return;
    const templateKey = String(emailTemplateEl.value || 'custom').trim();
    if (templateKey === 'custom') return;

    const selectedTemplate = emailTemplates.find((item) => item.key === templateKey);
    if (!selectedTemplate) return;
    if (emailSubjectEl) emailSubjectEl.value = String(selectedTemplate.subject || '');
    if (emailBodyEl) emailBodyEl.value = String(selectedTemplate.body || '');
  }

  function populatePricingForm(settings) {
    if (!pricingFormEl || !settings || typeof settings !== 'object') return;

    const inputs = pricingFormEl.querySelectorAll('[data-price-group][data-price-code]');
    inputs.forEach((input) => {
      const group = input.getAttribute('data-price-group');
      const code = input.getAttribute('data-price-code');
      const tier = String(input.getAttribute('data-price-tier') || 'regular').trim();
      const amount = tier === 'earlyBird'
        ? settings?.earlyBirdPrices?.[group]?.[code]
        : settings?.prices?.[group]?.[code];
      input.value = Number.isFinite(Number(amount)) ? String(amount) : '';
    });

    showPricingMessage('ok', 'Pricing settings loaded.');
  }

  function collectPricingPayload() {
    if (!pricingFormEl) {
      throw new Error('Pricing form is not available.');
    }

    const prices = { campType: {} };
    const earlyBirdPrices = { campType: {} };

    const inputs = pricingFormEl.querySelectorAll('[data-price-group][data-price-code]');
    inputs.forEach((input) => {
      const group = input.getAttribute('data-price-group');
      const code = input.getAttribute('data-price-code');
      const tier = String(input.getAttribute('data-price-tier') || 'regular').trim();
      const raw = String(input.value || '').trim();
      const numeric = Number(raw);

      if (!Number.isFinite(numeric) || numeric < 0) {
        throw new Error(`Invalid price at ${group}/${code}/${tier}.`);
      }

      if (tier === 'earlyBird') {
        earlyBirdPrices[group][code] = Math.round(numeric * 100) / 100;
      } else {
        prices[group][code] = Math.round(numeric * 100) / 100;
      }
    });

    return { prices, earlyBirdPrices };
  }

  async function savePricingSettings(event) {
    event.preventDefault();
    showPricingMessage('ok', 'Saving pricing settings...');

    try {
      const settings = collectPricingPayload();
      const response = await fetch('/api/admin/pricing', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(settings)
      });

      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save pricing settings.');
      }

      populatePricingForm(result.settings || settings);
      showPricingMessage('ok', result.message || 'Pricing settings saved.');
    } catch (error) {
      showPricingMessage('error', error.message);
    }
  }

  async function loadData() {
    try {
      const [statsRes, regsRes, pricingRes, emailTemplateRes, invoicesRes, emailJobRes, cateringOrdersRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/registrations'),
        fetch('/api/admin/pricing'),
        fetch('/api/admin/email/templates'),
        fetch('/api/admin/invoices?limit=500'),
        fetch('/api/admin/email/job'),
        fetch('/api/admin/catering-orders')
      ]);

      if (
        statsRes.status === 401 ||
        regsRes.status === 401 ||
        pricingRes.status === 401 ||
        emailTemplateRes.status === 401 ||
        invoicesRes.status === 401 ||
        emailJobRes.status === 401 ||
        cateringOrdersRes.status === 401
      ) {
        window.location.href = '/admin';
        return;
      }

      const statsData = await statsRes.json();
      const regsData = await regsRes.json();
      const pricingData = await pricingRes.json();
      const emailTemplateData = await emailTemplateRes.json();
      const invoicesData = await invoicesRes.json();
      const emailJobData = await readJsonResponseOrThrow(emailJobRes);
      const cateringOrdersData = await cateringOrdersRes.json();

      if (!statsRes.ok || !regsRes.ok || !pricingRes.ok || !emailTemplateRes.ok || !invoicesRes.ok || !emailJobRes.ok || !cateringOrdersRes.ok) {
        throw new Error('API error while loading admin data.');
      }

      renderStats(statsData.stats);
      allRegistrations = Array.isArray(regsData.registrations) ? regsData.registrations : [];
      const eligibleIdSet = new Set(getEmailEligibleRecipients().map((item) => String(item.id || '')));
      Array.from(selectedEmailRecipientIds).forEach((id) => {
        if (!eligibleIdSet.has(id)) {
          selectedEmailRecipientIds.delete(id);
        }
      });
      filterRegistrations();
      populatePricingForm(pricingData.settings || {});
      emailTemplates = Array.isArray(emailTemplateData.templates) ? emailTemplateData.templates : [];
      emailCapabilities = emailTemplateData.capabilities || { provider: 'disabled', maxRecipients: 0 };
      populateEmailTemplates(emailTemplates);
      renderEmailRecipientRows();
      setEmailSelectionControlsState();
      allInvoices = Array.isArray(invoicesData.invoices) ? invoicesData.invoices : [];
      filterInvoices();
      allCateringOrders = Array.isArray(cateringOrdersData.orders) ? cateringOrdersData.orders : [];
      filterCateringOrders();
      updateCateringInviteControls();
      applyEmailJobState(emailJobData.job || null, Array.isArray(emailJobData.deliveries) ? emailJobData.deliveries : []);

      if (emailCapabilities.provider === 'disabled') {
        showEmailMessage('error', 'Email provider is not configured. Set SMTP env values first.');
      }
      updateSendEmailButtonState();
    } catch (error) {
      statsEl.innerHTML = `<div class="notice error">${error.message}</div>`;
      rowsEl.innerHTML = '<tr><td colspan="7">Failed to load data.</td></tr>';
      allRegistrations = [];
      allInvoices = [];
      allCateringOrders = [];
      updateSearchMeta(0, 0, '', '');
      updateInvoiceSearchMeta(0, 0, '');
      updateCateringOrderSearchMeta(0, 0, '', '');
      updateCateringInviteControls();
      showPricingMessage('error', 'Failed to load pricing settings.');
      if (emailRecipientRowsEl) {
        emailRecipientRowsEl.innerHTML = '<tr><td colspan="4">Failed to load recipients.</td></tr>';
      }
      if (invoiceRowsEl) {
        invoiceRowsEl.innerHTML = '<tr><td colspan="8">Failed to load invoice records.</td></tr>';
      }
      if (cateringOrderRowsEl) {
        cateringOrderRowsEl.innerHTML = '<tr><td colspan="7">Failed to load catering orders.</td></tr>';
      }
      showEmailMessage('error', 'Failed to load email sender data.');
      if (emailJobStatusEl) {
        emailJobStatusEl.innerHTML = '';
      }
      stopEmailJobPolling();
    }
  }

  async function markDeleted(registrationId) {
    const shouldProceed = window.confirm('Are you sure you want to mark this registration as deleted?');
    if (!shouldProceed) return;

    try {
      const response = await fetch('/api/admin/registrations/mark-deleted', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ registrationId })
      });

      const result = await readJsonResponseOrThrow(response);
      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to set deleted status.');
      }

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function anonymize(registrationId) {
    const shouldProceed = window.confirm('Are you sure you want to anonymize this registration? This permanently removes personal data.');
    if (!shouldProceed) return;

    try {
      const response = await fetch('/api/admin/registrations/anonymize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ registrationId })
      });

      const result = await readJsonResponseOrThrow(response);
      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to anonymize registration.');
      }

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function hardDelete(registrationId) {
    const shouldProceed = window.confirm(
      'Are you sure you want to permanently delete this registration? This cannot be undone.'
    );
    if (!shouldProceed) return;

    try {
      const response = await fetch('/api/admin/registrations/hard-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ registrationId })
      });

      const result = await readJsonResponseOrThrow(response);
      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to permanently delete registration.');
      }

      await loadData();
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function updateExams(registrationId) {
    const registration = allRegistrations.find((item) => item.id === registrationId);
    if (!registration) {
      window.alert('Registration not found in the current admin view.');
      return;
    }
    openExamModal(registration);
  }

  async function logout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      window.location.href = '/admin';
    }
  }

  async function exportCsv() {
    if (exportCsvBtn) {
      exportCsvBtn.disabled = true;
      exportCsvBtn.textContent = 'Exporting...';
    }

    try {
      const response = await fetch('/api/admin/export.csv');
      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      if (!response.ok) {
        throw new Error('CSV export failed.');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const fileName = match && match[1] ? match[1] : 'registrations.csv';

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(error.message);
    } finally {
      if (exportCsvBtn) {
        exportCsvBtn.disabled = false;
        exportCsvBtn.textContent = 'Export CSV';
      }
    }
  }

  async function createBackupNow() {
    if (createBackupBtn) {
      createBackupBtn.disabled = true;
      createBackupBtn.textContent = 'Creating backup...';
    }
    showBackupMessage('ok', 'Creating backup...');

    try {
      const response = await fetch('/api/admin/backup', { method: 'POST' });
      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Backup creation failed.');
      }

      const fileName = String(result.file || '').trim();
      showBackupMessage('ok', fileName ? `Backup created: ${fileName}` : 'Backup created.');
    } catch (error) {
      showBackupMessage('error', error.message);
    } finally {
      if (createBackupBtn) {
        createBackupBtn.disabled = false;
        createBackupBtn.textContent = 'Create backup now';
      }
    }
  }

  async function refreshAdminData() {
    if (!refreshDataBtn) {
      await loadData();
      return;
    }

    refreshDataBtn.disabled = true;
    refreshDataBtn.textContent = 'Refreshing...';
    try {
      await loadData();
    } finally {
      refreshDataBtn.disabled = false;
      refreshDataBtn.textContent = 'Refresh list';
    }
  }

  async function sendRetryPaymentEmail(registrationId) {
    const response = await fetch('/api/admin/registrations/send-retry-payment-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ registrationId })
    });

    const result = await response.json();
    if (response.status === 401) {
      window.location.href = '/admin';
      return;
    }

    if (!response.ok) {
      throw new Error(result.error || 'Failed to generate retry payment link.');
    }

    const email = String(result.email || '').trim();
    const expiresAt = String(result.expiresAt || '').trim();
    const message = result.message || 'Payment link email sent.';
    if (email || expiresAt) {
      window.alert(`${message}${email ? `\nRecipient: ${email}` : ''}${expiresAt ? `\nLink expires at: ${expiresAt}` : ''}`);
      return;
    }
    window.alert(message);
  }

  async function sendCateringInviteEmail(registrationId) {
    const response = await fetch('/api/admin/registrations/send-catering-invite-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ registrationId })
    });
    const result = await readJsonResponseOrThrow(response);
    if (response.status === 401) {
      window.location.href = '/admin';
      return;
    }
    if (!response.ok) {
      throw new Error(result.error || 'Failed to send lunch invitation email.');
    }
    window.alert(result.message || 'Lunch invitation email sent.');
  }

  async function sendAllCateringInvites() {
    if (isEmailJobRunning()) {
      showEmailMessage('error', 'Another email job is already running.');
      return;
    }
    const eligibleCount = getEligibleCateringInviteRecipients().length;
    if (eligibleCount === 0) {
      showEmailMessage('error', 'There are no eligible paid registrations for lunch invite emails.');
      return;
    }

    const shouldProceed = window.confirm(`Send lunch invite emails to ${eligibleCount} eligible paid registration(s)?`);
    if (!shouldProceed) return;

    showEmailMessage('ok', 'Starting lunch invitation email job...');
    updateCateringInviteControls();

    try {
      const response = await fetch('/api/admin/catering/send-invites-to-paid', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      const result = await readJsonResponseOrThrow(response);

      if (response.status === 409) {
        applyEmailJobState(result.job || null, Array.isArray(result.deliveries) ? result.deliveries : []);
        throw new Error(result.error || 'Another email job is already running.');
      }

      if (!response.ok) {
        throw new Error(result.error || 'Failed to start lunch invitation email job.');
      }

      applyEmailJobState(result.job || null, Array.isArray(result.deliveries) ? result.deliveries : []);
      showEmailMessage('ok', result.message || 'Lunch invitation email job started successfully.');
      await loadData();
    } catch (error) {
      showEmailMessage('error', error.message);
    } finally {
      updateCateringInviteControls();
    }
  }

  async function exportCateringCsv() {
    if (exportCateringCsvBtn) {
      exportCateringCsvBtn.disabled = true;
      exportCateringCsvBtn.textContent = 'Exporting...';
    }
    try {
      const response = await fetch('/api/admin/catering-orders/export.csv');
      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }
      if (!response.ok) {
        throw new Error('Catering CSV export failed.');
      }
      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition') || '';
      const match = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const fileName = match && match[1] ? match[1] : 'all-catering.csv';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(error.message);
    } finally {
      if (exportCateringCsvBtn) {
        exportCateringCsvBtn.disabled = false;
        exportCateringCsvBtn.textContent = 'Export Catering CSV';
      }
    }
  }

  async function sendCateringRetryPaymentEmail(cateringOrderId) {
    const response = await fetch('/api/admin/catering-orders/send-retry-payment-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cateringOrderId })
    });
    const result = await readJsonResponseOrThrow(response);
    if (response.status === 401) {
      window.location.href = '/admin';
      return;
    }
    if (!response.ok) {
      throw new Error(result.error || 'Failed to generate lunch retry payment link.');
    }
    window.alert(result.message || 'Lunch payment link email sent.');
  }

  async function checkCateringStripePayment(cateringOrderId) {
    const response = await fetch('/api/admin/catering-orders/check-stripe-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ cateringOrderId })
    });
    const result = await readJsonResponseOrThrow(response);
    if (response.status === 401) {
      window.location.href = '/admin';
      return;
    }
    if (!response.ok) {
      throw new Error(result.error || 'Stripe lunch payment check failed.');
    }
    const lines = [
      result.message || 'Stripe payment check completed.',
      `Lunch order ID: ${result.cateringOrderId || cateringOrderId}`,
      `Order status: ${result.cateringOrderStatus || '-'}`,
      `Stripe payment status: ${result?.stripe?.paymentStatus || '-'}`,
      `Stripe checkout status: ${result?.stripe?.checkoutStatus || '-'}`,
      `Stripe session: ${result?.stripe?.sessionId || '-'}`
    ];
    window.alert(lines.join('\n'));
    await loadData();
  }

  async function checkStripePayment(registrationId) {
    const response = await fetch('/api/admin/registrations/check-stripe-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ registrationId })
    });

    const result = await readJsonResponseOrThrow(response);
    if (response.status === 401) {
      window.location.href = '/admin';
      return;
    }
    if (!response.ok) {
      throw new Error(result.error || 'Stripe payment check failed.');
    }

    const lines = [
      result.message || 'Stripe payment check completed.',
      `Registration ID: ${result.registrationId || registrationId}`,
      `Registration status: ${result.registrationStatus || '-'}`,
      `Stripe payment status: ${result?.stripe?.paymentStatus || '-'}`,
      `Stripe checkout status: ${result?.stripe?.checkoutStatus || '-'}`,
      `Stripe session: ${result?.stripe?.sessionId || '-'}`
    ];
    if (result?.invoice?.id || result?.invoice?.invoiceNumber) {
      lines.push(`Invoice: ${result.invoice.invoiceNumber || result.invoice.id} (${result.invoice.status || 'ok'})`);
    }
    if (result?.invoiceWarning) {
      lines.push(`Invoice warning: ${result.invoiceWarning}`);
    }

    window.alert(lines.join('\n'));
    await loadData();
  }

  async function updateAdminPassword(event) {
    event.preventDefault();
    if (!passwordFormEl) return;

    const formData = new FormData(passwordFormEl);
    const payload = {
      currentPassword: String(formData.get('currentPassword') || ''),
      newPassword: String(formData.get('newPassword') || ''),
      confirmPassword: String(formData.get('confirmPassword') || '')
    };

    if (!payload.currentPassword || !payload.newPassword || !payload.confirmPassword) {
      showPasswordMessage('error', 'All password fields are required.');
      return;
    }

    if (payload.newPassword !== payload.confirmPassword) {
      showPasswordMessage('error', 'New password and confirmation do not match.');
      return;
    }

    if (savePasswordBtn) {
      savePasswordBtn.disabled = true;
      savePasswordBtn.textContent = 'Updating password...';
    }
    showPasswordMessage('ok', 'Updating password...');

    try {
      const response = await fetch('/api/admin/password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Password update failed.');
      }

      passwordFormEl.reset();
      showPasswordMessage('ok', result.message || 'Admin password updated.');
    } catch (error) {
      showPasswordMessage('error', error.message);
    } finally {
      if (savePasswordBtn) {
        savePasswordBtn.disabled = false;
        savePasswordBtn.textContent = 'Update admin password';
      }
    }
  }

  function selectVisibleEmailRecipients() {
    getFilteredEmailRecipients().forEach((item) => {
      selectedEmailRecipientIds.add(String(item.id || ''));
    });
    renderEmailRecipientRows();
  }

  function clearEmailSelection() {
    selectedEmailRecipientIds.clear();
    renderEmailRecipientRows();
  }

  function selectAllActiveRecipients() {
    getEmailEligibleRecipients().forEach((item) => {
      selectedEmailRecipientIds.add(String(item.id || ''));
    });
    renderEmailRecipientRows();
  }

  async function sendAdminEmail(event) {
    event.preventDefault();
    if (!emailSendFormEl) return;

    const recipientMode = getEmailRecipientMode();
    const templateKey = String(emailTemplateEl?.value || 'custom').trim() || 'custom';
    const subject = String(emailSubjectEl?.value || '').trim();
    const body = String(emailBodyEl?.value || '').trim();
    const recipientIds = Array.from(selectedEmailRecipientIds);

    if (recipientMode === 'selected' && recipientIds.length === 0) {
      showEmailMessage('error', 'Select at least one recipient first.');
      return;
    }

    if (!subject) {
      showEmailMessage('error', 'Email subject is required.');
      return;
    }
    if (!body) {
      showEmailMessage('error', 'Email body is required.');
      return;
    }

    updateSendEmailButtonState();
    showEmailMessage('ok', 'Starting email job...');

    try {
      const response = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          recipientMode,
          recipientIds,
          templateKey,
          subject,
          body
        })
      });

      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      const result = await readJsonResponseOrThrow(response);

      if (response.status === 409) {
        applyEmailJobState(result.job || null, Array.isArray(result.deliveries) ? result.deliveries : []);
        throw new Error(result.error || 'Another email job is already running.');
      }

      if (!response.ok) {
        throw new Error(result.error || 'Email sending failed.');
      }

      applyEmailJobState(result.job || null, Array.isArray(result.deliveries) ? result.deliveries : []);
      showEmailMessage('ok', result.message || 'Email job started successfully.');
    } catch (error) {
      showEmailMessage('error', error.message);
    } finally {
      updateSendEmailButtonState();
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  if (refreshDataBtn) {
    refreshDataBtn.addEventListener('click', refreshAdminData);
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportCsv);
  }

  if (createBackupBtn) {
    createBackupBtn.addEventListener('click', createBackupNow);
  }

  if (pricingFormEl) {
    pricingFormEl.addEventListener('submit', savePricingSettings);
  }

  if (passwordFormEl) {
    passwordFormEl.addEventListener('submit', updateAdminPassword);
  }

  if (registrationSearchEl) {
    registrationSearchEl.addEventListener('input', filterRegistrations);
  }

  if (registrationStatusFilterEl) {
    registrationStatusFilterEl.addEventListener('change', filterRegistrations);
  }

  if (cateringOrderSearchEl) {
    cateringOrderSearchEl.addEventListener('input', filterCateringOrders);
  }

  if (cateringOrderStatusFilterEl) {
    cateringOrderStatusFilterEl.addEventListener('change', filterCateringOrders);
  }

  if (invoiceSearchEl) {
    invoiceSearchEl.addEventListener('input', filterInvoices);
  }
  if (invoiceTypeFilterEl) {
    invoiceTypeFilterEl.addEventListener('change', filterInvoices);
  }

  if (exportCateringCsvBtn) {
    exportCateringCsvBtn.addEventListener('click', exportCateringCsv);
  }

  if (sendAllCateringInvitesBtn) {
    sendAllCateringInvitesBtn.addEventListener('click', () => {
      sendAllCateringInvites().catch((error) => {
        showEmailMessage('error', error.message);
        updateCateringInviteControls();
      });
    });
  }

  populateExamGradeSelect(examModalIaidoGradeEl);
  populateExamGradeSelect(examModalJodoGradeEl);

  if (examModalIaidoEnabledEl) {
    examModalIaidoEnabledEl.addEventListener('change', syncExamModalGradeState);
  }

  if (examModalJodoEnabledEl) {
    examModalJodoEnabledEl.addEventListener('change', syncExamModalGradeState);
  }

  if (examModalCloseBtn) {
    examModalCloseBtn.addEventListener('click', closeExamModal);
  }

  if (examModalCancelBtn) {
    examModalCancelBtn.addEventListener('click', closeExamModal);
  }

  if (examModalEl) {
    examModalEl.addEventListener('click', (event) => {
      if (event.target === examModalEl) {
        closeExamModal();
      }
    });
  }

  if (examModalFormEl) {
    examModalFormEl.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!examModalRegistrationId) return;

      const wantsExamIaido = Boolean(examModalIaidoEnabledEl?.checked);
      const targetGradeIaido = wantsExamIaido ? String(examModalIaidoGradeEl?.value || '').trim() : '';
      const wantsExamJodo = Boolean(examModalJodoEnabledEl?.checked);
      const targetGradeJodo = wantsExamJodo ? String(examModalJodoGradeEl?.value || '').trim() : '';

      if (wantsExamIaido && !targetGradeIaido) {
        setExamModalMessage('error', 'Select an Iaido target grade.');
        return;
      }
      if (wantsExamJodo && !targetGradeJodo) {
        setExamModalMessage('error', 'Select a Jodo target grade.');
        return;
      }

      if (examModalSaveBtn) {
        examModalSaveBtn.disabled = true;
        examModalSaveBtn.textContent = 'Saving...';
      }
      setExamModalMessage('', '');

      try {
        const response = await fetch('/api/admin/registrations/update-exams', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            registrationId: examModalRegistrationId,
            wantsExamIaido,
            targetGradeIaido,
            wantsExamJodo,
            targetGradeJodo
          })
        });

        const result = await readJsonResponseOrThrow(response);
        if (response.status === 401) {
          window.location.href = '/admin';
          return;
        }
        if (!response.ok) {
          throw new Error(result.error || 'Failed to update exam selections.');
        }

        closeExamModal();
        await loadData();
      } catch (error) {
        setExamModalMessage('error', error.message);
      } finally {
        if (examModalSaveBtn) {
          examModalSaveBtn.disabled = false;
          examModalSaveBtn.textContent = 'Save exam settings';
        }
      }
    });
  }

  if (emailRecipientModeEl) {
    emailRecipientModeEl.addEventListener('change', () => {
      setEmailSelectionControlsState();
      renderEmailRecipientRows();
    });
  }

  if (emailRecipientSearchEl) {
    emailRecipientSearchEl.addEventListener('input', renderEmailRecipientRows);
  }

  if (emailSelectVisibleBtn) {
    emailSelectVisibleBtn.addEventListener('click', selectVisibleEmailRecipients);
  }

  if (emailClearSelectionBtn) {
    emailClearSelectionBtn.addEventListener('click', clearEmailSelection);
  }

  if (emailSelectAllBtn) {
    emailSelectAllBtn.addEventListener('click', selectAllActiveRecipients);
  }

  if (emailTemplateEl) {
    emailTemplateEl.addEventListener('change', applySelectedTemplateDefaults);
  }

  if (emailSendFormEl) {
    emailSendFormEl.addEventListener('submit', sendAdminEmail);
  }

  if (emailRecipientRowsEl) {
    emailRecipientRowsEl.addEventListener('change', (event) => {
      const checkbox = event.target.closest('.js-email-recipient-check');
      if (!checkbox) return;
      const id = String(checkbox.getAttribute('data-registration-id') || '').trim();
      if (!id) return;

      if (checkbox.checked) {
        selectedEmailRecipientIds.add(id);
      } else {
        selectedEmailRecipientIds.delete(id);
      }
      renderEmailRecipientRows();
    });
  }

  rowsEl.addEventListener('click', (event) => {
    const toggleButton = event.target.closest('.js-toggle-details');
    if (toggleButton) {
      const registrationId = toggleButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      const detailsRow = rowsEl.querySelector(`tr[data-details-row="${registrationId}"]`);
      if (!detailsRow) return;

      const isOpen = !detailsRow.hidden;
      detailsRow.hidden = isOpen;
      toggleButton.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      toggleButton.textContent = isOpen ? 'Show details' : 'Hide details';
      return;
    }

    const deleteButton = event.target.closest('.js-mark-deleted');
    if (deleteButton) {
      const registrationId = deleteButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      markDeleted(registrationId);
      return;
    }

    const retryEmailButton = event.target.closest('.js-send-retry-email');
    if (retryEmailButton) {
      const registrationId = retryEmailButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      sendRetryPaymentEmail(registrationId).catch((error) => {
        window.alert(error.message);
      });
      return;
    }

    const editExamsButton = event.target.closest('.js-edit-exams');
    if (editExamsButton) {
      const registrationId = editExamsButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      updateExams(registrationId);
      return;
    }

    const cateringInviteButton = event.target.closest('.js-send-catering-invite');
    if (cateringInviteButton) {
      const registrationId = cateringInviteButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      sendCateringInviteEmail(registrationId)
        .then(() => loadData())
        .catch((error) => {
          window.alert(error.message);
        });
      return;
    }

    const checkStripeButton = event.target.closest('.js-check-stripe-payment');
    if (checkStripeButton) {
      const registrationId = checkStripeButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      checkStripePayment(registrationId).catch((error) => {
        window.alert(error.message);
      });
      return;
    }

    const anonymizeButton = event.target.closest('.js-anonymize');
    if (anonymizeButton) {
      const registrationId = anonymizeButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      anonymize(registrationId);
      return;
    }

    const hardDeleteButton = event.target.closest('.js-hard-delete');
    if (hardDeleteButton) {
      const registrationId = hardDeleteButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      hardDelete(registrationId);
    }
  });

  if (invoiceRowsEl) {
    invoiceRowsEl.addEventListener('click', (event) => {
      const toggleButton = event.target.closest('.js-toggle-invoice-details');
      if (!toggleButton) return;

      const invoiceId = toggleButton.getAttribute('data-invoice-id');
      if (!invoiceId) return;

      const detailsRow = invoiceRowsEl.querySelector(`tr[data-invoice-details-row="${invoiceId}"]`);
      if (!detailsRow) return;

      const isOpen = !detailsRow.hidden;
      detailsRow.hidden = isOpen;
      toggleButton.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      toggleButton.textContent = isOpen ? 'Show response' : 'Hide response';
    });
  }

  if (cateringOrderRowsEl) {
    cateringOrderRowsEl.addEventListener('click', (event) => {
      const retryButton = event.target.closest('.js-send-catering-retry-email');
      if (retryButton) {
        const cateringOrderId = retryButton.getAttribute('data-catering-order-id');
        if (!cateringOrderId) return;
        sendCateringRetryPaymentEmail(cateringOrderId).catch((error) => {
          window.alert(error.message);
        });
        return;
      }

      const checkButton = event.target.closest('.js-check-catering-stripe-payment');
      if (checkButton) {
        const cateringOrderId = checkButton.getAttribute('data-catering-order-id');
        if (!cateringOrderId) return;
        checkCateringStripePayment(cateringOrderId).catch((error) => {
          window.alert(error.message);
        });
      }
    });
  }

  loadData();
})();
