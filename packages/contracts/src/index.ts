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

export interface WorkspaceMutationResult {
  status: "ok";
  path: string;
  previousPath?: string;
  events: RumiEvent[];
}

export interface OpenWorkspaceResult {
  rootPath: string;
  name: string;
}

export type PageDocumentKind = "page" | "folder" | "database";

export interface PageDocument {
  path: string;
  kind: PageDocumentKind;
  frontmatter: FrontmatterRecord;
  markdownBody: string;
  contentHash: string;
  frontmatterHash: string;
  version: string;
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

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}
