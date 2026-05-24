export interface IntegrationConfig {
  enabled: boolean;
  [key: string]: any;
}

export abstract class BaseIntegration<T = unknown> {
  readonly name: string;
  protected config: IntegrationConfig;

  constructor(name: string, config: IntegrationConfig) {
    this.name = name;
    this.config = config;
  }

  abstract collect(): Promise<T | null>;
}
