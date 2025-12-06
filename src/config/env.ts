import dotenv from 'dotenv';
dotenv.config();

export const config = {
  api: {
    endpoint: process.env.API_ENDPOINT || 'https://api.senzor.dev/api/ingest/stats',
    key: process.env.API_KEY,
    timeout: 10000,
  },
  agent: {
    vpsId: process.env.SERVER_ID,
    interval: parseInt(process.env.INTERVAL || '60', 10),
  },
};

export const validateConfig = () => {
  const missing: string[] = [];
  if (!config.agent.vpsId) missing.push('SERVER_ID');
  if (!config.api.key) missing.push('API_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};