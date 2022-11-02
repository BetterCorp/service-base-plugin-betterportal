import { SecConfig } from "@bettercorp/service-base";

export interface MyPluginConfig {
  issuer: string; // Auth Issuer URL
  certsUrl: string; // Auth Issuer JWT Certs URL
}

export class Config extends SecConfig<MyPluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: MyPluginConfig
  ): MyPluginConfig {
    return {
      issuer:
        existingConfig.issuer !== undefined
          ? existingConfig.issuer
          : "https://auth-za.betterportal.cloud/auth",
      certsUrl:
        existingConfig.certsUrl !== undefined
          ? existingConfig.certsUrl
          : "https://auth-za.betterportal.cloud/auth/json",
    };
  }
}
