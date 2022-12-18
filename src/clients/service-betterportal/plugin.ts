import {
  ServiceCallable,
  ServicesBase,
  ServicesClient,
} from "@bettercorp/service-base";
import { MyPluginConfig } from "../../plugins/service-betterportal/sec.config";
import type { BSBFastifyCallable } from "../../plugins/service-betterportal/plugin";
import type {
  FastifyBodyRequestHandler,
  FastifyNoBodyRequestHandler,
} from "../../index";
import type { EJWTTokenType } from "@bettercorp/service-base-plugin-web-server/lib/plugins/service-webjwt/sec.config";

export class fastify extends ServicesClient<
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  BSBFastifyCallable,
  MyPluginConfig
> {
  private readonly _serviceName: string;
  private readonly _pluginBase: string;
  constructor(self: ServicesBase, serviceName: string, pluginBase: string) {
    super(self);
    this._serviceName = serviceName;
    this._pluginBase = pluginBase;
  }
  public override readonly _pluginName: string = "service-betterportal";

  public async initBPUI(path: string): Promise<void> {
    await this._plugin.callPluginMethod(
      "initBPUI",
      this._serviceName,
      this._pluginBase
    );
  }

  public async get<Path extends string>(
    path: Path,
    permissionRequired: string,
    listener: FastifyNoBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "get",
      this._serviceName,
      path,
      permissionRequired,
      listener as FastifyNoBodyRequestHandler<string>,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }

  public async post<Path extends string>(
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "post",
      this._serviceName,
      path,
      permissionRequired,
      listener as FastifyBodyRequestHandler<string>,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }

  public async put<Path extends string>(
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "put",
      this._serviceName,
      path,
      permissionRequired,
      listener as FastifyBodyRequestHandler<string>,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }

  public async delete<Path extends string>(
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "delete",
      this._serviceName,
      path,
      permissionRequired,
      listener as FastifyBodyRequestHandler<string>,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }

  public async patch<Path extends string>(
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "patch",
      this._serviceName,
      path,
      permissionRequired,
      listener as FastifyBodyRequestHandler<string>,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }
}
