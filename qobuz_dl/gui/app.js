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
  const _LYRIC_SEARCH_ATTACHED_SVG = _ic.lyricSearchAttachedSvg;
  const _EXPLICIT_BADGE_SVG = _ic.explicitBadgeSvg;

  function _lyricOut() {
    return QG.features.lyrics.lyricOutputSettings;
  }

  function _syncSearchQueuedHighlights() {
    if (QG.features.search && QG.features.search.syncQueuedHighlights) {
      QG.features.search.syncQueuedHighlights();
    }
  }

  function _hist() {
    return QG.features.history;
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

  /** Title for the LRCLIB search field when opening from a download-history row. */
  function _lyricSearchTitleFromDisplay(displayTitle) {
    return String(displayTitle || "").trim();
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

  function _lyricKindLabel(kind) {
    const k = String(kind || "").toLowerCase();
    if (k === "synced") return "Synced";
    if (k === "plain") return "Plain";
    if (k === "instrumental") return "Instrumental";
    return "\u2014";
  }

  let _lyricSearchModalCtx = null;
  let _lyricAttachAbort = null;
  let _lyricSearchReqAbort = null;
  let _lyricOpenSession = 0;
  const _LYRIC_SEARCH_PAGE_INITIAL = 10;
  const _LYRIC_SEARCH_PAGE_STEP = 5;
  let _lyricSearchScrollRaf = null;
  let _lyricSearchSeq = 0;
  let _lyricPreviewRaf = 0;
  let _lyricPreviewLastActiveIdx = -1;
  let _lyricPreviewSeekMouse = false;
  const _LYRIC_SEARCH_ANCHOR_CLASS = "lyric-search-anchor";

  function _abortLyricSearchFetches() {
    if (_lyricAttachAbort) {
      try {
        _lyricAttachAbort.abort();
      } catch (_) {
        /* ignore */
      }
      _lyricAttachAbort = null;
    }
    if (_lyricSearchReqAbort) {
      try {
        _lyricSearchReqAbort.abort();
      } catch (_) {
        /* ignore */
      }
      _lyricSearchReqAbort = null;
    }
  }

  function _clearLyricSearchAnchorHighlight() {
    document
      .querySelectorAll(".track-status-card." + _LYRIC_SEARCH_ANCHOR_CLASS)
      .forEach((el) => {
        el.classList.remove(_LYRIC_SEARCH_ANCHOR_CLASS);
      });
  }

  function _setLyricSearchAnchorCard(card) {
    _clearLyricSearchAnchorHighlight();
    if (card) card.classList.add(_LYRIC_SEARCH_ANCHOR_CLASS);
  }

  function _formatLyricPreviewTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function _teardownLyricPreviewPlayback() {
    if (_lyricPreviewRaf) {
      cancelAnimationFrame(_lyricPreviewRaf);
      _lyricPreviewRaf = 0;
    }
    _lyricPreviewSeekMouse = false;
    _lyricPreviewLastActiveIdx = -1;
    const audio = document.getElementById("lyric-search-preview-audio");
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    const playBtn = document.getElementById("lyric-search-preview-play");
    if (playBtn) {
      const playIco = playBtn.querySelector(".lyric-search-preview-play-icon");
      const pauseIco = playBtn.querySelector(".lyric-search-preview-pause-icon");
      if (playIco) playIco.classList.remove("hidden");
      if (pauseIco) pauseIco.classList.add("hidden");
      playBtn.setAttribute("aria-label", "Play");
    }
    const seek = document.getElementById("lyric-search-preview-seek");
    const cur = document.getElementById("lyric-search-preview-cur");
    const dur = document.getElementById("lyric-search-preview-dur");
    if (seek) seek.value = "0";
    if (cur) cur.textContent = "0:00";
    if (dur) dur.textContent = "0:00";
  }

  function _lyricPreviewSetPlayingUi(playing) {
    const playBtn = document.getElementById("lyric-search-preview-play");
    if (!playBtn) return;
    const playIco = playBtn.querySelector(".lyric-search-preview-play-icon");
    const pauseIco = playBtn.querySelector(".lyric-search-preview-pause-icon");
    if (playIco) playIco.classList.toggle("hidden", playing);
    if (pauseIco) pauseIco.classList.toggle("hidden", !playing);
    playBtn.setAttribute("aria-label", playing ? "Pause" : "Play");
  }

  function _lyricPreviewSyncSeekAndTimeFromAudio() {
    if (_lyricPreviewSeekMouse) return;
    const audio = document.getElementById("lyric-search-preview-audio");
    const seek = document.getElementById("lyric-search-preview-seek");
    const cur = document.getElementById("lyric-search-preview-cur");
    if (!audio || !seek || !cur) return;
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) {
      seek.value = String(Math.round((audio.currentTime / d) * 1000));
    }
    cur.textContent = _formatLyricPreviewTime(audio.currentTime);
  }

  /** Apply range value to audio (used while dragging and on release). */
  function _applyLyricPreviewSeekSliderValue(scrollWhileSeeking = false) {
    const audio = document.getElementById("lyric-search-preview-audio");
    const seek = document.getElementById("lyric-search-preview-seek");
    if (!audio || !seek || seek.disabled) return;
    const d = audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const t = (Number(seek.value) / 1000) * d;
    audio.currentTime = t;
    const cur = document.getElementById("lyric-search-preview-cur");
    if (cur) cur.textContent = _formatLyricPreviewTime(t);
    _lyricPreviewUpdateActiveLine(t * 1000, { forceScroll: scrollWhileSeeking });
  }

  function _lyricPreviewSeekToTime(seconds) {
    const audio = document.getElementById("lyric-search-preview-audio");
    const seek = document.getElementById("lyric-search-preview-seek");
    if (!audio || !seek || seek.disabled || !audio.src) return;
    const d = audio.duration;
    if (!Number.isFinite(d) || d <= 0) return;
    const t = Math.min(Math.max(0, seconds), d);
    audio.currentTime = t;
    seek.value = String(Math.round((t / d) * 1000));
    const cur = document.getElementById("lyric-search-preview-cur");
    if (cur) cur.textContent = _formatLyricPreviewTime(t);
    _lyricPreviewUpdateActiveLine(t * 1000);
  }

  function _lyricPreviewUpdateActiveLine(progressMs, opts = {}) {
    const body = document.getElementById("lyric-search-preview-body");
    if (!body || !body.classList.contains("lyric-search-preview-body--synced")) {
      return;
    }
    const rows = body.querySelectorAll(".lyric-preview-line");
    if (!rows.length) return;
    let active = -1;
    for (let i = 0; i < rows.length; i++) {
      const start = Number(rows[i].dataset.startMs || 0);
      const end = Number(rows[i].dataset.endMs || Number.POSITIVE_INFINITY);
      if (progressMs >= start && progressMs < end) active = i;
    }
    if (active < 0) {
      for (let i = rows.length - 1; i >= 0; i--) {
        const start = Number(rows[i].dataset.startMs || 0);
        if (progressMs >= start) {
          active = i;
          break;
        }
      }
    }
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.toggle("is-active", i === active);
    }
    if (active >= 0 && active !== _lyricPreviewLastActiveIdx) {
      const previousActive = _lyricPreviewLastActiveIdx;
      _lyricPreviewLastActiveIdx = active;
      if (!_lyricPreviewSeekMouse || opts.forceScroll) {
        const targetIdx =
          previousActive >= 0 && active < previousActive
            ? Math.max(active - 2, 0)
            : Math.min(active + 2, rows.length - 1);
        const scrollTarget = rows[targetIdx];
        scrollTarget.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } else if (active < 0) {
      _lyricPreviewLastActiveIdx = -1;
    }
  }

  function _lyricPreviewFrame() {
    const audio = document.getElementById("lyric-search-preview-audio");
    if (!audio || audio.paused || audio.ended) {
      _lyricPreviewRaf = 0;
      return;
    }
    _lyricPreviewSyncSeekAndTimeFromAudio();
    _lyricPreviewUpdateActiveLine(audio.currentTime * 1000);
    _lyricPreviewRaf = requestAnimationFrame(_lyricPreviewFrame);
  }

  function _parseLrcLinesForPreview(synced) {
    const out = [];
    const lines = String(synced || "").split(/\r?\n/);
    const re = /^\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]\s*(.*)$/;
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      const m = t.match(re);
      if (!m) continue;
      const mm = parseInt(m[1], 10);
      const ss = parseFloat(m[2]);
      if (Number.isNaN(mm) || Number.isNaN(ss)) continue;
      const start_ms = Math.round((mm * 60 + ss) * 1000);
      const lyricText = (m[3] || "").trim();
      const tag = t.match(/^\[[^\]]+\]/);
      out.push({
        start_ms,
        text: lyricText,
        timeTag: tag ? tag[0] : "",
      });
    }
    out.sort((a, b) => a.start_ms - b.start_ms);
    for (let i = 0; i < out.length; i++) {
      out[i].end_ms =
        i + 1 < out.length ? out[i + 1].start_ms : Number.POSITIVE_INFINITY;
    }
    return out;
  }

  function _renderLyricPreviewSyncedBody(body, parsed) {
    body.classList.add("lyric-search-preview-body--synced");
    body.replaceChildren();
    for (let i = 0; i < parsed.length; i++) {
      const row = document.createElement("div");
      row.className = "lyric-preview-line";
      row.dataset.startMs = String(parsed[i].start_ms);
      row.dataset.endMs = String(parsed[i].end_ms);
      const ts = document.createElement("span");
      ts.className = "lyric-preview-ts";
      ts.textContent = parsed[i].timeTag || "";
      const tx = document.createElement("span");
      tx.className = "lyric-preview-text";
      tx.textContent = parsed[i].text || " ";
      row.appendChild(ts);
      row.appendChild(tx);
      body.appendChild(row);
    }
  }

  function _renderLyricPreviewPlainBody(body, text) {
    body.classList.remove("lyric-search-preview-body--synced");
    body.textContent = text || "";
  }

  function _lyricPreviewAudioUrl(audioPath) {
    if (!audioPath) return "";
    return `/api/lyrics/stream-audio?path=${encodeURIComponent(audioPath)}`;
  }

  function _initLyricPreviewPlayer() {
    const playBtn = document.getElementById("lyric-search-preview-play");
    const seek = document.getElementById("lyric-search-preview-seek");
    const audio = document.getElementById("lyric-search-preview-audio");
    const previewRoot = document.getElementById("lyric-search-preview");
    if (!playBtn || !seek || !audio) return;
    if (playBtn.dataset.bound === "1") return;
    playBtn.dataset.bound = "1";
    playBtn.addEventListener("click", () => {
      if (playBtn.disabled || !audio.src) return;
      if (audio.paused) {
        void audio.play();
      } else {
        audio.pause();
      }
    });
    seek.addEventListener("pointerdown", (e) => {
      _lyricPreviewSeekMouse = true;
      try {
        seek.setPointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
    });
    function _finishLyricPreviewSeekDrag() {
      const wasDragging = _lyricPreviewSeekMouse;
      _lyricPreviewSeekMouse = false;
      if (!wasDragging) return;
      _lyricPreviewLastActiveIdx = -1;
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        _lyricPreviewUpdateActiveLine(audio.currentTime * 1000);
      }
    }
    seek.addEventListener("pointerup", (e) => {
      try {
        seek.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* ignore */
      }
      _finishLyricPreviewSeekDrag();
    });
    seek.addEventListener("pointercancel", () => {
      _finishLyricPreviewSeekDrag();
    });
    seek.addEventListener("lostpointercapture", () => {
      _finishLyricPreviewSeekDrag();
    });
    seek.addEventListener("change", () => {
      _applyLyricPreviewSeekSliderValue();
    });
    seek.addEventListener("input", () => {
      _applyLyricPreviewSeekSliderValue(true);
    });
    if (previewRoot && previewRoot.dataset.lineSeekBound !== "1") {
      previewRoot.dataset.lineSeekBound = "1";
      previewRoot.addEventListener("click", (e) => {
        const line = e.target.closest(".lyric-preview-line");
        if (!line || !previewRoot.contains(line)) return;
        const body = document.getElementById("lyric-search-preview-body");
        if (!body || !body.classList.contains("lyric-search-preview-body--synced")) {
          return;
        }
        const startMs = Number(line.dataset.startMs);
        if (!Number.isFinite(startMs)) return;
        _lyricPreviewSeekToTime(startMs / 1000);
      });
    }
    audio.addEventListener("play", () => {
      _lyricPreviewSetPlayingUi(true);
      if (!_lyricPreviewRaf) {
        _lyricPreviewRaf = requestAnimationFrame(_lyricPreviewFrame);
      }
    });
    audio.addEventListener("pause", () => {
      _lyricPreviewSetPlayingUi(false);
      if (_lyricPreviewRaf) {
        cancelAnimationFrame(_lyricPreviewRaf);
        _lyricPreviewRaf = 0;
      }
    });
    audio.addEventListener("ended", () => {
      _lyricPreviewSetPlayingUi(false);
    });
    audio.addEventListener("loadedmetadata", () => {
      const durEl = document.getElementById("lyric-search-preview-dur");
      const d = audio.duration;
      if (durEl && Number.isFinite(d)) {
        durEl.textContent = _formatLyricPreviewTime(d);
      }
    });
  }

  function _closeLyricPreviewOverlay() {
    _teardownLyricPreviewPlayback();
    const panel = document.getElementById("lyric-search-preview-panel");
    if (panel) {
      panel.classList.add("hidden");
      panel.setAttribute("aria-hidden", "true");
    }
    if (_lyricSearchModalCtx) {
      _lyricSearchModalCtx.previewingLrclibId = null;
    }
    document.querySelectorAll("#lyric-search-results .btn-ghost").forEach(btn => {
      btn.classList.remove("is-previewing");
      btn.textContent = "Preview";
      btn.style.width = "";
    });
  }

  function _closeLyricSearchModal() {
    const pop = document.getElementById("lyric-search-popover");
    if (pop) {
      pop.classList.add("hidden");
      pop.setAttribute("aria-hidden", "true");
    }
    _closeLyricPreviewOverlay();
    _abortLyricSearchFetches();
    _clearLyricSearchAnchorHighlight();
    _clearLyricSearchFieldErrors();
    _lyricSearchModalCtx = null;
  }

  /**
   * Place fixed popovers above the download history block, horizontally centered,
   * so the history list stays visible below (shared by lyric search + attach-track).
   */
  function _positionPopoverAboveDownloadHistory(pop) {
    if (!pop || pop.classList.contains("hidden")) return;
    const hist = document.getElementById("dl-track-status-container");
    const margin = 10;
    const gap = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let left;
    let top;
    if (hist) {
      const hr = hist.getBoundingClientRect();
      left = hr.left + (hr.width - pw) / 2;
      top = hr.top - ph - gap;
    } else {
      left = (vw - pw) / 2;
      top = margin;
    }
    left = Math.min(Math.max(margin, left), vw - pw - margin);
    if (top < margin) top = margin;
    if (top + ph > vh - margin) {
      top = Math.max(margin, vh - ph - margin);
    }
    pop.style.bottom = "auto";
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  function _positionLyricSearchPopover() {
    _positionPopoverAboveDownloadHistory(
      document.getElementById("lyric-search-popover"),
    );
  }

  function _lyricSearchKindClass(kind) {
    const k = String(kind || "").toLowerCase();
    if (k === "plain") return "lyric-search-kind lyric-search-kind--plain";
    if (k === "instrumental") {
      return "lyric-search-kind lyric-search-kind--instrumental";
    }
    if (k === "synced") return "lyric-search-kind lyric-search-kind--synced";
    return "lyric-search-kind lyric-search-kind--muted";
  }

  function _clearLyricSearchFieldErrors() {
    const ti = document.getElementById("lyric-search-title");
    const ar = document.getElementById("lyric-search-artist");
    if (ti) ti.classList.remove("lyric-search-input-invalid");
    if (ar) ar.classList.remove("lyric-search-input-invalid");
  }

  function _applyLyricSearchFieldErrors(hasTitle, hasArtist) {
    const titleEl = document.getElementById("lyric-search-title");
    const artistEl = document.getElementById("lyric-search-artist");
    if (titleEl) {
      titleEl.classList.toggle("lyric-search-input-invalid", !hasTitle);
    }
    if (artistEl) {
      artistEl.classList.toggle("lyric-search-input-invalid", !hasArtist);
    }
  }

  function _showLyricSearchResultsLoading(container, ariaBusyLabel) {
    if (!container) return;
    container.replaceChildren();
    const root = document.createElement("div");
    root.className = "lyric-search-loading";
    root.setAttribute("role", "status");
    root.setAttribute("aria-busy", "true");
    root.setAttribute("aria-label", ariaBusyLabel || "Searching lyrics");
    for (let i = 0; i < 3; i++) {
      const row = document.createElement("div");
      row.className = "lyric-search-skeleton-row";
      const l1 = document.createElement("div");
      l1.className = "lyric-search-skeleton-line lyric-search-skeleton-line--a";
      const l2 = document.createElement("div");
      l2.className = "lyric-search-skeleton-line lyric-search-skeleton-line--b";
      const l3 = document.createElement("div");
      l3.className = "lyric-search-skeleton-line lyric-search-skeleton-line--c";
      const t = document.createElement("span");
      t.className = "lyric-search-skeleton-text";
      const p = document.createElement("span");
      p.className = "lyric-search-skeleton-pill";
      l3.appendChild(t);
      l3.appendChild(p);
      row.appendChild(l1);
      row.appendChild(l2);
      row.appendChild(l3);
      root.appendChild(row);
    }
    container.appendChild(root);
  }

  function _formatLyricConfidencePct(confVal) {
    const c = Number(confVal);
    if (!Number.isFinite(c)) return "";
    if (Number.isInteger(c)) return String(Math.round(c));
    const r = Math.round(c * 10) / 10;
    return String(r);
  }

  function _bindLyricSearchKindConfidenceHover(kindEl, kindLabel, confVal) {
    kindEl.dataset.kindLabel = kindLabel;
    const pct = _formatLyricConfidencePct(confVal);
    if (!pct) {
      kindEl.textContent = kindLabel;
      return;
    }
    kindEl.dataset.confidencePct = pct;
    kindEl.classList.add("lyric-search-kind--pct-swap");
    kindEl.textContent = `${pct}%`;
    kindEl.setAttribute(
      "aria-label",
      `LRCLIB match ${pct}% (${kindLabel}); hover shows lyric type.`,
    );

    function showKindLabel() {
      kindEl.textContent = kindEl.dataset.kindLabel || kindLabel;
    }
    function showPct() {
      const p = kindEl.dataset.confidencePct;
      kindEl.textContent = p ? `${p}%` : kindEl.dataset.kindLabel || kindLabel;
    }

    kindEl.addEventListener("mouseenter", showKindLabel);
    kindEl.addEventListener("mouseleave", showPct);
  }

  function _createLyricSearchResultRow(row) {
    const div = document.createElement("div");
    div.className = "lyric-search-row";
    const audioPath = _lyricSearchModalCtx && _lyricSearchModalCtx.audioPath;
    const attachedId =
      _lyricSearchModalCtx && _lyricSearchModalCtx.attachedLrclibId != null
        ? Number(_lyricSearchModalCtx.attachedLrclibId)
        : null;
    const rowId = row.id != null ? Number(row.id) : NaN;
    const isRowAttached =
      attachedId != null &&
      Number.isFinite(attachedId) &&
      Number.isFinite(rowId) &&
      rowId === attachedId;
    if (isRowAttached) {
      div.classList.add("lyric-search-row--attached");
      div.setAttribute("data-lyric-attached", "1");
    }
    div.dataset.rowId = String(row.id || "");

    const trackNameRaw = row.trackName || "";
    const albumRaw = row.albumName || "";
    const artistRaw = row.artistName || "";

    const line1 = document.createElement("div");
    line1.className =
      "lyric-search-row-line lyric-search-row-line--title";

    const t = document.createElement("span");
    t.className = "lyric-search-track";
    t.textContent = trackNameRaw;

    const kind = document.createElement("span");
    kind.className = _lyricSearchKindClass(row.kind);
    const kindLabel = _lyricKindLabel(row.kind);
    kind.textContent = kindLabel;
    _bindLyricSearchKindConfidenceHover(kind, kindLabel, row.confidence);

    line1.appendChild(t);
    line1.appendChild(kind);

    const ex = document.createElement("span");
    if (row.lyrics_explicit) {
      ex.className =
        "lyric-search-rating lyric-search-rating--explicit explicit-tag-badge";
      ex.innerHTML = _EXPLICIT_BADGE_SVG;
      line1.appendChild(ex);
    } else {
      ex.className = "lyric-search-rating lyric-search-rating--clean";
      ex.textContent = "clean";
      line1.appendChild(ex);
    }

    const deltaStr = _formatLyricDeltaSec(row.delta_sec);
    if (deltaStr) {
      const d = document.createElement("span");
      d.className = "lyric-search-delta";
      d.textContent = deltaStr;
      d.setAttribute(
        "aria-label",
        "LRCLIB duration vs this track: " + deltaStr + " (mm:ss)",
      );
      line1.appendChild(d);
    }

    const line2 = document.createElement("div");
    line2.className =
      "lyric-search-row-line lyric-search-row-line--album";
    const albumEl = document.createElement("span");
    albumEl.className = "lyric-search-album";
    albumEl.textContent = albumRaw || "\u2014";
    line2.appendChild(albumEl);

    const line3 = document.createElement("div");
    line3.className =
      "lyric-search-row-line lyric-search-row-line--footer";

    const artistSpan = document.createElement("span");
    artistSpan.className = "lyric-search-artist";
    artistSpan.textContent = artistRaw || "\u2014";

    const actions = document.createElement("div");
    actions.className = "lyric-search-row-actions";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn-ghost btn-sm";
    prevBtn.textContent = "Preview";
    const rid = row.id;
    prevBtn.dataset.rid = String(rid);
    prevBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      void _previewLyricRow(rid);
    });

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "btn-primary btn-sm";
    saveBtn.textContent = "Attach";
    saveBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (saveBtn.disabled) return;
      void _attachLyricRow(rid, row.confidence, row.kind, saveBtn);
    });
    if (!audioPath) {
      saveBtn.disabled = true;
      saveBtn.title =
        "Audio path is available after the track file is saved to disk.";
    }

    actions.appendChild(prevBtn);
    if (isRowAttached) {
      const slot = document.createElement("span");
      slot.className = "lyric-search-attached-slot";
      slot.setAttribute("aria-label", "Already attached to this track");
      slot.setAttribute(
        "data-tip",
        "Lyrics already attached\nThis LRCLIB match is saved using your current lyric output settings. Plex and other players can read sidecar or embedded lyrics.",
      );
      slot.setAttribute("data-tip-icon", "/gui/plex.png");
      slot.innerHTML = _LYRIC_SEARCH_ATTACHED_SVG;
      actions.appendChild(slot);
    } else {
      actions.appendChild(saveBtn);
    }

    line3.appendChild(artistSpan);
    line3.appendChild(actions);

    div.appendChild(line1);
    div.appendChild(line2);
    div.appendChild(line3);
    return div;
  }

  function _lyricSearchResultsRenderEmpty() {
    const el = document.getElementById("lyric-search-results");
    if (!el) return;
    el.innerHTML = "";
    el.scrollTop = 0;
    const empty = document.createElement("div");
    empty.className = "lyric-search-empty";
    empty.textContent = "No matches.";
    el.appendChild(empty);
  }

  function _lyricSearchAppendResultsPage(isInitial) {
    const el = document.getElementById("lyric-search-results");
    const ctx = _lyricSearchModalCtx;
    if (!el || !ctx || !Array.isArray(ctx.lastSearchResults)) return;
    const all = ctx.lastSearchResults;
    const total = all.length;
    if (!total) return;
    const step = isInitial ? _LYRIC_SEARCH_PAGE_INITIAL : _LYRIC_SEARCH_PAGE_STEP;
    let shown = ctx.lyricSearchPagedShown || 0;
    if (isInitial) {
      el.innerHTML = "";
      shown = 0;
    }
    const next = Math.min(shown + step, total);
    for (let i = shown; i < next; i++) {
      el.appendChild(_createLyricSearchResultRow(all[i]));
    }
    ctx.lyricSearchPagedShown = next;
  }

  /** After results render: scroll to the row matching attached LRCLIB id, or top if none / not in list. */
  function _lyricSearchScrollToAttachedOrTop(el, list) {
    const ctx = _lyricSearchModalCtx;
    if (!el || !ctx || !Array.isArray(list) || !list.length) return;
    const attachedId =
      ctx.attachedLrclibId != null ? Number(ctx.attachedLrclibId) : NaN;
    let attachedIdx = -1;
    if (Number.isFinite(attachedId)) {
      attachedIdx = list.findIndex((r) => Number(r.id) === attachedId);
    }
    if (attachedIdx < 0) {
      el.scrollTop = 0;
      return;
    }
    const total = list.length;
    let guard = 0;
    while (
      (ctx.lyricSearchPagedShown || 0) <= attachedIdx &&
      (ctx.lyricSearchPagedShown || 0) < total &&
      guard < 200
    ) {
      _lyricSearchAppendResultsPage(false);
      guard++;
    }
    requestAnimationFrame(() => {
      const row = el.querySelector(".lyric-search-row--attached");
      if (row) {
        row.scrollIntoView({ block: "center", behavior: "auto" });
      } else {
        el.scrollTop = 0;
      }
    });
  }

  function _lyricSearchRebuildVisibleRows() {
    const ctx = _lyricSearchModalCtx;
    const el = document.getElementById("lyric-search-results");
    if (!ctx || !el || !Array.isArray(ctx.lastSearchResults)) return;
    const all = ctx.lastSearchResults;
    if (!all.length) {
      _lyricSearchResultsRenderEmpty();
      return;
    }
    const n = Math.min(ctx.lyricSearchPagedShown || 0, all.length);
    el.innerHTML = "";
    for (let i = 0; i < n; i++) {
      el.appendChild(_createLyricSearchResultRow(all[i]));
    }
    requestAnimationFrame(() => {
      const row = el.querySelector(".lyric-search-row--attached");
      if (row) {
        row.scrollIntoView({ block: "center", behavior: "auto" });
      }
    });
  }

  function _onLyricSearchResultsScroll() {
    if (_lyricSearchScrollRaf != null) {
      cancelAnimationFrame(_lyricSearchScrollRaf);
    }
    _lyricSearchScrollRaf = requestAnimationFrame(() => {
      _lyricSearchScrollRaf = null;
      const el = document.getElementById("lyric-search-results");
      const ctx = _lyricSearchModalCtx;
      if (!el || !ctx || !Array.isArray(ctx.lastSearchResults) || !ctx.lastSearchResults.length) {
        return;
      }
      const shown = ctx.lyricSearchPagedShown || 0;
      const total = ctx.lastSearchResults.length;
      if (shown >= total) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight > 100) return;
      _lyricSearchAppendResultsPage(false);
    });
  }

  function _renderLyricSearchResults(rows) {
    const el = document.getElementById("lyric-search-results");
    if (!el || !_lyricSearchModalCtx) return;
    const list = Array.isArray(rows) ? rows : [];
    _lyricSearchModalCtx.lastSearchResults = list;
    _lyricSearchModalCtx.lyricSearchPagedShown = 0;
    if (!list.length) {
      _lyricSearchResultsRenderEmpty();
      el.scrollTop = 0;
      return;
    }
    _lyricSearchAppendResultsPage(true);
    _lyricSearchScrollToAttachedOrTop(el, list);
  }

  async function _runLyricSearchFromForm() {
    const statusEl = document.getElementById("lyric-search-status");
    const resultsEl = document.getElementById("lyric-search-results");
    const titleEl = document.getElementById("lyric-search-title");
    const artistEl = document.getElementById("lyric-search-artist");
    const albumEl = document.getElementById("lyric-search-album");
    const title = titleEl ? titleEl.value.trim() : "";
    const artist = artistEl ? artistEl.value.trim() : "";
    const album = albumEl ? albumEl.value.trim() : "";
    const refDur =
      _lyricSearchModalCtx && Number.isFinite(_lyricSearchModalCtx.durationSec)
        ? _lyricSearchModalCtx.durationSec
        : 0;

    if (!title || !artist) {
      _applyLyricSearchFieldErrors(!!title, !!artist);
      if (statusEl) {
        statusEl.textContent = "Title and artist are required.";
        statusEl.classList.remove("hidden");
      }
      return;
    }
    _clearLyricSearchFieldErrors();

    if (_lyricSearchReqAbort) {
      try {
        _lyricSearchReqAbort.abort();
      } catch (_) {
        /* ignore */
      }
      _lyricSearchReqAbort = null;
    }
    const searchSeq = ++_lyricSearchSeq;
    if (_lyricSearchModalCtx) {
      _lyricSearchModalCtx.searchSeq = searchSeq;
    }
    _lyricSearchReqAbort = new AbortController();
    const searchSignal = _lyricSearchReqAbort.signal;

    if (statusEl) {
      statusEl.textContent = "Searching\u2026";
      statusEl.classList.remove("hidden");
    }
    _showLyricSearchResultsLoading(resultsEl);
    _closeLyricPreviewOverlay();

    try {
      const res = await api.lyricsApi.search(
        {
          title,
          artist,
          album,
          duration_sec: refDur,
          track_explicit:
            _lyricSearchModalCtx &&
            _lyricSearchModalCtx.trackExplicit !== null &&
            _lyricSearchModalCtx.trackExplicit !== undefined
              ? _lyricSearchModalCtx.trackExplicit
              : null,
          filter_mismatched: true,
        },
        searchSignal,
      );
      const data = await res.json();
      if (
        !_lyricSearchModalCtx ||
        _lyricSearchModalCtx.searchSeq !== searchSeq
      ) {
        return;
      }
      if (!data.ok) {
        if (statusEl) statusEl.textContent = data.error || "Search failed.";
        if (resultsEl) resultsEl.innerHTML = "";
        return;
      }
      const n = (data.results || []).length;
      if (statusEl) statusEl.textContent = `${n} result(s)`;
      const list = Array.isArray(data.results) ? data.results : [];
      if (_lyricSearchModalCtx) {
        _lyricSearchModalCtx.lastSearchResults = list.slice();
      }
      _renderLyricSearchResults(list);
    } catch (err) {
      if (err && err.name === "AbortError") {
        const ctx = _lyricSearchModalCtx;
        if (ctx && ctx.searchSeq === searchSeq && resultsEl) {
          resultsEl.innerHTML = "";
        }
        return;
      }
      if (
        !_lyricSearchModalCtx ||
        _lyricSearchModalCtx.searchSeq !== searchSeq
      ) {
        return;
      }
      if (statusEl) statusEl.textContent = "Network error.";
      if (resultsEl) resultsEl.innerHTML = "";
    }
    if (
      !_lyricSearchModalCtx ||
      _lyricSearchModalCtx.searchSeq !== searchSeq
    ) {
      return;
    }
    const popAfter = document.getElementById("lyric-search-popover");
    if (popAfter && !popAfter.classList.contains("hidden")) {
      requestAnimationFrame(() => _positionLyricSearchPopover());
    }
  }

  async function _previewLyricRow(id) {
    if (_lyricSearchModalCtx && _lyricSearchModalCtx.previewingLrclibId === id) {
      return;
    }
    if (_lyricSearchModalCtx) {
      _lyricSearchModalCtx.previewingLrclibId = id;
    }
    _teardownLyricPreviewPlayback();
    _lyricPreviewLastActiveIdx = -1;
    const panel = document.getElementById("lyric-search-preview-panel");
    const prev = document.getElementById("lyric-search-preview");
    const body = document.getElementById("lyric-search-preview-body");
    const flag = document.getElementById("lyric-search-preview-flag");
    const audio = document.getElementById("lyric-search-preview-audio");
    const playBtn = document.getElementById("lyric-search-preview-play");
    const seek = document.getElementById("lyric-search-preview-seek");
    const ctx = _lyricSearchModalCtx;
    const audioPath = ctx && ctx.audioPath ? String(ctx.audioPath).trim() : "";
    const idNum = id != null ? Number(id) : NaN;
    const attachedId =
      ctx && ctx.attachedLrclibId != null ? Number(ctx.attachedLrclibId) : NaN;
    const shouldUseLocal =
      audioPath &&
      Number.isFinite(idNum) &&
      Number.isFinite(attachedId) &&
      idNum === attachedId;
    if (!prev || !body) return;
    _renderLyricPreviewPlainBody(body, "Loading\u2026");
    if (playBtn) playBtn.disabled = true;
    if (seek) seek.disabled = true;
    if (flag) {
      flag.classList.add("hidden");
      flag.textContent = "";
    }
    if (panel) {
      panel.classList.remove("hidden");
      panel.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => _positionLyricSearchPopover());
    }

    // Highlight the button being previewed and show loading state
    let currentPreviewBtn = null;
    document.querySelectorAll("#lyric-search-results .btn-ghost").forEach(btn => {
      if (btn.dataset.rid === String(id)) {
        currentPreviewBtn = btn;
        btn.classList.add("is-previewing");
        // Lock width to prevent layout shift
        const w = btn.offsetWidth;
        if (w > 0) btn.style.width = w + "px";
        btn.innerHTML = '<span class="spinner"></span>';
      } else {
        btn.classList.remove("is-previewing");
        btn.textContent = "Preview";
        btn.style.width = "";
      }
    });

    try {
      let res;
      if (shouldUseLocal) {
        res = await api.lyricsApi.local(audioPath);
        if (!res.ok) {
          res = await api.lyricsApi.fetchById(id);
        }
      } else {
        res = await api.lyricsApi.fetchById(id);
      }
      const data = await res.json();
      if (!data.ok) {
        _renderLyricPreviewPlainBody(body, data.error || "Fetch failed.");
        return;
      }
      const rec = data.record || {};
      const synced = (rec.syncedLyrics || "").trim();
      const plain = (rec.plainLyrics || "").trim();
      if (synced) {
        const parsed = _parseLrcLinesForPreview(synced);
        if (parsed.length) {
          _renderLyricPreviewSyncedBody(body, parsed);
        } else {
          _renderLyricPreviewPlainBody(body, synced || plain || "(empty)");
        }
      } else {
        _renderLyricPreviewPlainBody(body, plain || "(empty)");
      }
      if (audioPath && audio) {
        audio.src = _lyricPreviewAudioUrl(audioPath);
        if (playBtn) playBtn.disabled = false;
        if (seek) seek.disabled = false;
      } else {
        if (audio) {
          audio.removeAttribute("src");
          audio.load();
        }
        if (playBtn) playBtn.disabled = true;
        if (seek) seek.disabled = true;
      }
      if (flag) {
        flag.classList.remove("hidden");
        if (data.lyrics_explicit) {
          flag.className = "lyric-search-preview-flag lyric-search-preview-flag--explicit";
          flag.innerHTML = `${_EXPLICIT_BADGE_SVG}<span class="lyric-search-preview-flag-text">Explicit: Lyric text contains explicit language.</span>`;
        } else {
          flag.className = "lyric-search-preview-flag lyric-search-preview-flag--clean";
          flag.innerHTML = `<span class="lyric-search-preview-flag-text lyric-search-preview-flag-text--clean">Clean: No explicit language detected in these lyrics.</span>`;
        }
      }
    } catch (_) {
      _renderLyricPreviewPlainBody(body, "Network error.");
    } finally {
      if (currentPreviewBtn && currentPreviewBtn.dataset.rid === String(id)) {
        currentPreviewBtn.textContent = "Preview";
        currentPreviewBtn.style.width = "";
      }
      requestAnimationFrame(() => _positionLyricSearchPopover());
    }
  }

  async function _attachLyricRow(id, confidence, kind, triggerBtn) {
    const ctx = _lyricSearchModalCtx;
    if (!ctx || !ctx.audioPath) return;
    const idNum = id != null ? Number(id) : NaN;
    if (!Number.isFinite(idNum)) return;
    const lyricTypeRaw = kind != null && String(kind).trim() !== ""
      ? String(kind).trim().toLowerCase()
      : "synced";
    let confForChip = "";
    if (confidence != null && String(confidence).trim() !== "") {
      const n = Math.round(Number(confidence));
      if (Number.isFinite(n)) {
        confForChip = String(Math.max(0, Math.min(100, n)));
      }
    }
    const prevBtnText = triggerBtn ? triggerBtn.textContent : "";
    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = "Attaching\u2026";
    }
    const statusEl = document.getElementById("lyric-search-status");
    const lyricOutputs = _lyricOut().readChecks("popover");
    try {
      const res = await api.lyricsApi.attach({
        audio_path: ctx.audioPath,
        lrclib_id: idNum,
        write_sidecar: lyricOutputs.lrc,
        write_metadata: lyricOutputs.metadata,
      });
      const data = await res.json();
      if (!data.ok) {
        if (statusEl) {
          statusEl.textContent = data.error || "Attach failed.";
          statusEl.classList.remove("hidden");
        }
        if (triggerBtn) {
          triggerBtn.disabled = false;
          triggerBtn.textContent = prevBtnText;
        }
        return;
      }
      ctx.attachedLrclibId = idNum;
      const anchor = ctx.anchorCard;
      if (anchor) {
        const tEl = anchor.querySelector(".track-status-title");
        const tTitle = ((tEl && tEl.textContent) || "").trim();
        const tNo = (anchor.dataset.trackNo || "").trim();
        if (tNo && tTitle) {
          _hist().setLyricsChip(
            tNo,
            tTitle,
            lyricTypeRaw,
            confForChip !== "" ? confForChip : null,
            (anchor.dataset.lyricAlbum || "").trim(),
            "Lrclib",
            _lyricDestinationFromOutputs(lyricOutputs),
          );
        }
      }
      if (ctx.lastSearchResults && ctx.lastSearchResults.length) {
        _lyricSearchRebuildVisibleRows();
      }
      if (statusEl) {
        statusEl.textContent = "Lyrics attached to file.";
        statusEl.classList.remove("hidden");
      }
      requestAnimationFrame(() => _positionLyricSearchPopover());
    } catch (_) {
      if (statusEl) {
        statusEl.textContent = "Network error.";
        statusEl.classList.remove("hidden");
      }
      if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = prevBtnText;
      }
    }
  }

  async function _openLyricSearchModal(card) {
    const pop = document.getElementById("lyric-search-popover");
    if (!pop || !card) return;
    const rf = QG.features.replacements;
    if (rf && typeof rf.closeAttachPopover === "function") {
      rf.closeAttachPopover();
    }
    _abortLyricSearchFetches();
    _closeLyricPreviewOverlay();
    const openSession = ++_lyricOpenSession;
    const titleEl = card.querySelector(".track-status-title");
    const displayTitle = ((titleEl && titleEl.textContent) || "").trim();
    const title = _lyricSearchTitleFromDisplay(displayTitle);
    _lyricOut().syncFromDownload();
    const artist = (card.dataset.lyricArtist || "").trim();
    const album = (card.dataset.lyricAlbum || "").trim();
    let durationSec = parseInt(String(card.dataset.durationSec || "0"), 10);
    if (Number.isNaN(durationSec)) durationSec = 0;
    const audioPath = (card.dataset.audioPath || "").trim();
    const openingPath = audioPath;

    const ti = document.getElementById("lyric-search-title");
    const ar = document.getElementById("lyric-search-artist");
    const al = document.getElementById("lyric-search-album");
    if (ti) ti.value = title;
    if (ar) ar.value = artist;
    if (al) al.value = album;
    _clearLyricSearchFieldErrors();

    const teRaw = card.dataset.trackExplicit;
    let trackExplicit = null;
    if (teRaw === "1") trackExplicit = true;
    else if (teRaw === "0") trackExplicit = false;
    _lyricSearchModalCtx = {
      audioPath,
      durationSec,
      trackExplicit,
      attachedLrclibId: null,
      previewingLrclibId: null,
      lastSearchResults: null,
      lyricSearchPagedShown: 0,
      anchorCard: card,
      openSession,
      searchSeq: 0,
    };
    _setLyricSearchAnchorCard(card);

    pop.classList.remove("hidden");
    pop.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => _positionLyricSearchPopover());

    const statusEl = document.getElementById("lyric-search-status");
    if (statusEl) statusEl.classList.add("hidden");
    const resultsEl = document.getElementById("lyric-search-results");
    _showLyricSearchResultsLoading(resultsEl);
    const pflag = document.getElementById("lyric-search-preview-flag");
    if (pflag) {
      pflag.classList.add("hidden");
      pflag.textContent = "";
    }

    _lyricAttachAbort = new AbortController();
    const attachSignal = _lyricAttachAbort.signal;

    let attachedLrclibId = null;
    if (audioPath) {
      try {
        const res = await api.lyricsApi.attachedId(audioPath, attachSignal);
        const data = await res.json();
        if (data.ok && data.attached_lrclib_id != null) {
          attachedLrclibId = data.attached_lrclib_id;
        }
      } catch (err) {
        if (err && err.name === "AbortError") return;
        /* ignore other attach-id errors */
      }
    }
    _lyricAttachAbort = null;
    if (
      !_lyricSearchModalCtx ||
      _lyricSearchModalCtx.openSession !== openSession ||
      _lyricSearchModalCtx.audioPath !== openingPath
    ) {
      return;
    }
    _lyricSearchModalCtx.attachedLrclibId = attachedLrclibId;
    await _runLyricSearchFromForm();
  }

  function _initLyricSearchModal() {
    _initLyricPreviewPlayer();
    _lyricOut().bindPopoverToggles();
    const pop = document.getElementById("lyric-search-popover");
    if (!pop) return;
    let lyricSearchMousedownTarget = null;
    document.addEventListener(
      "mousedown",
      (e) => {
        if (!pop || pop.classList.contains("hidden")) {
          lyricSearchMousedownTarget = null;
          return;
        }
        lyricSearchMousedownTarget = e.target;
      },
      true,
    );
    const closeBtn = document.getElementById("lyric-search-close");
    const previewCloseBtn = document.getElementById("lyric-search-preview-close");
    const submitBtn = document.getElementById("lyric-search-submit");
    if (closeBtn) closeBtn.addEventListener("click", () => _closeLyricSearchModal());
    if (previewCloseBtn) {
      previewCloseBtn.addEventListener("click", () => _closeLyricPreviewOverlay());
    }
    document.addEventListener("click", (e) => {
      if (!pop || pop.classList.contains("hidden")) return;
      const target = lyricSearchMousedownTarget || e.target;
      if (pop.contains(target)) return;
      if (e.target.closest && e.target.closest("#dl-track-status")) return;
      _closeLyricSearchModal();
    });
    window.addEventListener("resize", () => {
      if (!pop || pop.classList.contains("hidden") || !_lyricSearchModalCtx) {
        return;
      }
      _positionLyricSearchPopover();
    });
    let _lyricPopWinScrollRaf = null;
    window.addEventListener(
      "scroll",
      () => {
        if (!pop || pop.classList.contains("hidden") || !_lyricSearchModalCtx) {
          return;
        }
        if (_lyricPopWinScrollRaf != null) {
          cancelAnimationFrame(_lyricPopWinScrollRaf);
        }
        _lyricPopWinScrollRaf = requestAnimationFrame(() => {
          _lyricPopWinScrollRaf = null;
          _positionLyricSearchPopover();
        });
      },
      true,
    );
    if (submitBtn) submitBtn.addEventListener("click", () => _runLyricSearchFromForm());
    const lyricResultsScroll = document.getElementById("lyric-search-results");
    if (lyricResultsScroll && !lyricResultsScroll.dataset.pagingScrollBound) {
      lyricResultsScroll.dataset.pagingScrollBound = "1";
      lyricResultsScroll.addEventListener(
        "scroll",
        _onLyricSearchResultsScroll,
        { passive: true },
      );
    }
    const lyricTitleIn = document.getElementById("lyric-search-title");
    const lyricArtistIn = document.getElementById("lyric-search-artist");
    if (lyricTitleIn) {
      lyricTitleIn.addEventListener("input", () => {
        lyricTitleIn.classList.remove("lyric-search-input-invalid");
      });
    }
    if (lyricArtistIn) {
      lyricArtistIn.addEventListener("input", () => {
        lyricArtistIn.classList.remove("lyric-search-input-invalid");
      });
    }

    const list = document.getElementById("dl-track-status");
    if (!list) return;
    list.addEventListener("click", (e) => {
      const revealBtn = e.target.closest("button.track-dl-btn--reveal");
      if (revealBtn) {
        e.preventDefault();
        e.stopPropagation();
        const rcard = revealBtn.closest(".track-status-card");
        const rp = rcard && (rcard.dataset.audioPath || "").trim();
        if (!rp) return;
        void (async () => {
          try {
            const res = await api.utilityApi.revealInFolder(rp);
            await res.json();
          } catch (_) {
            /* ignore */
          }
        })();
        return;
      }
      if (e.target.closest(".confidence-chip-tooltip")) return;
      const wrap = e.target.closest(".confidence-chip-wrap");
      const lyricsChip = e.target.closest(".track-status-chip.lyrics-chip");
      if (!wrap && !lyricsChip) return;
      if (lyricsChip && lyricsChip.classList.contains("loading")) return;
      const rowCard = (wrap || lyricsChip).closest(".track-status-card");
      if (!rowCard) return;
      e.preventDefault();
      e.stopPropagation();
      _openLyricSearchModal(rowCard);
    });
  }

  async function _resetTrackStatusCards() {
    _closeLyricSearchModal();
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
          closeLyricSearchModal: _closeLyricSearchModal,
          setLyricSearchAnchorCard: _setLyricSearchAnchorCard,
          clearLyricSearchAnchorHighlight: _clearLyricSearchAnchorHighlight,
          lyricSearchTitleFromDisplay: _lyricSearchTitleFromDisplay,
          showLyricSearchResultsLoading: _showLyricSearchResultsLoading,
          positionPopoverAboveDownloadHistory:
            _positionPopoverAboveDownloadHistory,
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
        }
        _hist().setDownloadChip(
          trackNo,
          title,
          "downloading",
          "",
          undefined,
          evAlb,
        );
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
        if (preCard && sidTrim && ridTrim && (isPurchase || isFailed)) {
          preCard.dataset.attachSearchEligible = "1";
        }
        if (preCard && ap) {
          preCard.dataset.audioPath = ap;
          _tsRegisterAudioPathAlbum(ap, resAlb);
        }
        if (isPurchase && detail) {
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
        } else {
          _hist().setDownloadChip(
            ev.track_no,
            ev.title,
            isFailed ? "failed" : "downloaded",
            isFailed ? "failed" : "done",
            undefined,
            resAlb,
          );
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
            delete preCard.dataset.attachSearchEligible;
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
          ((isPurchase && detail) || isFailed)
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
    _initLyricSearchModal();
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
