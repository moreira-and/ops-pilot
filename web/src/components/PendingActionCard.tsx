import type {
  PendingActionStatus,
} from "../../../src/contracts/war-room.js";
import {
  canDecide,
  type PendingActionItem,
} from "../pending-action-state.js";

const statusLabels: Record<PendingActionStatus, string> = {
  pending: "Aguardando decisão",
  processing: "Em execução",
  approved: "Aprovada",
  denied: "Negada",
  failed: "Falha na execução",
  reconciliation_required: "Requer reconciliação",
};

export interface PendingActionCardProps {
  item: PendingActionItem;
  disabled?: boolean;
  onDecision: (id: string, decision: "approve" | "deny") => void;
}

export function PendingActionCard({
  item,
  disabled = false,
  onDecision,
}: PendingActionCardProps) {
  const { action } = item;
  const canSubmitDecision = canDecide(item) && !disabled;
  const incomplete = action.status === "pending" &&
    (action.id === undefined || !("details" in action));

  function decide(decision: "approve" | "deny") {
    if (disabled || !canDecide(item)) return;
    onDecision(item.action.id, decision);
  }

  return (
    <article
      className="pending-action"
      aria-label={`Ação proposta: ${action.summary ?? "Ação pendente"}`}
    >
      <header className="pending-action__header">
        <div>
          <span className="eyebrow">AÇÃO OPERACIONAL</span>
          <h3>{action.summary ?? "Ação pendente"}</h3>
        </div>
        <span className={`pending-action__status pending-action__status--${action.status}`}>
          {statusLabels[action.status]}
        </span>
      </header>

      <dl className="pending-action__details">
        {"details" in action && action.kind === "open_incident"
          ? (
            <>
              <div><dt>Incidente</dt><dd>{action.details.title}</dd></div>
              <div><dt>Serviço</dt><dd>{action.details.service}</dd></div>
              <div><dt>Severidade</dt><dd>{action.details.severity}</dd></div>
            </>
          )
          : "details" in action && action.kind === "resolve_incident"
          ? <div><dt>Incidente</dt><dd>{action.details.id}</dd></div>
          : null}
      </dl>

      {incomplete && (
        <p className="pending-action__error" role="status">
          A API retornou uma ação sem identificador ou detalhes suficientes.
          Os controles estão desabilitados para evitar uma decisão incorreta.
        </p>
      )}
      {item.decision?.status === "approved" && (
        <p className="pending-action__result" role="status">
          Aprovada: {item.decision.result.title} ({item.decision.result.status}).
        </p>
      )}
      {item.decision?.status === "denied" && (
        <p className="pending-action__result" role="status">Ação negada.</p>
      )}
      {item.error && <p className="pending-action__error" role="alert">{item.error}</p>}

      <footer className="pending-action__controls">
        <button
          type="button"
          className="button button--secondary"
          disabled={!canSubmitDecision}
          onClick={() => decide("deny")}
        >
          Negar
        </button>
        <button
          type="button"
          className="button"
          disabled={!canSubmitDecision}
          onClick={() => decide("approve")}
        >
          {item.isDeciding ? "Aguardando API…" : "Aprovar"}
        </button>
      </footer>
    </article>
  );
}
