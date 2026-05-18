const totalTime = document.querySelector("#totalTime");
const topSite = document.querySelector("#topSite");
const siteCount = document.querySelector("#siteCount");
const siteRows = document.querySelector("#siteRows");
const refreshButton = document.querySelector("#refreshButton");
const resetTodayButton = document.querySelector("#resetTodayButton");
const optionsButton = document.querySelector("#optionsButton");

refreshButton.addEventListener("click", render);
resetTodayButton.addEventListener("click", async () => {
  const confirmed = confirm("Reset all tracked time for today?");
  if (!confirmed) {
    return;
  }

  await chrome.runtime.sendMessage({ type: "resetToday" });
  await render();
});
optionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());

render();

async function render() {
  const response = await chrome.runtime.sendMessage({ type: "getTodayStats" });
  if (!response?.ok) {
    totalTime.textContent = "Error";
    siteRows.innerHTML = `<tr><td colspan="2" class="empty">Unable to load tracked time.</td></tr>`;
    return;
  }

  const stats = response.stats || { totalMs: 0, sites: {} };
  const sites = Object.entries(stats.sites || {}).sort((a, b) => b[1] - a[1]);

  totalTime.textContent = formatDuration(stats.totalMs || 0);
  topSite.textContent = sites[0]?.[0] || "No activity yet";
  siteCount.textContent = String(sites.length);

  if (sites.length === 0) {
    siteRows.innerHTML = `<tr><td colspan="2" class="empty">Open a website to start tracking.</td></tr>`;
    return;
  }

  siteRows.innerHTML = sites.map(([site, ms]) => {
    const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(site)}&sz=32`;
    return `
      <tr>
        <td>
          <div class="site">
            <img class="favicon" src="${favicon}" alt="">
            <span class="domain" title="${escapeHtml(site)}">${escapeHtml(site)}</span>
          </div>
        </td>
        <td>${formatDuration(ms)}</td>
      </tr>
    `;
  }).join("");
}

function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
