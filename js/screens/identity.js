function renderIdentity(root) {
  const el = document.createElement("div");
  el.className = "screen screen-identity";

  const state = { apellido: "", numero: 10, piernaHabil: "Derecha", nacionalidadSlug: null, posicion: null };
  const countries = getCountries();

  el.innerHTML = `
    <h1>Definí tu identidad</h1>
    <div class="identity-columns">
      <div class="identity-col identity-jersey-col">
        <h2>Identidad</h2>
        <div class="jersey-preview"></div>
        <label class="field-label">Apellido
          <input type="text" class="input-apellido" placeholder="APELLIDO" maxlength="16" />
        </label>
        <label class="field-label">Número
          <input type="number" class="input-numero" min="1" max="99" value="10" />
        </label>
        <div class="field-label">Pierna hábil</div>
        <div class="foot-toggle">
          <button class="btn foot-btn" data-foot="Izquierda">Izquierda</button>
          <button class="btn foot-btn selected" data-foot="Derecha">Derecha</button>
        </div>
      </div>
      <div class="identity-col identity-nation-col">
        <h2>Nacionalidad</h2>
        <input type="text" class="input-search-country" placeholder="Buscar país" />
        <div class="country-list"></div>
      </div>
      <div class="identity-col identity-position-col">
        <h2>Posición</h2>
        <div class="pitch">
          ${POSITIONS.map(
            (p) =>
              `<button class="pos-btn" data-pos="${p}" style="left:${POSITION_LAYOUT[p].left}%;top:${POSITION_LAYOUT[p].top}%">${p}</button>`
          ).join("")}
        </div>
      </div>
    </div>
    <div class="identity-actions">
      <button class="btn btn-back">Volver</button>
      <button class="btn btn-primary btn-confirm" disabled>Confirmar identidad</button>
    </div>
  `;

  const jerseyPreview = el.querySelector(".jersey-preview");
  const confirmBtn = el.querySelector(".btn-confirm");

  function paintJersey() {
    const kit = state.nacionalidadSlug ? getKit(state.nacionalidadSlug) : null;
    jerseyPreview.innerHTML = jerseySvg({ lastName: state.apellido, number: state.numero, kit });
  }
  paintJersey();

  function checkReady() {
    confirmBtn.disabled = !(state.apellido.trim() && state.nacionalidadSlug && state.posicion);
  }

  el.querySelector(".input-apellido").addEventListener("input", (e) => {
    state.apellido = e.target.value.toUpperCase();
    paintJersey();
    checkReady();
  });
  el.querySelector(".input-numero").addEventListener("input", (e) => {
    state.numero = parseInt(e.target.value, 10) || 1;
    paintJersey();
  });
  el.querySelectorAll(".foot-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".foot-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.piernaHabil = btn.dataset.foot;
    });
  });

  const countryListEl = el.querySelector(".country-list");
  function renderCountries(filter) {
    const q = (filter || "").trim().toLowerCase();
    const filtered = countries.filter((c) => c.nombre.toLowerCase().includes(q));
    countryListEl.innerHTML = filtered
      .map(
        (c) => `
      <button class="country-row${state.nacionalidadSlug === c.slug ? " selected" : ""}" data-slug="${c.slug}">
        <img class="flag" src="${c.bandera}" alt="" />
        <span>${c.nombre}</span>
      </button>`
      )
      .join("");
    countryListEl.querySelectorAll(".country-row").forEach((row) => {
      row.addEventListener("click", () => {
        state.nacionalidadSlug = row.dataset.slug;
        renderCountries(el.querySelector(".input-search-country").value);
        paintJersey();
        checkReady();
      });
    });
  }
  renderCountries("");
  el.querySelector(".input-search-country").addEventListener("input", (e) => renderCountries(e.target.value));

  el.querySelectorAll(".pos-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".pos-btn").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      state.posicion = btn.dataset.pos;
      checkReady();
    });
  });

  el.querySelector(".btn-back").addEventListener("click", () => {
    App.screen = "difficulty";
    render();
  });

  confirmBtn.addEventListener("click", () => {
    App.identity = { ...state, apellido: state.apellido.trim() };
    App.career = newCareer(App.identity);
    App.screen = "career";
    saveState();
    render();
  });

  root.appendChild(el);
}
