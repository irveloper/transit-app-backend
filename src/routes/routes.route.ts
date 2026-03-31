import { Hono } from 'hono';
import {
  handleListRoutes,
  handleGetArrivalEstimate,
  handleGetRouteDetail,
  handleGetJourneyRoutes,
  handleFindNearbyRoutes,
} from '../controllers/routes.controller';

export const routesRouter = new Hono();

// GET /api/routes — list all routes (summary)
routesRouter.get('/', handleListRoutes);

// GET /api/routes/nearby?lat=X&lng=Y — routes near a single point
routesRouter.get('/nearby', handleFindNearbyRoutes);

// GET /api/routes/journey?originLat=X&originLng=Y&destLat=Z&destLng=W
routesRouter.get('/journey', handleGetJourneyRoutes);

// GET /api/routes/:id/arrival-estimate?lat=X&lng=Y
routesRouter.get('/:id/arrival-estimate', handleGetArrivalEstimate);

// GET /api/routes/:id — full route detail with stops and schedule
routesRouter.get('/:id', handleGetRouteDetail);
