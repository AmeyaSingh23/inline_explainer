export type ProcessingStatus = "queued" | "processing" | "ready" | "failed";

export interface Repository {
    id: string;
    user_id: string;
    repo_url: string;
    repo_name: string;
    graph_json: Record<string, unknown> | null;
    processing_status: ProcessingStatus;
    created_at: string;
}

export interface ChatSession {
    id: string;
    user_id: string;
    repository_id: string;
    file_path: string;
    messages: ChatMessage[];
    updated_at: string;
}

export interface ChatMessage {
    role: "user" | "assistant" | "context";
    content: string;
    timestamp?: string;
}