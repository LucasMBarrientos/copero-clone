// Loads the Confecon-sourced fictional country/division/club catalog and
// derives the reputation fields (domestic/continental/international) Copero's
// real database has natively but Confecon doesn't -- see config.js.
let CATALOG = null;
let KITS = null;

async function loadCatalog() {
  if (CATALOG) return CATALOG;
  const [countriesRes, kitsRes] = await Promise.all([fetch("data/countries.json"), fetch("data/kits.json")]);
  const countriesJson = await countriesRes.json();
  KITS = await kitsRes.json();
  CATALOG = countriesJson.paises;
  deriveReputations(CATALOG);
  return CATALOG;
}

// Division level -> how much it drags a club's cross-country standing down.
function divisionPenalty(nivel) {
  return (nivel - 1) * 2;
}

function deriveReputations(countries) {
  for (const pais of countries) {
    // Domestic standing is measured against the whole country, not just the
    // club's own division -- otherwise the best 2nd-division side would rate
    // as highly as the national champion.
    const everyClub = pais.divisiones.flatMap((d) => d.clubes);
    const ranked = [...everyClub].sort((a, b) => a.ovr - b.ovr);
    for (const div of pais.divisiones) {
      for (const club of div.clubes) {
        const rank = ranked.findIndex((c) => c.slug === club.slug);
        const percentile = ranked.length > 1 ? rank / (ranked.length - 1) : 1;
        club.paisSlug = pais.slug;
        club.divisionNivel = div.nivel;
        club.divisionNombre = div.nombre;
        club.domesticReputation = Math.max(0, domesticReputationFromPercentile(percentile) - divisionPenalty(div.nivel));
        club.continentalReputation = Math.max(0, continentalReputationFromOvr(club.ovr) - divisionPenalty(div.nivel));
        club.internationalReputation = Math.max(-1, internationalReputationFromOvr(club.ovr) - divisionPenalty(div.nivel));
        club.hasDomesticCup = true;
      }
    }
  }
}

function getCountries() {
  return CATALOG;
}

function getKit(paisSlug) {
  return KITS[paisSlug] || { primary: "#808080", secondary: null, tertiary: "#FFFFFF", pattern: "solid" };
}

function findCountry(slug) {
  return CATALOG.find((p) => p.slug === slug);
}

function findDivision(paisSlug, nivel) {
  const pais = findCountry(paisSlug);
  return pais ? pais.divisiones.find((d) => d.nivel === nivel) : null;
}

function findClub(paisSlug, clubSlug) {
  const pais = findCountry(paisSlug);
  if (!pais) return null;
  for (const div of pais.divisiones) {
    const club = div.clubes.find((c) => c.slug === clubSlug);
    if (club) return club;
  }
  return null;
}

function clubKey(club) {
  return `${club.paisSlug}/${club.slug}`;
}

function allClubs() {
  const out = [];
  for (const pais of CATALOG) {
    for (const div of pais.divisiones) {
      for (const club of div.clubes) {
        out.push(club);
      }
    }
  }
  return out;
}

function clubsByInternationalReputation(tier) {
  return allClubs().filter((c) => c.internationalReputation === tier);
}

function countryOf(club) {
  return findCountry(club.paisSlug);
}

// Confecon's division titles are long ("Mirmanian Championship - 2nd
// Division"); the offer cards only have room for a short label.
function shortDivisionName(club) {
  const name = club.divisionNombre;
  const compact = name.replace(/\s*[-–]\s*/g, " ").trim();
  const match = compact.match(/(1st|2nd|3rd|4th|primera|segunda|tercera|cuarta|primeira|1º|2º|3º|1o|2o|3o)/i);
  if (!match) return compact.length > 22 ? `${compact.slice(0, 21)}…` : compact;
  const level = club.divisionNivel;
  return ["Primera División", "Segunda División", "Tercera División", "Cuarta División"][level - 1] || compact;
}

function leagueLabel(club) {
  const pais = findCountry(club.paisSlug);
  return `${shortDivisionName(club)} · ${pais.nombre}`;
}

// Swaps a club with a counterpart in the adjacent division, so division sizes
// stay stable over a long career (a promotion always costs someone a spot).
// Returns "promotion" | "relegation" | null.
function moveClubDivision(club, direction) {
  const pais = findCountry(club.paisSlug);
  const targetNivel = club.divisionNivel + (direction === "promotion" ? -1 : 1);
  const target = pais.divisiones.find((d) => d.nivel === targetNivel);
  const source = pais.divisiones.find((d) => d.nivel === club.divisionNivel);
  if (!target || !source || target.clubes.length === 0) return null;

  // Promoting swaps with the weakest club above; relegating swaps with the
  // strongest club below.
  const counterpart = [...target.clubes].sort((a, b) => a.ovr - b.ovr)[
    direction === "promotion" ? 0 : target.clubes.length - 1
  ];

  source.clubes = source.clubes.filter((c) => c.slug !== club.slug);
  target.clubes = target.clubes.filter((c) => c.slug !== counterpart.slug);
  target.clubes.push(club);
  source.clubes.push(counterpart);

  club.divisionNivel = target.nivel;
  club.divisionNombre = target.nombre;
  counterpart.divisionNivel = source.nivel;
  counterpart.divisionNombre = source.nombre;

  deriveReputations([pais]);
  return direction;
}
