// The puzzle archive: every day from puzzle #1 to yesterday, newest first,
// with each daily game's result (or a link to play it). The daily games come
// from GAMES in common.js, so new ones show up here on their own.

// How to sum up a saved result, per daily game's storage key.
const SUMMARY = {
  "r5-v1": (r) => `${r.score}/100`,
  "cx-v1": (r) => (r.won ? (r.mistakes ? `Solved · ${r.mistakes} miss${r.mistakes === 1 ? "" : "es"}` : "Perfect") : `${r.found ?? 0} of 4`),
};

function saved(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}

function renderArchive() {
  const dailies = GAMES.filter((g) => g.daily);
  const saves = Object.fromEntries(dailies.map((g) => [g.daily, saved(g.daily)]));
  const days = [];
  for (let d = addDayKeys(todayKey(), -1); d >= FIRST_DAY; d = addDayKeys(d, -1)) days.push(d);
  if (!days.length) {
    $("days").innerHTML = `<li class="ar-empty">No past puzzles yet. Come back tomorrow.</li>`;
    return;
  }
  $("days").innerHTML = days.map((day) => `
    <li class="ar-day">
      <span class="ar-date"><b>${formatArchiveDay(day)}</b><small>Puzzle #${dayNumber(day)}</small></span>
      <span class="ar-games">
        ${dailies.map((g) => {
          const s = saves[g.daily];
          const result = s.history?.[day] || s.archive?.[day];
          const late = !s.history?.[day] && s.archive?.[day];
          return result
            ? `<a class="ar-chip done" href="${g.page}?day=${day}"><span>${escapeHtml(g.title)}</span><b>✓ ${(SUMMARY[g.daily] || (() => "Played"))(result)}${late ? " · late" : ""}</b></a>`
            : `<a class="ar-chip" href="${g.page}?day=${day}"><span>${escapeHtml(g.title)}</span><b>Play →</b></a>`;
        }).join("")}
      </span>
    </li>`).join("");
}

function addDayKeys(key, n) {
  return new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10) + n)).toISOString().slice(0, 10);
}

function formatArchiveDay(key) {
  return new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10))
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

renderArchive();
window.addEventListener("pageshow", renderArchive);
