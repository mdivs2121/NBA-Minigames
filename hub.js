// The home page: a card for every game in GAMES (common.js), each with a
// line about your own progress, read from what the games save in this browser.

function saved(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

// One short line per game, or null for a first-time visitor.
const PROGRESS = {
  rank() {
    const history = saved("r5-v1")?.history || {};
    const today = history[todayKey()];
    const played = Object.keys(history).length;
    if (today) return { text: `Today: ${today.score}/100 ✓`, done: true };
    return { text: played ? `Today's puzzle is ready · ${played} played` : "Today's puzzle is ready", fresh: true };
  },
  connections() {
    const history = saved("cx-v1")?.history || {};
    const today = history[todayKey()];
    const played = Object.keys(history).length;
    if (today) return { text: today.won ? `Today: solved with ${today.mistakes} mistake${today.mistakes === 1 ? "" : "s"} ✓` : `Today: ${today.found ?? 0} of 4 groups`, done: true };
    return { text: played ? `Today's puzzle is ready · ${played} played` : "Today's puzzle is ready", fresh: true };
  },
  chain() {
    let level = null;
    try { level = localStorage.getItem("tc-level"); } catch {}   // saved as plain text, not JSON
    return level ? { text: `Last played on ${level[0].toUpperCase()}${level.slice(1)}` } : null;
  },
  path() {
    const saved = (() => { try { return JSON.parse(localStorage.getItem("cp-v1")) || {}; } catch { return {}; } })();
    const best = Math.max(saved.easy?.best || 0, saved.hard?.best || 0);
    return best ? { text: `Best streak: ${best}` } : null;
  },
  higher() {
    const best = Number(saved("hl-best")) || 0;
    return best ? { text: `Best streak: ${best}` } : null;
  },
  resume() {
    const bests = [["Careers", "br-best"], ["Seasons", "br-best-seasons"], ["Teams", "br-best-teams"]]
      .map(([label, key]) => [label, Number(saved(key)) || 0]).filter(([, n]) => n);
    return bests.length ? { text: bests.map(([label, n]) => `${label} ${n}/10`).join(" · ") } : null;
  },
  draft() {
    const best = saved("dr-best") || {};
    const years = Object.keys(best);
    if (!years.length) return null;
    const top = Math.max(...Object.values(best));
    return { text: `${years.length} class${years.length === 1 ? "" : "es"} played · best ${top}/100` };
  },
  mvp() {
    const best = saved("mvp-best") || {};
    const seasons = Object.keys(best);
    return seasons.length ? { text: `${seasons.length} race${seasons.length === 1 ? "" : "s"} voted · best ${Math.max(...Object.values(best))}/100` } : null;
  },
  snake() {
    const record = saved("sd-record") || {};
    let w = 0, l = 0;
    for (const r of Object.values(record)) { w += r.w || 0; l += r.l || 0; }
    return w + l ? { text: `Record vs the bots: ${w}–${l}` } : null;
  },
};

// The strip at the top: today's daily puzzles, done or not, and a streak of
// days in a row with at least one daily finished.
function renderToday() {
  const dailies = GAMES.filter((g) => g.daily);
  const today = todayKey();
  const days = {};
  const chips = dailies.map((g) => {
    const history = saved(g.daily)?.history || {};
    for (const day of Object.keys(history)) days[day] = true;
    const done = history[today];
    const detail = !done ? "Play →" : done.score != null ? `${done.score}/100` : done.won ? "Solved" : `${done.found ?? 0} of 4`;
    return `
      <a class="today-chip ${done ? "done" : ""}" href="${g.page}">
        <span class="today-check" aria-hidden="true">${done ? "✓" : ""}</span>
        <span class="today-name">${escapeHtml(g.title)}</span>
        <span class="today-detail">${detail}</span>
      </a>`;
  });
  const streak = streaks(days).current;
  const allDone = dailies.every((g) => saved(g.daily)?.history?.[today]);
  $("today").innerHTML = `
    <div class="today-head">
      <span class="label">Today · ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
      <span class="today-streak ${streak ? "on" : ""}">${streak ? `🔥 ${streak}-day streak` : "Start a streak today"}</span>
    </div>
    <div class="today-chips">${chips.join("")}</div>
    ${allDone ? `<p class="today-done">All done for today. New puzzles at midnight.</p>` : ""}`;
  $("today").hidden = false;
}

function renderHub() {
  renderToday();
  $("hub").innerHTML = GAMES.map((g, i) => {
    const progress = PROGRESS[g.art]?.();
    const status = progress
      ? `<span class="hub-progress ${progress.done ? "done" : ""} ${progress.fresh ? "fresh" : ""}">${escapeHtml(progress.text)}</span>`
      : "";
    return `
      <li class="${i === 0 ? "featured" : ""}">
        <a class="hub-card" href="${g.page}">
          <span class="hub-art">${GAME_ART[g.art] || ""}</span>
          <span class="hub-body">
            <span class="hub-tag">${escapeHtml(g.tag)}${g.isNew ? ' <span class="new-badge">New</span>' : ""}</span>
            <span class="hub-title">${escapeHtml(g.title)}</span>
            <span class="hub-blurb">${escapeHtml(g.blurb)}</span>
            ${status}
          </span>
          <span class="hub-go" aria-hidden="true">Play →</span>
        </a>
      </li>`;
  }).join("");
}

// "Did you know?": a random stat fact each visit, with the player's photo.
let facts = [];

function renderFact() {
  if (!facts.length) return;
  const f = facts[Math.floor(Math.random() * facts.length)];
  data.players[f.id] ||= { name: f.name };
  $("fact").innerHTML = `
    ${avatar(f.id, "md")}
    <div class="fact-body">
      <span class="label">Did you know?</span>
      <p>${escapeHtml(f.text)}</p>
      <span class="fact-actions">
        <a class="fact-link" href="player.html?id=${encodeURIComponent(f.id)}">${escapeHtml(f.name)}'s page →</a>
        <button type="button" id="another-fact" class="ghost">Another fact</button>
      </span>
    </div>`;
  $("fact").hidden = false;
  $("another-fact").addEventListener("click", renderFact);
}

Promise.all([fetchJson("facts"), fetchJson("photos").catch(() => ({}))])
  .then(([list, photos]) => { facts = list; data.photos = photos; renderFact(); })
  .catch(() => {});   // no facts file: the card just stays hidden

renderHub();
// Coming back to this tab (say, after finishing today's puzzle) refreshes the lines.
window.addEventListener("pageshow", renderHub);
