import type {
  ClientChatAcceptedResponse,
  ChatResponse,
} from "../../src/contracts/war-room.js";

export type ChatExchangeResponse = ChatResponse | ClientChatAcceptedResponse;

export interface ChatExchange {
  submissionId: string;
  message: string;
  status: "sending" | "complete" | "failed";
  response: ChatExchangeResponse | null;
  error: string | null;
}

export interface ChatState {
  exchanges: ChatExchange[];
}

export type ChatAction =
  | { type: "submitted"; submissionId: string; message: string }
  | {
    type: "succeeded";
    submissionId: string;
    response: ChatExchangeResponse;
  }
  | { type: "failed"; submissionId: string; error: string };

export const initialChatState: ChatState = { exchanges: [] };

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  if (action.type === "submitted") {
    return {
      exchanges: [
        ...state.exchanges,
        {
          submissionId: action.submissionId,
          message: action.message,
          status: "sending",
          response: null,
          error: null,
        },
      ],
    };
  }

  const index = state.exchanges.findIndex(
    (exchange) =>
      exchange.submissionId === action.submissionId &&
      exchange.status === "sending",
  );
  if (index < 0) return state;

  const exchange = state.exchanges[index];
  if (!exchange) return state;

  const exchanges = [...state.exchanges];
  exchanges[index] = action.type === "succeeded"
    ? { ...exchange, status: "complete", response: action.response }
    : { ...exchange, status: "failed", error: action.error };
  return { exchanges };
}
