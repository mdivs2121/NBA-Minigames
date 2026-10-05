// College Connect - a college and an NBA franchise. Name anyone who played
// for both (from 1979-80 on). Three guesses a pair; run out and the streak is
// over. Afterward you see everyone who fit, best-known first.

const SAVE_KEY = "cc-v1";   // { level, easy: { streak, best }, hard: { streak, best } }
const GUESSES = 3;
const KNOWN_WS = 15;   // a "known" answer has 15+ career Win Shares
const LEVELS = {
  easy: { minCollege: 30, minKnown: 3 },   // big programs, several well-known answers
  hard: { minCollege: 0, minKnown: 1 },    // any school, at least one well-known answer
};

Object.assign(data, {
  colleges: [], teams: [],
  byId: {},          // id -> { name, fame, colleges: Set, teams: Set }
  collegeSize: [],   // players per college
  labelToId: {},
});

const game = {
  level: loadSaved().level === "hard" ? "hard" : "easy",
  college: null, team: null, answers: [], misses: [], got: null, over: false,
  seen: new Set(),   // "college:team" pairs used this run
};

// ---------- data ----------

async function loadData() {
  const [, file] = await Promise.all([loadCommon(), fetchJson("college_connect")]);
  data.colleges = file.colleges;
  data.teams = file.teams;
  data.collegeSize = file.colleges.map(() => 0);
  const counts = {};
  for (const [, n] of file.players) counts[n] = (counts[n] || 0) + 1;
  for (const [id, n, fame, colleges, teams] of file.players) {
    data.byId[id] = { name: n, fame, colleges: new Set(colleges), teams: new Set(teams) };
    data.players[id] ||= { name: n };
    for (const c of colleges) data.collegeSize[c]++;
    data.labelToId[counts[n] > 1 ? `${n} (${data.colleges[colleges[0]]})` : n] = id;
  }
  $("cc-players").innerHTML = Object.keys(data.labelToId).sort().map((l) => `<option value="${escapeHtml(l)}">`).join("");
}

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
}

function writeSaved(saved) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saved)); } catch {}
}

const record = () => loadSaved()[game.level] || { streak: 0, best: 0 };

// ---------- game ----------

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const fits = (id, college, team) => data.byId[id].colleges.has(college) && data.byId[id].teams.has(team);
const answersFor = (college, team) =>
  Object.keys(data.byId).filter((id) => fits(id, college, team)).sort((a, b) => data.byId[b].fame - data.byId[a].fame);

function newPair() {
  const { minCollege, minKnown } = LEVELS[game.level];
  const colleges = data.colleges.map((c, i) => i).filter((i) => data.collegeSize[i] >= minCollege);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const college = pick(colleges), team = Math.floor(Math.random() * data.teams.length);
    if (game.seen.has(`${college}:${team}`)) continue;
    const answers = answersFor(college, team);
    if (answers.filter((id) => data.byId[id].fame >= KNOWN_WS).length < minKnown) continue;
    game.seen.add(`${college}:${team}`);
    Object.assign(game, { college, team, answers, misses: [], got: null, over: false });
    $("guess").value = "";
    say("");
    render();
    $("guess").focus({ preventScroll: true });
    return;
  }
  game.seen.clear();
  newPair();
}

function setLevel(level) {
  game.level = level;
  game.seen.clear();
  const saved = loadSaved();
  saved.level = level;
  writeSaved(saved);
  newPair();
}

const collegeName = () => data.colleges[game.college];
const teamAbbr = () => data.teams[game.team];
const teamNick = () => TEAM_NICKS[teamAbbr()] || teamAbbr();

function submitGuess() {
  if (game.over) return;
  const text = $("guess").value.trim();
  if (!text) return;
  const id = data.labelToId[text] ?? Object.entries(data.labelToId).find(([l]) => l.toLowerCase() === text.toLowerCase())?.[1];
  if (!id) return say("Pick a name from the list. It only has players who went to college and played from 1980 on.", "bad");
  if (game.misses.includes(id)) return say("You already guessed him.", "bad");
  $("guess").value = "";
  if (fits(id, game.college, game.team)) return finish(id);
  game.misses.push(id);
  const p = data.byId[id];
  const why = !p.colleges.has(game.college) && !p.teams.has(game.team) ? `played for neither`
    : !p.colleges.has(game.college) ? `didn't go to ${collegeName()}` : `never played for the ${teamNick()}`;
  if (game.misses.length >= GUESSES) return finish(null);
  say(`✕ ${p.name} ${why}.`, "bad");
  render();
}

function finish(id) {
  game.over = true;
  game.got = id;
  const saved = loadSaved();
  const r = (saved[game.level] ||= { streak: 0, best: 0 });
  r.streak = id ? r.streak + 1 : 0;
  r.best = Math.max(r.best, r.streak);
  writeSaved(saved);
  if (!id) game.seen.clear();
  if (id) celebrate();
  say("");
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function say(text, kind = "") {
  $("message").textContent = text;
  $("message").className = `message ${kind}`;
}

// ---------- sharing ----------

const levelName = () => (game.level === "hard" ? "Hard" : "Easy");

async function share() {
  const r = record();
  const text = game.got
    ? `College Connect (${levelName()}) 🎓 ${collegeName()} × ${teamNick()}: ${data.byId[game.got].name}\nStreak ${r.streak} · best ${r.best}`
    : `College Connect (${levelName()}) 🎓 Run over at ${r.best ? `best ${r.best}` : "0"}. Stumped by ${collegeName()} × ${teamNick()}`;
  await shareResult(text, $("share-msg"));
}

function saveImage() {
  const r = record();
  shareImage({
    title: "College Connect",
    kicker: `${levelName()} · ${collegeName()} × ${teamNick()}`,
    big: String(r.streak),
    lines: [game.got ? `Got it with ${data.byId[game.got].name}` : "Stumped", `Best streak ${r.best}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

// Team nicknames for the badges (same franchises as the Awards Grid).
const TEAM_NICKS = {
  ATL: "Hawks", BOS: "Celtics", BRK: "Nets", CHI: "Bulls", CHO: "Hornets", CLE: "Cavaliers", DAL: "Mavericks", DEN: "Nuggets",
  DET: "Pistons", GSW: "Warriors", HOU: "Rockets", IND: "Pacers", LAC: "Clippers", LAL: "Lakers", MEM: "Grizzlies", MIA: "Heat",
  MIL: "Bucks", MIN: "Timberwolves", NOP: "Pelicans", NYK: "Knicks", OKC: "Thunder", ORL: "Magic", PHI: "76ers", PHO: "Suns",
  POR: "Trail Blazers", SAC: "Kings", SAS: "Spurs", TOR: "Raptors", UTA: "Jazz", WAS: "Wizards",
};

// Franchises that moved or changed names count their old teams too.
const OLD_NAMES = {
  OKC: "Seattle SuperSonics", BRK: "New Jersey Nets", MEM: "Vancouver Grizzlies", NOP: "New Orleans Hornets",
  CHO: "Charlotte Bobcats and old Hornets", WAS: "Washington Bullets", SAC: "Kansas City Kings", LAC: "San Diego Clippers",
};

function render() {
  for (const btn of document.querySelectorAll(".difficulty button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.level === game.level));
  }
  const r = record();
  $("streak").textContent = r.streak;
  $("best").textContent = r.best;
  $("left").textContent = GUESSES - game.misses.length;
  const state = $("state");
  state.className = "state";
  state.textContent = game.over ? (game.got ? "Got it" : "Stumped") : `${GUESSES - game.misses.length} left`;
  if (game.over) state.classList.add(game.got ? "win" : "lose");

  $("pair").innerHTML = `
    <div class="cc-side cc-college"><span class="label">College</span><b>${escapeHtml(collegeName())}</b></div>
    <span class="cc-x" aria-hidden="true">×</span>
    <div class="cc-side cc-team" style="--team: ${teamColor(teamAbbr())}"><span class="label">Team</span><b>${escapeHtml(teamNick())}</b><small>${OLD_NAMES[teamAbbr()] ? `Includes the ${OLD_NAMES[teamAbbr()]}` : teamAbbr()}</small></div>`;

  $("misses").innerHTML = game.misses.map((m) => `<li>✕ ${escapeHtml(data.byId[m].name)}</li>`).join("");
  $("guess-form").hidden = game.over;
  $("result").hidden = !game.over;
  $("answers").hidden = !game.over;
  if (game.over) {
    const n = game.answers.length;
    const rank = game.got ? game.answers.indexOf(game.got) : -1;
    $("result").classList.toggle("lose", !game.got);
    tintResult(teamAbbr());
    $("result-kicker").textContent = game.got ? (rank === 0 ? "The obvious one" : rank >= n / 2 && n > 3 ? "Deep cut" : "Got it") : "Stumped";
    $("result-title").innerHTML = game.got ? playerLink(game.got, data.byId[game.got].name) : `${n} fit`;
    $("result-text").textContent = game.got
      ? `${n} player${n === 1 ? "" : "s"} fit. Yours was the ${rank + 1 === 1 ? "best-known" : `#${rank + 1} best-known`}. Streak: ${r.streak}. Best: ${r.best}.`
      : `Run over. Best streak: ${r.best}.`;
    $("next").textContent = game.got ? "Next pair" : "New run";
    $("share-msg").textContent = "";
    $("answers").innerHTML = `
      <span class="label">Everyone who fit · ${n}</span>
      <ol class="ag-answer-list">${game.answers.slice(0, 15).map((id) => `<li class="${id === game.got ? "mine" : ""}">${avatar(id, "xs")}${playerLink(id, data.byId[id].name)}</li>`).join("")}</ol>
      ${n > 15 ? `<p class="meta">…and ${n - 15} more.</p>` : ""}`;
  }
}

// ---------- wiring ----------

$("guess-form").addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); });
$("give-up").addEventListener("click", () => !game.over && finish(null));
$("next").addEventListener("click", () => { newPair(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
for (const btn of document.querySelectorAll(".difficulty button")) {
  btn.addEventListener("click", () => setLevel(btn.dataset.level));
}

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newPair();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
