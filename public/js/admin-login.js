(function () {
  const form = document.getElementById('admin-login-form');
  if (!form) return;

  const messageEl = document.getElementById('login-message');
  const loginBtn = document.getElementById('login-btn');

  function showMessage(type, text) {
    messageEl.className = `notice ${type}`;
    messageEl.textContent = text;
  }

  async function submitLogin(event) {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      password: String(formData.get('password') || '')
    };

    if (!payload.password) {
      showMessage('error', 'Password is required.');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in...';
    messageEl.className = '';
    messageEl.textContent = '';

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (!response.ok) {
        showMessage('error', result.error || 'Login failed.');
        return;
      }

      window.location.href = '/admin';
    } catch (error) {
      showMessage('error', `Login request failed: ${error.message}`);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign in';
    }
  }

  form.addEventListener('submit', submitLogin);
})();
