// The home page: a card for every game in GAMES (common.js), each with a
// line about your own progress, read from what the games save in this browser.

function saved(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function todayKey() {
  const d = new Date();
  return [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
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
  chain() {
    let level = null;
    try { level = localStorage.getItem("tc-level"); } catch {}   // saved as plain text, not JSON
    return level ? { text: `Last played on ${level[0].toUpperCase()}${level.slice(1)}` } : null;
  },
  higher() {
    const best = Number(saved("hl-best")) || 0;
    return best ? { text: `Best streak: ${best}` } : null;
  },
  draft() {
    const best = saved("dr-best") || {};
    const years = Object.keys(best);
    if (!years.length) return null;
    const top = Math.max(...Object.values(best));
    return { text: `${years.length} class${years.length === 1 ? "" : "es"} played · best ${top}/100` };
  },
  snake() {
    const record = saved("sd-record") || {};
    let w = 0, l = 0;
    for (const r of Object.values(record)) { w += r.w || 0; l += r.l || 0; }
    return w + l ? { text: `Record vs the bots: ${w}–${l}` } : null;
  },
};

// Small drawings of each game, in the site's colors.
const ART = {
  rank: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="10" y="8" width="100" height="12" rx="4" fill="var(--green)"/>
      <rect x="10" y="24" width="100" height="12" rx="4" fill="var(--near)"/>
      <rect x="10" y="40" width="100" height="12" rx="4" fill="var(--green)"/>
      <rect x="10" y="56" width="100" height="12" rx="4" fill="var(--red)"/>
      <rect x="10" y="72" width="100" height="12" rx="4" fill="var(--green)"/>
    </svg>`,
  chain: `
    <svg viewBox="0 0 120 90" aria-hidden="true" fill="none">
      <path d="M20 70 L50 30 L80 60 L104 20" stroke="var(--accent)" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 9"/>
      <circle cx="20" cy="70" r="11" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="3"/>
      <circle cx="50" cy="30" r="9" fill="var(--green)"/>
      <circle cx="80" cy="60" r="9" fill="var(--green)"/>
      <circle cx="104" cy="20" r="11" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="3"/>
    </svg>`,
  higher: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      <rect x="6" y="14" width="46" height="62" rx="8" fill="var(--surface-2)"/>
      <rect x="68" y="14" width="46" height="62" rx="8" fill="none" stroke="var(--accent)" stroke-width="3"/>
      <text x="29" y="54" text-anchor="middle" font-size="18" font-weight="800" fill="var(--text)">27.1</text>
      <text x="91" y="56" text-anchor="middle" font-size="26" font-weight="800" fill="var(--accent)">?</text>
      <circle cx="60" cy="45" r="10" fill="var(--accent)"/>
      <text x="60" y="49" text-anchor="middle" font-size="9" font-weight="800" fill="var(--on-accent)">VS</text>
    </svg>`,
  draft: `
    <svg viewBox="0 0 120 90" aria-hidden="true">
      ${[0, 1, 2, 3].map((i) => `
        <text x="12" y="${22 + i * 20}" font-size="13" font-weight="800" fill="var(--muted)">${i + 1}</text>
        <rect x="28" y="${11 + i * 20}" width="${[80, 62, 72, 50][i]}" height="13" rx="4" fill="${i === 0 ? "var(--accent)" : "var(--surface-2)"}"/>`).join("")}
      <text x="98" y="21" text-anchor="end" font-size="9" font-weight="800" fill="var(--on-accent)">#41</text>
    </svg>`,
  snake: `
    <svg viewBox="0 0 120 90" aria-hidden="true" fill="none">
      <path d="M14 18 H96 Q108 18 108 30 Q108 42 96 42 H24 Q12 42 12 54 Q12 66 24 66 H106" stroke="var(--line)" stroke-width="10" stroke-linecap="round"/>
      ${[[14, 18, "accent"], [52, 18, "muted"], [96, 18, "muted"], [70, 42, "accent"], [30, 42, "accent"], [40, 66, "muted"], [80, 66, "accent"]]
        .map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="6" fill="var(--${c})"/>`).join("")}
    </svg>`,
};

function renderHub() {
  $("hub").innerHTML = GAMES.map((g, i) => {
    const progress = PROGRESS[g.art]?.();
    const status = progress
      ? `<span class="hub-progress ${progress.done ? "done" : ""} ${progress.fresh ? "fresh" : ""}">${escapeHtml(progress.text)}</span>`
      : "";
    return `
      <li class="${i === 0 ? "featured" : ""}">
        <a class="hub-card" href="${g.page}">
          <span class="hub-art">${ART[g.art] || ""}</span>
          <span class="hub-body">
            <span class="hub-tag">${escapeHtml(g.tag)}</span>
            <span class="hub-title">${escapeHtml(g.title)}</span>
            <span class="hub-blurb">${escapeHtml(g.blurb)}</span>
            ${status}
          </span>
          <span class="hub-go" aria-hidden="true">Play →</span>
        </a>
      </li>`;
  }).join("");
}

renderHub();
// Coming back to this tab (say, after finishing today's puzzle) refreshes the lines.
window.addEventListener("pageshow", renderHub);
