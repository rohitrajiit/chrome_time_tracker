const DAY_START_HOUR = 5;
const STORAGE_KEYS = {
  data: "dailyWebsiteTimeData",
  state: "activeTrackingState"
};
const FLUSH_ALARM = "flush-active-website-time";
const BADGE_ALARM = "refresh-tracker-badge";

let queue = Promise.resolve();

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 5 });
  runExclusive(refreshActiveSite);
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.alarms.create(BADGE_ALARM, { periodInMinutes: 5 });
  runExclusive(refreshActiveSite);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) {
    runExclusive(flushAndContinue);
  }

  if (alarm.name === BADGE_ALARM) {
    runExclusive(updateBadge);
  }
});

chrome.tabs.onActivated.addListener(() => runExclusive(refreshActiveSite));
chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") {
    runExclusive(refreshActiveSite);
  }
});
chrome.windows.onFocusChanged.addListener(() => runExclusive(refreshActiveSite));
chrome.idle.onStateChanged.addListener(() => runExclusive(refreshActiveSite));
chrome.runtime.onSuspend.addListener(() => runExclusive(flushActiveState));

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "getTodayStats") {
    runExclusive(async () => {
      await flushAndContinue();
      const data = await getStoredData();
      const dayKey = getDayKey(Date.now());
      return data.days?.[dayKey] || { totalMs: 0, sites: {} };
    }).then((stats) => sendResponse({ ok: true, stats })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message?.type === "getAllStats") {
    runExclusive(async () => {
      await flushAndContinue();
      return getStoredData();
    }).then((data) => sendResponse({ ok: true, data })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message?.type === "resetToday") {
    runExclusive(resetToday).then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  if (message?.type === "resetAll") {
    runExclusive(resetAll).then(() => sendResponse({ ok: true })).catch((error) => {
      sendResponse({ ok: false, error: error.message });
    });
    return true;
  }

  return false;
});

function runExclusive(work) {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}

async function refreshActiveSite() {
  const now = Date.now();
  await flushActiveState(now);

  const site = await getTrackableActiveSite();
  if (!site) {
    await setActiveState(null);
    await updateBadge();
    return;
  }

  await setActiveState({ site, startedAt: now, lastCommittedAt: now });
  await updateBadge();
}

async function flushAndContinue() {
  const now = Date.now();
  const state = await getActiveState();
  if (!state?.site) {
    await updateBadge();
    return;
  }

  await commitSegment(state.site, state.lastCommittedAt || state.startedAt, now);
  await setActiveState({ ...state, lastCommittedAt: now });
  await updateBadge();
}

async function flushActiveState(now = Date.now()) {
  const state = await getActiveState();
  if (!state?.site) {
    return;
  }

  await commitSegment(state.site, state.lastCommittedAt || state.startedAt, now);
}

async function commitSegment(site, fromMs, toMs) {
  if (!site || !Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) {
    return;
  }

  const data = await getStoredData();
  data.days ||= {};

  for (const segment of splitByTrackerDay(fromMs, toMs)) {
    const day = data.days[segment.dayKey] || { totalMs: 0, sites: {} };
    const duration = segment.toMs - segment.fromMs;
    day.totalMs += duration;
    day.sites[site] = (day.sites[site] || 0) + duration;
    data.days[segment.dayKey] = day;
  }

  data.updatedAt = Date.now();
  await chrome.storage.local.set({ [STORAGE_KEYS.data]: data });
}

function splitByTrackerDay(fromMs, toMs) {
  const segments = [];
  let cursor = fromMs;

  while (cursor < toMs) {
    const dayKey = getDayKey(cursor);
    const boundary = getNextDayBoundary(cursor);
    const end = Math.min(toMs, boundary);
    segments.push({ dayKey, fromMs: cursor, toMs: end });
    cursor = end;
  }

  return segments;
}

function getDayKey(timestamp) {
  const date = new Date(timestamp);
  date.setHours(date.getHours() - DAY_START_HOUR, 0, 0, 0);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNextDayBoundary(timestamp) {
  const boundary = new Date(timestamp);
  boundary.setHours(DAY_START_HOUR, 0, 0, 0);

  if (timestamp >= boundary.getTime()) {
    boundary.setDate(boundary.getDate() + 1);
  }

  return boundary.getTime();
}

async function getTrackableActiveSite() {
  const idleState = await chrome.idle.queryState(60);
  if (idleState !== "active") {
    return null;
  }

  const focusedWindow = await chrome.windows.getLastFocused();
  if (!focusedWindow?.focused) {
    return null;
  }

  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!tab?.url) {
    return null;
  }

  return getSiteFromUrl(tab.url);
}

function getSiteFromUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

async function resetToday() {
  await flushActiveState();
  const data = await getStoredData();
  const dayKey = getDayKey(Date.now());
  if (data.days?.[dayKey]) {
    delete data.days[dayKey];
    data.updatedAt = Date.now();
    await chrome.storage.local.set({ [STORAGE_KEYS.data]: data });
  }
  await refreshActiveSite();
}

async function resetAll() {
  await chrome.storage.local.set({
    [STORAGE_KEYS.data]: { days: {}, updatedAt: Date.now() },
    [STORAGE_KEYS.state]: null
  });
  await refreshActiveSite();
}

async function updateBadge() {
  const data = await getStoredData();
  const today = data.days?.[getDayKey(Date.now())];
  const totalMs = today?.totalMs || 0;
  const hours = totalMs / 3600000;
  const text = hours >= 10 ? `${Math.floor(hours)}h` : `${hours.toFixed(1)}h`;

  await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
  await chrome.action.setBadgeText({ text: totalMs > 0 ? text : "" });
}

async function getStoredData() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.data);
  return result[STORAGE_KEYS.data] || { days: {}, updatedAt: Date.now() };
}

async function getActiveState() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.state);
  return result[STORAGE_KEYS.state] || null;
}

async function setActiveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.state]: state });
}
