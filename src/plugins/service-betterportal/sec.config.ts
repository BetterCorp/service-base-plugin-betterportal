import { SecConfig } from "@bettercorp/service-base";

export interface MyPluginConfig {
  issuer: string; // Auth Issuer URL
  certsUrl: string; // Auth Issuer JWT Certs URL
  BPUI: boolean; // Enable BP UI host: Serve the BetterPortal UI Assets
}

export class Config extends SecConfig<MyPluginConfig> {
  migrate(
    mappedPluginName: string,
    existingConfig: MyPluginConfig
  ): MyPluginConfig {
    return {
      BPUI: existingConfig.BPUI !== undefined ? existingConfig.BPUI: true,
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
