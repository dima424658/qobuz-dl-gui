/**
 * SSE download status event handler (D1D).
 *
 * Invoked once from `app.js` `initDownload()` via `bootstrapStatusHandler(deps)`.
 * Sets `window._handleDlStatus` for backward compatibility.
 */
(function () {
  "use strict";
  const g = window.QobuzGui;
  const dlroot = (g.features.download = g.features.download || {});

  function bootstrapStatusHandler(deps) {
    function progress() {
      return typeof deps.getProgress === "function" ? deps.getProgress() : null;
    }

    function queueIssues() {
      return typeof deps.getQueueIssues === "function"
        ? deps.getQueueIssues()
        : null;
    }

    function history() {
      return typeof deps.history === "function" ? deps.history() : null;
    }

    function historyStore() {
      return typeof deps.getHistoryStore === "function"
        ? deps.getHistoryStore()
        : null;
    }

    function handleStatus(ev) {
      const prog = progress();
      const issues = queueIssues();
      const hist = history();
      const store = historyStore();

      if (ev.type === "total_tracks") {
        prog?.onTotalTracks(ev.count);
      } else if (ev.type === "url_start") {
        const card = issues?.findCardByUrl(ev.url);
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
          const parsed = deps.parseTrackRef("", ev.title || "");
          trackNo = parsed.trackNo;
          title = parsed.title;
        }
        const evAlb =
          ev.lyric_album != null && String(ev.lyric_album).trim() !== ""
            ? String(ev.lyric_album).trim()
            : "";
        const tcard = hist?.ensureTrackCard(
          trackNo,
          title,
          true,
          coverUrl,
          evAlb,
        );
        if (tcard) {
          if (ev.lyric_artist != null && String(ev.lyric_artist).trim() !== "") {
            tcard.dataset.lyricArtist = String(ev.lyric_artist).trim();
          }
          if (evAlb) tcard.dataset.lyricAlbum = evAlb;
          if (ev.duration_sec != null && String(ev.duration_sec).trim() !== "") {
            const ds = parseInt(String(ev.duration_sec), 10);
            if (!Number.isNaN(ds)) tcard.dataset.durationSec = String(ds);
          }
          if (typeof ev.track_explicit === "boolean") {
            tcard.dataset.trackExplicit = ev.track_explicit ? "1" : "0";
            deps.setTrackContentRatingBadge(tcard, ev.track_explicit);
          }
          if (tcard.dataset.trackKey) deps.addActiveDlKey(tcard.dataset.trackKey);
          if (store) {
            store.storeDbItemFromTrackStart(ev, evAlb, tcard, coverUrl);
          }
          if (!deps.cardHasResolvedRealAudio(tcard)) {
            hist?.setDownloadChip(
              trackNo,
              title,
              "downloading",
              "",
              undefined,
              evAlb,
            );
          }
        }
        prog?.updateProgress();
        deps.historyVirtOnScroll();
      } else if (ev.type === "track_download_progress") {
        const pa =
          ev.lyric_album != null && String(ev.lyric_album).trim() !== ""
            ? String(ev.lyric_album).trim()
            : "";
        deps.updateTrackDownloadProgress(
          ev.track_no,
          ev.title,
          ev.received,
          ev.total,
          pa,
        );
      } else if (ev.type === "track_result") {
        const resAlb = deps.lyricAlbumForTrackEv(ev);
        const qurl = String(ev.source_url || "").trim();
        const slotProgKey = deps.trackKey(ev.track_no, ev.title, resAlb);
        prog?.recordTrackFinished(slotProgKey);
        const st = String(ev.status || "").toLowerCase();
        const isFailed = st === "failed";
        const isPurchase = st === "purchase_only";
        const detail = String(ev.detail || "").trim();
        const ap = String(ev.audio_path || "").trim();
        const sidTrim = String(ev.slot_track_id || "").trim();
        const ridTrim = String(ev.release_album_id || "").trim();
        const preCard = hist?.ensureTrackCard(
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
          deps.cardHasResolvedRealAudio(preCard);
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
          deps.registerAudioPathAlbum(ap, resAlb);
        }
        if (isPurchase && detail && !skipTerminalDowngrade) {
          hist?.setDownloadChip(
            ev.track_no,
            ev.title,
            "Album Purchase Only",
            "failed",
            {
              href: detail,
              titleAttr:
                issues?.tips?.purchaseQueue ||
                "Open album on Qobuz to purchase (full album required for these tracks)",
              slotTrackId: sidTrim,
              releaseAlbumId: ridTrim,
            },
            resAlb,
          );
        } else if (!skipTerminalDowngrade) {
          hist?.setDownloadChip(
            ev.track_no,
            ev.title,
            isFailed ? "failed" : "downloaded",
            isFailed ? "failed" : "done",
            undefined,
            resAlb,
          );
        } else {
          hist?.setDownloadChip(
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
          deps.syncResolutionButtonStates(preCard);
        }
        if (st === "downloaded" && preCard) {
          if (ev.substitute_attach === true) {
            preCard.dataset.attachSearchEligible = "1";
            const prevPlaceholderPath = (
              preCard.dataset.missingPlaceholderPath || ""
            ).trim();
            if (prevPlaceholderPath) {
              const del = deps.deleteResolutionFile;
              if (typeof del === "function") {
                del({ file_path: prevPlaceholderPath }).catch(() => {});
              }
              delete preCard.dataset.missingPlaceholderPath;
            }
            preCard.dataset.resolvedBy = "search";
            deps.syncResolutionButtonStates(preCard);
          } else if (ap.toLowerCase().endsWith(".missing.txt")) {
            preCard.dataset.attachSearchEligible = "1";
            preCard.dataset.resolvedBy = "placeholder";
            deps.syncResolutionButtonStates(preCard);
          } else {
            const rb = (preCard.dataset.resolvedBy || "").trim();
            if (rb === "search" || rb === "placeholder") {
              preCard.dataset.attachSearchEligible = "1";
              deps.syncResolutionButtonStates(preCard);
            } else {
              delete preCard.dataset.attachSearchEligible;
            }
          }
        }
        if (st === "downloaded" && ap) {
          if (store) {
            store.persistDownloadHistoryAfterResult(ev, resAlb);
          }
        } else if (
          preCard &&
          sidTrim &&
          ridTrim &&
          ((isPurchase && detail) || isFailed) &&
          !skipTerminalDowngrade
        ) {
          if (store) {
            store.persistPendingSlotDownloadHistory(ev, preCard, resAlb);
          }
        }
        if (preCard) {
          if (store) {
            store.storeDbItemFromTrackResult(ev, resAlb, preCard);
          }
          if (preCard.dataset.trackKey) {
            deps.removeActiveDlKey(preCard.dataset.trackKey);
          }
          deps.historyVirtOnScroll();
        }
        const pk = issues?.purchaseIssueSlotKey(ev, resAlb);
        if (isPurchase && qurl) {
          issues?.markPurchaseOnly(qurl, pk);
        } else if (st === "downloaded" && qurl) {
          issues?.resolvePurchaseOnly(qurl, pk);
        }
        prog?.updateProgress();
        hist?.applyFilter();
        deps.refreshAlbumQueueCardMetas();
      } else if (ev.type === "track_lyrics") {
        let albLy = "";
        const apEv = String(ev.audio_path || "").trim();
        if (store) {
          albLy = store.lyricAlbumForAudioPath(apEv);
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
        if (!albLy) albLy = deps.lyricAlbumForTrackEv(ev);
        hist?.setLyricsChip(
          ev.track_no,
          ev.title,
          ev.lyric_type || "none",
          ev.confidence,
          albLy,
          ev.provider,
          ev.lyric_destination || "",
        );
        const lk = deps.trackKey(
          deps.normalizeTrackNo(ev.track_no),
          deps.normalizeTrackTitle(ev.title || ""),
          albLy,
        );
        if (store && store.updateLyricSnapForKey(lk, ev)) {
          hist?.applyFilter();
        }
      } else if (ev.type === "url_done") {
        prog?.onUrlDone();
        const card = issues?.findCardByUrl(ev.url);
        if (card) {
          card.classList.remove("dl-active", "dl-pending");
          const qi = deps.findQueueItemByUrl(ev.url);
          const stayAlbum =
            qi != null && deps.albumQueueItemNeedsToStayVisible(qi);
          if (card.querySelector(".dl-purchase-badge") || stayAlbum) {
            card.classList.add("dl-error");
          } else {
            card.classList.add("dl-done");
            setTimeout(() => deps.removeFromQueue(ev.url, card), 1400);
          }
        }
      } else if (ev.type === "url_error") {
        prog?.onUrlError();
        const card = issues?.findCardByUrl(ev.url);
        if (card) {
          issues?.applyUrlErrorBadge(card, ev);
        }
      } else if (ev.type === "dl_complete") {
        prog?.finalizeOnDlComplete(ev);
        if (ev.cancelled || ev.paused) {
          document
            .querySelectorAll(
              "#dl-queue .queue-card.dl-active, #dl-queue .queue-card.dl-pending",
            )
            .forEach((c) => c.classList.remove("dl-active", "dl-pending"));
        }
        const dlBtn = document.getElementById("dl-btn");
        if (dlBtn) {
          dlBtn.style.opacity = "";
          dlBtn.style.cursor = "";
          dlBtn.style.pointerEvents = "";
        }
        prog?.setDownloadingState(false);
        deps.refreshAlbumQueueCardMetas();
      }
    }

    window._handleDlStatus = handleStatus;

    return { handleStatus };
  }

  dlroot.internals = dlroot.internals || {};
  dlroot.internals.bootstrapStatusHandler = bootstrapStatusHandler;
})();
