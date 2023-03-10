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
import { existsSync, createReadStream, readdir, stat, readFileSync } from "fs";
import { createHash } from "crypto";
import { contentType } from "mime-types";
import type { ParamsFromPath } from "@bettercorp/service-base-plugin-web-server/lib/plugins/service-fastify/lib";

export interface BetterPortalBasicEvents {
  appId?: string;
  userId?: string;
}
export interface BetterPortalEvents extends ServiceCallable {
  onEvent(
    plugin: string,
    tenantId: string,
    category: string,
    action: string,
    meta: BetterPortalBasicEvents
  ): Promise<void>;
}
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
    BetterPortalEvents,
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
  private canCache: boolean = true;
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
  private walkFilePath(
    dir: string,
    passingBase: Array<string> = []
  ): Promise<Array<string>> {
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
              const passthrouBase = [file].concat(passingBase);
              self.walkFilePath(join(dir, file), passthrouBase).then((res) => {
                results = results.concat(
                  res.map((x) => passthrouBase.concat([x]).join("/"))
                );
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
    if (!this.canCache) {
      return true;
    }
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
  private async createMD5(filePath: string): Promise<string> {
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
    if (existsSync(bpuiDir)) {
      this.log.info("BPUI Enabled: {dir} ({serviceName})", {
        dir: bpuiDir,
        serviceName,
      });
      const specialityDirs = [
        {
          dir: "assets",
          path: join(bpuiDir, "./assets/"),
          allowedFileTypes: [/.*/],
        },
        {
          dir: "lib",
          path: join(bpuiDir, "./lib/"),
          allowedFileTypes: [/\w{1,}.js/],
          defaultExtension: "js",
          defaultFile: "index.js",
          notFoundSearchFunction: (dir: string): false | string => {
            const packageJsonFile = join(dir, "./index.js");
            if (!existsSync(packageJsonFile)) return false;
            return "index.js";
          },
        },
        {
          dir: "views",
          path: join(bpuiDir, "./views/"),
          allowedFileTypes: [/\w{1,}.vue/],
          defaultFile: "index.vue",
          defaultExtension: "vue",
        },
        {
          dir: "elib",
          path: join(bpuiDir, "./elib/"),
          allowedFileTypes: [/\w{1,}.js/],
          defaultExtension: "js",
          defaultFile: "index.js",
          notFoundSearchFunction: (dir: string): false | string => {
            const packageJsonFile = join(dir, "./package.json");
            if (!existsSync(packageJsonFile)) return false;
            const mainFile = JSON.parse(
              readFileSync(packageJsonFile).toString()
            ).main;
            if (!existsSync(join(dir, mainFile))) return false;
            return mainFile;
          },
        },
      ];

      this.get(
        serviceName,
        "/bpui/:assetKey/*",
        "*",
        async (
          reply,
          token,
          clientId,
          roles,
          params,
          query,
          checkCacheCanSendData,
          request
        ) => {
          let specDir = specialityDirs.filter((x) => x.dir === params.assetKey);
          let pathReplacementUrl = `${params.assetKey}/`;
          if (specDir.length !== 1) {
            /*await this.log.debug(
              "File requested with invalid spec [{spec}] - we'll try elib instead",
              { spec: params.assetKey }
            );
            specDir = specialityDirs.filter((x) => x.dir === "elib");
            pathReplacementUrl = "";*/
            return reply.status(404).send("File not found: XE00001");
          }
          const dir = specDir[0];
          let linePaths = request.url
            .split(`/bpui/${pathReplacementUrl}`)[1]
            .split("/");
          if (linePaths.length < 1)
            return reply
              .status(404)
              .send(`File not found: XE00002 (${linePaths})`);
          const requestedFileStored = linePaths.pop();
          let requestedFile = requestedFileStored;
          let redirect: false | string = false;
          linePaths = linePaths.map((x) =>
            Tools.cleanString(x, 255, CleanStringStrength.soft)
          );
          const onFileBase = join(dir.path, ...linePaths);
          if (!Tools.isString(requestedFile))
            return reply.status(404).send("File not found: XE00003");
          if (
            dir.allowedFileTypes.filter((y) => y.test(requestedFile!))
              .length === 0
          ) {
            console.log(
              "try default ext!" +
                join(dir.path, requestedFile + "." + dir.defaultExtension),
              Tools.isString(dir.defaultExtension)
            );
            if (
              Tools.isString(dir.defaultExtension) &&
              existsSync(
                join(dir.path, requestedFile + "." + dir.defaultExtension)
              )
            ) {
              console.log("try default ext! : OK");
              requestedFile = requestedFile + "." + dir.defaultExtension;
              redirect = requestedFile;
            } else if (
              Tools.isString(dir.defaultExtension) &&
              existsSync(
                join(onFileBase, requestedFile + "." + dir.defaultExtension)
              )
            ) {
              console.log("try default ext2! : OK");
              requestedFile = requestedFile + "." + dir.defaultExtension;
              redirect = linePaths.join('/') + '/'+ requestedFile;
            } else if (!Tools.isString(dir.defaultFile))
              return reply
                .status(404)
                .send(`File not found: XE00004 (${dir.dir}:${requestedFile})`);
            else {
              requestedFile = dir.defaultFile;
              redirect = dir.defaultFile;
            }
          }
          let onFilePath = join(onFileBase, requestedFile!);
          await this.log.debug(
            "BPUI Requested File: {onFilePath} (RP: {linePaths})(B: {onFileBase})(O: {requestedFileStored})(RD: {redirect})",
            {
              redirect,
              linePaths,
              onFilePath,
              onFileBase,
              requestedFileStored: requestedFileStored!,
            }
          );
          if (!existsSync(onFilePath)) {
            if (!Tools.isFunction(dir.notFoundSearchFunction))
              return reply.status(404).send("File not found: XE00005");
            let newFile = dir.notFoundSearchFunction(onFileBase);
            if (newFile === false) {
              newFile = dir.notFoundSearchFunction(
                join(onFileBase, requestedFileStored!)
              );
              if (newFile !== false)
                newFile = join(requestedFileStored!, newFile);
            }
            if (newFile === false)
              return reply
                .status(404)
                .send(
                  `File not found: XE00006 (${dir.dir}:${requestedFile}:${newFile})`
                );
            redirect = newFile;
            onFilePath = join(onFileBase, newFile);
          }
          if (redirect !== false) {
            return reply
              .status(302)
              .header("Location", `/bpui/${params.assetKey}/${redirect}`)
              .send();
          }
          let cacheHash = await this.createMD5(onFilePath);
          if (requestedFile.endsWith(".js"))
            reply.type("application/javascript");
          else if (requestedFile.endsWith(".vue"))
            reply.type("application/javascript");
          else if (requestedFile.endsWith(".css")) reply.type("text/css");
          else
            reply.type(contentType(onFilePath) || "application/octet-stream");

          if (
            checkCacheCanSendData(cacheHash, {
              cacheAbility: ReplyRequestCacheConfigAbility.all,
              maxAge: 60 * 60 * 24,
              revalidationSeconds: 60 * 60,
            })
          ) {
            let reader = createReadStream(onFilePath);
            return reply.status(200).send(reader);
          }
          return;
        },
        undefined,
        undefined,
        true,
        false
      );
    }
  }
  public override async init(): Promise<void> {
    this.canCache = await (await this.getPluginConfig()).canCache;
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

    let host = Tools.cleanString(
      request.headers.referer || request.headers.origin || "undefined",
      255,
      CleanStringStrength.url
    );
    if (host.indexOf("//") < 0) {
      this.log.warn("A client requested from ({host}) is invalid //", { host });
      return { success: false, code: 400, message: "Invalid request" };
    }
    host = host.split("//")[1];
    if (host.indexOf("/") < 0) {
      this.log.warn("A client requested from ({host}) is invalid /", { host });
      return { success: false, code: 400, message: "Invalid request" };
    }
    host = host.split("/")[0];
    host = host.toLowerCase();

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
