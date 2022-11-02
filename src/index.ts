import { IDictionary } from "@bettercorp/tools/lib/Interfaces";
import { FastifyRequest } from "fastify";

export interface AuthToken {
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

export type ParamsFromPathItemStringUndefined<T extends string> =
  T extends `${infer Pre}?` ? Pre : T;

export type ParamsFromPathUntouched<T extends string> = T extends
  | `${infer Pre}:${infer Param}/${infer Post}`
  ? Param | ParamsFromPathUntouched<`${Pre}${Post}`>
  : never;

export type ParamsFromPath<T extends string> = {
  [Key in ParamsFromPathUntouched<T> as ParamsFromPathItemStringUndefined<Key>]: Key extends `${infer Name}?`
    ? string | undefined
    : string;
};

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
  Params: Readonly<ParamsContainVar<Path, "clientId", ParamsFromPath<Path>> | OverrideParams>;
  Querystring: Readonly<Query>;
  Body: Readonly<Body>;
  headers: Readonly<Headers>;
}>;

export { fastify } from "./clients/service-betterportal/plugin";
