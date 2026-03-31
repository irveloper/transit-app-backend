import { Context } from 'hono';
import { calculateDelayCoefficient } from '../services/predict.service';

export const handlePredictDelay = async (c: Context) => {
  try {
    const body = await c.req.json();
    
    // Support any OpenAI-compatible provider (OpenRouter by default)
    const aiApiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY!;
    const aiBaseUrl = process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1';
    const aiModel = process.env.AI_MODEL || 'openai/gpt-4o-mini';
    
    if (!aiApiKey) {
      return c.json({ error: 'AI API key is not configured.' }, 500);
    }

    const { time, weather, recentCheckIns, targetRoute, targetLocation } = body;

    const result = await calculateDelayCoefficient(
      { time, weather, recentCheckIns, targetRoute, targetLocation },
      { apiKey: aiApiKey, baseUrl: aiBaseUrl, modelName: aiModel }
    );

    return c.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Prediction Check Error:', error);
    return c.json({ success: false, error: error.message || 'Internal Server Error' }, 500);
  }
};
