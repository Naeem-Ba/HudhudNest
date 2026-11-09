#!/usr/bin/env node
// =============================================================
// tools/geo/nominatim-coverage.mjs
//
// Measures how well OpenStreetMap's Nominatim covers the places HudhudNest cares about, BEFORE the provider is
// switched on in production. It answers the question the session could not (it has no route to nominatim): for
// Damascus, Rif Dimashq, Aleppo, Homs and Latakia, do searches and map pins come back with a usable address
// chain (governorate / city / district / neighborhood / street), in Arabic?
//
//   node tools/geo/nominatim-coverage.mjs --email you@example.org [--out report.json] [--base https://nominatim.openstreetmap.org]
//
// It follows the public usage policy: identifies itself with your e-mail, ONE request per second, a few dozen
// requests in total (about a minute), no as-you-type calls. Do not loop it. Nothing is written to HudhudNest.
// The classification below mirrors NominatimGeocodingProvider.cs, so "usable" here means "usable there".
// =============================================================

import { writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));

const email = args.email;
const base = (args.base || 'https://nominatim.openstreetmap.org').replace(/\/$/, '');
if (!email || !email.includes('@')) {
  console.error('Pass your contact address: --email you@example.org (the Nominatim usage policy requires it).');
  process.exit(2);
}
const MIN_GAP_MS = base.includes('nominatim.openstreetmap.org') ? 1100 : Number(args.gap || 100);

// What we expect to be able to find, per area. `governorate` is a pattern for the governorate name the provider
// should return (Arabic or English), so the check is about the right place, not just any answer.
const AREAS = [
  {
    name: 'Damascus (دمشق)', governorate: /دمشق|damascus/i,
    searches: ['دمشق', 'المزة دمشق', 'المالكي دمشق', 'باب توما دمشق', 'شارع بغداد دمشق', 'ساحة الأمويين دمشق', 'Mazzeh Damascus', 'Malki Damascus'],
    pins: [[33.5138, 36.2765], [33.5002, 36.2412], [33.5118, 36.3094]]
  },
  {
    name: 'Rif Dimashq (ريف دمشق)', governorate: /ريف دمشق|rif dimashq|damascus countryside/i,
    searches: ['دوما', 'جرمانا', 'داريا', 'صحنايا', 'الزبداني', 'Douma Syria', 'Jaramana'],
    pins: [[33.5714, 36.4033], [33.4862, 36.3489]]
  },
  {
    name: 'Aleppo (حلب)', governorate: /حلب|aleppo/i,
    searches: ['حلب', 'الجميلية حلب', 'العزيزية حلب', 'قلعة حلب', 'شارع القوتلي حلب', 'Aleppo Citadel', 'Jamiliyah Aleppo'],
    pins: [[36.1989, 37.1613], [36.2145, 37.1330]]
  },
  {
    name: 'Homs (حمص)', governorate: /حمص|homs/i,
    searches: ['حمص', 'الحمرا حمص', 'ساحة الساعة حمص', 'الوعر حمص', 'Homs Syria'],
    pins: [[34.7324, 36.7137], [34.7440, 36.7000]]
  },
  {
    name: 'Latakia (اللاذقية)', governorate: /اللاذقية|latakia/i,
    searches: ['اللاذقية', 'الصليبة اللاذقية', 'الكورنيش الجنوبي اللاذقية', 'جبلة', 'Latakia Syria'],
    pins: [[35.5317, 35.7921], [35.5176, 35.7852]]
  }
];

// Same reduction as NominatimGeocodingProvider.Classify / ParsePlace.
function classify(item) {
  const category = item.category ?? item.class;
  const type = item.type;
  const addressType = item.addresstype;
  if (category === 'highway' || addressType === 'road') return 'Street';
  switch (addressType ?? type) {
    case 'state': case 'province': case 'region': return 'Governorate';
    case 'city': case 'town': case 'village': case 'municipality': case 'hamlet': return 'City';
    case 'county': case 'city_district': case 'district': case 'borough': return 'District';
    case 'suburb': case 'neighbourhood': case 'quarter': case 'residential': return 'Neighborhood';
    default: return null;
  }
}

function chain(address = {}) {
  const parts = {};
  const put = (level, ...keys) => { for (const k of keys) if (address[k] && !parts[level]) parts[level] = address[k]; };
  put('Governorate', 'state', 'province');
  put('District', 'county', 'city_district', 'district');
  put('City', 'city', 'town', 'village', 'municipality');
  put('Neighborhood', 'suburb', 'neighbourhood', 'quarter');
  put('Street', 'road');
  return parts;
}

let last = 0;
let requests = 0;
async function get(path) {
  const wait = last + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  requests++;
  const url = `${base}/${path}${path.includes('?') ? '&' : '?'}format=jsonv2&addressdetails=1&accept-language=ar&email=${encodeURIComponent(email)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': `HudhudNest-coverage-check/1.0 (${email})`, Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
    if (res.status === 429) return { error: 'rate-limited (429) — stop and wait before running again' };
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { json: await res.json() };
  } catch (e) {
    return { error: String(e?.cause?.code || e?.message || e) };
  }
}

const report = [];
let blocked = false;

for (const area of AREAS) {
  const entry = { area: area.name, searches: [], pins: [] };
  console.log(`\n== ${area.name}`);

  for (const q of area.searches) {
    if (blocked) break;
    const r = await get(`search?q=${encodeURIComponent(q)}&countrycodes=sy&limit=8&dedupe=1`);
    if (r.error) { console.log(`  ✗ search "${q}": ${r.error}`); entry.searches.push({ q, error: r.error }); if (r.error.startsWith('rate')) blocked = true; continue; }
    const items = Array.isArray(r.json) ? r.json : [];
    const usable = items.map(i => ({ type: classify(i), name: i.name || i.display_name, chain: chain(i.address) })).filter(i => i.type);
    const inArea = usable.filter(u => area.governorate.test(u.chain.Governorate ?? '') || area.governorate.test(u.name ?? ''));
    const ok = inArea.length > 0;
    console.log(`  ${ok ? '✓' : '✗'} "${q}": ${items.length} results, ${usable.length} usable levels, ${inArea.length} in the right governorate` +
      (inArea[0] ? ` — best: ${inArea[0].type} «${inArea[0].name}» (${Object.keys(inArea[0].chain).join('/')})` : ''));
    entry.searches.push({ q, results: items.length, usable: usable.length, inArea: inArea.length, best: inArea[0] ?? null });
  }

  for (const [lat, lon] of area.pins) {
    if (blocked) break;
    const r = await get(`reverse?lat=${lat}&lon=${lon}&zoom=18`);
    if (r.error) { console.log(`  ✗ pin ${lat},${lon}: ${r.error}`); entry.pins.push({ lat, lon, error: r.error }); if (r.error.startsWith('rate')) blocked = true; continue; }
    const item = r.json;
    if (!item || item.error) { console.log(`  ✗ pin ${lat},${lon}: nothing found`); entry.pins.push({ lat, lon, found: false }); continue; }
    const levels = chain(item.address);
    const inArea = area.governorate.test(levels.Governorate ?? '') || area.governorate.test(item.display_name ?? '');
    const have = Object.keys(levels);
    console.log(`  ${inArea ? '✓' : '✗'} pin ${lat},${lon}: ${have.join(' › ') || '(no address parts)'}${levels.Street ? ` — «${levels.Street}»` : ' — no street'}`);
    entry.pins.push({ lat, lon, found: true, inArea, levels });
  }
  report.push(entry);
}

// ── summary ────────────────────────────────────────────────
const searches = report.flatMap(r => r.searches).filter(s => !s.error);
const pins = report.flatMap(r => r.pins).filter(p => !p.error);
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');
const searchHit = searches.filter(s => s.inArea > 0).length;
const pinStreet = pins.filter(p => p.levels?.Street).length;
const pinGov = pins.filter(p => p.levels?.Governorate).length;
const pinDistrictish = pins.filter(p => p.levels?.District || p.levels?.Neighborhood || p.levels?.City).length;

console.log('\n== Summary');
console.log(`  requests sent:                              ${requests}`);
console.log(`  searches finding the right governorate:     ${searchHit}/${searches.length} (${pct(searchHit, searches.length)})`);
console.log(`  pins returning a governorate:               ${pinGov}/${pins.length} (${pct(pinGov, pins.length)})`);
console.log(`  pins returning city / district / neighborhood: ${pinDistrictish}/${pins.length} (${pct(pinDistrictish, pins.length)})`);
console.log(`  pins returning a street name:               ${pinStreet}/${pins.length} (${pct(pinStreet, pins.length)})`);
console.log('\nHow to read it: a low street share is fine (streets stay optional, the user can type one or skip it);');
console.log('a low governorate share means the provider cannot anchor results to our catalog and is not worth switching on.');
if (blocked) console.log('\n⚠ Stopped early: the server rate-limited this run. Wait several minutes before trying again.');

if (args.out) {
  writeFileSync(args.out, JSON.stringify({ at: new Date().toISOString(), base, requests, report }, null, 2));
  console.log(`\nFull results written to ${args.out}`);
}
