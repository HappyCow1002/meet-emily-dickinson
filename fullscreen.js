(() => {
  'use strict';
  const button = document.getElementById('fullscreenBtn');
  const label = document.getElementById('fullscreenLabel');
  const notice = document.getElementById('fullscreenStatus');
  const root = document.documentElement;
  const enter = root.requestFullscreen || root.webkitRequestFullscreen;
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  const active = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const sync = () => {
    const on = active();
    label.textContent = on ? 'Exit full screen' : 'Full screen';
    button.setAttribute('aria-label', on ? 'Exit full screen' : 'Enter full screen');
    button.setAttribute('aria-pressed', String(on));
    button.title = on ? 'Exit full screen (Esc)' : 'Enter full screen';
  };
  button.addEventListener('click', async () => {
    notice.hidden = true;
    try {
      if (!enter || !exit) throw new Error('unsupported');
      if (active()) await exit.call(document);
      else await enter.call(root);
      sync();
    } catch {
      notice.textContent = 'Full screen is unavailable here. Open this website in a Chrome, Edge, or Safari browser tab and try again.';
      notice.hidden = false;
      sync();
    }
  });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
})();
