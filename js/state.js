// Game state + localStorage autosave (single in-progress career, no accounts).
const SAVE_KEY = "copero-clone-save-v1";

const App = {
  screen: "difficulty",
  difficulty: null,
  identity: null,
  career: null,
};

function newCareer(identity) {
  return {
    apellido: identity.apellido,
    numero: identity.numero,
    piernaHabil: identity.piernaHabil,
    nacionalidadSlug: identity.nacionalidadSlug,
    posicion: identity.posicion,
    edad: START_AGE,
    ovr: START_OVR,
    ovrPeak: START_OVR,
    valorMercado: valueFormula(START_OVR, START_AGE),
    clubActual: null,
    clubsPlayedFor: [],
    history: [],
    seasonStats: { pj: 0, gls: 0, ast: 0 },
    careerTotals: { pj: 0, gls: 0, ast: 0 },
    trophies: [],
    injuries: [],
    eventLog: [],
    pendingCelebrations: [],
    developmentProfile: pickDevelopmentProfile(),
    lastRole: null,
    lowRotationStreak: 0,
  };
}

function saveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(App));
  } catch (e) {
    // localStorage unavailable (e.g. private mode) -- silently skip autosave.
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    Object.assign(App, saved);
    return true;
  } catch (e) {
    return false;
  }
}

function clearState() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
  App.screen = "difficulty";
  App.difficulty = null;
  App.identity = null;
  App.career = null;
}
