/* ============================================================
   Qobuz-DL GUI | Frontend Logic
   ============================================================ */

(function () {
  "use strict";

  const api = window.QobuzGui && window.QobuzGui.api;
  const QG = window.QobuzGui;
  const _cgConst = QG.core.constants;
  const _GUI_PENDING_AUDIO_PREFIX = _cgConst.GUI_PENDING_AUDIO_PREFIX;
  const _TS_VIRT_THRESHOLD = _cgConst.TS_VIRT_THRESHOLD;
  const _ic = QG.core.icons;
  const _MISSING_PLACEHOLDER_BTN_TIP = _ic.missingPlaceholderBtnTip;
  const _EXPLICIT_BADGE_SVG = _ic.explicitBadgeSvg;

  function _lyricSearch() {
    return QG.features.lyrics.search;
  }

  function _syncSearchQueuedHighlights() {
    if (QG.features.search && QG.features.search.syncQueuedHighlights) {
      QG.features.search.syncQueuedHighlights();
    }
  }

  function _hist() {
    return QG.features.history;
  }

  function _cardHasResolvedRealAudio(card) {
    if (!card) return false;
    const ap = (card.dataset.audioPath || "").trim();
    if (!ap || ap.startsWith(_GUI_PENDING_AUDIO_PREFIX)) return false;
    if (ap.toLowerCase().endsWith(".missing.txt")) return false;
    return true;
  }

  function _dl() {
    return QG.features.download;
  }

  function _getHistoryDbMap() {
    return _historyStoreHost
      ? _historyStoreHost.getDbItemByKey()
      : _emptyHistoryMap;
  }

  let _queueHost = null;
  /** H5 virtualization host (set in `initDownload()`). */
  let _historyVirtHost = null;
  /** H6 hydrate/persist host (set in `initDownload()`). */
  let _historyStoreHost = null;
  const _emptyHistoryMap = new Map();
  /** R2 attach-track popover host (set in `initDownload()`). */
  let _replacementAttachHost = null;
  /** R3 resolution button sync host (set in `initDownload()`). */
  let _replacementResolutionHost = null;
  /** R3 missing-placeholder host (set in `initDownload()`). */
  let _replacementPlaceholderHost = null;

  /** H3 card rendering host (set in `initDownload()`). */
  let _historyCardHost = null;

  let _sse = null;
  let _trackStatusMap = new Map();
  /** Visible row keys (filtered for virtualized list); mirrors `_tsOrderAll` when not virtual or when showing all. */
  let _tsOrder = [];
  /** Full row keys oldest → newest (unfiltered). */
  let _tsOrderAll = [];
  let _tsKeyToIndex = new Map();
  let _tsActiveDlKeys = new Set();
  /** `"all"` | `"errors"` — owned by history filter module after bootstrap. */
  let _historyFilterHost = null;
  /** Skip redundant filter passes while bulk-loading history from DB. */
  let _tsSkipHistoryFilterApply = false;

  function startSSE() {
    if (_sse) return;
    _sse = new EventSource("/api/stream");

    // Structured per-URL status events
    _sse.addEventListener("status", (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (window._handleDlStatus) window._handleDlStatus(ev);
      } catch (_) {}
    });

    _sse.onerror = () => {
      _sse.close();
      _sse = null;
      setTimeout(startSSE, 3000);
    };
  }

  function _scrollContainerAtBottom(el, slackPx) {
    return QG.core.dom.scrollContainerAtBottom(el, slackPx);
  }

  function _normalizeTrackNo(trackNo) {
    return QG.core.trackIdentity.normalizeTrackNo(trackNo);
  }

  function _normalizeTrackTitle(title) {
    return QG.core.trackIdentity.normalizeTrackTitle(title);
  }

  function _parseTrackRef(trackNo, title) {
    return QG.core.trackIdentity.parseTrackRef(trackNo, title);
  }

  function _trackKey(trackNo, title, lyricAlbum) {
    return QG.core.trackIdentity.trackKey(trackNo, title, lyricAlbum);
  }

  function _tsResetListForHydrate(list) {
    if (_historyVirtHost) _historyVirtHost.teardownVirtScroller();
    _trackStatusMap.clear();
    _tsOrderAll = [];
    _tsOrder = [];
    _tsKeyToIndex.clear();
    _tsActiveDlKeys.clear();
    if (list) list.innerHTML = "";
  }

  function _tsApplyHistoryFilter() {
    if (_historyFilterHost) _historyFilterHost.applyFilter();
  }

  function _tsUpdateErrorHistoryCountBadge(optStemCtx) {
    if (_historyFilterHost) {
      _historyFilterHost.updateErrorHistoryCountBadge(optStemCtx);
    }
  }

  function _initDownloadHistorySegment() {
    if (_historyFilterHost) _historyFilterHost.initDownloadHistorySegment();
  }

  function _tsRegisterAudioPathAlbum(audioPath, lyricAlbum) {
    if (_historyStoreHost) {
      _historyStoreHost.registerAudioPathAlbum(audioPath, lyricAlbum);
    }
  }

  function _tsRebuildKeyIndex() {
    _tsKeyToIndex.clear();
    for (let i = 0; i < _tsOrder.length; i++) {
      _tsKeyToIndex.set(_tsOrder[i], i);
    }
  }

  function _tsApplyHistoryDbItemToCard(card, it) {
    if (_historyStoreHost) {
      _historyStoreHost.applyHistoryDbItemToCard(card, it);
    }
  }

  function _tsMountDbItemAtIndex(it, index) {
    if (!_historyVirtHost) return;
    const inner = _historyVirtHost.getVirtInnerEl();
    if (!inner) return;
    const alb = (it.lyric_album || "").trim();
    const { card, key } = _buildTrackStatusCardEl(
      it.track_no || "",
      it.title || "",
      alb,
      it.cover_url || "",
    );
    _trackStatusMap.set(key, card);
    inner.appendChild(card);
    _tsApplyHistoryDbItemToCard(card, it);
    _historyVirtHost.positionVirtCard(card, index);
  }

  function _lyricAlbumForTrackEv(ev) {
    if (_historyStoreHost) {
      return _historyStoreHost.lyricAlbumForTrackEv(ev);
    }
    return "";
  }

  function _setTrackCardCover(card, coverUrl) {
    if (_historyCardHost) _historyCardHost.setTrackCardCover(card, coverUrl);
  }

  function _buildTrackStatusCardEl(trackNo, title, lyricAlbum, coverUrl) {
    return _historyCardHost
      ? _historyCardHost.buildTrackStatusCardEl(
          trackNo,
          title,
          lyricAlbum,
          coverUrl,
        )
      : { card: null, key: "", parsed: { trackNo: "", title: "" }, alb: "" };
  }

  function _ensureTrackStatusCard(
    trackNo,
    title,
    createNew = false,
    coverUrl,
    lyricAlbum,
  ) {
    return _historyCardHost
      ? _historyCardHost.ensureTrackStatusCard(
          trackNo,
          title,
          createNew,
          coverUrl,
          lyricAlbum,
        )
      : null;
  }

  function _setTrackContentRatingBadge(card, trackExplicitKnown) {
    if (_historyCardHost) {
      _historyCardHost.setTrackContentRatingBadge(card, trackExplicitKnown);
    }
  }

  function _setTrackDownloadChip(
    trackNo,
    title,
    statusText,
    cls,
    linkOpts,
    lyricAlbum,
  ) {
    if (_historyCardHost) {
      _historyCardHost.setTrackDownloadChip(
        trackNo,
        title,
        statusText,
        cls,
        linkOpts,
        lyricAlbum,
      );
    }
  }

  function _updateTrackDownloadProgress(
    trackNo,
    title,
    received,
    total,
    lyricAlbum,
  ) {
    if (_historyCardHost) {
      _historyCardHost.updateTrackDownloadProgress(
        trackNo,
        title,
        received,
        total,
        lyricAlbum,
      );
    }
  }

  function _normalizeLyricDestination(destination) {
    return _historyCardHost
      ? _historyCardHost.normalizeLyricDestination(destination)
      : "";
  }

  function _lyricDestinationFromOutputs(outputs) {
    return _historyCardHost
      ? _historyCardHost.lyricDestinationFromOutputs(outputs)
      : "";
  }

  function _setTrackLyricsChip(
    trackNo,
    title,
    lyricType,
    confidence,
    lyricAlbum,
    lyricProvider,
    lyricDestination,
  ) {
    if (_historyCardHost) {
      _historyCardHost.setTrackLyricsChip(
      trackNo,
      title,
        lyricType,
        confidence,
      lyricAlbum,
        lyricProvider,
        lyricDestination,
      );
    }
  }

  /** LRCLIB duration delta vs reference (±2s hidden; same threshold as LRCLIB matching). */
  function _formatLyricDeltaSec(sec) {
    return QG.core.format.formatLyricDeltaSec(sec);
  }

  async function _resetTrackStatusCards() {
    _lyricSearch().close();
    const list = document.getElementById("dl-track-status");
    if (_historyStoreHost) {
      await _historyStoreHost.clearServerAndLocal(list);
    } else if (list) {
      _tsResetListForHydrate(list);
    }
    _queueHost.refreshAlbumQueueCardMetas();
    _tsUpdateErrorHistoryCountBadge();
  }

  function _positionClearHistoryConfirm() {
    const btn = document.getElementById("dl-clear-track-status");
    const pop = document.getElementById("dl-clear-history-confirm");
    if (!btn || !pop || pop.classList.contains("hidden")) return;
    const pad = 8;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const mw = Math.min(280, vw - pad * 2);
    pop.style.top = `${Math.round(r.bottom + 6)}px`;
    let left = r.right - mw;
    left = Math.max(pad, Math.min(left, vw - pad - mw));
    pop.style.left = `${Math.round(left)}px`;
    pop.style.right = "auto";
  }

  function _clearHistoryBackdrop(e) {
    const pop = document.getElementById("dl-clear-history-confirm");
    const btn = document.getElementById("dl-clear-track-status");
    if (!pop || pop.classList.contains("hidden")) return;
    if ((btn && btn.contains(e.target)) || pop.contains(e.target)) return;
    _closeClearHistoryConfirm();
  }

  function _clearHistoryEsc(e) {
    if (e.key === "Escape") _closeClearHistoryConfirm();
  }

  function _closeClearHistoryConfirm() {
    const pop = document.getElementById("dl-clear-history-confirm");
    const btn = document.getElementById("dl-clear-track-status");
    if (!pop || pop.classList.contains("hidden")) return;
    pop.classList.add("hidden");
    document.removeEventListener("mousedown", _clearHistoryBackdrop);
    window.removeEventListener("resize", _positionClearHistoryConfirm);
    document.removeEventListener("keydown", _clearHistoryEsc);
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.focus();
    }
  }

  function _openClearHistoryConfirm() {
    const pop = document.getElementById("dl-clear-history-confirm");
    const btn = document.getElementById("dl-clear-track-status");
    if (!pop || !btn) return;
    pop.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
    _positionClearHistoryConfirm();
    requestAnimationFrame(() => {
      document.getElementById("dl-clear-history-cancel")?.focus();
    });
    setTimeout(() => {
      document.addEventListener("mousedown", _clearHistoryBackdrop);
      window.addEventListener("resize", _positionClearHistoryConfirm);
      document.addEventListener("keydown", _clearHistoryEsc);
    }, 0);
  }

  // ── Status polling ────────────────────────────────────────
  function updateStatus(ready) {
    const dot = document.getElementById("status-dot");
    const label = document.getElementById("status-label");
    if (ready) {
      dot.className = "status-dot connected";
      label.textContent = "Connected";
    } else {
      dot.className = "status-dot disconnected";
      label.textContent = "Disconnected";
    }
  }

  async function checkStatus() {
    try {
      const { data } = api
        ? await api.getJson("/api/status")
        : await (async () => {
            const res = await api.statusApi.fetchRaw();
            return { data: await res.json() };
          })();
      updateStatus(data.ready);
      return data;
    } catch (e) {
      updateStatus(false);
      return null;
    }
  }

  // ── Setup overlay ─────────────────────────────────────────
  function showSetup() {
    document.getElementById("setup-overlay").classList.remove("hidden");
    document.getElementById("app").classList.add("hidden");
  }

  function showApp() {
    document.getElementById("setup-overlay").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    startSSE();
  }

  // ── Browse folder ─────────────────────────────────────────
  function initBrowseButtons() {
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

  // ── Auth method tabs ──────────────────────────────────────
  function initAuthTabs() {
    document.querySelectorAll(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document
          .querySelectorAll(".auth-tab")
          .forEach((t) => t.classList.remove("active"));
        document
          .querySelectorAll(".auth-panel")
          .forEach((p) => p.classList.add("hidden"));
        tab.classList.add("active");
        document
          .getElementById("auth-panel-" + tab.dataset.auth)
          .classList.remove("hidden");
      });
    });
  }

  function initSetup() {
    // ── OAuth button ────────────────────────────────────────
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
        // Poll status until connected
        _oauthPolling = setInterval(async () => {
          const s = await checkStatus();
          if (s && s.ready) {
            clearInterval(_oauthPolling);
            oauthBtn.disabled = false;
            oauthBtnText.textContent = "Login with Qobuz";
            oauthSpinner.classList.add("hidden");
            showApp();
            await QG.features.settings.settingsForm.loadIntoForm();
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

    // ── Token button ────────────────────────────────────────
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
          updateStatus(true);
          await QG.features.settings.settingsForm.loadIntoForm();
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

    // ── Email/Password button (legacy) ───────────────────────
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
          updateStatus(true);
          await QG.features.settings.settingsForm.loadIntoForm();
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

  // ── Cover art mutual exclusivity ──────────────────────────
  // "Skip Cover Art" is incompatible with "Write Art to Tracks" and
      // "Full-Res Cover" | wire them up for whichever prefix is passed ('dl'/'cfg').
  function initCoverArtMutex(prefix) {
    const embedArt = document.getElementById(`${prefix}-embed-art`);
    const ogCover = document.getElementById(`${prefix}-og-cover`);
    const noCover = document.getElementById(`${prefix}-no-cover`);
    if (!embedArt || !ogCover || !noCover) return;

    // Enabling "Skip Cover Art" turns the other two off
    noCover.addEventListener("change", () => {
      if (noCover.checked) {
        embedArt.checked = false;
        ogCover.checked = false;
      }
    });

    // Enabling either art option turns off "Skip Cover Art"
    embedArt.addEventListener("change", () => {
      if (embedArt.checked) noCover.checked = false;
    });
    ogCover.addEventListener("change", () => {
      if (ogCover.checked) noCover.checked = false;
    });
  }

  // ── Download tab ──────────────────────────────────────────

  function initDownload() {
    _queueHost = QG.features.queue.internals.bootstrap({
      getTrackStatusMap: _getHistoryDbMap,
      guiPendingAudioPrefix: _GUI_PENDING_AUDIO_PREFIX,
      syncSearchQueuedHighlights: _syncSearchQueuedHighlights,
    });
    if (
      QG.features.history &&
      QG.features.history.internals &&
      typeof QG.features.history.internals.bootstrapVirtualization ===
        "function"
    ) {
      _historyVirtHost =
        QG.features.history.internals.bootstrapVirtualization({
          getOrder: () => _tsOrder,
          getKeyToIndex: () => _tsKeyToIndex,
          getCardMap: () => _trackStatusMap,
          getDbItemByKey: _getHistoryDbMap,
          getActiveDlKeys: () => _tsActiveDlKeys,
          mountDbItemAtIndex: _tsMountDbItemAtIndex,
        });
    }
    if (
      QG.features.history &&
      QG.features.history.internals &&
      typeof QG.features.history.internals.bootstrapFilters === "function"
    ) {
      _historyFilterHost = QG.features.history.internals.bootstrapFilters({
        guiPendingAudioPrefix: _GUI_PENDING_AUDIO_PREFIX,
        getActiveDlKeys: () => _tsActiveDlKeys,
        getCardMap: () => _trackStatusMap,
        getDbItemByKey: _getHistoryDbMap,
        getOrderAll: () => _tsOrderAll,
        getOrder: () => _tsOrder,
        setOrder: (order) => {
          _tsOrder = order;
        },
        getSkipHistoryFilterApply: () => _tsSkipHistoryFilterApply,
        isVirtActive: () =>
          _historyVirtHost ? _historyVirtHost.isVirtActive() : false,
        getVirtInnerEl: () =>
          _historyVirtHost ? _historyVirtHost.getVirtInnerEl() : null,
        rebuildKeyIndex: _tsRebuildKeyIndex,
        updateVirtInnerHeight: () => {
          if (_historyVirtHost) _historyVirtHost.updateVirtInnerHeight();
        },
        virtMeasureRowH: () => {
          if (_historyVirtHost) _historyVirtHost.measureRowH();
        },
        virtOnScroll: () => {
          if (_historyVirtHost) _historyVirtHost.onScroll();
        },
        runVirtRenderPass: () => {
          if (_historyVirtHost) _historyVirtHost.runVirtRenderPass();
        },
      });
    }
    if (
      QG.features.replacements &&
      QG.features.replacements.internals &&
      typeof QG.features.replacements.internals.bootstrapAttachTrackPopover ===
        "function"
    ) {
      _replacementAttachHost =
        QG.features.replacements.internals.bootstrapAttachTrackPopover({
          closeLyricSearchModal: () => _lyricSearch().close(),
          setLyricSearchAnchorCard:
            QG.features.lyrics.internals.setLyricSearchAnchorCard,
          clearLyricSearchAnchorHighlight:
            QG.features.lyrics.internals.clearLyricSearchAnchorHighlight,
          lyricSearchTitleFromDisplay:
            QG.features.lyrics.internals.lyricSearchTitleFromDisplay,
          showLyricSearchResultsLoading:
            QG.features.lyrics.internals.showLyricSearchResultsLoading,
          positionPopoverAboveDownloadHistory:
            QG.ui.popoverPositioning.positionAboveDownloadHistory,
          formatLyricDeltaSec: _formatLyricDeltaSec,
          formatAttachDur: QG.core.format.formatAttachDur,
          explicitBadgeSvg: _EXPLICIT_BADGE_SVG,
          getQueueUrlForPurchaseSlot: (sid) =>
            typeof window._qUrlForPurchaseSlot === "function"
              ? window._qUrlForPurchaseSlot(sid) || ""
              : "",
        });
    }
    if (
      QG.features.replacements &&
      QG.features.replacements.internals &&
      typeof QG.features.replacements.internals.bootstrapResolutionButtons ===
        "function"
    ) {
      _replacementResolutionHost =
        QG.features.replacements.internals.bootstrapResolutionButtons({
          missingPlaceholderBtnTip: _MISSING_PLACEHOLDER_BTN_TIP,
        });
    }
    if (
      QG.features.replacements &&
      QG.features.replacements.internals &&
      typeof QG.features.replacements.internals.bootstrapMissingPlaceholder ===
        "function" &&
      _replacementAttachHost &&
      _replacementResolutionHost
    ) {
      _replacementPlaceholderHost =
        QG.features.replacements.internals.bootstrapMissingPlaceholder({
          getAttachAnchorCard: () => _replacementAttachHost.getAnchorCard(),
          getAttachStatusElementForCard: (card) =>
            _replacementAttachHost.getStatusElementForCard(card),
          syncResolutionButtonStates: (card) =>
            _replacementResolutionHost.syncResolutionButtonStates(card),
          getQueueUrlForPurchaseSlot: (sid) =>
            typeof window._qUrlForPurchaseSlot === "function"
              ? window._qUrlForPurchaseSlot(sid) || ""
              : "",
        });
    }
    if (
      QG.features.history &&
      QG.features.history.internals &&
      typeof QG.features.history.internals.bootstrapCardRendering === "function"
    ) {
      _historyCardHost = QG.features.history.internals.bootstrapCardRendering({
        getCardMap: () => _trackStatusMap,
        appendTsOrderKey: (key) => {
          if (!_tsOrderAll.includes(key)) _tsOrderAll.push(key);
        },
        getSkipHistoryFilterApply: () => _tsSkipHistoryFilterApply,
        applyHistoryFilter: _tsApplyHistoryFilter,
        isVirtActive: () =>
          _historyVirtHost ? _historyVirtHost.isVirtActive() : false,
        getVirtInnerEl: () =>
          _historyVirtHost ? _historyVirtHost.getVirtInnerEl() : null,
        getKeyToIndex: () => _tsKeyToIndex,
        appendParent: (list) =>
          _historyVirtHost
            ? _historyVirtHost.appendParent(list)
            : list,
        positionVirtCard: (card, index) => {
          if (_historyVirtHost) _historyVirtHost.positionVirtCard(card, index);
        },
        updateVirtInnerHeight: () => {
          if (_historyVirtHost) _historyVirtHost.updateVirtInnerHeight();
        },
        virtMeasureRowH: () => {
          if (_historyVirtHost) _historyVirtHost.measureRowH();
        },
        virtOnScroll: () => {
          if (_historyVirtHost) _historyVirtHost.onScroll();
        },
        scrollContainerAtBottom: _scrollContainerAtBottom,
        writeAttachMissingPlaceholder: (card, btn) => {
          if (_replacementPlaceholderHost) {
            void _replacementPlaceholderHost.writeMissingPlaceholder(card, btn);
          }
        },
        openAttachTrackPopover: (card) => {
          if (_replacementAttachHost) _replacementAttachHost.open(card);
        },
        syncResolutionButtonStates: (card) => {
          if (_replacementResolutionHost) {
            _replacementResolutionHost.syncResolutionButtonStates(card);
          }
        },
      });
    }
    if (
      QG.features.history &&
      QG.features.history.internals &&
      typeof QG.features.history.internals.bootstrapHydratePersist ===
        "function"
    ) {
      _historyStoreHost =
        QG.features.history.internals.bootstrapHydratePersist({
          guiPendingAudioPrefix: _GUI_PENDING_AUDIO_PREFIX,
          virtThreshold: _TS_VIRT_THRESHOLD,
          ensureTrackStatusCard: _ensureTrackStatusCard,
          setTrackDownloadChip: _setTrackDownloadChip,
          setTrackLyricsChip: _setTrackLyricsChip,
          setTrackContentRatingBadge: _setTrackContentRatingBadge,
          normalizeLyricDestination: _normalizeLyricDestination,
          applyHistoryFilter: _tsApplyHistoryFilter,
          getSkipHistoryFilterApply: () => _tsSkipHistoryFilterApply,
          setSkipHistoryFilterApply: (v) => {
            _tsSkipHistoryFilterApply = v;
          },
          resetListForHydrate: _tsResetListForHydrate,
          pushOrderAllKey: (key) => {
            if (!_tsOrderAll.includes(key)) _tsOrderAll.push(key);
          },
          scrollContainerAtBottom: _scrollContainerAtBottom,
          activateVirtForList: (list) => {
            if (_historyVirtHost) _historyVirtHost.activateForList(list);
          },
          runVirtInitialRenderPass: (list, stick) => {
            if (_historyVirtHost) {
              _historyVirtHost.runInitialRenderPass(list, stick);
            }
          },
        });
    }
    _queueHost.initUrlQueue();
    initCoverArtMutex("dl");

    QG.features.settings.downloadOptionsAutosave.bind();

    window._updateQueueBadge = function () {
      const badge = document.getElementById("dl-btn-badge");
      if (!badge) return;
      let total = 0;
      let hasUnknown = false;
      let hasArtist = false;
      
      if (_queueHost.textMode) {
        const val = document.getElementById("dl-urls").value || "";
        const lines = val.split(/[\n\r]+/).filter((l) => l.trim());
        total = lines.length;
        hasArtist = lines.some(l => l.includes("artist"));
      } else {
        _queueHost.urlQueue.forEach((qi) => {
          if (!qi.resolved) {
            if (qi.url && qi.url.includes("artist")) hasArtist = true;
            total += 1;
            return;
          }
          const r = qi.resolved;
          if (r.type === "artist") {
            hasArtist = true;
            if (r.raw_tracks === undefined && r.albums) hasUnknown = true;
          }
          total += _queueHost.remainingTracksContributionFromQueueItem(qi);
        });
      }
      
      if (total === 0 && !hasUnknown) {
        badge.classList.add("hidden");
        badge.textContent = "";
        badge.removeAttribute("aria-label");
      } else {
        badge.classList.remove("hidden");
        badge.textContent = hasUnknown ? `${total}+` : String(total);
        badge.setAttribute(
          "aria-label",
          `${badge.textContent} tracks to download (${hasUnknown ? "estimate" : "queue"})`,
        );
      }
      
      const artistGroup = document.getElementById("dl-artist-section");
      if (artistGroup) {
        if (!hasArtist) {
          artistGroup.classList.add("hidden");
        } else {
          artistGroup.classList.remove("hidden");
        }
      }
    };

    // URL-level counters (for card state management)
    let _dlTotal = 0;
    let _dlDone = 0;

    // Track-level counters (drive the progress bar)
    let _dlTrackTotal = 0;
    let _dlTrackDone = 0;
    let _dlTotalLocked = false;
    let _dlTrackFinished = new Set();
    /** Queue URL → track keys still counted as purchase-only on the album badge. */
    let _purchaseOnlyKeysByUrl = new Map();

    window._qUrlForPurchaseSlot = (slotId) => {
      const sid = String(slotId || "").trim();
      if (!sid) return "";
      const pk = `sid:${sid}`;
      for (const [url, set] of _purchaseOnlyKeysByUrl.entries()) {
        if (set.has(pk)) return url;
      }
      return "";
    };

    const DL_TIP_PURCHASE_QUEUE =
      "Open album on Qobuz to purchase (full album required for these tracks)";
    const DL_TIP_NOT_STREAMABLE =
      "This release is not available for streaming on Qobuz. It may only be sold as a full album (purchase-only or region-restricted), open it on Qobuz to check.";
    const DL_TIP_QUEUE_URL_ERROR_GENERIC =
      "This queue item did not finish successfully. Check the activity log for details — causes include network errors, quality restrictions, or tracks that could not be downloaded.";

    function _findCardByUrl(url) {
      const cards = document.querySelectorAll("#dl-queue .queue-card");
      for (const c of cards) if (c.dataset.url === url) return c;
      return null;
    }

    function _syncQueueCardPurchaseIssues(qurl) {
      const q = String(qurl || "").trim();
      if (!q) return;
      const card = _findCardByUrl(q);
      if (!card) return;
      const info = card.querySelector(".queue-card-info");
      if (!info) return;
      const set = _purchaseOnlyKeysByUrl.get(q);
      const purchaseBadge = info.querySelector(".dl-error-badge.dl-purchase-badge");
      const failedBadge = info.querySelector(".dl-error-badge.dl-url-failed-badge");
      const qiHold = _queueHost.urlQueue.find((x) => x.url === q);
      const stayAlbum =
        qiHold != null && _queueHost.albumQueueItemNeedsToStayVisible(qiHold);

      if (!set || set.size === 0) {
        _purchaseOnlyKeysByUrl.delete(q);
        if (purchaseBadge) purchaseBadge.remove();
        if (!failedBadge && !stayAlbum) {
          card.classList.remove("dl-error");
        }
        const stillActive =
          card.classList.contains("dl-active") ||
          card.classList.contains("dl-pending");
        if (!stillActive && !failedBadge) {
          if (stayAlbum) {
            card.classList.add("dl-error");
            _queueHost.refreshAlbumQueueCardMetas();
            return;
          }
          card.classList.add("dl-done");
          setTimeout(() => _queueHost.removeFromQueue(q, card), 1400);
        }
        return;
      }

      let badge = purchaseBadge;
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "dl-error-badge dl-purchase-badge";
        badge.setAttribute("data-tip", DL_TIP_PURCHASE_QUEUE);
        badge.setAttribute("aria-label", DL_TIP_PURCHASE_QUEUE);
        badge.removeAttribute("title");
        info.appendChild(badge);
      }
      badge.textContent = `${set.size} ⚠ Purchase only`;
      badge.setAttribute("data-tip", DL_TIP_PURCHASE_QUEUE);
      badge.setAttribute("aria-label", DL_TIP_PURCHASE_QUEUE);
      badge.removeAttribute("title");
    }

    function _purchaseIssueSlotKey(ev, resAlb) {
      const sid = String(ev.slot_track_id || "").trim();
      if (sid) return `sid:${sid}`;
      return _trackKey(ev.track_no, ev.title, resAlb);
    }

    function _updateProgress() {
      const fill = document.getElementById("dl-progress-fill");
      const label = document.getElementById("dl-progress-label");
      const cap = Math.max(_dlTrackTotal, _dlTrackDone); // never go backward

      if (fill) {
        const pct = cap > 0 ? Math.round((_dlTrackDone / cap) * 100) : 0;
        fill.style.width = pct + "%";
      }
      if (label) {
        label.textContent = `${_dlTrackDone} / ${cap} tracks`;
        label.title = "";
      }
    }

    function _setDownloadingState(isDownloading) {
      const dlBtn = document.getElementById("dl-btn");
      const progressWrap = document.getElementById("dl-progress-wrap");
      window.isDownloading = isDownloading;

      if (isDownloading) {
        dlBtn.dataset.state = "downloading";
        dlBtn.innerHTML = `
          <span class="dl-btn-body">
            <svg id="dl-btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="currentColor"
                 aria-hidden="true">
              <rect x="4" y="4" width="6" height="16" rx="1.5"/>
              <rect x="14" y="4" width="6" height="16" rx="1.5"/>
            </svg>
            <span id="dl-btn-text">Pause</span>
          </span>`;
        dlBtn.disabled = false;
        progressWrap.classList.remove("hidden");
        _updateProgress();
        // Hide remove buttons while downloading
        document
          .querySelectorAll("#dl-queue .queue-card-remove")
          .forEach((b) => (b.style.display = "none"));
      } else {
        dlBtn.dataset.state = "idle";
        dlBtn.innerHTML = `
          <span class="dl-btn-body">
            <svg id="dl-btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span id="dl-btn-text">Start Download</span>
          </span>
          <span id="dl-btn-badge" class="dl-btn-badge hidden" aria-live="polite"></span>`;
        window._updateQueueBadge();
        dlBtn.disabled = false;
        // Re-enable remove buttons on leftover (error) cards
        document
          .querySelectorAll("#dl-queue .queue-card-remove")
          .forEach((b) => (b.style.display = ""));
        setTimeout(() => progressWrap.classList.add("hidden"), 2000);
      }
    }

    // Called by SSE 'status' events
    window._handleDlStatus = function (ev) {
      if (ev.type === "total_tracks") {
        _dlTrackTotal = ev.count;
        _dlTotalLocked = true;
        _updateProgress();
      } else if (ev.type === "url_start") {
        const card = _findCardByUrl(ev.url);
        if (card) {
          card.classList.remove("dl-pending");
          card.classList.add("dl-active");
        }
      } else if (ev.type === "track_start") {
        let trackNo = "";
        let title = "";
        let coverUrl = "";
        if (ev.track_no != null && String(ev.track_no).trim() !== "") {
          trackNo = String(ev.track_no).trim();
          title = String(ev.title || "").trim();
          coverUrl = String(ev.cover_url || "").trim();
        } else {
          const parsed = _parseTrackRef("", ev.title || "");
          trackNo = parsed.trackNo;
          title = parsed.title;
        }
        const evAlb =
          ev.lyric_album != null && String(ev.lyric_album).trim() !== ""
            ? String(ev.lyric_album).trim()
            : "";
        const _tcard = _hist().ensureTrackCard(
          trackNo,
          title,
          true,
          coverUrl,
          evAlb,
        );
        if (_tcard) {
          if (ev.lyric_artist != null && String(ev.lyric_artist).trim() !== "") {
            _tcard.dataset.lyricArtist = String(ev.lyric_artist).trim();
          }
          if (evAlb) _tcard.dataset.lyricAlbum = evAlb;
          if (ev.duration_sec != null && String(ev.duration_sec).trim() !== "") {
            const ds = parseInt(String(ev.duration_sec), 10);
            if (!Number.isNaN(ds)) _tcard.dataset.durationSec = String(ds);
          }
          if (typeof ev.track_explicit === "boolean") {
            _tcard.dataset.trackExplicit = ev.track_explicit ? "1" : "0";
            _setTrackContentRatingBadge(_tcard, ev.track_explicit);
          }
          if (_tcard.dataset.trackKey) _tsActiveDlKeys.add(_tcard.dataset.trackKey);
          if (_historyStoreHost) {
            _historyStoreHost.storeDbItemFromTrackStart(
              ev,
              evAlb,
              _tcard,
              coverUrl,
            );
          }
          if (!_cardHasResolvedRealAudio(_tcard)) {
            _hist().setDownloadChip(
          trackNo,
          title,
          "downloading",
          "",
          undefined,
          evAlb,
        );
          }
        }
        _updateProgress();
        _hist().applyFilter();
      } else if (ev.type === "track_download_progress") {
        const pa =
          ev.lyric_album != null && String(ev.lyric_album).trim() !== ""
            ? String(ev.lyric_album).trim()
            : "";
        _updateTrackDownloadProgress(
          ev.track_no,
          ev.title,
          ev.received,
          ev.total,
          pa,
        );
      } else if (ev.type === "track_result") {
        const resAlb = _lyricAlbumForTrackEv(ev);
        const qurl = String(ev.source_url || "").trim();
        const slotProgKey = _trackKey(ev.track_no, ev.title, resAlb);
        if (!_dlTrackFinished.has(slotProgKey)) {
          _dlTrackFinished.add(slotProgKey);
          _dlTrackDone++;
          if (!_dlTotalLocked && _dlTrackDone > _dlTrackTotal) {
            _dlTrackTotal = _dlTrackDone + 1;
          }
        }
        const st = String(ev.status || "").toLowerCase();
        const isFailed = st === "failed";
        const isPurchase = st === "purchase_only";
        const detail = String(ev.detail || "").trim();
        const ap = String(ev.audio_path || "").trim();
        const sidTrim = String(ev.slot_track_id || "").trim();
        const ridTrim = String(ev.release_album_id || "").trim();
        const preCard = _hist().ensureTrackCard(
          ev.track_no,
          ev.title,
          false,
          undefined,
          resAlb,
        );
        if (preCard && qurl) {
          preCard.dataset.queueSourceUrl = qurl;
        }
        if (preCard && sidTrim) {
          preCard.dataset.slotTrackId = sidTrim;
        }
        if (preCard && ridTrim) {
          preCard.dataset.releaseAlbumId = ridTrim;
        }
        const skipTerminalDowngrade =
          preCard &&
          (isPurchase || isFailed) &&
          _cardHasResolvedRealAudio(preCard);
        if (
          preCard &&
          sidTrim &&
          ridTrim &&
          (isPurchase || isFailed) &&
          !skipTerminalDowngrade
        ) {
          preCard.dataset.attachSearchEligible = "1";
        }
        if (preCard && ap && !skipTerminalDowngrade) {
          preCard.dataset.audioPath = ap;
          _tsRegisterAudioPathAlbum(ap, resAlb);
        }
        if (isPurchase && detail && !skipTerminalDowngrade) {
          _hist().setDownloadChip(
            ev.track_no,
            ev.title,
            "Album Purchase Only",
            "failed",
            {
              href: detail,
              titleAttr: DL_TIP_PURCHASE_QUEUE,
              slotTrackId: sidTrim,
              releaseAlbumId: ridTrim,
            },
            resAlb,
          );
        } else if (!skipTerminalDowngrade) {
          _hist().setDownloadChip(
            ev.track_no,
            ev.title,
            isFailed ? "failed" : "downloaded",
            isFailed ? "failed" : "done",
            undefined,
            resAlb,
          );
        } else {
          _hist().setDownloadChip(
            ev.track_no,
            ev.title,
            "downloaded",
            "done",
            undefined,
            resAlb,
          );
          if (preCard.dataset.resolvedBy === "search") {
            preCard.dataset.attachSearchEligible = "1";
          } else if (preCard.dataset.resolvedBy === "placeholder") {
            preCard.dataset.attachSearchEligible = "1";
          }
          if (_replacementResolutionHost) {
            _replacementResolutionHost.syncResolutionButtonStates(preCard);
          }
        }
        if (st === "downloaded" && preCard) {
          if (ev.substitute_attach === true) {
            preCard.dataset.attachSearchEligible = "1";
            // Mark resolved-by-search and delete any prior .missing.txt.
            const prevPlaceholderPath = (preCard.dataset.missingPlaceholderPath || "").trim();
            if (prevPlaceholderPath) {
              api.replacementApi.deleteResolutionFile({ file_path: prevPlaceholderPath }).catch(() => {});
              delete preCard.dataset.missingPlaceholderPath;
            }
            preCard.dataset.resolvedBy = "search";
            if (_replacementResolutionHost) {
              _replacementResolutionHost.syncResolutionButtonStates(preCard);
            }
          } else if (ap.toLowerCase().endsWith(".missing.txt")) {
            preCard.dataset.attachSearchEligible = "1";
            preCard.dataset.resolvedBy = "placeholder";
            if (_replacementResolutionHost) {
              _replacementResolutionHost.syncResolutionButtonStates(preCard);
            }
          } else {
            const rb = (preCard.dataset.resolvedBy || "").trim();
            if (rb === "search" || rb === "placeholder") {
              preCard.dataset.attachSearchEligible = "1";
              if (_replacementResolutionHost) {
                _replacementResolutionHost.syncResolutionButtonStates(preCard);
              }
          } else {
            delete preCard.dataset.attachSearchEligible;
            }
          }
        }
        if (st === "downloaded" && ap) {
          if (_historyStoreHost) {
            _historyStoreHost.persistDownloadHistoryAfterResult(ev, resAlb);
          }
        } else if (
          preCard &&
          sidTrim &&
          ridTrim &&
          ((isPurchase && detail) || isFailed) &&
          !skipTerminalDowngrade
        ) {
          if (_historyStoreHost) {
            _historyStoreHost.persistPendingSlotDownloadHistory(
              ev,
              preCard,
              resAlb,
            );
          }
        }
        if (preCard) {
          if (_historyStoreHost) {
            _historyStoreHost.storeDbItemFromTrackResult(ev, resAlb, preCard);
          }
          if (preCard.dataset.trackKey) {
            _tsActiveDlKeys.delete(preCard.dataset.trackKey);
          }
          if (_historyVirtHost) _historyVirtHost.onScroll();
        }
        const pk = _purchaseIssueSlotKey(ev, resAlb);
        if (isPurchase && qurl) {
          let pset = _purchaseOnlyKeysByUrl.get(qurl);
          if (!pset) {
            pset = new Set();
            _purchaseOnlyKeysByUrl.set(qurl, pset);
          }
          pset.add(pk);
          const qcard = _findCardByUrl(qurl);
          if (qcard) {
            qcard.classList.remove("dl-active", "dl-pending", "dl-done");
            qcard.classList.add("dl-error");
            _syncQueueCardPurchaseIssues(qurl);
          }
        } else if (st === "downloaded" && qurl) {
          const pset = _purchaseOnlyKeysByUrl.get(qurl);
          if (pset && pset.delete(pk) && pset.size === 0) {
            _purchaseOnlyKeysByUrl.delete(qurl);
          }
          _syncQueueCardPurchaseIssues(qurl);
        }
        _updateProgress();
        _hist().applyFilter();
        _queueHost.refreshAlbumQueueCardMetas();
      } else if (ev.type === "track_lyrics") {
        let albLy = "";
        const apEv = String(ev.audio_path || "").trim();
        if (_historyStoreHost) {
          albLy = _historyStoreHost.lyricAlbumForAudioPath(apEv);
        }
        if (!albLy && apEv) {
          const cards = document.querySelectorAll(
            "#dl-track-status .track-status-card",
          );
          for (let i = 0; i < cards.length; i++) {
            if ((cards[i].dataset.audioPath || "").trim() === apEv) {
              albLy = (cards[i].dataset.lyricAlbum || "").trim();
              break;
            }
          }
        }
        if (!albLy) albLy = _lyricAlbumForTrackEv(ev);
        _hist().setLyricsChip(
          ev.track_no,
          ev.title,
          ev.lyric_type || "none",
          ev.confidence,
          albLy,
          ev.provider,
          ev.lyric_destination || "",
        );
        const lk = _trackKey(
          _normalizeTrackNo(ev.track_no),
          _normalizeTrackTitle(ev.title || ""),
          albLy,
        );
        if (
          _historyStoreHost &&
          _historyStoreHost.updateLyricSnapForKey(lk, ev)
        ) {
          _hist().applyFilter();
        }
      } else if (ev.type === "url_done") {
        _dlDone++;
        // Sync track total upward if real count exceeded estimate
        if (_dlTrackDone > _dlTrackTotal) _dlTrackTotal = _dlTrackDone;
        _updateProgress();
        const card = _findCardByUrl(ev.url);
        if (card) {
          card.classList.remove("dl-active", "dl-pending");
          const qi = _queueHost.urlQueue.find((x) => x.url === ev.url);
          const stayAlbum =
            qi != null && _queueHost.albumQueueItemNeedsToStayVisible(qi);
          if (
            card.querySelector(".dl-purchase-badge") ||
            stayAlbum
          ) {
            card.classList.add("dl-error");
          } else {
            card.classList.add("dl-done");
            setTimeout(() => _queueHost.removeFromQueue(ev.url, card), 1400);
          }
        }
      } else if (ev.type === "url_error") {
        _dlDone++;
        _updateProgress();
        const card = _findCardByUrl(ev.url);
        if (card) {
          card.classList.remove("dl-active", "dl-pending");
          card.classList.add("dl-error");
          const info = card.querySelector(".queue-card-info");
          if (info) {
            let badge = info.querySelector(".dl-error-badge.dl-url-failed-badge");
            if (!badge) {
              badge = document.createElement("span");
              badge.className = "dl-error-badge dl-url-failed-badge";
              info.appendChild(badge);
            }
            const detail = String(ev.detail || "").trim();
            const isNonStream = detail === "non_streamable";
            const tip = isNonStream
              ? DL_TIP_NOT_STREAMABLE
              : DL_TIP_QUEUE_URL_ERROR_GENERIC;
            badge.textContent = isNonStream
              ? "⚠ Not streamable"
              : "⚠ Download issue";
            badge.setAttribute("data-tip", tip);
            badge.setAttribute("aria-label", tip);
            badge.removeAttribute("title");
          }
        }
      } else if (ev.type === "dl_complete") {
        // Snap progress to 100% and show final count
        _dlTrackTotal = Math.max(_dlTrackTotal, _dlTrackDone);
        const fill = document.getElementById("dl-progress-fill");
        const holdProg = Boolean(ev.cancelled || ev.paused);
        if (fill) {
          fill.style.width = holdProg ? fill.style.width : "100%";
        }
        const label = document.getElementById("dl-progress-label");
        if (label) {
          label.textContent = `${_dlTrackDone} track${_dlTrackDone !== 1 ? "s" : ""}`;
          label.title = "";
        }
        // Reset cards still marked as active once the graceful stop settles
        if (ev.cancelled || ev.paused) {
          document
            .querySelectorAll(
              "#dl-queue .queue-card.dl-active, #dl-queue .queue-card.dl-pending",
            )
            .forEach((c) => c.classList.remove("dl-active", "dl-pending"));
        }
        // Clear the pausing-state inline styles before restoring button
        const dlBtn = document.getElementById("dl-btn");
        dlBtn.style.opacity = "";
        dlBtn.style.cursor = "";
        dlBtn.style.pointerEvents = "";
        _setDownloadingState(false);
        _queueHost.refreshAlbumQueueCardMetas();
      }
    };

    document.getElementById("dl-btn").addEventListener("click", async () => {
      const dlBtn = document.getElementById("dl-btn");

      // Pause if already running (graceful stop; same as /api/pause)
      if (dlBtn.dataset.state === "downloading") {
        dlBtn.dataset.state = "pausing";
        const te = document.getElementById("dl-btn-text");
        if (te) te.textContent = "Pausing…";
        dlBtn.disabled = false;
        dlBtn.style.opacity = "0.6";
        dlBtn.style.cursor = "default";
        dlBtn.style.pointerEvents = "none";
        try {
          await api.downloadApi.pause();
        } catch (_) {
          dlBtn.dataset.state = "downloading";
          dlBtn.style.opacity = "";
          dlBtn.style.cursor = "";
          dlBtn.style.pointerEvents = "";
          _setDownloadingState(true);
        }
        return;
      }
      if (dlBtn.dataset.state === "pausing") return;

      // Collect URLs
      let urls;
      if (_queueHost.textMode) {
        urls = document.getElementById("dl-urls").value.trim();
      } else {
        urls = _queueHost.urlQueue.map((q) => q.url).join("\n");
      }
      if (!urls) {
        return;
      }

      const payload = {
        urls,
        quality: document.getElementById("dl-quality").value || null,
        directory: document.getElementById("dl-directory").value.trim() || null,
        embed_art: document.getElementById("dl-embed-art").checked,
        lyrics_enabled: document.getElementById("dl-lyrics-enabled").checked,
        lyrics_embed_metadata: document.getElementById("dl-lyrics-embed-metadata")
          .checked,
        og_cover: document.getElementById("dl-og-cover").checked,
        no_cover: document.getElementById("dl-no-cover").checked,
        albums_only: document.getElementById("dl-albums-only").checked,
        no_m3u: document.getElementById("dl-no-m3u").checked,
        no_fallback: document.getElementById("dl-no-fallback").checked,
        no_db: document.getElementById("dl-no-db").checked,
        smart_discography: document.getElementById("dl-smart-discography")
          .checked,
        fix_md5s: document.getElementById("dl-fix-md5s").checked,
        no_credits: !document.getElementById("dl-digital-booklet").checked,
        native_lang: document.getElementById("dl-native-lang").checked,
        segmented_fallback: document.getElementById("dl-segmented-fallback")
          .checked,
        multiple_disc_prefix:
          document.getElementById("dl-multiple-disc-prefix").value.trim() ||
          null,
        multiple_disc_one_dir: !document.getElementById("dl-multiple-disc-one-dir")
          .checked,
        multiple_disc_track_format:
          document
            .getElementById("dl-multiple-disc-track-format")
            .value.trim() || null,
        max_workers:
          parseInt(document.getElementById("dl-max-workers").value, 10) || 1,
        delay_seconds:
          parseInt(document.getElementById("dl-delay-seconds").value, 10) || 0,
        folder_format:
          document.getElementById("dl-folder-format").value.trim() || null,
        track_format:
          document.getElementById("dl-track-format").value.trim() || null,
        no_album_artist_tag:
          document.getElementById("dl-tag-album-artist").checked === false,
        no_album_title_tag:
          document.getElementById("dl-tag-album-title").checked === false,
        no_track_artist_tag:
          document.getElementById("dl-tag-track-artist").checked === false,
        no_track_title_tag:
          document.getElementById("dl-tag-track-title").checked === false,
        no_release_date_tag:
          document.getElementById("dl-tag-release-date").checked === false,
        no_media_type_tag:
          document.getElementById("dl-tag-media-type").checked === false,
        no_genre_tag: document.getElementById("dl-tag-genre").checked === false,
        no_track_number_tag:
          document.getElementById("dl-tag-track-number").checked === false,
        no_track_total_tag:
          document.getElementById("dl-tag-track-total").checked === false,
        no_disc_number_tag:
          document.getElementById("dl-tag-disc-number").checked === false,
        no_disc_total_tag:
          document.getElementById("dl-tag-disc-total").checked === false,
        no_composer_tag:
          document.getElementById("dl-tag-composer").checked === false,
        no_explicit_tag:
          document.getElementById("dl-tag-explicit").checked === false,
        no_copyright_tag:
          document.getElementById("dl-tag-copyright").checked === false,
        no_label_tag: document.getElementById("dl-tag-label").checked === false,
        no_upc_tag: document.getElementById("dl-tag-upc").checked === false,
        no_isrc_tag: document.getElementById("dl-tag-isrc").checked === false,
        tag_title_from_track_format: document.getElementById(
          "dl-meta-title-from-track-format",
        ).checked,
        tag_album_from_folder_format: document.getElementById(
          "dl-meta-album-from-folder-format",
        ).checked,
      };

      try {
        const res = await api.downloadApi.start(payload);
        const data = await res.json();
        if (data.ok) {
          // Mark all visible queue cards as pending (keep them in the list)
          _dlTotal = data.queued;
          _dlDone = 0;
          _dlTrackTotal = _queueHost.textMode ? data.queued : _queueHost.calcProgressDenominatorFromQueue();
          _dlTrackDone = 0;
          _dlTotalLocked = false;
          _dlTrackFinished = new Set();
          _purchaseOnlyKeysByUrl = new Map();
          document.querySelectorAll("#dl-queue .queue-card").forEach((c) => {
            c.classList.add("dl-pending");
          });
          _setDownloadingState(true);
        }
      } catch (_) {
        /* ignore */
      }
    });

    const clearTrackStatusBtn = document.getElementById("dl-clear-track-status");
    const clearHistoryConfirm = document.getElementById("dl-clear-history-confirm");
    const clearHistoryCancel = document.getElementById("dl-clear-history-cancel");
    const clearHistoryDo = document.getElementById("dl-clear-history-confirm-do");
    if (clearTrackStatusBtn && clearHistoryConfirm) {
      clearTrackStatusBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!clearHistoryConfirm.classList.contains("hidden")) {
          _closeClearHistoryConfirm();
          return;
        }
        _openClearHistoryConfirm();
      });
    }
    clearHistoryCancel?.addEventListener("click", () => {
      _closeClearHistoryConfirm();
    });
    clearHistoryDo?.addEventListener("click", async () => {
      _closeClearHistoryConfirm();
      await _resetTrackStatusCards();
    });
    _lyricSearch().init({
      closeAttachPopover: () => {
        if (
          QG.features.replacements &&
          typeof QG.features.replacements.closeAttachPopover === "function"
        ) {
          QG.features.replacements.closeAttachPopover();
        }
      },
      setLyricsChip: (...args) => _hist().setLyricsChip(...args),
      lyricDestinationFromOutputs: _lyricDestinationFromOutputs,
    });
    if (_replacementAttachHost) _replacementAttachHost.init();
    _initDownloadHistorySegment();

    window.QobuzGui.features = window.QobuzGui.features || {};
    if (
      QG.features &&
      QG.features.history &&
      typeof QG.features.history.install === "function"
    ) {
      QG.features.history.install({
        countDownloadedForRelease: (rid) =>
          _historyStoreHost
            ? _historyStoreHost.countDownloadedForRelease(rid)
            : 0,
        applyFilter: _tsApplyHistoryFilter,
        ensureTrackCard: _ensureTrackStatusCard,
        setDownloadChip: _setTrackDownloadChip,
        setLyricsChip: _setTrackLyricsChip,
      });
    }

    if (
      QG.features &&
      QG.features.replacements &&
      typeof QG.features.replacements.install === "function"
    ) {
      QG.features.replacements.install({
        openAttachPopover: (card) => {
          if (_replacementAttachHost) _replacementAttachHost.open(card);
        },
        closeAttachPopover: () => {
          if (_replacementAttachHost) _replacementAttachHost.close();
        },
        writeMissingPlaceholder: (card, btn) => {
          if (_replacementPlaceholderHost) {
            void _replacementPlaceholderHost.writeMissingPlaceholder(
              card,
              btn,
            );
          }
        },
        syncResolutionButtonStates: (card) => {
          if (_replacementResolutionHost) {
            _replacementResolutionHost.syncResolutionButtonStates(card);
          }
        },
      });
    }

    void (async () => {
      await _queueHost.restoreFromServer();
      if (_historyStoreHost) {
        await _historyStoreHost.hydrateFromDb();
      }
      _queueHost.refreshAlbumQueueCardMetas();
    })();
    window.QobuzGui.features.queue.install({
      addUrl(url) {
        return _queueHost.addUrlToQueue(url);
      },
      removeUrl(url) {
        return _queueHost.removeFromQueueByUrl(url);
      },
      hasUrl(url) {
        return _queueHost.urlQueue.some((q) => q.url === url);
      },
      getQueuedUrlSet() {
        return _queueHost.queuedUrlSetForSearchHighlight();
      },
      handleDrop: window._handleDrop,
      handleDropText: window._handleDropText,
      updateBadge: window._updateQueueBadge,
    });
    if (
      QG.features &&
      QG.features.download &&
      typeof QG.features.download.install === "function"
    ) {
      QG.features.download.install({
        init(_deps) {
          /* noop for D1A; real bindings come in D1E */
        },
        startSSE,
        handleStatusEvent(ev) {
          if (typeof window._handleDlStatus === "function") {
            window._handleDlStatus(ev);
          }
        },
        startFromCurrentQueue() {
          /* dl-btn start path — stays inline until D1E */
        },
        pause() {
          const dlApi = api && api.downloadApi;
          if (dlApi && typeof dlApi.pause === "function") {
            return dlApi.pause();
          }
          return Promise.resolve(null);
        },
        isDownloading() {
          return !!window.isDownloading;
        },
        qUrlForPurchaseSlot(slotId) {
          return typeof window._qUrlForPurchaseSlot === "function"
            ? window._qUrlForPurchaseSlot(slotId) || ""
            : "";
        },
      });
    }
  }

  // ── Settings tab ──────────────────────────────────────────

  function initSettings() {
    const feedback = document.getElementById("settings-popover-feedback");
    QG.features.feedback.issueReport.init(checkStatus);

    // ── Re-auth (OAuth) ───────────────────────────────────────
    const reauthBtn = document.getElementById("settings-reauth-btn");
    const reauthText = document.getElementById("settings-reauth-text");
    const reauthSpinner = document.getElementById("settings-reauth-spinner");
    let _reauthPolling = null;

    reauthBtn.addEventListener("click", async () => {
      reauthBtn.disabled = true;
      reauthText.textContent = "Opening browser…";
      reauthSpinner.classList.remove("hidden");

      try {
        const res = await api.setupApi.oauthStart();
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "OAuth start failed");

        reauthText.textContent = "Waiting for login…";
        if (_reauthPolling) clearInterval(_reauthPolling);
        _reauthPolling = setInterval(async () => {
          const s = await checkStatus();
          if (s && s.ready) {
            clearInterval(_reauthPolling);
            _reauthPolling = null;
            reauthText.textContent = "Re-login with Qobuz";
            reauthSpinner.classList.add("hidden");
            reauthBtn.disabled = false;
            updateStatus(true);
            await QG.features.settings.settingsForm.loadIntoForm();
            QG.ui.feedbackMessage.show(feedback, "Reconnected successfully.", true);
          }
        }, 2000);
      } catch (e) {
        QG.ui.feedbackMessage.show(feedback, e.message, false);
        reauthText.textContent = "Re-login with Qobuz";
        reauthSpinner.classList.add("hidden");
        reauthBtn.disabled = false;
      }
    });

    const checkUpdBtn = document.getElementById("settings-check-updates-btn");
    const updFeedback = document.getElementById("settings-update-feedback");
    if (checkUpdBtn && updFeedback) {
      checkUpdBtn.addEventListener("click", async () => {
        const originalText = checkUpdBtn.dataset.defaultText || checkUpdBtn.textContent;
        checkUpdBtn.dataset.defaultText = originalText;
        checkUpdBtn.disabled = true;
        updFeedback.className = "feedback-msg hidden";
        checkUpdBtn.classList.remove("settings-check-updates-btn--ok", "settings-check-updates-btn--err");
        checkUpdBtn.textContent = "Checking...";
        try {
          const data = await window.QobuzGui.features.updateBanner.refreshUpdateCheck(
            true,
          );
          if (!data) throw new Error("Network error");
          if (data.skipped && data.reason === "repo_not_configured") {
            QG.ui.feedbackMessage.showButton(
              checkUpdBtn,
              "Update source not configured (see qobuz_dl/version.py).",
              false,
            );
          } else if (!data.ok) {
            QG.ui.feedbackMessage.showButton(checkUpdBtn, data.error || "Check failed", false);
          } else if (data.update_available) {
            let updateMsg = "Update available: v" + data.latest_version;
            if (data.download_url && !data.can_auto_install) {
              updateMsg += data.frozen
                ? " (manual install on this platform)"
                : " (run the packaged desktop build to auto-install)";
            }
            QG.ui.feedbackMessage.showButton(checkUpdBtn, updateMsg, true);
          } else {
            QG.ui.feedbackMessage.showButton(checkUpdBtn, "You're on the latest version.", true);
          }
        } catch (e) {
          QG.ui.feedbackMessage.showButton(checkUpdBtn, e.message || "Check failed", false);
        } finally {
          if (
            !checkUpdBtn.classList.contains("settings-check-updates-btn--ok") &&
            !checkUpdBtn.classList.contains("settings-check-updates-btn--err")
          ) {
            checkUpdBtn.disabled = false;
            checkUpdBtn.textContent = originalText;
          }
        }
      });
    }

    // ── Purge database ────────────────────────────────────────
    document
      .getElementById("settings-purge-btn")
      .addEventListener("click", async () => {
        if (
          !confirm(
            "Purge the download database? Future downloads won't be skipped.",
          )
        )
          return;
        try {
          const res = await api.setupApi.purge();
          const data = await res.json();
          if (!data.ok) throw new Error(data.error || "Purge failed");
          QG.ui.feedbackMessage.show(feedback, "Database purged.", true);
        } catch (e) {
          QG.ui.feedbackMessage.show(feedback, e.message, false);
        }
      });
  }

  // ── Init ─────────────────────────────────────────────────
  async function init() {
    window.QobuzGui.ui.collapses.init();
    window.QobuzGui.ui.resetButtons.init();
    initAuthTabs();
    initSetup();
    initBrowseButtons();
    initDownload();
    QG.features.search.init();
    initSettings();
    window.QobuzGui.features.updateBanner.init();
    setTimeout(() => {
      void window.QobuzGui.features.updateBanner.refreshUpdateCheck(true);
    }, 800);

    const status = await checkStatus();
    if (status && (status.ready || status.has_config)) {
      showApp();
      if (!status.ready && status.has_config) {
        // Config exists but client not init yet | auto-connect
        const dot = document.getElementById("status-dot");
        const label = document.getElementById("status-label");
        dot.className = "status-dot connecting";
        label.textContent = "Connecting…";
        try {
          const res = await api.setupApi.connect();
          const data = await res.json();
          updateStatus(data.ok);
        } catch (e) {
          updateStatus(false);
        }
      }
      await QG.features.settings.settingsForm.loadIntoForm();
    } else {
      showSetup();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  document.addEventListener("DOMContentLoaded", () => {
    window.QobuzGui.features.formatBuilder.formatTooltips.init();
    window.QobuzGui.ui.donationPopover.init();
    window.QobuzGui.ui.globalTooltip.init();
    window.QobuzGui.ui.textFieldContextMenu.init();
  });
})();
