/**
 * Download history DB hydrate, in-memory row store, and persist (H6).
 *
 * Owns `_tsDbItemByKey` semantics (serialized rows for virt/filter/queue counts).
 * Invoked once from `app.js` `initDownload()` via `bootstrapHydratePersist(deps)`.
 */
(function () {
  "use strict";
  const g = window.QobuzGui;
  const hroot = (g.features.history = g.features.history || {});

  function bootstrapHydratePersist(deps) {
    const api = g.api;
    const ti = g.core.trackIdentity;
    const parseTrackRef = ti.parseTrackRef;
    const trackKey = ti.trackKey;
    const normalizeTrackNo = ti.normalizeTrackNo;
    const normalizeTrackTitle = ti.normalizeTrackTitle;
    const GUI_PENDING = deps.guiPendingAudioPrefix;

    const dbItemByKey = new Map();
    const audioPathAlbum = new Map();

    function getDbItemByKey() {
      return dbItemByKey;
    }

    function getTrackStatusMap() {
      return dbItemByKey;
    }

    function registerAudioPathAlbum(audioPath, lyricAlbum) {
      const p = String(audioPath || "").trim();
      if (!p) return;
      audioPathAlbum.set(p, String(lyricAlbum || "").trim());
    }

    function lyricAlbumForAudioPath(audioPath) {
      const ap = String(audioPath || "").trim();
      if (ap && audioPathAlbum.has(ap)) {
        return audioPathAlbum.get(ap) || "";
      }
      return "";
    }

    function sortHistoryItemsForDisplay(items) {
      return items.slice().sort((a, b) => {
        const albA = (a.lyric_album || "").trim().toLowerCase();
        const albB = (b.lyric_album || "").trim().toLowerCase();
        if (albA !== albB) return 0;
        const na = parseInt(normalizeTrackNo(a.track_no || "") || "0", 10) || 0;
        const nb = parseInt(normalizeTrackNo(b.track_no || "") || "0", 10) || 0;
        if (na !== nb) return na - nb;
        return String(a.title || "")
          .trim()
          .localeCompare(String(b.title || "").trim(), undefined, {
            sensitivity: "base",
          });
      });
    }

    function lyricAlbumForTrackEv(ev) {
      const apEv = String(ev.audio_path || "").trim();
      const fromMap = lyricAlbumForAudioPath(apEv);
      if (fromMap) return fromMap;
      let a =
        ev.lyric_album != null && String(ev.lyric_album).trim() !== ""
          ? String(ev.lyric_album).trim()
          : "";
      if (a) return a;
      const wantN = normalizeTrackNo(ev.track_no);
      const wantT = normalizeTrackTitle(ev.title || "");
      const cards = document.querySelectorAll(
        "#dl-track-status .track-status-card",
      );
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (normalizeTrackNo(c.dataset.trackNo) !== wantN) continue;
        const tEl = c.querySelector(".track-status-title");
        const ct = normalizeTrackTitle((tEl && tEl.textContent) || "");
        if (ct !== wantT) continue;
        const da = (c.dataset.lyricAlbum || "").trim();
        if (da) return da;
      }
      return "";
    }

    function applyHistoryDbItemToCard(card, it) {
      const alb = (it.lyric_album || "").trim();
      if (it.lyric_artist) {
        card.dataset.lyricArtist = String(it.lyric_artist);
      }
      if (alb) card.dataset.lyricAlbum = alb;
      if (it.duration_sec) {
        card.dataset.durationSec = String(parseInt(it.duration_sec, 10) || 0);
      }
      if (it.audio_path) {
        const rawAp = String(it.audio_path || "").trim();
        if (rawAp && !rawAp.startsWith(GUI_PENDING)) {
          card.dataset.audioPath = rawAp;
          registerAudioPathAlbum(rawAp, alb);
          if (rawAp.toLowerCase().endsWith(".missing.txt")) {
            card.dataset.resolvedBy = "placeholder";
          } else if (
            (it.attach_search_eligible === true ||
              it.attach_search_eligible === 1) &&
            String(it.download_status || "").toLowerCase() === "downloaded"
          ) {
            card.dataset.resolvedBy = "search";
          }
        }
      }
      if (it.track_explicit === true || it.track_explicit === false) {
        card.dataset.trackExplicit = it.track_explicit ? "1" : "0";
        deps.setTrackContentRatingBadge(card, it.track_explicit);
      }
      if ((it.slot_track_id || "").trim()) {
        card.dataset.slotTrackId = String(it.slot_track_id).trim();
      }
      if ((it.release_album_id || "").trim()) {
        card.dataset.releaseAlbumId = String(it.release_album_id).trim();
      }
      if (it.attach_search_eligible === true || it.attach_search_eligible === 1) {
        card.dataset.attachSearchEligible = "1";
      } else {
        delete card.dataset.attachSearchEligible;
      }
      const st = String(it.download_status || "downloaded").toLowerCase();
      const detail = String(it.download_detail || "").trim();
      const isFailed = st === "failed";
      const isPurchase = st === "purchase_only";
      if (isPurchase && detail) {
        deps.setTrackDownloadChip(
          it.track_no,
          it.title,
          "Album Purchase Only",
          "failed",
          {
            href: detail,
            titleAttr:
              "Open album on Qobuz to purchase (full album required for these tracks)",
            slotTrackId: String(it.slot_track_id || "").trim(),
            releaseAlbumId: String(it.release_album_id || "").trim(),
          },
          alb,
        );
      } else {
        deps.setTrackDownloadChip(
          it.track_no,
          it.title,
          isFailed ? "failed" : "downloaded",
          isFailed ? "failed" : "done",
          undefined,
          alb,
        );
      }
      if (it.lyric_type && String(it.lyric_type).toLowerCase() !== "loading") {
        deps.setTrackLyricsChip(
          it.track_no,
          it.title,
          it.lyric_type,
          it.lyric_confidence || null,
          alb,
          it.lyric_provider || "",
          it.lyric_destination || "",
        );
      }
    }

    function applyHistoryDbItemToNewCard(it) {
      const alb = (it.lyric_album || "").trim();
      const card = deps.ensureTrackStatusCard(
        it.track_no || "",
        it.title || "",
        true,
        it.cover_url || "",
        alb,
      );
      if (!card) return;
      applyHistoryDbItemToCard(card, it);
    }

    function resolveCoverUrl(card, key) {
      const img = card && card.querySelector(".track-status-art-img");
      const fromDom = (img && img.getAttribute("src")) || "";
      if (fromDom) return fromDom;
      const lk = String(key || (card && card.dataset.trackKey) || "").trim();
      if (lk) {
        const snap = dbItemByKey.get(lk);
        if (snap && snap.cover_url) return String(snap.cover_url);
      }
      return "";
    }

    function storeDbItemFromTrackStart(ev, evAlb, card, coverUrl) {
      const tk = (card && card.dataset.trackKey) || "";
      if (!tk) return;
      const tEl = card.querySelector(".track-status-title");
      const existing = dbItemByKey.get(tk) || {};
      const cover =
        String(coverUrl || "").trim() ||
        resolveCoverUrl(card, tk) ||
        String(existing.cover_url || "");
      dbItemByKey.set(tk, {
        ...existing,
        track_no: String(ev.track_no || card.dataset.trackNo || existing.track_no || ""),
        title:
          (tEl && tEl.textContent) ||
          String(ev.title || existing.title || ""),
        lyric_album: evAlb || existing.lyric_album || "",
        cover_url: cover,
        lyric_artist: (card.dataset.lyricArtist || existing.lyric_artist || "").trim(),
        duration_sec:
          parseInt(card.dataset.durationSec || String(existing.duration_sec || "0"), 10) ||
          0,
        track_explicit:
          card.dataset.trackExplicit === "1"
            ? true
            : card.dataset.trackExplicit === "0"
              ? false
              : existing.track_explicit != null
                ? existing.track_explicit
                : null,
        download_status: existing.download_status || "downloading",
      });
    }

    function storeDbItemFromTrackResult(ev, resAlb, card) {
      const tk = (card && card.dataset.trackKey) || "";
      if (!tk) return;
      const tEl = card.querySelector(".track-status-title");
      const st = String(ev.status || "").toLowerCase();
      const isFailed = st === "failed";
      const isPurchase = st === "purchase_only";
      const detail = String(ev.detail || "").trim();
      const it = {
        track_no: String(ev.track_no || ""),
        title: (tEl && tEl.textContent) || String(ev.title || ""),
        lyric_album: resAlb || "",
        cover_url: resolveCoverUrl(card, tk),
        lyric_artist: (card.dataset.lyricArtist || "").trim(),
        duration_sec: parseInt(card.dataset.durationSec || "0", 10) || 0,
        audio_path: (card.dataset.audioPath || "").trim(),
        track_explicit:
          card.dataset.trackExplicit === "1"
            ? true
            : card.dataset.trackExplicit === "0"
              ? false
              : null,
        download_status: isPurchase
          ? "purchase_only"
          : isFailed
            ? "failed"
            : "downloaded",
        download_detail: detail,
        slot_track_id: String(ev.slot_track_id || "").trim(),
        release_album_id: String(ev.release_album_id || "").trim(),
        lyric_type: "",
        lyric_provider: "",
        lyric_confidence: "",
        lyric_destination: "",
        attach_search_eligible: card.dataset.attachSearchEligible === "1",
      };
      const chip = card.querySelector(".lyrics-chip");
      if (chip) {
        const parts = (chip.className || "").split(/\s+/);
        const lt = parts.find((c) =>
          ["synced", "plain", "none", "error", "instrumental"].includes(c),
        );
        if (lt) it.lyric_type = lt;
        it.lyric_destination = deps.normalizeLyricDestination(
          chip.dataset.lyricDestination || "",
        );
      }
      dbItemByKey.set(tk, it);
      const apStore = (card.dataset.audioPath || "").trim();
      if (apStore && !apStore.startsWith(GUI_PENDING)) {
        registerAudioPathAlbum(apStore, (it.lyric_album || "").trim());
      }
    }

    function updateLyricSnapForKey(key, ev) {
      const lk = String(key || "").trim();
      if (!lk) return false;
      const rowSnap = dbItemByKey.get(lk);
      if (!rowSnap) return false;
      rowSnap.lyric_type = String(ev.lyric_type || "none").toLowerCase();
      rowSnap.lyric_provider =
        ev.provider != null ? String(ev.provider) : "";
      rowSnap.lyric_confidence =
        ev.confidence != null && String(ev.confidence).trim() !== ""
          ? String(ev.confidence).trim()
          : "";
      rowSnap.lyric_destination = deps.normalizeLyricDestination(
        ev.lyric_destination || "",
      );
      return true;
    }

    function persistDownloadHistoryAfterResult(ev, resAlb) {
      const ap = String(ev.audio_path || "").trim();
      if (!ap || String(ev.status || "").toLowerCase() !== "downloaded") return;
      const card = deps.ensureTrackStatusCard(
        ev.track_no,
        ev.title,
        false,
        undefined,
        resAlb,
      );
      if (!card) return;
      const tEl = card.querySelector(".track-status-title");
      const coverUrl = resolveCoverUrl(card, card.dataset.trackKey || "");
      const payload = {
        audio_path: ap,
        track_no: card.dataset.trackNo || String(ev.track_no || ""),
        title: (tEl && tEl.textContent) || String(ev.title || ""),
        cover_url: coverUrl,
        lyric_artist: card.dataset.lyricArtist || "",
        lyric_album: (card.dataset.lyricAlbum || resAlb || "").trim(),
        duration_sec: parseInt(card.dataset.durationSec || "0", 10) || 0,
        track_explicit:
          card.dataset.trackExplicit === "1"
            ? true
            : card.dataset.trackExplicit === "0"
              ? false
              : null,
        download_status: "downloaded",
        download_detail: String(ev.detail || ""),
        lyric_type: "",
        lyric_provider: "",
        lyric_confidence: "",
      };
      const sidEv = String(ev.slot_track_id || "").trim();
      const ridEv = String(ev.release_album_id || "").trim();
      if (sidEv) {
        payload.slot_track_id = sidEv;
        payload.pending_slot_cleanup_id = sidEv;
      }
      if (ridEv) payload.release_album_id = ridEv;
      payload.attach_search_eligible = card.dataset.attachSearchEligible === "1";
      const chip = card.querySelector(".lyrics-chip");
      if (chip) {
        const parts = (chip.className || "").split(/\s+/);
        const lt = parts.find((c) =>
          ["synced", "plain", "none", "error", "instrumental"].includes(c),
        );
        if (lt) payload.lyric_type = lt;
        payload.lyric_destination = deps.normalizeLyricDestination(
          chip.dataset.lyricDestination || "",
        );
      }
      const tk = (card.dataset.trackKey || "").trim();
      const rowSnap = tk ? dbItemByKey.get(tk) : null;
      if (rowSnap && !payload.lyric_type) {
        const snapLt = String(rowSnap.lyric_type || "").toLowerCase();
        if (snapLt && snapLt !== "loading") {
          payload.lyric_type = snapLt;
          payload.lyric_provider = String(rowSnap.lyric_provider || "");
          payload.lyric_confidence = String(rowSnap.lyric_confidence || "");
          payload.lyric_destination = deps.normalizeLyricDestination(
            rowSnap.lyric_destination || "",
          );
        }
      }
      registerAudioPathAlbum(ap, (payload.lyric_album || "").trim());
      void api.historyApi.upsert(payload).catch(() => {});
    }

    function persistPendingSlotDownloadHistory(ev, preCard, resAlb) {
      const sid = String(ev.slot_track_id || "").trim();
      const rid = String(ev.release_album_id || "").trim();
      const st = String(ev.status || "").toLowerCase();
      if (
        !preCard ||
        !sid ||
        !rid ||
        (st !== "purchase_only" && st !== "failed")
      ) {
        return;
      }
      const tEl = preCard.querySelector(".track-status-title");
      const coverUrl = resolveCoverUrl(preCard, preCard.dataset.trackKey || "");
      const payload = {
        audio_path: GUI_PENDING + sid,
        track_no: preCard.dataset.trackNo || String(ev.track_no || ""),
        title: (tEl && tEl.textContent) || String(ev.title || ""),
        cover_url: coverUrl,
        lyric_artist: preCard.dataset.lyricArtist || "",
        lyric_album: (preCard.dataset.lyricAlbum || resAlb || "").trim(),
        duration_sec: parseInt(preCard.dataset.durationSec || "0", 10) || 0,
        track_explicit:
          preCard.dataset.trackExplicit === "1"
            ? true
            : preCard.dataset.trackExplicit === "0"
              ? false
              : null,
        download_status: st,
        download_detail: String(ev.detail || ""),
        lyric_type: "",
        lyric_provider: "",
        lyric_confidence: "",
        lyric_destination: "",
        slot_track_id: sid,
        release_album_id: rid,
        attach_search_eligible: true,
      };
      const chip = preCard.querySelector(".lyrics-chip");
      if (chip) {
        const parts = (chip.className || "").split(/\s+/);
        const lt = parts.find((c) =>
          ["synced", "plain", "none", "error", "instrumental"].includes(c),
        );
        if (lt) payload.lyric_type = lt;
        payload.lyric_destination = deps.normalizeLyricDestination(
          chip.dataset.lyricDestination || "",
        );
      }
      void api.historyApi.upsert(payload).catch(() => {});
    }

    function countDownloadedForRelease(releaseAlbumId) {
      const rid = String(releaseAlbumId || "").trim();
      if (!rid) return 0;
      let n = 0;
      for (const it of dbItemByKey.values()) {
        if (String(it.release_album_id || "").trim() !== rid) continue;
        const st = String(it.download_status || "downloaded").toLowerCase();
        if (st !== "downloaded") continue;
        const ap = String(it.audio_path || "").trim();
        if (!ap || ap.startsWith(GUI_PENDING)) continue;
        n++;
      }
      return n;
    }

    function clearLocalMaps() {
      dbItemByKey.clear();
      audioPathAlbum.clear();
    }

    async function hydrateFromDb() {
      const list = document.getElementById("dl-track-status");
      if (!list) return;
      try {
        const res = await api.historyApi.list();
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.items)) return;
        const items = sortHistoryItemsForDisplay(data.items);
        const stick = deps.scrollContainerAtBottom(list);

        deps.setSkipHistoryFilterApply(true);
        try {
          deps.resetListForHydrate(list);
          clearLocalMaps();

          for (let i = 0; i < items.length; i++) {
            const it = items[i];
            const alb = (it.lyric_album || "").trim();
            const parsed = parseTrackRef(it.track_no || "", it.title || "");
            const key = trackKey(parsed.trackNo, parsed.title, alb);
            deps.pushOrderAllKey(key);
            dbItemByKey.set(key, it);
            const ap = (it.audio_path || "").trim();
            if (ap && !ap.startsWith(GUI_PENDING)) {
              registerAudioPathAlbum(ap, alb);
            }
          }

          if (items.length >= deps.virtThreshold) {
            deps.activateVirtForList(list);
          }
        } finally {
          deps.setSkipHistoryFilterApply(false);
        }

        deps.applyHistoryFilter();

        if (items.length >= deps.virtThreshold) {
          deps.runVirtInitialRenderPass(list, stick);
        } else {
          deps.setSkipHistoryFilterApply(true);
          try {
            for (let i = 0; i < items.length; i++) {
              applyHistoryDbItemToNewCard(items[i]);
            }
          } finally {
            deps.setSkipHistoryFilterApply(false);
          }
          deps.applyHistoryFilter();
          if (stick) list.scrollTop = list.scrollHeight;
        }
      } catch (_) {
        deps.setSkipHistoryFilterApply(false);
      }
    }

    async function clearServerAndLocal(list) {
      try {
        await api.historyApi.clear();
      } catch (_) {
        /* ignore */
      }
      if (!list) return;
      deps.resetListForHydrate(list);
      clearLocalMaps();
    }

    return {
      getDbItemByKey,
      getTrackStatusMap,
      registerAudioPathAlbum,
      lyricAlbumForAudioPath,
      lyricAlbumForTrackEv,
      applyHistoryDbItemToCard,
      applyHistoryDbItemToNewCard,
      storeDbItemFromTrackStart,
      storeDbItemFromTrackResult,
      updateLyricSnapForKey,
      persistDownloadHistoryAfterResult,
      persistPendingSlotDownloadHistory,
      countDownloadedForRelease,
      hydrateFromDb,
      clearServerAndLocal,
      clearLocalMaps,
    };
  }

  hroot.internals = hroot.internals || {};
  hroot.internals.bootstrapHydratePersist = bootstrapHydratePersist;
})();
