import type { TraceEvent } from "../../../src/agents/reasoning.js";
import type { TraceViewModel } from "../trace-view-model.js";

export interface TraceViewerProps {
  model: TraceViewModel;
  onClose: () => void;
}

function eventContent(event: TraceEvent) {
  switch (event.type) {
    case "thought":
    case "answer":
    case "observation":
      return (
        <>
          <p>{event.content}</p>
          {event.type === "observation" && event.tool && (
            <small>Ferramenta: {event.tool}</small>
          )}
        </>
      );
    case "route":
      return <p>{event.route} — {event.reason} ({event.source})</p>;
    case "action":
      return (
        <>
          <p>{event.tool}</p>
          <pre>{JSON.stringify(event.args, null, 2)}</pre>
        </>
      );
    case "plan":
      return (
        <>
          <p>{event.content}</p>
          <ol>
            {event.steps.map((step) => <li key={step.id}>{step.description}</li>)}
          </ol>
        </>
      );
    case "critique":
      return "content" in event
        ? <p>{event.content}</p>
        : <p>{event.approved ? "Aprovado" : "Revisão necessária"}: {event.feedback}</p>;
    case "summarize":
      return (
        <p>
          Conversa {event.conversationId}: {event.messagesSummarized} mensagens,
          até {event.summarizedThrough}.
        </p>
      );
    case "fallback":
      return <p>{event.from} → {event.to}: {event.reason}</p>;
  }
}

const unavailableMessages = {
  empty: "Não há eventos de raciocínio nesta resposta.",
  invalid: "O trace desta resposta está indisponível ou é inválido.",
  mismatch: "O trace não corresponde a esta resposta.",
};

export function TraceViewer({ model, onClose }: TraceViewerProps) {
  return (
    <section className="trace-viewer" aria-label="Trace da execução">
      <header className="trace-viewer__header">
        <div>
          <span className="eyebrow">EXECUTION TRACE</span>
          <h2>Raciocínio da execução</h2>
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={onClose}
        >
          Fechar
        </button>
      </header>
      {model.status === "unavailable"
        ? <p role="status">{unavailableMessages[model.reason]}</p>
        : (
          <ol className="trace-viewer__events">
            {model.events.map((event, index) => (
              <li
                className="trace-event"
                key={`${event.sequence}-${index}`}
              >
                <header>
                  <span>{event.type}</span>
                  <small>{event.node} · #{event.sequence}</small>
                </header>
                <div className="trace-event__content">{eventContent(event)}</div>
              </li>
            ))}
          </ol>
        )}
    </section>
  );
}
