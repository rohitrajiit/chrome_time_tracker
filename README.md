# Daily Website Time Tracker

A Manifest V3 Google Chrome extension that tracks daily time spent on websites.

Daily totals start at **5:00 AM local time** and end at 4:59:59 AM the next day. If a browsing session crosses 5:00 AM, the extension splits the time into the correct tracker day.

## Install locally

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `/Users/rohitraj/codex-gui/time tracker`.

## What it tracks

- Active `http` and `https` tabs only.
- Time while Chrome reports you as active.
- Per-domain totals, normalized by removing a leading `www.`.

It does not track Chrome internal pages, extension pages, files, or time while Chrome is idle or locked.

## Files

- `manifest.json`: Chrome extension metadata and permissions.
- `background.js`: Tracking, 5:00 AM day-boundary logic, storage, and badge updates.
- `popup.html`, `popup.css`, `popup.js`: Current day dashboard.
- `options.html`, `options.css`, `options.js`: Stored-data summary and reset-all action.
