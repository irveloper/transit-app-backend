import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { handlePredictDelay } from '../controllers/predict.controller';

export const predictRouter = new Hono();

const predictSchema = z.object({
  time: z.string(),
  weather: z.string(),
  recentCheckIns: z.array(
    z.object({
      route: z.string(),
      status: z.string(),
      location: z.string(),
    })
  ).default([]),
  targetRoute: z.string(),
  targetLocation: z.string(),
});

predictRouter.post('/', zValidator('json', predictSchema), handlePredictDelay);
