function render() {
  const root = document.getElementById("app");
  root.innerHTML = "";
  if (App.screen === "difficulty") renderDifficulty(root);
  else if (App.screen === "identity") renderIdentity(root);
  else if (App.screen === "career") renderCareer(root);
  else if (App.screen === "summary") renderSummary(root);
}

async function boot() {
  await loadCatalog();
  const restored = loadState();
  if (restored && App.screen === "career" && !App.career) {
    // Corrupt/partial save -- start over.
    clearState();
  }
  render();
}

boot();
