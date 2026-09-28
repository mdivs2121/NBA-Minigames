// Player pages: player.html?id=jamesle01 shows one player's bio, honors,
// career totals, and every season. With no id, it's a player search.

Object.assign(data, {
  index: {},        // id -> [name, first season, last season]
});

const HONOR_ORDER = [
  "MVP", "Defensive Player of the Year", "Rookie of the Year", "Sixth Man of the Year",
  "Most Improved Player", "Clutch Player of the Year", "All-Star",
  "All-NBA 1st", "All-NBA 2nd", "All-NBA 3rd", "All-Defense 1st", "All-Defense 2nd",
  "All-Rookie 1st", "All-Rookie 2nd",
];

// ---------- search ----------

const plain = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function search(text) {
  const q = plain(text.trim());
  if (q.length < 2) return [];
  const hits = [];
  for (const [id, [n, from, to]] of Object.entries(data.index)) {
    const name = plain(n);
    const at = name.indexOf(q);
    if (at < 0) continue;
    // Full-name starts first, then last-name starts, then anywhere; longer careers break ties.
    const rank = at === 0 ? 0 : name[at - 1] === " " ? 1 : 2;
    const length = from && to ? +to.slice(0, 4) - +from.slice(0, 4) : -1;
    hits.push({ id, n, from, to, rank, length });
  }
  return hits.sort((a, b) => a.rank - b.rank || b.length - a.length || a.n.localeCompare(b.n)).slice(0, 12);
}

function renderResults() {
  const hits = search($("search").value);
  $("results").hidden = !hits.length;
  $("results").innerHTML = hits
    .map((h) => {
      data.players[h.id] ||= { name: h.n };
      const years = h.from ? (h.from === h.to ? h.from : `${h.from} – ${h.to}`) : "Drafted, never played";
      return `
        <li><a href="player.html?id=${encodeURIComponent(h.id)}">
          ${avatar(h.id, "xs")}
          <span class="pl-hit-name">${escapeHtml(h.n)}</span>
          <span class="pl-hit-years">${years}</span>
        </a></li>`;
    })
    .join("");
}

// ---------- profile ----------

async function showPlayer(id) {
  const shard = await fetchJson(`player/${id[0]}`);
  const p = shard[id];
  if (!p) throw new Error(`no player with id ${id}`);
  data.players[id] = { name: p.name };
  document.title = `${p.name} · NBA Minigames`;
  $("profile").innerHTML = profileHtml(id, p);
  $("profile").hidden = false;
}

function profileHtml(id, p) {
  const seasons = p.seasons || [];
  const bio = p.bio || {};
  const years = seasons.length ? `${seasons[0].season} – ${seasons.at(-1).season}` : "Never played in the NBA";
  const facts = [
    bio.pos && ["Position", positionName(bio.pos)],
    bio.ht && ["Height", `${Math.floor(bio.ht / 12)}′${bio.ht % 12}″`],
    bio.wt && ["Weight", `${bio.wt} lb`],
    bio.born && ["Born", formatDate(bio.born)],
    ["College", bio.colleges?.length ? bio.colleges.join(", ") : "None"],
    p.draft && ["Drafted", `${p.draft.year} · Round ${p.draft.round}, pick ${p.draft.pick} · ${p.draft.team}`],
  ].filter(Boolean);

  return `
    <header class="pl-head">
      ${avatar(id, "xl")}
      <div>
        <span class="side-label">${escapeHtml(years)}${seasons.length ? ` · ${seasons.length} season${seasons.length === 1 ? "" : "s"}` : ""}</span>
        <h1 class="giant">${escapeHtml(p.name)}</h1>
        ${bio.hof ? `<span class="pl-hof">Hall of Fame</span>` : ""}
      </div>
    </header>

    <dl class="pl-facts">
      ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}
    </dl>

    ${honorsHtml(p)}
    ${p.career ? careerHtml(p.career) : ""}
    ${seasons.length ? seasonsHtml(p) : ""}`;
}

function honorsHtml(p) {
  const all = { ...p.awards, ...p.teams };
  const rows = HONOR_ORDER.filter((k) => all[k]?.length).map((k) => [k, all[k]]);
  if (!rows.length) return "";
  return `
    <section class="pl-section">
      <span class="label">Honors</span>
      <ul class="pl-honors">
        ${rows
          .map(([k, list]) => `
            <li>
              <b>${list.length > 1 ? `${list.length}× ` : ""}${k}</b>
              <span>${list.join(", ")}</span>
            </li>`)
          .join("")}
      </ul>
    </section>`;
}

function careerHtml(c) {
  const n = (v) => (v == null ? "–" : v.toLocaleString("en-US"));
  const tiles = [
    ["Games", n(c.g)], ["Points", n(c.pts)], ["Rebounds", n(c.trb)], ["Assists", n(c.ast)],
    ["Steals", n(c.stl)], ["Blocks", n(c.blk)], ["Win Shares", c.ws == null ? "–" : c.ws.toFixed(1)],
  ];
  return `
    <section class="pl-section">
      <span class="label">Career · regular season${c.ppg != null ? ` · ${c.ppg} PPG, ${c.rpg} RPG, ${c.apg} APG` : ""}</span>
      <div class="pl-career">
        ${tiles.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join("")}
      </div>
    </section>`;
}

function seasonsHtml(p) {
  // Seasons with an award or the player's best scoring year get marked.
  const marks = {};
  for (const [award, list] of Object.entries(p.awards || {})) {
    if (award === "All-Star") continue;
    for (const s of list) (marks[s] ||= []).push(award === "MVP" ? "MVP" : shortAward(award));
  }
  for (const s of p.awards?.["All-Star"] || []) (marks[s] ||= []).push("All-Star");
  const best = p.seasons.reduce((a, b) => ((b.ppg ?? -1) > (a.ppg ?? -1) ? b : a));

  const f1 = (v) => (v == null ? "–" : v.toFixed(1));
  const pct = (v) => (v == null ? "–" : (v * 100).toFixed(1));
  return `
    <section class="pl-section">
      <span class="label">Season by season · per game</span>
      <div class="pl-table-wrap">
        <table class="pl-table">
          <thead><tr>
            <th>Season</th><th>Age</th><th>Team</th><th>G</th><th>MPG</th><th>PTS</th><th>REB</th><th>AST</th>
            <th>STL</th><th>BLK</th><th>FG%</th><th>3P%</th><th>FT%</th><th>WS</th>
          </tr></thead>
          <tbody>
            ${p.seasons
              .map((s) => `
                <tr class="${s === best ? "best" : ""}">
                  <td>${s.season}${(marks[s.season] || []).map((m) => `<span class="pl-mark ${m === "MVP" ? "mvp" : ""}">${m}</span>`).join("")}</td>
                  <td>${s.age ?? "–"}</td><td>${s.teams.join(" / ")}</td><td>${s.g}</td>
                  <td>${f1(s.mpg)}</td><td>${f1(s.ppg)}</td><td>${f1(s.rpg)}</td><td>${f1(s.apg)}</td>
                  <td>${f1(s.spg)}</td><td>${f1(s.bpg)}</td><td>${pct(s.fg)}</td><td>${pct(s.tp)}</td><td>${pct(s.ft)}</td>
                  <td>${f1(s.ws)}</td>
                </tr>`)
              .join("")}
          </tbody>
        </table>
      </div>
      <p class="meta pl-note">Highlighted row: best scoring season. Steals and blocks weren't tracked before 1973-74.</p>
    </section>`;
}

function shortAward(award) {
  return { "Defensive Player of the Year": "DPOY", "Rookie of the Year": "ROY", "Sixth Man of the Year": "6MOY",
           "Most Improved Player": "MIP", "Clutch Player of the Year": "Clutch" }[award] || award;
}

function positionName(pos) {
  const names = { G: "Guard", F: "Forward", C: "Center", PG: "Point guard", SG: "Shooting guard", SF: "Small forward", PF: "Power forward" };
  return pos.split("-").map((p) => names[p] || p).join(" / ");
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ---------- wiring ----------

$("search").addEventListener("input", renderResults);
$("search-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const first = $("results").querySelector("a");
  if (first) location.href = first.href;
});

(async () => {
  try {
    data.photos = await fetchJson("photos").catch(() => ({}));
    data.index = await fetchJson("player/index");
    $("status").hidden = true;
    const id = new URLSearchParams(location.search).get("id");
    if (id && data.index[id]) {
      await showPlayer(id);
    } else {
      if (id) { $("status").hidden = false; $("status").textContent = "We don't have a page for that player."; }
      $("search").focus();
    }
  } catch (err) {
    showLoadError(err);
  }
})();
