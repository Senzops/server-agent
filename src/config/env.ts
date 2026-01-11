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
  integrations: {
    nginx: {
      enabled: process.env.ENABLE_NGINX === 'true',
      statusUrl: process.env.NGINX_STATUS_URL || "http://127.0.0.1/nginx_status",
    },
    traefik: {
      enabled: process.env.ENABLE_TRAEFIK === 'true',
      url: process.env.TRAEFIK_API_URL || "http://127.0.0.1:8080",
      username: process.env.TRAEFIK_USER,
      password: process.env.TRAEFIK_PASSWORD
    },
    terminal: {
      enabled: process.env.ENABLE_TERMINAL === 'true',
      allowHostAccess: process.env.ALLOW_HOST_ACCESS === 'true',
    }
  }
};

export const validateConfig = () => {
  const missing: string[] = [];
  if (!config.agent.vpsId) missing.push('SERVER_ID');
  if (!config.api.key) missing.push('API_KEY');

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
};