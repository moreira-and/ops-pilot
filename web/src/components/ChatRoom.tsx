import { useEffect, useReducer, useState, type FormEvent } from "react";
import { ApiRequestError, createApiClient } from "../api/client.js";
import { chatReducer, initialChatState } from "../chat-state.js";
import {
  canDecide,
  initialPendingActionState,
  pendingActionReducer,
} from "../pending-action-state.js";
import { PendingActionCard } from "./PendingActionCard.js";
import { TraceViewer } from "./TraceViewer.js";
import { createTraceViewModel } from "../trace-view-model.js";

export interface ChatRoomProps {
  apiBaseUrl: string | null;
  userId: string;
  conversationId: string | null;
  onConversationIdChange: (conversationId: string) => void;
}

function requestErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof TypeError) {
    return "Não foi possível conectar à API. Verifique o endereço e a permissão CORS.";
  }
  return "Não foi possível concluir a solicitação. Tente novamente.";
}

export function ChatRoom({
  apiBaseUrl,
  userId,
  conversationId,
  onConversationIdChange,
}: ChatRoomProps) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const [pendingState, dispatchPending] = useReducer(
    pendingActionReducer,
    initialPendingActionState,
  );
  const [message, setMessage] = useState("");
  const [actionsError, setActionsError] = useState<string | null>(null);
  const [traceRequestId, setTraceRequestId] = useState<string | null>(null);
  const isSending = state.exchanges.some(
    (exchange) => exchange.status === "sending",
  );
  const trimmedMessage = message.trim();

  useEffect(() => {
    let active = true;
    dispatchPending({ type: "restored", actions: [] });
    setActionsError(null);
    if (!apiBaseUrl) return () => { active = false; };

    void createApiClient({ apiBaseUrl, userId }).listActions()
      .then((actions) => {
        if (active) dispatchPending({ type: "restored", actions });
      })
      .catch((error: unknown) => {
        if (active) setActionsError(requestErrorMessage(error));
      });
    return () => { active = false; };
  }, [apiBaseUrl, userId]);

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiBaseUrl || !trimmedMessage || isSending) return;

    const submissionId = globalThis.crypto.randomUUID();
    dispatch({
      type: "submitted",
      submissionId,
      message: trimmedMessage,
    });
    setMessage("");

    try {
      const response = await createApiClient({ apiBaseUrl, userId }).sendChat(
        trimmedMessage,
        conversationId,
      );
      dispatch({ type: "succeeded", submissionId, response });
      if ("pendingActions" in response) {
        dispatchPending({ type: "received", actions: response.pendingActions });
      }
      onConversationIdChange(response.conversationId);
    } catch (error) {
      dispatch({
        type: "failed",
        submissionId,
        error: requestErrorMessage(error),
      });
    }
  }

  async function decideAction(
    id: string,
    decision: "approve" | "deny",
  ): Promise<void> {
    if (!apiBaseUrl) return;
    const item = pendingState.actions.find((entry) => entry.action.id === id);
    if (!item || !canDecide(item)) return;

    dispatchPending({ type: "decisionStarted", id });
    try {
      const result = await createApiClient({ apiBaseUrl, userId }).decideAction(
        id,
        decision,
      );
      dispatchPending({ type: "decisionSucceeded", decision: result });
    } catch (error) {
      dispatchPending({
        type: "decisionFailed",
        id,
        error: requestErrorMessage(error),
      });
      try {
        const actions = await createApiClient({ apiBaseUrl, userId }).listActions();
        dispatchPending({ type: "restored", actions });
      } catch (refreshError) {
        setActionsError(requestErrorMessage(refreshError));
      }
    }
  }

  return (
    <section className="chat-room" aria-label="Conversa com OpsPilot">
      <div className="chat-room__messages" aria-live="polite">
        {state.exchanges.length === 0
          ? (
            <div className="chat-room__welcome">
              <span className="status-dot" aria-hidden="true" />
              <p>Envie uma mensagem para iniciar a investigação.</p>
            </div>
          )
          : state.exchanges.map((exchange) => (
            <article
              className="exchange"
              key={exchange.submissionId}
              aria-label={`Interação ${exchange.submissionId}`}
            >
              <div className="message message--operator">
                <span className="message__role">Você</span>
                <p>{exchange.message}</p>
              </div>
              {exchange.status === "sending" && (
                <div className="message message--assistant" role="status">
                  <span className="message__role">OpsPilot</span>
                  <p>Investigando…</p>
                </div>
              )}
              {exchange.response && (
                <>
                  <div className="message message--assistant">
                    <span className="message__role">OpsPilot</span>
                    <p>{"pendingActions" in exchange.response
                      ? "Uma ou mais ações operacionais aguardam sua decisão."
                      : exchange.response.answer}</p>
                  </div>
                  <button
                    type="button"
                    className="trace-trigger"
                    onClick={() =>
                      setTraceRequestId(exchange.response?.requestId ?? null)}
                  >
                    Ver raciocínio
                  </button>
                  {traceRequestId === exchange.response.requestId && (
                    <TraceViewer
                      model={createTraceViewModel(
                        exchange.response,
                        exchange.response.requestId,
                      )}
                      onClose={() => setTraceRequestId(null)}
                    />
                  )}
                </>
              )}
              {exchange.error && (
                <div className="message message--error" role="alert">
                  <span className="message__role">Falha</span>
                  <p>{exchange.error}</p>
                </div>
              )}
            </article>
          ))}
        {pendingState.actions.length > 0 && (
          <section className="pending-actions" aria-label="Ações operacionais">
            <h2>Ações para revisar</h2>
            {pendingState.actions.map((item) => (
              <PendingActionCard
                key={item.action.id}
                item={item}
                disabled={!apiBaseUrl}
                onDecision={(id, decision) => void decideAction(id, decision)}
              />
            ))}
          </section>
        )}
        {actionsError && (
          <p className="pending-actions__error" role="alert">
            Não foi possível atualizar as ações pendentes: {actionsError}
          </p>
        )}
      </div>

      <form className="chat-composer" onSubmit={submitMessage}>
        <label className="sr-only" htmlFor="chat-message">
          Mensagem para OpsPilot
        </label>
        <textarea
          id="chat-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Descreva o alerta ou a situação…"
          rows={2}
          disabled={!apiBaseUrl || isSending}
        />
        <div className="chat-composer__footer">
          <span>
            {apiBaseUrl
              ? "As respostas são vinculadas à conversa atual."
              : "Configure o endereço da API para começar."}
          </span>
          <button
            type="submit"
            disabled={!apiBaseUrl || !trimmedMessage || isSending}
          >
            {isSending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </form>
    </section>
  );
}
