(function () {
  const countdownEl = document.getElementById('countdown');
  const joiningCountriesEl = document.getElementById('joining-countries');
  const joiningCountryListEl = document.getElementById('joining-country-list');
  if (!countdownEl) return;

  const seminarStartUtc = Date.parse('2026-07-30T07:00:00Z');

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderCountdown() {
    const now = Date.now();
    const diffMs = Math.max(0, seminarStartUtc - now);
    const totalSeconds = Math.floor(diffMs / 1000);

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    countdownEl.innerHTML = `
      <span class="countdown-value">${days}</span><span class="countdown-unit">days</span>
      <span class="countdown-value">${hours}</span><span class="countdown-unit">hours</span>
      <span class="countdown-value">${minutes}</span><span class="countdown-unit">minutes</span>
      <span class="countdown-value">${seconds}</span><span class="countdown-unit">seconds</span>
    `;
  }

  renderCountdown();
  setInterval(renderCountdown, 1000);

  async function loadJoiningCountries() {
    if (!joiningCountriesEl || !joiningCountryListEl) return;

    try {
      const response = await fetch('/api/public/countries');
      if (!response.ok) return;

      const result = await response.json().catch(() => null);
      const countries = Array.isArray(result?.countries) ? result.countries : [];
      if (countries.length === 0) return;

      joiningCountryListEl.innerHTML = countries.map((country) => `
        <div class="joining-country-chip" title="${escapeHtml(country.name || '')}">
          ${country.flagUrl
            ? `<img class="joining-country-flag-image" src="${escapeHtml(country.flagUrl)}" alt="${escapeHtml(country.name || '')} flag" loading="lazy" decoding="async" />`
            : `<span class="joining-country-flag" aria-hidden="true">${escapeHtml(country.flagFallback || '🌏')}</span>`}
          <span class="joining-country-name">${escapeHtml(country.name || '')}</span>
        </div>
      `).join('');

      joiningCountriesEl.hidden = false;
    } catch {
      // Keep the section hidden if the public country feed is unavailable.
    }
  }

  loadJoiningCountries();
})();
