import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';

export type PredictInput = {
  time: string;
  weather: string;
  recentCheckIns: { route: string; status: string; location: string }[];
  targetRoute: string;
  targetLocation: string;
};

// Define the expected output format using Zod
const outputSchema = z.object({
  delayCoefficient: z.number().describe("The calculated delay coefficient (Dc) in minutes. Generally between -5 and +30."),
  reasoning: z.string().describe("Brief explanation of why this delay was calculated."),
});

const parser = StructuredOutputParser.fromZodSchema(outputSchema);

export type AIConfig = {
  apiKey: string;
  baseUrl?: string;
  modelName: string;
};

export const calculateDelayCoefficient = async (
  input: PredictInput,
  config: AIConfig
) => {
  const model = new ChatOpenAI({
    modelName: config.modelName,
    temperature: 0.2, // Low temp for more deterministic delays
    apiKey: config.apiKey,
    configuration: config.baseUrl ? { baseURL: config.baseUrl } : undefined,
  });

  const promptTemplate = new PromptTemplate({
    template: `You are a transit delay prediction system for Cancún. 
Given the following current conditions:
- Time: {time}
- Weather: {weather}
- Recent Check-ins: {checkIns}

Calculate the delay coefficient (Dc) for Route {targetRoute} at location {targetLocation}.
{format_instructions}
`,
    inputVariables: ['time', 'weather', 'checkIns', 'targetRoute', 'targetLocation'],
    partialVariables: {
      format_instructions: parser.getFormatInstructions(),
    },
  });

  const formatCheckIns = input.recentCheckIns
    .map((c) => `User reported '${c.status}' on route ${c.route} near ${c.location}`)
    .join('; ') || 'No recent check-ins.';

  const prompt = await promptTemplate.format({
    time: input.time,
    weather: input.weather,
    checkIns: formatCheckIns,
    targetRoute: input.targetRoute,
    targetLocation: input.targetLocation,
  });

  const response = await model.invoke(prompt);
  
  try {
    const parsed = await parser.parse(response.content as string);
    return parsed;
  } catch (error) {
    console.error("Failed to parse prediction output", error);
    // Fallback in case of parsing drift
    return { delayCoefficient: 0, reasoning: "Error calculating delay." };
  }
};
