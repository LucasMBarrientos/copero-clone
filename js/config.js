// Tunable game config. Intensa/Normal/Expres differ only by seasonsPerDecision --
// the engine (js/engine.js) runs one shared loop for all three.
//
// The formulas below (reputation tiers, role/appearance ranges, growth
// curves, scoring rates, trophy odds, injury table, event catalog) are a
// reimplementation of Copero's own "Simulador de Carrera" mechanics
// (reverse-engineered from its public client-side bundle), adapted to run
// over our fictional Confecon-sourced countries/clubs instead of Copero's
// real-world database. National-team/World Cup mechanics are intentionally
// omitted (Confecon has no national-team data).
const DIFFICULTIES = {
  intensa: {
    label: "Intensa",
    description: "Decisiones cada temporada, control total de tu carrera.",
    seasonsPerDecision: 1,
  },
  normal: {
    label: "Normal",
    description: "Decisiones cada 2 temporadas, una experiencia equilibrada.",
    seasonsPerDecision: 2,
  },
  expres: {
    label: "Exprés",
    description: "Menos decisiones, saltos más grandes, carrera rápida.",
    seasonsPerDecision: 4,
  },
};

const START_AGE = 16;
const RETIRE_AGE = 40;
const START_OVR = 50;

const POSITIONS = ["POR", "DFC", "LI", "LD", "MCD", "MC", "MCO", "MI", "MD", "EI", "ED", "DC"];

const POSITION_LAYOUT = {
  DC: { left: 50, top: 8 },
  EI: { left: 15, top: 20 },
  ED: { left: 85, top: 20 },
  MCO: { left: 50, top: 32 },
  MI: { left: 15, top: 44 },
  MD: { left: 85, top: 44 },
  MC: { left: 50, top: 50 },
  LI: { left: 15, top: 68 },
  LD: { left: 85, top: 68 },
  MCD: { left: 50, top: 62 },
  DFC: { left: 50, top: 78 },
  POR: { left: 50, top: 92 },
};

// Position -> scoring archetype (drives goal/assist rate tables below).
const POSITION_ARCHETYPE = {
  DC: "attacker", EI: "attacker", ED: "attacker",
  MCO: "creator", MI: "creator", MD: "creator",
  MC: "support", LI: "support", LD: "support",
  MCD: "defensive", DFC: "defensive",
  POR: "goalkeeper",
};

function isGoalkeeper(pos) {
  return pos === "POR";
}

// ---- Reputation ----------------------------------------------------------
// Copero's real clubs carry domestic/continental/international_reputation
// (0-5ish) straight from its database. Confecon only gives us one `ovr` per
// club, so we derive all three from it: domestic from percentile within the
// club's own country, continental/international from absolute OVR bands
// across the whole Confecon catalog (mirrors "best clubs in the world" vs.
// "best club in a small league" not being the same thing).
// Reputation 5 is reserved for the handful of genuine giants in a country --
// Copero's own data has very few clubs up there, and its league-title odds
// (0.7 per season at reputation 5) assume that scarcity.
function domesticReputationFromPercentile(p) {
  return p >= 0.98 ? 5 : p >= 0.92 ? 4 : p >= 0.8 ? 3 : p >= 0.55 ? 2 : p >= 0.25 ? 1 : 0;
}
function continentalReputationFromOvr(ovr) {
  return ovr >= 82 ? 5 : ovr >= 76 ? 4 : ovr >= 70 ? 3 : ovr >= 63 ? 2 : ovr >= 55 ? 1 : 0;
}
function internationalReputationFromOvr(ovr) {
  return ovr >= 85 ? 5 : ovr >= 80 ? 4 : ovr >= 75 ? 3 : ovr >= 70 ? 2 : ovr >= 63 ? 1 : ovr >= 55 ? 0 : -1;
}

// Team "expected overall" baseline by international_reputation (-1..5).
const TEAM_BASELINE_BY_REPUTATION = { "-1": 52, 0: 58, 1: 68, 2: 75, 3: 80, 4: 84, 5: 88 };
function teamBaseline(internationalReputation) {
  const clamped = Math.max(-1, Math.min(5, internationalReputation));
  return TEAM_BASELINE_BY_REPUTATION[String(clamped)];
}

// Player's own reputation tier from raw OVR (-1..5), used to pick offer targets.
function playerTier(overall) {
  return overall >= 87 ? 5 : overall >= 83 ? 4 : overall >= 78 ? 3 : overall >= 73 ? 2 : overall >= 65 ? 1 : overall >= 55 ? 0 : -1;
}

// Random walk around a tier: 80% stay, 10% down, 10% up (biased at the edges).
function walkTier(tier) {
  const clamped = Math.max(-1, Math.min(5, tier));
  const r = Math.random();
  if (clamped === -1) return r < 0.8 ? -1 : 0;
  if (clamped === 5) return r < 0.8 ? 5 : 4;
  if (r < 0.1) return clamped - 1;
  if (r < 0.9) return clamped;
  return clamped + 1;
}

// ---- Roles / appearances --------------------------------------------------
function roleBucket(overallVsBaseline, isGK) {
  if (isGK) {
    if (overallVsBaseline >= 0) return "starter";
    if (overallVsBaseline >= -6) return "substitute";
    return "third_keeper";
  }
  if (overallVsBaseline >= 0) return "starter";
  if (overallVsBaseline >= -4) return "high_rotation";
  if (overallVsBaseline >= -8) return "low_rotation";
  return "substitute";
}

const APPEARANCE_RANGES = {
  outfield: { starter: [40, 50], high_rotation: [25, 39], low_rotation: [15, 24], substitute: [5, 14] },
  goalkeeper: { starter: [42, 50], substitute: [2, 12], third_keeper: [0, 4] },
};

// domestic_reputation/continental_reputation -> appearance-count multiplier.
function appearanceMultiplier(club) {
  if (club.domesticReputation === 0) return 0.7;
  if (club.domesticReputation === 1) return 0.8;
  if (club.continentalReputation === 0) return 0.9;
  return 1;
}

// ---- OVR growth ------------------------------------------------------------
// Per-2-season deltas by age band and development profile (early/normal/late
// bloomer, assigned once per career: 10%/80%/10%).
const GROWTH_CURVES = {
  early: { 18: [7, 16], 20: [6, 16], 22: [4, 10], 24: [0, 7], 26: [-2, 1], 28: [-2, -1], 30: [-2, 0], 32: [-4, 0], 34: [-6, -1], 36: [-8, -2], 38: [-10, -3], 40: [-10, -3] },
  normal: { 18: [4, 14], 20: [3, 14], 22: [2, 10], 24: [1, 8], 26: [0, 3], 28: [-1, 0], 30: [-1, 0], 32: [-3, 0], 34: [-5, -1], 36: [-7, -2], 38: [-10, -3], 40: [-10, -3] },
  late: { 18: [2, 12], 20: [1, 12], 22: [1, 9], 24: [2, 9], 26: [1, 5], 28: [0, 1], 30: [0, 1], 32: [-2, 0], 34: [-5, -1], 36: [-7, -2], 38: [-10, -3], 40: [-10, -3] },
};
const GK_GROWTH_CURVE = { 18: [2, 10], 20: [2, 10], 22: [2, 9], 24: [2, 8], 26: [1, 7], 28: [1, 5], 30: [0, 0], 32: [-1, 0], 34: [-2, 0], 36: [-4, -1], 38: [-6, -2], 40: [-6, -2] };

function pickDevelopmentProfile() {
  const r = Math.random();
  return r < 0.1 ? "early" : r < 0.2 ? "late" : "normal";
}

function growthRangeForAge(age, profile, isGK) {
  const table = isGK ? GK_GROWTH_CURVE : GROWTH_CURVES[profile];
  const ages = Object.keys(table).map(Number).sort((a, b) => a - b);
  const bracket = ages.find((a) => age <= a) ?? ages[ages.length - 1];
  return table[bracket];
}

// ---- Scoring ---------------------------------------------------------------
// "overall vs team baseline" bucket (0=dominant .. 6=overmatched).
function scoringBucket(overallVsBaseline) {
  if (overallVsBaseline >= 10) return 0;
  if (overallVsBaseline >= 6) return 1;
  if (overallVsBaseline >= 3) return 2;
  if (overallVsBaseline >= -2) return 3;
  if (overallVsBaseline >= -5) return 4;
  if (overallVsBaseline >= -9) return 5;
  return 6;
}
const GOAL_RATE = {
  attacker: [1.1, 0.85, 0.65, 0.5, 0.3, 0.15, 0.05],
  creator: [0.85, 0.6, 0.45, 0.3, 0.2, 0.1, 0.05],
  support: [0.15, 0.1, 0.08, 0.05, 0.02, 0, 0],
  defensive: [0.1, 0.08, 0.06, 0.04, 0.02, 0, 0],
  goalkeeper: [0, 0, 0, 0, 0, 0, 0],
};
const ASSIST_RATE = {
  attacker: [0.4, 0.3, 0.2, 0.15, 0.1, 0.08, 0.05],
  creator: [0.6, 0.45, 0.35, 0.25, 0.15, 0.08, 0.05],
  support: [0.35, 0.25, 0.18, 0.12, 0.07, 0.03, 0.02],
  defensive: [0.1, 0.07, 0.05, 0.03, 0.01, 0, 0],
  goalkeeper: [0, 0, 0, 0, 0, 0, 0],
};
// Team-strength (domestic_reputation, 0-5) scoring multiplier -- better teammates/service.
const TEAM_STRENGTH_SCORING_MULT = [0.55, 0.75, 0.95, 1, 1.1, 1.2];
// Player-quality scoring curve.
function overallScoringCurve(overall) {
  if (overall <= 65) return 0.6;
  if (overall <= 80) return 0.6 + ((overall - 65) / 15) * 0.25;
  if (overall <= 85) return 0.85 + ((overall - 80) / 5) * 0.15;
  if (overall <= 95) return 1.0 + ((overall - 85) / 10) * 0.1;
  return 1.1;
}

const GAMES_PER_SEASON_SPLIT = { min: 0.3, max: 0.7 };

// Market value curve calibrated against Copero's observed values.
function valueFormula(ovr, edad) {
  const base = Math.pow(Math.max(0, ovr - 40), 3) * 100;
  let ageFactor = 1;
  if (edad > 30) ageFactor = Math.max(0.15, 1 - (edad - 30) * 0.1);
  return Math.max(30000, Math.round((base * ageFactor) / 1000) * 1000);
}

// ---- Offers -----------------------------------------------------------------
const OFFER_RULES = {
  youthOfferCount: 3,
  transferOfferCount: 2,
  sameCountryWeight(overall) {
    // Higher-quality players get pulled toward fully global offers; weaker
    // players' offers stay closer to home. Simplified from Copero's
    // confederation-weighting (we have no confederations in Confecon).
    if (overall >= 83) return 0;
    if (overall >= 73) return 0.5;
    return 0.85;
  },
};

// ---- Trophies -----------------------------------------------------------------
const LEAGUE_TROPHY_PROB = [0, 0.01, 0.05, 0.25, 0.45, 0.7];
const CUP_TROPHY_PROB = [0.01, 0.04, 0.1, 0.25, 0.35, 0.4];
const CONTINENTAL_PRIMARY_PROB = [0, 0.00001, 0.03, 0.15, 0.2, 0.3];
const CONTINENTAL_SECONDARY_PROB = [0, 0.04, 0.12, 0.02, 0, 0];

function starMultiplier(overallVsBaseline) {
  if (overallVsBaseline >= 10) return 1.6;
  if (overallVsBaseline >= 6) return 1.3;
  if (overallVsBaseline >= 3) return 1.1;
  return 1;
}

// A standout player (overall>=85) inflates their club's *effective*
// reputation specifically for trophy odds (nr() in the original).
function effectiveReputationForTrophies(overall, club) {
  const t = Math.max(-1, Math.min(5, club.internationalReputation));
  let r = 0, n = 0;
  if (overall >= 90) {
    if (t === 3) { r = 1; n = 1; }
    else if (t === 2) { r = 2; n = 1; }
    else if (t <= 1) { r = 2; n = 2; }
  } else if (overall >= 85 && t <= 3) {
    r = 1;
    n = t <= 1 ? 1 : 0;
  }
  return {
    domestic: Math.max(0, Math.min(5, club.domesticReputation + r)),
    continental: Math.max(0, Math.min(5, club.continentalReputation + n)),
  };
}

const TROPHIES = {
  league: { icon: "🏆", label: "Liga" },
  cup: { icon: "🥈", label: "Copa" },
  continental_primary: { icon: "🌟", label: "Copa Continental" },
  continental_secondary: { icon: "🎖️", label: "Copa Subcontinental" },
};

// ---- Injuries ---------------------------------------------------------------
const INJURY_TYPES = [
  { type: "hamstring", label: "Desgarro isquiotibial", weight: 24, overallDelta: -3 },
  { type: "meniscus", label: "Lesión de menisco", weight: 18, overallDelta: -2 },
  { type: "acl", label: "Rotura de ligamento cruzado", weight: 14, overallDelta: -5 },
  { type: "tibia_fibula", label: "Fractura de tibia y peroné", weight: 8, overallDelta: -8 },
  { type: "achilles", label: "Rotura de tendón de Aquiles", weight: 4, overallDelta: -10 },
  { type: "ankle_sprain", label: "Esguince de tobillo", weight: 14, overallDelta: -1 },
  { type: "calf_tear", label: "Desgarro de gemelo", weight: 8, overallDelta: -2 },
  { type: "metatarsal_fracture", label: "Fractura de metatarso", weight: 5, overallDelta: -4 },
  { type: "shoulder_dislocation", label: "Luxación de hombro", weight: 3, overallDelta: -4 },
  { type: "disc_hernia", label: "Hernia de disco", weight: 2, overallDelta: -5 },
];

// ---- Career events ------------------------------------------------------------
// Reduced catalog of Copero's personal/club career_event_* system (national
// team / abroad-specific events omitted -- Confecon has no national teams).
const EVENTS = {
  training_extra: {
    weight: 30, label: "Entrenamiento extra", icon: "🏋️",
    text: "Un preparador te ofrece sesiones extra fuera de horario.",
    choices: [
      { id: "accept", label: "Aceptar", image: "🏋️", ovrDelta: [0, 1], pills: [{ text: "+OVR posible", tone: "pos" }, { text: "Más cansancio", tone: "neg" }] },
      { id: "reject", label: "Rechazar", image: "😴", ovrDelta: [0, 0], pills: [{ text: "Sin cambios", tone: "neu" }] },
    ],
  },
  personal_coach: {
    weight: 30, label: "Entrenador personal", icon: "🧑‍🏫",
    text: "Te ofrecen contratar un entrenador personal por tu cuenta.",
    choices: [
      { id: "accept", label: "Contratarlo", image: "🧑‍🏫", ovrDelta: [0, 1], valueDelta: -0.02, pills: [{ text: "+OVR posible", tone: "pos" }, { text: "Cuesta dinero", tone: "neg" }] },
      { id: "reject", label: "Rechazar", image: "🙅", ovrDelta: [0, 0], pills: [{ text: "Sin cambios", tone: "neu" }] },
    ],
  },
  honesty_test: {
    weight: 20, label: "Prueba de honestidad", icon: "🤝",
    text: "El cuerpo técnico te pone a prueba con una decisión delicada del vestuario.",
    choices: [
      { id: "accept", label: "Ser honesto", image: "🤝", ovrDelta: [0, 0], pills: [{ text: "Confianza del plantel", tone: "pos" }] },
      { id: "reject", label: "Mirar para otro lado", image: "🙈", ovrDelta: [-1, 0], pills: [{ text: "Posible -OVR", tone: "neg" }] },
    ],
  },
  indecent_proposal: {
    weight: 20, label: "Propuesta indecente", icon: "💰",
    text: "Alguien te ofrece dinero fácil a cambio de un favor cuestionable.",
    choices: [
      { id: "reject", label: "Rechazar", image: "🚫", ovrDelta: [0, 0], pills: [{ text: "Sin cambios", tone: "neu" }] },
      { id: "proceed", label: "Aceptar", image: "💰", valueDelta: 0.05, ovrDelta: [-2, 0], pills: [{ text: "+Valor de mercado", tone: "pos" }, { text: "Riesgo de -OVR", tone: "neg" }] },
    ],
  },
  giant_tattoo: {
    weight: 35, label: "Tatuaje gigante", icon: "🖋️",
    text: "Te proponen un tatuaje enorme como sponsor personal.",
    choices: [
      { id: "accept", label: "Hacerlo", image: "🖋️", valueDelta: 0.03, pills: [{ text: "+Valor de mercado", tone: "pos" }] },
      { id: "reject", label: "Rechazar", image: "🙅", ovrDelta: [0, 0], pills: [{ text: "Sin cambios", tone: "neu" }] },
    ],
  },
  finish_high_school: {
    weight: 35, label: "Terminar el secundario", icon: "🎓",
    text: "Tenés la chance de terminar tus estudios en medio de la temporada.",
    choices: [
      { id: "accept", label: "Terminarlo", image: "🎓", ovrDelta: [0, 0], pills: [{ text: "Título asegurado", tone: "pos" }] },
      { id: "reject", label: "Dejarlo", image: "📚", ovrDelta: [0, 0], pills: [{ text: "Sin cambios", tone: "neu" }] },
    ],
  },
  controversial_statement: {
    weight: 45, label: "Declaración polémica", icon: "🎤",
    text: "Una entrevista tuya se viraliza por una frase polémica.",
    choices: [{ id: "apologize", label: "Pedir disculpas", image: "🎤", ovrDelta: [0, 0], pills: [{ text: "Controlás el daño", tone: "neu" }] }],
  },
  tax_trouble: {
    weight: 25, label: "Problema con impuestos", icon: "⚖️",
    text: "Tu contador te avisa de un problema fiscal que puede ensuciar tu imagen.",
    choices: [{ id: "stay_and_fight", label: "Dar la cara y resolverlo", image: "⚖️", valueDelta: -0.03, pills: [{ text: "-Valor de mercado", tone: "neg" }] }],
  },
  season_load: {
    weight: 30, requiresRole: ["starter", "high_rotation"],
    label: "Carga de la temporada", icon: "💪",
    text: "El cuerpo técnico te pregunta si podés sumar minutos extra.",
    choices: [
      { id: "accept", label: "Sumar minutos", image: "💪", ovrDelta: [0, 1], pills: [{ text: "Más minutos", tone: "pos" }, { text: "Riesgo de lesión", tone: "neg" }] },
      { id: "stay_calm", label: "Cuidarme", image: "🧘", ovrDelta: [0, 0], pills: [{ text: "Menos desgaste", tone: "pos" }] },
    ],
  },
  position_change: {
    weight: 25, excludeGK: true,
    label: "Cambio de posición", icon: "📋",
    text: "El entrenador te necesita para cubrir otro puesto.",
    choices: [
      { id: "accept", label: "Aceptar", image: "📋", ovrDelta: [-2, 0], pills: [{ text: "Titular durante el próximo período", tone: "pos" }, { text: "-2 OVR temporal", tone: "neg" }] },
      { id: "reject", label: "Rechazar", image: "🪑", ovrDelta: [0, 0], pills: [{ text: "Menos minutos", tone: "neg" }] },
    ],
  },
  position_competition: {
    weight: 25, requiresRole: ["starter", "high_rotation"],
    label: "Competencia interna", icon: "🥊",
    text: "Un refuerzo llega a pelearte el puesto.",
    choices: [{ id: "compete", label: "Competir por el puesto", image: "🥊", ovrDelta: [0, 1], pills: [{ text: "+OVR posible", tone: "pos" }] }],
  },
  unexpected_prospect: {
    weight: 45, requiresRole: ["starter", "high_rotation"], minAge: 22,
    label: "Promesa inesperada", icon: "🌱",
    text: "Un juvenil te pide que lo ayudes a crecer.",
    choices: [{ id: "mentor", label: "Ser su mentor", image: "🌱", ovrDelta: [0, 1], pills: [{ text: "Liderazgo (+OVR)", tone: "pos" }] }],
  },
  club_priority: {
    weight: 40, requiresRole: ["starter"], minClubReputation: 2,
    label: "Prioridad del club", icon: "🎯",
    text: "El club te pide elegir qué competencia priorizar esta temporada.",
    choices: [
      { id: "prioritize_league", label: "Priorizar la liga", image: "🏆", ovrDelta: [0, 1], pills: [{ text: "+Chances de liga", tone: "pos" }] },
      { id: "prioritize_continental", label: "Priorizar el torneo continental", image: "🌍", ovrDelta: [0, 1], pills: [{ text: "+Chances continental", tone: "pos" }] },
    ],
  },
  fan_backlash: {
    weight: 80, minAge: 22,
    label: "Enojo de la hinchada", icon: "📢",
    text: "Una mala racha de resultados hace estallar a los hinchas.",
    choices: [{ id: "stay_and_fight", label: "Dar la cara", image: "📢", ovrDelta: [-1, 0], pills: [{ text: "Presión mediática", tone: "neg" }] }],
  },
  club_crisis: {
    weight: 45, minClubReputation: 1,
    label: "Crisis institucional", icon: "🏚️",
    text: "El club atraviesa una crisis económica e institucional.",
    choices: [{ id: "stay_and_fight", label: "Bancar al club", image: "🏚️", ovrDelta: [-1, 0], valueDelta: -0.05, pills: [{ text: "-Valor de mercado", tone: "neg" }] }],
  },
  rival_offer: {
    weight: 80, requiresRole: ["starter"], minClubReputation: 2, requiresRivalClub: true,
    label: "Oferta de un rival", icon: "✈️",
    text: "Un club rival, mejor posicionado en tu mismo país, te tienta con una oferta.",
    choices: [
      { id: "accept", label: "Aceptar y cambiar de club", image: "✈️", isTransfer: true, pills: [{ text: "Cambio de club", tone: "pos" }] },
      { id: "reject", label: "Quedarme", image: "🏠", ovrDelta: [0, 1], pills: [{ text: "Lealtad (+OVR)", tone: "pos" }] },
    ],
  },
  decisive_penalty: {
    weight: 20, label: "Penal decisivo", icon: "⚽",
    text: "Te toca patear un penal clave en el final del partido.",
    choices: [
      { id: "left", label: "Palo izquierdo", image: "⚽", ovrDelta: [-1, 1], pills: [{ text: "50/50", tone: "neu" }] },
      { id: "right", label: "Palo derecho", image: "⚽", ovrDelta: [-1, 1], pills: [{ text: "50/50", tone: "neu" }] },
    ],
  },
  injury_at_peak: {
    weight: 20, requiresRole: ["starter"],
    label: "Molestia física", icon: "🩹",
    text: "Sentís una molestia justo en tu mejor momento. ¿Jugás igual?",
    choices: [
      { id: "play_injured", label: "Jugar igual", image: "🩹", ovrDelta: [-1, -1], pills: [{ text: "-1 OVR", tone: "neg" }] },
      { id: "recover", label: "Recuperarme bien", image: "🛌", ovrDelta: [0, 0], pills: [{ text: "Sin riesgo", tone: "pos" }] },
    ],
  },
};

const INJURY_EVENT_CHANCE_PER_SEASON = 0.06;

const ACHIEVEMENTS = [
  { id: "century", label: "Century Club", check: (t) => t.pj >= 100 },
  { id: "goleador", label: "Máximo Goleador", check: (t) => t.gls >= 100 },
  { id: "asistidor", label: "Cerebro del Equipo", check: (t) => t.ast >= 80 },
  { id: "leyenda", label: "Leyenda", check: (t, ovrPeak) => ovrPeak >= 85 },
  { id: "campeon", label: "Campeón Serial", check: (t, ovrPeak, trophies) => trophies.length >= 3 },
  { id: "trotamundos", label: "Trotamundos", check: (t, ovrPeak, trophies, clubCount) => clubCount >= 4 },
  { id: "indestructible", label: "Indestructible", check: (t, ovrPeak, trophies, clubCount, injuries) => injuries === 0 },
];
