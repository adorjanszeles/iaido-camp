(function () {
  const statsEl = document.getElementById('stats');
  const rowsEl = document.getElementById('rows');
  const logoutBtn = document.getElementById('logout-btn');
  const exportCsvBtn = document.getElementById('export-csv-btn');

  const labels = {
    campType: {
      iaido: 'Iaido',
      jodo: 'Jodo',
      both: 'Iaido + Jodo'
    },
    mealPlan: {
      none: 'No meal',
      lunch: 'Lunch',
      full: 'Full meal'
    },
    accommodation: {
      none: 'No accommodation',
      dojo: 'Dojo',
      guesthouse: 'Guesthouse'
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
    statsEl.innerHTML = [
      renderStatCard('Active registrations', stats.total),
      renderStatCard('Iaido applicants', stats.iaidoApplicants || 0),
      renderStatCard('Jodo applicants', stats.jodoApplicants || 0),
      renderStatCard('Deleted status', stats.deletedCount || 0),
      renderStatCard('Anonymized', stats.anonymizedCount || 0),
      renderStatCard('Iaido exam applicants', stats.wantsExamIaido || 0),
      renderStatCard('Jodo exam applicants', stats.wantsExamJodo || 0),
      renderStatCard('Projected revenue', formatCurrency(stats.projectedRevenueHuf, 'EUR'))
    ].join('');
  }

  function formatOption(groupName, code) {
    const group = labels[groupName] || {};
    return group[code] || code || '-';
  }

  function buildOptionsText(item) {
    const meal = formatOption('mealPlan', item.mealPlan);
    const accommodation = formatOption('accommodation', item.accommodation);
    const gradeIaido = `Iaido grade: ${item.currentGradeIaido || '-'}`;
    const gradeJodo = `Jodo grade: ${item.currentGradeJodo || '-'}`;
    const examIaido = item.wantsExamIaido
      ? `Iaido exam: yes (${item.targetGradeIaido || '-'})`
      : 'Iaido exam: no';
    const examJodo = item.wantsExamJodo
      ? `Jodo exam: yes (${item.targetGradeJodo || '-'})`
      : 'Jodo exam: no';
    return `${meal} / ${accommodation}<br /><span class="helper">${gradeIaido} | ${gradeJodo}<br />${examIaido} | ${examJodo}</span>`;
  }

  function renderRows(registrations) {
    if (!registrations.length) {
      rowsEl.innerHTML = '<tr><td colspan="7">No registrations yet.</td></tr>';
      return;
    }

    rowsEl.innerHTML = registrations
      .slice()
      .reverse()
      .map((item) => {
        const camp = formatOption('campType', item.campType);
        const isDeleted = item.status === 'DELETED';
        const isAnonymized = item.status === 'ANONYMIZED';
        const deleteAction = isDeleted || isAnonymized
          ? '<span class="helper">-</span>'
          : `<button class="btn secondary btn-small js-mark-deleted" data-registration-id="${item.id}" type="button">Set deleted</button>`;
        const anonymizeAction = isAnonymized
          ? '<span class="helper">Anonymized</span>'
          : `<button class="btn secondary btn-small js-anonymize" data-registration-id="${item.id}" type="button">GDPR anonymize</button>`;
        const actionButtons = `${deleteAction}<div style="height:0.35rem"></div>${anonymizeAction}`;

        return `
          <tr>
            <td>${new Date(item.createdAt).toLocaleString('en-GB')}</td>
            <td>${item.fullName}<br /><span class="helper">${item.email}</span></td>
            <td>${camp}</td>
            <td>${buildOptionsText(item)}</td>
            <td>${formatCurrency(item.amountHuf, item.currency || 'EUR')}</td>
            <td>${item.status}</td>
            <td>${actionButtons}</td>
          </tr>
        `;
      })
      .join('');
  }

  async function loadData() {
    try {
      const [statsRes, regsRes] = await Promise.all([fetch('/api/stats'), fetch('/api/registrations')]);

      if (statsRes.status === 401 || regsRes.status === 401) {
        window.location.href = '/admin';
        return;
      }

      const statsData = await statsRes.json();
      const regsData = await regsRes.json();

      if (!statsRes.ok || !regsRes.ok) {
        throw new Error('API error while loading admin data.');
      }

      renderStats(statsData.stats);
      renderRows(regsData.registrations || []);
    } catch (error) {
      statsEl.innerHTML = `<div class="notice error">${error.message}</div>`;
      rowsEl.innerHTML = '<tr><td colspan="7">Failed to load data.</td></tr>';
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

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportCsv);
  }

  rowsEl.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('.js-mark-deleted');
    if (deleteButton) {
      const registrationId = deleteButton.getAttribute('data-registration-id');
      if (!registrationId) return;
      markDeleted(registrationId);
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
