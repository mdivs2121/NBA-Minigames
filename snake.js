// Snake Draft - you and a computer GM (or a friend on the same device) take
// turns drafting single player-seasons (like 2015-16 Stephen Curry) into a
// starting five: 2 guards, 2 forwards, and a center. Box score stats are
// shown; Win Shares stay hidden and decide the winner.
//
// Internally the two sides are always "you" and "bot"; against a friend,
// "bot" is simply the second person.

const POOL = { G: 11, F: 11, C: 8 };        // cards per position, 30 total
const TRAPS = 2;                            // 20+ PPG seasons with few Win Shares
const LINEUP = ["G", "G", "F", "F", "C"];
const SLOT_NAMES = { G: "Guard", F: "Forward", C: "Center" };
const BOT_DELAY = 750;
const RECORD_KEY = "sd-record";             // { rookie: { w, l }, ... }

// How each computer GM values a season. The Rookie GM falls for big scoring
// numbers; the others see Win Shares, with less guesswork the better they are.
const LEVELS = {
  rookie:  { name: "Rookie GM", value: (s) => s.ppg + 0.5 * s.rpg + 0.5 * s.apg, noise: 3 },
  allstar: { name: "All-Star GM", value: (s) => s.ws, noise: 5.5 },
  hof:     { name: "Hall of Fame GM", value: (s) => s.ws, noise: 2 },
  friend:  { name: "Friend", friend: true },   // two people, one device
};
const NAMES_KEY = "sd-names";

const vsFriend = () => Boolean(LEVELS[game.level].friend);

function loadNames() {
  try { return { you: "Player 1", bot: "Player 2", ...JSON.parse(localStorage.getItem(NAMES_KEY)) }; }
  catch { return { you: "Player 1", bot: "Player 2" }; }
}

// What to call a side: against a friend, the names they typed in.
function sideName(who) {
  if (vsFriend()) return loadNames()[who].trim() || (who === "you" ? "Player 1" : "Player 2");
  return who === "you" ? "You" : LEVELS[game.level].name;
}

// Whose picks the board is showing: the person on the clock, or you against a bot.
const drafter = () => (vsFriend() && !game.over ? onTheClock() : "you");

Object.assign(data, {
  seasons: [],      // every draftable season from snake.json
});

const game = {
  level: loadLevel(),
  pool: [],         // 30 seasons
  order: [],        // "you" | "bot", 10 picks in snake order
  pick: 0,          // index into order
  picks: [],        // [{ who, season }]
  filter: "all",
  over: false,
  thinking: false,
};

// ---------- data ----------

async function loadData() {
  const [, seasons] = await Promise.all([loadCommon(), fetchJson("snake")]);
  data.seasons = seasons;
  // Older players aren't in players.json; add their names for avatar().
  for (const s of seasons) data.players[s.id] ||= { name: s.name };
}

// ---------- setup ----------

const random = (list) => list[Math.floor(Math.random() * list.length)];
const key = (s) => `${s.id}:${s.season}`;

function buildPool() {
  const pool = [], players = new Set();
  const take = (candidates, n) => {
    for (let tries = 0; n > 0 && tries < 5000; tries++) {
      const s = random(candidates);
      if (players.has(s.id)) continue;       // one season per player
      players.add(s.id);
      pool.push(s);
      n--;
    }
  };
  const traps = data.seasons.filter((s) => s.ws < 4);
  const good = data.seasons.filter((s) => s.ws >= 4);
  take(traps, TRAPS);
  for (const [slot, n] of Object.entries(POOL)) {
    take(good.filter((s) => s.slot === slot), n - pool.filter((s) => s.slot === slot).length);
  }
  return pool.sort((a, b) => a.name.localeCompare(b.name));
}

// Two teams, snake order: A B B A A B B A A B.
function snakeOrder(youFirst) {
  const [a, b] = youFirst ? ["you", "bot"] : ["bot", "you"];
  return [a, b, b, a, a, b, b, a, a, b];
}

function newGame() {
  Object.assign(game, {
    pool: buildPool(),
    order: snakeOrder(Math.random() < 0.5),
    pick: 0,
    picks: [],
    filter: "all",
    over: false,
    thinking: false,
  });
  $("result").hidden = true;
  render();
  maybeBotPick();
}

function setLevel(level) {
  game.level = level;
  try { localStorage.setItem("sd-level", level); } catch {}
  newGame();
}

function loadLevel() {
  try {
    const saved = localStorage.getItem("sd-level");
    if (saved in LEVELS) return saved;
  } catch {}
  return "allstar";
}

// ---------- drafting ----------

const teamOf = (who) => game.picks.filter((p) => p.who === who).map((p) => p.season);
const taken = (s) => game.picks.find((p) => p.season === s);
const onTheClock = () => game.order[game.pick];

function openSlots(who) {
  const open = [...LINEUP];
  for (const s of teamOf(who)) open.splice(open.indexOf(s.slot), 1);
  return open;
}

function canDraft(who, s) {
  return !game.over && !taken(s) && openSlots(who).includes(s.slot);
}

function draft(who, s) {
  if (onTheClock() !== who || !canDraft(who, s)) return;
  game.picks.push({ who, season: s, number: game.pick + 1 });
  game.pick++;
  if (game.pick === game.order.length) finish();
  render();
  maybeBotPick();
}

function maybeBotPick() {
  if (game.over || vsFriend() || onTheClock() !== "bot") return;
  game.thinking = true;
  render();
  const pickNumber = game.pick;
  setTimeout(() => {
    if (game.pick !== pickNumber || game.over) return;   // a new game started meanwhile
    game.thinking = false;
    draft("bot", botChoice());
  }, BOT_DELAY);
}

function botChoice() {
  const { value, noise } = LEVELS[game.level];
  const legal = game.pool.filter((s) => canDraft("bot", s));
  // A rough normal-ish random number: the average of a few uniform ones.
  const jitter = () => ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * 2 * noise * 1.7;
  return legal.reduce((best, s) => {
    const guess = value(s) + jitter();
    return guess > best.guess ? { s, guess } : best;
  }, { s: null, guess: -Infinity }).s;
}

// ---------- scoring ----------

const totalWs = (who) => teamOf(who).reduce((sum, s) => sum + s.ws, 0);

// Turn the Win Shares gap into a believable final score.
function finalScore() {
  const you = totalWs("you"), bot = totalWs("bot");
  const margin = (you - bot) * 1.1;
  let a = Math.round(108 + margin / 2), b = Math.round(108 - margin / 2);
  if (a === b && you !== bot) you > bot ? a++ : b++;
  return { you, bot, a, b };
}

function finish() {
  game.over = true;
  const { you, bot } = finalScore();
  if (vsFriend()) {   // no record against a friend; just cheer the winner
    if (you !== bot) celebrate();
    return;
  }
  const record = loadRecord();
  const r = (record[game.level] ||= { w: 0, l: 0, t: 0 });
  if (you > bot) r.w++;
  else if (you < bot) r.l++;
  else r.t = (r.t || 0) + 1;
  try { localStorage.setItem(RECORD_KEY, JSON.stringify(record)); } catch {}
  if (you > bot && game.level !== "rookie") celebrate();
}

function loadRecord() {
  try { return JSON.parse(localStorage.getItem(RECORD_KEY)) || {}; } catch { return {}; }
}

const shortSeason = (season) => `'${season.slice(-2)}`;
const lastName = (name) => name.split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w)).pop();

async function share() {
  const { a, b, you, bot } = finalScore();
  const fiveOf = (who) => teamOf(who).map((s) => `${lastName(s.name)} ${shortSeason(s.season)}`).join(", ");
  let text;
  if (vsFriend()) {
    const [p1, p2] = [sideName("you"), sideName("bot")];
    const line = you === bot ? `${p1} and ${p2} tied ${a}–${b}` : you > bot ? `${p1} beat ${p2} ${a}–${b}` : `${p2} beat ${p1} ${b}–${a}`;
    text = `Snake Draft 🐍🏀 ${p1} vs ${p2}\n${line}\n${p1}: ${fiveOf("you")}\n${p2}: ${fiveOf("bot")}`;
  } else {
    const verdict = you > bot ? "Won" : you < bot ? "Lost" : "Tied";
    text = `Snake Draft 🐍🏀 vs ${LEVELS[game.level].name}\n${verdict} ${a}–${b}\n${fiveOf("you")}`;
  }
  await shareResult(text, $("share-msg"));
}

// ---------- rendering ----------

function render() {
  const level = LEVELS[game.level];
  for (const btn of document.querySelectorAll(".difficulty button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.level === game.level));
  }
  for (const btn of document.querySelectorAll("#filters button")) {
    btn.setAttribute("aria-pressed", String(btn.dataset.filter === game.filter));
  }

  const first = game.order[0];
  const rec = !vsFriend() && loadRecord()[game.level];
  const coin = vsFriend()
    ? `${sideName(first)} won the coin flip and picks first. Pass the device after each pick.`
    : first === "you" ? "You won the coin flip and pick first." : `The ${level.name} won the coin flip and picks first.`;
  $("intro").textContent =
    `30 real seasons from 1979-80 on. Fill 2 guards, 2 forwards, and a center. ${coin} ` +
    `The five with more total Win Shares wins, and Win Shares stay hidden until the end.` +
    (rec ? ` Your record vs the ${level.name}: ${rec.w}–${rec.l}${rec.t ? `–${rec.t}` : ""}.` : "");
  $("friend-names").hidden = !vsFriend();
  $("you-name").textContent = vsFriend() ? `${sideName("you")}'s five` : "Your five";
  $("bot-name").textContent = `${sideName("bot")}'s five`;

  const state = $("state");
  state.className = "state";
  if (game.over) {
    const { you, bot, a, b } = finalScore();
    if (vsFriend()) {
      state.textContent = you === bot ? `Tie ${a}–${b}` : `${sideName(you > bot ? "you" : "bot")} wins`;
      state.classList.add("win");
    } else {
      state.textContent = `${you > bot ? "Win" : you < bot ? "Loss" : "Tie"} ${a}–${b}`;
      state.classList.add(you >= bot ? "win" : "lose");
    }
  } else if (vsFriend()) {
    state.textContent = `Pick ${game.pick + 1} of 10 · ${sideName(onTheClock())} is on the clock`;
  } else {
    state.textContent = `Pick ${game.pick + 1} of 10 · ${game.thinking ? `${level.name} is on the clock…` : "You're on the clock"}`;
  }

  $("order").innerHTML = game.order
    .map((who, i) => {
      const cls = i < game.pick ? "done" : i === game.pick && !game.over ? "now" : "";
      const tag = vsFriend() ? escapeHtml(sideName(who).slice(0, 8)) : who === "you" ? "You" : "Bot";
      return `<li class="${who} ${cls}"><span>${i + 1}</span>${tag}</li>`;
    })
    .join("");

  renderTeam("you");
  renderTeam("bot");
  renderPool();
  if (game.over) renderResult();
}

function renderTeam(who) {
  const team = teamOf(who);
  const slots = LINEUP.map((slot) => ({ slot, season: null }));
  for (const s of team) slots.find((x) => x.slot === s.slot && !x.season).season = s;
  $(who).innerHTML = slots
    .map(({ slot, season: s }) =>
      s
        ? `<li class="sd-slot filled">
             <span class="sd-pos">${slot}</span>
             ${avatar(s.id, "xs")}
             <span class="sd-slot-body">
               <span class="sd-slot-name">${game.over ? playerLink(s.id, s.name) : escapeHtml(s.name)}</span>
               <span class="sd-slot-sub">${s.season} · ${s.teams.join("/")}</span>
             </span>
             ${game.over ? `<span class="sd-ws">${s.ws.toFixed(1)}<small> WS</small></span>` : ""}
           </li>`
        : `<li class="sd-slot"><span class="sd-pos">${slot}</span><span class="sd-slot-empty">${SLOT_NAMES[slot]}</span></li>`
    )
    .join("");
  $(`${who}-total`).textContent = game.over ? `${totalWs(who).toFixed(1)} WS` : `${team.length}/5`;
}

const SLOT_GROUPS = { G: "Guards", F: "Forwards", C: "Centers" };

// With "All" picked, the pool is laid out like a depth chart: a column per
// position. A single-position filter shows just that group.
function renderPool() {
  const slots = game.filter === "all" ? ["G", "F", "C"] : [game.filter];
  // "over" keeps undrafted cards readable once the draft ends.
  $("pool").className = `${game.over ? "over" : ""} ${slots.length > 1 ? "sd-columns" : "sd-single"}`;
  $("pool").innerHTML = slots.map((slot) => {
    const group = game.pool.filter((s) => s.slot === slot);
    const left = group.filter((s) => !taken(s)).length;
    const need = openSlots(drafter()).filter((x) => x === slot).length;
    const who = vsFriend() ? escapeHtml(sideName(drafter())) : "you";
    const needText = game.over ? "" : need ? ` · ${who} ${vsFriend() ? "needs" : "need"} ${need}` : ` · ${vsFriend() ? `${who} is` : "you're"} set`;
    return `
      <section class="sd-col">
        <h3 class="sd-col-head">
          <span>${SLOT_GROUPS[slot]}</span>
          <span class="sd-col-count">${left} left${needText}</span>
        </h3>
        <ol class="sd-pool">${group.map(poolCard).join("")}</ol>
      </section>`;
  }).join("");
}

function poolCard(s) {
  const myTurn = !game.over && !game.thinking && (vsFriend() || onTheClock() === "you");
  const t = taken(s);
  const legal = myTurn && canDraft(drafter(), s);
  const owner = (who) => (vsFriend() ? `${escapeHtml(sideName(who))}'s` : who === "you" ? "Your" : "Bot's");
  let note = "";
  if (t) note = `<span class="sd-taken ${t.who}">${owner(t.who)} pick ${t.number}</span>`;
  else if (!game.over && !openSlots(drafter()).includes(s.slot)) note = `<span class="sd-full">${SLOT_NAMES[s.slot]} spots full</span>`;
  const ts = s.tsPct == null ? "–" : `${(s.tsPct * 100).toFixed(1)}%`;
  return `
    <li>
      <button type="button" class="sd-card ${t ? `taken ${t.who}` : ""}" data-key="${key(s)}" ${legal ? "" : "disabled"}>
        <span class="sd-card-top">
          ${avatar(s.id, "sm")}
          <span class="sd-badge">${s.pos}</span>
        </span>
        <span class="sd-card-name">${escapeHtml(s.name)}</span>
        <span class="sd-card-sub">${s.season} · ${s.teams.join("/")} · ${s.g} GP</span>
        <span class="sd-card-stats">
          <span><b>${s.ppg}</b> PPG</span><span><b>${s.rpg}</b> RPG</span><span><b>${s.apg}</b> APG</span><span><b>${ts}</b> TS</span>
        </span>
        ${game.over ? `<span class="sd-card-ws">${s.ws.toFixed(1)} Win Shares</span>` : note}
      </button>
    </li>`;
}

function saveImage() {
  const { a, b, you, bot } = finalScore();
  if (vsFriend()) {
    const winner = you === bot ? null : you > bot ? "you" : "bot";
    shareImage({
      title: "Snake Draft",
      kicker: `${sideName("you")} vs ${sideName("bot")}`,
      big: `${Math.max(a, b)}–${Math.min(a, b)}`,
      lines: [
        winner ? `${sideName(winner)} wins` : "Tied",
        ...teamOf(winner || "you").map((s) => `${s.name} ${s.season}`),
      ],
    }, $("share-msg"));
    return;
  }
  shareImage({
    title: "Snake Draft",
    kicker: `vs the ${LEVELS[game.level].name}`,
    big: `${a}–${b}`,
    lines: [
      you > bot ? "Won the draft" : you < bot ? "Lost the draft" : "Tied",
      ...teamOf("you").map((s) => `${s.name} ${s.season}`),
    ],
  }, $("share-msg"));
}

function renderResult() {
  const { you, bot, a, b } = finalScore();
  const level = LEVELS[game.level];
  const won = you > bot;
  if (vsFriend()) {
    const winner = you === bot ? null : won ? "you" : "bot";
    $("result").classList.remove("lose");
    $("result-kicker").textContent = winner ? `${sideName(winner)} wins` : "Tie game";
    $("result-score").textContent = `${Math.max(a, b)}–${Math.min(a, b)}`;
    const best = (who) => teamOf(who).reduce((x, y) => (y.ws > x.ws ? y : x));
    const traps = game.picks.filter((p) => p.season.ws < 4);
    $("result-text").textContent =
      `${sideName("you")}: ${you.toFixed(1)} Win Shares. ${sideName("bot")}: ${bot.toFixed(1)}. ` +
      `Best picks: ${best("you").name} for ${sideName("you")}, ${best("bot").name} for ${sideName("bot")}. ` +
      (traps.length ? `Trap: ${traps.map((p) => `${sideName(p.who)} took ${p.season.name} (${p.season.ppg} PPG, only ${p.season.ws.toFixed(1)} WS)`).join("; ")}.` : "");
    $("share-msg").textContent = "";
    $("result").hidden = false;
    return;
  }
  $("result").classList.toggle("lose", you < bot);
  $("result-kicker").textContent = won ? "You win" : you < bot ? `${level.name} wins` : "Tie game";
  $("result-score").textContent = `${a}–${b}`;

  // The best season left on the board that you could have taken instead.
  const mine = teamOf("you");
  const worst = mine.reduce((w, s) => (s.ws < w.ws ? s : w));
  const missed = game.pool
    .filter((s) => !taken(s) && s.slot === worst.slot)
    .sort((x, y) => y.ws - x.ws)[0];
  const traps = mine.filter((s) => s.ws < 4);
  $("result-text").textContent =
    `Your five: ${you.toFixed(1)} Win Shares. ${level.name}: ${bot.toFixed(1)}. ` +
    `Best pick: ${mine.reduce((x, y) => (y.ws > x.ws ? y : x)).name} (${mine.reduce((x, y) => (y.ws > x.ws ? y : x)).ws.toFixed(1)}). ` +
    (traps.length
      ? `Trap: ${traps.map((s) => `${s.name} scored ${s.ppg} a game but added only ${s.ws.toFixed(1)} Win Shares`).join("; ")}.`
      : missed && missed.ws > worst.ws
        ? `${missed.name} ${missed.season} (${missed.ws.toFixed(1)}) went undrafted, more than your ${worst.name} (${worst.ws.toFixed(1)}).`
        : "");
  $("share-msg").textContent = "";
  $("result").hidden = false;
}

// ---------- wiring ----------

$("pool").addEventListener("click", (e) => {
  const card = e.target.closest("[data-key]");
  if (!card || card.disabled) return;
  const s = game.pool.find((x) => key(x) === card.dataset.key);
  draft(drafter(), s);
  if (game.over) $("result").scrollIntoView({ behavior: "smooth", block: "start" });
});
for (const who of ["you", "bot"]) {
  const input = $(`name-${who}`);
  input.value = loadNames()[who];
  input.addEventListener("input", () => {
    const names = loadNames();
    names[who] = input.value.slice(0, 20);
    try { localStorage.setItem(NAMES_KEY, JSON.stringify(names)); } catch {}
    render();
  });
}
$("filters").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-filter]");
  if (!btn) return;
  game.filter = btn.dataset.filter;
  render();
});
for (const btn of document.querySelectorAll(".difficulty button")) {
  btn.addEventListener("click", () => setLevel(btn.dataset.level));
}
$("again").addEventListener("click", () => { newGame(); window.scrollTo({ top: 0, behavior: "smooth" }); });
$("share").addEventListener("click", share);
$("save-image").addEventListener("click", saveImage);

loadData()
  .then(() => {
    $("status").hidden = true;
    $("game").hidden = false;
    newGame();
  })
  .catch((err) => {
    $("state").textContent = "Error";
    showLoadError(err);
  });
