export interface IntegrationConfig {
  enabled: boolean;
  [key: string]: any; // Specific config like URL, Port, Password
}

export abstract class BaseIntegration {
  name: string;
  config: IntegrationConfig;

  constructor(name: string, config: IntegrationConfig) {
    this.name = name;
    this.config = config;
  }

  // Should return the stats object or null if failed
  abstract collect(): Promise<any>;
}