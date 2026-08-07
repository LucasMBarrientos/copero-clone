function renderSummary(root) {
  const el = document.createElement("div");
  el.className = "screen screen-summary";
  const career = App.career;
  const country = findCountry(career.nacionalidadSlug);
  const achievements = unlockedAchievements(career);

  el.innerHTML = `
    <h1>Fin de la carrera</h1>
    <p class="subtitle">${career.apellido} se retira a los ${career.edad} años.</p>
    <div class="summary-layout">
      <div class="summary-card">
        <div class="summary-hero">
          <div class="ovr-badge"><span>OVR final</span>${career.ovr}</div>
          <div>
            <div class="player-name">#${career.numero} ${career.posicion} · ${career.apellido}</div>
            <div class="nation-chip"><img src="${country.bandera}" alt="" /> ${country.nombre}</div>
          </div>
        </div>
        <div class="player-stats-grid">
          <div><span class="stat-label">OVR pico</span><span class="stat-value">${career.ovrPeak}</span></div>
          <div><span class="stat-label">VALOR final</span><span class="stat-value">${formatMoney(career.valorMercado)}</span></div>
          <div><span class="stat-label">PJ</span><span class="stat-value">${career.careerTotals.pj}</span></div>
          <div><span class="stat-label">GLS</span><span class="stat-value">${career.careerTotals.gls}</span></div>
          <div><span class="stat-label">AST</span><span class="stat-value">${career.careerTotals.ast}</span></div>
          <div><span class="stat-label">Clubes</span><span class="stat-value">${career.clubsPlayedFor.length}</span></div>
        </div>
        ${trophyCaseHtml(career)}
      </div>
      <div class="summary-side">
        <h3>Logros desbloqueados</h3>
        <div class="achievement-list">
          ${
            achievements.length
              ? achievements.map((a) => `<div class="achievement-chip">🏅 ${a.label}</div>`).join("")
              : `<p class="muted">Sin logros esta vez. ¡Probá de nuevo!</p>`
          }
        </div>
        <h3>Trayectoria</h3>
        <table class="timeline-table">
          <thead><tr><th>EDAD</th><th>CLUB</th><th>OVR</th><th>PJ</th><th>GLS</th><th>AST</th></tr></thead>
          <tbody>
            ${career.history
              .map(
                (row) =>
                  `<tr><td>${row.edad}</td><td>${row.clubNombre}</td><td>${row.ovr}</td><td>${row.pj}</td><td>${row.gls}</td><td>${row.ast}</td></tr>`
              )
              .join("")}
          </tbody>
        </table>
      </div>
    </div>
    <button class="btn btn-primary btn-new-career">Nueva carrera</button>
  `;

  el.querySelector(".btn-new-career").addEventListener("click", () => {
    clearState();
    render();
  });

  root.appendChild(el);
}
