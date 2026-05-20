/**
 * Queue purchase-only badges + URL error tips (D1C).
 *
 * Invoked once from `app.js` `initDownload()` via `bootstrapQueueIssueBadges(deps)`.
 */
(function () {
  "use strict";
  const g = window.QobuzGui;
  const dlroot = (g.features.download = g.features.download || {});

  const TIPS = {
    purchaseQueue:
      "Open album on Qobuz to purchase (full album required for these tracks)",
    notStreamable:
      "This release is not available for streaming on Qobuz. It may only be sold as a full album (purchase-only or region-restricted), open it on Qobuz to check.",
    urlErrorGeneric:
      "This queue item did not finish successfully. Check the activity log for details — causes include network errors, quality restrictions, or tracks that could not be downloaded.",
  };

  function bootstrapQueueIssueBadges(deps) {
    const purchaseOnlyKeysByUrl = new Map();

    function findCardByUrl(url) {
      const cards = document.querySelectorAll("#dl-queue .queue-card");
      for (const c of cards) {
        if (c.dataset.url === url) return c;
      }
      return null;
    }

    function purchaseIssueSlotKey(ev, resAlb) {
      const sid = String(ev.slot_track_id || "").trim();
      if (sid) return `sid:${sid}`;
      const trackKey = deps.trackKey;
      if (typeof trackKey !== "function") return "";
      return trackKey(ev.track_no, ev.title, resAlb);
    }

    function qUrlForPurchaseSlot(slotId) {
      const sid = String(slotId || "").trim();
      if (!sid) return "";
      const pk = `sid:${sid}`;
      for (const [url, set] of purchaseOnlyKeysByUrl.entries()) {
        if (set.has(pk)) return url;
      }
      return "";
    }

    function syncPurchaseIssues(qurl) {
      const q = String(qurl || "").trim();
      if (!q) return;
      const card = findCardByUrl(q);
      if (!card) return;
      const info = card.querySelector(".queue-card-info");
      if (!info) return;
      const set = purchaseOnlyKeysByUrl.get(q);
      const purchaseBadge = info.querySelector(
        ".dl-error-badge.dl-purchase-badge",
      );
      const failedBadge = info.querySelector(
        ".dl-error-badge.dl-url-failed-badge",
      );
      const findQueueItem = deps.findQueueItemByUrl;
      const qiHold =
        typeof findQueueItem === "function" ? findQueueItem(q) : null;
      const stayVisible = deps.albumQueueItemNeedsToStayVisible;
      const stayAlbum =
        qiHold != null &&
        typeof stayVisible === "function" &&
        stayVisible(qiHold);

      if (!set || set.size === 0) {
        purchaseOnlyKeysByUrl.delete(q);
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
            const refresh = deps.refreshAlbumQueueCardMetas;
            if (typeof refresh === "function") refresh();
            return;
          }
          card.classList.add("dl-done");
          const remove = deps.removeFromQueue;
          if (typeof remove === "function") {
            setTimeout(() => remove(q, card), 1400);
          }
        }
        return;
      }

      let badge = purchaseBadge;
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "dl-error-badge dl-purchase-badge";
        badge.setAttribute("data-tip", TIPS.purchaseQueue);
        badge.setAttribute("aria-label", TIPS.purchaseQueue);
        badge.removeAttribute("title");
        info.appendChild(badge);
      }
      badge.textContent = `${set.size} ⚠ Purchase only`;
      badge.setAttribute("data-tip", TIPS.purchaseQueue);
      badge.setAttribute("aria-label", TIPS.purchaseQueue);
      badge.removeAttribute("title");
    }

    function markPurchaseOnly(qurl, pk) {
      const q = String(qurl || "").trim();
      const key = String(pk || "").trim();
      if (!q || !key) return;
      let pset = purchaseOnlyKeysByUrl.get(q);
      if (!pset) {
        pset = new Set();
        purchaseOnlyKeysByUrl.set(q, pset);
      }
      pset.add(key);
      const qcard = findCardByUrl(q);
      if (qcard) {
        qcard.classList.remove("dl-active", "dl-pending", "dl-done");
        qcard.classList.add("dl-error");
        syncPurchaseIssues(q);
      }
    }

    function resolvePurchaseOnly(qurl, pk) {
      const q = String(qurl || "").trim();
      const key = String(pk || "").trim();
      if (!q) return;
      const pset = purchaseOnlyKeysByUrl.get(q);
      if (pset && key && pset.delete(key) && pset.size === 0) {
        purchaseOnlyKeysByUrl.delete(q);
      }
      syncPurchaseIssues(q);
    }

    function clearPurchaseIssues() {
      purchaseOnlyKeysByUrl.clear();
    }

    function applyUrlErrorBadge(card, ev) {
      if (!card) return;
      card.classList.remove("dl-active", "dl-pending");
      card.classList.add("dl-error");
      const info = card.querySelector(".queue-card-info");
      if (!info) return;
      let badge = info.querySelector(".dl-error-badge.dl-url-failed-badge");
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "dl-error-badge dl-url-failed-badge";
        info.appendChild(badge);
      }
      const detail = String((ev && ev.detail) || "").trim();
      const isNonStream = detail === "non_streamable";
      const tip = isNonStream ? TIPS.notStreamable : TIPS.urlErrorGeneric;
      badge.textContent = isNonStream
        ? "⚠ Not streamable"
        : "⚠ Download issue";
      badge.setAttribute("data-tip", tip);
      badge.setAttribute("aria-label", tip);
      badge.removeAttribute("title");
    }

    window._qUrlForPurchaseSlot = qUrlForPurchaseSlot;

    return {
      tips: TIPS,
      findCardByUrl,
      purchaseIssueSlotKey,
      qUrlForPurchaseSlot,
      syncPurchaseIssues,
      markPurchaseOnly,
      resolvePurchaseOnly,
      clearPurchaseIssues,
      applyUrlErrorBadge,
    };
  }

  dlroot.internals = dlroot.internals || {};
  dlroot.internals.bootstrapQueueIssueBadges = bootstrapQueueIssueBadges;
})();
