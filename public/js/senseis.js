(function () {
  const buttons = Array.from(document.querySelectorAll('[data-sensei-target]'));
  const panels = Array.from(document.querySelectorAll('.sensei-panel'));
  if (!buttons.length || !panels.length) return;

  function activateSensei(targetId, updateHash = true) {
    const targetPanel = panels.find((panel) => panel.id === targetId) || panels[0];
    if (!targetPanel) return;

    panels.forEach((panel) => {
      const active = panel === targetPanel;
      panel.hidden = !active;
      panel.classList.toggle('active', active);
    });

    buttons.forEach((button) => {
      const active = button.dataset.senseiTarget === targetPanel.id;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });

    if (updateHash) {
      window.history.replaceState(null, '', `#${targetPanel.id}`);
    }
  }

  buttons.forEach((button) => {
    button.addEventListener('click', () => activateSensei(button.dataset.senseiTarget));
  });

  const initialId = String(window.location.hash || '').replace(/^#/, '');
  activateSensei(initialId || buttons[0].dataset.senseiTarget, false);
})();
