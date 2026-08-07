function renderDifficulty(root) {
  const el = document.createElement("div");
  el.className = "screen screen-difficulty";
  el.innerHTML = `
    <h1>Construí tu carrera futbolística</h1>
    <p class="subtitle">Elegí tu origen, tomá decisiones clave y dejá que el destino te lleve a una
      trayectoria única de títulos, estadísticas y momentos decisivos.</p>
    <div class="difficulty-options">
      ${Object.entries(DIFFICULTIES)
        .map(
          ([key, d]) => `
        <button class="difficulty-card" data-key="${key}">
          <span class="difficulty-label">${d.label}</span>
          <span class="difficulty-desc">${d.description}</span>
        </button>`
        )
        .join("")}
    </div>
    <button class="btn btn-primary btn-start" disabled>Comenzar carrera</button>
  `;

  let selected = null;
  const cards = el.querySelectorAll(".difficulty-card");
  const startBtn = el.querySelector(".btn-start");

  cards.forEach((card) => {
    card.addEventListener("click", () => {
      cards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      selected = card.dataset.key;
      startBtn.disabled = false;
    });
  });

  startBtn.addEventListener("click", () => {
    if (!selected) return;
    App.difficulty = selected;
    App.screen = "identity";
    saveState();
    render();
  });

  root.appendChild(el);
}
