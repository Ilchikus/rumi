import type {
  AuthLoginRequest,
  AuthSessionResult,
  CheckpointRequest,
  CreateDatabaseRecordRequest,
  CreateDatabaseRequest,
  CreateFolderRequest,
  CreatePageRequest,
  DeleteNodeRequest,
  MoveNodeRequest,
  OpenWorkspaceResult,
  PageDocument,
  QueryDatabaseRequest,
  QueryDatabaseResult,
  RenameDatabasePropertyRequest,
  RenameNodeRequest,
  RestoreRevisionRequest,
  RevisionContentResult,
  RevisionEntry,
  RumiEvent,
  SavePageRequest,
  SavePageResult,
  SaveAssetResult,
  SearchWorkspaceRequest,
  SearchWorkspaceResult,
  UpdateDatabaseRecordPropertyRequest,
  UpdateDatabaseSchemaRequest,
  WorkspaceMutationResult,
  WorkspaceNode
} from "@rumi/contracts";
import { RUMI_EVENT_NAMES } from "@rumi/contracts";

export interface RumiApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  eventSourceImpl?: typeof EventSource;
}

export class RumiApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly eventSourceImpl?: typeof EventSource;

  constructor(options: RumiApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.eventSourceImpl = options.eventSourceImpl ?? globalThis.EventSource;
  }

  async getAuthSession(): Promise<AuthSessionResult> {
    return this.request<AuthSessionResult>("/api/auth/session");
  }

  async login(request: AuthLoginRequest): Promise<AuthSessionResult> {
    return this.request<AuthSessionResult>("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });
  }

  async logout(): Promise<AuthSessionResult> {
    return this.request<AuthSessionResult>("/api/auth/logout", {
      method: "POST"
    });
  }

  async getWorkspace(): Promise<OpenWorkspaceResult> {
    return this.request<OpenWorkspaceResult>("/api/workspace");
  }

  async getTree(): Promise<WorkspaceNode> {
    return this.request<WorkspaceNode>("/api/tree");
  }

  async openPage(path: string): Promise<PageDocument> {
    const search = new URLSearchParams({ path });
    return this.request<PageDocument>(`/api/page?${search.toString()}`);
  }

  async savePage(request: SavePageRequest): Promise<SavePageResult> {
    return this.request<SavePageResult>("/api/page/save", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(request)
    });
  }

  async uploadAsset(fileName: string, data: BodyInit): Promise<SaveAssetResult> {
    const search = new URLSearchParams({ fileName });
    return this.request<SaveAssetResult>(`/api/assets?${search.toString()}`, {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: data
    });
  }

  async listRevisions(path: string): Promise<RevisionEntry[]> {
    const search = new URLSearchParams({ path });
    return this.request<RevisionEntry[]>(`/api/revisions?${search.toString()}`);
  }

  async getRevision(revisionId: string): Promise<RevisionContentResult> {
    return this.request<RevisionContentResult>(`/api/revisions/${encodeURIComponent(revisionId)}`);
  }

  async checkpointNow(request: CheckpointRequest): Promise<RevisionEntry> {
    return this.request<RevisionEntry>("/api/revisions/checkpoint", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async restoreRevision(request: RestoreRevisionRequest): Promise<RevisionEntry> {
    return this.request<RevisionEntry>("/api/revisions/restore", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async searchWorkspace(request: SearchWorkspaceRequest): Promise<SearchWorkspaceResult> {
    return this.request<SearchWorkspaceResult>("/api/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async createPage(request: CreatePageRequest): Promise<WorkspaceMutationResult> {
    return this.request<WorkspaceMutationResult>("/api/pages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async createFolder(request: CreateFolderRequest): Promise<WorkspaceMutationResult> {
    return this.request<WorkspaceMutationResult>("/api/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async createDatabase(request: CreateDatabaseRequest): Promise<WorkspaceMutationResult> {
    return this.request<WorkspaceMutationResult>("/api/databases", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async queryDatabase(request: QueryDatabaseRequest): Promise<QueryDatabaseResult> {
    return this.request<QueryDatabaseResult>("/api/database/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async createDatabaseRecord(
    request: CreateDatabaseRecordRequest
  ): Promise<WorkspaceMutationResult> {
    return this.request<WorkspaceMutationResult>("/api/database/records", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async updateDatabaseRecordProperty(
    request: UpdateDatabaseRecordPropertyRequest
  ): Promise<SavePageResult> {
    return this.request<SavePageResult>("/api/database/records/property", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async updateDatabaseSchema(request: UpdateDatabaseSchemaRequest): Promise<SavePageResult> {
    return this.request<SavePageResult>("/api/database/schema", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async renameDatabaseProperty(request: RenameDatabasePropertyRequest): Promise<SavePageResult> {
    return this.request<SavePageResult>("/api/database/schema/property/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async renameNode(request: RenameNodeRequest): Promise<WorkspaceMutationResult> {
    return this.request<WorkspaceMutationResult>("/api/nodes/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async moveNode(request: MoveNodeRequest): Promise<WorkspaceMutationResult> {
    return this.request<WorkspaceMutationResult>("/api/nodes/move", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  async deleteNode(request: DeleteNodeRequest): Promise<WorkspaceMutationResult> {
    return this.request<WorkspaceMutationResult>("/api/nodes/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request)
    });
  }

  subscribeEvents(onEvent: (event: RumiEvent) => void, onError?: (error: Event) => void): () => void {
    if (!this.eventSourceImpl) {
      throw new Error("EventSource is not available in this environment");
    }

    const eventSource = new this.eventSourceImpl(`${this.baseUrl}/api/events`);
    const handleMessage = (message: MessageEvent<string>) => {
      const event = parseRumiEvent(message.data);

      if (event) {
        onEvent(event);
      }
    };

    for (const eventName of RUMI_EVENT_NAMES) {
      eventSource.addEventListener(eventName, handleMessage as EventListener);
    }

    if (onError) {
      eventSource.addEventListener("error", onError);
    }

    return () => {
      for (const eventName of RUMI_EVENT_NAMES) {
        eventSource.removeEventListener(eventName, handleMessage as EventListener);
      }

      if (onError) {
        eventSource.removeEventListener("error", onError);
      }

      eventSource.close();
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      credentials: "include",
      ...init
    });
    const data = (await response.json()) as unknown;

    if (!response.ok) {
      if (response.status === 409 && isObject(data) && data.status === "conflict") {
        return data as T;
      }

      const message =
        isObject(data) && isObject(data.error) && typeof data.error.message === "string"
          ? data.error.message
          : `Request failed with status ${response.status}`;
      throw new Error(message);
    }

    return data as T;
  }
}

function parseRumiEvent(data: string): RumiEvent | null {
  try {
    const value = JSON.parse(data) as unknown;

    if (isRumiEvent(value)) {
      return value;
    }
  } catch {
    return null;
  }

  return null;
}

function isRumiEvent(value: unknown): value is RumiEvent {
  return (
    isObject(value) &&
    typeof value.name === "string" &&
    (RUMI_EVENT_NAMES as readonly string[]).includes(value.name)
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
