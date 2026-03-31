/**
 * Route Audit Script
 *
 * Audits route stop coordinates against Nominatim geocoding data.
 * Identifies stops whose seed/DB coordinates are far from their real locations.
 *
 * Usage:
 *   tsx scripts/audit-route.ts R-15                     # audit via DB (fallback: seed.ts)
 *   tsx scripts/audit-route.ts R-15 --no-db             # audit from seed.ts only
 *   tsx scripts/audit-route.ts R-15 --overpass           # also fetch road geometry
 *   tsx scripts/audit-route.ts R-15 --output json        # JSON output
 *   tsx scripts/audit-route.ts R-15 --city "Playa del Carmen, Mexico"
 */

import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ──────────────────────────────────────────

type StopDef = { name: string; lat: number; lng: number };
type DirectionDef = {
  name: string;
  index: number;
  totalStops: number;
  duration: number;
  startTime: string;
  endTime: string;
  operatesOn: string;
  stops: StopDef[];
};
type RouteDef = {
  name: string;
  longName: string;
  type: string;
  color: string;
  fare: number;
  linestring: string;
  directions: DirectionDef[];
};

type Classification = 'OK' | 'Warning' | 'Error' | 'Not Found';

type StopAudit = {
  name: string;
  directionName: string;
  currentLat: number;
  currentLng: number;
  geocodedLat: number | null;
  geocodedLng: number | null;
  distanceMeters: number | null;
  classification: Classification;
  geocodeDisplayName: string | null;
};

type CliArgs = {
  routeName: string;
  noDb: boolean;
  overpass: boolean;
  outputFormat: 'console' | 'json';
  city: string;
};

// ─── CLI Argument Parsing ───────────────────────────

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0].startsWith('--')) {
    console.error('Usage: tsx scripts/audit-route.ts <ROUTE_NAME> [--no-db] [--overpass] [--output json] [--city "..."]');
    process.exit(1);
  }

  const routeName = args[0];
  let noDb = false;
  let overpass = false;
  let outputFormat: 'console' | 'json' = 'console';
  let city = 'Cancún, Mexico';

  for (let i = 1; i < args.length; i++) {
    switch (args[i]) {
      case '--no-db':
        noDb = true;
        break;
      case '--overpass':
        overpass = true;
        break;
      case '--output':
        if (args[i + 1] === 'json') outputFormat = 'json';
        i++;
        break;
      case '--city':
        city = args[++i];
        break;
    }
  }

  return { routeName, noDb, overpass, outputFormat, city };
}

// ─── Database Loading ───────────────────────────────

async function loadRouteFromDb(routeName: string): Promise<RouteDef | null> {
  let prisma: PrismaClient | null = null;
  try {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });

    const routes = await prisma.$queryRaw<{ id: string; route_name: string; route_long_name: string; route_type: string; color: string; fare_amount: number; linestring: string }[]>`
      SELECT
        r.id::text,
        r.route_name,
        r.route_long_name,
        r.route_type,
        r.color,
        r.fare_amount,
        ST_AsText(r.linestring::geometry) AS linestring
      FROM routes r
      WHERE r.route_name = ${routeName}
      LIMIT 1;
    `;

    if (routes.length === 0) return null;
    const route = routes[0];

    const directions = await prisma.$queryRaw<{ id: string; direction_name: string; direction_index: number; total_stops: number; duration: number; start_time: string; end_time: string; operates_on: string }[]>`
      SELECT
        rd.id::text,
        rd.direction_name,
        rd.direction_index,
        rd.total_stops,
        rd.duration,
        rd.start_time,
        rd.end_time,
        rd.operates_on
      FROM route_directions rd
      WHERE rd.route_id = ${route.id}::uuid
      ORDER BY rd.direction_index ASC;
    `;

    const stops = await prisma.$queryRaw<{ stop_name: string; stop_sequence: number; direction_id: string; lat: number; lng: number }[]>`
      SELECT
        s.stop_name,
        rs.stop_sequence,
        rs.route_direction_id::text AS direction_id,
        ST_Y(s.location::geometry) AS lat,
        ST_X(s.location::geometry) AS lng
      FROM route_stops rs
      JOIN stops s ON s.id = rs.stop_id
      JOIN route_directions rd ON rd.id = rs.route_direction_id
      WHERE rd.route_id = ${route.id}::uuid
      ORDER BY rs.route_direction_id, rs.stop_sequence ASC;
    `;

    return {
      name: route.route_name,
      longName: route.route_long_name,
      type: route.route_type,
      color: route.color,
      fare: Number(route.fare_amount),
      linestring: route.linestring || '',
      directions: directions.map((d) => ({
        name: d.direction_name,
        index: d.direction_index,
        totalStops: d.total_stops,
        duration: d.duration,
        startTime: d.start_time,
        endTime: d.end_time,
        operatesOn: d.operates_on,
        stops: stops
          .filter((s) => s.direction_id === d.id)
          .map((s) => ({ name: s.stop_name, lat: Number(s.lat), lng: Number(s.lng) })),
      })),
    };
  } catch {
    return null;
  } finally {
    if (prisma) await prisma.$disconnect();
  }
}

// ─── Seed File Loading ──────────────────────────────

function loadRouteFromSeed(routeName: string): RouteDef | null {
  const seedPath = path.resolve(__dirname, '..', 'prisma', 'seed.ts');
  const content = fs.readFileSync(seedPath, 'utf-8');

  // Extract the ROUTES array from the seed file
  const routesMatch = content.match(/const\s+ROUTES\s*:\s*RouteDef\[\]\s*=\s*\[/);
  if (!routesMatch || routesMatch.index === undefined) {
    console.error('Could not find ROUTES array in seed.ts');
    return null;
  }

  // Find the matching bracket for the ROUTES array
  const startIdx = routesMatch.index + routesMatch[0].length - 1; // position of '['
  let depth = 1;
  let i = startIdx + 1;
  while (i < content.length && depth > 0) {
    if (content[i] === '[') depth++;
    else if (content[i] === ']') depth--;
    i++;
  }
  const arrayContent = content.slice(startIdx, i);

  // Clean TypeScript-specific syntax for eval
  let jsContent = arrayContent
    .replace(/\/\/.*$/gm, '') // strip single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // strip multi-line comments

  // Evaluate the array
  let routes: RouteDef[];
  try {
    routes = new Function(`return ${jsContent}`)() as RouteDef[];
  } catch (e) {
    console.error('Failed to parse ROUTES from seed.ts:', e);
    return null;
  }

  return routes.find((r) => r.name === routeName) ?? null;
}

// ─── Geocoding ──────────────────────────────────────

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'transit-app-audit/1.0';
const RATE_LIMIT_MS = 1100; // slightly over 1s to be safe

function buildViewbox(city: string): string {
  // Default viewbox for Cancún area; extend for other cities
  if (city.toLowerCase().includes('playa del carmen')) {
    return '-87.15,20.55,-87.00,20.70';
  }
  // Cancún + surrounding area (generous bounds)
  return '-87.00,20.95,-86.70,21.25';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeStop(
  stopName: string,
  city: string,
  viewbox: string,
): Promise<{ lat: number; lng: number; displayName: string } | null> {
  const query = `${stopName}, ${city}`;
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    viewbox,
    bounded: '1',
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`${NOMINATIM_BASE}?${params}`, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (res.status === 429) {
      console.warn(`  Rate limited, waiting ${(attempt + 1) * 2}s...`);
      await sleep((attempt + 1) * 2000);
      continue;
    }

    if (!res.ok) {
      console.warn(`  Nominatim ${res.status} for "${stopName}"`);
      return null;
    }

    const data = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (data.length === 0) {
      // Retry without bounded viewbox
      if (attempt === 0) {
        params.delete('bounded');
        params.set('viewbox', viewbox);
        await sleep(RATE_LIMIT_MS);
        continue;
      }
      return null;
    }

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  }

  return null;
}

async function geocodeAllStops(
  stops: StopDef[],
  city: string,
): Promise<Map<string, { lat: number; lng: number; displayName: string } | null>> {
  const viewbox = buildViewbox(city);
  const results = new Map<string, { lat: number; lng: number; displayName: string } | null>();

  // Deduplicate by stop name (same stop can appear in multiple directions)
  const uniqueNames = [...new Set(stops.map((s) => s.name))];
  const total = uniqueNames.length;

  for (let i = 0; i < uniqueNames.length; i++) {
    const name = uniqueNames[i];
    process.stdout.write(`  Geocoding [${i + 1}/${total}] ${name}...`);
    const result = await geocodeStop(name, city, viewbox);
    results.set(name, result);
    console.log(result ? ` ✓` : ` ✗ Not found`);

    if (i < uniqueNames.length - 1) await sleep(RATE_LIMIT_MS);
  }

  return results;
}

// ─── Haversine Distance ─────────────────────────────

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Audit Logic ────────────────────────────────────

function classify(distanceMeters: number | null): Classification {
  if (distanceMeters === null) return 'Not Found';
  if (distanceMeters < 100) return 'OK';
  if (distanceMeters < 500) return 'Warning';
  return 'Error';
}

function auditStops(
  route: RouteDef,
  geocodeResults: Map<string, { lat: number; lng: number; displayName: string } | null>,
): StopAudit[] {
  const audits: StopAudit[] = [];

  for (const dir of route.directions) {
    for (const stop of dir.stops) {
      const geo = geocodeResults.get(stop.name) ?? null;
      const distance = geo ? haversineDistance(stop.lat, stop.lng, geo.lat, geo.lng) : null;

      audits.push({
        name: stop.name,
        directionName: dir.name,
        currentLat: stop.lat,
        currentLng: stop.lng,
        geocodedLat: geo?.lat ?? null,
        geocodedLng: geo?.lng ?? null,
        distanceMeters: distance !== null ? Math.round(distance) : null,
        classification: classify(distance),
        geocodeDisplayName: geo?.displayName ?? null,
      });
    }
  }

  return audits;
}

// ─── Overpass API ───────────────────────────────────

async function fetchOverpassGeometry(route: RouteDef): Promise<string | null> {
  // Build a bounding box from all stops
  const allStops = route.directions.flatMap((d) => d.stops);
  const lats = allStops.map((s) => s.lat);
  const lngs = allStops.map((s) => s.lng);
  const bbox = `${Math.min(...lats) - 0.01},${Math.min(...lngs) - 0.01},${Math.max(...lats) + 0.01},${Math.max(...lngs) + 0.01}`;

  const query = `
    [out:json][timeout:30];
    (
      way["highway"~"primary|secondary|tertiary|residential"](${bbox});
    );
    out geom;
  `;

  try {
    console.log('\n  Fetching road geometry from Overpass API...');
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!res.ok) {
      console.warn(`  Overpass API returned ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { elements: { geometry: { lat: number; lon: number }[] }[] };
    const points = data.elements
      .flatMap((el) => el.geometry ?? [])
      .map((p) => `${p.lon} ${p.lat}`);

    if (points.length === 0) return null;

    const linestring = `LINESTRING(${points.join(', ')})`;
    console.log(`  Retrieved ${data.elements.length} road segments (${points.length} points)`);
    return linestring;
  } catch (e) {
    console.warn(`  Overpass fetch failed: ${e}`);
    return null;
  }
}

// ─── Report Output ──────────────────────────────────

function printConsoleReport(route: RouteDef, audits: StopAudit[], overpassLinestring: string | null): void {
  const counts = { OK: 0, Warning: 0, Error: 0, 'Not Found': 0 };
  for (const a of audits) counts[a.classification]++;

  console.log('\n' + '═'.repeat(70));
  console.log(`  ROUTE AUDIT: ${route.name} — ${route.longName}`);
  console.log('═'.repeat(70));

  // Summary
  console.log(`\n  Total stops audited: ${audits.length}`);
  console.log(`  ✓ OK (<100m):        ${counts.OK}`);
  console.log(`  ⚠ Warning (100-500m): ${counts.Warning}`);
  console.log(`  ✗ Error (>500m):      ${counts.Error}`);
  console.log(`  ? Not Found:          ${counts['Not Found']}`);

  // Per-direction details
  const directions = [...new Set(audits.map((a) => a.directionName))];
  for (const dirName of directions) {
    console.log(`\n  ── ${dirName} ${'─'.repeat(Math.max(0, 55 - dirName.length))}`);
    const dirAudits = audits.filter((a) => a.directionName === dirName);

    // Table header
    console.log('  ' + 'Stop'.padEnd(40) + 'Distance'.padStart(10) + '  Status');
    console.log('  ' + '─'.repeat(60));

    for (const a of dirAudits) {
      const dist = a.distanceMeters !== null ? `${a.distanceMeters}m` : '—';
      const icon =
        a.classification === 'OK' ? '✓' :
        a.classification === 'Warning' ? '⚠' :
        a.classification === 'Error' ? '✗' : '?';
      const truncName = a.name.length > 38 ? a.name.slice(0, 35) + '...' : a.name;
      console.log(`  ${truncName.padEnd(40)}${dist.padStart(10)}  ${icon} ${a.classification}`);
    }
  }

  // Overpass info
  if (overpassLinestring) {
    console.log('\n  ── Overpass Road Geometry ────────────────────');
    console.log(`  Linestring length: ${overpassLinestring.length} chars`);
    console.log(`  Preview: ${overpassLinestring.slice(0, 120)}...`);
  }

  console.log('\n' + '═'.repeat(70));
}

function generateSeedOutput(route: RouteDef, audits: StopAudit[]): string {
  const lines: string[] = [];
  lines.push(`  // ============ ${route.name} ${route.longName} ============`);
  lines.push(`  // Coordinates audited via Nominatim geocoding`);
  lines.push(`  {`);
  lines.push(`    name: '${route.name}',`);
  lines.push(`    longName: '${route.longName}',`);
  lines.push(`    type: '${route.type}',`);
  lines.push(`    color: '${route.color}',`);
  lines.push(`    fare: ${route.fare},`);
  lines.push(`    linestring:`);
  lines.push(`      '${route.linestring}',`);
  lines.push(`    directions: [`);

  for (const dir of route.directions) {
    lines.push(`      {`);
    lines.push(`        name: '${dir.name}',`);
    lines.push(`        index: ${dir.index},`);
    lines.push(`        totalStops: ${dir.totalStops},`);
    lines.push(`        duration: ${dir.duration},`);
    lines.push(`        startTime: '${dir.startTime}',`);
    lines.push(`        endTime: '${dir.endTime}',`);
    lines.push(`        operatesOn: '${dir.operatesOn}',`);
    lines.push(`        stops: [`);

    for (const stop of dir.stops) {
      const audit = audits.find(
        (a) => a.name === stop.name && a.directionName === dir.name,
      );

      // Use geocoded coordinates if found and current is off by >100m, otherwise keep current
      let lat = stop.lat;
      let lng = stop.lng;
      let comment = '';

      if (audit && audit.geocodedLat !== null && audit.geocodedLng !== null) {
        if (audit.classification === 'Error' || audit.classification === 'Warning') {
          lat = parseFloat(audit.geocodedLat.toFixed(4));
          lng = parseFloat(audit.geocodedLng.toFixed(4));
          comment = ` // corrected from (${stop.lat}, ${stop.lng}) — was ${audit.distanceMeters}m off`;
        }
      } else if (audit?.classification === 'Not Found') {
        comment = ' // NOT FOUND — verify manually';
      }

      lines.push(`          { name: '${stop.name}', lat: ${lat}, lng: ${lng} },${comment}`);
    }

    lines.push(`        ],`);
    lines.push(`      },`);
  }

  lines.push(`    ],`);
  lines.push(`  },`);

  return lines.join('\n');
}

function printJsonReport(route: RouteDef, audits: StopAudit[], overpassLinestring: string | null): void {
  const counts = { OK: 0, Warning: 0, Error: 0, 'Not Found': 0 };
  for (const a of audits) counts[a.classification]++;

  const output = {
    route: { name: route.name, longName: route.longName },
    summary: { total: audits.length, ...counts },
    stops: audits,
    overpassLinestring,
  };

  console.log(JSON.stringify(output, null, 2));
}

// ─── Main ───────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  console.log(`\nAuditing route: ${args.routeName}`);
  console.log(`  Source: ${args.noDb ? 'seed.ts only' : 'DB (fallback: seed.ts)'}`);
  console.log(`  City: ${args.city}`);

  // 1. Load route data
  let route: RouteDef | null = null;

  if (!args.noDb) {
    console.log('\n  Trying database...');
    route = await loadRouteFromDb(args.routeName);
    if (route) {
      console.log('  ✓ Loaded from database');
    } else {
      console.log('  ✗ Not found in DB, falling back to seed.ts');
    }
  }

  if (!route) {
    console.log('  Loading from seed.ts...');
    route = loadRouteFromSeed(args.routeName);
    if (route) {
      console.log('  ✓ Loaded from seed.ts');
    } else {
      console.error(`\n  ✗ Route "${args.routeName}" not found in seed.ts either. Exiting.`);
      process.exit(1);
    }
  }

  // 2. Collect all unique stops across directions
  const allStops = route.directions.flatMap((d) => d.stops);
  console.log(`\n  Found ${allStops.length} stops across ${route.directions.length} direction(s)`);

  // 3. Geocode
  console.log('\n  Starting geocoding...');
  const geocodeResults = await geocodeAllStops(allStops, args.city);

  // 4. Audit
  const audits = auditStops(route, geocodeResults);

  // 5. Overpass (optional)
  let overpassLinestring: string | null = null;
  if (args.overpass) {
    overpassLinestring = await fetchOverpassGeometry(route);
  }

  // 6. Output
  if (args.outputFormat === 'json') {
    printJsonReport(route, audits, overpassLinestring);
  } else {
    printConsoleReport(route, audits, overpassLinestring);

    // Always print corrected seed output to console
    console.log('\n  ── Corrected seed.ts output ──────────────────');
    console.log(generateSeedOutput(route, audits));
    console.log('');
  }
}

main().catch((e) => {
  console.error('Audit failed:', e);
  process.exit(1);
});
