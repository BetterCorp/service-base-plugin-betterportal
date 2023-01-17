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
import type { ParamsFromPath } from "@bettercorp/service-base-plugin-web-server/lib/plugins/service-fastify/lib";
import { IncomingMessage } from "http";

export interface AuthToken {
  host: string;
  tenantId: string;
  appId?: string;
  authedAppId: string;
  userId: string;
  name: string;
  surname?: string;
  email: string;
  cell?: string;
  clients: IDictionary<User_Client>;
  sessionStarted: number;
  sessionKey: string;
  expires: number;
  last2FATime: number;
  has2FASetup: boolean;
  sub: string;
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
  Params: Readonly<
    ParamsContainVar<Path, "clientId", ParamsFromPath<Path>> | OverrideParams
  >;
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
    roles: Array<string> | null,
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
    roles: Array<string> | null,
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
