import {
  IPluginLogger,
  ServiceCallable,
  ServicesBase,
} from "@bettercorp/service-base";
import {
  fastify,
  webJwtLocal,
} from "@bettercorp/service-base-plugin-web-server";
import { EJWTTokenType } from "@bettercorp/service-base-plugin-web-server/lib/plugins/service-webjwt/sec.config";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { Tools } from "@bettercorp/tools/lib/Tools";
import { FastifyReply } from "fastify";
import type {
  AuthToken,
  User_Client,
  FastifyRequestPath,
  FastifyRequestPathParams,
} from "../../index";
import type { MyPluginConfig } from "./sec.config";

export interface BSBFastifyCallable extends ServiceCallable {
  get<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean,
    require2FA?: boolean
  ): Promise<void>;

  post<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean,
    require2FA?: boolean
  ): Promise<void>;

  put<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean,
    require2FA?: boolean
  ): Promise<void>;

  delete<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean,
    require2FA?: boolean
  ): Promise<void>;

  patch<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean,
    require2FA?: boolean
  ): Promise<void>;
}

export class Service
  extends ServicesBase<
    ServiceCallable,
    ServiceCallable,
    ServiceCallable,
    ServiceCallable,
    ServiceCallable,
    MyPluginConfig
  >
  implements BSBFastifyCallable
{
  private fastify: fastify;
  private webJwt!: webJwtLocal;
  constructor(pluginName: string, cwd: string, log: IPluginLogger) {
    super(pluginName, cwd, log);
    this.fastify = new fastify(this);
  }
  private readonly _service2FAMaxTime = 5 * 60 * 1000;
  public override async init(): Promise<void> {
    this.webJwt = new webJwtLocal(
      this,
      {
        bearerStr: "BPAuth",
        queryKey: "BPT",
        defaultTokenType: EJWTTokenType.req,
        allowedTokenTypes: [
          EJWTTokenType.query,
          EJWTTokenType.req,
          EJWTTokenType.reqOrQuery,
        ],
      },
      {
        timeout: 5000,
        jwksUri: (await this.getPluginConfig()).certsUrl,
      },
      {
        issuer: (await this.getPluginConfig()).issuer,
      }
    );
  }

  public async get<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.get<any, FastifyRequestPathParams>(
      path,
      async (request, reply) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          permissionRequired,
          require2FA,
          roles || [],
          request as any,
          allowedTokenTypes
        );
        if (!handleResponse.success) {
          if (optionalAuth === true)
            return await listener(
              null,
              null,
              null,
              request as any,
              reply as any
            );
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.roles!,
          request as any,
          reply as any
        );
      }
    );
  }

  public async post<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.post<any, FastifyRequestPathParams>(
      path,
      async (request, reply) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          permissionRequired,
          require2FA,
          roles || [],
          request as any,
          allowedTokenTypes
        );
        if (!handleResponse.success) {
          if (optionalAuth === true)
            return await listener(
              null,
              null,
              null,
              request as any,
              reply as any
            );
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.roles!,
          request as any,
          reply as any
        );
      }
    );
  }

  public async put<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.put<any, FastifyRequestPathParams>(
      path,
      async (request, reply) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          permissionRequired,
          require2FA,
          roles || [],
          request as any,
          allowedTokenTypes
        );
        if (!handleResponse.success) {
          if (optionalAuth === true)
            return await listener(
              null,
              null,
              null,
              request as any,
              reply as any
            );
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.roles!,
          request as any,
          reply as any
        );
      }
    );
  }

  public async delete<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.delete<any, FastifyRequestPathParams>(
      path,
      async (request, reply) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          permissionRequired,
          require2FA,
          roles || [],
          request as any,
          allowedTokenTypes
        );
        if (!handleResponse.success) {
          if (optionalAuth === true)
            return await listener(
              null,
              null,
              null,
              request as any,
              reply as any
            );
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.roles!,
          request as any,
          reply as any
        );
      }
    );
  }

  public async patch<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: {
      (
        token: AuthToken | null,
        clientId: string | null,
        roles: Array<string> | null,
        request: FastifyRequestPath<Path>,
        reply: FastifyReply
      ): Promise<void>;
    },
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.patch<any, FastifyRequestPathParams>(
      path,
      async (request, reply) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          permissionRequired,
          require2FA,
          roles || [],
          request as any,
          allowedTokenTypes
        );
        if (!handleResponse.success) {
          if (optionalAuth === true)
            return await listener(
              null,
              null,
              null,
              request as any,
              reply as any
            );
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.roles!,
          request as any,
          reply as any
        );
      }
    );
  }

  private async handleRequest<Path extends string>(
    path: Path,
    serviceName: string,
    permissionRequired: string,
    require2FA: boolean,
    roles: Array<string>,
    request: FastifyRequestPath<"/:clientId/">,
    tokenType?: EJWTTokenType
  ): Promise<{
    success: boolean;
    code?: number;
    message?: string;
    token?: AuthToken;
    clientId?: string;
    roles?: Array<string>;
  }> {
    let token: AuthToken;
    this.log.info("[REQUEST] {URL}", { URL: path });
    try {
      let tempToken: AuthToken | boolean | null =
        await this.webJwt.verifyWebRequest<AuthToken>(request, tokenType);
      if (tempToken === null)
        return { success: false, code: 401, message: "No auth" };
      if (tempToken === false)
        return { success: false, code: 401, message: "Invalid auth" };
      if (tempToken === true)
        return { success: false, code: 401, message: "Invalid auth" };
      token = tempToken;
    } catch (Exc) {
      return { success: false, code: 403, message: "Server error" };
    }

    if (Tools.isNullOrUndefined(token))
      return { success: false, code: 401, message: "Invalid token" };
    if (Tools.isNullOrUndefined(request.params))
      return { success: false, code: 401, message: "Invalid path" };
    let clients = this.getClientsAvailToMe(token.clients);
    if (Tools.isNullOrUndefined(clients[request.params.clientId]))
      return { success: false, code: 403, message: "Invalid client" };
    if (
      this._userHasPermission(
        clients,
        request.params!.clientId!,
        serviceName,
        permissionRequired
      )
    ) {
      if (require2FA) {
        if (!token.has2FASetup)
          return { success: false, code: 407, message: "2FA Setup required" };
        const now = new Date().getTime();
        if (token.last2FATime < now - this._service2FAMaxTime)
          return { success: false, code: 407, message: "OTP required" };
      }
      return {
        success: true,
        token,
        clientId: request.params.clientId!,
        roles: roles.filter((x) =>
          this._userHasPermission(
            clients,
            request.params!.clientId!,
            serviceName,
            x
          )
        ),
      };
    }
    return { success: false, code: 403, message: "No permissions" };
  }

  private _userHasPermission(
    clients: IDictionary<User_Client>,
    clientId: string,
    serviceName: string,
    permissionRequired: string
  ): boolean {
    if (Tools.isNullOrUndefined(clients[clientId])) return false;
    if (Tools.isNullOrUndefined(clients[clientId].sar)) return false;
    if (Tools.isArray(clients[clientId].sar._)) {
      if (clients[clientId].sar._.indexOf("root") >= 0) {
        return true;
      }
      if (clients[clientId].sar._.indexOf(permissionRequired) >= 0) {
        return true;
      }
    }
    if (Tools.isArray(clients[clientId].sar[serviceName.toLowerCase()])) {
      if (clients[clientId].sar[serviceName.toLowerCase()].indexOf("root") >= 0)
        return true;
      if (
        clients[clientId].sar[serviceName.toLowerCase()].indexOf(
          permissionRequired
        ) >= 0
      )
        return true;
    }

    return false;
  }

  private getClientsAvailToMe(
    clients?: IDictionary<User_Client>
  ): IDictionary<User_Client> {
    let clientsList: IDictionary<User_Client> = {};

    if (clients === undefined || clients === null) return clientsList;

    const now = new Date().getTime();
    for (let clientId of Object.keys(clients)) {
      if (clients[clientId].enabled !== true) continue;

      if (Tools.isNullOrUndefined(clients[clientId].timeframe))
        clientsList[clientId] = clients[clientId];
      else {
        if (
          clients[clientId].timeframe!.timeFrom >= now &&
          clients[clientId].timeframe!.timeTo < now
        )
          clientsList[clientId] = clients[clientId];
      }
    }

    return clientsList;
  }
}
