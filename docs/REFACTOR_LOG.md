# Qobuz-DL-GUI Refactor Log

## Checkpoint 1 - Config Paths And Defaults Extraction

Date: 2026-05-13
Commit: pending

### What changed

- Confirmed the branch already contains shared config path/default modules and the first backend route/service extractions.
- Added endpoint shape tests for the current Flask routes used by the GUI.
- Added a sanitized smoke-test template under `docs/`.
- Runtime behavior should be unchanged.

### Validation

- `python -m unittest discover -s tests` passed before endpoint-shape tests were added.
- `python -m unittest discover -s tests` passed after endpoint-shape tests were added.
- `python -m py_compile tests/test_gui_route_shapes.py` passed.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- Current config file format was preserved.
- Password/token storage behavior was not changed.
- Endpoint paths were not renamed.
- No UI behavior or copy was changed.
- `python -m unittest discover` did not discover the existing tests; use `python -m unittest discover -s tests`.
- Earlier accidental overwrites of tracked route/service files were restored to the branch versions before continuing.

## Checkpoint 2 - Browse Folder Utility Route Move

Date: 2026-05-13
Commit: pending

### What changed

- Moved `/api/browse_folder` from `qobuz_dl/gui_app.py` into `qobuz_dl/routes/utility_routes.py`.
- Preserved the existing endpoint path, method, response shape, and tkinter folder picker behavior.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/gui_app.py qobuz_dl/routes/utility_routes.py tests/test_gui_route_shapes.py` passed.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- No endpoint response shapes were changed.
- No UI behavior or copy was changed.
- No download semantics were changed.

## Checkpoint 3 - Search And Resolve Route Move

Date: 2026-05-13
Commit: pending

### What changed

- Added `qobuz_dl/routes/search_routes.py`.
- Moved `/api/resolve`, `/api/search`, and `/api/search_tracks_attach` out of `qobuz_dl/gui_app.py`.
- Kept replacement/download execution routes in `qobuz_dl/gui_app.py`.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/gui_app.py qobuz_dl/routes/search_routes.py` passed.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- Endpoint paths and response shapes were preserved.
- No UI behavior or copy was changed.
- No download semantics were changed.

## Checkpoint 4 - Replacement Route Move

Date: 2026-05-13
Commit: pending

### What changed

- Added `qobuz_dl/routes/replacement_routes.py`.
- Moved `/api/download_attach_track`, `/api/write_missing_track_placeholder`, and `/api/delete_track_resolution_file` out of `qobuz_dl/gui_app.py`.
- Kept the existing downloader methods and replacement workflow behavior unchanged.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/gui_app.py qobuz_dl/routes/replacement_routes.py` passed.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- Endpoint paths and response shapes were preserved.
- No UI behavior or copy was changed.
- No `qobuz_dl/downloader.py` internals were changed.

## Checkpoint 5 - Discography Check Route Move

Date: 2026-05-13
Commit: pending

### What changed

- Moved `/api/check_discography` from `qobuz_dl/gui_app.py` into `qobuz_dl/routes/search_routes.py`.
- Kept the existing artist discography count response shape unchanged.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/gui_app.py qobuz_dl/routes/search_routes.py` passed.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- Endpoint paths and response shapes were preserved.
- No UI behavior or copy was changed.
- No download semantics were changed.

## Checkpoint 6 - Download Control Route Move

Date: 2026-05-13
Commit: pending

### What changed

- Added `qobuz_dl/routes/download_routes.py`.
- Moved `/api/download`, `/api/cancel`, `/api/pause`, and `/api/lucky` out of `qobuz_dl/gui_app.py`.
- Passed download state, events, config helpers, and URL context hooks into the route module explicitly.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/gui_app.py qobuz_dl/routes/download_routes.py` passed.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- Endpoint paths and response shapes were preserved.
- No UI behavior or copy was changed.
- No `qobuz_dl/downloader.py` internals were changed.

## Checkpoint 7 - Auth Route Move

Date: 2026-05-13
Commit: pending

### What changed

- Added `qobuz_dl/routes/auth_routes.py`.
- Moved `/api/setup`, `/api/connect`, `/api/oauth/start`, and `/api/token_login` out of `qobuz_dl/gui_app.py`.
- Kept `qobuz_dl/gui_app.py` as the global Flask app and desktop startup module.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/gui_app.py qobuz_dl/routes/auth_routes.py` passed.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- Endpoint paths and response shapes were preserved.
- No UI behavior or copy was changed.
- Password/token storage behavior was not intentionally changed.

## Checkpoint 8 - Frontend API Client Adapter

Date: 2026-05-13
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/api/client.js` as the first ordered vanilla JavaScript module.
- Loaded the API client before `qobuz_dl/gui/app.js` without introducing build tooling.
- Routed two `/api/status` reads through the shared API adapter while preserving fallback behavior.

### Validation

- `python -m unittest discover -s tests` passed.
- Cursor diagnostics reported no linter errors for the changed frontend files.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- No UI behavior or copy was changed.
- No frontend build tooling was introduced.
- The large `app.js` IIFE remains in place while adapter modules are introduced incrementally.

## Checkpoint 9 - History Service Boundary

Date: 2026-05-13
Commit: pending

### What changed

- Added conservative dataclasses in `qobuz_dl/domain/models.py`.
- Added `qobuz_dl/persistence/history_repo.py` as a thin repository wrapper over existing DB functions.
- Added `qobuz_dl/services/history_service.py` and routed history endpoints through it.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/domain/models.py qobuz_dl/persistence/history_repo.py qobuz_dl/services/history_service.py qobuz_dl/routes/history_routes.py` passed.
- Cursor diagnostics reported no linter errors for changed history/domain files.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- SQL behavior remains in `qobuz_dl/db.py` for this checkpoint.
- No endpoint response shapes were changed.
- No UI behavior or copy was changed.

## Checkpoint 10 - Lyrics Package Compatibility Split

Date: 2026-05-13
Commit: pending

### What changed

- Converted `qobuz_dl/lyrics.py` into the package `qobuz_dl/lyrics/__init__.py`.
- Added thin compatibility submodules for `lrclib_client`, `matcher`, `classifier`, `attach`, and `preview`.
- Preserved existing `from qobuz_dl import lyrics` and `qobuz_dl.lyrics.<function>` imports.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/lyrics/__init__.py qobuz_dl/lyrics/lrclib_client.py qobuz_dl/lyrics/matcher.py qobuz_dl/lyrics/classifier.py qobuz_dl/lyrics/attach.py qobuz_dl/lyrics/preview.py` passed.
- Cursor diagnostics reported no linter errors for `qobuz_dl/lyrics`.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- This checkpoint is primarily mechanical package movement plus compatibility adapters.
- No lyric matching or attachment behavior was intentionally changed.
- No endpoint response shapes or UI behavior were changed.

## Checkpoint 11 - Placeholder Helper Extraction

Date: 2026-05-13
Commit: pending

### What changed

- Added `qobuz_dl/download/placeholders.py`.
- Moved missing-placeholder formatting and Qobuz storefront URL helpers out of `qobuz_dl/downloader.py`.
- Imported the helpers back under the existing private names so downloader call sites remain unchanged.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/downloader.py qobuz_dl/download/placeholders.py` passed.
- Cursor diagnostics reported no linter errors for changed downloader/download files.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- No download semantics were changed.
- Placeholder file content and URL formatting should be unchanged.
- No endpoint response shapes or UI behavior were changed.

## Checkpoint 12 - Typed Download Event Models

Date: 2026-05-13
Commit: pending

### What changed

- Added `qobuz_dl/download/events.py` with typed event dataclasses for track start, track finish, lyrics resolution, and URL finish.
- Added tests documenting that release slot identity, local artifact identity, and URL outcome remain separate.
- Kept existing string marker parsing and frontend SSE behavior unchanged.

### Validation

- `python -m unittest discover -s tests` passed.
- `python -m py_compile qobuz_dl/download/events.py tests/test_download_events.py` passed.
- Cursor diagnostics reported no linter errors for changed event model files.
- `python -m flake8 <changed files>` could not run because `flake8` is not installed in the current Python environment.

### Notes

- No download semantics were changed.
- Existing `[TRACK_START]`, `[TRACK_RESULT]`, and `[TRACK_LYRICS]` markers remain in place.
- No endpoint response shapes or UI behavior were changed.

## Checkpoint 13 - Frontend Phase 0 Contracts And Smoke Docs

Date: 2026-05-13
Commit: pending

### What changed

- Added `docs/FRONTEND_CONTRACT.md` (script order, namespace, compatibility globals, DOM id rules, API rules).
- Added `docs/FRONTEND_SMOKE_TESTS.md` (manual flows from launch through feedback and UI utilities; visual baseline list).
- No runtime or Python code changes.

### Validation

- `python -m unittest discover -s tests` passed.
- Visual baselines (screenshots/recordings) are documented as a manual Phase 0 step; capture before large `app.js` moves.

### Notes

- Do not edit the standalone plan file in `.cursor/plans/`; this log is the repo source of truth for checkpoints.

---

## Frontend refactor log entries (template)

Use this block for each **frontend** checkpoint after Phase 0. Append a new dated section below.

### Frontend checkpoint - &lt;short title&gt;

Date: YYYY-MM-DD
Commit: pending

#### What changed

- Files added/moved and `QobuzGui.*` namespace entries.
- `index.html` script tag order changes (if any).
- `app.js` line shrinkage or wrapper-only delegations.
- Compatibility globals preserved: `_handleDlStatus`, `_qUrlForPurchaseSlot`, `_updateQueueBadge`, `_handleDrop`, `_handleDropText`, `isDownloading`.

#### Validation

- `node --check` on each changed `.js` file.
- `python -m unittest discover -s tests` passed.
- Smoke flows from `docs/FRONTEND_SMOKE_TESTS.md` (list which sections were run or "not run").

#### Notes

- Confirm no DOM id renames, no endpoint path changes, no copy changes for refactor-only work.

## Checkpoint 14 - Frontend Core Modules

Date: 2026-05-13
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/core/{namespace,constants,trackIdentity,format,dom,icons}.js` and wired them in `index.html` before `app.js`.
- `app.js` delegates `_normalizeTrackNo`, scroll/format/esc helpers, SVG constants, and virtual-list constants to `QobuzGui.core.*`.

### Validation

- `node --check` on changed JS files.
- `python -m unittest discover -s tests` passed.
- Desktop smoke: not run (CI-only validation).

### Notes

- Compatibility globals unchanged.

## Checkpoint 15 - Frontend Leaf UI Modules

Date: 2026-05-13
Commit: pending

### What changed

- Added `js/ui/{globalTooltip,textFieldContextMenu,donationPopover,collapses,resetButtons}.js` and `js/features/formatBuilder/formatTooltips.js`.
- `app.js` delegates `DOMContentLoaded` UI init and `init()` collapse/reset wiring to `QobuzGui.ui.*` / `QobuzGui.features.formatBuilder.formatTooltips`.

### Validation

- `node --check` on all GUI JS.
- `python -m unittest discover -s tests` passed.

## Checkpoint 16 - Frontend API Extensions

Date: 2026-05-13
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/api/extensions.js` with grouped wrappers (`statusApi`, `configApi`, `searchApi`, `queueApi`, `downloadApi`, `historyApi`, `lyricsApi`, `replacementApi`, `updateApi`, `feedbackApi`, `utilityApi`, `setupApi`, `sessionLogsApi`).
- Migrated in-app `/api/*` `fetch` usage to wrappers; external `FEEDBACK_ENDPOINT` calls unchanged.

### Validation

- `node --check`; `python -m unittest discover -s tests` passed.

## Checkpoint 17 - Update Banner Module And Feature Adapters

Date: 2026-05-13
Commit: pending

### What changed

- Added `js/features/settings/updateBanner.js` (`QobuzGui.features.updateBanner`).
- `initDownload` registers `QobuzGui.features.queue` and `QobuzGui.features.history` thin APIs (plan adapter-first step).

### Validation

- `node --check`; `python -m unittest discover -s tests` passed.

### Notes

- Further extraction of settings form, feedback subsystem, search/queue internals, history virtualization, lyrics UI, download SSE shell, and final `main.js` bootstrap can proceed in follow-up checkpoints; monolith size is reduced and contracts documented.

## Checkpoint 18 - Feedback Message Helpers And Lyric Output Settings

Date: 2026-05-14
Commit: pending

### What changed

- Added `js/ui/feedbackMessage.js`: `QobuzGui.ui.feedbackMessage.show`, `showButton` (timers/colors unchanged).
- Added `js/features/lyrics/lyricOutputSettings.js`: lyric toggle sync and popover bind (`setChecks`, `readChecks`, `syncFromDownload`, `persist`, `bindPopoverToggles`).
- Removed duplicate helpers from `app.js`; callers use `_lyricOut()` or `QobuzGui.ui.feedbackMessage`.

### Validation

- `node --check` on new JS files and `app.js`; `python -m unittest discover -s tests` passed.
### Notes

- `index.html`: load `lyricOutputSettings.js` and `feedbackMessage.js` before `app.js`; bump cache `app.js?v=73`.

## Checkpoint 19 - Issue Report / Settings Popover Subsystem

Date: 2026-05-14
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/feedback/issueReportSubsystem.js`: settings gear popover, Send Feedback flow, history hydration, logs modal preview, resize handle; attaches `QobuzGui.features.feedback.issueReport.init(checkStatus)` (delegated from `initSettings()` in `app.js` so status checks stay identical).
- Left OAuth re-auth, “check updates”, purge DB handlers in `app.js`; they reuse `#settings-popover-feedback` (`const feedback`) after the delegated init.

### Validation

- `node --check` on `issueReportSubsystem.js` and `app.js`; `python -m unittest discover -s tests` passed.


## Checkpoint 20 - Queue façade (queueController)

Date: 2026-05-14
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/queue/queueController.js`: `QobuzGui.features.queue` exists before search loads; stubs until **`features.queue.install(impl)`** at end of `app.js` `initDownload()` (same closures as the former literal).
- **`index.html`:** script after `downloadOptionsAutosave.js`, before search; **`app.js?v=76`**.

### Validation

- `node --check`; `python -m unittest discover -s tests`.

### Notes

- `window._handleDrop` / `_handleDropText` stay the HTML entry points; `impl` repeats those references on the façade for callers.

## Checkpoint 21 - Queue internals (`queueInternals.js`)

Date: 2026-05-14  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/queue/queueInternals.js`: URL queue array, text/card mode, persist/restore, resolve + cards, drag handlers (`window._handleDrop*`). **`features.queue.internals.bootstrap(deps)`** returns the host (`urlQueue`, `textMode`, `initUrlQueue`, `restoreFromServer`, `countHistoryDownloadedForRelease`, progress helpers used by the download tab).
- **`app.js`**: removed inlined block; **`initDownload()`** calls `bootstrap({ getTrackStatusMap, guiPendingAudioPrefix, syncSearchQueuedHighlights })`; download/SSE/purchase paths use **`_queueHost.*`**; **`features.history.countDownloadedForRelease`** delegates to **`_queueHost.countHistoryDownloadedForRelease`**.
- **`index.html`:** load `queueInternals.js` immediately after **`queueController.js`**; **`app.js?v=77`**.

### Validation

- `node --check` on `queueInternals.js` and `app.js`; `python -m unittest discover -s tests` passed.

### Notes

- `tools/_patch_app_queue_internals.py` and `tools/_gen_queue_internals.py` document the splice for future peels (e.g. download runtime only).

## Checkpoint H1 - History façade (`historyController.js`)

Date: 2026-05-14  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/history/historyController.js`: **`QobuzGui.features.history`** with **`install(impl)`** plus forwards (`countDownloadedForRelease`, `applyFilter`, `ensureTrackCard`, `setDownloadChip`, `setLyricsChip`). Safe defaults when **`install`** has not run.
- **`app.js`:** removed inline `features.history = { countDownloadedForRelease, applyFilter }`; **guarded** **`QG.features.history.install({...})`** after `_queueHost` bootstrap — `countDownloadedForRelease`: `(rid) => (_queueHost ? _queueHost.countHistoryDownloadedForRelease(rid) : 0)`; other fields point at existing `_ensureTrackStatusCard`, `_setTrackDownloadChip`, `_setTrackLyricsChip`, `_tsApplyHistoryFilter`.
- **`index.html`:** `historyController.js` after **`queueInternals.js`**, before search; **`app.js?v=78`**.

### Validation

- `node --check` on `historyController.js` and `app.js`; `python -m unittest discover -s tests`.

### Notes

- **Transitional:** per-release download count still flows through **`_queueHost.countHistoryDownloadedForRelease`** until history truly owns `_tsDbItemByKey` semantics (planned **H6**). Documented in **`FRONTEND_CONTRACT.md`**.
- H1 is **seam + contract** only; internal call sites still use `_ensureTrackStatusCard` etc. until a later **H2** migration.

## Checkpoint H2 - Internal call sites via `features.history`

Date: 2026-05-14  
Commit: pending

### What changed

- **`app.js`:** added **`_hist()`** → `QG.features.history`. Migrated external call sites to **`_hist().applyFilter()`**, **`ensureTrackCard`**, **`setDownloadChip`**, **`setLyricsChip`** (history tabs, hydrate/mount, SSE `track_*` handlers, lyric attach, persist helper).
- **Left direct** `_ensureTrackStatusCard` / `_setTrackDownloadChip` / `_setTrackLyricsChip` / `_tsApplyHistoryFilter` as **implementations** wired into **`history.install`**; impl bodies still call each other directly (no facade loop inside chip/card helpers).

### Validation

- `node --check` on `app.js`; `python -m unittest discover -s tests` passed.

### Notes

- **`countDownloadedForRelease`** still transitional via queue host (unchanged; **H6**).
- Next: **H3** track status card rendering extraction.

## Checkpoint H3 - Track status card rendering (`historyCardRendering.js`)

Date: 2026-05-18  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/history/historyCardRendering.js`: **`bootstrapCardRendering(deps)`** owns card shell DOM, cover art, download chip, lyrics chip + confidence tooltip, substitute-search tag buttons, and lyric-destination helpers.
- **`app.js`:** removed ~680 lines of inline card/chip rendering; **`initDownload()`** calls card bootstrap after queue bootstrap (virt scroller + filter + attach-track callbacks injected via **`deps`**). Thin **`_ensureTrackStatusCard` / `_setTrack*Chip` / `_normalizeLyricDestination`** delegates remain for hydrate/SSE/persist paths and **`history.install`** wiring.
- **`index.html`:** `historyCardRendering.js` after `historyController.js`; **`app.js?v=82`**.

### Validation

- `node --check` on `historyCardRendering.js` and `app.js`; `python -m unittest discover -s tests` passed.

### Notes

- Attach-track popover/search UI stays in **`app.js`** (lyrics/replacement milestone); card module only receives **`writeAttachMissingPlaceholder`**, **`openAttachTrackPopover`**, **`syncResolutionButtonStates`** via deps.
- Next: **H4** history filters / Errors tab extraction.

## Checkpoint H4 - History filters / Errors tab (`historyFilters.js`)

Date: 2026-05-18  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/history/historyFilters.js`: **`bootstrapFilters(deps)`** owns All/Errors tab wiring, error stem classification (unsettled parallel downloads / lyric loading), virt + non-virt filter apply, and error count badge.
- **`app.js`:** removed inline filter/error helpers (~175 lines); **`initDownload()`** bootstraps filters before card bootstrap; thin **`_tsApplyHistoryFilter` / `_initDownloadHistorySegment`** delegates remain for **`history.install`** and hydrate/SSE paths.
- **`index.html`:** `historyFilters.js` after `historyController.js`; **`app.js?v=84`**.

### Validation

- `node --check` on `historyFilters.js` and `app.js`; `python -m unittest discover -s tests` passed.

### Notes

- Filter tab clicks call module-local **`applyFilter`** directly (avoids façade loop during init).
- Next: **H5** virtualization extraction.

## Checkpoint H5 - History virtualization (`historyVirtualization.js`)

Date: 2026-05-18  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/history/historyVirtualization.js`: **`bootstrapVirtualization(deps)`** owns virt inner container, scroll/resize listeners, row-height measurement, windowed render/evict, lyric-search anchor pinning, and initial render pass.
- **`app.js`:** removed inline virt scroller state/helpers (~140 lines); **`initDownload()`** bootstraps virt before filters/cards; hydrate/reset/SSE paths use **`_historyVirtHost`**; **`_tsMountDbItemAtIndex`** remains in **`app.js`** (card build + DB apply) and is passed as a dep callback.
- **`index.html`:** `historyVirtualization.js` after `historyController.js`; **`app.js?v=85`**.

### Validation

- `node --check` on `historyVirtualization.js` and `app.js`; `python -m unittest discover -s tests`.

### Notes

- **`_tsRebuildKeyIndex`** stays in **`app.js`** (shared by filters + virt).
- Next: **H6** hydrate/persist extraction; history owns **`_tsDbItemByKey`** semantics.

## Checkpoint H6 - History hydrate/persist (`historyHydratePersist.js`)

Date: 2026-05-18  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/history/historyHydratePersist.js`: **`bootstrapHydratePersist(deps)`** owns in-memory row store (`dbItemByKey`), `audio_path → lyric_album` index, DB hydrate/clear, download-result persist, lyric snap updates, and **`countDownloadedForRelease`**.
- **`app.js`:** removed inline hydrate/persist/apply-db-item helpers (~400 lines); **`_historyStoreHost`** wired after card bootstrap; queue **`getTrackStatusMap`** and history **`install`** use the store host; thin delegates remain for mount path and SSE orchestration.
- **`index.html`:** `historyHydratePersist.js` after virtualization; **`app.js?v=86`**.

### Validation

- `node --check` on `historyHydratePersist.js` and `app.js`; `python -m unittest discover -s tests`.

### Notes

- Queue internals still scan history rows via **`getTrackStatusMap`** dep (same map reference); only the public façade count moved off **`_queueHost.countHistoryDownloadedForRelease`**.

### H6 smoke (manual)

Run after history / download changes:

- History hydrate after restart
- All / Errors tabs; scroll-to-bottom on tab switch (newest at bottom)
- Error badge count accuracy
- Large-history virtualization (threshold 72+): scroll, pins, Errors tab
- Active download row stays pinned while scrolling
- Purchase-only row persists in history
- Replacement / missing-placeholder controls visible on eligible rows
- Lyrics chip updates after `track_lyrics` SSE
- Clear history confirm
- Album queue remaining count after hydrate

## Checkpoint R1–R3 — Replacements (`features/replacements/`)

Date: 2026-05-18  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/replacements/replacementController.js`: **`QobuzGui.features.replacements`** with **`install(impl)`** plus forwards (`openAttachPopover`, `closeAttachPopover`, `writeMissingPlaceholder`, `syncResolutionButtonStates`).
- Added `attachTrackPopover.js`, `resolutionButtons.js`, `missingPlaceholder.js` with **`internals.bootstrap*`**; **`app.js` `initDownload()`** bootstraps attach → resolution → missing-placeholder **before** `bootstrapCardRendering`; **`features.replacements.install`** after **`features.history.install`**.
- Replacement HTTP calls use existing **`QobuzGui.api.replacementApi`** in `extensions.js` (no new API file). Missing-placeholder host uses **`getAttachAnchorCard` / `getAttachStatusElementForCard`** from attach host only.
- **`index.html`:** four replacement scripts after `historyCardRendering.js`; **`app.js?v=87`**.

### Validation

- `node --check` on replacement scripts and `app.js`; `python -m unittest discover -s tests`.

### Notes

- Lyric-modal positioning / anchor helpers were in **`app.js`** until lyrics L2 (now **`features.lyrics.internals`** + **`ui.popoverPositioning`**).

## Checkpoint L1 — Lyrics preview player extraction

Date: 2026-05-19  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/lyrics/lrcPreviewParser.js`: assigns **`features.lyrics.internals.parseLrcLinesForPreview`** (pure timed LRC rows).
- Added `qobuz_dl/gui/js/features/lyrics/lyricPreviewPlayer.js`: **`features.lyrics.preview`** with **`init` / `close` / `teardown`**, body render helpers, **`previewAudioUrl`**, and **`parseLrcLines`** forwarder. **`close`** runs **`deps.onOverlayClosed`** after teardown and hiding **`#lyric-search-preview-panel`**; **`init`** merges deps on each call while DOM listeners attach once (**`dataset.bound`**).
- **`app.js`** drops inline preview playback; wires **`preview.init({ onOverlayClosed })`**, **`preview.close`** on dismiss/search-clear paths, **`preview.teardown`** when switching previews in **`_previewLyricRow`**.
- **`index.html`**: scripts after **`lyricOutputSettings.js`**; **`app.js?v=89`**.

### Validation

- `node --check` on new lyric scripts + **`app.js`**; **`python -m unittest discover -s tests`**.

### Notes

- Lyric search modal, **`_previewLyricRow`** fetch/logic, and **`_attachLyricRow`** remain in **`app.js`** until L2.

## Checkpoint L2 — Lyric search modal extraction

Date: 2026-05-19  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/ui/popoverPositioning.js`: **`ui.popoverPositioning.positionAboveDownloadHistory`** (shared by lyric search + attach-track).
- Added `lyricSearchController.js`: **`features.lyrics.search`** façade with **`install` / `init` / `openForCard` / `close` / `closePreview`** (no-op until modal **`install`**).
- Added `lyricSearchResults.js`: ctx + callbacks results renderer (paging, scroll, loading skeleton; no modal globals).
- Added `lyricAttach.js`: preview-row fetch + attach to file.
- Added `lyricSearchModal.js`: modal lifecycle, search form, history chip open, **`search.install(realModalHost)`**; exposes anchor/title/loading on **`features.lyrics.internals`** for attach-track bootstrap.
- **`app.js`**: removed ~950-line lyric modal block; **`search.init({ closeAttachPopover, setLyricsChip, lyricDestinationFromOutputs })`**; clear history calls **`search.close()`**; attach bootstrap uses **`search.close`**, **`ui.popoverPositioning`**, **`lyrics.internals`**.
- **`index.html`**: L2 lyric scripts + **`popoverPositioning.js`**; **`app.js?v=90`**.

### Validation

- `node --check` on all changed JS + **`app.js`**; **`python -m unittest discover -s tests`**.

### Notes

- Download runtime / SSE (**D1**) remains in **`app.js`** (D1A façade only; see Checkpoint D1A).

## Checkpoint D1A — Download façade (`downloadController.js`)

Date: 2026-05-19  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/download/downloadController.js`: **`QobuzGui.features.download`** with **`install(impl)`** plus safe no-op forwards (`init`, `startSSE`, `handleStatusEvent`, `startFromCurrentQueue`, `pause`, `isDownloading`, `qUrlForPurchaseSlot`). **`pause()`** returns **`Promise.resolve(null)`** when uninstalled or API missing.
- **`app.js`**: **`_dl()`** helper; guarded **`features.download.install({...})`** at end of **`initDownload()`** forwarding to current inline closures (unchanged behavior).
- **`index.html`**: **`downloadController.js`** after **`queueController.js`**, before **`queueInternals.js`**; **`app.js?v=91`**.

### Validation

- `node --check` on **`downloadController.js`** + **`app.js`**; **`python -m unittest discover -s tests`**.

### Notes

- **D1A intentionally does not migrate any callers yet.** `startSSE()`, `window._handleDlStatus`, and the download button handler remain owned by **`app.js`** until D1D–D1F. Only the plug socket exists. (**`window._qUrlForPurchaseSlot`** moved to D1C — see Checkpoint D1C.)
- Next: **D1B** progress/button state (see Checkpoint D1B); then D1C purchase-only queue issues (see Checkpoint D1C).

## Checkpoint D1B — Download progress + button state (`downloadProgress.js`)

Date: 2026-05-19  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/download/downloadProgress.js`: **`QobuzGui.features.download.internals.bootstrapProgress(deps)`** owns URL/track counters, progress bar DOM, Start/Pause button chrome, and **`window.isDownloading`**. Exposes `resetForStart`, `onTotalTracks`, `recordTrackFinished`, `onUrlDone`, `onUrlError`, `updateProgress`, `setDownloadingState`, `finalizeOnDlComplete`, `isDownloading`.
- **`app.js`**: **`_downloadProgressHost`** + **`_dlProgress()`**; bootstrap after queue host in **`initDownload()`**; removed inline progress counter + **`_updateProgress`/`_setDownloadingState`** block; SSE handler + dl-btn start/pause call **`_dlProgress()`**; **`features.download.install`** **`isDownloading`** delegates to progress host when present.
- **`index.html`**: **`downloadProgress.js`** after **`downloadController.js`**; **`app.js?v=96`**.

### Validation

- `node --check` on **`downloadProgress.js`** + **`app.js`**; **`python -m unittest discover -s tests`**.

### Notes

- Module file existed from an earlier pass but was not wired into **`app.js`** / **`index.html`** until this checkpoint completion.
- **Still in `app.js` (D1D+):** full **`window._handleDlStatus`** body, **`#dl-btn`** handler, **`startSSE`**, **`_sse`**.

## Checkpoint D1C — Queue purchase-only badges (`queueIssueBadges.js`)

Date: 2026-05-19  
Commit: pending

### What changed

- Added `qobuz_dl/gui/js/features/download/queueIssueBadges.js`: **`QobuzGui.features.download.internals.bootstrapQueueIssueBadges(deps)`** owns purchase-only key map, queue card badges/tips, URL error badges, and **`window._qUrlForPurchaseSlot`**. Exposes `tips`, `findCardByUrl`, `purchaseIssueSlotKey`, `qUrlForPurchaseSlot`, `syncPurchaseIssues`, `markPurchaseOnly`, `resolvePurchaseOnly`, `clearPurchaseIssues`, `applyUrlErrorBadge`.
- **`app.js`**: **`_downloadQueueIssuesHost`** + **`_dlQueueIssues()`**; bootstrap after queue host; removed inline purchase-only map, **`_findCardByUrl`**, **`_syncQueueCardPurchaseIssues`**, tip constants, and url_error badge DOM; SSE handler + dl-btn start call **`_dlQueueIssues()`**; **`features.download.install`** **`qUrlForPurchaseSlot`** delegates to queue-issues host when present.
- **`index.html`**: **`queueIssueBadges.js`** after **`downloadController.js`**; **`app.js?v=95`**.

### Validation

- `node --check` on **`queueIssueBadges.js`** + **`app.js`**; **`python -m unittest discover -s tests`**.

### Notes

- **Still in `app.js` (D1D+):** full **`window._handleDlStatus`** body (now thinner but still inline), **`#dl-btn`** handler, **`startSSE`**, **`_sse`**.
- Next: **D1D** SSE status handler extraction; D1E start/pause click flow; D1F EventSource ownership.

## Deferred architecture (yellow flags, post–checkpoint 20)

These items are **intentionally not done** yet; captured so we do not mistake interim layout for finished structure.

### Roadmap state (2026)

```text
Done: queue internals, history H1–H6, replacements R1–R3, lyrics L1–L2, download D1A (façade plug socket), download D1B (progress/button state), download D1C (queue purchase-only badges)
Next: download D1D (SSE status handler), then D1E–D1F
Optional later: feedback subsystem split, script-order cleanup
```

### `issueReportSubsystem.js` (~880 lines)

- Moving the feedback workflow out of `app.js` was the win for that checkpoint; the file is a **contained mini-monolith**, not final layering.
- **Later split target** under `features/feedback/` (non-goal until scheduled):  
  `feedbackStore.js`, `feedbackApi.js`, `feedbackHistory.js`, `feedbackLogsModal.js`, `feedbackDetailModal.js`, `feedbackSubmit.js`, `feedbackPopover.js`.

### Naming / ownership

- The same module also wires the **settings gear popover** (open/close with backdrop). That is workable but mildly misleading versus the filename **“issue report”**.
- Eventually either: **`settingsPopover.js`** owns gear/settings chrome while feedback owns issue-report chrome only, **or** rename to something broader (e.g. `settingsFeedbackSubsystem.js`).

### Script load order

- Today **`updateBanner.js` runs before `core/namespace.js`**; it only needs `window.QobuzGui` from `client.js`, so behaviour is OK.
- **Stylistically preferred eventual order**: `api/client.js` → `core/namespace.js` → `core/*` → `api/extensions.js` → `ui/*` → `features/*` → `app.js`. Only reshuffle when deliberately testing script order (not a drive-by refactor).

**Frontend migration (~85%+):** History H1–H6, **replacements R1–R3**, **lyrics L1–L2**, and **download D1A–D1C** are landed. **`app.js`** still owns SSE handler and dl-btn click flow until D1D–D1F. Next controlled step: **D1D** (SSE status handler body).


