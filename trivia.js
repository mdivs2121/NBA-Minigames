// Trivia Wager - ten NBA trivia questions, each from a different category.
// You see the category first and wager 1-10 on it; each number can be used
// once. Then you type the answer. Spelling is forgiven generously (last names,
// nicknames, team cities, and close misspellings all count). A right answer
// scores your wager, so a perfect day is 55. The daily set is the same for
// everyone; Unlimited deals ten random questions.

const STORAGE_KEY = "tw-v2";          // { history: { day: result }, archive, progress: { day, answers } }
const UNLIMITED_KEY = "tw-unlimited";  // { played, best, total }
const MODE_KEY = "tw-mode";
const ROUND = 10;
const MAX_SCORE = (ROUND * (ROUND + 1)) / 2;   // 55

Object.assign(data, {
  cats: {},          // id -> name
  catIds: [],
  questions: [],     // [cat, question, answer, kind, [accepted forms], note]
  byCat: {},         // cat -> question indexes
});

const play = {
  mode: (() => { try { return localStorage.getItem(MODE_KEY) === "unlimited" ? "unlimited" : "daily"; } catch { return "daily"; } })(),
  day: null, past: false, number: 0,
  items: [],         // question indexes, in order
  answers: [],       // [{ wager, text, correct, close }]
  wager: null,       // this question's wager, once chosen
  answered: false,   // this question has been answered
  over: false,
};

// ---------- data ----------

async function loadData() {
  const [, file] = await Promise.all([loadCommon(), fetchJson("trivia")]);
  for (const [id, label] of file.cats) { data.cats[id] = label; data.catIds.push(id); }
  data.questions = file.questions;
  file.questions.forEach(([cat], i) => (data.byCat[cat] ||= []).push(i));
}

const shuffledWith = (random, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// The day's ten categories (a seeded shuffle).
const dayCats = (day) => shuffledWith(rng(hash(`trivia-cats:${day}`)), data.catIds).slice(0, ROUND);

// Each category works through its own seeded order, one question each time it
// comes up, so a question doesn't repeat until its category runs out. Ordering
// by a hash of the question text keeps old days stable when questions are added.
const catOrder = {};
const orderFor = (cat) => (catOrder[cat] ||= [...data.byCat[cat]].sort((a, b) =>
  hash(`trivia-order:${data.questions[a][1]}`) - hash(`trivia-order:${data.questions[b][1]}`)));

function dailyItems(day) {
  const used = {};
  for (let d = FIRST_DAY; d < day; d = nextDay(d)) for (const c of dayCats(d)) used[c] = (used[c] || 0) + 1;
  return dayCats(day).map((cat) => {
    const order = orderFor(cat);
    return order[(used[cat] || 0) % order.length];
  });
}

function unlimitedItems() {
  return shuffledWith(Math.random, data.catIds).slice(0, ROUND).map((cat) => {
    const list = data.byCat[cat];
    return list[Math.floor(Math.random() * list.length)];
  });
}

const nextDay = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10) + 1)).toISOString().slice(0, 10);

// ---------- judging typed answers ----------
// Very forgiving: accents, punctuation, capitals, "the", and spelling slips
// don't matter. About a third of the letters can be off on longer names.

const norm = (s) => fold(String(s)).replace(/&/g, " and ").replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");

function lev(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

const slack = (n) => (n <= 3 ? 0 : n <= 5 ? 1 : n <= 8 ? 2 : Math.floor(n * 0.34));

// Every run of 1-4 words in what they typed, so "i think lebron" still matches "lebron".
function chunks(text) {
  const words = norm(text).split(" ").filter(Boolean);
  const out = new Set([words.join(" ")]);
  for (let n = 1; n <= Math.min(4, words.length); n++) {
    for (let i = 0; i + n <= words.length; i++) out.add(words.slice(i, i + n).join(" "));
  }
  return [...out].filter(Boolean);
}

// "exact" when it matches a form outright, "close" when it's within the typo slack.
function closeness(text, form) {
  const b = norm(form);
  if (!b) return null;
  let best = null;
  const bLast = b.split(" ").at(-1);
  for (const a of chunks(text)) {
    if (a === b || a.replace(/ /g, "") === b.replace(/ /g, "")) return "exact";
    if (/\d/.test(b)) continue;   // numbers have to be exact
    if (!(lev(a, b) <= slack(b.length) || lev(a.replace(/ /g, ""), b.replace(/ /g, "")) <= slack(b.length))) continue;
    // Two-word names: the last word has to be close too, so "Jalen Brunson" isn't "Jaylen Brown".
    const aLast = a.split(" ").at(-1);
    if (b.includes(" ") && a.includes(" ") && lev(aLast, bLast) > slack(bLast.length)) continue;
    best = "close";
  }
  return best;
}

const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv"]);
function playerForms(forms) {
  const out = [...forms];
  for (const f of forms) {
    const words = norm(f).split(" ").filter((w) => !SUFFIX.has(w));
    if (words.length > 1 && words.at(-1).length >= 3) out.push(words.at(-1));   // last name alone
  }
  return out;
}

// Returns { correct, close } for what they typed.
function judgeAnswer(text, q) {
  const [, , , kind, forms] = data.questions[q];
  const typed = norm(text);
  if (!typed) return { correct: false, close: false };
  const numbers = typed.match(/\d+/g) || [];
  if (kind === "num") return { correct: numbers.includes(forms[0]), close: false };
  if (kind === "year") {
    const year = forms[0];
    return { correct: numbers.some((n) => n === year || (n.length === 2 && n === year.slice(2))), close: false };
  }
  if (kind === "all") {
    const results = forms.map((part) => part.split("|").map((alt) => closeness(text, alt)).find(Boolean) || null);
    return { correct: results.every(Boolean), close: results.includes("close") };
  }
  const list = kind === "player" ? playerForms(forms) : forms;
  let close = false;
  for (const f of list) {
    const c = closeness(text, f);
    if (c === "exact") return { correct: true, close: false };
    if (c === "close") close = true;
  }
  return { correct: close, close };
}

// ---------- saving ----------

const loadSave = () => loadDailySave(STORAGE_KEY);
const writeSave = (save) => writeDailySave(STORAGE_KEY, save);
const loadUnlimited = () => { try { return JSON.parse(localStorage.getItem(UNLIMITED_KEY)) || {}; } catch { return {}; } };

function start() {
  play.wager = null;
  play.answered = false;
  if (play.mode === "unlimited") {
    Object.assign(play, { day: null, past: false, number: 0, items: unlimitedItems(), answers: [], over: false });
    return render();
  }
  const { day, past } = puzzleDay();
  Object.assign(play, { day, past, number: dayNumber(day), items: dailyItems(day), over: false });
  const save = loadSave();
  const done = save.history[day] || save.archive?.[day];
  const progress = !past && save.progress?.day === day ? save.progress : null;
  play.answers = (done || progress)?.answers?.map(([wager, text, correct, close]) => ({ wager, text, correct, close })) || [];
  play.over = Boolean(done);
  if (!done && play.answers.length >= ROUND) return finish();   // answered all ten, then left before the score
  render();
}

function setMode(mode) {
  play.mode = mode;
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
  start();
}

const score = () => play.answers.reduce((sum, a) => sum + (a.correct ? a.wager : 0), 0);
const usedWagers = () => new Set(play.answers.map((a) => a.wager));
// Your score plus every wager you haven't used yet (the current one counts until it's answered).
const possible = () => {
  let left = 0;
  for (let n = 1; n <= ROUND; n++) if (!usedWagers().has(n)) left += n;
  return score() + left;
};

// ---------- playing ----------

function wager(n) {
  if (play.over || play.wager != null || usedWagers().has(n)) return;
  play.wager = n;
  render();
  setTimeout(() => document.getElementById("tw-answer")?.focus(), 0);
}

function submitAnswer(text) {
  if (play.over || play.wager == null || play.answered) return;
  const q = play.items[play.answers.length];
  const { correct, close } = text.trim() ? judgeAnswer(text, q) : { correct: false, close: false };
  play.answers.push({ wager: play.wager, text: text.trim(), correct, close });
  play.answered = true;
  playSound(correct ? "good" : "bad");
  saveProgress();
  render();
  setTimeout(() => document.getElementById("next-q")?.focus(), 0);
}

function next() {
  if (!play.answered) return;
  play.wager = null;
  play.answered = false;
  if (play.answers.length >= ROUND) return finish();
  render();
  document.getElementById("stage").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const packed = () => play.answers.map((a) => [a.wager, a.text, a.correct, a.close]);

function saveProgress() {
  if (play.mode !== "daily" || play.past) return;
  const save = loadSave();
  save.progress = { day: play.day, answers: packed() };
  writeSave(save);
}

function finish() {
  play.over = true;
  play.wager = null;
  play.answered = false;
  const s = score();
  if (play.mode === "daily") {
    const save = loadSave();
    const result = { score: s, correct: play.answers.filter((a) => a.correct).length, answers: packed() };
    if (play.past) (save.archive ||= {})[play.day] = result;   // archive plays don't touch streaks
    else { save.history[play.day] = result; save.progress = null; }
    writeSave(save);
  } else {
    const u = loadUnlimited();
    const saved = { played: (u.played || 0) + 1, best: Math.max(u.best || 0, s), total: (u.total || 0) + s };
    try { localStorage.setItem(UNLIMITED_KEY, JSON.stringify(saved)); } catch {}
  }
  const milestone = play.mode === "daily" && !play.past && streakMilestone(streaks(loadSave().history).current);
  if (milestone) celebrate({ big: true });
  else if (s >= 40) celebrate();
  render();
  $("result").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ---------- sharing ----------

const emojiLine = () => play.answers.map((a) => `${a.correct ? "✅" : "❌"}${a.wager}`).join(" ");

async function share() {
  const title = play.mode === "daily" ? `Trivia Wager #${play.number}${play.past ? " (archive)" : ""}` : "Trivia Wager (unlimited)";
  const right = play.answers.filter((a) => a.correct).length;
  const streak = play.mode === "daily" && !play.past ? streaks(loadSave().history).current : 0;
  const text = `${title} 🧠 ${score()}/${MAX_SCORE} · ${right}/${ROUND} right${streak > 1 ? ` · 🔥${streak}` : ""}\n${emojiLine()}`;
  await shareResult(text, $("share-msg"));
}

function saveImage() {
  const rows = [play.answers.slice(0, 5), play.answers.slice(5)].map((part) => part.map((a) => (a.correct ? "🟩" : "🟥")).join(""));
  shareImage({
    title: "Trivia Wager",
    kicker: play.mode === "daily" ? `#${play.number}${play.past ? " · archive" : ""}` : "Unlimited",
    big: `${score()}/${MAX_SCORE}`,
    grid: rows,
    lines: [`${play.answers.filter((a) => a.correct).length} of ${ROUND} right`, `Wagers: ${play.answers.map((a) => a.wager).join(" ")}`],
  }, $("share-msg"));
}

// ---------- rendering ----------

// Short labels for the track.
const SHORT = {
  history: "History", champs: "Winners", losers: "Losers", mvp: "MVP", dpoy: "DPOY", statlines: "Stat lines",
  playoffs: "Playoffs", season: "2025-26", jerseys: "Jerseys", trades: "Trades", records: "Records", draft: "Draft",
  year: "Year?", guess: "Who?", coaches: "Coaches", teammates: "Teammates", college: "College", fmvp: "Finals MVP",
};
const shortCat = (id) => SHORT[id] || data.cats[id];

function render() {
  for (const btn of document.querySelectorAll(".tw-modes button")) btn.setAttribute("aria-pressed", String(btn.dataset.mode === play.mode));
  $("score").textContent = score();
  $("possible").textContent = possible();

  const state = $("state");
  state.className = "state";
  state.textContent = play.over ? `${score()} / ${MAX_SCORE}` : play.mode === "daily" ? `Daily #${play.number}` : "Unlimited";
  if (play.over && score() >= 35) state.classList.add("win");

  // The ten slots across the top: category, wager, right or wrong.
  const at = play.answers.length - (play.answered ? 1 : 0);
  $("track").innerHTML = play.items.map((q, i) => {
    const a = play.answers[i];
    const current = i === at && !play.over;
    const cls = a ? (a.correct ? "right" : "wrong") : current ? "current" : "";
    return `<li class="${cls}" title="${escapeHtml(data.cats[data.questions[q][0]])}"><b>${a ? a.wager : current && play.wager ? play.wager : "?"}</b><span>${escapeHtml(shortCat(data.questions[q][0]))}</span></li>`;
  }).join("");

  $("stage").hidden = play.over;
  if (!play.over) renderStage();

  $("result").hidden = !play.over;
  $("review").hidden = !play.over;
  if (play.over) renderResult();
  renderStats();
}

function renderStage() {
  const n = play.answers.length - (play.answered ? 1 : 0);
  const q = play.items[n];
  const [cat, question, answerText, , , note] = data.questions[q];
  const used = usedWagers();
  if (play.wager == null) {
    $("stage").innerHTML = `
      <div class="tw-card">
        <span class="label">Question ${n + 1} of ${ROUND}</span>
        <h2 class="tw-cat">${escapeHtml(data.cats[cat])}</h2>
        <p class="meta">How sure are you about this category? Wager a number. Get it right and you score it; each number works once.</p>
        <div class="tw-wagers" role="group" aria-label="Wager">${Array.from({ length: ROUND }, (_, k) => k + 1).map((w) => `
          <button type="button" class="tw-wager" data-wager="${w}" ${used.has(w) ? "disabled" : ""} aria-label="Wager ${w}">${w}</button>`).join("")}
        </div>
      </div>`;
    for (const b of $("stage").querySelectorAll("[data-wager]")) b.addEventListener("click", () => wager(Number(b.dataset.wager)));
    return;
  }
  const a = play.answered ? play.answers[n] : null;
  $("stage").innerHTML = `
    <div class="tw-card">
      <div class="tw-meta"><span class="label">${escapeHtml(data.cats[cat])}</span><span class="tw-bet">Wager ${play.wager}</span></div>
      <h2 class="tw-question">${escapeHtml(question)}</h2>
      ${a ? `
        <div class="tw-feedback ${a.correct ? "good" : "bad"}">
          <b>${a.correct ? `${a.close ? "Close enough! " : "Right! "}+${play.wager}` : a.text ? "Not quite. No points." : "Skipped. No points."}</b>
          ${a.text ? `<span>You wrote: <i>${escapeHtml(a.text)}</i></span>` : ""}
          <span class="tw-answer">Answer: <b>${escapeHtml(answerText)}</b></span>
          ${note ? `<span>${escapeHtml(note)}</span>` : ""}
        </div>
        <button type="button" class="primary tw-next" id="next-q">${play.answers.length >= ROUND ? "See my score" : "Next category →"}</button>` : `
        <form class="tw-form" id="tw-form" autocomplete="off">
          <label for="tw-answer" class="label">Your answer</label>
          <div class="guess-row">
            <input id="tw-answer" placeholder="Type your answer… spelling doesn't have to be perfect" autocomplete="off" autocapitalize="off" spellcheck="false">
            <button type="submit" class="primary">Answer</button>
          </div>
          <button type="button" class="ghost tw-skip" id="tw-skip">I don't know</button>
        </form>`}
    </div>`;
  if (a) $("next-q").addEventListener("click", next);
  else {
    $("tw-form").addEventListener("submit", (e) => { e.preventDefault(); const t = $("tw-answer").value; if (t.trim()) submitAnswer(t); });
    $("tw-skip").addEventListener("click", () => submitAnswer(""));
  }
}

function renderResult() {
  const s = score();
  const right = play.answers.filter((a) => a.correct).length;
  $("result").classList.toggle("lose", s < 25);
  $("result-kicker").textContent = s === MAX_SCORE ? "Perfect wager" : s >= 45 ? "Sharp" : s >= 30 ? "Solid" : "Rough day";
  $("result-title").textContent = `${s} / ${MAX_SCORE}`;
  $("result-grid").textContent = emojiLine();
  const u = loadUnlimited();
  $("result-text").textContent = play.mode === "daily"
    ? `${right} of ${ROUND} right. Your wagers turned that into ${s} of a possible ${MAX_SCORE}. Share it and see if your friends can beat it on the same ten questions.`
    : `${right} of ${ROUND} right. Unlimited best: ${u.best || s}. Average: ${u.played ? Math.round(u.total / u.played) : s}.`;
  $("again").hidden = play.mode !== "unlimited";
  const milestone = play.mode === "daily" && !play.past && streakMilestone(streaks(loadSave().history).current);
  $("milestone").hidden = !milestone;
  if (milestone) $("milestone").textContent = milestone;
  $("share-msg").textContent = "";
  updateCountdown();

  $("review").innerHTML = `<span class="label">Your ten</span><ol class="tw-review-list">${play.items.map((q, i) => {
    const [cat, question, answerText] = data.questions[q];
    const a = play.answers[i];
    return `<li class="${a.correct ? "right" : "wrong"}"><span class="tw-pts">${a.correct ? `+${a.wager}` : `0/${a.wager}`}</span>
      <span><small>${escapeHtml(data.cats[cat])}</small><b>${escapeHtml(question)}</b>
      <em>${a.correct ? "" : a.text ? `You wrote ${escapeHtml(a.text)} · ` : "Skipped · "}Answer: ${escapeHtml(answerText)}</em></span></li>`;
  }).join("")}</ol>`;
}

function renderStats() {
  if (play.mode !== "daily") { $("stats").hidden = true; return; }
  const save = loadSave();
  const history = Object.values(save.history);
  const { current, best } = streaks(save.history);
  const todays = play.over && !play.past ? bucketOf(score()) : null;
  statsPanel($("stats"), {
    cells: [["Played", history.length], ["Average", history.length ? Math.round(history.reduce((a, h) => a + h.score, 0) / history.length) : "–"],
      ["Streak", current], ["Best streak", best]],
    distTitle: "Daily scores",
    rows: ["50+", "40s", "30s", "20s", "<20"].map((b) => [b, history.filter((h) => bucketOf(h.score) === b).length, b === todays]),
  });
}

const bucketOf = (s) => (s >= 50 ? "50+" : s >= 40 ? "40s" : s >= 30 ? "30s" : s >= 20 ? "20s" : "<20");

function updateCountdown() {
  if (play.mode !== "daily" || play.past) { $("next").textContent = ""; return; }
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const mins = Math.max(0, Math.round((midnight - now) / 60000));
  $("next").textContent = `New questions in ${Math.floor(mins / 60)}h ${mins % 60}m. Try Unlimited in the meantime.`;
  if (play.day !== todayKey()) start();
}

// ---------- wiring ----------

for (const btn of document.querySelectorAll(".tw-modes button")) {
  btn.addEventListener("click", () => btn.dataset.mode !== play.mode && setMode(btn.dataset.mode));
}
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);
$("again").addEventListener("click", () => { start(); window.scrollTo({ top: 0, behavior: "smooth" }); });
document.addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea") || $("game").hidden || play.over || document.querySelector("dialog[open]")) return;
  if (play.wager == null && /^[0-9]$/.test(e.key)) { e.preventDefault(); wager(e.key === "0" ? 10 : Number(e.key)); }
  else if (e.key === "Enter" && play.answered && e.target.id !== "next-q") { e.preventDefault(); next(); }
});

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
