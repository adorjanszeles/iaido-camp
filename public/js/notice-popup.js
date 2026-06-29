(function initOfficialNoticePopup() {
  const storageKey = 'officialCommunicationNoticeDismissedV1';

  function wasDismissed() {
    try {
      return window.sessionStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  }

  function markDismissed() {
    try {
      window.sessionStorage.setItem(storageKey, 'true');
    } catch {
      // Ignore storage errors and still close the popup.
    }
  }

  function injectStyles() {
    if (document.getElementById('official-notice-popup-styles')) {
      return;
    }

    const styleEl = document.createElement('style');
    styleEl.id = 'official-notice-popup-styles';
    styleEl.textContent = `
      .official-notice-overlay {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: rgba(12, 27, 44, 0.66);
        backdrop-filter: blur(4px);
      }

      .official-notice-overlay[hidden] {
        display: none;
      }

      .official-notice-card {
        width: min(760px, 100%);
        max-height: calc(100vh - 2rem);
        overflow: auto;
        border: 1px solid rgba(171, 34, 34, 0.2);
        border-radius: 24px;
        padding: 1.35rem;
        background: linear-gradient(180deg, #fffdf8 0%, #fff7ef 100%);
        box-shadow: 0 24px 70px rgba(10, 28, 45, 0.28);
        color: #17324d;
      }

      .official-notice-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .official-notice-title {
        margin: 0;
        font-size: clamp(1.2rem, 2.4vw, 1.6rem);
        line-height: 1.3;
        color: #8b1e1e;
      }

      .official-notice-close {
        flex: 0 0 auto;
        border: 0;
        border-radius: 999px;
        padding: 0.55rem 0.85rem;
        background: rgba(139, 30, 30, 0.1);
        color: #8b1e1e;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .official-notice-close:hover {
        background: rgba(139, 30, 30, 0.16);
      }

      .official-notice-body p,
      .official-notice-body li {
        line-height: 1.65;
      }

      .official-notice-body ul {
        margin: 0.8rem 0 1rem 1.25rem;
        padding: 0;
      }

      .official-notice-body li + li {
        margin-top: 0.45rem;
      }

      .official-notice-body a {
        color: #0f5d8c;
        word-break: break-word;
      }

      .official-notice-body strong {
        color: #102b43;
      }

      .official-notice-footer {
        display: flex;
        justify-content: flex-end;
        margin-top: 1.2rem;
      }

      .official-notice-dismiss {
        border: 0;
        border-radius: 999px;
        padding: 0.75rem 1.15rem;
        background: #8b1e1e;
        color: #fff;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .official-notice-dismiss:hover {
        background: #731818;
      }

      @media (max-width: 680px) {
        .official-notice-card {
          padding: 1rem;
          border-radius: 18px;
        }

        .official-notice-header {
          flex-direction: column;
          align-items: stretch;
        }

        .official-notice-close,
        .official-notice-dismiss {
          width: 100%;
          text-align: center;
        }
      }
    `;
    document.head.appendChild(styleEl);
  }

  function buildPopup() {
    const overlay = document.createElement('div');
    overlay.className = 'official-notice-overlay';
    overlay.setAttribute('role', 'presentation');

    overlay.innerHTML = `
      <div class="official-notice-card" role="dialog" aria-modal="true" aria-labelledby="official-notice-title" tabindex="-1">
        <div class="official-notice-header">
          <h2 class="official-notice-title" id="official-notice-title">⚠️ Important Communication Notice – Please Read</h2>
          <button class="official-notice-close" type="button" aria-label="Close notice">Close</button>
        </div>
        <div class="official-notice-body">
          <p>Dear Participants,</p>
          <p>We have recently been informed that some participants may have received a WhatsApp call from a Hungarian phone number.</p>
          <p>To avoid any confusion or potential fraud, we would like to clarify our official communication channels:</p>
          <ul>
            <li><strong>We communicate with participants only via email using our official address:</strong><br /><a href="mailto:info@summerseminar2026.hu">info@summerseminar2026.hu</a></li>
            <li><strong>Official information is published only on:</strong><br /><a href="https://summerseminar2026.hu" target="_blank" rel="noopener noreferrer">https://summerseminar2026.hu</a><br />the official Ishido Sensei Summer Seminar 2026 Facebook Event.</li>
            <li><strong>We never contact participants by phone or via WhatsApp.</strong></li>
          </ul>
          <p>If you have reserved accommodation through one of our recommended hotels, it is possible that the hotel may contact you directly regarding your reservation. However, we have no information about any phone calls made by the hotels, and these are entirely independent from the seminar organizers.</p>
          <p>For your own security, please do not rely on information received through unofficial channels, and never share personal or payment information with unknown callers.</p>
          <p>If you receive any suspicious message or phone call claiming to be related to the seminar, please contact us immediately at <a href="mailto:info@summerseminar2026.hu">info@summerseminar2026.hu</a> before taking any action.</p>
          <p>Unfortunately, the organizers cannot accept responsibility for communications originating from unofficial sources. We kindly ask everyone to follow only our official communication channels.</p>
          <p>Thank you for your understanding and cooperation.</p>
          <p><strong>The Organizing Team</strong><br />Ishido Sensei Summer Seminar 2026</p>
        </div>
        <div class="official-notice-footer">
          <button class="official-notice-dismiss" type="button">I Understand</button>
        </div>
      </div>
    `;

    return overlay;
  }

  function attachPopup() {
    if (wasDismissed()) {
      return;
    }

    injectStyles();

    const overlay = buildPopup();
    const dialog = overlay.querySelector('.official-notice-card');
    const closeButtons = overlay.querySelectorAll('.official-notice-close, .official-notice-dismiss');
    const previousOverflow = document.body.style.overflow;

    function closePopup() {
      markDismissed();
      document.body.style.overflow = previousOverflow;
      overlay.remove();
      document.removeEventListener('keydown', onKeyDown);
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        closePopup();
      }
    }

    closeButtons.forEach((button) => {
      button.addEventListener('click', closePopup);
    });

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        closePopup();
      }
    });

    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    document.body.appendChild(overlay);
    dialog.focus?.();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachPopup, { once: true });
  } else {
    attachPopup();
  }
})();
