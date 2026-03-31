import { Context } from 'hono';
import {
  findConnectingRoutes,
  findNearbyRoutes,
  getAllRoutes,
  getArrivalEstimate,
  getRouteDetail,
} from '../services/routes.service';

// GET /api/routes — list all routes (summary)
export const handleListRoutes = async (c: Context) => {
  try {
    const routes = await getAllRoutes();
    return c.json({ success: true, data: routes });
  } catch (error: any) {
    console.error('List Routes Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};

// GET /api/routes/:id — full route detail with stops
export const handleGetRouteDetail = async (c: Context) => {
  try {
    const id = c.req.param('id');

    if (!id) {
      return c.json({ error: 'Missing route ID parameter' }, 400);
    }

    const route = await getRouteDetail(id);

    if (!route) {
      return c.json({ error: 'Route not found' }, 404);
    }

    return c.json({ success: true, data: route });
  } catch (error: any) {
    console.error('Route Detail Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};

// GET /api/routes/:id/arrival-estimate?lat=X&lng=Y
export const handleGetArrivalEstimate = async (c: Context) => {
  try {
    const id = c.req.param('id');
    const { lat, lng } = c.req.query();

    if (!id) {
      return c.json({ error: 'Missing route ID parameter' }, 400);
    }

    if (!lat || !lng) {
      return c.json({ error: 'Missing required query parameters: lat, lng' }, 400);
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return c.json({ error: 'lat and lng must be valid numbers.' }, 400);
    }

    const estimate = await getArrivalEstimate(id, parsedLat, parsedLng);

    if (!estimate) {
      return c.json({ error: 'Route not found' }, 404);
    }

    return c.json({ success: true, data: estimate });
  } catch (error: any) {
    console.error('Arrival Estimate Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};

// GET /api/routes/nearby?lat=X&lng=Y — routes near a single point
export const handleFindNearbyRoutes = async (c: Context) => {
  try {
    const { lat, lng } = c.req.query();

    if (!lat || !lng) {
      return c.json({ error: 'Missing required query parameters: lat, lng' }, 400);
    }

    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return c.json({ error: 'lat and lng must be valid numbers.' }, 400);
    }

    const routes = await findNearbyRoutes(parsedLat, parsedLng);
    return c.json({ success: true, data: routes });
  } catch (error: any) {
    console.error('Nearby Routes Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};

// GET /api/routes/journey — A-to-B journey planner (existing)
export const handleGetJourneyRoutes = async (c: Context) => {
  try {
    const { originLat, originLng, destLat, destLng } = c.req.query();

    if (!originLat || !originLng || !destLat || !destLng) {
      return c.json({ error: 'Missing required query parameters: originLat, originLng, destLat, destLng' }, 400);
    }

    const input = {
      originLat: parseFloat(originLat),
      originLng: parseFloat(originLng),
      destLat: parseFloat(destLat),
      destLng: parseFloat(destLng),
    };

    if (isNaN(input.originLat) || isNaN(input.originLng) || isNaN(input.destLat) || isNaN(input.destLng)) {
      return c.json({ error: 'Coordinate parameters must be valid numbers.' }, 400);
    }

    const routes = await findConnectingRoutes(input);

    return c.json({ success: true, data: routes });
  } catch (error: any) {
    console.error('Journey Routes Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};
