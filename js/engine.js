// Career-progression engine -- reimplements Copero's role/appearance/growth/
// scoring/trophy/event formulas (see config.js) over our fictional catalog.

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function randFloat(min, max) {
  return min + Math.random() * (max - min);
}
function pickRandom(arr, n) {
  const copy = [...arr];
  const out = [];
  while (copy.length && out.length < n) {
    const i = randInt(0, copy.length - 1);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}
function weightedPick(items, weightFn) {
  const total = items.reduce((acc, it) => acc + weightFn(it), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const it of items) {
    r -= weightFn(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
function rollChance(p) {
  return Math.random() < p;
}

function currentClubObj(career) {
  if (!career.clubActual) return null;
  const [paisSlug, clubSlug] = career.clubActual.split("/");
  return findClub(paisSlug, clubSlug);
}

// ---- Offers -----------------------------------------------------------------

// Youth offers come from the lowest divisions of the player's own country.
function generateYouthOffers(career) {
  const country = findCountry(career.nacionalidadSlug);
  const lowestNivel = Math.max(...country.divisiones.map((d) => d.nivel));
  const preferred = country.divisiones
    .filter((d) => d.nivel === lowestNivel || d.nivel >= 2)
    .flatMap((d) => d.clubes);
  const pool = preferred.length >= OFFER_RULES.youthOfferCount ? preferred : country.divisiones.flatMap((d) => d.clubes);
  const weakest = [...pool].sort((a, b) => a.ovr - b.ovr).slice(0, Math.max(OFFER_RULES.youthOfferCount * 3, 8));
  return pickRandom(weakest, OFFER_RULES.youthOfferCount);
}

// General "Mercado de pases" offer generator (Copero's Ae, adapted).
function generateTransferOffers(career) {
  const tier = playerTier(career.ovr);
  const sameCountryWeight = OFFER_RULES.sameCountryWeight(career.ovr);
  const excludeKey = career.clubActual;
  const offers = [];
  const usedKeys = new Set([excludeKey]);

  for (let i = 0; i < OFFER_RULES.transferOfferCount; i++) {
    let candidateTier = walkTier(tier);
    let candidates = clubsByInternationalReputation(candidateTier).filter((c) => !usedKeys.has(clubKey(c)));
    let attempts = 0;
    while (candidates.length === 0 && attempts < 8) {
      candidateTier = Math.max(-1, Math.min(5, candidateTier + (attempts % 2 === 0 ? 1 : -1)));
      candidates = clubsByInternationalReputation(candidateTier).filter((c) => !usedKeys.has(clubKey(c)));
      attempts++;
    }
    if (candidates.length === 0) break;

    let pool = candidates;
    if (career.nacionalidadSlug && Math.random() < sameCountryWeight) {
      const homeCandidates = candidates.filter((c) => c.paisSlug === career.nacionalidadSlug);
      if (homeCandidates.length) pool = homeCandidates;
    }
    const pick = pool[randInt(0, pool.length - 1)];
    offers.push(pick);
    usedKeys.add(clubKey(pick));
  }
  return offers;
}

// "rival_offer" event candidate pool (Copero's vr): same country, equal-or-better club.
function rivalOffers(career) {
  const club = currentClubObj(career);
  if (!club) return [];
  return allClubs().filter(
    (c) =>
      clubKey(c) !== career.clubActual &&
      c.paisSlug === club.paisSlug &&
      c.divisionNivel <= club.divisionNivel &&
      c.domesticReputation >= club.domesticReputation &&
      c.internationalReputation >= club.internationalReputation
  );
}

function applyOffer(career, offer) {
  career.clubActual = clubKey(offer);
  if (!career.clubsPlayedFor.includes(career.clubActual)) {
    career.clubsPlayedFor.push(career.clubActual);
  }
}

// ---- Career events ------------------------------------------------------------

function eventEligible(key, def, career, role) {
  const club = currentClubObj(career);
  if (def.excludeGK && career.posicion === "POR") return false;
  if (def.requiresRole && !def.requiresRole.includes(role)) return false;
  if (def.minAge && career.edad < def.minAge) return false;
  if (def.minClubReputation != null) {
    if (!club || !(club.domesticReputation > def.minClubReputation || club.internationalReputation > def.minClubReputation)) return false;
  }
  if (def.requiresRivalClub && rivalOffers(career).length === 0) return false;
  return true;
}

// Rolls at most one eligible event for the upcoming checkpoint (or null).
function rollCareerEvent(career, role) {
  if (career.history.length === 0) return null; // no events before the youth debut
  const eligible = Object.entries(EVENTS).filter(([key, def]) => eventEligible(key, def, career, role));
  if (!eligible.length) return null;
  if (!rollChance(0.55)) return null; // not every checkpoint has an event
  const [key] = weightedPick(eligible, ([, def]) => def.weight) || [];
  return key ? { key } : null;
}

function applyEventChoice(career, key, choiceId) {
  const def = EVENTS[key];
  const choice = def.choices.find((c) => c.id === choiceId);
  if (!choice) return { isTransfer: false };
  if (choice.ovrDelta) {
    const delta = randFloat(choice.ovrDelta[0], choice.ovrDelta[1]);
    career.ovr = clampOvr(career.ovr + delta);
  }
  if (choice.valueDelta) {
    career.valorMercado = Math.max(10000, Math.round(career.valorMercado * (1 + choice.valueDelta)));
  }
  career.eventLog.push({ key, label: def.label, choice: choice.label, edad: career.edad });
  return { isTransfer: !!choice.isTransfer };
}

function clampOvr(value) {
  return Math.max(35, Math.min(99, Math.round(value)));
}

// ---- Season simulation --------------------------------------------------------

function simulateSeason(career) {
  const club = currentClubObj(career);
  const isGK = isGoalkeeper(career.posicion);
  const internationalRep = club ? club.internationalReputation : 0;
  const baseline = teamBaseline(internationalRep);
  const overallVsBaseline = career.ovr - baseline;
  const role = roleBucket(overallVsBaseline, isGK);

  // Growth
  const range = growthRangeForAge(career.edad + 1, career.developmentProfile, isGK);
  let lowRotationStreak = career.lowRotationStreak || 0;
  if (role === "low_rotation" || role === "substitute" || role === "third_keeper") lowRotationStreak++;
  else lowRotationStreak = 0;
  career.lowRotationStreak = lowRotationStreak;
  let delta = randFloat(range[0] / 2, range[1] / 2);
  if (lowRotationStreak >= 4) {
    delta = Math.min(delta, randFloat(range[0] / 2, range[1] / 2));
  }
  career.edad += 1;
  career.ovr = clampOvr(career.ovr + delta);
  career.ovrPeak = Math.max(career.ovrPeak, career.ovr);

  // Appearances
  const ranges = isGK ? APPEARANCE_RANGES.goalkeeper : APPEARANCE_RANGES.outfield;
  const appearanceRange = ranges[role] || ranges.substitute || [5, 14];
  const rawGames = randInt(appearanceRange[0], appearanceRange[1]);
  const pj = Math.round(rawGames * (club ? appearanceMultiplier(club) : 0.7));

  // Goals/assists
  let gls = 0, ast = 0;
  if (!isGK) {
    const archetype = POSITION_ARCHETYPE[career.posicion] || "support";
    const bucket = scoringBucket(overallVsBaseline);
    const strengthMult = TEAM_STRENGTH_SCORING_MULT[Math.max(0, Math.min(5, club ? club.domesticReputation : 0))];
    const qualityMult = overallScoringCurve(career.ovr);
    gls = Math.max(0, Math.round(pj * GOAL_RATE[archetype][bucket] * strengthMult * qualityMult * randFloat(0.9, 1.1)));
    ast = Math.max(0, Math.round(pj * ASSIST_RATE[archetype][bucket] * strengthMult * qualityMult * randFloat(0.9, 1.1)));
  }

  // Random injury (independent of the "injury_at_peak" decision event).
  const seasonEvents = [];
  if (rollChance(INJURY_EVENT_CHANCE_PER_SEASON)) {
    const injury = weightedPick(INJURY_TYPES, (i) => i.weight);
    career.ovr = clampOvr(career.ovr + injury.overallDelta);
    career.injuries.push({ type: injury.type, label: injury.label, edad: career.edad });
    seasonEvents.push({ kind: "injury", label: injury.label, icon: "🩹", edad: career.edad });
  }

  // Trophies
  if (club) {
    const star = starMultiplier(career.ovr - baseline);
    const eff = effectiveReputationForTrophies(career.ovr, club);
    const candidates = [];
    if (club.divisionNivel === 1) candidates.push(["league", LEAGUE_TROPHY_PROB[eff.domestic]]);
    if (club.hasDomesticCup) candidates.push(["cup", CUP_TROPHY_PROB[eff.domestic]]);
    if (club.divisionNivel === 1) {
      candidates.push(["continental_primary", CONTINENTAL_PRIMARY_PROB[eff.continental]]);
      candidates.push(["continental_secondary", CONTINENTAL_SECONDARY_PROB[eff.continental]]);
    }
    for (const [type, prob] of candidates) {
      if (rollChance(Math.min(1, prob * star))) {
        const trophy = { type, icon: TROPHIES[type].icon, label: TROPHIES[type].label, edad: career.edad, club: club.nombre };
        career.trophies.push(trophy);
        seasonEvents.push({ kind: "trophy", label: TROPHIES[type].label, icon: TROPHIES[type].icon, type, club: club.nombre, edad: career.edad });
        break; // one trophy per season
      }
    }

    // Promotion / relegation -- only where the country actually has the
    // division above/below (Copero's hl()).
    const move = rollPromotionRelegation(career, club);
    if (move) seasonEvents.push(move);
  }

  career.valorMercado = valueFormula(career.ovr, career.edad);
  career.careerTotals.pj += pj;
  career.careerTotals.gls += gls;
  career.careerTotals.ast += ast;

  return { pj, gls, ast, role, seasonEvents };
}

// A club's league finish is modelled by its OVR rank within its own division:
// the top of a lower division goes up, the bottom of an upper division goes down.
function rollPromotionRelegation(career, club) {
  const pais = findCountry(club.paisSlug);
  const division = pais.divisiones.find((d) => d.nivel === club.divisionNivel);
  if (!division || division.clubes.length < 4) return null;

  const sorted = [...division.clubes].sort((a, b) => b.ovr - a.ovr);
  const rank = sorted.findIndex((c) => c.slug === club.slug); // 0 = best
  const size = sorted.length;

  const hasUpper = pais.divisiones.some((d) => d.nivel === club.divisionNivel - 1);
  const hasLower = pais.divisiones.some((d) => d.nivel === club.divisionNivel + 1);

  // Top ~15% of a lower division promotes; bottom ~15% of a division relegates.
  const promoteCutoff = Math.max(1, Math.round(size * 0.15));
  const relegateCutoff = Math.max(1, Math.round(size * 0.15));

  if (hasUpper && rank < promoteCutoff && rollChance(0.5)) {
    if (moveClubDivision(club, "promotion")) {
      return { kind: "promotion", label: `Ascenso a ${shortDivisionName(club)}`, icon: "⬆️", club: club.nombre, edad: career.edad };
    }
  }
  if (hasLower && rank >= size - relegateCutoff && rollChance(0.5)) {
    if (moveClubDivision(club, "relegation")) {
      return { kind: "relegation", label: `Descenso a ${shortDivisionName(club)}`, icon: "⬇️", club: club.nombre, edad: career.edad };
    }
  }
  return null;
}

function simulateSegment(career, seasons) {
  let pj = 0, gls = 0, ast = 0, lastRole = career.lastRole;
  const events = [];
  for (let i = 0; i < seasons; i++) {
    const s = simulateSeason(career);
    pj += s.pj; gls += s.gls; ast += s.ast; lastRole = s.role;
    events.push(...s.seasonEvents);
  }
  career.lastRole = lastRole;
  career.seasonStats = { pj, gls, ast };
  career.pendingCelebrations = events;

  const club = currentClubObj(career);
  career.history.push({
    edad: career.edad,
    clubNombre: club ? club.nombre : "Libre",
    clubSlug: club ? club.slug : null,
    paisSlug: club ? club.paisSlug : null,
    divisionNombre: club ? club.divisionNombre : null,
    ovr: career.ovr,
    pj, gls, ast,
  });
  return career;
}

function isRetired(career) {
  return career.edad >= RETIRE_AGE;
}

function unlockedAchievements(career) {
  return ACHIEVEMENTS.filter((a) =>
    a.check(career.careerTotals, career.ovrPeak, career.trophies, career.clubsPlayedFor.length, career.injuries.length)
  );
}
