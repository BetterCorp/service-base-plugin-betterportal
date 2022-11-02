import {
  ServiceCallable,
  ServicesBase,
  ServicesClient,
} from "@bettercorp/service-base";
import { FastifyReply } from "fastify";
import { FastifyHeadersWithIP } from "@bettercorp/service-base-plugin-web-server/lib/plugins/service-fastify/lib";
import { MyPluginConfig } from "../../plugins/service-betterportal/sec.config";
import { BSBFastifyCallable } from "../../plugins/service-betterportal/plugin";
import { AuthToken, FastifyRequestPath } from "../../index";
import { EJWTTokenType } from "@bettercorp/service-base-plugin-web-server/lib/plugins/service-webjwt/sec.config";

export class fastify extends ServicesClient<
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  BSBFastifyCallable,
  MyPluginConfig
> {
  private readonly _serviceName: string;
  constructor(self: ServicesBase, serviceName: string) {
    super(self);
    this._serviceName = serviceName;
  }
  public override readonly _pluginName: string = "service-betterportal";
  public override readonly initAfterPlugins: string[] = [
    "service-fastify",
    "service-webjwt",
  ];
  public override readonly runBeforePlugins: string[] = ["service-fastify"];

  public async get<
    Path extends string,
    Body = any,
    Querystring = any,
    Headers = FastifyHeadersWithIP
  >(
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path, Body, Querystring, Headers>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "get",
      this._serviceName,
      path,
      permissionRequired,
      listener,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }

  public async post<
    Path extends string,
    Body = any,
    Querystring = any,
    Headers = FastifyHeadersWithIP
  >(
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path, Body, Querystring, Headers>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "post",
      this._serviceName,
      path,
      permissionRequired,
      listener,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }

  public async put<
    Path extends string,
    Body = any,
    Querystring = any,
    Headers = FastifyHeadersWithIP
  >(
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path, Body, Querystring, Headers>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "put",
      this._serviceName,
      path,
      permissionRequired,
      listener,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }

  public async delete<
    Path extends string,
    Body = any,
    Querystring = any,
    Headers = FastifyHeadersWithIP
  >(
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path, Body, Querystring, Headers>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "delete",
      this._serviceName,
      path,
      permissionRequired,
      listener,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }

  public async patch<
    Path extends string,
    Body = any,
    Querystring = any,
    Headers = FastifyHeadersWithIP
  >(
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path, Body, Querystring, Headers>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "patch",
      this._serviceName,
      path,
      permissionRequired,
      listener,
      roles,
      allowedTokenTypes,
      optionalAuth
    );
  }
}
