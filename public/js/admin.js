(function () {
  const statsEl = document.getElementById('stats');
  const rowsEl = document.getElementById('rows');
  const logoutBtn = document.getElementById('logout-btn');
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
  const sendEmailBtn = document.getElementById('send-email-btn');
  const registrationSearchEl = document.getElementById('registration-search');
  const registrationSearchMetaEl = document.getElementById('registration-search-meta');
  let allRegistrations = [];
  let emailTemplates = [];
  let emailCapabilities = {
    provider: 'disabled',
    maxRecipients: 0
  };
  const selectedEmailRecipientIds = new Set();

  const labels = {
    campType: {
      iaido: 'Iaido',
      jodo: 'Jodo',
      both: 'Iaido + Jodo'
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

    statsEl.innerHTML = [
      renderStatCard('Active registrations', stats.total),
      renderStatCard('Iaido applicants', stats.iaidoApplicants || 0),
      renderStatCard('Jodo applicants', stats.jodoApplicants || 0),
      renderStatCard('Deleted status', stats.deletedCount || 0),
      renderStatCard('Anonymized', stats.anonymizedCount || 0),
      renderStatCard('Iaido exam applicants', stats.wantsExamIaido || 0),
      renderStatCard('Jodo exam applicants', stats.wantsExamJodo || 0),
      renderStatCard('Projected revenue (EUR)', formatCurrency(projectedRevenue, 'EUR'))
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

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-GB');
  }

  function boolToYesNo(value) {
    return value ? 'Yes' : 'No';
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
    return `<span class="helper">${gradeIaido} | ${gradeJodo}<br />${examIaido} | ${examJodo}</span>`;
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
        ${renderDetailField('Amount', formatCurrency(Number(item.amount ?? item.amountHuf ?? 0), item.currency || 'EUR'))}
        ${renderDetailField('Currency', item.currency || 'EUR')}

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
        const isDeleted = item.status === 'DELETED';
        const isAnonymized = item.status === 'ANONYMIZED';
        const isPaid = item.status === 'PAID';
        const amount = Number(item.amount ?? item.amountHuf ?? 0);
        const deleteAction = isDeleted || isAnonymized
          ? '<span class="helper">-</span>'
          : `<button class="btn secondary btn-small js-mark-deleted" data-registration-id="${item.id}" type="button">Set deleted</button>`;
        const anonymizeAction = isAnonymized
          ? '<span class="helper">Anonymized</span>'
          : `<button class="btn secondary btn-small js-anonymize" data-registration-id="${item.id}" type="button">GDPR anonymize</button>`;
        const retryLinkAction = isDeleted || isAnonymized || isPaid
          ? '<span class="helper">-</span>'
          : `<button class="btn secondary btn-small js-copy-retry-link" data-registration-id="${item.id}" type="button">Copy payment link</button>`;
        const detailsToggle = `<button class="btn secondary btn-small js-toggle-details" data-registration-id="${item.id}" aria-expanded="false" type="button">Show details</button>`;
        const actionButtons = `${detailsToggle}<div style="height:0.35rem"></div>${retryLinkAction}<div style="height:0.35rem"></div>${deleteAction}<div style="height:0.35rem"></div>${anonymizeAction}`;
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

  function updateSearchMeta(visibleCount, totalCount, query) {
    if (!registrationSearchMetaEl) return;
    if (!query) {
      registrationSearchMetaEl.textContent = `Showing ${totalCount} registrations.`;
      return;
    }

    registrationSearchMetaEl.textContent = `Showing ${visibleCount} of ${totalCount} registrations for "${query}".`;
  }

  function filterRegistrations() {
    const query = String(registrationSearchEl?.value || '').trim();
    const normalized = query.toLowerCase();

    const filtered = !normalized
      ? allRegistrations
      : allRegistrations.filter((item) => {
        const fullName = String(item.fullName || '').toLowerCase();
        const email = String(item.email || '').toLowerCase();
        return fullName.includes(normalized) || email.includes(normalized);
      });

    renderRows(filtered, { hasFilter: normalized.length > 0 });
    updateSearchMeta(filtered.length, allRegistrations.length, query);
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

    if (emailCapabilities.provider !== 'brevo') {
      showEmailMessage('error', 'Email provider is not configured. Set Brevo env values first.');
      return;
    }

    if (!selectionEnabled) {
      showEmailMessage('ok', 'Recipient group mode is active. Manual selection is disabled.');
    } else {
      showEmailMessage('ok', 'Choose recipients, select a template or custom content, then send.');
    }
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
      const amount = settings?.prices?.[group]?.[code];
      input.value = Number.isFinite(Number(amount)) ? String(amount) : '';
    });

    showPricingMessage('ok', 'Pricing settings loaded.');
  }

  function collectPricingPayload() {
    if (!pricingFormEl) {
      throw new Error('Pricing form is not available.');
    }

    const prices = {
      campType: {}
    };

    const inputs = pricingFormEl.querySelectorAll('[data-price-group][data-price-code]');
    inputs.forEach((input) => {
      const group = input.getAttribute('data-price-group');
      const code = input.getAttribute('data-price-code');
      const raw = String(input.value || '').trim();
      const numeric = Number(raw);

      if (!Number.isFinite(numeric) || numeric < 0) {
        throw new Error(`Invalid price at ${group}/${code}.`);
      }

      prices[group][code] = Math.round(numeric * 100) / 100;
    });

    return { prices };
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
      const [statsRes, regsRes, pricingRes, emailTemplateRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/registrations'),
        fetch('/api/admin/pricing'),
        fetch('/api/admin/email/templates')
      ]);

      if (statsRes.status === 401 || regsRes.status === 401 || pricingRes.status === 401 || emailTemplateRes.status === 401) {
        window.location.href = '/admin';
        return;
      }

      const statsData = await statsRes.json();
      const regsData = await regsRes.json();
      const pricingData = await pricingRes.json();
      const emailTemplateData = await emailTemplateRes.json();

      if (!statsRes.ok || !regsRes.ok || !pricingRes.ok || !emailTemplateRes.ok) {
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

      if (emailCapabilities.provider !== 'brevo') {
        showEmailMessage('error', 'Email provider is not configured. Set Brevo env values first.');
        if (sendEmailBtn) {
          sendEmailBtn.disabled = true;
        }
      } else if (sendEmailBtn) {
        sendEmailBtn.disabled = false;
      }
    } catch (error) {
      statsEl.innerHTML = `<div class="notice error">${error.message}</div>`;
      rowsEl.innerHTML = '<tr><td colspan="7">Failed to load data.</td></tr>';
      allRegistrations = [];
      updateSearchMeta(0, 0, '');
      showPricingMessage('error', 'Failed to load pricing settings.');
      if (emailRecipientRowsEl) {
        emailRecipientRowsEl.innerHTML = '<tr><td colspan="4">Failed to load recipients.</td></tr>';
      }
      showEmailMessage('error', 'Failed to load email sender data.');
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

      const result = await response.json();
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

      const result = await response.json();
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

  async function copyRetryPaymentLink(registrationId) {
    const response = await fetch('/api/admin/registrations/retry-link', {
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

    const url = String(result.url || '');
    if (!url) {
      throw new Error('Retry link was not returned by the server.');
    }

    let copied = false;
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url);
      copied = true;
    } else {
      const tempInput = document.createElement('input');
      tempInput.value = url;
      document.body.appendChild(tempInput);
      tempInput.select();
      copied = document.execCommand('copy');
      tempInput.remove();
    }

    if (copied) {
      window.alert(`Retry payment link copied.\nExpires at: ${result.expiresAt}`);
      return;
    }

    window.prompt('Copy retry payment link:', url);
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

    if (sendEmailBtn) {
      sendEmailBtn.disabled = true;
      sendEmailBtn.textContent = 'Sending...';
    }
    showEmailMessage('ok', 'Sending email...');

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
      const result = await response.json();

      if (response.status === 401) {
        window.location.href = '/admin';
        return;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Email sending failed.');
      }

      const failed = Number(result.failedCount || 0);
      if (failed > 0) {
        const firstFailure = Array.isArray(result.failures) && result.failures.length
          ? ` First failure: ${result.failures[0].email} (${result.failures[0].error})`
          : '';
        showEmailMessage(
          'error',
          `${result.message || 'Email sent with partial failures.'}${firstFailure}`
        );
        return;
      }

      showEmailMessage('ok', result.message || 'Email sent successfully.');
    } catch (error) {
      showEmailMessage('error', error.message);
    } finally {
      if (sendEmailBtn) {
        sendEmailBtn.disabled = false;
        sendEmailBtn.textContent = 'Send email';
      }
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
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

    const retryLinkButton = event.target.closest('.js-copy-retry-link');
    if (retryLinkButton) {
      const registrationId = retryLinkButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      copyRetryPaymentLink(registrationId).catch((error) => {
        window.alert(error.message);
      });
      return;
    }

    const anonymizeButton = event.target.closest('.js-anonymize');
    if (anonymizeButton) {
      const registrationId = anonymizeButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      anonymize(registrationId);
    }
  });

  loadData();
})();
