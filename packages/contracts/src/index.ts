export type FrontmatterRecord = Record<string, unknown>;

export type WorkspaceNodeKind =
  | "workspace"
  | "folder"
  | "database"
  | "page"
  | "asset"
  | "file";

export interface WorkspaceNode {
  path: string;
  name: string;
  kind: WorkspaceNodeKind;
  children?: WorkspaceNode[];
  companionPath?: string;
}

export interface CreatePageRequest {
  parentPath: string;
  name: string;
  markdownBody?: string;
  frontmatter?: FrontmatterRecord;
}

export interface CreateFolderRequest {
  parentPath: string;
  name: string;
  markdownBody?: string;
}

export type DatabasePropertyType =
  | "text"
  | "number"
  | "date"
  | "checkbox"
  | "select"
  | "multi-select";

export const DATABASE_PROPERTY_OPTION_COLORS = [
  "neutral",
  "blue",
  "orange",
  "rose",
  "yellow",
  "teal",
  "violet",
  "lime",
  "cyan",
  "fuchsia"
] as const;

export type DatabasePropertyOptionColor = (typeof DATABASE_PROPERTY_OPTION_COLORS)[number];

export interface DatabasePropertyOption {
  name: string;
  color?: string;
}

export interface DatabasePropertyDefinition {
  type: DatabasePropertyType;
  options?: DatabasePropertyOption[];
}

export interface DatabaseFilter {
  property: string;
  operator:
    | "equals"
    | "not-equals"
    | "contains"
    | "not-contains"
    | "is-empty"
    | "is-not-empty"
    | "greater-than"
    | "less-than";
  value?: unknown;
}

export interface DatabaseSort {
  property: string;
  direction: "asc" | "desc";
}

export interface DatabaseTableView {
  name: string;
  type: "table";
  columns: string[];
  filters?: DatabaseFilter[];
  filterMode?: "and" | "or";
  sorts?: DatabaseSort[];
}

export type DatabaseView = DatabaseTableView;

export interface DatabaseSchema {
  type: "database";
  properties: Record<string, DatabasePropertyDefinition>;
  unsupportedProperties: string[];
  views: DatabaseView[];
}

export interface DatabaseRecord {
  path: string;
  title: string;
  frontmatter: FrontmatterRecord;
  version: string;
}

export interface CreateDatabaseRequest {
  parentPath: string;
  name: string;
  markdownBody?: string;
}

export interface ConvertContainerRequest {
  path: string;
  targetKind: "folder" | "database";
}

export interface CreateDatabaseRecordRequest {
  databasePath: string;
  name?: string;
  frontmatter?: FrontmatterRecord;
  markdownBody?: string;
}

export interface QueryDatabaseRequest {
  databasePath: string;
  filters?: DatabaseFilter[];
  filterMode?: "and" | "or";
  sorts?: DatabaseSort[];
}

export interface QueryDatabaseResult {
  databasePath: string;
  configPath: string;
  schema: DatabaseSchema;
  schemaVersion: string;
  records: DatabaseRecord[];
}

export interface UpdateDatabaseRecordPropertyRequest {
  databasePath: string;
  recordPath: string;
  property: string;
  value?: unknown;
  baseVersion?: string;
}

export interface UpdateDatabaseSchemaRequest {
  databasePath: string;
  properties: Record<string, DatabasePropertyDefinition>;
  views: DatabaseView[];
  baseVersion?: string;
}

export interface CreateDatabasePropertyOptionRequest {
  databasePath: string;
  property: string;
  option: string;
  color?: DatabasePropertyOptionColor;
  baseVersion?: string;
}

interface UpdateDatabasePropertyOptionBaseRequest {
  databasePath: string;
  property: string;
  option: string;
  baseVersion?: string;
}

export type UpdateDatabasePropertyOptionRequest =
  | (UpdateDatabasePropertyOptionBaseRequest & {
      action: "rename";
      newName: string;
    })
  | (UpdateDatabasePropertyOptionBaseRequest & {
      action: "change-color";
      color: DatabasePropertyOptionColor;
    })
  | (UpdateDatabasePropertyOptionBaseRequest & {
      action: "delete";
    });

export interface RenameDatabasePropertyRequest {
  databasePath: string;
  property: string;
  newName: string;
  baseVersion?: string;
}

export interface ChangeDatabasePropertyTypeRequest {
  databasePath: string;
  property: string;
  type: DatabasePropertyType;
  baseVersion?: string;
}

export interface DeleteDatabasePropertyRequest {
  databasePath: string;
  property: string;
  baseVersion?: string;
}

export interface RenameNodeRequest {
  path: string;
  newName: string;
}

export interface MoveNodeRequest {
  path: string;
  newParentPath: string;
}

export interface DeleteNodeRequest {
  path: string;
  recursive?: boolean;
}

export type TrashItemKind = "page" | "folder" | "database" | "asset" | "file";

export interface TrashItem {
  id: string;
  name: string;
  kind: TrashItemKind;
  originalPath: string;
  deletedAt: string;
}

export interface TrashListResult {
  items: TrashItem[];
}

export interface RestoreTrashItemRequest {
  id: string;
}

export interface RestoreTrashItemResult {
  status: "ok";
  item: TrashItem;
  path: string;
  originalPath: string;
  restoredToOriginalPath: boolean;
  events: RumiEvent[];
}

export interface WorkspaceMutationResult {
  status: "ok";
  path: string;
  previousPath?: string;
  events: RumiEvent[];
}

export interface SaveAssetResult {
  status: "saved";
  path: string;
  fileName: string;
  contentType: string;
  events: RumiEvent[];
}

export interface OpenWorkspaceResult {
  rootPath: string;
  name: string;
}

export type PageDocumentKind = "page" | "folder" | "database";

export interface PageDatabaseContext {
  databasePath: string;
  schema: DatabaseSchema;
  schemaVersion: string;
}

export interface PageDocument {
  path: string;
  kind: PageDocumentKind;
  frontmatter: FrontmatterRecord;
  markdownBody: string;
  contentHash: string;
  frontmatterHash: string;
  version: string;
  database?: PageDatabaseContext;
}

export type SavePageReason =
  | "editor-autosave"
  | "manual-save"
  | "property-edit"
  | "api"
  | "cli";

export interface SavePageRequest {
  path: string;
  baseVersion?: string;
  frontmatter: FrontmatterRecord;
  markdownBody: string;
  reason: SavePageReason;
}

export const RUMI_EVENT_NAMES = [
  "workspace.treeChanged",
  "page.changed",
  "page.moved",
  "page.deleted",
  "folder.childrenChanged",
  "database.schemaChanged",
  "database.recordsChanged",
  "asset.changed",
  "index.rebuilt",
  "server.statusChanged"
] as const;

export type RumiEventName = (typeof RUMI_EVENT_NAMES)[number];

export interface RumiEvent {
  name: RumiEventName;
  path?: string;
  previousPath?: string;
  referenceRepair?: {
    previousPath: string;
    nextPath: string;
  };
  version?: string;
  contentHash?: string;
  changedBy?: string;
  sourceClientId?: string;
  affects?: string[];
}

export interface RumiEventEnvelope {
  id: number;
  emittedAt: string;
  event: RumiEvent;
}

export interface SavePageSavedResult {
  status: "saved";
  path: string;
  version: string;
  contentHash: string;
  changedIndexes: string[];
  events: RumiEvent[];
}

export interface SavePageConflictResult {
  status: "conflict";
  path: string;
  currentVersion: string;
  attemptedBaseVersion?: string;
}

export type SavePageResult = SavePageSavedResult | SavePageConflictResult;

export type RevisionReason =
  | "baseline"
  | "idle-checkpoint"
  | "manual-checkpoint"
  | "before-container-conversion"
  | "container-conversion"
  | "before-reference-repair"
  | "before-delete"
  | "before-restore"
  | "restore";

export type RevisionSource = "editor" | "api" | "cli" | "filesystem" | "runtime";

export interface RevisionEntry {
  revisionId: string;
  type: "revision.checkpoint" | "revision.restored";
  objectId: string;
  objectPath: string;
  contentPath: string;
  contentRole: "page" | "folder-index" | "database-config";
  contentHash: string;
  previousContentHash?: string;
  reason: RevisionReason;
  source: RevisionSource;
  createdAt: string;
  restoredFromRevisionId?: string;
}

export interface RevisionContentResult {
  revision: RevisionEntry;
  markdown: string;
}

export interface CheckpointRequest {
  path: string;
  reason?: "manual-checkpoint";
}

export interface RestoreRevisionRequest {
  revisionId: string;
  targetPath?: string;
}

export interface SearchWorkspaceRequest {
  query: string;
  kinds?: WorkspaceNodeKind[];
  limit?: number;
}

export interface SearchWorkspaceResultItem {
  path: string;
  title: string;
  kind: PageDocumentKind;
  snippet: string;
  score: number;
}

export interface SearchWorkspaceResult {
  query: string;
  items: SearchWorkspaceResultItem[];
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

export type AuthMode = "none" | "password";

export interface AuthUser {
  username: string;
}

export interface AuthSessionResult {
  mode: AuthMode;
  authenticated: boolean;
  user?: AuthUser;
}

export interface AuthLoginRequest {
  username: string;
  password: string;
}
