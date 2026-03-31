import prisma from '../config/db';

type SqlExecutor = Pick<typeof prisma, '$executeRaw' | '$queryRaw'>;

// ─── Types for raw query results ────────────────────
type StopRow = {
  route_stop_id: string;
  stop_id: string;
  stop_name: string;
  stop_sequence: number;
  lat: number;
  lng: number;
};

type StopResult = {
  id: string;
  stop_name: string;
  lat: number;
  lng: number;
};

type RouteIdRow = {
  route_id: string;
};

type CoordinateRow = {
  lat: number;
  lng: number;
};

function buildLinestringWkt(coordinates: CoordinateRow[]) {
  if (coordinates.length < 2) {
    return null;
  }

  return `LINESTRING(${coordinates.map(({ lng, lat }) => `${lng} ${lat}`).join(', ')})`;
}

async function syncPrimaryRoutePath(db: SqlExecutor, routeId: string) {
  const coordinates = await db.$queryRaw<CoordinateRow[]>`
    SELECT
      ST_Y(s.location::geometry) AS lat,
      ST_X(s.location::geometry) AS lng
    FROM route_directions rd
    JOIN route_stops rs ON rs.route_direction_id = rd.id
    JOIN stops s ON s.id = rs.stop_id
    WHERE rd.route_id = ${routeId}::uuid
      AND rd.direction_index = (
        SELECT MIN(direction_index)
        FROM route_directions
        WHERE route_id = ${routeId}::uuid
      )
    ORDER BY rs.stop_sequence ASC;
  `;

  const linestringWkt = buildLinestringWkt(coordinates);

  if (linestringWkt) {
    await db.$executeRaw`
      UPDATE routes
      SET path = ST_GeomFromText(${linestringWkt}, 4326)::geography
      WHERE id = ${routeId}::uuid;
    `;
    return;
  }

  await db.$executeRaw`
    UPDATE routes
    SET path = NULL
    WHERE id = ${routeId}::uuid;
  `;
}

async function getRouteIdForDirection(db: SqlExecutor, directionId: string) {
  const [row] = await db.$queryRaw<RouteIdRow[]>`
    SELECT route_id::text AS route_id
    FROM route_directions
    WHERE id = ${directionId}::uuid;
  `;

  return row?.route_id ?? null;
}

async function syncRoutePathForDirection(db: SqlExecutor, directionId: string) {
  const routeId = await getRouteIdForDirection(db, directionId);

  if (!routeId) {
    return;
  }

  await syncPrimaryRoutePath(db, routeId);
}

async function syncRoutePathsForStop(db: SqlExecutor, stopId: string) {
  const routeIds = await db.$queryRaw<RouteIdRow[]>`
    SELECT DISTINCT rd.route_id::text AS route_id
    FROM route_stops rs
    JOIN route_directions rd ON rd.id = rs.route_direction_id
    WHERE rs.stop_id = ${stopId}::uuid;
  `;

  for (const { route_id } of routeIds) {
    await syncPrimaryRoutePath(db, route_id);
  }
}

// ─── Get stops by direction (ordered) ────────────────
export const getStopsByDirection = async (directionId: string) => {
  return prisma.$queryRaw<StopRow[]>`
    SELECT
      rs.id::text AS route_stop_id,
      s.id::text AS stop_id,
      s.stop_name,
      rs.stop_sequence,
      ST_Y(s.location::geometry) AS lat,
      ST_X(s.location::geometry) AS lng
    FROM route_stops rs
    JOIN stops s ON s.id = rs.stop_id
    WHERE rs.route_direction_id = ${directionId}::uuid
    ORDER BY rs.stop_sequence ASC;
  `;
};

// ─── Create a new stop and link it to a direction ────
export const createStopAndLink = async (input: {
  stop_name: string;
  lat: number;
  lng: number;
  route_direction_id: string;
  stop_sequence: number;
}) => {
  const { stop_name, lat, lng, route_direction_id, stop_sequence } = input;

  return prisma.$transaction(async (tx) => {
    // Shift existing stops at or after this sequence up by 1
    // Use negative-number trick to avoid UNIQUE constraint on (route_direction_id, stop_sequence)
    await tx.$executeRaw`
      UPDATE route_stops
      SET stop_sequence = -stop_sequence
      WHERE route_direction_id = ${route_direction_id}::uuid
        AND stop_sequence >= ${stop_sequence};
    `;

    await tx.$executeRaw`
      UPDATE route_stops
      SET stop_sequence = -stop_sequence + 1
      WHERE route_direction_id = ${route_direction_id}::uuid
        AND stop_sequence < 0;
    `;

    // Create the stop with PostGIS point
    const [created] = await tx.$queryRaw<StopResult[]>`
      INSERT INTO stops (stop_name, location)
      VALUES (
        ${stop_name},
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      )
      RETURNING id::text, stop_name, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng;
    `;

    // Link to direction
    await tx.$executeRaw`
      INSERT INTO route_stops (route_direction_id, stop_id, stop_sequence)
      VALUES (${route_direction_id}::uuid, ${created.id}::uuid, ${stop_sequence});
    `;

    // Update total_stops count
    await tx.$executeRaw`
      UPDATE route_directions
      SET total_stops = (
        SELECT COUNT(*) FROM route_stops WHERE route_direction_id = ${route_direction_id}::uuid
      )
      WHERE id = ${route_direction_id}::uuid;
    `;

    await syncRoutePathForDirection(tx, route_direction_id);

    return created;
  });
};

// ─── Update a stop (name and/or location) ────────────
export const updateStop = async (
  stopId: string,
  data: { stop_name?: string; lat?: number; lng?: number }
) => {
  const { stop_name, lat, lng } = data;

  return prisma.$transaction(async (tx) => {
    if (stop_name !== undefined && lat !== undefined && lng !== undefined) {
      await tx.$executeRaw`
        UPDATE stops
        SET stop_name = ${stop_name},
            location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        WHERE id = ${stopId}::uuid;
      `;
    } else if (stop_name !== undefined) {
      await tx.$executeRaw`
        UPDATE stops SET stop_name = ${stop_name} WHERE id = ${stopId}::uuid;
      `;
    } else if (lat !== undefined && lng !== undefined) {
      await tx.$executeRaw`
        UPDATE stops
        SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        WHERE id = ${stopId}::uuid;
      `;
    }

    await syncRoutePathsForStop(tx, stopId);

    const [updated] = await tx.$queryRaw<StopResult[]>`
      SELECT
        id::text,
        stop_name,
        ST_Y(location::geometry) AS lat,
        ST_X(location::geometry) AS lng
      FROM stops
      WHERE id = ${stopId}::uuid;
    `;

    return updated;
  });
};

// ─── Remove a stop from a direction ──────────────────
export const removeStopFromDirection = async (stopId: string, directionId: string) => {
  return prisma.$transaction(async (tx) => {
    // Get the current sequence of the stop being removed
    const [link] = await tx.$queryRaw<{ stop_sequence: number }[]>`
      SELECT stop_sequence
      FROM route_stops
      WHERE stop_id = ${stopId}::uuid
        AND route_direction_id = ${directionId}::uuid;
    `;

    if (!link) throw new Error('Stop not found in this direction');

    // Delete the link
    await tx.$executeRaw`
      DELETE FROM route_stops
      WHERE stop_id = ${stopId}::uuid
        AND route_direction_id = ${directionId}::uuid;
    `;

    // Shift sequences down using negative-number trick
    await tx.$executeRaw`
      UPDATE route_stops
      SET stop_sequence = -stop_sequence
      WHERE route_direction_id = ${directionId}::uuid
        AND stop_sequence > ${link.stop_sequence};
    `;

    await tx.$executeRaw`
      UPDATE route_stops
      SET stop_sequence = -stop_sequence - 1
      WHERE route_direction_id = ${directionId}::uuid
        AND stop_sequence < 0;
    `;

    // Update total_stops count
    await tx.$executeRaw`
      UPDATE route_directions
      SET total_stops = (
        SELECT COUNT(*) FROM route_stops WHERE route_direction_id = ${directionId}::uuid
      )
      WHERE id = ${directionId}::uuid;
    `;

    await syncRoutePathForDirection(tx, directionId);
  });
};

// ─── Reorder stops in a direction ────────────────────
export const reorderStops = async (
  directionId: string,
  routeStopIds: string[],
) => {
  return prisma.$transaction(async (tx) => {
    // Step 1: Set all sequences to negative to avoid UNIQUE constraint
    await tx.$executeRaw`
      UPDATE route_stops
      SET stop_sequence = -stop_sequence
      WHERE route_direction_id = ${directionId}::uuid;
    `;

    // Step 2: Assign new sequences based on the provided order
    for (let i = 0; i < routeStopIds.length; i++) {
      const seq = i + 1;
      await tx.$executeRaw`
        UPDATE route_stops
        SET stop_sequence = ${seq}
        WHERE route_direction_id = ${directionId}::uuid
          AND id = ${routeStopIds[i]}::uuid;
      `;
    }

    await syncRoutePathForDirection(tx, directionId);
  });
};

// ─── Insert an existing stop into a direction ────────
export const insertExistingStop = async (
  directionId: string,
  stopId: string,
  sequence: number
) => {
  return prisma.$transaction(async (tx) => {
    // Shift existing stops at or after this sequence up
    await tx.$executeRaw`
      UPDATE route_stops
      SET stop_sequence = -stop_sequence
      WHERE route_direction_id = ${directionId}::uuid
        AND stop_sequence >= ${sequence};
    `;

    await tx.$executeRaw`
      UPDATE route_stops
      SET stop_sequence = -stop_sequence + 1
      WHERE route_direction_id = ${directionId}::uuid
        AND stop_sequence < 0;
    `;

    // Insert the link
    await tx.$executeRaw`
      INSERT INTO route_stops (route_direction_id, stop_id, stop_sequence)
      VALUES (${directionId}::uuid, ${stopId}::uuid, ${sequence});
    `;

    // Update total_stops count
    await tx.$executeRaw`
      UPDATE route_directions
      SET total_stops = (
        SELECT COUNT(*) FROM route_stops WHERE route_direction_id = ${directionId}::uuid
      )
      WHERE id = ${directionId}::uuid;
    `;

    await syncRoutePathForDirection(tx, directionId);
  });
};
