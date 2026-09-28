// Shared by every minigame: player names, headshots, and small helpers.
// Each game's own script loads after this one and adds to `data`.

const data = {
  players: {},      // playerId -> { name }
  photos: {},       // playerId -> NBA.com ID, for players with an NBA headshot
};

const $ = (id) => document.getElementById(id);

async function fetchJson(file) {
  const r = await fetch(`data/${file}.json`);
  if (!r.ok) throw new Error(`${file}.json: ${r.status}`);
  return r.json();
}

async function loadCommon() {
  const [players, photos] = await Promise.all([
    fetchJson("players"),
    // Photos are optional: without photos.json everyone just gets initials.
    fetchJson("photos").catch(() => ({})),
  ]);
  data.players = players;
  data.photos = photos;
}

function name(id) {
  return data.players[id].name;
}

// Headshot over the player's initials: NBA.com when build_photos.py found one,
// otherwise Basketball-Reference (same IDs as our data). If neither has a
// photo, the image fails to load and the initials show instead.
function photoUrl(id) {
  const nbaId = data.photos[id];
  return nbaId
    ? `https://cdn.nba.com/headshots/nba/latest/260x190/${nbaId}.png`
    : `https://www.basketball-reference.com/req/202106291/images/headshots/${encodeURIComponent(id)}.jpg`;
}

function avatar(id, size) {
  const initials = name(id)
    .split(/\s+/)
    .filter((w) => /^[A-Za-zÀ-ž]/.test(w) && !/^(Jr|Sr|II|III|IV)\.?$/.test(w))
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const img = `<img src="${photoUrl(id)}" alt="" loading="lazy" onload="this.parentNode.classList.add('loaded')" onerror="this.remove()">`;
  return `<span class="avatar ${size}" aria-hidden="true"><span class="initials">${escapeHtml(initials)}</span>${img}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function showLoadError(err) {
  const status = $("status");
  status.hidden = false;
  status.classList.add("error");
  status.textContent =
    `Couldn't load data (${err.message}). Open this page through a local server: ` +
    "run `python3 -m http.server` in this folder, then visit http://localhost:8000";
}

// ---------- site menu ----------
// Every page has an empty <nav class="site-nav">; this fills it in. To add a
// game, add it here.
const GAMES = [
  { page: "index.html", title: "Teammate Chain" },
  { page: "rank.html", title: "Rank the Five" },
  { page: "higher.html", title: "Higher or Lower" },
  { page: "draft.html", title: "Draft Redo" },
  { page: "snake.html", title: "Snake Draft" },
];

const BALL_ICON = `
  <svg viewBox="0 0 32 32" aria-hidden="true">
    <circle cx="16" cy="16" r="14" fill="#ff6b1a"/>
    <g fill="none" stroke="#1a0e06" stroke-width="1.8">
      <circle cx="16" cy="16" r="14"/>
      <path d="M2 16h28M16 2v28M6.2 6.2c5 4.2 5 15.4 0 19.6M25.8 6.2c-5 4.2-5 15.4 0 19.6"/>
    </g>
  </svg>`;

function renderNav() {
  const nav = document.querySelector(".site-nav");
  if (!nav) return;
  const here = location.pathname.split("/").pop() || "index.html";
  nav.innerHTML = `
    <a href="index.html" class="site-brand">${BALL_ICON}<span>NBA <b>Minigames</b></span></a>
    <div class="game-tabs">
      ${GAMES.map((g) => `<a href="${g.page}"${g.page === here ? ' aria-current="page"' : ""}>${g.title}</a>`).join("")}
    </div>`;
}
renderNav();

// Credit line under every page's footer.
document.querySelector("footer")?.insertAdjacentHTML(
  "afterend",
  `<p class="credit">Stats from Basketball-Reference via the Kaggle dataset “NBA Stats (1947-present)”.
   Headshots from NBA.com and Basketball-Reference. A fan project, not affiliated with the NBA.</p>`
);

// ---------- drag to reorder ----------
// For a list whose draggable rows carry data-index. Pointer events cover mouse
// and touch; on touch only the .handle starts a drag so the page can still
// scroll. onMove(from, to) must reorder the data and redraw the list.
function enableDragSort(list, { canDrag = () => true, onMove, onEnd = () => {} }) {
  let drag = null;
  const rows = () => [...list.querySelectorAll(":scope > [data-index]")];

  list.addEventListener("pointerdown", (e) => {
    if (!canDrag() || e.button > 0 || e.target.closest("button")) return;
    const row = e.target.closest("[data-index]");
    if (!row || row.parentNode !== list) return;
    if (e.pointerType !== "mouse" && !e.target.closest(".handle")) return;
    e.preventDefault();
    drag = { index: +row.dataset.index, pointerId: e.pointerId };
    try { list.setPointerCapture(e.pointerId); } catch {}
    row.classList.add("dragging");
  });

  list.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    // The new spot is the number of other rows whose middle is above the pointer.
    let to = 0;
    rows().forEach((r, i) => {
      const box = r.getBoundingClientRect();
      if (i !== drag.index && e.clientY > box.top + box.height / 2) to++;
    });
    if (to !== drag.index) {
      onMove(drag.index, to);
      drag.index = to;
      rows()[to]?.classList.add("dragging");
    }
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag = null;
    onEnd();
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);
}
