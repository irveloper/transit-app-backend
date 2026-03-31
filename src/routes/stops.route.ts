import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  handleGetStopsByDirection,
  handleCreateStop,
  handleUpdateStop,
  handleRemoveStop,
  handleReorderStops,
  handleInsertExistingStop,
} from '../controllers/stops.controller';

export const stopsRouter = new Hono();

const createStopSchema = z.object({
  stop_name: z.string().min(1),
  lat: z.number(),
  lng: z.number(),
  route_direction_id: z.string().uuid(),
  stop_sequence: z.number().int().positive(),
});

const updateStopSchema = z.object({
  stop_name: z.string().min(1).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

const reorderSchema = z.object({
  routeStopIds: z.array(z.string().uuid()),
});

const insertSchema = z.object({
  stopId: z.string().uuid(),
  sequence: z.number().int().positive(),
});

// GET /direction/:directionId — list stops
stopsRouter.get('/direction/:directionId', handleGetStopsByDirection);

// POST / — create + link
stopsRouter.post('/', zValidator('json', createStopSchema), handleCreateStop);

// PUT /:stopId — update stop
stopsRouter.put('/:stopId', zValidator('json', updateStopSchema), handleUpdateStop);

// DELETE /:stopId/direction/:directionId — remove from direction
stopsRouter.delete('/:stopId/direction/:directionId', handleRemoveStop);

// PUT /direction/:directionId/reorder — bulk reorder
stopsRouter.put('/direction/:directionId/reorder', zValidator('json', reorderSchema), handleReorderStops);

// POST /direction/:directionId/insert — insert existing stop
stopsRouter.post('/direction/:directionId/insert', zValidator('json', insertSchema), handleInsertExistingStop);
