/**
 * Setup overlay, auth flows, and initial app shell routing (S1).
 */
(function () {
  "use strict";
  const QG = (window.QobuzGui = window.QobuzGui || {});
  QG.features = QG.features || {};
  const setup = (QG.features.setup = QG.features.setup || {});

  const api = QG.api;
  let _deps = {};

  function configure(deps) {
    _deps = { ..._deps, ...(deps || {}) };
  }

  function showSetup() {
    document.getElementById("setup-overlay").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }

  function showApp() {
    document.getElementById("setup-overlay").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    if (typeof _deps.startDownloadSse === "function") {
      _deps.startDownloadSse();
    }
  }

  function loadSettingsForm() {
    if (typeof _deps.loadSettingsForm === "function") {
      return _deps.loadSettingsForm();
    }
    if (
      QG.features.settings &&
      QG.features.settings.settingsForm &&
      typeof QG.features.settings.settingsForm.loadIntoForm === "function"
    ) {
      return QG.features.settings.settingsForm.loadIntoForm();
    }
    return Promise.resolve();
  }

  function initSetup() {
    const oauthBtn = document.getElementById("oauth-btn");
    const oauthBtnText = document.getElementById("oauth-btn-text");
    const oauthSpinner = document.getElementById("oauth-spinner");
    const oauthErr = document.getElementById("setup-error-oauth");
    let _oauthPolling = null;

    oauthBtn.addEventListener("click", async () => {
      oauthErr.classList.add("hidden");
      oauthBtn.disabled = true;
      oauthBtnText.textContent = "Opening browser…";
      oauthSpinner.classList.remove("hidden");

      try {
        const res = await api.setupApi.oauthStart();
        const data = await res.json();
        if (!data.ok) {
          oauthErr.textContent = data.error || "OAuth start failed.";
          oauthErr.classList.remove("hidden");
          return;
        }
        oauthBtnText.textContent = "Waiting for browser login…";
        _oauthPolling = setInterval(async () => {
          const s = await QG.features.status.checkStatus();
          if (s && s.ready) {
            clearInterval(_oauthPolling);
            oauthBtn.disabled = false;
            oauthBtnText.textContent = "Login with Qobuz";
            oauthSpinner.classList.add("hidden");
            showApp();
            await loadSettingsForm();
          }
        }, 1500);
      } catch (e) {
        oauthErr.textContent = "Network error: " + e.message;
        oauthErr.classList.remove("hidden");
        oauthBtn.disabled = false;
        oauthBtnText.textContent = "Login with Qobuz";
        oauthSpinner.classList.add("hidden");
      }
    });

    const tokenBtn = document.getElementById("token-btn");
    const tokenBtnText = document.getElementById("token-btn-text");
    const tokenSpinner = document.getElementById("token-spinner");
    const tokenErr = document.getElementById("setup-error-token");

    tokenBtn.addEventListener("click", async () => {
      const user_id = document.getElementById("setup-user-id").value.trim();
      const user_auth_token = document
        .getElementById("setup-user-auth-token")
        .value.trim();
      const folder =
        document.getElementById("setup-folder-token").value.trim() ||
        "Qobuz Downloads";
      const quality = document.getElementById("setup-quality-token").value;

      tokenErr.classList.add("hidden");
      if (!user_id || !user_auth_token) {
        tokenErr.textContent = "Please enter both User ID and User Auth Token.";
        tokenErr.classList.remove("hidden");
        return;
      }

      tokenBtn.disabled = true;
      tokenBtnText.textContent = "Connecting…";
      tokenSpinner.classList.remove("hidden");

      try {
        const res = await api.setupApi.tokenLogin({
          user_id,
          user_auth_token,
          default_folder: folder,
          default_quality: quality,
        });
        const data = await res.json();
        if (data.ok) {
          showApp();
          QG.features.status.updateStatus(true);
          await loadSettingsForm();
        } else {
          tokenErr.textContent = data.error || "Token login failed.";
          tokenErr.classList.remove("hidden");
        }
      } catch (e) {
        tokenErr.textContent = "Network error: " + e.message;
        tokenErr.classList.remove("hidden");
      } finally {
        tokenBtn.disabled = false;
        tokenBtnText.textContent = "Connect with Token";
        tokenSpinner.classList.add("hidden");
      }
    });

    const btn = document.getElementById("setup-btn");
    const btnText = document.getElementById("setup-btn-text");
    const spinner = document.getElementById("setup-spinner");
    const errEl = document.getElementById("setup-error");

    btn.addEventListener("click", async () => {
      const email = document.getElementById("setup-email").value.trim();
      const password = document.getElementById("setup-password").value;
      const folder =
        document.getElementById("setup-folder").value.trim() ||
        "Qobuz Downloads";
      const quality = document.getElementById("setup-quality").value;

      errEl.classList.add("hidden");
      if (!email || !password) {
        errEl.textContent = "Please enter your email and password.";
        errEl.classList.remove("hidden");
        return;
      }

      btn.disabled = true;
      btnText.textContent = "Connecting…";
      spinner.classList.remove("hidden");

      try {
        const res = await api.setupApi.setup({
          email,
          password,
          default_folder: folder,
          default_quality: quality,
        });
        const data = await res.json();
        if (data.ok) {
          showApp();
          QG.features.status.updateStatus(true);
          await loadSettingsForm();
        } else {
          errEl.textContent = data.error || "Setup failed.";
          errEl.classList.remove("hidden");
        }
      } catch (e) {
        errEl.textContent = "Network error: " + e.message;
        errEl.classList.remove("hidden");
      } finally {
        btn.disabled = false;
        btnText.textContent = "Save & Connect";
        spinner.classList.add("hidden");
      }
    });
  }

  async function resolveInitialView() {
    const status = await QG.features.status.checkStatus();
    if (status && (status.ready || status.has_config)) {
      showApp();
      if (!status.ready && status.has_config) {
        const dot = document.getElementById("status-dot");
        const label = document.getElementById("status-label");
        if (dot && label) {
          dot.className = "status-dot connecting";
          label.textContent = "Connecting…";
        }
        try {
          const connect =
            typeof _deps.connect === "function"
              ? _deps.connect
              : () => api.setupApi.connect();
          const res = await connect();
          const data = await res.json();
          QG.features.status.updateStatus(data.ok);
        } catch (_) {
          QG.features.status.updateStatus(false);
        }
      }
      await loadSettingsForm();
    } else {
      showSetup();
    }
  }

  Object.assign(setup, {
    configure,
    showSetup,
    showApp,
    initSetup,
    resolveInitialView,
  });
})();
