(function () {
  const countdownEl = document.getElementById('countdown');
  if (!countdownEl) return;

  const seminarStartUtc = Date.parse('2026-07-30T07:00:00Z');

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
})();
