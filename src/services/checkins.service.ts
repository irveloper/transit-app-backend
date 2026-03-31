import prisma from '../config/db';

// ─── Types for raw query results ────────────────────
type CheckInRow = {
  id: string;
  created_at: Date;
  lat: number;
  lng: number;
  is_on_board: boolean;
  status: string;
  route_id: string;
};

type ProximityCheckRow = {
  is_near: boolean;
  nearest_direction_distance_m: number | null;
  nearest_stored_path_distance_m: number | null;
  nearest_stop_distance_m: number | null;
};

export type CreateCheckInInput = {
  lat: number;
  lng: number;
  is_on_board: boolean;
  status: 'Fluido' | 'Lleno' | 'Tráfico';
  route_id: string;
};

const DIRECTION_PROXIMITY_METERS = 500;
const STORED_PATH_PROXIMITY_METERS = 500;
const STOP_PROXIMITY_METERS = 250;

// ─── Create a new check-in ──────────────────────────
export const createCheckIn = async (input: CreateCheckInInput) => {
  // Validate proximity using live direction geometry first, with fallbacks.
  const [proximityCheck] = await prisma.$queryRaw<ProximityCheckRow[]>`
    WITH report_point AS (
      SELECT ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography AS location
    ),
    direction_paths AS (
      SELECT
        rd.id,
        ST_MakeLine((s.location::geometry) ORDER BY rs.stop_sequence)::geography AS path
      FROM route_directions rd
      JOIN route_stops rs ON rs.route_direction_id = rd.id
      JOIN stops s ON s.id = rs.stop_id
      WHERE rd.route_id = ${input.route_id}::uuid
      GROUP BY rd.id
      HAVING COUNT(*) >= 2
    ),
    direction_match AS (
      SELECT
        MIN(ST_Distance(dp.path, rp.location))::float AS nearest_direction_distance_m,
        BOOL_OR(ST_DWithin(dp.path, rp.location, ${DIRECTION_PROXIMITY_METERS})) AS is_near_direction
      FROM direction_paths dp
      CROSS JOIN report_point rp
    ),
    stored_path_match AS (
      SELECT
        MIN(ST_Distance(r.path::geography, rp.location))::float AS nearest_stored_path_distance_m,
        BOOL_OR(
          r.path IS NOT NULL
          AND ST_DWithin(r.path::geography, rp.location, ${STORED_PATH_PROXIMITY_METERS})
        ) AS is_near_stored_path
      FROM routes r
      CROSS JOIN report_point rp
      WHERE r.id = ${input.route_id}::uuid
    ),
    stop_match AS (
      SELECT
        MIN(ST_Distance(s.location::geography, rp.location))::float AS nearest_stop_distance_m,
        BOOL_OR(ST_DWithin(s.location::geography, rp.location, ${STOP_PROXIMITY_METERS})) AS is_near_stop
      FROM route_directions rd
      JOIN route_stops rs ON rs.route_direction_id = rd.id
      JOIN stops s ON s.id = rs.stop_id
      CROSS JOIN report_point rp
      WHERE rd.route_id = ${input.route_id}::uuid
    )
    SELECT
      (
        COALESCE(dm.is_near_direction, false)
        OR COALESCE(spm.is_near_stored_path, false)
        OR COALESCE(sm.is_near_stop, false)
      ) AS is_near,
      dm.nearest_direction_distance_m,
      spm.nearest_stored_path_distance_m,
      sm.nearest_stop_distance_m
    FROM direction_match dm
    CROSS JOIN stored_path_match spm
    CROSS JOIN stop_match sm;
  `;

  if (!proximityCheck || !proximityCheck.is_near) {
    console.warn('Check-in rejected by proximity validation', {
      routeId: input.route_id,
      lat: input.lat,
      lng: input.lng,
      nearestDirectionDistanceM: proximityCheck?.nearest_direction_distance_m ?? null,
      nearestStoredPathDistanceM: proximityCheck?.nearest_stored_path_distance_m ?? null,
      nearestStopDistanceM: proximityCheck?.nearest_stop_distance_m ?? null,
    });
    return { allowed: false, data: null };
  }

  // Insert the check-in with PostGIS point
  const [checkIn] = await prisma.$queryRaw<CheckInRow[]>`
    INSERT INTO check_ins (location, is_on_board, status, route_id)
    VALUES (
      ST_SetSRID(ST_MakePoint(${input.lng}, ${input.lat}), 4326)::geography,
      ${input.is_on_board},
      ${input.status},
      ${input.route_id}::uuid
    )
    RETURNING
      id::text,
      created_at,
      ST_Y(location::geometry) AS lat,
      ST_X(location::geometry) AS lng,
      is_on_board,
      status,
      route_id::text;
  `;

  return { allowed: true, data: checkIn };
};

// ─── Get recent check-ins for a route (last 30 min) ─
export const getRecentCheckIns = async (routeId: string) => {
  const checkIns = await prisma.$queryRaw<CheckInRow[]>`
    SELECT
      ci.id::text,
      ci.created_at,
      ST_Y(ci.location::geometry) AS lat,
      ST_X(ci.location::geometry) AS lng,
      ci.is_on_board,
      ci.status,
      ci.route_id::text
    FROM check_ins ci
    WHERE ci.route_id = ${routeId}::uuid
      AND ci.created_at >= NOW() - INTERVAL '30 minutes'
    ORDER BY ci.created_at DESC;
  `;

  return checkIns;
};
