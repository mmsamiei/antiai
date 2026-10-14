import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iranPath = process.env.IRAN_GEONAMES_PATH || "/tmp/anti-ai-geonames/IR.txt";
const capitalsPath = process.env.CAPITALS_GEONAMES_PATH || "/tmp/anti-ai-geonames/cities15000.txt";
const countriesPath = process.env.COUNTRIES_JSON_PATH || "/tmp/anti-ai-countries.json";

const persian = /[\u0600-\u06ff]/;
const arabicDiacritics = /[\u064b-\u065f\u0670]/g;

function normalizePersian(value) {
  return value
    .normalize("NFKC")
    .replaceAll("ي", "ی")
    .replaceAll("ى", "ی")
    .replaceAll("ك", "ک")
    .replace(/[أإٱ]/g, "ا")
    .replaceAll("ة", "ه")
    .replace(arabicDiacritics, "")
    .replace(/[ـ‌]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const preferredIranNames = new Map(Object.entries({
  Tehran: "تهران", Mashhad: "مشهد", Isfahan: "اصفهان", Karaj: "کرج", Shiraz: "شیراز",
  Tabriz: "تبریز", Qom: "قم", Ahvaz: "اهواز", Kermanshah: "کرمانشاه", Urmia: "ارومیه",
  Rasht: "رشت", Zahedan: "زاهدان", Hamadan: "همدان", Kerman: "کرمان", Yazd: "یزد",
  Ardabil: "اردبیل", "Bandar Abbas": "بندرعباس", Arak: "اراک", Eslamshahr: "اسلامشهر",
  Zanjan: "زنجان", Sanandaj: "سنندج", Qazvin: "قزوین", Khorramabad: "خرم‌آباد",
  Gorgan: "گرگان", Sari: "ساری", Borujerd: "بروجرد", Dezful: "دزفول", Neyshabur: "نیشابور",
  Kashan: "کاشان", Sabzevar: "سبزوار", Amol: "آمل", Babol: "بابل", Abadan: "آبادان",
  Khorramshahr: "خرمشهر", Bushehr: "بوشهر", Birjand: "بیرجند", Ilam: "ایلام",
  Bojnurd: "بجنورد", Semnan: "سمنان", Shahrekord: "شهرکرد", Yasuj: "یاسوج"
}));

const preferredIranIds = new Map(Object.entries({
  "13405749": "نسیم‌شهر",
  "13562246": "باغستان",
  "1159877": "قصرقند",
  "111407": "زارچ",
  "418896": "درچه",
  "401202": "پاسارگاد",
  "403707": "اروندکنار",
  "13590593": "خلیل‌شهر"
}));

const preferredCountryNames = new Map(Object.entries({
  GN: "گینه",
  PG: "پاپوآ گینه نو",
  CD: "جمهوری دموکراتیک کنگو",
  CG: "جمهوری کنگو"
}));

function choosePersianName(row) {
  const byId = preferredIranIds.get(row.id);
  if (byId) return byId;
  const preferred = preferredIranNames.get(row.asciiName);
  if (preferred) return preferred;
  const options = row.alternates
    .map(normalizePersian)
    .filter((value) => persian.test(value) && value.length >= 2 && value.length <= 35)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort((a, b) => a.length - b.length);
  return options[0] || row.name;
}

function readGeoNames(file) {
  return fs.readFileSync(file, "utf8").trim().split("\n").map((line) => {
    const c = line.split("\t");
    return {
      id: c[0], name: c[1], asciiName: c[2], alternates: (c[3] || "").split(","),
      latitude: Number(c[4]), longitude: Number(c[5]), featureClass: c[6], featureCode: c[7],
      countryCode: c[8], population: Number(c[14] || 0)
    };
  });
}

const iranCandidates = readGeoNames(iranPath)
  .filter((row) => row.featureClass === "P" && row.featureCode.startsWith("PPL"))
  .sort((a, b) => b.population - a.population);

const seenIranNames = new Set();
const iranRows = iranCandidates.filter((row) => {
  const key = normalizePersian(choosePersianName(row));
  if (seenIranNames.has(key)) return false;
  seenIranNames.add(key);
  return true;
}).slice(0, 500);

const geoNamesIranCities = iranRows.map((row) => {
  const name = choosePersianName(row);
  const aliases = [...new Set([
    name, row.name, row.asciiName,
    ...row.alternates.filter((value) => persian.test(value)).map(normalizePersian)
  ].filter((value) => value && value.length <= 40))];
  return {
    id: `ir-${row.id}`,
    name,
    aliases,
    latitude: row.latitude,
    longitude: row.longitude
  };
});

const capitalRows = readGeoNames(capitalsPath).filter((row) => row.featureCode === "PPLC");
const capitalByCountry = new Map(capitalRows.map((row) => [row.countryCode, row]));
const countryRows = JSON.parse(fs.readFileSync(countriesPath, "utf8"));
const countryDescriptionsPath = path.join(projectRoot, "scripts/data/country-descriptions.fa.json");
const countryDescriptions = JSON.parse(fs.readFileSync(countryDescriptionsPath, "utf8"));

const iranAdminSnapshotDir = path.join(projectRoot, "scripts/data/iran-admin-v3.1.2");
const officialIranCities = JSON.parse(fs.readFileSync(path.join(iranAdminSnapshotDir, "cities-filtered.json"), "utf8"));
const numberedUrbanZones = officialIranCities.filter((city) => /[0-9۰-۹]\s*$/.test(city.name));
if (numberedUrbanZones.length !== 20) throw new Error(`Unexpected numbered urban-zone count: ${numberedUrbanZones.length}`);
const playableOfficialCities = officialIranCities.filter((city) => !/[0-9۰-۹]\s*$/.test(city.name));
if (playableOfficialCities.length !== 1461) throw new Error(`Unexpected official city count: ${playableOfficialCities.length}`);
const officialIds = new Set(playableOfficialCities.map((city) => String(city.id)));
const coordinateRows = JSON.parse(fs.readFileSync(path.join(iranAdminSnapshotDir, "city-coordinates.json"), "utf8"));
const runtimeIds = new Set();
const runtimeCoordinates = new Set();
const iranCities = coordinateRows.map((row) => {
  if (!officialIds.has(String(row.officialId))) throw new Error(`Unknown official city ID: ${row.officialId}`);
  if (runtimeIds.has(row.id)) throw new Error(`Duplicate runtime city ID: ${row.id}`);
  if (!Number.isFinite(row.latitude) || !Number.isFinite(row.longitude)) throw new Error(`Invalid coordinates for ${row.name}`);
  const coordinateKey = `${row.latitude},${row.longitude}`;
  if (runtimeCoordinates.has(coordinateKey)) throw new Error(`Duplicate city coordinates: ${coordinateKey}`);
  runtimeIds.add(row.id);
  runtimeCoordinates.add(coordinateKey);
  return { id: row.id, name: row.name, aliases: row.aliases, latitude: row.latitude, longitude: row.longitude, provinceName: row.provinceName };
});
if (iranCities.length !== 1461 || runtimeIds.size !== 1461) throw new Error(`Incomplete Iran city coordinates: ${iranCities.length}`);

const countries = countryRows
  .filter((country) => country.unMember || ["VA", "PS"].includes(country.cca2))
  .map((country) => {
    const capital = capitalByCountry.get(country.cca2);
    const translated = preferredCountryNames.get(country.cca2) || country.translations?.per?.common || country.name.common;
    const aliases = [...new Set([
      translated,
      country.translations?.per?.official,
      country.name.common,
      country.name.official,
      country.cca2,
      ...(country.altSpellings || [])
    ].filter(Boolean))];
    return {
      id: country.cca2.toLowerCase(),
      name: normalizePersian(translated),
      aliases,
      latitude: capital?.latitude ?? country.latlng[0],
      longitude: capital?.longitude ?? country.latlng[1],
      emoji: country.flag,
      detail: country.capital?.[0] || ""
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "fa"));

function writeDataset(filename, exportName, rows) {
  const banner = filename === "iran-cities.ts"
    ? "// Generated from Iran administrative divisions v3.1.2 and audited coordinates. Do not edit manually.\n"
    : "// Generated from GeoNames and mledoze/countries. Do not edit manually.\n";
  const body = `${banner}import type { GeoItem } from \"../geo\";\n\nexport const ${exportName}: GeoItem[] = ${JSON.stringify(rows, null, 2)};\n`;
  fs.writeFileSync(path.join(projectRoot, "lib/data", filename), body);
}

const countryIds = new Set(countries.map((country) => country.id));
const missingDescriptions = [...countryIds].filter((id) => !(countryDescriptions[id]?.description || countryDescriptions[id])?.trim());
const extraDescriptions = Object.keys(countryDescriptions).filter((id) => !countryIds.has(id));
if (missingDescriptions.length || extraDescriptions.length) throw new Error(`Country descriptions mismatch: missing=${missingDescriptions.join(",")} extra=${extraDescriptions.join(",")}`);

writeDataset("iran-cities.ts", "iranCities", iranCities);
writeDataset("countries.ts", "countries", countries);
console.log(`Generated ${iranCities.length} Iran cities and ${countries.length} countries.`);
