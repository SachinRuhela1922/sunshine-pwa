/* Sunshine School PWA helper: service worker registration, update prompt, optional install button.
 * Include with: <script src="pwa.js" defer></script>
 * Add data-install-button to the tag on pages that should show an "Install app" button.
 */
(function () {
  'use strict';

  var scriptEl = document.currentScript;
  var wantsInstallButton = !!(scriptEl && scriptEl.hasAttribute('data-install-button'));

  // ---------- Service worker + safe updates ----------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    var reloading = false;
    // Only reload for updates. On the very first install there is no previous controller,
    // and reloading then would needlessly interrupt the user.
    var hadController = !!navigator.serviceWorker.controller;

    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        if (reg.waiting && navigator.serviceWorker.controller) showUpdateToast(reg.waiting);

        reg.addEventListener('updatefound', function () {
          var worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) showUpdateToast(worker);
          });
        });

        // Look for a new version when the user returns to the app, and hourly.
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') reg.update().catch(function () {});
        });
        setInterval(function () { reg.update().catch(function () {}); }, 60 * 60 * 1000);
      }).catch(function (err) {
        console.warn('Service worker registration failed:', err);
      });
    });
  }

  function makeEl(tag, css, text) {
    var el = document.createElement(tag);
    el.style.cssText = css;
    if (text) el.textContent = text;
    return el;
  }

  function showUpdateToast(worker) {
    if (document.getElementById('pwa-update-toast')) return;
    var bar = makeEl('div',
      'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:99999;display:flex;gap:12px;align-items:center;' +
      'background:#2d1f0c;color:#fff;padding:12px 16px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);' +
      'font:14px "Segoe UI",Roboto,system-ui,sans-serif;max-width:calc(100vw - 24px)');
    bar.id = 'pwa-update-toast';
    bar.setAttribute('role', 'status');
    bar.appendChild(makeEl('span', '', 'A new version is available.'));
    var update = makeEl('button', 'border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font:inherit;font-weight:600;color:#fff;background:#f58a2e', 'Update');
    update.addEventListener('click', function () { worker.postMessage({ type: 'SKIP_WAITING' }); });
    var later = makeEl('button', 'border:0;background:transparent;color:#ddd;cursor:pointer;font:inherit', 'Later');
    later.addEventListener('click', function () { bar.remove(); });
    bar.appendChild(update);
    bar.appendChild(later);
    document.body.appendChild(bar);
  }

  // ---------- Install button (only on browsers that fire beforeinstallprompt) ----------
  if (!wantsInstallButton) return;

  var deferredPrompt = null;
  var btn = null;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }

  function removeButton() {
    if (btn) { btn.remove(); btn = null; }
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    if (isStandalone()) return;
    deferredPrompt = e;
    if (btn) return;
    btn = makeEl('button',
      'position:fixed;right:18px;bottom:18px;z-index:99998;border:0;border-radius:999px;padding:12px 20px;cursor:pointer;' +
      'font:600 14px "Segoe UI",Roboto,system-ui,sans-serif;color:#fff;background:linear-gradient(135deg,#f9b042,#f58a2e);' +
      'box-shadow:0 8px 24px rgba(245,138,46,.4)', 'Install app');
    btn.type = 'button';
    btn.addEventListener('click', function () {
      if (!deferredPrompt) return;
      var promptEvent = deferredPrompt;
      deferredPrompt = null;
      removeButton();
      promptEvent.prompt();
      promptEvent.userChoice.catch(function () {});
    });
    document.body.appendChild(btn);
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    removeButton();
  });
})();
