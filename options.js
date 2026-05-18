const storageSummary = document.querySelector("#storageSummary");
const resetAllButton = document.querySelector("#resetAllButton");

resetAllButton.addEventListener("click", async () => {
  const confirmed = confirm("Reset all tracked website time?");
  if (!confirmed) {
    return;
  }

  await chrome.runtime.sendMessage({ type: "resetAll" });
  await render();
});

render();

async function render() {
  const response = await chrome.runtime.sendMessage({ type: "getAllStats" });
  if (!response?.ok) {
    storageSummary.textContent = "Unable to load stored data.";
    return;
  }

  const days = response.data?.days || {};
  const dayCount = Object.keys(days).length;
  const totalMs = Object.values(days).reduce((sum, day) => sum + (day.totalMs || 0), 0);

  storageSummary.textContent = `${dayCount} tracked day${dayCount === 1 ? "" : "s"}, ${formatDuration(totalMs)} total.`;
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
