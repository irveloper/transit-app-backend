import type { Context } from 'hono';
import {
  getStopsByDirection,
  createStopAndLink,
  updateStop,
  removeStopFromDirection,
  reorderStops,
  insertExistingStop,
} from '../services/stops.service';
import { getErrorMessage } from '../utils/errors';

const requireParam = (c: Context, name: string) => {
  const value = c.req.param(name);

  if (!value) {
    throw new Error(`Missing required parameter: ${name}`);
  }

  return value;
};

// GET /api/stops/direction/:directionId
export const handleGetStopsByDirection = async (c: Context) => {
  try {
    const directionId = requireParam(c, 'directionId');
    const stops = await getStopsByDirection(directionId);
    return c.json({ success: true, data: stops });
  } catch (error) {
    console.error('Get Stops Error:', error);
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
};

// POST /api/stops
export const handleCreateStop = async (c: Context) => {
  try {
    const body = c.req.valid('json' as never);
    const stop = await createStopAndLink(body);
    return c.json({ success: true, data: stop }, 201);
  } catch (error) {
    console.error('Create Stop Error:', error);
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
};

// PUT /api/stops/:stopId
export const handleUpdateStop = async (c: Context) => {
  try {
    const stopId = requireParam(c, 'stopId');
    const body = c.req.valid('json' as never);
    const stop = await updateStop(stopId, body);
    return c.json({ success: true, data: stop });
  } catch (error) {
    console.error('Update Stop Error:', error);
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
};

// DELETE /api/stops/:stopId/direction/:directionId
export const handleRemoveStop = async (c: Context) => {
  try {
    const stopId = requireParam(c, 'stopId');
    const directionId = requireParam(c, 'directionId');
    await removeStopFromDirection(stopId, directionId);
    return c.json({ success: true, data: null });
  } catch (error) {
    console.error('Remove Stop Error:', error);
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
};

// PUT /api/stops/direction/:directionId/reorder
export const handleReorderStops = async (c: Context) => {
  try {
    const directionId = requireParam(c, 'directionId');
    const { stopIds = [] } = c.req.valid('json' as never);
    await reorderStops(directionId, stopIds);
    return c.json({ success: true, data: null });
  } catch (error) {
    console.error('Reorder Stops Error:', error);
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
};

// POST /api/stops/direction/:directionId/insert
export const handleInsertExistingStop = async (c: Context) => {
  try {
    const directionId = requireParam(c, 'directionId');
    const { stopId, sequence } = c.req.valid('json' as never);
    await insertExistingStop(directionId, stopId, sequence);
    return c.json({ success: true, data: null }, 201);
  } catch (error) {
    console.error('Insert Stop Error:', error);
    return c.json({ success: false, error: getErrorMessage(error) }, 500);
  }
};
