(function () {
  const countdownEl = document.getElementById('countdown');
  const joiningCountriesEl = document.getElementById('joining-countries');
  const joiningCountryListEl = document.getElementById('joining-country-list');
  const joiningCountryMarqueeEl = document.querySelector('.joining-country-marquee');
  if (!countdownEl) return;

  const seminarStartUtc = Date.parse('2026-07-30T07:00:00Z');
  const countryPixelsPerSecond = 44;
  let countryAnimationFrameId = 0;
  let countryLastFrameAt = 0;
  let countryOffsetPx = 0;

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
    if (countryAnimationFrameId) {
      window.cancelAnimationFrame(countryAnimationFrameId);
      countryAnimationFrameId = 0;
    }
    countryLastFrameAt = 0;
  }

  function getCountryGapPx() {
    const listStyles = window.getComputedStyle(joiningCountryListEl);
    return parseFloat(listStyles.gap || listStyles.columnGap || '0') || 0;
  }

  function animateCountries(frameAt) {
    if (!joiningCountryListEl || !joiningCountryMarqueeEl) return;

    if (!countryLastFrameAt) {
      countryLastFrameAt = frameAt;
    }

    const deltaSeconds = Math.max(0, (frameAt - countryLastFrameAt) / 1000);
    countryLastFrameAt = frameAt;
    countryOffsetPx += deltaSeconds * countryPixelsPerSecond;

    const gap = getCountryGapPx();
    while (joiningCountryListEl.children.length > 1) {
      const firstChip = joiningCountryListEl.firstElementChild;
      if (!firstChip) break;

      const travelDistance = firstChip.getBoundingClientRect().width + gap;
      if (!travelDistance || countryOffsetPx < travelDistance) break;

      countryOffsetPx -= travelDistance;
      joiningCountryListEl.appendChild(firstChip);
    }

    joiningCountryListEl.style.transform = `translateX(-${countryOffsetPx}px)`;
    countryAnimationFrameId = window.requestAnimationFrame(animateCountries);
  }

  function syncCountryRotation() {
    if (!joiningCountryListEl || !joiningCountryMarqueeEl) return;

    stopCountryRotation();
    countryOffsetPx = 0;
    joiningCountryListEl.style.transform = 'translateX(0)';

    const shouldRotate = joiningCountryListEl.children.length > 1
      && joiningCountryListEl.scrollWidth > joiningCountryMarqueeEl.clientWidth + 4;
    joiningCountryListEl.classList.toggle('is-static', !shouldRotate);

    if (shouldRotate) {
      countryAnimationFrameId = window.requestAnimationFrame(animateCountries);
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
