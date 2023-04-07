import { ParamsFromPath } from "@bettercorp/service-base-plugin-web-server/lib/plugins/service-fastify/lib";
import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import {
  FastifyRequest,
  FastifyReply,
  RouteGenericInterface,
  RawServerDefault,
  FastifyBaseLogger,
  FastifySchema,
  FastifyTypeProviderDefault,
} from "fastify";
import { IncomingMessage } from "http";

export interface Searchable {
  id: string;
  pathkey: string;
  searchableFields: Record<string, string>;
}
export enum ChangelogItemType {
  fixed = "fixed",
  added = "added",
  changed = "changed",
  removed = "removed",
  deprecated = "deprecated",
  security = "security",
}
export interface ChangelogItem {
  date: number;
  changes: Array<{
    notes: string;
    type: ChangelogItemType;
  }>;
}
export interface Setting {
  id: string;
  name: string;
  description: string;
  type: "string" | "int" | "float" | "boolean";
  default: string | number | boolean;
  required: boolean;
  nullable: boolean;
}
export enum BetterPortalCapabilityConfigurableAuthed {
  searchAuthed = "searchAuthed",
  searchCacheAuthed = "searchCacheAuthed",
  settingsAuthed = "settingsAuthed",
}
export enum BetterPortalCapabilityConfigurablePublic {
  search = "search",
  searchCache = "searchCache",
  changelog = "changelog",
  settings = "settings",
}
//export type BetterPortalCapabilityConfigurable = BetterPortalCapabilityConfigurablePublic | BetterPortalCapabilityConfigurableAuthed;
//export const BetterPortalCapabilityConfigurable = { ...BetterPortalCapabilityConfigurablePublic , ...BetterPortalCapabilityConfigurableAuthed};
//export type BetterPortalCapabilityConfigurable = keyof typeof BetterPortalCapabilityConfigurable;

export type BetterPortalCapabilityReturnConfigurable<
  Capability extends BetterPortalCapability
> = Capability extends BetterPortalCapabilityConfigurablePublic.search
  ? Array<Searchable> // search with param request
  : Capability extends BetterPortalCapabilityConfigurableAuthed.searchAuthed
  ? Array<Searchable> // search with param request (authed)
  : Capability extends BetterPortalCapabilityConfigurablePublic.searchCache
  ? Array<Searchable> // cache search, client side search
  : Capability extends BetterPortalCapabilityConfigurableAuthed.searchCacheAuthed
  ? Array<Searchable> // cache search, client side search (authed)
  : Capability extends BetterPortalCapabilityConfigurablePublic.changelog
  ? Array<ChangelogItem>
  : Capability extends BetterPortalCapabilityConfigurablePublic.settings
  ? Array<Setting>
  : Capability extends BetterPortalCapabilityConfigurableAuthed.settingsAuthed
  ? Array<Setting>
  : never;

export enum PermissionAction {
  read = "read", // GET
  create = "create", // POST
  update = "update", // PATCH
  delete = "delete", // DELETE
  execute = "execute", // PUT
}
export interface FieldPermission {
  id: string;
  fieldPath: string;
  name: string;
  description?: string;
}
export interface BasePermissionPartial {
  id: string;
  name: string;
  description?: string;
  require2FA: boolean;
  fields?: Array<FieldPermission>;
}
export interface BasePermission extends BasePermissionPartial {
  action: PermissionAction;
}
export interface RequestPermission {
  action: PermissionAction;
  path: string;
  pathMethod: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
}
export type MyPermissionRequired = {
  permission: BasePermissionPartial;
  optional: boolean;
} | null;
export type PermissionRequired = {
  permission: BasePermission;
  optional: boolean;
} | null;
export interface UIService {
  name: string;
  description: string;
  path: string;
  themeId: string;
  requiresAdditionalServices: Array<string>;
  requiresPermissions: Array<string>;
}
export interface PermissionDefinition
  extends RequestPermission,
    BasePermission {}
export enum BetterPortalCapabilityInternal {
  uiServices = "uiServices",
  permissions = "permissions",
}

export type BetterPortalCapabilityReturnInternal<
  Capability extends BetterPortalCapability
> = Capability extends BetterPortalCapabilityInternal.uiServices
  ? Array<UIService>
  : Capability extends BetterPortalCapabilityInternal.permissions
  ? Array<PermissionDefinition>
  : never;

export type BetterPortalCapabilityConfigurable =
  | BetterPortalCapabilityConfigurablePublic
  | BetterPortalCapabilityConfigurableAuthed;
export type BetterPortalCapability =
  | BetterPortalCapabilityInternal
  | BetterPortalCapabilityConfigurable;

export type BetterPortalCapabilityHandler<
  Capability extends BetterPortalCapability,
  key extends { [key: string]: string }
> = {
  (
    token: AuthToken | null,
    clientId: string | null,
    key: keyof key,
    optional?: any
  ): Promise<BetterPortalCapabilityReturn<Capability>>;
};

export type BetterPortalCapabilityReturn<
  Capability extends BetterPortalCapability
> = BetterPortalCapabilityReturnInternal<Capability> extends never
  ? BetterPortalCapabilityReturnConfigurable<Capability>
  : BetterPortalCapabilityReturnInternal<Capability>;

export interface AuthToken {
  host: string;
  iss: string;
  verified: boolean;
  last2FATime: number;
  has2FASetup: boolean;
  name: string;
  surname?: string;
  email: string;
  clientId?: string;
  clientName?: string;
  clientPermissions?: ClientPermissions;
  sessionStarted: number;
  sessionKey: string;
  userId: string;
  appId: string;
  tenantId: string;
  ip: string;
  cid: string;
  scope: string;
  sub: string;
  exp: number;
  nbf: number;
  iat: number;
  jti: string;
  expMS: number;
}

export interface ClientPermissions extends IDictionary<Array<string>> {
  _: string[];
}

export interface User_Client {
  name: string;
  enabled: boolean;
  timeframe?: User_Client_Timeframe;
  /** sar[{api name}] = [{string array of permissions}] */
  /** sar._ = [{string array of groups}] */
  sar: IDictionary<Array<string>>;
}
export interface User_Client_Timeframe {
  timeFrom: number;
  timeTo: number;
}

export type ParamsContainVar<
  T extends string,
  ContainVar extends string,
  Next,
  Force = never
> = T extends `${infer Pre}/:${ContainVar}/${infer Post}` ? Next : Force;

export interface FastifyRequestPathParams {
  clientId: string;
}

export type FastifyRequestPath<
  Path extends string,
  Body = any,
  Query = any,
  Headers = any,
  OverrideParams = never
> = FastifyRequest<{
  Params: Readonly<ParamsFromPath<Path> | OverrideParams>;
  Querystring: Readonly<Query>;
  Body: Readonly<Body>;
  headers: Readonly<Headers>;
}>;

export { betterPortal } from "./clients/service-betterportal/plugin";

export interface FastifyNoBodyRequestHandler<Path extends string> {
  (
    reply: FastifyReply,
    token: AuthToken | null,
    clientId: string | null,
    fields: Array<string> | undefined,
    params: Readonly<ParamsFromPath<Path>>,
    query: any,
    checkCacheCanSendData: {
      (eTag: string, config: ReplyRequestCacheConfig): boolean;
    },
    request: FastifyRequest<
      RouteGenericInterface,
      RawServerDefault,
      IncomingMessage,
      FastifySchema,
      FastifyTypeProviderDefault,
      any,
      FastifyBaseLogger
    >
  ): Promise<void>;
}

export interface FastifyBodyRequestHandler<Path extends string> {
  (
    reply: FastifyReply,
    token: AuthToken | null,
    clientId: string | null,
    fields: Array<string> | undefined,
    params: Readonly<ParamsFromPath<Path>>,
    body: any,
    query: any,
    checkCacheCanSendData: {
      (eTag: string, config: ReplyRequestCacheConfig): boolean;
    },
    request: FastifyRequest<
      RouteGenericInterface,
      RawServerDefault,
      IncomingMessage,
      FastifySchema,
      FastifyTypeProviderDefault,
      any,
      FastifyBaseLogger
    >
  ): Promise<void>;
}

export enum ReplyRequestCacheConfigAbility {
  all = "public",
  singleUser = "private",
}
export interface ReplyRequestCacheConfig {
  cacheAbility: ReplyRequestCacheConfigAbility;
  immutable?: boolean;
  //canCacheWhileErrorSeconds?: number;
  revalidationSeconds?: number;
  maxAge?: number;
}
