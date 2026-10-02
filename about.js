// About page: the games list comes from GAMES in common.js, so it stays current.
$("about-games").innerHTML = GAMES.map((g) => `
  <li><a href="${g.page}"><b>${escapeHtml(g.title)}</b></a> <span>${escapeHtml(g.tag)}</span><br>${escapeHtml(g.blurb)}</li>`).join("");
