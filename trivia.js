// Trivia Wager - ten NBA trivia questions, each from a different category.
// You see the category first and wager 1-10 on it; each number can be used
// once. A right answer scores your wager, so a perfect day is 55. The daily
// set is the same for everyone; Unlimited deals ten random questions.

const STORAGE_KEY = "tw-v1";          // { history: { day: result }, archive, progress: { day, answers } }
const UNLIMITED_KEY = "tw-unlimited";  // { played, best, total }
const MODE_KEY = "tw-mode";
const ROUND = 10;
const MAX_SCORE = (ROUND * (ROUND + 1)) / 2;   // 55

Object.assign(data, {
  cats: {},          // id -> name
  catIds: [],
  questions: [],     // [cat, question, answer, [wrong], note]
  byCat: {},         // cat -> question indexes
});

const play = {
  mode: (() => { try { return localStorage.getItem(MODE_KEY) === "unlimited" ? "unlimited" : "daily"; } catch { return "daily"; } })(),
  day: null, past: false, number: 0,
  items: [],         // [{ q: question index, options: [4 strings] }]
  answers: [],       // [{ wager, choice, correct }]
  wager: null,       // this question's wager, once chosen
  choice: null,      // this question's answer, once chosen
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

// Each category works through its own shuffled list, one question each time
// it comes up, so a question doesn't repeat until its category runs out.
const catOrder = {};
const orderFor = (cat) => (catOrder[cat] ||= shuffledWith(rng(hash(`trivia-order:${cat}`)), data.byCat[cat]));

function dailyItems(day) {
  const used = {};
  for (let d = FIRST_DAY; d < day; d = nextDay(d)) for (const c of dayCats(d)) used[c] = (used[c] || 0) + 1;
  return dayCats(day).map((cat, i) => {
    const order = orderFor(cat);
    const q = order[(used[cat] || 0) % order.length];
    return { q, options: shuffledWith(rng(hash(`trivia-opts:${day}:${i}`)), optionsOf(q)) };
  });
}

function unlimitedItems() {
  const cats = shuffledWith(Math.random, data.catIds).slice(0, ROUND);
  return cats.map((cat) => {
    const list = data.byCat[cat];
    const q = list[Math.floor(Math.random() * list.length)];
    return { q, options: shuffledWith(Math.random, optionsOf(q)) };
  });
}

const optionsOf = (q) => [data.questions[q][2], ...data.questions[q][3]];
const nextDay = (key) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10) + 1)).toISOString().slice(0, 10);

// ---------- saving ----------

const loadSave = () => loadDailySave(STORAGE_KEY);
const writeSave = (save) => writeDailySave(STORAGE_KEY, save);
const loadUnlimited = () => { try { return JSON.parse(localStorage.getItem(UNLIMITED_KEY)) || {}; } catch { return {}; } };

function start() {
  play.wager = null;
  play.choice = null;
  if (play.mode === "unlimited") {
    Object.assign(play, { day: null, past: false, number: 0, items: unlimitedItems(), answers: [], over: false });
    return render();
  }
  const { day, past } = puzzleDay();
  Object.assign(play, { day, past, number: dayNumber(day), items: dailyItems(day), over: false });
  const save = loadSave();
  const done = save.history[day] || save.archive?.[day];
  const progress = !past && save.progress?.day === day ? save.progress : null;
  play.answers = (done || progress)?.answers?.map(([wager, choice, correct]) => ({ wager, choice, correct })) || [];
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
const possible = () => {
  const left = [];
  for (let n = 1; n <= ROUND; n++) if (!usedWagers().has(n) && n !== play.wager) left.push(n);
  return score() + left.reduce((a, b) => a + b, 0) + (play.wager && play.choice == null ? play.wager : 0);
};

// ---------- playing ----------

function wager(n) {
  if (play.over || play.wager != null || usedWagers().has(n)) return;
  play.wager = n;
  render();
}

function answer(i) {
  if (play.over || play.wager == null || play.choice != null) return;
  const item = play.items[play.answers.length];
  play.choice = i;
  const correct = item.options[i] === data.questions[item.q][2];
  play.answers.push({ wager: play.wager, choice: i, correct });
  if (correct) playSound?.("good"); else playSound?.("bad");
  saveProgress();
  render();
}

function next() {
  if (play.choice == null) return;
  play.wager = null;
  play.choice = null;
  if (play.answers.length >= ROUND) return finish();
  render();
  document.getElementById("stage").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

const packed = () => play.answers.map((a) => [a.wager, a.choice, a.correct]);

function saveProgress() {
  if (play.mode !== "daily" || play.past) return;
  const save = loadSave();
  save.progress = { day: play.day, answers: packed() };
  writeSave(save);
}

function finish() {
  play.over = true;
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

function render() {
  for (const btn of document.querySelectorAll(".tw-modes button")) btn.setAttribute("aria-pressed", String(btn.dataset.mode === play.mode));
  $("score").textContent = score();
  $("possible").textContent = possible();

  const state = $("state");
  state.className = "state";
  state.textContent = play.over ? `${score()} / ${MAX_SCORE}` : play.mode === "daily" ? `Daily #${play.number}` : "Unlimited";
  if (play.over) state.classList.add(score() >= 35 ? "win" : "");

  // The ten slots across the top: category, wager, right or wrong.
  $("track").innerHTML = play.items.map((item, i) => {
    const a = play.answers[i];
    const current = i === play.answers.length - (play.choice != null ? 1 : 0) && !play.over;
    const cls = a ? (a.correct ? "right" : "wrong") : current ? "current" : "";
    return `<li class="${cls}" title="${escapeHtml(data.cats[data.questions[item.q][0]])}"><b>${a ? a.wager : current && play.wager ? play.wager : "?"}</b><span>${escapeHtml(shortCat(data.questions[item.q][0]))}</span></li>`;
  }).join("");

  $("stage").hidden = play.over;
  if (!play.over) renderStage();

  $("result").hidden = !play.over;
  $("review").hidden = !play.over;
  if (play.over) renderResult();
  renderStats();
}

// Short labels for the track.
const SHORT = {
  history: "History", champs: "Winners", losers: "Losers", mvp: "MVP", dpoy: "DPOY", statlines: "Stat lines",
  playoffs: "Playoffs", season: "2025-26", jerseys: "Jerseys", trades: "Trades", records: "Records", draft: "Draft",
  year: "Year?", guess: "Who?", coaches: "Coaches", teammates: "Teammates", college: "College",
};
const shortCat = (id) => SHORT[id] || data.cats[id];

function renderStage() {
  const n = play.answers.length - (play.choice != null ? 1 : 0);
  const item = play.items[n];
  const [cat, question, answerText, , note] = data.questions[item.q];
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
  const done = play.choice != null;
  const right = done && item.options[play.choice] === answerText;
  $("stage").innerHTML = `
    <div class="tw-card">
      <div class="tw-meta"><span class="label">${escapeHtml(data.cats[cat])}</span><span class="tw-bet">Wager ${play.wager}</span></div>
      <h2 class="tw-question">${escapeHtml(question)}</h2>
      <div class="tw-options" role="group" aria-label="Answers">${item.options.map((o, i) => {
        const cls = !done ? "" : o === answerText ? "right" : i === play.choice ? "wrong" : "";
        return `<button type="button" class="opt ${cls}" data-choice="${i}" ${done ? "disabled" : ""}><span class="key">${"ABCD"[i]}</span><span>${escapeHtml(o)}</span></button>`;
      }).join("")}</div>
      ${done ? `
        <div class="tw-feedback ${right ? "good" : "bad"}">
          <b>${right ? `Right! +${play.wager}` : `No points. It's ${escapeHtml(answerText)}.`}</b>
          ${note ? `<span>${escapeHtml(note)}</span>` : ""}
        </div>
        <button type="button" class="primary tw-next" id="next-q">${play.answers.length >= ROUND ? "See my score" : "Next category →"}</button>` : ""}
    </div>`;
  for (const b of $("stage").querySelectorAll("[data-choice]")) b.addEventListener("click", () => answer(Number(b.dataset.choice)));
  $("next-q")?.addEventListener("click", next);
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

  $("review").innerHTML = `<span class="label">Your ten</span><ol class="tw-review-list">${play.items.map((item, i) => {
    const [cat, q, answerText] = data.questions[item.q];
    const a = play.answers[i];
    return `<li class="${a.correct ? "right" : "wrong"}"><span class="tw-pts">${a.correct ? `+${a.wager}` : `0/${a.wager}`}</span>
      <span><small>${escapeHtml(data.cats[cat])}</small><b>${escapeHtml(q)}</b>${a.correct ? "" : `<em>Answer: ${escapeHtml(answerText)}</em>`}</span></li>`;
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
  if (play.wager == null && /^[0-9]$/.test(e.key)) wager(e.key === "0" ? 10 : Number(e.key));
  else if (play.wager != null && play.choice == null && "abcd".includes(e.key.toLowerCase()) && e.key.length === 1) answer("abcd".indexOf(e.key.toLowerCase()));
  else if (e.key === "Enter" && play.choice != null) { e.preventDefault(); next(); }
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
