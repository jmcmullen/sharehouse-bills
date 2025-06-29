/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { createServerRootRoute } from '@tanstack/react-start/server'

import { Route as rootRouteImport } from './routes/__root'
import { Route as LoginRouteImport } from './routes/login'
import { Route as HousematesRouteImport } from './routes/housemates'
import { Route as BillsRouteImport } from './routes/bills'
import { Route as AiRouteImport } from './routes/ai'
import { Route as IndexRouteImport } from './routes/index'
import { ServerRoute as ApiUpWebhookServerRouteImport } from './routes/api.up-webhook'
import { ServerRoute as ApiEmailWebhookServerRouteImport } from './routes/api.email-webhook'
import { ServerRoute as ApiAiServerRouteImport } from './routes/api.ai'
import { ServerRoute as ApiSplatServerRouteImport } from './routes/api.$'
import { ServerRoute as ApiCronGenerateBillsServerRouteImport } from './routes/api.cron.generate-bills'
import { ServerRoute as ApiAuthSplatServerRouteImport } from './routes/api.auth.$'

const rootServerRouteImport = createServerRootRoute()

const LoginRoute = LoginRouteImport.update({
  id: '/login',
  path: '/login',
  getParentRoute: () => rootRouteImport,
} as any)
const HousematesRoute = HousematesRouteImport.update({
  id: '/housemates',
  path: '/housemates',
  getParentRoute: () => rootRouteImport,
} as any)
const BillsRoute = BillsRouteImport.update({
  id: '/bills',
  path: '/bills',
  getParentRoute: () => rootRouteImport,
} as any)
const AiRoute = AiRouteImport.update({
  id: '/ai',
  path: '/ai',
  getParentRoute: () => rootRouteImport,
} as any)
const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
} as any)
const ApiUpWebhookServerRoute = ApiUpWebhookServerRouteImport.update({
  id: '/api/up-webhook',
  path: '/api/up-webhook',
  getParentRoute: () => rootServerRouteImport,
} as any)
const ApiEmailWebhookServerRoute = ApiEmailWebhookServerRouteImport.update({
  id: '/api/email-webhook',
  path: '/api/email-webhook',
  getParentRoute: () => rootServerRouteImport,
} as any)
const ApiAiServerRoute = ApiAiServerRouteImport.update({
  id: '/api/ai',
  path: '/api/ai',
  getParentRoute: () => rootServerRouteImport,
} as any)
const ApiSplatServerRoute = ApiSplatServerRouteImport.update({
  id: '/api/$',
  path: '/api/$',
  getParentRoute: () => rootServerRouteImport,
} as any)
const ApiCronGenerateBillsServerRoute =
  ApiCronGenerateBillsServerRouteImport.update({
    id: '/api/cron/generate-bills',
    path: '/api/cron/generate-bills',
    getParentRoute: () => rootServerRouteImport,
  } as any)
const ApiAuthSplatServerRoute = ApiAuthSplatServerRouteImport.update({
  id: '/api/auth/$',
  path: '/api/auth/$',
  getParentRoute: () => rootServerRouteImport,
} as any)

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/ai': typeof AiRoute
  '/bills': typeof BillsRoute
  '/housemates': typeof HousematesRoute
  '/login': typeof LoginRoute
}
export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/ai': typeof AiRoute
  '/bills': typeof BillsRoute
  '/housemates': typeof HousematesRoute
  '/login': typeof LoginRoute
}
export interface FileRoutesById {
  __root__: typeof rootRouteImport
  '/': typeof IndexRoute
  '/ai': typeof AiRoute
  '/bills': typeof BillsRoute
  '/housemates': typeof HousematesRoute
  '/login': typeof LoginRoute
}
export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/' | '/ai' | '/bills' | '/housemates' | '/login'
  fileRoutesByTo: FileRoutesByTo
  to: '/' | '/ai' | '/bills' | '/housemates' | '/login'
  id: '__root__' | '/' | '/ai' | '/bills' | '/housemates' | '/login'
  fileRoutesById: FileRoutesById
}
export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  AiRoute: typeof AiRoute
  BillsRoute: typeof BillsRoute
  HousematesRoute: typeof HousematesRoute
  LoginRoute: typeof LoginRoute
}
export interface FileServerRoutesByFullPath {
  '/api/$': typeof ApiSplatServerRoute
  '/api/ai': typeof ApiAiServerRoute
  '/api/email-webhook': typeof ApiEmailWebhookServerRoute
  '/api/up-webhook': typeof ApiUpWebhookServerRoute
  '/api/auth/$': typeof ApiAuthSplatServerRoute
  '/api/cron/generate-bills': typeof ApiCronGenerateBillsServerRoute
}
export interface FileServerRoutesByTo {
  '/api/$': typeof ApiSplatServerRoute
  '/api/ai': typeof ApiAiServerRoute
  '/api/email-webhook': typeof ApiEmailWebhookServerRoute
  '/api/up-webhook': typeof ApiUpWebhookServerRoute
  '/api/auth/$': typeof ApiAuthSplatServerRoute
  '/api/cron/generate-bills': typeof ApiCronGenerateBillsServerRoute
}
export interface FileServerRoutesById {
  __root__: typeof rootServerRouteImport
  '/api/$': typeof ApiSplatServerRoute
  '/api/ai': typeof ApiAiServerRoute
  '/api/email-webhook': typeof ApiEmailWebhookServerRoute
  '/api/up-webhook': typeof ApiUpWebhookServerRoute
  '/api/auth/$': typeof ApiAuthSplatServerRoute
  '/api/cron/generate-bills': typeof ApiCronGenerateBillsServerRoute
}
export interface FileServerRouteTypes {
  fileServerRoutesByFullPath: FileServerRoutesByFullPath
  fullPaths:
    | '/api/$'
    | '/api/ai'
    | '/api/email-webhook'
    | '/api/up-webhook'
    | '/api/auth/$'
    | '/api/cron/generate-bills'
  fileServerRoutesByTo: FileServerRoutesByTo
  to:
    | '/api/$'
    | '/api/ai'
    | '/api/email-webhook'
    | '/api/up-webhook'
    | '/api/auth/$'
    | '/api/cron/generate-bills'
  id:
    | '__root__'
    | '/api/$'
    | '/api/ai'
    | '/api/email-webhook'
    | '/api/up-webhook'
    | '/api/auth/$'
    | '/api/cron/generate-bills'
  fileServerRoutesById: FileServerRoutesById
}
export interface RootServerRouteChildren {
  ApiSplatServerRoute: typeof ApiSplatServerRoute
  ApiAiServerRoute: typeof ApiAiServerRoute
  ApiEmailWebhookServerRoute: typeof ApiEmailWebhookServerRoute
  ApiUpWebhookServerRoute: typeof ApiUpWebhookServerRoute
  ApiAuthSplatServerRoute: typeof ApiAuthSplatServerRoute
  ApiCronGenerateBillsServerRoute: typeof ApiCronGenerateBillsServerRoute
}

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/login': {
      id: '/login'
      path: '/login'
      fullPath: '/login'
      preLoaderRoute: typeof LoginRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/housemates': {
      id: '/housemates'
      path: '/housemates'
      fullPath: '/housemates'
      preLoaderRoute: typeof HousematesRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/bills': {
      id: '/bills'
      path: '/bills'
      fullPath: '/bills'
      preLoaderRoute: typeof BillsRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/ai': {
      id: '/ai'
      path: '/ai'
      fullPath: '/ai'
      preLoaderRoute: typeof AiRouteImport
      parentRoute: typeof rootRouteImport
    }
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexRouteImport
      parentRoute: typeof rootRouteImport
    }
  }
}
declare module '@tanstack/react-start/server' {
  interface ServerFileRoutesByPath {
    '/api/up-webhook': {
      id: '/api/up-webhook'
      path: '/api/up-webhook'
      fullPath: '/api/up-webhook'
      preLoaderRoute: typeof ApiUpWebhookServerRouteImport
      parentRoute: typeof rootServerRouteImport
    }
    '/api/email-webhook': {
      id: '/api/email-webhook'
      path: '/api/email-webhook'
      fullPath: '/api/email-webhook'
      preLoaderRoute: typeof ApiEmailWebhookServerRouteImport
      parentRoute: typeof rootServerRouteImport
    }
    '/api/ai': {
      id: '/api/ai'
      path: '/api/ai'
      fullPath: '/api/ai'
      preLoaderRoute: typeof ApiAiServerRouteImport
      parentRoute: typeof rootServerRouteImport
    }
    '/api/$': {
      id: '/api/$'
      path: '/api/$'
      fullPath: '/api/$'
      preLoaderRoute: typeof ApiSplatServerRouteImport
      parentRoute: typeof rootServerRouteImport
    }
    '/api/cron/generate-bills': {
      id: '/api/cron/generate-bills'
      path: '/api/cron/generate-bills'
      fullPath: '/api/cron/generate-bills'
      preLoaderRoute: typeof ApiCronGenerateBillsServerRouteImport
      parentRoute: typeof rootServerRouteImport
    }
    '/api/auth/$': {
      id: '/api/auth/$'
      path: '/api/auth/$'
      fullPath: '/api/auth/$'
      preLoaderRoute: typeof ApiAuthSplatServerRouteImport
      parentRoute: typeof rootServerRouteImport
    }
  }
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  AiRoute: AiRoute,
  BillsRoute: BillsRoute,
  HousematesRoute: HousematesRoute,
  LoginRoute: LoginRoute,
}
export const routeTree = rootRouteImport
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()
const rootServerRouteChildren: RootServerRouteChildren = {
  ApiSplatServerRoute: ApiSplatServerRoute,
  ApiAiServerRoute: ApiAiServerRoute,
  ApiEmailWebhookServerRoute: ApiEmailWebhookServerRoute,
  ApiUpWebhookServerRoute: ApiUpWebhookServerRoute,
  ApiAuthSplatServerRoute: ApiAuthSplatServerRoute,
  ApiCronGenerateBillsServerRoute: ApiCronGenerateBillsServerRoute,
}
export const serverRouteTree = rootServerRouteImport
  ._addFileChildren(rootServerRouteChildren)
  ._addFileTypes<FileServerRouteTypes>()
