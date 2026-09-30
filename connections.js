// Hoop Connections - a daily puzzle: 16 players, 4 hidden groups of 4.
// Groups come from connections.json, one from each difficulty tier
// (1 colleges, 2 teams and awards, 3 career facts, 4 wordplay).
//
// Every category in the data lists ALL of its members from the player pool,
// so a puzzle is only accepted if no player in the grid fits a second group.
// That guarantees exactly one answer.

const STORAGE_KEY = "cx-v1";
const MISTAKES = 4;
const RANK_EMOJI = { 1: "🟩", 2: "🟨", 3: "🟧", 4: "🟥" };   // easiest group to hardest

Object.assign(data, {
  categories: [],   // { label, tier, members: Set }
  fame: {},         // id -> how well-known (All-Star picks, awards, scoring)
});

// Each group's four come from its best-known usable players, so the grid is
// mostly names people know, with a little variety.
const FAMOUS_SHORTLIST = 10;

const play = {
  mode: "daily",    // "daily" | "practice"
  day: null,
  number: null,
  groups: [],       // the 4 chosen: { label, tier, players: [4 ids] }, easiest first
  order: [],        // the 16 ids in their current grid order
  selected: new Set(),
  solved: [],       // indexes into groups, in the order found
  guessed: [],      // sorted "id,id,id,id" keys already tried
  guesses: [],      // tiers of each guess's four players, for the share grid
  mistakes: 0,
  found: 0,         // groups you found yourself (the rest get revealed at the end)
  hints: [],        // [{ group, kind: "nudge" | "pair" | "name", ids? }]
  busy: false,      // true while a found group does its little hop
  over: false,
  won: false,
};

// ---------- data ----------

async function loadData() {
  const [, cx] = await Promise.all([loadCommon(), fetchJson("connections")]);
  for (const [id, n] of Object.entries(cx.players)) data.players[id] ||= { name: n };
  data.categories = cx.categories.map((c) => ({ ...c, members: new Set(c.members), details: c.details || {} }));
  data.fame = cx.fame;
}

// ---------- puzzle generation ----------
// Each daily puzzle comes from the date, so everyone gets the same one. From
// NEW_RULES_FROM on, a day also looks back at the week before it:
//   - no category repeats within 7 days
//   - no family of categories (colleges, teams, awards, names...) two days running
//   - four different families per puzzle, at least one of them on the easy side
// Earlier days keep their original puzzles (people already played them).

const NEW_RULES_FROM = "2026-10-01";
const NO_REPEAT_DAYS = 7;

// Which kind of category a label is. Two categories of the same family feel alike.
function familyOf(label) {
  if (label.startsWith("Went to")) return "college";
  if (label.startsWith("Drafted in")) return "draft class";
  if (label.startsWith("Averaged") || label.startsWith("Had a 50-40-90")) return "big season";
  if (label.startsWith("Led the league")) return "league leader";
  if (label.startsWith("Teammates of")) return "teammates";
  if (label.startsWith("Made ")) return "honors";
  if (label === "Played for 7+ franchises" || label.startsWith("Spent 10+")) return "team count";
  if (label.startsWith("Played for")) return "team";
  if (label.startsWith("Won ")) return "award";
  if (label.includes("picks")) return "draft";
  if (label.includes("feet")) return "height";
  if (label.startsWith("Scored")) return "scoring";
  if (label === "Hall of Famers") return "hall of fame";
  if (label.startsWith("Never played in college")) return "path";
  return "names";   // first name, last name, colors, same first letter
}

function shuffler(random) {
  return (list) => {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
}

// Turn four categories into a puzzle, or null if they can't make one: every
// player must fit exactly one group. Groups come out easiest first.
function buildGroups(cats, random) {
  const shuffle = shuffler(random);
  const groups = [];
  for (const cat of cats) {
    const others = cats.filter((c) => c !== cat);
    const usable = [...cat.members].filter((id) => !others.some((o) => o.members.has(id)));
    if (usable.length < 4) return null;
    // Sort by fame (ties by id, so every device agrees), then pick 4 of the top few.
    usable.sort((a, b) => data.fame[b] - data.fame[a] || (a < b ? -1 : 1));
    groups.push({ label: cat.label, tier: cat.tier, details: cat.details, players: shuffle(usable.slice(0, FAMOUS_SHORTLIST)).slice(0, 4) });
  }
  groups.sort((a, b) => a.tier - b.tier || (a.label < b.label ? -1 : 1));
  return { groups, order: shuffle(groups.flatMap((g) => g.players)) };
}

// The original generator: one category from each tier, using only the
// original categories (not the v2 ones). Used for days before NEW_RULES_FROM,
// so those puzzles never change.
function legacyPuzzle(random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const byTier = [1, 2, 3, 4].map((t) => data.categories.filter((c) => c.tier === t && !c.v2));
  for (let tries = 0; tries < 1000; tries++) {
    const puzzle = buildGroups(byTier.map(pick), random);
    if (puzzle) return puzzle;
  }
  throw new Error("Couldn't build a puzzle.");
}

// Four categories from four different families. Hard rules: no category used
// in the last week, one easier group, every player fits one group. Soft rules,
// in order: at most one family shared with yesterday, then families not seen in
// the last two days first. Families are picked before categories, which keeps
// this quick (it runs once per day since NEW_RULES_FROM on every visit).
function makePuzzle(random, { recentLabels = new Set(), yesterdayFamilies = new Set(), twoDaysFamilies = new Set() } = {}) {
  const shuffle = shuffler(random);
  const byFamily = {};
  for (const cat of data.categories) {
    if (recentLabels.has(cat.label)) continue;
    (byFamily[familyOf(cat.label)] ||= []).push(cat);
  }
  const families = Object.keys(byFamily).sort();
  // Freshest families first: not used yesterday, then not the day before, then the rest.
  const staleness = (f) => (yesterdayFamilies.has(f) ? 2 : twoDaysFamilies.has(f) ? 1 : 0);
  const hasEasy = (f) => byFamily[f].some((c) => c.tier <= 2);
  for (const maxShared of [0, 1, 2, 4]) {
    for (let tries = 0; tries < 60; tries++) {
      const order = shuffle(families).sort((x, y) => staleness(x) - staleness(y) + (random() - 0.5) * 1.2);
      // The easier group comes first (freshest family that has one), then three more by freshness.
      const easyFamily = order.find((f) => hasEasy(f) && (!yesterdayFamilies.has(f) || maxShared > 0));
      if (!easyFamily) continue;
      const picked = [easyFamily];
      let shared = yesterdayFamilies.has(easyFamily) ? 1 : 0;
      for (const f of order) {
        if (picked.includes(f)) continue;
        const isShared = yesterdayFamilies.has(f);
        if (isShared && shared >= maxShared) continue;
        picked.push(f);
        if (isShared) shared++;
        if (picked.length === 4) break;
      }
      if (picked.length < 4) continue;
      const easy = byFamily[easyFamily].filter((c) => c.tier <= 2);
      const cats = [easy[Math.floor(random() * easy.length)],
        ...picked.slice(1).map((f) => byFamily[f][Math.floor(random() * byFamily[f].length)])];
      const puzzle = buildGroups(cats, random);
      if (puzzle) return puzzle;
    }
  }
  throw new Error("Couldn't build a puzzle.");
}

// "2026-10-01" plus n days, as the same kind of string.
function addDays(key, n) {
  return new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10) + n)).toISOString().slice(0, 10);
}

// The puzzle for a date. From NEW_RULES_FROM on, days are built in order so
// each one knows the week before it (remembered, so this runs once per day).
const dailyCache = {};
function dailyPuzzle(day) {
  if (dailyCache[day]) return dailyCache[day];
  const seed = (d) => rng(hash(`hoop-connections:${d}`));
  if (day < NEW_RULES_FROM) return (dailyCache[day] = legacyPuzzle(seed(day)));
  const week = [];   // each recent day's category labels, oldest first
  // Seed the window with the old-style days just before the new rules started…
  let d = addDays(NEW_RULES_FROM, -(NO_REPEAT_DAYS - 1));
  for (; d < NEW_RULES_FROM; d = addDays(d, 1)) week.push(dailyPuzzle(d).groups.map((g) => g.label));
  // …then build every day up to the one asked for.
  for (; d <= day; d = addDays(d, 1)) {
    if (!dailyCache[d]) {
      const recentLabels = new Set(week.slice(-(NO_REPEAT_DAYS - 1)).flat());
      const yesterdayFamilies = new Set((week.at(-1) || []).map(familyOf));
      const twoDaysFamilies = new Set((week.at(-2) || []).map(familyOf));
      dailyCache[d] = makePuzzle(seed(d), { recentLabels, yesterdayFamilies, twoDaysFamilies });
    }
    week.push(dailyCache[d].groups.map((g) => g.label));
  }
  return dailyCache[day];
}

// ---------- game flow ----------

const loadSave = () => loadDailySave(STORAGE_KEY);
const writeSave = (save) => writeDailySave(STORAGE_KEY, save);
const groupOf = (id) => play.groups.findIndex((g) => g.players.includes(id));

function reset(puzzle) {
  Object.assign(play, puzzle, {
    selected: new Set(), solved: [], guessed: [], guesses: [], mistakes: 0, found: 0, hints: [], over: false, won: false,
  });
}

function startDaily() {
  play.mode = "daily";
  play.day = todayKey();
  play.number = dayNumber(play.day);
  reset(dailyPuzzle(play.day));

  const save = loadSave();
  const saved = save.history[play.day] || (save.progress?.day === play.day ? save.progress : null);
  if (saved) {
    Object.assign(play, {
      solved: saved.solved, guessed: saved.guessed, guesses: saved.guesses,
      mistakes: saved.mistakes, order: saved.order || play.order, found: saved.found ?? saved.solved.length,
      hints: saved.hintLog || [],
    });
    if (save.history[play.day]) finish(saved.won, { restoring: true });
  }
  $("message").textContent = "";
  render();
}

function startPractice() {
  play.mode = "practice";
  play.day = null;
  play.number = null;
  reset(makePuzzle(Math.random));
  $("message").textContent = "";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toggle(id) {
  if (play.over || play.busy || play.solved.includes(groupOf(id))) return;
  if (play.selected.has(id)) play.selected.delete(id);
  else if (play.selected.size < 4) play.selected.add(id);
  render();
}

function submit() {
  if (play.over || play.busy || play.selected.size !== 4) return;
  const picked = [...play.selected];
  const key = [...picked].sort().join(",");
  if (play.guessed.includes(key)) {
    toast("Already guessed");
    return say("You already tried those four.", "bad");
  }
  play.guessed.push(key);
  play.guesses.push(picked.map((id) => groupOf(id) + 1));   // each pick's group, 1 = easiest

  const counts = [0, 1, 2, 3].map((g) => picked.filter((id) => groupOf(id) === g).length);
  const hit = counts.indexOf(4);
  if (hit >= 0) {
    // The four tiles hop, then the group slides up into place (skipped with reduced motion).
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      play.busy = true;
      for (const id of picked) $("grid").querySelector(`[data-id="${id}"]`)?.classList.add("found");
      setTimeout(() => { play.busy = false; solveGroup(hit); }, 560);
      return;
    }
    solveGroup(hit);
    return;
  }
  play.mistakes++;
  const oneAway = counts.includes(3);
  say(oneAway ? "One away…" : "Not a group.", "bad");
  toast(oneAway ? "One away…" : "Not a group");
  shake();
  if (play.mistakes >= MISTAKES) finish(false);
  saveProgress();
  render();
}

function solveGroup(hit) {
  play.solved.push(hit);
  play.selected.clear();
  say(`✓ ${play.groups[hit].label}`, "good");
  if (play.solved.length === 4) {
    finish(true);
    const milestone = play.mode === "daily" && streakMilestone(winStreak());
    if (milestone) celebrate({ big: true });
    else if (play.mistakes === 0 && !play.hints.length) celebrate();
  }
  play.justSolved = hit;   // the newest row slides in
  saveProgress();
  render();
}

function finish(won, { restoring = false } = {}) {
  play.over = true;
  play.won = won;
  play.selected.clear();
  if (!restoring) play.found = play.solved.length;
  // Reveal whatever's left, in difficulty order.
  for (let g = 0; g < 4; g++) if (!play.solved.includes(g)) play.solved.push(g);
  if (play.mode === "daily" && !restoring) {
    const save = loadSave();
    save.history[play.day] = {
      won, mistakes: play.mistakes, found: play.found, guesses: play.guesses, guessed: play.guessed,
      solved: play.solved, order: play.order, hints: play.hints.length, hintLog: play.hints,
    };
    save.progress = null;
    writeSave(save);
  }
}

function saveProgress() {
  if (play.mode !== "daily" || play.over) return;
  const save = loadSave();
  save.progress = {
    day: play.day, solved: play.solved, guessed: play.guessed, guesses: play.guesses,
    mistakes: play.mistakes, order: play.order, hintLog: play.hints,
  };
  writeSave(save);
}

// ---------- hints ----------
// Three sizes, all aimed at the easiest group you haven't found yet:
// a nudge (a vague clue), a pair (two of its players get selected), or the
// category name itself. Each can be used once per group.

const HINT_KINDS = ["nudge", "pair", "name"];
const hintTarget = () => [0, 1, 2, 3].find((g) => !play.solved.includes(g));
const hintsFor = (g) => play.hints.filter((h) => h.group === g);

function useHint(kind) {
  const g = hintTarget();
  if (play.over || g === undefined || hintsFor(g).some((h) => h.kind === kind)) return;
  const hint = { group: g, kind };
  if (kind === "pair") {
    // Two of the group's players, picked the same way every time (Shuffle doesn't change it).
    hint.ids = [...play.groups[g].players].sort().slice(0, 2);
    play.selected = new Set(hint.ids);
  }
  play.hints.push(hint);
  closeHintMenu();
  saveProgress();
  render();
}

// A vague clue from the category's label.
function nudge(label) {
  if (label.startsWith("Went to")) return "Four of these guys went to the same college.";
  if (label.startsWith("Drafted in")) return "Four of these guys came into the league on the same draft night.";
  if (label.startsWith("Averaged")) return "Four of these guys each had one huge season in the same stat.";
  if (label.startsWith("Had a 50-40-90")) return "Four of these guys each had a season of rare shooting.";
  if (label.startsWith("Led the league")) return "Four of these guys each finished a season No. 1 in the same stat.";
  if (label.startsWith("Teammates of")) return "Four of these guys all shared a locker room with the same star.";
  if (label === "Made 10+ All-Star teams") return "Four of these guys were All-Star regulars.";
  if (label.startsWith("Made First-team")) return "Four of these guys share the same end-of-season honor.";
  if (label.startsWith("Played for 7+")) return "Four of these guys got around the league.";
  if (label.startsWith("Spent 10+")) return "Four of these guys are about loyalty.";
  if (label.startsWith("Played for")) return "Four of these guys all suited up for the same franchise.";
  if (label.startsWith("Won ")) return "Four of these guys all took home the same award.";
  if (label.includes("picks")) return "Four of these guys have something in common from draft night.";
  if (label.includes("feet")) return "Four of these guys are about height.";
  if (label.startsWith("Scored")) return "Four of these guys are about career scoring.";
  if (label === "Hall of Famers") return "Four of these guys have a spot in Springfield, Massachusetts.";
  if (label.startsWith("Never played in college")) return "Four of these guys took a different road to the NBA.";
  if (label === "Last name is a color") return "Four of these last names belong in a box of crayons.";
  if (label.startsWith("Same first letter")) return "Say these four names out loud and listen.";
  if (label.startsWith("First name") || label.startsWith("Last name")) return "Four of these guys share part of their name.";
  return "Four of these guys share something. Look closely.";
}

function toggleHintMenu() {
  const menu = $("hint-menu");
  menu.hidden = !menu.hidden;
  $("hint-btn").setAttribute("aria-expanded", String(!menu.hidden));
}

function closeHintMenu() {
  $("hint-menu").hidden = true;
  $("hint-btn").setAttribute("aria-expanded", "false");
}

function shuffleGrid() {
  const open = play.order.filter((id) => !play.solved.includes(groupOf(id)));
  for (let i = open.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [open[i], open[j]] = [open[j], open[i]];
  }
  const solvedIds = play.order.filter((id) => play.solved.includes(groupOf(id)));
  play.order = [...solvedIds, ...open];
  saveProgress();
  render();
}

function shareText() {
  const title = play.mode === "daily" ? `Hoop Connections #${play.number}` : "Hoop Connections (practice)";
  const rows = play.guesses.map((tiers) => tiers.map((t) => RANK_EMOJI[t]).join("")).join("\n");
  const n = play.hints.length;
  return `${title}\n${rows}${n ? `\n💡 ${n} hint${n === 1 ? "" : "s"}` : ""}`;
}

async function share() {
  const text = shareText();
  await shareResult(text, $("share-msg"));
}

function say(text, kind = "") {
  $("message").textContent = text;
  $("message").className = `message ${kind}`;
}

// A bubble over the grid for quick feedback ("One away…"), gone after a moment.
let toastTimer = null;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  el.classList.remove("show");
  void el.offsetWidth;   // restart the pop-in
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
}

function shake() {
  const grid = $("grid");
  grid.classList.remove("shake");
  void grid.offsetWidth;   // restart the animation
  grid.classList.add("shake");
}

// ---------- rendering ----------

function render() {
  const daily = play.mode === "daily";
  $("kicker").textContent = daily ? `Puzzle #${play.number} · ${formatDay(play.day)}` : "Practice puzzle";
  const state = $("state");
  state.className = "state";
  state.textContent = daily ? `Puzzle #${play.number}` : "Practice";
  if (play.over) state.classList.add(play.won ? "win" : "lose");

  $("solved").innerHTML = play.solved
    .map((g) => {
      const group = play.groups[g];
      // Each name, plus why he's in the group (years with the team, award years, height…).
      const names = group.players
        .map((id) => {
          const who = play.over ? playerLink(id) : escapeHtml(name(id));
          const why = group.details?.[id];
          return `<span class="cx-member">${who}${why ? ` <small>${escapeHtml(why)}</small>` : ""}</span>`;
        })
        .join("");
      return `
        <li class="cx-group t${g + 1} ${g === play.justSolved ? "fresh" : ""}">
          <span class="cx-group-label">${escapeHtml(group.label)}</span>
          <span class="cx-group-names">${names}</span>
        </li>`;
    })
    .join("");

  play.justSolved = null;
  renderHints();

  const pairIds = new Set(play.hints.filter((h) => h.ids && !play.solved.includes(h.group)).flatMap((h) => h.ids));
  const open = play.order.filter((id) => !play.solved.includes(groupOf(id)));
  $("grid").hidden = !open.length;
  $("grid").innerHTML = open
    .map((id) => `
      <button type="button" class="cx-tile ${play.selected.has(id) ? "selected" : ""} ${pairIds.has(id) ? "hinted" : ""}" data-id="${id}"
              aria-pressed="${play.selected.has(id)}">
        ${pairIds.has(id) ? `<span class="cx-bulb" aria-label="Hint pair">💡</span>` : ""}
        ${avatar(id, "xs")}
        <span>${escapeHtml(name(id))}</span>
      </button>`)
    .join("");

  const left = MISTAKES - play.mistakes;
  $("dots").innerHTML = Array.from({ length: MISTAKES }, (_, i) => `<i class="${i < left ? "on" : ""}"></i>`).join("");
  $("submit").disabled = play.over || play.selected.size !== 4;
  $("deselect").disabled = play.over || !play.selected.size;
  $("shuffle").disabled = play.over;
  $("bar").hidden = play.over;

  $("result").hidden = !play.over;
  if (play.over) renderResult();
  renderStats();
}

function renderHints() {
  const g = hintTarget();
  const used = g === undefined || play.over ? [] : hintsFor(g);
  $("hint-box").hidden = !used.length;
  if (used.length) {
    const group = play.groups[g];
    const line = (kind) => {
      if (kind === "nudge") return `<p class="hint-line">${escapeHtml(nudge(group.label))}</p>`;
      if (kind === "pair") {
        const [a, b] = used.find((h) => h.kind === "pair").ids;
        return `<p class="hint-sub">${escapeHtml(name(a))} and ${escapeHtml(name(b))} are in it together.</p>`;
      }
      return `<p class="hint-line">The category: <strong>${escapeHtml(group.label)}</strong></p>`;
    };
    $("hint-box").innerHTML = `
      <span class="label">Hint · the ${RANK_EMOJI[g + 1]} group</span>
      ${HINT_KINDS.filter((k) => used.some((h) => h.kind === k)).map(line).join("")}`;
  }
  for (const btn of document.querySelectorAll("#hint-menu [data-hint]")) {
    btn.disabled = used.some((h) => h.kind === btn.dataset.hint);
  }
  $("hint-btn").disabled = play.over;
  $("hint-btn").textContent = play.hints.length ? `Hint · ${play.hints.length}` : "Hint";
  if (play.over) closeHintMenu();
}

// Days in a row you solved it.
function winStreak() {
  const history = loadSave().history;
  return streaks(Object.fromEntries(Object.entries(history).filter(([, h]) => h.won))).current;
}

function saveImage() {
  const n = play.hints.length;
  shareImage({
    title: "Hoop Connections",
    kicker: play.mode === "daily" ? `Puzzle #${play.number}` : "Practice puzzle",
    big: play.won ? "Solved" : `${play.found} of 4`,
    grid: play.guesses.map((tiers) => tiers.map((t) => RANK_EMOJI[t]).join("")),
    lines: [`${play.mistakes} mistake${play.mistakes === 1 ? "" : "s"}${n ? ` · ${n} hint${n === 1 ? "" : "s"}` : ""}`],
  }, $("share-msg"));
}

function renderResult() {
  const milestone = play.mode === "daily" && play.won && streakMilestone(winStreak());
  $("milestone").hidden = !milestone;
  $("milestone").textContent = milestone || "";
  const perfect = play.won && play.mistakes === 0 && !play.hints.length;
  $("result").classList.toggle("lose", !play.won);
  $("result-kicker").textContent = play.won ? (perfect ? "Perfect" : "Solved") : "Out of mistakes";
  const n = play.hints.length;
  const hintNote = n ? ` ${n} hint${n === 1 ? "" : "s"}.` : "";
  $("result-title").textContent = play.won
    ? perfect ? "No mistakes." : `${play.mistakes} mistake${play.mistakes === 1 ? "" : "s"}.${hintNote}`
    : `${play.found} of 4 groups found.`;
  $("result-grid").textContent = play.guesses.map((tiers) => tiers.map((t) => RANK_EMOJI[t]).join("")).join("\n");
  $("result-text").textContent = "Colors run from the easiest group to the hardest: 🟩 🟨 🟧 🟥.";
  $("share-msg").textContent = "";
  $("practice").textContent = play.mode === "daily" ? "Practice puzzle" : "Another practice puzzle";
  $("next").hidden = play.mode !== "daily";
  updateCountdown();
}

function updateCountdown() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.round((midnight - now) / 60000));
  $("next").textContent = `Next puzzle in ${Math.floor(mins / 60)}h ${mins % 60}m.`;
  if (play.mode === "daily" && play.day && play.day !== todayKey()) startDaily();
}

function renderStats() {
  const save = loadSave();
  const history = Object.values(save.history);
  $("stats").hidden = !history.length;
  if (!history.length) return;
  $("st-played").textContent = history.length;
  $("st-win").textContent = Math.round((100 * history.filter((h) => h.won).length) / history.length);
  // A streak here counts days in a row you solved it.
  $("st-streak").textContent = winStreak();
  $("st-perfect").textContent = history.filter((h) => h.won && h.mistakes === 0 && !h.hints).length;
}

function formatDay(key) {
  const d = new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ---------- wiring ----------

$("grid").addEventListener("click", (e) => {
  const tile = e.target.closest("[data-id]");
  if (tile) toggle(tile.dataset.id);
});
$("submit").addEventListener("click", submit);
$("deselect").addEventListener("click", () => { play.selected.clear(); render(); });
$("shuffle").addEventListener("click", shuffleGrid);
$("hint-btn").addEventListener("click", toggleHintMenu);
$("hint-menu").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-hint]");
  if (btn && !btn.disabled) useHint(btn.dataset.hint);
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeHintMenu(); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
$("practice").addEventListener("click", startPractice);
setInterval(updateCountdown, 30000);

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    startDaily();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
