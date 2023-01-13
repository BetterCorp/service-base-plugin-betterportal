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
import {
  AuthToken,
  User_Client,
  FastifyRequestPath,
  FastifyNoBodyRequestHandler,
  FastifyBodyRequestHandler,
  ReplyRequestCacheConfig,
  ReplyRequestCacheConfigAbility,
} from "../../index";
import type { MyPluginConfig } from "./sec.config";
import path, { join } from "path";
import { existsSync, createReadStream, readdirSync, readdir, stat } from "fs";
import { createHash } from "crypto";
import { contentType } from "mime-types";
import type { ParamsFromPath } from "@bettercorp/service-base-plugin-web-server/lib/plugins/service-fastify/lib";

export interface BSBFastifyCallable extends ServiceCallable {
  initBPUI(serviceName: string, path: string): Promise<void>;
  get<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: FastifyNoBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean,
    require2FA?: boolean
  ): Promise<void>;

  post<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean,
    require2FA?: boolean
  ): Promise<void>;

  put<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean,
    require2FA?: boolean
  ): Promise<void>;

  delete<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes?: EJWTTokenType,
    optionalAuth?: boolean,
    require2FA?: boolean
  ): Promise<void>;

  patch<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
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
          //file = path.resolve(dir, file);
          stat(path.resolve(dir, file), (err, stat) => {
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

  private canSendNewDocumentCache(
    request: FastifyRequestPath<string>,
    reply: FastifyReply,
    etag: string,
    config: ReplyRequestCacheConfig
  ): boolean {
    reply.header("ETag", etag);
    if (reply.hasHeader("Cache-Control")) reply.removeHeader("Cache-Control");

    let headerToAdd: Array<string> = [
      "no-transform",
      "must-revalidate",
      config.cacheAbility,
    ];
    if (config.immutable === true) headerToAdd.push("immutable");
    if (config.maxAge !== undefined && config.maxAge >= 0)
      headerToAdd.push(`max-age=${config.maxAge}`);
    if (
      config.revalidationSeconds !== undefined &&
      config.revalidationSeconds >= 0
    )
      headerToAdd.push(`stale-while-revalidate=${config.revalidationSeconds}`);
    reply.header("Cache-Control", headerToAdd.join(","));
    if (process.env.NODE_ENV !== "production") return true;
    if (request.headers["if-none-match"] === etag) {
      reply.code(304).send();
      return false;
    }
    return true;
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
    const bpLibuiDir = join(bpuiDir, "./lib/");
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
        reply: FastifyReply,
        request: FastifyRequestPath<string>
      ) => {
        if (cacheConfig[oappName] === undefined)
          return reply.status(404).send("File not found");
        if (
          [".js", ".css", ".vue"].filter((x) => omoduleName.indexOf(x) > 0)
            .length === 0
        )
          return reply.status(404).send("File not found");
        if (cacheConfig[oappName][omoduleName] === undefined)
          return reply.status(404).send("File not found");
        const bpContentFile = join(bpuiDir, `./${oappName}/${omoduleName}`);
        if (!existsSync(bpContentFile))
          return reply.status(404).send("File not found");

        if (omoduleName.endsWith(".js")) reply.type("application/javascript");
        else if (omoduleName.endsWith(".vue"))
          reply.type("application/javascript");
        else if (omoduleName.endsWith(".css")) reply.type("text/css");
        else return reply.status(404).send("File type not found");

        if (
          this.canSendNewDocumentCache(
            request,
            reply,
            cacheConfig[oappName][omoduleName],
            {
              cacheAbility: ReplyRequestCacheConfigAbility.all,
              maxAge: 60 * 60 * 24,
              revalidationSeconds: 60 * 60,
            }
          )
        )
          return reply.status(200).send(createReadStream(bpContentFile));
        return;
      };

      for (let appName of readdirSync(bpuiDir, { withFileTypes: true })) {
        if (!appName.isDirectory()) continue;
        if (appName.name === "assets") continue;
        if (appName.name === "lib") continue;
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
            async (reply, params, query, req) =>
              await requestListener(
                appName.name,
                moduleName.name,
                reply,
                req as FastifyRequestPath<string>
              )
          );
        }
      }

      if (existsSync(bpLibuiDir)) {
        let libCacheConfig: any = {};
        const libRequestListener = (
          libName: string,
          reply: FastifyReply,
          request: FastifyRequestPath<string>
        ) => {
          if (libCacheConfig[libName] === undefined)
            return reply.status(404).send("File not found");
          if (libCacheConfig[libName] === undefined)
            return reply.status(404).send("File not found");
          const bpContentFile = join(bpLibuiDir, `./${libName}.js`);
          if (!existsSync(bpContentFile))
            return reply.status(404).send("File not found");

          reply.type("application/javascript");

          if (
            this.canSendNewDocumentCache(
              request,
              reply,
              libCacheConfig[libName],
              {
                cacheAbility: ReplyRequestCacheConfigAbility.all,
                maxAge: 60 * 60 * 24,
                revalidationSeconds: 60 * 60,
              }
            )
          )
            return reply.status(200).send(createReadStream(bpContentFile));
          return;
        };

        for (let libName of readdirSync(bpLibuiDir, { withFileTypes: true })) {
          if (!libName.isFile()) continue;
          libCacheConfig[libName.name] = await this.createMD5(
            join(bpLibuiDir, libName.name)
          );
          this.log.info("BPUI Cache: /bpui/lib/{libName}({serviceName})", {
            libName: libName.name,
            serviceName,
          });

          await this.fastify.get(
            `/bpui/lib/${libName.name.split(".")[0]}(\.js||)`,
            async (reply, params, query, req) =>
              await libRequestListener(
                libName.name,
                reply,
                req as FastifyRequestPath<string>
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
          reply: FastifyReply,
          request: FastifyRequestPath<string>
        ) => {
          if (cacheAssetsConfig[assetFile] === undefined)
            return reply.status(404).send("File not found");
          const bpContentFile = join(bpAssetsuiDir, `./${assetFile}`);
          if (!existsSync(bpContentFile))
            return reply.status(404).send("File not found");

          if (
            this.canSendNewDocumentCache(
              request,
              reply,
              cacheAssetsConfig[assetFile],
              {
                cacheAbility: ReplyRequestCacheConfigAbility.all,
                maxAge: 60 * 60 * 24,
                revalidationSeconds: 60 * 60,
              }
            )
          ) {
            reply.type(contentType(assetFile) || "application/octet-stream");
            return reply.status(200).send(createReadStream(bpContentFile));
          }
          return;
        };

        let assetFiles = await this.walkFilePath(bpAssetsuiDir);
        for (let assetFile of assetFiles) {
          cacheAssetsConfig[assetFile] = await this.createMD5(
            join(bpAssetsuiDir, assetFile)
          );
          this.log.info(
            "BPUI Cache: /bpui/assets/{assetFile} ({serviceName})",
            {
              assetFile: assetFile,
              serviceName,
            }
          );

          await this.fastify.get(
            `/bpui/assets/${assetFile}`,
            async (reply, params, query, req) =>
              await requestAssetListener(
                assetFile,
                reply,
                req as FastifyRequestPath<string>
              )
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
    listener: FastifyNoBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.get(path, async (reply, params, query, request) => {
      let handleResponse = await self.handleRequest(
        path,
        serviceName,
        permissionRequired,
        require2FA,
        roles || [],
        request as FastifyRequestPath<string>,
        reply,
        allowedTokenTypes
      );
      if (!handleResponse.success) {
        if (optionalAuth === true)
          return await listener(
            reply,
            null,
            null,
            null,
            params,
            query,
            (eTag: string, config: ReplyRequestCacheConfig) =>
              self.canSendNewDocumentCache(
                request as FastifyRequestPath<string>,
                reply,
                eTag,
                config
              ),
            request
          );
        return reply
          .status(handleResponse.code || 400)
          .send(handleResponse.message || "Server Error");
      }
      return await listener(
        reply,
        handleResponse.token!,
        handleResponse.clientId!,
        handleResponse.roles!,
        params,
        query,
        (eTag: string, config: ReplyRequestCacheConfig) =>
          self.canSendNewDocumentCache(
            request as FastifyRequestPath<string>,
            reply,
            eTag,
            config
          ),
        request
      );
    });
  }

  public async post<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.post(path, async (reply, params, query, body, request) => {
      let handleResponse = await self.handleRequest(
        path,
        serviceName,
        permissionRequired,
        require2FA,
        roles || [],
        request as FastifyRequestPath<string>,
        reply,
        allowedTokenTypes
      );
      if (!handleResponse.success) {
        if (optionalAuth === true)
          return await listener(
            reply,
            null,
            null,
            null,
            params,
            body,
            query,
            (eTag: string, config: ReplyRequestCacheConfig) =>
              self.canSendNewDocumentCache(
                request as FastifyRequestPath<string>,
                reply,
                eTag,
                config
              ),
            request
          );
        return reply
          .status(handleResponse.code || 400)
          .send(handleResponse.message || "Server Error");
      }
      return await listener(
        reply,
        handleResponse.token!,
        handleResponse.clientId!,
        handleResponse.roles!,
        params as ParamsFromPath<Path>,
        body,
        query,
        (eTag: string, config: ReplyRequestCacheConfig) =>
          self.canSendNewDocumentCache(
            request as FastifyRequestPath<string>,
            reply,
            eTag,
            config
          ),
        request
      );
    });
  }

  public async put<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.put<any>(
      path.endsWith("/") ? path.substring(0, path.length - 1) : path,
      async (reply, params, query, body, request) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          permissionRequired,
          require2FA,
          roles || [],
          request as FastifyRequestPath<string>,
          reply,
          allowedTokenTypes
        );
        if (!handleResponse.success) {
          if (optionalAuth === true)
            return await listener(
              reply,
              null,
              null,
              null,
              params,
              body,
              query,
              (eTag: string, config: ReplyRequestCacheConfig) =>
                self.canSendNewDocumentCache(
                  request as FastifyRequestPath<string>,
                  reply,
                  eTag,
                  config
                ),
              request
            );
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          reply,
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.roles!,
          params as ParamsFromPath<Path>,
          body,
          query,
          (eTag: string, config: ReplyRequestCacheConfig) =>
            self.canSendNewDocumentCache(
              request as FastifyRequestPath<string>,
              reply,
              eTag,
              config
            ),
          request
        );
      }
    );
  }

  public async delete<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.delete<any>(
      path.endsWith("/") ? path.substring(0, path.length - 1) : path,
      async (reply, params, query, body, request) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          permissionRequired,
          require2FA,
          roles || [],
          request as FastifyRequestPath<string>,
          reply,
          allowedTokenTypes
        );
        if (!handleResponse.success) {
          if (optionalAuth === true)
            return await listener(
              reply,
              null,
              null,
              null,
              params,
              body,
              query,
              (eTag: string, config: ReplyRequestCacheConfig) =>
                self.canSendNewDocumentCache(
                  request as FastifyRequestPath<string>,
                  reply,
                  eTag,
                  config
                ),
              request
            );
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          reply,
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.roles!,
          params as ParamsFromPath<Path>,
          body,
          query,
          (eTag: string, config: ReplyRequestCacheConfig) =>
            self.canSendNewDocumentCache(
              request as FastifyRequestPath<string>,
              reply,
              eTag,
              config
            ),
          request
        );
      }
    );
  }

  public async patch<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: string,
    listener: FastifyBodyRequestHandler<Path>,
    roles?: Array<string>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req,
    optionalAuth: boolean = false,
    require2FA: boolean = false
  ): Promise<void> {
    const self = this;
    this.fastify.patch<Path>(
      path,
      async (reply, params, query, body, request) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          permissionRequired,
          require2FA,
          roles || [],
          request as FastifyRequestPath<string>,
          reply,
          allowedTokenTypes
        );
        if (!handleResponse.success) {
          if (optionalAuth === true)
            return await listener(
              reply,
              null,
              null,
              null,
              params,
              body,
              query,
              (eTag: string, config: ReplyRequestCacheConfig) =>
                self.canSendNewDocumentCache(
                  request as FastifyRequestPath<string>,
                  reply,
                  eTag,
                  config
                ),
              request
            );
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          reply,
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.roles!,
          params as ParamsFromPath<Path>,
          body,
          query,
          (eTag: string, config: ReplyRequestCacheConfig) =>
            self.canSendNewDocumentCache(
              request as FastifyRequestPath<string>,
              reply,
              eTag,
              config
            ),
          request
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
    reply: FastifyReply,
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

    const host = Tools.cleanString(
      request.headers.referer || request.headers.origin || "undefined",
      255,
      CleanStringStrength.url
    )
      .split("//")[1]
      .split("/")[0]
      .toLowerCase();

    this.log.info("[REQUEST] ({host}){URL}", { host, URL: path });
    reply.header(
      "Cache-Control",
      "no-store, no-cache, max-age=0, must-revalidate"
    );
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
    if (token.host !== host)
      return { success: false, code: 401, message: "Invalid app" };
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
