import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { handleCreateCheckIn, handleGetRecentCheckIns } from '../controllers/checkins.controller';

export const checkInsRouter = new Hono();

const createCheckInSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  is_on_board: z.boolean(),
  status: z.enum(['Fluido', 'Lleno', 'Tráfico']),
  route_id: z.string().uuid(),
});

// POST / — create a check-in
checkInsRouter.post('/', zValidator('json', createCheckInSchema), handleCreateCheckIn);

// GET /recent?routeId=X — recent check-ins for a route
checkInsRouter.get('/recent', handleGetRecentCheckIns);
