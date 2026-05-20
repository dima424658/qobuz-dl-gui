/**
 * Folder browse buttons (S1). Binds all `.btn-browse` globally (setup + settings).
 */
(function () {
  "use strict";
  const QG = (window.QobuzGui = window.QobuzGui || {});
  QG.features = QG.features || {};
  QG.features.setup = QG.features.setup || {};

  function init() {
    const api = QG.api;
    document.querySelectorAll(".btn-browse").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          const res = await api.utilityApi.browseFolder();
          const data = await res.json();
          if (data.ok && data.path) {
            const targetId = btn.dataset.target;
            const input = document.getElementById(targetId);
            if (input) input.value = data.path;
          }
        } catch (e) {
          console.error("Browse error:", e);
        }
      });
    });
  }

  QG.features.setup.browseButtons = { init };
})();
