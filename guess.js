// Guess the Player - a daily mystery player. Every guess shows six clues
// compared to the mystery player: 🟩 match, 🟨 close, and arrows for numbers
// (⬆️ means the mystery player's number is higher). Eight guesses.
// Hard mode is a second daily from a deeper pool (older players too), and
// only exact matches get a color.

// Each mode saves { history: { day: result }, archive, progress: { day, guesses, hints } }.
const MODES = {
  normal: { key: eraKey("gp-v1"), seed: eraSeed("guess-the-player:order"), pool: "answer", title: "Guess the Player" },
  hard: { key: eraKey("gp-hard-v1"), seed: eraSeed("guess-the-player-hard:order"), pool: "hard", title: "Guess the Player (Hard)" },
};
const MODE_KEY = "gp-mode";
const MAX_GUESSES = 8;

// Today's divisions. Old team names go where the franchise plays now.
const DIVISIONS = {
  Atlantic: "BOS BRK NJN NYK PHI TOR", Central: "CHI CLE DET IND MIL", Southeast: "ATL CHA CHH CHO MIA ORL WAS WSB",
  Northwest: "DEN MIN OKC SEA POR UTA", Pacific: "GSW LAC SDC LAL PHO SAC KCK", Southwest: "DAL HOU MEM VAN NOP NOH NOK SAS",
};
const DIVISION_OF = Object.fromEntries(Object.entries(DIVISIONS).flatMap(([d, teams]) => teams.split(" ").map((t) => [t, d])));
const EAST_DIVISIONS = new Set(["Atlantic", "Central", "Southeast"]);
const UNDRAFTED = 61;   // counts as pick 61 for the arrows
const HINT_LABELS = ["Career", "College", "Initials"];   // revealed one at a time
// Relocated teams count as the same team (a Sonics guess is right for a Thunder answer).
const FRANCHISE = { NJN: "BRK", SEA: "OKC", VAN: "MEM", NOH: "NOP", NOK: "NOP", CHA: "CHO", CHH: "CHO", WSB: "WAS" };
const franchise = (team) => FRANCHISE[team] || team;

Object.assign(data, {
  byId: {},          // id -> player from guess_player.json
  answers: {},       // mode -> ids that can be a daily answer, in a fixed shuffled order
  labelToId: {},
});

const play = { mode: savedMode(), day: null, past: false, number: 0, answer: null, guesses: [], hints: 0, over: false, won: false };

function savedMode() {
  try { return localStorage.getItem(MODE_KEY) === "hard" ? "hard" : "normal"; } catch { return "normal"; }
}

// ---------- data ----------

async function loadData() {
  const [, file] = await Promise.all([loadCommon(), fetchJson("guess_player")]);
  for (const p of file.players) {
    data.byId[p.id] = p;
    data.players[p.id] ||= { name: p.name };
  }
  // The answer order is a fixed shuffle, so no player repeats until all have been used.
  for (const [mode, { seed, pool }] of Object.entries(MODES)) {
    const ids = file.players.filter((p) => p[pool] && inEra(p.id)).map((p) => p.id).sort();
    const random = rng(hash(seed));
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    data.answers[mode] = ids;
  }

  // Names shared by two players get their debut year.
  const counts = {};
  for (const p of file.players) counts[p.name] = (counts[p.name] || 0) + 1;
  for (const p of file.players) data.labelToId[counts[p.name] > 1 ? `${p.name} (${p.debut - 1})` : p.name] = p.id;
  $("gp-players").innerHTML = Object.keys(data.labelToId).sort().map((l) => `<option value="${escapeHtml(l)}">`).join("");
}

function answerFor(day, mode = play.mode) {
  const ids = data.answers[mode];
  return ids[(((dayNumber(day) - 1) % ids.length) + ids.length) % ids.length];
}

// ---------- clues ----------

const division = (team) => DIVISION_OF[team] || "";
const conference = (team) => (EAST_DIVISIONS.has(division(team)) ? "East" : "West");
const posParts = (pos) => new Set(pos.split("-"));
const feet = (inches) => `${Math.floor(inches / 12)}′${inches % 12}″`;

// Numbers are 🟨 when within 2 (inches, years, picks, All-Star nods).
// Compare one guessed player to the answer: [{ text, color: "green"|"near"|"conf"|"", arrow }]
// Team: 🟩 same team, 🟨 same division, 🟧 same conference.
// Hard mode keeps only exact matches (and the arrows).
function compare(guess, answer, hard = play.mode === "hard") {
  const cells = compareAll(guess, answer);
  return hard ? cells.map((c) => (c.color === "green" ? c : { ...c, color: "" })) : cells;
}

function compareAll(guess, answer) {
  const number = (g, a, close) => ({
    color: g === a ? "green" : Math.abs(g - a) <= close ? "near" : "",
    arrow: g === a ? "" : a > g ? "⬆️" : "⬇️",
  });
  const gp = posParts(guess.pos), ap = posParts(answer.pos);
  const samePos = gp.size === ap.size && [...gp].every((x) => ap.has(x));
  const gPick = guess.pick ?? UNDRAFTED, aPick = answer.pick ?? UNDRAFTED;
  return [
    {
      text: guess.team, sub: `${division(guess.team)} · ${conference(guess.team)}`, arrow: "", team: guess.team,
      color: franchise(guess.team) === franchise(answer.team) ? "green" : division(guess.team) === division(answer.team) ? "near" : conference(guess.team) === conference(answer.team) ? "conf" : "",
    },
    { text: guess.pos, color: samePos ? "green" : [...gp].some((x) => ap.has(x)) ? "near" : "", arrow: "" },
    { text: feet(guess.ht), ...number(guess.ht, answer.ht, 2) },
    { text: String(guess.debut - 1), ...number(guess.debut, answer.debut, 2) },
    // Undrafted only matches undrafted; it's never "close" to a real pick.
    { text: guess.pick ? `#${guess.pick}` : "Undrafted", ...(guess.pick && answer.pick ? number(gPick, aPick, 2) : gPick === aPick ? { color: "green", arrow: "" } : { color: "", arrow: aPick > gPick ? "⬆️" : "⬇️" }) },
    { text: String(guess.allStars), ...number(guess.allStars, answer.allStars, 2) },
  ];
}

const SQUARE = { green: "🟩", near: "🟨", conf: "🟧", "": "⬛" };
const emojiRow = (id) => (id === play.answer ? "🟩".repeat(6) : compare(data.byId[id], data.byId[play.answer]).map((c) => SQUARE[c.color]).join(""));

// ---------- saving ----------

const loadSave = () => loadDailySave(MODES[play.mode].key);
const writeSave = (save) => writeDailySave(MODES[play.mode].key, save);

function setMode(mode) {
  play.mode = mode;
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
  $("guess").value = "";
  start();
}

function start() {
  const { day, past } = puzzleDay();
  Object.assign(play, { day, past, number: dayNumber(day), answer: answerFor(day), over: false, won: false });
  const save = loadSave();
  const done = save.history[day] || save.archive?.[day];
  if (done) {
    play.guesses = done.ids;
    play.hints = done.hints || 0;
    play.over = true;
    play.won = done.won;
  } else {
    const progress = !past && save.progress?.day === day ? save.progress : null;
    play.guesses = progress ? progress.guesses.filter((id) => data.byId[id]) : [];
    play.hints = progress?.hints || 0;
  }
  say("");
  render();
}

function submitGuess() {
  if (play.over) return;
  const text = $("guess").value.trim();
  if (!text) return;
  const id = data.labelToId[text] ?? Object.entries(data.labelToId).find(([l]) => l.toLowerCase() === text.toLowerCase())?.[1];
  if (!id) return say("Pick a name from the list. Names shared by two players include their debut year.", "bad");
  if (play.guesses.includes(id)) return say("You already guessed him.", "bad");
  $("guess").value = "";
  play.guesses.push(id);
  say("");

  if (id === play.answer || play.guesses.length >= MAX_GUESSES) finish(id === play.answer);
  else {
    if (!play.past) {
      const save = loadSave();
      save.progress = { day: play.day, guesses: play.guesses, hints: play.hints };
      writeSave(save);
    }
    render();
  }
}

function useHint() {
  if (play.over || play.hints >= HINT_LABELS.length) return;
  play.hints++;
  if (!play.past) {
    const save = loadSave();
    save.progress = { day: play.day, guesses: play.guesses, hints: play.hints };
    writeSave(save);
  }
  render();
}

function hintText(i) {
  const value = data.byId[play.answer].hints[i];
  if (i === 1 && !value) return "Didn't play in college";
  return value;
}

function finish(won) {
  play.over = true;
  play.won = won;
  const save = loadSave();
  const result = { won, guesses: play.guesses.length, ids: play.guesses, hints: play.hints };
  if (play.past) (save.archive ||= {})[play.day] = result;   // archive plays don't touch streaks
  else { save.history[play.day] = result; save.progress = null; }
  writeSave(save);
  const milestone = !play.past && won && streakMilestone(streaks(loadSave().history).current);
  if (milestone) celebrate({ big: true });
  else if (won) celebrate();
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function say(text, kind = "") {
  $("message").textContent = text;
  $("message").className = `message ${kind}`;
}

// ---------- sharing ----------

const score = () => (play.won ? `${play.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`);
const titleLine = () => `${MODES[play.mode].title} #${play.number}${play.past ? " (archive)" : ""}`;

async function share() {
  const streak = play.past ? 0 : streaks(loadSave().history).current;
  const hints = play.hints ? ` · 💡${play.hints}` : "";
  const text = `${titleLine()} 🕵️ ${score()}${hints}${streak > 1 ? ` · 🔥${streak}` : ""}\n${play.guesses.map(emojiRow).join("\n")}`;
  await shareResult(text, $("share-msg"));
}

function saveImage() {
  shareImage({
    title: MODES[play.mode].title,
    kicker: `#${play.number}${play.past ? " · archive" : ""}`,
    big: score(),
    grid: play.guesses.map(emojiRow),
    lines: [(play.won ? `Got ${name(play.answer)}` : "Stumped") + (play.hints ? ` · ${play.hints} hint${play.hints === 1 ? "" : "s"}` : "")],
  }, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  const answer = data.byId[play.answer];
  for (const btn of document.querySelectorAll(".gp-modes button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.mode === play.mode));
  }
  $("kicker").textContent = `${play.mode === "hard" ? "Hard · " : ""}Daily #${play.number}${play.past ? ` · from ${play.day}` : ""}`;
  $("intro").textContent = play.mode === "hard"
    ? "Eight guesses, a deeper pool of players, and no hints from color: only 🟩 exact matches light up. The arrows still point toward his numbers."
    : "Eight guesses. Each one shows how close you are: 🟩 match, 🟨 close (for the team, same division), 🟧 same conference, and arrows pointing toward the mystery player's number.";
  $("guess-num").textContent = Math.min(play.guesses.length + 1, MAX_GUESSES);

  const state = $("state");
  state.className = "state";
  state.textContent = play.over ? (play.won ? "Got him" : "Stumped") : `${MAX_GUESSES - play.guesses.length} left`;
  if (play.over) state.classList.add(play.won ? "win" : "lose");

  $("hints").hidden = play.hints === 0;
  $("hints").innerHTML = HINT_LABELS.slice(0, play.hints)
    .map((label, i) => `<li><span class="label">${label}</span> <b>${escapeHtml(hintText(i))}</b></li>`).join("");
  const left = HINT_LABELS.length - play.hints;
  $("hint").disabled = left === 0;
  $("hint").innerHTML = `${icon("bulb")} ${left ? `Hint (${left} left)` : "No hints left"}`;

  $("rows").innerHTML = play.guesses
    .map((id) => {
      const g = data.byId[id];
      const right = id === play.answer;
      const cells = compare(g, answer).map((c) => `
        <span class="gp-cell ${right ? "green" : c.color}" ${c.team ? `style="--team: ${teamColor(c.team)}"` : ""}>
          ${c.sub ? `<span class="gp-team">${escapeHtml(c.text)}<small>${escapeHtml(c.sub)}</small></span>` : escapeHtml(c.text)}${c.arrow && !right ? `<i aria-label="${c.arrow === "⬆️" ? "higher" : "lower"}">${c.arrow === "⬆️" ? "↑" : "↓"}</i>` : ""}
        </span>`).join("");
      return `
        <li class="gp-row ${right ? "right" : ""}">
          <span class="gp-who">${avatar(id, "xs")}<b>${escapeHtml(g.name)}</b></span>
          <span class="gp-cells">${cells}</span>
        </li>`;
    })
    .join("");

  $("guess-form").hidden = play.over;
  $("result").hidden = !play.over;
  if (play.over) {
    $("result").classList.toggle("lose", !play.won);
    $("result-kicker").textContent = play.won ? `Got him in ${play.guesses.length}` : "The mystery player was";
    $("result-photo").innerHTML = avatar(play.answer, "md");
    tintResult(answer.team);
    $("result-title").innerHTML = playerLink(play.answer, answer.name);
    $("result-text").textContent = `${answer.team} · ${answer.pos} · ${feet(answer.ht)} · debut ${answer.debut - 1} · ${answer.pick ? `pick #${answer.pick}` : "undrafted"} · ${answer.allStars} All-Star pick${answer.allStars === 1 ? "" : "s"}.`;
    $("result-grid").textContent = play.guesses.map(emojiRow).join("\n");
    const milestone = !play.past && streakMilestone(streaks(loadSave().history).current);
    $("milestone").hidden = !milestone;
    if (milestone) $("milestone").textContent = milestone;
    $("share-msg").textContent = "";
    updateCountdown();
  }
  renderStats();
}

function renderStats() {
  const history = Object.values(loadSave().history);
  const { current, best } = streaks(loadSave().history);
  const wins = history.filter((h) => h.won);
  const todays = play.over && !play.past ? (play.won ? play.guesses.length : "X") : null;
  statsPanel($("stats"), {
    title: play.mode === "hard" ? "Your stats · Hard" : "Your stats",
    cells: [["Played", history.length], ["Win %", history.length ? Math.round((100 * wins.length) / history.length) : 0], ["Streak", current], ["Best streak", best]],
    distTitle: "Guesses to get him",
    rows: [1, 2, 3, 4, 5, 6, 7, 8, "X"].map((n) => [n, history.filter((h) => (h.won ? h.guesses : "X") === n).length, n === todays]),
  });
}

function updateCountdown() {
  if (play.past) { $("next").textContent = ""; return; }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.round((midnight - now) / 60000));
  $("next").textContent = `Next mystery player in ${Math.floor(mins / 60)}h ${mins % 60}m.`;
  if (play.day !== todayKey()) start();   // past midnight with the page open
}

// ---------- wiring ----------

$("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
$("hint").addEventListener("click", useHint);
for (const btn of document.querySelectorAll(".gp-modes button")) {
  btn.addEventListener("click", () => btn.dataset.mode !== play.mode && setMode(btn.dataset.mode));
}
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    start();
    setInterval(() => play.over && updateCountdown(), 30000);
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
