import type { InferResponseType } from 'hono/client';
import type { api } from './api';

type Api = typeof api.api;
type FilesClient = Api['files'];
type FileDetailClient = FilesClient[':id'];
type PublicSharesClient = Api['public']['shares'];

export type SessionUser = InferResponseType<Api['auth']['me']['$get'], 200>['user'];
export type LoginUser = InferResponseType<Api['auth']['login']['$post'], 200>['user'];
export type UserItem = InferResponseType<Api['users']['$get'], 200>['users'][number];
export type FolderItem = InferResponseType<Api['folders']['$get'], 200>['folders'][number];
export type FolderTreeNode = InferResponseType<
  Api['folders']['tree']['$get'],
  200
>['folders'][number];
export type FileItem = InferResponseType<FilesClient['$get'], 200>['files'][number];
export type VersionItem = InferResponseType<
  FileDetailClient['versions']['$get'],
  200
>['versions'][number];
export type ShareLinkItem = InferResponseType<
  FileDetailClient['share-links']['$get'],
  200
>['links'][number];
export type ShareCreated = InferResponseType<FileDetailClient['share-links']['$post'], 201>;
export type PublicShare = InferResponseType<PublicSharesClient[':token']['$get'], 200>['share'];
export type PublicDownload = InferResponseType<
  PublicSharesClient[':token']['download']['$post'],
  200
>;
export type TrashData = InferResponseType<Api['trash']['$get'], 200>;
export type ActivityPage = InferResponseType<Api['activity']['$get'], 200>;
export type ActivityItem = ActivityPage['entries'][number];
export type Role = SessionUser['role'];
