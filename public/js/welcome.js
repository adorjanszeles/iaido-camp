(function () {
  const countdownEl = document.getElementById('countdown');
  const joiningCountriesEl = document.getElementById('joining-countries');
  const joiningCountryListEl = document.getElementById('joining-country-list');
  const joiningCountryMarqueeEl = document.querySelector('.joining-country-marquee');
  if (!countdownEl) return;

  const seminarStartUtc = Date.parse('2026-07-30T07:00:00Z');
  const countryRotationIntervalMs = 1150;
  const countrySlideDurationMs = 380;
  let countryRotationTimer = null;
  let countryRotationInProgress = false;

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

  function stopCountryRotation() {
    if (countryRotationTimer) {
      window.clearInterval(countryRotationTimer);
      countryRotationTimer = null;
    }
    countryRotationInProgress = false;
  }

  function rotateCountriesOnce() {
    if (!joiningCountryListEl || countryRotationInProgress) return;
    const firstChip = joiningCountryListEl.firstElementChild;
    if (!firstChip || joiningCountryListEl.children.length < 2) return;

    const listStyles = window.getComputedStyle(joiningCountryListEl);
    const gap = parseFloat(listStyles.gap || listStyles.columnGap || '0') || 0;
    const travelDistance = firstChip.getBoundingClientRect().width + gap;
    if (!travelDistance) return;

    countryRotationInProgress = true;
    joiningCountryListEl.style.transition = `transform ${countrySlideDurationMs}ms ease`;
    joiningCountryListEl.style.transform = `translateX(-${travelDistance}px)`;

    window.setTimeout(() => {
      joiningCountryListEl.style.transition = 'none';
      joiningCountryListEl.style.transform = 'translateX(0)';
      joiningCountryListEl.appendChild(firstChip);
      countryRotationInProgress = false;
    }, countrySlideDurationMs);
  }

  function syncCountryRotation() {
    if (!joiningCountryListEl || !joiningCountryMarqueeEl) return;

    stopCountryRotation();
    joiningCountryListEl.style.transition = 'none';
    joiningCountryListEl.style.transform = 'translateX(0)';

    const shouldRotate = joiningCountryListEl.scrollWidth > joiningCountryMarqueeEl.clientWidth + 4;
    joiningCountryListEl.classList.toggle('is-static', !shouldRotate);

    if (shouldRotate) {
      countryRotationTimer = window.setInterval(rotateCountriesOnce, countryRotationIntervalMs);
    }
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
        </div>
      `).join('');

      joiningCountriesEl.hidden = false;
      window.requestAnimationFrame(syncCountryRotation);

      const images = joiningCountryListEl.querySelectorAll('img');
      images.forEach((img) => {
        img.addEventListener('load', syncCountryRotation, { once: true });
        img.addEventListener('error', syncCountryRotation, { once: true });
      });
      window.addEventListener('resize', syncCountryRotation);
    } catch {
      // Keep the section hidden if the public country feed is unavailable.
    }
  }

  loadJoiningCountries();
})();
