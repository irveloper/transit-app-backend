import { Context } from 'hono';
import {
  getStopsByDirection,
  createStopAndLink,
  updateStop,
  removeStopFromDirection,
  reorderStops,
  insertExistingStop,
} from '../services/stops.service';

// GET /api/stops/direction/:directionId
export const handleGetStopsByDirection = async (c: Context) => {
  try {
    const directionId = c.req.param('directionId');
    const stops = await getStopsByDirection(directionId);
    return c.json({ success: true, data: stops });
  } catch (error: any) {
    console.error('Get Stops Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};

// POST /api/stops
export const handleCreateStop = async (c: Context) => {
  try {
    const body = c.req.valid('json' as never);
    const stop = await createStopAndLink(body);
    return c.json({ success: true, data: stop }, 201);
  } catch (error: any) {
    console.error('Create Stop Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};

// PUT /api/stops/:stopId
export const handleUpdateStop = async (c: Context) => {
  try {
    const stopId = c.req.param('stopId');
    const body = c.req.valid('json' as never);
    const stop = await updateStop(stopId, body);
    return c.json({ success: true, data: stop });
  } catch (error: any) {
    console.error('Update Stop Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};

// DELETE /api/stops/:stopId/direction/:directionId
export const handleRemoveStop = async (c: Context) => {
  try {
    const stopId = c.req.param('stopId');
    const directionId = c.req.param('directionId');
    await removeStopFromDirection(stopId, directionId);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Remove Stop Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};

// PUT /api/stops/direction/:directionId/reorder
export const handleReorderStops = async (c: Context) => {
  try {
    const directionId = c.req.param('directionId');
    const { stopIds = [] } = c.req.valid('json' as never);
    await reorderStops(directionId, stopIds);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Reorder Stops Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};

// POST /api/stops/direction/:directionId/insert
export const handleInsertExistingStop = async (c: Context) => {
  try {
    const directionId = c.req.param('directionId');
    const { stopId, sequence } = c.req.valid('json' as never);
    await insertExistingStop(directionId, stopId, sequence);
    return c.json({ success: true, data: null }, 201);
  } catch (error: any) {
    console.error('Insert Stop Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};
