import {
  ServiceCallable,
  ServicesBase,
  ServicesClient,
} from "@bettercorp/service-base";
import { MyPluginConfig } from "../../plugins/service-betterportal/sec.config";
import type {
  BetterPortalCallable,
  BetterPortalBasicEvents,
  BetterPortalEvents,
} from "../../plugins/service-betterportal/plugin";
import {
  PermissionAction,
  type BasePermission,
  type BetterPortalCapability,
  type BetterPortalCapabilityConfigurable,
  type BetterPortalCapabilityHandler,
  type FastifyBodyRequestHandler,
  type FastifyNoBodyRequestHandler,
  type MyPermissionRequired,
  FieldPermission,
} from "../../index";
import { EJWTTokenType } from "@bettercorp/service-base-plugin-web-server/lib/plugins/service-webjwt/sec.config";
import { Tools } from "@bettercorp/tools";

export class betterPortal extends ServicesClient<
  BetterPortalEvents,
  ServiceCallable,
  ServiceCallable,
  ServiceCallable,
  BetterPortalCallable,
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

  public async initBPUI(path?: string): Promise<void> {
    await this._plugin.callPluginMethod(
      "initBPUI",
      this._serviceName,
      path || this._pluginBase
    );
  }

  public async addCapability<
    Capability extends BetterPortalCapability,
    key extends { [key: number]: string }
  >(
    capability: BetterPortalCapabilityConfigurable,
    capabilityKey: key,
    capabilityHandler: BetterPortalCapabilityHandler<Capability, key>,
    permission: BasePermission | null
  ): Promise<void> {
    return await this._plugin.callPluginMethod(
      "addCapability",
      this._serviceName,
      capability,
      capabilityKey,
      capabilityHandler as any,
      permission
    );
  }

  public async emitEvent<T extends BetterPortalBasicEvents = any>(
    tenantId: string,
    category: string,
    action: string,
    meta: T
  ): Promise<void> {
    await this._plugin.emitEvent(
      "onEvent",
      this._plugin.pluginName,
      tenantId,
      category,
      action,
      meta
    );
  }

  public async _onBPEvent(listener: {
    (
      plugin: string,
      tenantId: string,
      category: string,
      action: string,
      meta: BetterPortalBasicEvents
    ): Promise<void>;
  }): Promise<void> {
    if (this._plugin.pluginName !== "service-betterportal-events")
      throw "cannot listen to events from any other service but the core portal service";
    // this is a forced listener
    await this._plugin.onEvent("onEvent", listener as any as never);
  }

  public async read<Path extends string>(
    path: Path,
    permission: MyPermissionRequired | null,
    listener: FastifyNoBodyRequestHandler<Path>,
    allowedTokenTypes: EJWTTokenType = EJWTTokenType.req
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "get",
      this._serviceName,
      path,
      permission === null
        ? null
        : {
            optional: permission.optional,
            permission: {
              action: PermissionAction.read,
              ...permission.permission,
            },
          },
      listener as FastifyNoBodyRequestHandler<string>,
      allowedTokenTypes
    );
  }

  public async create<Path extends string>(
    path: Path,
    permission: MyPermissionRequired | null,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "post",
      this._serviceName,
      path,
      permission === null
        ? null
        : {
            optional: permission.optional,
            permission: {
              action: PermissionAction.create,
              ...permission.permission,
            },
          },
      listener as FastifyBodyRequestHandler<string>
    );
  }

  public async execute<Path extends string>(
    path: Path,
    permission: MyPermissionRequired | null,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "put",
      this._serviceName,
      path,
      permission === null
        ? null
        : {
            optional: permission.optional,
            permission: {
              action: PermissionAction.execute,
              ...permission.permission,
            },
          },
      listener as FastifyBodyRequestHandler<string>
    );
  }

  public async delete<Path extends string>(
    path: Path,
    permission: MyPermissionRequired | null,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "delete",
      this._serviceName,
      path,
      permission === null
        ? null
        : {
            optional: permission.optional,
            permission: {
              action: PermissionAction.delete,
              ...permission.permission,
            },
          },
      listener as FastifyBodyRequestHandler<string>
    );
  }

  public async update<Path extends string>(
    path: Path,
    permission: MyPermissionRequired | null,
    listener: FastifyBodyRequestHandler<Path>
  ): Promise<void> {
    await this._plugin.callPluginMethod(
      "patch",
      this._serviceName,
      path,
      permission === null
        ? null
        : {
            optional: permission.optional,
            permission: {
              action: PermissionAction.update,
              ...permission.permission,
            },
          },
      listener as FastifyBodyRequestHandler<string>
    );
  }

  public rewriteObjectBasedOnPermissions<T extends Object | Array<TO> = any, TO = any>(
    fields: FieldPermission[],
    fieldPaths: Array<string> | undefined,
    object: T
  ): T {
    if (fieldPaths === undefined) return object;

    let removeFieldPaths: Array<string> = fields
      .filter((x) => fieldPaths.indexOf(x.fieldPath) < 0)
      .map((x) => x.fieldPath);

    let newObject = JSON.parse(JSON.stringify(object));
    for (let fieldPathToRewrite of removeFieldPaths) {
      if (Tools.isArray(newObject)) {
        newObject = newObject.map((x) => {
          return Tools.setUpdatedTemplatePathFinder(
            fieldPathToRewrite,
            null,
            x
          );
        });
      } else if (Tools.isObject(newObject)) {
        newObject = Tools.setUpdatedTemplatePathFinder(
          fieldPathToRewrite,
          null,
          newObject
        );
      } else {
        throw "cannot rewrite non object or array";
      }
    }

    return newObject;
  }
}
