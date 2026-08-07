function formatMoney(v) {
  if (v >= 1_000_000) return `€${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `€${Math.round(v / 1000)}K`;
  return `€${v}`;
}

function clubLabel(career) {
  if (!career.clubActual) return "Libre";
  const club = currentClubObj(career);
  return club ? club.nombre : "Libre";
}

function trophyCaseHtml(career) {
  if (!career.trophies.length) {
    return `<div class="trophy-case-empty">🏆<br />VITRINA VACÍA</div>`;
  }
  return `<div class="trophy-case-full">${career.trophies
    .map((t) => `<span class="trophy-icon" title="${t.label} (${t.club}, ${t.edad} años)">${t.icon}</span>`)
    .join("")}</div>`;
}

function renderCareer(root) {
  const el = document.createElement("div");
  el.className = "screen screen-career";
  root.appendChild(el);
  paintCareer(el);
}

function paintCareer(el) {
  const career = App.career;

  if (career.pendingEventKey === undefined) {
    const event = rollCareerEvent(career, career.lastRole);
    career.pendingEventKey = event ? event.key : null;
    saveState();
  }

  if (career.pendingEventKey) paintEvent(el);
  else paintDecision(el);

  // Celebrations play on top of the freshly-painted screen, one at a time.
  if (career.pendingCelebrations && career.pendingCelebrations.length) {
    const celebration = career.pendingCelebrations.shift();
    saveState();
    showCelebration(celebration, () => paintCareer(el));
  }
}

// Full-screen burst when a title is won (or a promotion/relegation happens),
// mirroring Copero's own trophy-celebration overlay.
function showCelebration(celebration, done) {
  const overlay = document.createElement("div");
  const isNegative = celebration.kind === "relegation" || celebration.kind === "injury";
  overlay.className = `celebration-overlay${isNegative ? " celebration-overlay--negative" : ""}`;
  overlay.innerHTML = `
    <div class="celebration-glow${isNegative ? " celebration-glow--negative" : ""}"></div>
    <div class="celebration-particles">
      ${Array.from({ length: 14 })
        .map((_, i) => {
          const angle = (360 / 14) * i;
          return `<span class="celebration-particle" style="--burst-angle:${angle}deg;--burst-distance:${randInt(90, 160)}px;--burst-delay:${(i % 5) * 0.05}s"></span>`;
        })
        .join("")}
    </div>
    <div class="celebration-item">
      <div class="celebration-trophy">${celebration.icon}</div>
      <div class="celebration-label">${celebration.label}</div>
      <div class="celebration-club">${celebration.club || ""} · ${celebration.edad} años</div>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    overlay.remove();
    done();
  }, 1900);
}

function playerCardHtml(career, country) {
  const club = currentClubObj(career);
  const code = country.nombre.slice(0, 3).toUpperCase();
  return `
    <div class="player-card">
      <div class="player-hero">
        <div class="ovr-badge"><span>OVR</span>${career.ovr}</div>
        <div class="player-hero-main">
          <div class="player-tags">
            <span class="nation-chip"><img src="${country.bandera}" alt="" /> ${code}</span>
            <span class="pos-chip">#${career.numero} ${career.posicion}</span>
          </div>
          <div class="player-club">
            ${club ? `<span class="crest-icon">${crestSvg(club, 22)}</span>` : `<span class="crest-icon crest-free">?</span>`}
            <span class="player-club-name">${clubLabel(career)}</span>
          </div>
        </div>
        <div class="player-hero-side">
          <div><span class="stat-label">EDAD</span><span class="stat-value">${career.edad}</span></div>
          <div><span class="stat-label">VALOR</span><span class="stat-value">${formatMoney(career.valorMercado)}</span></div>
        </div>
      </div>
      <div class="player-season-stats">
        <div><span class="stat-label">PJ</span><span class="stat-value">🟩 ${career.seasonStats.pj}</span></div>
        <div><span class="stat-label">GLS</span><span class="stat-value">⚽ ${career.seasonStats.gls}</span></div>
        <div><span class="stat-label">AST</span><span class="stat-value">👟 ${career.seasonStats.ast}</span></div>
      </div>
      ${trophyCaseHtml(career)}
    </div>
  `;
}

function timelineTableHtml(career) {
  const diff = DIFFICULTIES[App.difficulty];
  const nextAge = Math.min(career.edad + diff.seasonsPerDecision, RETIRE_AGE);

  const playedRows = career.history
    .map((row) => {
      const club = row.paisSlug && row.clubSlug ? findClub(row.paisSlug, row.clubSlug) : null;
      return `<tr>
        <td class="timeline-age">${row.edad}</td>
        <td class="timeline-club">${club ? `<span class="crest-icon">${crestSvg(club, 20)}</span>` : ""}<span>${row.clubNombre}</span></td>
        <td><span class="ovr-pill">${row.ovr}</span></td>
        <td>${row.pj}</td><td>${row.gls}</td><td>${row.ast}</td>
      </tr>`;
    })
    .join("");

  // The original pre-renders every remaining checkpoint as a dimmed empty row.
  const futureRows = [];
  for (let age = nextAge + diff.seasonsPerDecision; age <= RETIRE_AGE; age += diff.seasonsPerDecision) {
    futureRows.push(`<tr class="timeline-future"><td class="timeline-age">${age}</td><td colspan="5"></td></tr>`);
  }

  return `
    <table class="timeline-table">
      <thead><tr><th>EDAD</th><th>CLUB</th><th>OVR</th><th>PJ</th><th>GLS</th><th>AST</th></tr></thead>
      <tbody>
        ${playedRows}
        <tr class="timeline-current">
          <td class="timeline-age">${nextAge}</td>
          <td colspan="4" class="loading-row"><span class="loading-dot">?</span> Eligiendo club...</td>
          <td><span class="ovr-pill ovr-pill--current">${career.ovr}</span></td>
        </tr>
        ${futureRows.join("")}
      </tbody>
    </table>
  `;
}

function choiceCardHtml(choice, idx, extraClass = "") {
  const pills = (choice.pills || [])
    .map((p) => `<span class="choice-pill choice-pill--${p.tone}">${p.text}</span>`)
    .join("");
  return `
    <button class="choice-card ${extraClass}" data-idx="${idx}">
      <span class="choice-title">${choice.label}</span>
      <span class="choice-image">${choice.image || "⚽"}</span>
      <span class="choice-pills">${pills}</span>
    </button>
  `;
}

function paintEvent(el) {
  const career = App.career;
  const def = EVENTS[career.pendingEventKey];
  const country = findCountry(career.nacionalidadSlug);

  el.innerHTML = `
    <div class="career-layout">
      <div class="career-left">
        ${playerCardHtml(career, country)}
        <div class="decision-box event-box">
          <h3><span class="event-icon">${def.icon || "❓"}</span> ${def.label}</h3>
          <p>${def.text}</p>
          <div class="choice-grid">
            ${def.choices.map((c, i) => choiceCardHtml(c, i)).join("")}
          </div>
        </div>
      </div>
      <div class="career-right">
        ${timelineTableHtml(career)}
        <div class="nation-footer"><img src="${country.bandera}" alt="" /> ${country.nombre}</div>
      </div>
    </div>
  `;

  el.querySelectorAll(".choice-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".choice-card").forEach((b) => (b.disabled = true));
      const choice = def.choices[parseInt(btn.dataset.idx, 10)];
      const key = career.pendingEventKey;
      setTimeout(() => {
        const result = applyEventChoice(career, key, choice.id);
        career.pendingEventKey = null;
        if (result.isTransfer) {
          const rivals = rivalOffers(career);
          const target = rivals[randInt(0, rivals.length - 1)];
          if (target) {
            applyOffer(career, target);
            simulateSegment(career, DIFFICULTIES[App.difficulty].seasonsPerDecision);
            career.pendingEventKey = undefined;
          }
        }
        saveState();
        if (isRetired(career)) {
          App.screen = "summary";
          saveState();
          render();
        } else {
          paintCareer(el);
        }
      }, 400);
    });
  });
}

function offerCardHtml(club, idx, isStay = false) {
  return `
    <button class="offer-card${isStay ? " offer-stay" : ""}" data-idx="${idx}">
      <span class="offer-cta">${isStay ? "Quedarse en" : "Fichar por"}</span>
      <span class="offer-club">${club.nombre}</span>
      <span class="offer-crest">${crestSvg(club, 52)}</span>
      <span class="offer-league">${leagueLabel(club)}</span>
    </button>
  `;
}

function paintDecision(el) {
  const career = App.career;
  const country = findCountry(career.nacionalidadSlug);
  const isYouth = career.history.length === 0;
  const offers = isYouth ? generateYouthOffers(career) : generateTransferOffers(career);
  const currentClub = currentClubObj(career);

  el.innerHTML = `
    <div class="career-layout">
      <div class="career-left">
        ${playerCardHtml(career, country)}
        <div class="decision-box">
          <h3>${isYouth ? "Oferta de cantera" : "Mercado de pases"}</h3>
          <p>${
            isYouth
              ? "Tres clubes quieren sumarte a su proyecto juvenil. Elegí dónde empieza tu carrera."
              : "Llegaron ofertas después de tu último tramo de carrera. Podés aceptar una o quedarte en tu club."
          }</p>
          <div class="offer-grid">
            ${offers.map((o, i) => offerCardHtml(o, i)).join("")}
            ${!isYouth && currentClub ? offerCardHtml(currentClub, "stay", true) : ""}
          </div>
        </div>
      </div>

      <div class="career-right">
        ${timelineTableHtml(career)}
        <div class="nation-footer"><img src="${country.bandera}" alt="" /> ${country.nombre}</div>
      </div>
    </div>
  `;

  el.querySelectorAll(".offer-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".offer-card").forEach((b) => (b.disabled = true));
      const idx = btn.dataset.idx;
      setTimeout(() => {
        if (idx !== "stay") applyOffer(career, offers[parseInt(idx, 10)]);
        simulateSegment(career, DIFFICULTIES[App.difficulty].seasonsPerDecision);
        career.pendingEventKey = undefined;
        saveState();

        if (isRetired(career)) {
          App.screen = "summary";
          saveState();
          render();
        } else {
          paintCareer(el);
        }
      }, 550);
    });
  });
}
