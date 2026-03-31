import type { Context } from 'hono';
import { createCheckIn, getRecentCheckIns } from '../services/checkins.service';
import { getErrorMessage } from '../utils/errors';

// POST /api/check-ins — create a new check-in
export const handleCreateCheckIn = async (c: Context) => {
  try {
    const body = c.req.valid('json' as never);
    const result = await createCheckIn(body);

    if (!result.allowed) {
      return c.json({ success: false, error: 'Debes estar cerca de la ruta para reportar.' }, 403);
    }

    return c.json({ success: true, data: result.data }, 201);
  } catch (error) {
    console.error('Create Check-in Error:', error);
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
};

// GET /api/check-ins/recent?routeId=X — recent check-ins for a route
export const handleGetRecentCheckIns = async (c: Context) => {
  try {
    const routeId = c.req.query('routeId');

    if (!routeId) {
      return c.json({ error: 'Missing required query parameter: routeId' }, 400);
    }

    const checkIns = await getRecentCheckIns(routeId);
    return c.json({ success: true, data: checkIns });
  } catch (error) {
    console.error('Recent Check-ins Error:', error);
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
};
