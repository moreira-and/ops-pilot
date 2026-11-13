import { z } from "zod";
import {
  actionDecisionRequestSchema,
  actionDecisionResponseSchema,
  actionListResponseSchema,
  clientChatAcceptedResponseSchema,
  chatRequestSchema,
  chatResponseSchema,
  type ActionDecisionResponse,
  type ClientChatAcceptedResponse,
  type ChatResponse,
  type PendingAction,
} from "../../../src/contracts/war-room.js";
import { parseApiBaseUrl } from "./settings.js";

export class ApiRequestError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

export interface ApiClientOptions {
  apiBaseUrl: string;
  userId: string;
  fetchImpl?: typeof fetch;
}

export interface ApiClient {
  sendChat(
    message: string,
    conversationId?: string | null,
  ): Promise<ChatResponse | ClientChatAcceptedResponse>;
  listActions(): Promise<PendingAction[]>;
  decideAction(
    id: string,
    decision: "approve" | "deny",
  ): Promise<ActionDecisionResponse>;
}

const userIdSchema = z.string().uuid();

export function createApiClient(options: ApiClientOptions): ApiClient {
  const apiBaseUrl = parseApiBaseUrl(options.apiBaseUrl);
  const userId = userIdSchema.parse(options.userId);
  const fetchImpl = options.fetchImpl ?? fetch;

  async function readJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ApiRequestError("The API returned invalid JSON.", response.status);
      }
      throw error;
    }
  }

  function endpoint(path: string): URL {
    return new URL(path, `${apiBaseUrl}/`);
  }

  function assertStatus(response: Response, expected: number): void {
    if (response.status !== expected) {
      throw new ApiRequestError(
        `API request failed with HTTP ${response.status}.`,
        response.status,
      );
    }
  }

  return {
    async sendChat(message, conversationId) {
      const request = chatRequestSchema.parse({
        message,
        userId,
        ...(conversationId === undefined || conversationId === null
          ? {}
          : { conversationId }),
      });
      const response = await fetchImpl(endpoint("chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });

      if (response.status === 202) {
        const parsed = clientChatAcceptedResponseSchema.safeParse(
          await readJson(response),
        );
        if (!parsed.success) {
          throw new ApiRequestError(
            "The API returned an invalid accepted chat response.",
            response.status,
          );
        }
        return parsed.data;
      }

      assertStatus(response, 200);
      const parsed = chatResponseSchema.safeParse(await readJson(response));
      if (!parsed.success) {
        throw new ApiRequestError(
          "The API returned an invalid chat response.",
          response.status,
        );
      }
      return parsed.data;
    },
    async listActions() {
      const actionsUrl = endpoint("actions");
      actionsUrl.searchParams.set("userId", userId);
      const response = await fetchImpl(actionsUrl);
      assertStatus(response, 200);
      const parsed = actionListResponseSchema.safeParse(await readJson(response));
      if (!parsed.success) {
        throw new ApiRequestError(
          "The API returned an invalid action list.",
          response.status,
        );
      }
      return parsed.data.actions;
    },
    async decideAction(id, decision) {
      const body = actionDecisionRequestSchema.parse({ userId, decision });
      const response = await fetchImpl(endpoint(
        `actions/${encodeURIComponent(id)}/decision`,
      ), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assertStatus(response, 200);
      const parsed = actionDecisionResponseSchema.safeParse(
        await readJson(response),
      );
      if (!parsed.success || parsed.data.id !== id) {
        throw new ApiRequestError(
          "The API returned an invalid action decision.",
          response.status,
        );
      }
      return parsed.data;
    },
  };
}
