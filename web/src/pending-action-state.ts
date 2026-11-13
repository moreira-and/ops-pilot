import type {
  ActionDecisionResponse,
  ClientPendingAction,
  PendingAction,
} from "../../src/contracts/war-room.js";

export interface PendingActionItem {
  action: ClientPendingAction;
  isDeciding: boolean;
  error: string | null;
  decision: ActionDecisionResponse | null;
}

export interface PendingActionState {
  actions: PendingActionItem[];
}

export type PendingActionEvent =
  | { type: "received"; actions: ClientPendingAction[] }
  | { type: "restored"; actions: ClientPendingAction[] }
  | { type: "decisionStarted"; id: string }
  | { type: "decisionSucceeded"; decision: ActionDecisionResponse }
  | { type: "decisionFailed"; id: string; error: string };

export const initialPendingActionState: PendingActionState = { actions: [] };

export function canDecide(
  item: PendingActionItem,
): item is PendingActionItem & { action: PendingAction } {
  return item.action.status === "pending" &&
    !item.isDeciding &&
    item.action.id !== undefined &&
    "details" in item.action;
}

function upsertActions(
  current: PendingActionItem[],
  incoming: ClientPendingAction[],
): PendingActionItem[] {
  const actions = [...current];
  for (const action of incoming) {
    const index = actions.findIndex((item) => item.action.id === action.id);
    const previous = index < 0 ? undefined : actions[index];
    const item: PendingActionItem = {
      action,
      isDeciding: previous?.isDeciding ?? false,
      error: null,
      decision: previous?.decision ?? null,
    };
    if (index < 0) actions.push(item);
    else actions[index] = item;
  }
  return actions;
}

export function pendingActionReducer(
  state: PendingActionState,
  event: PendingActionEvent,
): PendingActionState {
  if (event.type === "received") {
    return { actions: upsertActions(state.actions, event.actions) };
  }
  if (event.type === "restored") {
    return {
      actions: upsertActions(
        state.actions.filter((item) =>
          event.actions.some((action) => action.id === item.action.id)
        ),
        event.actions,
      ),
    };
  }

  const actionId = event.type === "decisionSucceeded"
    ? event.decision.id
    : event.id;
  const index = state.actions.findIndex((item) => item.action.id === actionId);
  if (index < 0) return state;
  const current = state.actions[index];
  if (!current) return state;

  let updated: PendingActionItem;
  switch (event.type) {
    case "decisionStarted":
      if (!canDecide(current)) return state;
      updated = { ...current, isDeciding: true, error: null };
      break;
    case "decisionSucceeded":
      updated = {
        ...current,
        action: { ...current.action, status: event.decision.status },
        isDeciding: false,
        error: null,
        decision: event.decision,
      };
      break;
    case "decisionFailed":
      updated = { ...current, isDeciding: false, error: event.error };
      break;
  }

  const actions = [...state.actions];
  actions[index] = updated;
  return { actions };
}
