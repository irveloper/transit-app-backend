import prisma from '../config/db';

export type JourneyInput = {
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
};

type RouteMatch = {
  id: string;
  route_name: string;
  distance_from_origin: number;
  distance_from_dest: number;
};

// ─── Types for raw query results ────────────────────
type RouteSummaryRow = {
  id: string;
  route_name: string;
  route_long_name: string;
  route_type: string;
  color: string | null;
  fare_amount: number | null;
  fare_currency: string;
  operator_name: string;
  operator_full_name: string;
  check_in_count: bigint;
};

type DirectionRow = {
  id: string;
  route_id: string;
  direction_name: string;
  direction_index: number;
  total_stops: number;
  approx_duration: number;
  start_time: string;
  end_time: string;
  operates_on: string;
};

type StopRow = {
  stop_id: string;
  stop_name: string;
  stop_sequence: number;
  direction_id: string;
  lat: number;
  lng: number;
};

type RouteMetaRow = {
  id: string;
  route_name: string;
  route_type: string;
};

type CheckInEtaRow = {
  id: string;
  created_at: Date;
  lat: number;
  lng: number;
  is_on_board: boolean;
  status: string;
};

type DirectionStop = {
  stop_id: string;
  stop_name: string;
  sequence: number;
  lat: number;
  lng: number;
};

type AssignedCheckIn = {
  id: string;
  createdAt: Date;
  directionId: string;
  sequence: number;
  distanceMeters: number;
};

type TransitPresenceState = 'onboard' | 'waiting';

export type ArrivalEstimateResult = {
  available: boolean;
  routeName: string;
  etaMinutes: number | null;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
  targetStop: {
    stopId: string;
    stopName: string;
    sequence: number;
    distanceMeters: number;
    directionName: string;
  } | null;
  sampleSize: number;
  basedOnCheckInCount: number;
};

function buildDirectionPathCoordinates(stops: StopRow[], directionId: string): [number, number][] {
  return stops
    .filter((stop) => stop.direction_id === directionId)
    .sort((a, b) => a.stop_sequence - b.stop_sequence)
    .map((stop) => [stop.lat, stop.lng]);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
) {
  const earthRadiusM = 6371000;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }

  return sorted[middle];
}

function getForwardStopDistance(
  fromSequence: number,
  targetSequence: number,
  totalStops: number,
  routeType: string
) {
  if (targetSequence >= fromSequence) {
    return targetSequence - fromSequence;
  }

  if (routeType === 'circular' && totalStops > 1) {
    return totalStops - fromSequence + targetSequence;
  }

  return null;
}

function normalizeText(value: string | null | undefined) {
  return value
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase() ?? '';
}

function inferTransitPresenceState(checkIn: Pick<CheckInEtaRow, 'is_on_board' | 'status'>): TransitPresenceState {
  const normalizedStatus = normalizeText(checkIn.status);

  if (
    normalizedStatus.includes('esperando') ||
    normalizedStatus.includes('waiting')
  ) {
    return 'waiting';
  }

  if (
    normalizedStatus.includes('en el camion') ||
    normalizedStatus.includes('en camion') ||
    normalizedStatus.includes('at bus') ||
    normalizedStatus.includes('on board') ||
    normalizedStatus.includes('onboard')
  ) {
    return 'onboard';
  }

  return checkIn.is_on_board ? 'onboard' : 'waiting';
}

function assignCheckInsToDirections(
  checkIns: CheckInEtaRow[],
  directionStops: Map<string, DirectionStop[]>
) {
  const assignments: AssignedCheckIn[] = [];

  for (const checkIn of checkIns) {
    let bestAssignment:
      | {
          directionId: string;
          sequence: number;
          distanceMeters: number;
        }
      | null = null;

    for (const [directionId, stops] of directionStops.entries()) {
      for (const stop of stops) {
        const stopDistance = distanceMeters(
          { lat: checkIn.lat, lng: checkIn.lng },
          { lat: stop.lat, lng: stop.lng }
        );

        if (!bestAssignment || stopDistance < bestAssignment.distanceMeters) {
          bestAssignment = {
            directionId,
            sequence: stop.sequence,
            distanceMeters: stopDistance,
          };
        }
      }
    }

    if (!bestAssignment || bestAssignment.distanceMeters > 800) {
      continue;
    }

    assignments.push({
      id: checkIn.id,
      createdAt: checkIn.created_at,
      directionId: bestAssignment.directionId,
      sequence: bestAssignment.sequence,
      distanceMeters: bestAssignment.distanceMeters,
    });
  }

  return assignments;
}

// ─── List all routes (summary view) ─────────────────
export const getAllRoutes = async () => {
  // Fetch routes with operator info and check-in count
  const routes = await prisma.$queryRaw<RouteSummaryRow[]>`
    SELECT
      r.id::text,
      r.route_name,
      r.route_long_name,
      r.route_type,
      r.color,
      r.fare_amount::float,
      r.fare_currency,
      o.name AS operator_name,
      o.full_name AS operator_full_name,
      COALESCE(ci.cnt, 0) AS check_in_count
    FROM routes r
    JOIN operators o ON o.id = r.operator_id
    LEFT JOIN (
      SELECT route_id, COUNT(*)::bigint AS cnt
      FROM check_ins
      GROUP BY route_id
    ) ci ON ci.route_id = r.id
    ORDER BY r.route_name ASC;
  `;

  // Fetch all directions
  const directions = await prisma.$queryRaw<DirectionRow[]>`
    SELECT
      rd.id::text,
      rd.route_id::text,
      rd.direction_name,
      rd.direction_index,
      rd.total_stops,
      rd.approx_duration,
      rd.start_time,
      rd.end_time,
      rd.operates_on
    FROM route_directions rd
    ORDER BY rd.direction_index ASC;
  `;

  return routes.map((r) => ({
    id: r.id,
    route_name: r.route_name,
    route_long_name: r.route_long_name,
    route_type: r.route_type,
    color: r.color,
    fare_amount: r.fare_amount,
    fare_currency: r.fare_currency,
    operator: {
      name: r.operator_name,
      full_name: r.operator_full_name,
    },
    directions: directions
      .filter((d) => d.route_id === r.id)
      .map((d) => ({
        id: d.id,
        direction_name: d.direction_name,
        direction_index: d.direction_index,
        total_stops: d.total_stops,
        approx_duration: d.approx_duration,
        start_time: d.start_time,
        end_time: d.end_time,
        operates_on: d.operates_on,
      })),
    recent_check_ins: Number(r.check_in_count),
  }));
};

// ─── Get full route detail (with stops in order) ────

type PathRow = {
  coordinates: { type: string; coordinates: [number, number][] } | null;
};

export const getRouteDetail = async (routeId: string) => {
  // Fetch route with operator
  const [route] = await prisma.$queryRaw<RouteSummaryRow[]>`
    SELECT
      r.id::text,
      r.route_name,
      r.route_long_name,
      r.route_type,
      r.color,
      r.fare_amount::float,
      r.fare_currency,
      o.name AS operator_name,
      o.full_name AS operator_full_name,
      (SELECT o2.website FROM operators o2 WHERE o2.id = r.operator_id) AS operator_website,
      COALESCE((SELECT COUNT(*) FROM check_ins WHERE route_id = r.id), 0) AS check_in_count
    FROM routes r
    JOIN operators o ON o.id = r.operator_id
    WHERE r.id = ${routeId}::uuid;
  `;

  if (!route) return null;

  // Fetch path geometry as GeoJSON
  const [pathRow] = await prisma.$queryRaw<PathRow[]>`
    SELECT ST_AsGeoJSON(r.path::geometry)::json AS coordinates
    FROM routes r
    WHERE r.id = ${routeId}::uuid;
  `;

  // Convert GeoJSON [lng, lat] to [lat, lng] for Leaflet
  const storedPathCoordinates: [number, number][] =
    pathRow?.coordinates?.coordinates?.map(([lng, lat]: [number, number]) => [lat, lng]) ?? [];

  // Fetch directions for this route
  const directions = await prisma.$queryRaw<DirectionRow[]>`
    SELECT
      rd.id::text,
      rd.route_id::text,
      rd.direction_name,
      rd.direction_index,
      rd.total_stops,
      rd.approx_duration,
      rd.start_time,
      rd.end_time,
      rd.operates_on
    FROM route_directions rd
    WHERE rd.route_id = ${routeId}::uuid
    ORDER BY rd.direction_index ASC;
  `;

  // Fetch all stops for all directions of this route
  const stops = await prisma.$queryRaw<StopRow[]>`
    SELECT
      s.id::text AS stop_id,
      s.stop_name,
      rs.stop_sequence,
      rs.route_direction_id::text AS direction_id,
      ST_Y(s.location::geometry) AS lat,
      ST_X(s.location::geometry) AS lng
    FROM route_stops rs
    JOIN stops s ON s.id = rs.stop_id
    JOIN route_directions rd ON rd.id = rs.route_direction_id
    WHERE rd.route_id = ${routeId}::uuid
    ORDER BY rs.route_direction_id, rs.stop_sequence ASC;
  `;

  const directionPathCoordinates = new Map(
    directions.map((direction) => [direction.id, buildDirectionPathCoordinates(stops, direction.id)])
  );

  const primaryDirection = directions.find((direction) => direction.direction_index === 0) ?? directions[0];
  const primaryDirectionPath =
    (primaryDirection && directionPathCoordinates.get(primaryDirection.id)) ?? [];

  return {
    id: route.id,
    route_name: route.route_name,
    route_long_name: route.route_long_name,
    route_type: route.route_type,
    color: route.color,
    fare_amount: route.fare_amount,
    fare_currency: route.fare_currency,
    path_coordinates:
      primaryDirectionPath.length >= 2 ? primaryDirectionPath : storedPathCoordinates,
    operator: {
      name: route.operator_name,
      full_name: route.operator_full_name,
    },
    directions: directions.map((d) => ({
      id: d.id,
      direction_name: d.direction_name,
      direction_index: d.direction_index,
      total_stops: d.total_stops,
      approx_duration: d.approx_duration,
      start_time: d.start_time,
      end_time: d.end_time,
      operates_on: d.operates_on,
      path_coordinates: directionPathCoordinates.get(d.id) ?? [],
      stops: stops
        .filter((s) => s.direction_id === d.id)
        .map((s) => ({
          sequence: s.stop_sequence,
          stop_id: s.stop_id,
          stop_name: s.stop_name,
          lat: s.lat,
          lng: s.lng,
        })),
    })),
    recent_check_ins: Number(route.check_in_count),
  };
};

// ─── Nearby routes from a single point ──────────────
type NearbyRouteRow = {
  id: string;
  route_name: string;
  route_long_name: string;
  color: string | null;
  distance: number;
};

export const findNearbyRoutes = async (lat: number, lng: number) => {
  try {
    const data = await prisma.$queryRaw<NearbyRouteRow[]>`
      SELECT
        r.id::text,
        r.route_name,
        r.route_long_name,
        r.color,
        ST_Distance(
          r.path::geography,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
        ) AS distance
      FROM routes r
      WHERE ST_DWithin(
        r.path::geography,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
        500
      )
      ORDER BY distance ASC;
    `;
    return data;
  } catch (error) {
    console.error('Nearby Routes Query Error:', error);
    throw new Error('Failed to retrieve nearby routes from database.');
  }
};

// ─── Journey Planner (existing A-to-B logic) ────────
export const findConnectingRoutes = async (input: JourneyInput) => {
  try {
    const data = await prisma.$queryRaw<RouteMatch[]>`
      SELECT 
        r.id::text,
        r.route_name::varchar,
        ST_Distance(
          r.path::geography, 
          ST_SetSRID(ST_MakePoint(${input.originLng}, ${input.originLat}), 4326)::geography
        ) as distance_from_origin,
        ST_Distance(
          r.path::geography, 
          ST_SetSRID(ST_MakePoint(${input.destLng}, ${input.destLat}), 4326)::geography
        ) as distance_from_dest
      FROM routes r
      WHERE 
        ST_DWithin(r.path::geography, ST_SetSRID(ST_MakePoint(${input.originLng}, ${input.originLat}), 4326)::geography, 500)
        AND
        ST_DWithin(r.path::geography, ST_SetSRID(ST_MakePoint(${input.destLng}, ${input.destLat}), 4326)::geography, 500);
    `;

    return data;
  } catch (error) {
    console.error('Prisma Query Error:', error);
    throw new Error('Failed to retrieve routes from database.');
  }
};

export const getArrivalEstimate = async (
  routeId: string,
  targetLat: number,
  targetLng: number
): Promise<ArrivalEstimateResult | null> => {
  const [route] = await prisma.$queryRaw<RouteMetaRow[]>`
    SELECT
      r.id::text,
      r.route_name,
      r.route_type
    FROM routes r
    WHERE r.id = ${routeId}::uuid;
  `;

  if (!route) {
    return null;
  }

  const directions = await prisma.$queryRaw<DirectionRow[]>`
    SELECT
      rd.id::text,
      rd.route_id::text,
      rd.direction_name,
      rd.direction_index,
      rd.total_stops,
      rd.approx_duration,
      rd.start_time,
      rd.end_time,
      rd.operates_on
    FROM route_directions rd
    WHERE rd.route_id = ${routeId}::uuid
    ORDER BY rd.direction_index ASC;
  `;

  const stops = await prisma.$queryRaw<StopRow[]>`
    SELECT
      s.id::text AS stop_id,
      s.stop_name,
      rs.stop_sequence,
      rs.route_direction_id::text AS direction_id,
      ST_Y(s.location::geometry) AS lat,
      ST_X(s.location::geometry) AS lng
    FROM route_stops rs
    JOIN stops s ON s.id = rs.stop_id
    JOIN route_directions rd ON rd.id = rs.route_direction_id
    WHERE rd.route_id = ${routeId}::uuid
    ORDER BY rs.route_direction_id, rs.stop_sequence ASC;
  `;

  if (directions.length === 0 || stops.length === 0) {
    return {
      available: false,
      routeName: route.route_name,
      etaMinutes: null,
      confidence: 'low',
      reason: 'La ruta no tiene suficientes paradas configuradas para estimar llegadas.',
      targetStop: null,
      sampleSize: 0,
      basedOnCheckInCount: 0,
    };
  }

  const directionStops = new Map<string, DirectionStop[]>(
    directions.map((direction) => [
      direction.id,
      stops
        .filter((stop) => stop.direction_id === direction.id)
        .map((stop) => ({
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          sequence: stop.stop_sequence,
          lat: stop.lat,
          lng: stop.lng,
        }))
        .sort((a, b) => a.sequence - b.sequence),
    ])
  );

  let targetStopSelection:
    | {
        direction: DirectionRow;
        stop: DirectionStop;
        distanceMeters: number;
      }
    | null = null;

  for (const direction of directions) {
    const stopsForDirection = directionStops.get(direction.id) ?? [];

    for (const stop of stopsForDirection) {
      const stopDistance = distanceMeters(
        { lat: targetLat, lng: targetLng },
        { lat: stop.lat, lng: stop.lng }
      );

      if (!targetStopSelection || stopDistance < targetStopSelection.distanceMeters) {
        targetStopSelection = {
          direction,
          stop,
          distanceMeters: stopDistance,
        };
      }
    }
  }

  if (!targetStopSelection) {
    return {
      available: false,
      routeName: route.route_name,
      etaMinutes: null,
      confidence: 'low',
      reason: 'No se pudo ubicar una parada cercana para esta ruta.',
      targetStop: null,
      sampleSize: 0,
      basedOnCheckInCount: 0,
    };
  }

  if (targetStopSelection.distanceMeters > 700) {
    return {
      available: false,
      routeName: route.route_name,
      etaMinutes: null,
      confidence: 'low',
      reason: 'Tu ubicación está demasiado lejos de esta ruta para dar una hora estimada confiable.',
      targetStop: {
        stopId: targetStopSelection.stop.stop_id,
        stopName: targetStopSelection.stop.stop_name,
        sequence: targetStopSelection.stop.sequence,
        distanceMeters: Math.round(targetStopSelection.distanceMeters),
        directionName: targetStopSelection.direction.direction_name,
      },
      sampleSize: 0,
      basedOnCheckInCount: 0,
    };
  }

  const selectedTarget = targetStopSelection;

  const recentCheckIns = await prisma.$queryRaw<CheckInEtaRow[]>`
    SELECT
      ci.id::text,
      ci.created_at,
      ST_Y(ci.location::geometry) AS lat,
      ST_X(ci.location::geometry) AS lng,
      ci.is_on_board,
      ci.status
    FROM check_ins ci
    WHERE ci.route_id = ${routeId}::uuid
      AND ci.created_at >= NOW() - INTERVAL '45 minutes'
    ORDER BY ci.created_at ASC;
  `;

  const recentOnboardCheckIns = recentCheckIns.filter(
    (checkIn) => inferTransitPresenceState(checkIn) === 'onboard'
  );
  const recentWaitingCheckIns = recentCheckIns.filter(
    (checkIn) => inferTransitPresenceState(checkIn) === 'waiting'
  );

  const assignedOnboardCheckIns = assignCheckInsToDirections(recentOnboardCheckIns, directionStops);
  const assignedWaitingCheckIns = assignCheckInsToDirections(recentWaitingCheckIns, directionStops);

  const targetDirectionCheckIns = assignedOnboardCheckIns
    .filter((checkIn) => checkIn.directionId === selectedTarget.direction.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const now = Date.now();
  const waitingCheckInsNearTarget = assignedWaitingCheckIns.filter((checkIn) => {
    if (checkIn.directionId !== selectedTarget.direction.id) {
      return false;
    }

    if (checkIn.distanceMeters > 250) {
      return false;
    }

    const ageMinutes = (now - checkIn.createdAt.getTime()) / 60000;
    if (ageMinutes > 20) {
      return false;
    }

    const stopGap = Math.abs(checkIn.sequence - selectedTarget.stop.sequence);
    return stopGap <= 1;
  });

  const totalStopsForDirection = Math.max(selectedTarget.direction.total_stops, 2);
  const scheduledMinutesPerStop =
    selectedTarget.direction.approx_duration /
    Math.max(totalStopsForDirection - 1, 1);

  const observedMinutesPerStopSamples: number[] = [];

  for (let index = 1; index < targetDirectionCheckIns.length; index += 1) {
    const previous = targetDirectionCheckIns[index - 1];
    const current = targetDirectionCheckIns[index];
    const traversedStops = getForwardStopDistance(
      previous.sequence,
      current.sequence,
      totalStopsForDirection,
      route.route_type
    );

    if (!traversedStops || traversedStops === 0) {
      continue;
    }

    const elapsedMinutes =
      (current.createdAt.getTime() - previous.createdAt.getTime()) / 60000;

    if (elapsedMinutes <= 0 || elapsedMinutes > 25) {
      continue;
    }

    const minutesPerStop = elapsedMinutes / traversedStops;

    if (minutesPerStop >= 0.25 && minutesPerStop <= 8) {
      observedMinutesPerStopSamples.push(minutesPerStop);
    }
  }

  const observedMedian = getMedian(observedMinutesPerStopSamples);
  const effectiveMinutesPerStop = observedMedian
    ? clamp(observedMedian, scheduledMinutesPerStop * 0.5, scheduledMinutesPerStop * 2.5)
    : scheduledMinutesPerStop;

  const etaCandidates = targetDirectionCheckIns
    .map((checkIn) => {
      const remainingStops = getForwardStopDistance(
        checkIn.sequence,
        selectedTarget.stop.sequence,
        totalStopsForDirection,
        route.route_type
      );

      if (remainingStops === null) {
        return null;
      }

      const ageMinutes = (now - checkIn.createdAt.getTime()) / 60000;
      const etaMinutes = remainingStops * effectiveMinutesPerStop - ageMinutes;

      return {
        id: checkIn.id,
        etaMinutes,
      };
    })
    .filter((candidate): candidate is { id: string; etaMinutes: number } => {
      return Boolean(candidate && candidate.etaMinutes >= -2 && candidate.etaMinutes <= 60);
    })
    .sort((a, b) => a.etaMinutes - b.etaMinutes);

  if (etaCandidates.length === 0) {
    return {
      available: false,
      routeName: route.route_name,
      etaMinutes: null,
      confidence:
        waitingCheckInsNearTarget.length > 0
          ? observedMedian || targetDirectionCheckIns.length > 0
            ? 'medium'
            : 'low'
          : observedMedian
            ? 'medium'
            : 'low',
      reason:
        targetDirectionCheckIns.length > 0
          ? 'Hay reportes recientes, pero ninguno permite proyectar un próximo paso por tu parada.'
          : waitingCheckInsNearTarget.length > 0
            ? 'Hay personas esperando cerca de esta parada, pero todavía no hay suficientes reportes recientes en el camión para estimar la próxima llegada.'
            : 'Todavía no hay suficientes reportes recientes a bordo para estimar la próxima llegada.',
      targetStop: {
        stopId: selectedTarget.stop.stop_id,
        stopName: selectedTarget.stop.stop_name,
        sequence: selectedTarget.stop.sequence,
        distanceMeters: Math.round(selectedTarget.distanceMeters),
        directionName: selectedTarget.direction.direction_name,
      },
      sampleSize: observedMinutesPerStopSamples.length,
      basedOnCheckInCount: targetDirectionCheckIns.length,
    };
  }

  const selectedCandidate = etaCandidates[0];
  const roundedEtaMinutes = Math.max(0, Math.round(selectedCandidate.etaMinutes));
  const confidence: ArrivalEstimateResult['confidence'] =
    observedMinutesPerStopSamples.length >= 2 ||
    targetDirectionCheckIns.length >= 3 ||
    (targetDirectionCheckIns.length >= 2 && waitingCheckInsNearTarget.length >= 1)
      ? 'high'
      : observedMinutesPerStopSamples.length >= 1 ||
          targetDirectionCheckIns.length >= 2 ||
          waitingCheckInsNearTarget.length >= 1
        ? 'medium'
        : 'low';

  return {
    available: true,
    routeName: route.route_name,
    etaMinutes: roundedEtaMinutes,
    confidence,
    reason:
      observedMedian
        ? waitingCheckInsNearTarget.length > 0
          ? 'Estimación calculada con reportes recientes en el camión, personas esperando cerca de tu parada y avance observado entre paradas.'
          : 'Estimación calculada con reportes recientes a bordo y avance observado entre paradas.'
        : waitingCheckInsNearTarget.length > 0
          ? 'Estimación calculada con reportes recientes en el camión, personas esperando cerca de tu parada y la duración promedio registrada de la ruta.'
          : 'Estimación calculada con el último reporte a bordo y la duración promedio registrada de la ruta.',
    targetStop: {
      stopId: selectedTarget.stop.stop_id,
      stopName: selectedTarget.stop.stop_name,
      sequence: selectedTarget.stop.sequence,
      distanceMeters: Math.round(selectedTarget.distanceMeters),
      directionName: selectedTarget.direction.direction_name,
    },
    sampleSize: observedMinutesPerStopSamples.length,
    basedOnCheckInCount: targetDirectionCheckIns.length,
  };
};
