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
import { CleanStringStrength, Tools } from "@bettercorp/tools/lib/Tools";
import { FastifyReply } from "fastify";
import type {
  AuthToken,
  User_Client,
  FastifyRequestPath,
  FastifyRequestPathParams,
} from "../../index";
import type { MyPluginConfig } from "./sec.config";
import path, { join } from "path";
import { existsSync, createReadStream, readdirSync, readdir, stat } from "fs";
import { createHash } from "crypto";
import { contentType } from "mime-types";

export interface BSBFastifyCallable extends ServiceCallable {
  initBPUI(serviceName: string, path: string): Promise<void>;
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
  public override readonly initAfterPlugins: string[] = [
    "service-fastify",
    "service-webjwt",
  ];
  public override readonly runBeforePlugins: string[] = ["service-fastify"];

  private fastify: fastify;
  private webJwt!: webJwtLocal;
  constructor(
    pluginName: string,
    cwd: string,
    pluginCwd: string,
    log: IPluginLogger
  ) {
    super(pluginName, cwd, pluginCwd, log);
    this.fastify = new fastify(this);
    this.webJwt = new webJwtLocal(this);
  }
  private readonly _service2FAMaxTime = 5 * 60 * 1000;
  private walkFilePath(dir: string): Promise<Array<string>> {
    const self = this;
    return new Promise((resolve, reject) => {
      let results: Array<any> = [];
      readdir(dir, (err, list) => {
        if (err) return reject(err);
        var pending = list.length;
        if (!pending) return resolve(results);
        list.forEach((file) => {
          file = path.resolve(dir, file);
          stat(file, (err, stat) => {
            if (stat && stat.isDirectory()) {
              self.walkFilePath(file).then((res) => {
                results = results.concat(res);
                if (!--pending) resolve(results);
              });
            } else {
              results.push(file);
              if (!--pending) resolve(results);
            }
          });
        });
      });
    });
  }

  private async createMD5(filePath: string) {
    return new Promise((res, rej) => {
      const hash = createHash("md5");

      const rStream = createReadStream(filePath);
      rStream.on("data", (data) => {
        hash.update(data);
      });
      rStream.on("end", () => {
        res(hash.digest("hex"));
      });
    });
  }
  public async initBPUI(serviceName: string, path: string): Promise<void> {
    const bpuiDir = join(path, "./bpui/");
    const bpAssetsuiDir = join(bpuiDir, "./assets/");
    if (existsSync(bpuiDir)) {
      this.log.info("BPUI Enabled: {dir} ({serviceName})", {
        dir: bpuiDir,
        serviceName,
      });
      let cacheConfig: any = {};

      // "/bpui/:appId/:moduleId/:moduleType/"
      const requestListener = (
        oappName: string,
        omoduleName: string,
        request: FastifyRequestPath<string>,
        reply: FastifyReply
      ) => {
        const appName =
          Tools.cleanString(oappName, 50, CleanStringStrength.exhard, false) ||
          "_";
        const moduleName =
          Tools.cleanString(
            omoduleName,
            255,
            CleanStringStrength.hard,
            false
          ) || "_._";
        if (cacheConfig[appName] === undefined)
          return reply.status(404).send("File not found");
        if (
          [".js", ".css", ".vue"].filter((x) => moduleName.indexOf(x) > 0)
            .length === 0
        )
          return reply.status(404).send("File not found");
        if (cacheConfig[appName][moduleName] === undefined)
          return reply.status(404).send("File not found");
        const bpContentFile = join(bpuiDir, `./${appName}/${moduleName}`);
        if (!existsSync(bpContentFile))
          return reply.status(404).send("File not found");

        if (moduleName.endsWith(".js")) reply.type("application/javascript");
        else if (moduleName.endsWith(".vue"))
          reply.type("application/javascript");
        else if (moduleName.endsWith(".css")) reply.type("text/css");
        else return reply.status(404).send("File type not found");

        reply.header("ETag", cacheConfig[appName][moduleName]);
        reply.header(
          "Cache-Control",
          "max-age=604800, must-revalidate, no-transform, stale-while-revalidate=86400, stale-if-error"
        );
        if (
          request.headers["if-none-match"] === cacheConfig[appName][moduleName]
        ) {
          return reply.code(304).send();
        }
        return reply.status(200).send(createReadStream(bpContentFile));
      };

      for (let appName of readdirSync(bpuiDir, { withFileTypes: true })) {
        if (!appName.isDirectory()) continue;
        if (appName.name === "assets") continue;
        cacheConfig[appName.name] = cacheConfig[appName.name] || {};
        for (let moduleName of readdirSync(join(bpuiDir, appName.name), {
          withFileTypes: true,
        })) {
          if (!moduleName.isFile()) continue;
          cacheConfig[appName.name][moduleName.name] = await this.createMD5(
            join(bpuiDir, appName.name, moduleName.name)
          );
          this.log.info(
            "BPUI Cache: /bpui/{appName}/{moduleName} ({serviceName})",
            {
              appName: appName.name,
              moduleName: moduleName.name,
              serviceName,
            }
          );

          await this.fastify.get(
            `/bpui/${appName.name}/${moduleName.name}`,
            (req, reply) =>
              requestListener(
                appName.name,
                moduleName.name,
                req as any,
                reply as any
              )
          );
        }
      }

      if (existsSync(bpAssetsuiDir)) {
        this.log.info("BPUI Enabled Assets: {dir} ({serviceName})", {
          dir: bpAssetsuiDir,
          serviceName,
        });
        let cacheAssetsConfig: any = {};

        const requestAssetListener = (
          assetFile: string,
          request: FastifyRequestPath<string>,
          reply: FastifyReply
        ) => {
          if (cacheAssetsConfig[assetFile] === undefined)
            return reply.status(404).send("File not found");
          const bpContentFile = join(bpAssetsuiDir, `./${assetFile}`);
          if (!existsSync(bpContentFile))
            return reply.status(404).send("File not found");

          reply.type(contentType(assetFile) || "application/octet-stream");
          reply.header("ETag", cacheAssetsConfig[assetFile]);
          reply.header(
            "Cache-Control",
            "max-age=604800, must-revalidate, no-transform, stale-while-revalidate=86400, stale-if-error"
          );
          if (
            request.headers["if-none-match"] === cacheAssetsConfig[assetFile]
          ) {
            return reply.code(304).send();
          }
          return reply.status(200).send(createReadStream(bpContentFile));
        };

        let assetFiles = await this.walkFilePath(bpAssetsuiDir);
        for (let assetFile of assetFiles) {
          cacheAssetsConfig[assetFile] = await this.createMD5(
            join(bpAssetsuiDir, assetFile)
          );
          this.log.info(
            "BPUI Cache: /bpui/assets{assetFile} ({serviceName})",
            {
              assetFile: assetFile,
              serviceName,
            }
          );

          await this.fastify.get(`/bpui/assets${assetFile}`, (req, reply) =>
            requestAssetListener(assetFile, req as any, reply as any)
          );
        }
      }
    }
  }
  public override async init(): Promise<void> {
    this.webJwt.init(
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
      path.endsWith("/") ? path.substring(0, path.length - 1) : path,
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
      path.endsWith("/") ? path.substring(0, path.length - 1) : path,
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
      path.endsWith("/") ? path.substring(0, path.length - 1) : path,
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
      path.endsWith("/") ? path.substring(0, path.length - 1) : path,
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
    if (permissionRequired === "") {
      return {
        success: true,
        token,
        clientId: undefined,
        roles: undefined,
      };
    }
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
