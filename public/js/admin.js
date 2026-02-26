(function () {
  const statsEl = document.getElementById('stats');
  const rowsEl = document.getElementById('rows');
  const logoutBtn = document.getElementById('logout-btn');

  const labels = {
    campType: {
      iaido: 'Iaidō',
      jodo: 'Jōdō',
      both: 'Iaidō + Jōdō'
    },
    mealPlan: {
      none: 'Étkezés nélkül',
      lunch: 'Ebéd',
      full: 'Teljes étkezés'
    },
    accommodation: {
      none: 'Szállás nélkül',
      dojo: 'Dojo',
      guesthouse: 'Vendégház'
    }
  };

  function formatHuf(value) {
    return `${Number(value || 0).toLocaleString('hu-HU')} HUF`;
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
    const bothCount = stats.byCampType && stats.byCampType.both ? stats.byCampType.both : 0;

    statsEl.innerHTML = [
      renderStatCard('Összes regisztráció', stats.total),
      renderStatCard('Vizsgázni szeretne', stats.wantsExam),
      renderStatCard('Mindkét tábor', bothCount),
      renderStatCard('Várható bevétel', formatHuf(stats.projectedRevenueHuf))
    ].join('');
  }

  function formatOption(groupName, code) {
    const group = labels[groupName] || {};
    return group[code] || code || '-';
  }

  function renderRows(registrations) {
    if (!registrations.length) {
      rowsEl.innerHTML = '<tr><td colspan="6">Nincs még regisztráció.</td></tr>';
      return;
    }

    rowsEl.innerHTML = registrations
      .slice()
      .reverse()
      .map((item) => {
        const camp = formatOption('campType', item.campType);
        const options = `${formatOption('mealPlan', item.mealPlan)} / ${formatOption('accommodation', item.accommodation)}`;

        return `
          <tr>
            <td>${new Date(item.createdAt).toLocaleString('hu-HU')}</td>
            <td>${item.fullName}<br /><span class="helper">${item.email}</span></td>
            <td>${camp}</td>
            <td>${options}</td>
            <td>${formatHuf(item.amountHuf)}</td>
            <td>${item.status}</td>
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
        throw new Error('API hiba az admin adatok betöltésénél.');
      }

      renderStats(statsData.stats);
      renderRows(regsData.registrations || []);
    } catch (error) {
      statsEl.innerHTML = `<div class="notice error">${error.message}</div>`;
      rowsEl.innerHTML = '<tr><td colspan="6">Nem sikerült az adatok betöltése.</td></tr>';
    }
  }

  async function logout() {
    try {
      await fetch('/api/admin/logout', { method: 'POST' });
    } finally {
      window.location.href = '/admin';
    }
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }

  loadData();
})();
