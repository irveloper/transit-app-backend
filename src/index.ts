import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { checkInsRouter } from './routes/checkins.route';
import { predictRouter } from './routes/predict.route';
import { routesRouter } from './routes/routes.route';
import { stopsRouter } from './routes/stops.route';

const app = new Hono();

// Enable CORS for frontend integration
app.use('/*', cors());

app.get('/health', (c) => {
  return c.json({ status: 'ok', message: 'Hono API is running flawlessly!' });
});

app.route('/api/check-ins', checkInsRouter);
app.route('/api/predict', predictRouter);
app.route('/api/routes', routesRouter);
app.route('/api/stops', stopsRouter);

const port = Number(process.env.PORT) || 8787;
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port
});
