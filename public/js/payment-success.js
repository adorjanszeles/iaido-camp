(function () {
  const subtitleEl = document.getElementById('payment-success-subtitle');
  const metaEl = document.getElementById('payment-success-meta');
  if (!subtitleEl || !metaEl) return;

  const url = new URL(window.location.href);
  const sessionId = String(url.searchParams.get('session_id') || '').trim();

  function cleanUrl() {
    url.searchParams.delete('session_id');
    url.searchParams.delete('registration_id');
    const next = `${url.pathname}${url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''}`;
    window.history.replaceState({}, document.title, next);
  }

  if (!sessionId) {
    subtitleEl.textContent = 'Payment is complete. Registration status will be finalized shortly.';
    metaEl.textContent = 'Missing Stripe session ID in return URL. Webhook update may still arrive shortly.';
    cleanUrl();
    return;
  }

  fetch('/api/payments/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ sessionId })
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Could not confirm payment status.');
      }
      return result;
    })
    .then((result) => {
      const status = String(result.registrationStatus || '').trim();
      if (result.paid || status === 'PAID') {
        subtitleEl.textContent = 'Payment confirmed successfully.';
        metaEl.textContent = `Registration ID: ${result.registrationId}. Status: ${status || 'PAID'}.`;
      } else {
        subtitleEl.textContent = 'Payment return was successful, but payment is not marked as paid yet.';
        metaEl.textContent = `Current registration status: ${status || 'PENDING_PAYMENT'}. Please contact the organizer if this does not change soon.`;
      }
    })
    .catch((error) => {
      subtitleEl.textContent = 'Payment return was successful. Final confirmation is still pending.';
      metaEl.textContent = error.message;
    })
    .finally(cleanUrl);
})();
