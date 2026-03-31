import prisma from '../src/config/db';

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
  linestring: string; // WKT LINESTRING
  directions: DirectionDef[];
};

// ─── Helper: insert a stop and return its UUID ──────
async function insertStop(s: StopDef): Promise<string> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO stops (id, stop_name, location)
    VALUES (
      gen_random_uuid(),
      ${s.name},
      ST_SetSRID(ST_MakePoint(${s.lng}, ${s.lat}), 4326)::geography
    )
    RETURNING id::text;
  `;
  return rows[0].id;
}

// ─── Real Cancún Route Data ─────────────────────────
const ROUTES: RouteDef[] = [
  // ============ R-15 Hoteles 95-96 (Moovit reference) ============
  // Coordinates sourced from OpenStreetMap / Nominatim geocoding
  // Hotel Zone follows the real "7"-shaped Boulevard Kukulcán geometry
  {
    name: 'R-15',
    longName: 'Hoteles 95-96',
    type: 'circular',
    color: '#FB8C00',
    fare: 12.0,
    linestring:
      'LINESTRING(' +
      // Hotel Zone outbound (Punta Nizuc → Downtown)
      '-86.7815 21.0440, -86.7822 21.0530, -86.7798 21.0610, -86.7720 21.0900, ' +
      '-86.7640 21.1070, -86.7570 21.1200, -86.7500 21.1300, -86.7700 21.1375, ' +
      '-86.7800 21.1430, ' +
      // Downtown outbound
      '-86.8214 21.1527, -86.8250 21.1555, -86.8230 21.1560, -86.8309 21.1582, ' +
      '-86.8300 21.1566, -86.8280 21.1580, -86.8416 21.1542, -86.8350 21.1530, ' +
      '-86.8394 21.1516, -86.8420 21.1495, -86.8400 21.1511, -86.8459 21.1450, ' +
      '-86.8480 21.1453, -86.8481 21.1476, -86.8573 21.1463, -86.8537 21.1487, ' +
      '-86.8543 21.1495, -86.8555 21.1465, -86.8575 21.1455, -86.8627 21.1455, ' +
      '-86.8590 21.1445, -86.8619 21.1432, -86.8650 21.1432, -86.8733 21.1426, ' +
      '-86.8750 21.1430, -86.8727 21.1476, -86.8745 21.1469, -86.8583 21.1425, ' +
      '-86.8678 21.1424, -86.8700 21.1430, -86.8678 21.1419, -86.8618 21.1418, ' +
      '-86.8618 21.1418, ' +
      // Downtown return
      '-86.8560 21.1400, -86.8557 21.1380, -86.8557 21.1359, -86.8562 21.1474, ' +
      '-86.8537 21.1487, -86.8543 21.1495, -86.8519 21.1512, -86.8500 21.1490, ' +
      '-86.8480 21.1453, -86.8465 21.1445, -86.8446 21.1430, -86.8430 21.1460, ' +
      '-86.8394 21.1516, -86.8401 21.1507, -86.8270 21.1564, -86.8269 21.1578, ' +
      '-86.8216 21.1557, ' +
      // Hotel Zone return (Downtown → Punta Nizuc)
      '-86.7800 21.1430, -86.7500 21.1300, -86.7570 21.1200, -86.7640 21.1070, ' +
      '-86.7720 21.0900, -86.7815 21.0440)',
    directions: [
      {
        name: 'Hoteles 95-96 (Circular)',
        index: 0,
        totalStops: 65,
        duration: 141,
        startTime: '06:00',
        endTime: '22:30',
        operatesOn: 'all',
        stops: [
          // ── Hotel Zone northbound (Punta Nizuc → Downtown) ──
          { name: 'Boulevard Kukulcán, 7', lat: 21.0440, lng: -86.7815 },
          { name: 'Boulevard Kukulkan, 64bis', lat: 21.0530, lng: -86.7822 },
          { name: 'Punta Nizuc - Cancún', lat: 21.0610, lng: -86.7798 },
          { name: 'Boulevard Kukulcán Km 15', lat: 21.0900, lng: -86.7720 },
          { name: 'Boulevard Kukulcán Km 13', lat: 21.1070, lng: -86.7640 },
          { name: 'Boulevard Kukulcán Km 11', lat: 21.1200, lng: -86.7570 },
          { name: 'Boulevard Kukulcán Km 9', lat: 21.1300, lng: -86.7500 },
          { name: 'Boulevard Kukulcán Km 7', lat: 21.1375, lng: -86.7700 },
          { name: 'Blvd. Kukulcán (Zona Hotelera)', lat: 21.1430, lng: -86.7800 },

          // ── Downtown outbound ──
          { name: 'Avenida Bonampak, 17', lat: 21.1527, lng: -86.8214 },
          { name: 'Carlos J. Nader', lat: 21.1555, lng: -86.8250 },
          { name: 'Avenida Cobá, 9', lat: 21.1560, lng: -86.8230 },
          { name: 'Guanabana, 57', lat: 21.1582, lng: -86.8309 },
          { name: 'Diagonal Ixchel, 91', lat: 21.1566, lng: -86.8300 },
          { name: 'Avenida Cobá, 59', lat: 21.1580, lng: -86.8280 },
          { name: 'Parada Autobús', lat: 21.1542, lng: -86.8416 },
          { name: 'Avenida Rodrigo Gómez, 39', lat: 21.1530, lng: -86.8350 },
          { name: 'Avenida La Luna, 7', lat: 21.1516, lng: -86.8394 },
          { name: 'Avenida La Luna, 60', lat: 21.1495, lng: -86.8420 },
          { name: 'Avenida La Luna, 187a', lat: 21.1511, lng: -86.8400 },
          { name: 'California, 46', lat: 21.1450, lng: -86.8459 },
          { name: 'Avenida Kohunlich, 293', lat: 21.1453, lng: -86.8480 },
          { name: 'Valle De Bravo, 221', lat: 21.1476, lng: -86.8481 },
          { name: 'Calle 4, 1', lat: 21.1463, lng: -86.8573 },
          { name: 'Av. Andrés Quintana Roo', lat: 21.1487, lng: -86.8537 },
          { name: 'Sierra Hojazenal, 68', lat: 21.1495, lng: -86.8543 },
          { name: 'Avenida Kinic, 6209', lat: 21.1465, lng: -86.8555 },
          { name: 'Avenida Kinic, 27', lat: 21.1455, lng: -86.8575 },
          { name: 'Calle 6, 501', lat: 21.1455, lng: -86.8627 },
          { name: 'Avenida Kinic, 121', lat: 21.1445, lng: -86.8590 },
          { name: 'Calle 16, 55', lat: 21.1432, lng: -86.8619 },
          { name: 'Calle 16, 598', lat: 21.1432, lng: -86.8650 },
          { name: 'Calle 16, 628', lat: 21.1426, lng: -86.8733 },
          { name: 'Calle 16, 1414', lat: 21.1430, lng: -86.8750 },
          { name: 'Calle 125 Norte, 5', lat: 21.1476, lng: -86.8727 },
          { name: 'Calle 129 Norte, 15', lat: 21.1469, lng: -86.8745 },
          { name: 'Calle 20, 96', lat: 21.1425, lng: -86.8583 },
          { name: 'Calle 18, 4', lat: 21.1424, lng: -86.8678 },
          { name: 'Calle 20, 18', lat: 21.1430, lng: -86.8700 },
          { name: 'Calle 20, 620', lat: 21.1419, lng: -86.8678 },
          { name: 'Calle 22, 590', lat: 21.1418, lng: -86.8618 },
          { name: 'Calle 22, 538', lat: 21.1418, lng: -86.8618 },

          // ── Downtown return ──
          { name: 'Avenida Kinic, 143', lat: 21.1400, lng: -86.8560 },
          { name: 'Avenida Kinic, 12', lat: 21.1380, lng: -86.8557 },
          { name: 'Kinic, 50', lat: 21.1359, lng: -86.8557 },
          { name: 'Jajalkin, 17', lat: 21.1474, lng: -86.8562 },
          { name: 'Avenida Andrés Quintana Roo, 11', lat: 21.1487, lng: -86.8537 },
          { name: 'Sierra Hojazenal, 303', lat: 21.1495, lng: -86.8543 },
          { name: 'Avenida Kohunlich, 9', lat: 21.1512, lng: -86.8519 },
          { name: 'Retorno Alberto Ruz L., 4', lat: 21.1490, lng: -86.8500 },
          { name: 'Avenida Kohunlich, 427', lat: 21.1453, lng: -86.8480 },
          { name: 'Zac Nicte, 13', lat: 21.1445, lng: -86.8465 },
          { name: 'Ocotepec, 250', lat: 21.1430, lng: -86.8446 },
          { name: 'De Las Palmas, 28', lat: 21.1460, lng: -86.8430 },
          { name: 'Avenida La Luna, 7 (Retorno)', lat: 21.1516, lng: -86.8394 },
          { name: 'La Costa', lat: 21.1507, lng: -86.8401 },
          { name: 'Avenida Xcaret', lat: 21.1564, lng: -86.8270 },
          { name: 'Avenida Cobá, 37', lat: 21.1578, lng: -86.8269 },
          { name: 'Avenida Bonampak, 16', lat: 21.1557, lng: -86.8216 },

          // ── Hotel Zone southbound (Downtown → Punta Nizuc) ──
          { name: 'Blvd. Kukulcán (Zona Hotelera, Regreso)', lat: 21.1430, lng: -86.7800 },
          { name: 'Boulevard Kukulcán Km 9 (Regreso)', lat: 21.1300, lng: -86.7500 },
          { name: 'Boulevard Kukulcán Km 11 (Regreso)', lat: 21.1200, lng: -86.7570 },
          { name: 'Boulevard Kukulcán Km 13 (Regreso)', lat: 21.1070, lng: -86.7640 },
          { name: 'Boulevard Kukulcán Km 15 (Regreso)', lat: 21.0900, lng: -86.7720 },
          { name: 'Boulevard Kukulcán, 7 (Regreso)', lat: 21.0440, lng: -86.7815 },
        ],
      },
    ],
  },

];

// ─── Main Seed Function ─────────────────────────────
async function main() {
  console.log('🌱 Starting comprehensive seed...\n');

  // ── Step 0: Clean all tables (order matters for FK constraints)
  console.log('  🗑️  Cleaning existing data...');
  await prisma.$executeRaw`TRUNCATE TABLE route_stops, route_directions, check_ins, stops, routes, operators RESTART IDENTITY CASCADE;`;

  // ── Step 1: Create operator
  console.log('  🏢 Creating operator (IMOVEQROO)...');
  const [operator] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO operators (id, name, full_name, website)
    VALUES (
      gen_random_uuid(),
      'IMOVEQROO',
      'Instituto de Movilidad de Quintana Roo',
      'https://www.qroo.gob.mx/imoveqroo'
    )
    RETURNING id::text;
  `;
  const operatorId = operator.id;
  console.log(`     → Operator ID: ${operatorId}`);

  // ── Step 2: Seed each route with its directions and stops
  for (const route of ROUTES) {
    console.log(`\n  🚍 Seeding route ${route.name} (${route.longName})...`);

    // Insert route
    const [insertedRoute] = await prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO routes (id, route_name, route_long_name, route_type, color, fare_amount, fare_currency, operator_id, path)
      VALUES (
        gen_random_uuid(),
        ${route.name},
        ${route.longName},
        ${route.type},
        ${route.color},
        ${route.fare}::decimal,
        'MXN',
        ${operatorId}::uuid,
        ST_GeomFromText(${route.linestring}, 4326)::geography
      )
      RETURNING id::text;
    `;
    const routeId = insertedRoute.id;
    console.log(`     → Route ID: ${routeId}`);

    // Insert each direction
    for (const dir of route.directions) {
      console.log(`     📍 Direction ${dir.index}: ${dir.name} (${dir.stops.length} stops)`);

      const [insertedDir] = await prisma.$queryRaw<{ id: string }[]>`
        INSERT INTO route_directions (id, route_id, direction_name, direction_index, total_stops, approx_duration, start_time, end_time, operates_on)
        VALUES (
          gen_random_uuid(),
          ${routeId}::uuid,
          ${dir.name},
          ${dir.index},
          ${dir.totalStops},
          ${dir.duration},
          ${dir.startTime},
          ${dir.endTime},
          ${dir.operatesOn}
        )
        RETURNING id::text;
      `;
      const dirId = insertedDir.id;

      // Insert stops and link them
      for (let seq = 0; seq < dir.stops.length; seq++) {
        const stop = dir.stops[seq];
        const stopId = await insertStop(stop);

        await prisma.$executeRaw`
          INSERT INTO route_stops (id, route_direction_id, stop_id, stop_sequence)
          VALUES (gen_random_uuid(), ${dirId}::uuid, ${stopId}::uuid, ${seq + 1});
        `;
      }
    }
  }

  // ── Step 3: Seed some check-ins with route references
  console.log('\n  📋 Seeding check-ins...');

  const [r15] = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text FROM routes WHERE route_name = 'R-15' LIMIT 1;
  `;

  await prisma.$executeRaw`
    INSERT INTO check_ins (location, is_on_board, status, route_id) VALUES
    (ST_SetSRID(ST_MakePoint(-86.7815, 21.0440), 4326)::geography, true, 'Fluido', ${r15.id}::uuid),
    (ST_SetSRID(ST_MakePoint(-86.8214, 21.1527), 4326)::geography, true, 'Lleno', ${r15.id}::uuid),
    (ST_SetSRID(ST_MakePoint(-86.8480, 21.1453), 4326)::geography, false, 'Tráfico', ${r15.id}::uuid),
    (ST_SetSRID(ST_MakePoint(-86.8619, 21.1432), 4326)::geography, true, 'Lleno', ${r15.id}::uuid);
  `;

  console.log('\n✨ Seed complete!');
  console.log('   → 1 operator');
  console.log(`   → ${ROUTES.length} route(s)`);
  console.log(`   → ${ROUTES.reduce((acc, r) => acc + r.directions.length, 0)} direction(s)`);
  console.log(`   → ${ROUTES.reduce((acc, r) => acc + r.directions.reduce((a, d) => a + d.stops.length, 0), 0)} stops`);
  console.log('   → 4 check-ins');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
