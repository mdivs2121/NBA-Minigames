// Draft Redo - pick a draft class, see every player taken, and build the top
// 10 it should have been, knowing how the careers turned out. Scored against
// career Win Shares.

const BEST_KEY = "dr-best";   // { "2014": 72, ... }

Object.assign(data, {
  classes: {},      // "2014" -> [{ pick, round, team, id, name, college, ws, g, ppg, rpg, apg, seasons }]
});

const game = {
  year: null,
  board: [],        // playerIds in your order, up to 10
  truth: [],        // the class sorted best to worst career
  locked: false,
  result: null,     // { score, emoji, off }
  search: "",
};

// ---------- data ----------

async function loadData() {
  const [, classes] = await Promise.all([loadCommon(), fetchJson("draft")]);
  data.classes = classes;
  // Many drafted players never played after 2005, so add their names for avatar().
  for (const list of Object.values(classes)) {
    for (const p of list) data.players[p.id] ||= { name: p.name };
  }
}

const player = (id) => data.classes[game.year].find((p) => p.id === id);

// ---------- game ----------

function startClass(year) {
  game.year = String(year);
  game.board = [];
  game.locked = false;
  game.result = null;
  game.search = "";
  $("search").value = "";
  // Best career first; ties (usually players with no NBA career) by draft slot.
  game.truth = [...data.classes[game.year]].sort((a, b) => b.ws - a.ws || a.pick - b.pick).map((p) => p.id);
  $("year").value = game.year;
  try { history.replaceState(null, "", `#${game.year}`); } catch {}
  render();
}

function randomClass() {
  const years = Object.keys(data.classes).filter((y) => y !== game.year);
  startClass(years[Math.floor(Math.random() * years.length)]);
}

function add(id) {
  if (game.locked || game.board.length >= 10 || game.board.includes(id)) return;
  game.board.push(id);
  render();
}

function remove(index) {
  if (game.locked) return;
  game.board.splice(index, 1);
  render();
}

function move(from, to) {
  if (game.locked || to < 0 || to >= game.board.length || from === to) return;
  const [id] = game.board.splice(from, 1);
  game.board.splice(to, 0, id);
}

// Each of your 10 spots is worth up to 10 points: 5 for picking someone who
// really belongs in the top 10, plus up to 5 for how close you put him to his
// real spot (5 if exact, minus 1 per spot off).
function scoreOf(board, truth) {
  const off = board.map((id, i) => {
    const real = truth.indexOf(id);
    return real < 10 ? Math.abs(real - i) : null;   // null = not a real top-10 player
  });
  const points = off.map((d) => (d === null ? 0 : 5 + Math.max(0, 5 - d)));
  return {
    off,
    score: points.reduce((a, b) => a + b, 0),
    inTop10: off.filter((d) => d !== null).length,
    exact: off.filter((d) => d === 0).length,
    emoji: off.map((d) => (d === 0 ? "🟩" : d === null ? "🟥" : "🟨")).join(""),
  };
}

function lockIn() {
  if (game.locked || game.board.length < 10) return;
  game.locked = true;
  game.result = scoreOf(game.board, game.truth);
  saveBest(game.result.score);
  if (game.result.score >= 80) celebrate();   // "GM of the year"
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) || {}; } catch { return {}; }
}

function saveBest(score) {
  const best = loadBest();
  if (score <= (best[game.year] ?? -1)) return;
  best[game.year] = score;
  try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch {}
}

async function share() {
  const { score, emoji } = game.result;
  const text = `Draft Redo · ${game.year} class\n${emoji}\n${score}/100`;
  await shareResult(text, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  $("class-title").textContent = `${game.year} Draft`;
  const best = loadBest()[game.year];
  const state = $("state");
  state.className = "state";
  state.textContent = game.locked ? `${game.result.score}/100` : best != null ? `Best: ${best}/100` : `${game.year} class`;
  if (game.locked && game.result.score >= 60) state.classList.add("win");

  renderBoard();
  renderClass();

  $("board-count").textContent = `${game.board.length}/10`;
  $("lock").hidden = game.locked;
  $("lock").disabled = game.board.length < 10;
  $("lock").textContent = game.board.length < 10 ? `Pick ${10 - game.board.length} more` : "Lock in";
  $("clear").hidden = game.locked || !game.board.length;
  $("result").hidden = !game.locked;
  // While picking, the board stays in view as you scroll the class. After
  // locking in, the results make it too tall for that, so it scrolls normally.
  $("board-wrap").classList.toggle("sticky", !game.locked);
  if (game.locked) renderResult();
}

function renderBoard() {
  const rows = game.board.map((id, i) => {
    const p = player(id);
    const off = game.locked ? game.result.off[i] : undefined;
    const cls = off === undefined ? "" : off === 0 ? "hit" : off === null ? "miss" : "near";
    const realRank = game.truth.indexOf(id) + 1;
    const right = game.locked
      ? `<span class="value">${p.ws.toFixed(1)}<small> WS</small></span>
         <span class="truth">${off === 0 ? "✓" : `#${realRank}`}</span>`
      : `<span class="arrows">
           <button type="button" class="arrow" data-move="${i},${i - 1}" aria-label="Move ${escapeHtml(p.name)} up" ${i === 0 ? "disabled" : ""}>▲</button>
           <button type="button" class="arrow" data-move="${i},${i + 1}" aria-label="Move ${escapeHtml(p.name)} down" ${i === game.board.length - 1 ? "disabled" : ""}>▼</button>
         </span>
         <button type="button" class="remove" data-remove="${i}" aria-label="Remove ${escapeHtml(p.name)}">✕</button>`;
    return `
      <li class="rank-row ${cls}" data-index="${i}">
        <span class="rank-num">${i + 1}</span>
        ${game.locked ? "" : `<span class="handle" aria-hidden="true">⋮⋮</span>`}
        ${avatar(id, "md")}
        <span class="rank-body">
          <span class="rank-name">${game.locked ? playerLink(id, p.name) : escapeHtml(p.name)}</span>
          <span class="rank-sub">Drafted #${p.pick} · ${p.team}</span>
        </span>
        ${right}
      </li>`;
  });
  for (let i = game.board.length; i < 10; i++) {
    rows.push(`<li class="slot-empty"><span class="rank-num">${i + 1}</span><span>${i === game.board.length ? "Add a player from the class →" : ""}</span></li>`);
  }
  $("board").innerHTML = rows.join("");
}

function renderClass() {
  const list = data.classes[game.year];
  const q = game.search.trim().toLowerCase();
  const shown = list.filter((p) => !q || [p.name, p.team, p.college || ""].some((t) => t.toLowerCase().includes(q)));
  $("class-label").textContent = `The ${game.year} class`;
  $("class-count").textContent = q ? `${shown.length} of ${list.length} picks` : `${list.length} picks`;

  const rounds = [...new Set(shown.map((p) => p.round))];
  $("class-list").innerHTML = rounds.length
    ? rounds
        .map((round) => `
          <h3 class="dr-round">Round ${round}</h3>
          <ol class="dr-picks">
            ${shown.filter((p) => p.round === round).map(classRow).join("")}
          </ol>`)
        .join("")
    : `<p class="meta">No one in the ${game.year} class matches “${escapeHtml(game.search)}”.</p>`;
}

function classRow(p) {
  const slot = game.board.indexOf(p.id);
  const full = game.board.length >= 10;
  let action;
  if (game.locked) {
    const rank = game.truth.indexOf(p.id) + 1;
    action = `<span class="dr-ws">${p.ws.toFixed(1)} WS <small>#${rank}</small></span>`;
  } else if (slot >= 0) {
    action = `<span class="dr-in">Your #${slot + 1}</span>`;
  } else {
    action = `<button type="button" class="dr-add" data-add="${p.id}" ${full ? "disabled" : ""}>+ Add</button>`;
  }
  const college = p.college ? escapeHtml(p.college) : "No college listed";
  return `
    <li class="dr-pick ${slot >= 0 ? "picked" : ""}">
      <span class="dr-slot">${p.pick}</span>
      ${avatar(p.id, "xs")}
      <span class="dr-who">
        <span class="dr-name">${game.locked ? playerLink(p.id, p.name) : escapeHtml(p.name)}</span>
        <span class="dr-meta">${p.team} · ${college}</span>
      </span>
      ${action}
    </li>`;
}

function saveImage() {
  const { score, inTop10, emoji } = game.result;
  shareImage({
    title: "Draft Redo",
    kicker: `${game.year} draft class`,
    big: `${score}/100`,
    grid: [emoji],
    lines: [`${inTop10} of 10 picks were real top-10 careers`],
  }, $("share-msg"));
}

function renderResult() {
  const { score, inTop10, exact, emoji } = game.result;
  $("result").classList.toggle("lose", score < 40);
  $("result-kicker").textContent =
    score >= 80 ? "GM of the year" : score >= 60 ? "Front office material" : score >= 40 ? "Solid scouting" : "Back to the film room";
  $("result-score").textContent = `${score}/100`;
  $("result-emoji").textContent = emoji;
  $("result-text").textContent =
    `${inTop10} of your 10 really belong in the top 10, ${exact} in the exact spot. ` +
    "🟩 exact spot · 🟨 top 10, wrong spot · 🟥 not top 10.";
  $("share-msg").textContent = "";

  $("truth").innerHTML = game.truth
    .slice(0, 10)
    .map((id, i) => {
      const p = player(id);
      const mine = game.board.indexOf(id);
      const steal = p.pick > 10 ? `<span class="dr-steal">Steal: went #${p.pick}</span>` : "";
      return `
        <li class="${mine === i ? "hit" : mine >= 0 ? "near" : ""}">
          <span class="rank-num">${i + 1}</span>
          ${avatar(id, "md")}
          <span class="rank-body">
            <span class="rank-name">${playerLink(id, p.name)} ${steal}</span>
            <span class="rank-sub">Drafted #${p.pick} · ${p.team} · ${p.ppg} PPG, ${p.rpg} RPG, ${p.apg} APG · ${p.seasons} seasons</span>
          </span>
          <span class="value">${p.ws.toFixed(1)}<small> WS</small></span>
        </li>`;
    })
    .join("");
}

// ---------- wiring ----------

enableDragSort($("board"), {
  canDrag: () => !game.locked,
  onMove: (from, to) => { move(from, to); renderBoard(); },
  onEnd: renderBoard,
});

$("board").addEventListener("click", (e) => {
  const mv = e.target.closest("[data-move]");
  if (mv) {
    const [from, to] = mv.dataset.move.split(",").map(Number);
    move(from, to);
    renderBoard();
    const [up, down] = $("board").children[to].querySelectorAll(".arrow");
    const wanted = to < from ? up : down;
    (wanted.disabled ? (to < from ? down : up) : wanted).focus();
    return;
  }
  const rm = e.target.closest("[data-remove]");
  if (rm) remove(Number(rm.dataset.remove));
});

$("class-list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-add]");
  if (btn) add(btn.dataset.add);
});

$("search").addEventListener("input", (e) => {
  game.search = e.target.value;
  renderClass();
});
$("year").addEventListener("change", (e) => startClass(e.target.value));
$("random-class").addEventListener("click", randomClass);
$("next-class").addEventListener("click", () => { randomClass(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("lock").addEventListener("click", lockIn);
$("clear").addEventListener("click", () => { game.board = []; render(); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);

loadData()
  .then(() => {
    const years = Object.keys(data.classes).sort().reverse();
    $("year").innerHTML = years.map((y) => `<option value="${y}">${y}</option>`).join("");
    $("status").hidden = true;
    $("game").hidden = false;
    // A link like draft.html#2003 opens that class; otherwise pick one at random.
    const fromLink = location.hash.slice(1);
    if (data.classes[fromLink]) startClass(fromLink);
    else randomClass();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
