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
//import { defineAbility } from '@casl/ability';
import { CleanStringStrength, Tools } from "@bettercorp/tools/lib/Tools";
import { FastifyReply } from "fastify";
import {
  AuthToken,
  FastifyRequestPath,
  FastifyNoBodyRequestHandler,
  FastifyBodyRequestHandler,
  ReplyRequestCacheConfig,
  ReplyRequestCacheConfigAbility,
  ClientPermissions,
  BetterPortalCapabilityHandler,
  BetterPortalCapability,
  PermissionRequired,
  BasePermission,
  BetterPortalCapabilityInternal,
  BetterPortalCapabilityConfigurableAuthed,
  BetterPortalCapabilityConfigurable,
  UIService,
  PermissionAction,
  PermissionDefinition,
} from "../../index";
import type { MyPluginConfig } from "./sec.config";
import path, { join, sep } from "path";
import {
  existsSync,
  createReadStream,
  readdir,
  stat,
  readFileSync,
  readdirSync,
} from "fs";
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
export interface BetterPortalCallable extends ServiceCallable {
  addCapability<
    Capability extends BetterPortalCapability,
    key extends { [key: string]: string }
  >(
    serviceName: string,
    capability: Capability,
    capabilityKey: key,
    capabilityHandler: BetterPortalCapabilityHandler<Capability, key>,
    permission: BasePermission | null
  ): Promise<void>;
  initBPUI(serviceName: string, path: string): Promise<void>;

  get<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: PermissionRequired,
    listener: FastifyNoBodyRequestHandler<Path>,
    allowedTokenTypes?: EJWTTokenType
  ): Promise<void>;

  post<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: PermissionRequired,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void>;

  put<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: PermissionRequired,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void>;

  delete<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: PermissionRequired,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void>;

  patch<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: PermissionRequired,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void>;
}

export class Service
  extends ServicesBase<
    BetterPortalEvents,
    ServiceCallable,
    ServiceCallable,
    ServiceCallable,
    BetterPortalCallable,
    MyPluginConfig
  >
  implements BetterPortalCallable
{
  public override readonly initAfterPlugins: string[] = [
    "service-fastify",
    "service-webjwt",
  ];
  public override readonly runBeforePlugins: string[] = ["service-fastify"];

  private fastify: fastify;
  private webJwt!: webJwtLocal;
  private canCache: boolean = true;
  private capabilities: Array<{
    capability: BetterPortalCapabilityConfigurable;
    capabilityKey: { [key: string]: string };
    capabilityHandler: BetterPortalCapabilityHandler<
      BetterPortalCapabilityConfigurable,
      { [key: string]: string }
    >;
    permission: BasePermission | null;
  }> = [];
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
  //private readonly _service2FAMaxTime = 5 * 60 * 1000;
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

      for (let viewDir of specialityDirs.filter((x) => x.dir === "views")) {
        await this.addCapability<
          BetterPortalCapabilityInternal.uiServices,
          { views: "views" }
        >(
          serviceName,
          BetterPortalCapabilityInternal.uiServices,
          { views: "views" },
          async (token, clientId, key, query?: { theme: string }) => {
            if (key !== "views") return [];
            let uis: Array<UIService> = [];
            let themes = readdirSync(viewDir.path);
            if (Tools.isObject(query) && Tools.isString(query.theme))
              themes = themes.filter((x) => x === query.theme);
            for (let theme of themes.filter((x) =>
              existsSync(join(viewDir.path, x, "./definition.json"))
            )) {
              let definitionFile = join(
                viewDir.path,
                theme,
                "./definition.json"
              );
              let defitions = JSON.parse(
                readFileSync(definitionFile).toString()
              ) as Array<{
                name: string;
                description: string;
                path: string;
                requiresAdditionalServices: Array<string>;
                requiresPermissions: Array<string>;
              }>;
              for (let definition of defitions) {
                uis.push({
                  name: definition.name,
                  description: definition.description,
                  path: definition.path,
                  requiresAdditionalServices:
                    definition.requiresAdditionalServices,
                  requiresPermissions: definition.requiresPermissions,
                  themeId: theme,
                });
              }
            }
            return uis;
          },
          null
        );
      }

      this.get(
        serviceName,
        "/bpui/:assetKey/*",
        null,
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
            /*console.log(
              "try default ext!" +
                join(dir.path, requestedFile + "." + dir.defaultExtension),
              Tools.isString(dir.defaultExtension)
            );*/
            if (
              Tools.isString(dir.defaultExtension) &&
              existsSync(
                join(dir.path, requestedFile + "." + dir.defaultExtension)
              )
            ) {
              //console.log("try default ext! : OK");
              requestedFile = requestedFile + "." + dir.defaultExtension;
              redirect = requestedFile;
            } else if (
              Tools.isString(dir.defaultExtension) &&
              existsSync(
                join(onFileBase, requestedFile + "." + dir.defaultExtension)
              )
            ) {
              //console.log("try default ext2! : OK");
              requestedFile = requestedFile + "." + dir.defaultExtension;
              redirect = linePaths.join("/") + "/" + requestedFile;
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
                newFile = join(
                  requestedFileStored!,
                  "./",
                  onFileBase.split(`/${dir.dir}/`)[1],
                  newFile
                );
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
          else {
            let fileSpl = onFilePath.split(sep);
            let cType =
              fileSpl.length > 1
                ? contentType(fileSpl[fileSpl.length - 1])
                : false;
            if ((cType || "").indexOf("/bpui/") >= 0) cType = false;
            reply.type(cType || "application/octet-stream");
          }

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
        }
      );
    }
  }
  public async addCapability<
    Capability extends BetterPortalCapability,
    key extends { [key: string]: string }
  >(
    serviceName: string,
    capability: Capability,
    capabilityKey: key,
    capabilityHandler: BetterPortalCapabilityHandler<Capability, key>,
    permission: BasePermission | null
  ): Promise<void> {
    await this.log.info(
      "Adding new capability [{capability}] for [{serviceName}]",
      {
        capability: capability,
        serviceName: serviceName,
      }
    );
    this.capabilities.push({
      capability: capability as any,
      capabilityKey,
      capabilityHandler: capabilityHandler as any,
      permission,
    });
  }
  public override async init(): Promise<void> {
    const self = this;
    this.canCache = await (await this.getPluginConfig()).canCache;
    await this.webJwt.init(
      {
        bearerStr: "Bearer",
        queryKey: "auth",
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
    await this.get(
      "betterportal",
      "/bp/capabilities/",
      null,
      async (
        reply,
        token,
        clientId,
        fields,
        params,
        query,
        checkCacheCanSendData,
        req
      ): Promise<any> => {
        const hash = createHash("md5");
        let capas: Record<string, Array<string>> = {};
        for (let capa of self.capabilities) {
          capas[capa.capability] = capas[capa.capability] || [];
          for (let capaKey of Object.keys(capa.capabilityKey)) {
            if (capas[capa.capability].indexOf(capaKey) >= 0) continue;
            capas[capa.capability].push(capaKey);
          }
        }
        let keyhash = Object.keys(capas)
          .sort((a, b) => a.localeCompare(b))
          .map((x) => {
            return (
              x + ":" + capas[x].sort((a, b) => a.localeCompare(b)).join(",")
            );
          })
          .join("|");
        hash.update(Buffer.from(keyhash, "utf8"));
        if (
          this.canSendNewDocumentCache(req as any, reply, hash.digest("hex"), {
            cacheAbility: ReplyRequestCacheConfigAbility.all,
            maxAge: 60 * 60 * 24,
          })
        ) {
          return reply.status(202).send(capas);
        }
      }
    );
    await this.fastify.get(
      "/bp/capabilities/:capability/:key/",
      async (reply, params, query, request) => {
        if (!Tools.isString(params.key))
          return reply.status(400).send("Invalid request");
        let availCapabilities: Array<{
          internal: boolean;
          requireAuth: boolean;
          capability: BetterPortalCapabilityConfigurable;
          capabilityKey: { [key: string]: string };
          capabilityHandler: BetterPortalCapabilityHandler<
            BetterPortalCapabilityConfigurable,
            { [key: string]: string }
          >;
          permission: BasePermission | null;
        }> = [];

        for (let cap of self.capabilities) {
          if (cap.capability !== params.capability) continue;
          if (Tools.isNullOrUndefined(cap.capabilityKey[params.key])) continue;
          availCapabilities.push({
            ...cap,
            internal:
              Object.keys(BetterPortalCapabilityInternal).indexOf(
                cap.capability
              ) >= 0,
            requireAuth:
              Object.keys(BetterPortalCapabilityConfigurableAuthed).indexOf(
                cap.capability
              ) >= 0,
          });
        }

        let responses: Array<any> = [];
        if (availCapabilities.length === 0) {
          return reply.status(404).send("No Capability found");
        }
        for (let cap of availCapabilities) {
          if (cap.internal) {
            let res = await cap.capabilityHandler(
              null,
              null,
              cap.capabilityKey[params.key],
              query
            );
            if (Tools.isNullOrUndefined(res)) {
              return reply.status(500).send("Server Error");
            }
            responses.push(res);
            continue;
          }

          let handleResponse = await self.handleRequest(
            "/bp/capabilities/:capability/:key/",
            "betterportal",
            request as FastifyRequestPath<string>,
            reply,
            cap.requireAuth
              ? {
                  optional: cap.permission === null,
                  permission: cap.permission as any, // we dont care about the actual permission at this point ...
                }
              : null
          );
          if (!handleResponse.success) {
            return reply
              .status(handleResponse.code || 400)
              .send(handleResponse.message || "Server Error");
          }
          let res = await cap.capabilityHandler(
            handleResponse.token ?? null,
            handleResponse.clientId ?? null,
            cap.capabilityKey[params.key],
            query
          );
          if (Tools.isNullOrUndefined(res)) {
            return reply.status(500).send("Server Error");
          }
          responses.push(res);
        }

        return reply.status(202).send(responses.flat());
      }
    );
  }

  public async get<Path extends string>(
    serviceName: string,
    path: Path,
    permissionRequired: PermissionRequired,
    listener: FastifyNoBodyRequestHandler<Path>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req
  ): Promise<void> {
    const self = this;
    if (permissionRequired !== null) {
      this.addCapability(
        serviceName,
        BetterPortalCapabilityInternal.permissions,
        PermissionAction,
        async (token, clientId, key, query) => {
          let definition: Array<PermissionDefinition> = [
            {
              path: path,
              pathMethod: "GET",
              ...permissionRequired.permission,
            },
          ];
          return definition;
        },
        null
      );
    }
    this.fastify.get(path, async (reply, params, query, request) => {
      let handleResponse = await self.handleRequest(
        path,
        serviceName,
        request as FastifyRequestPath<string>,
        reply,
        permissionRequired,
        allowedTokenTypes
      );
      if (!handleResponse.success) {
        return reply
          .status(handleResponse.code || 400)
          .send(handleResponse.message || "Server Error");
      }
      return await listener(
        reply,
        handleResponse.token!,
        handleResponse.clientId!,
        handleResponse.fields,
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
    permissionRequired: PermissionRequired,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void> {
    const self = this;
    if (permissionRequired !== null) {
      this.addCapability(
        serviceName,
        BetterPortalCapabilityInternal.permissions,
        PermissionAction,
        async (token, clientId, key, query) => {
          let definition: Array<PermissionDefinition> = [
            {
              path: path,
              pathMethod: "GET",
              ...permissionRequired.permission,
            },
          ];
          return definition;
        },
        null
      );
    }
    this.fastify.post(path, async (reply, params, query, body, request) => {
      let handleResponse = await self.handleRequest(
        path,
        serviceName,
        request as FastifyRequestPath<string>,
        reply,
        permissionRequired
      );
      if (!handleResponse.success) {
        return reply
          .status(handleResponse.code || 400)
          .send(handleResponse.message || "Server Error");
      }
      return await listener(
        reply,
        handleResponse.token!,
        handleResponse.clientId!,
        handleResponse.fields,
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
    permissionRequired: PermissionRequired,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void> {
    const self = this;
    if (permissionRequired !== null) {
      this.addCapability(
        serviceName,
        BetterPortalCapabilityInternal.permissions,
        PermissionAction,
        async (token, clientId, key, query) => {
          let definition: Array<PermissionDefinition> = [
            {
              path: path,
              pathMethod: "GET",
              ...permissionRequired.permission,
            },
          ];
          return definition;
        },
        null
      );
    }
    this.fastify.put<any>(
      path.endsWith("/") ? path.substring(0, path.length - 1) : path,
      async (reply, params, query, body, request) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          request as FastifyRequestPath<string>,
          reply,
          permissionRequired
        );
        if (!handleResponse.success) {
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          reply,
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.fields,
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
    permissionRequired: PermissionRequired,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void> {
    const self = this;
    if (permissionRequired !== null) {
      this.addCapability(
        serviceName,
        BetterPortalCapabilityInternal.permissions,
        PermissionAction,
        async (token, clientId, key, query) => {
          let definition: Array<PermissionDefinition> = [
            {
              path: path,
              pathMethod: "GET",
              ...permissionRequired.permission,
            },
          ];
          return definition;
        },
        null
      );
    }
    this.fastify.delete<any>(
      path.endsWith("/") ? path.substring(0, path.length - 1) : path,
      async (reply, params, query, body, request) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          request as FastifyRequestPath<string>,
          reply,
          permissionRequired
        );
        if (!handleResponse.success) {
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          reply,
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.fields,
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
    permissionRequired: PermissionRequired,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void> {
    const self = this;
    if (permissionRequired !== null) {
      this.addCapability(
        serviceName,
        BetterPortalCapabilityInternal.permissions,
        PermissionAction,
        async (token, clientId, key, query) => {
          let definition: Array<PermissionDefinition> = [
            {
              path: path,
              pathMethod: "GET",
              ...permissionRequired.permission,
            },
          ];
          return definition;
        },
        null
      );
    }
    this.fastify.patch<Path>(
      path,
      async (reply, params, query, body, request) => {
        let handleResponse = await self.handleRequest(
          path,
          serviceName,
          request as FastifyRequestPath<string>,
          reply,
          permissionRequired
        );
        if (!handleResponse.success) {
          return reply
            .status(handleResponse.code || 400)
            .send(handleResponse.message || "Server Error");
        }
        return await listener(
          reply,
          handleResponse.token!,
          handleResponse.clientId!,
          handleResponse.fields,
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
    request: FastifyRequestPath<"/">,
    reply: FastifyReply,
    permissionRequired: PermissionRequired,
    tokenType: EJWTTokenType = EJWTTokenType.req
  ): Promise<{
    success: boolean;
    code?: number;
    message?: string;
    token?: AuthToken;
    clientId?: string;
    fields?: Array<string>;
  }> {
    let token: AuthToken;

    let host = Tools.cleanString(
      request.headers.referer || request.headers.origin || "undefined",
      255,
      CleanStringStrength.url
    );
    if (host.indexOf("//") < 0) {
      await this.log.warn(
        "A client requested from ({host}) is invalid /1/ (referer:{referer})(origin:{origin})",
        {
          host,
          referer: request.headers.referer as any,
          origin: request.headers.origin as any,
        }
      );
      console.log(request.headers);
      return { success: false, code: 400, message: "Invalid request" };
    }
    host = host.split("//")[1];
    if (host.indexOf("/") < 0) {
      await this.log.warn(
        "A client requested from ({host}) is invalid /2/ (referer:{referer})(origin:{origin})",
        {
          host,
          referer: request.headers.referer as any,
          origin: request.headers.origin as any,
        }
      );
      return { success: false, code: 400, message: "Invalid request" };
    }
    host = host.split("/")[0];
    host = host.toLowerCase();

    await this.log.info("[REQUEST] ({host}){URL} [{tokenType}]", {
      host,
      URL: path,
      tokenType,
    });
    reply.header(
      "Cache-Control",
      "no-store, no-cache, max-age=0, must-revalidate"
    );
    if (permissionRequired === null) {
      return {
        success: true,
        token: undefined,
        clientId: undefined,
        fields: undefined,
      };
    }
    try {
      let tempToken: AuthToken | boolean | null =
        await this.webJwt.verifyWebRequest<AuthToken>(request, tokenType);
      if (tempToken === null)
        return { success: false, code: 401, message: "No auth" };
      if (tempToken === false)
        return { success: false, code: 401, message: "Invalid auth" };
      if (tempToken === true)
        return { success: false, code: 401, message: "Invalid token" };
      token = tempToken;
    } catch (Exc) {
      return { success: false, code: 403, message: "Server error" };
    }

    if (Tools.isNullOrUndefined(token))
      return { success: false, code: 401, message: "Invalid token" };
    if (Tools.isNullOrUndefined(request.params))
      return { success: false, code: 401, message: "Invalid path" };
    /*if (token.host !== host)
      return { success: false, code: 401, message: "Invalid app" };*/

    if (permissionRequired.optional) {
      // Require a logged in user, but don't require any permissions
      return {
        success: true,
        token,
        clientId: undefined,
        fields: permissionRequired.permission.fields
          ? permissionRequired.permission.fields.map((x) => x.fieldPath)
          : undefined,
      };
    }

    if (
      Tools.isNullOrUndefined(token.clientId) ||
      Tools.isNullOrUndefined(token.clientPermissions)
    )
      return { success: false, code: 403, message: "Invalid client" };

    if (
      this._userHasPermission(
        token.clientPermissions,
        serviceName,
        permissionRequired.permission
      )
    ) {
      return {
        success: true,
        token,
        clientId: token.clientId!,
      };
    }
    return { success: false, code: 403, message: "No permissions" };
  }

  private _userHasPermission(
    permissions: ClientPermissions,
    serviceName: string,
    permissionRequired: BasePermission
  ): { permission: boolean; fields?: Array<string> } {
    if (Tools.isArray(permissions._)) {
      if (permissions._.indexOf("root") >= 0) {
        return {
          permission: true,
          fields: Tools.isNullOrUndefined(permissionRequired.fields)
            ? []
            : permissionRequired.fields.map((x) => x.fieldPath),
        }; // defining a service in root gives full root permissions to the service
      }
      if (permissions._.indexOf(serviceName.toLowerCase()) >= 0) {
        return {
          permission: true,
          fields: Tools.isNullOrUndefined(permissionRequired.fields)
            ? []
            : permissionRequired.fields.map((x) => x.fieldPath),
        }; // defining a service in root gives full root permissions to the service
      }
    }
    if (Tools.isArray(permissions[serviceName.toLowerCase()])) {
      let permissionsList = permissions[serviceName.toLowerCase()].filter(
        (x) => x.indexOf(`${permissionRequired.id}:`) === 0
      );
      if (permissionsList.length === 0) return { permission: false };
      let availPerms = this._getUserPermissionFields(
        permissions,
        permissionsList,
        serviceName,
        permissionRequired
      );
      if (availPerms === false) return { permission: false };
      return { permission: true, fields: availPerms };
    }
    return { permission: false };
  }

  private _getUserPermissionFields(
    permissions: ClientPermissions,
    permissionsList: Array<string>,
    serviceName: string,
    permissionRequired: BasePermission
  ): Array<string> | false {
    if (!Tools.isArray(permissions[serviceName.toLowerCase()]))
      throw "Service permissions should be an array";
    let fields = permissionRequired.fields ?? [];

    if (
      permissionsList.filter(
        (x) =>
          x.indexOf(
            `${permissionRequired.id}:${permissionRequired.action}:`
          ) === 0
      ).length > 0
    ) {
      if (
        permissionsList.filter(
          (x) =>
            x.indexOf(
              `${permissionRequired.id}:${permissionRequired.action}:*`
            ) === 0
        ).length > 0
      )
        return fields.map((x) => x.fieldPath);
      return permissionsList
        .filter(
          (x) =>
            x.indexOf(
              `${permissionRequired.id}:${permissionRequired.action}:`
            ) === 0
        )
        .map((x) => x.split(":")[2])
        .filter((x) => fields.find((y) => y.id === x) !== undefined)
        .map((x) => fields.find((y) => y.id === x)!.fieldPath);
    }
    if (
      permissionsList.filter(
        (x) => x.indexOf(`${permissionRequired.id}:*:`) === 0
      ).length > 0
    )
      return fields.map((x) => x.fieldPath);
    return false;
  }
}
