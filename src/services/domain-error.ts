export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class EntityNotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} "${id}" was not found.`, "ENTITY_NOT_FOUND");
  }
}

export class ConversationNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Conversation", id);
  }
}

export class RequestNotFoundError extends EntityNotFoundError {
  constructor(id: string) {
    super("Request", id);
  }
}

export class ValidationDomainError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}

export class InvalidSinceParameterError extends ValidationDomainError {
  constructor() {
    super("Invalid since parameter");
  }
}

export class SummarizationFailedError extends DomainError {
  constructor(message = "Conversation summarization failed.") {
    super(message, "SUMMARIZATION_FAILED");
  }
}

export class PendingActionNotFoundError extends DomainError {
  constructor() {
    super("Pending action not found.", "PENDING_ACTION_NOT_FOUND");
  }
}

export class PendingActionConflictError extends DomainError {
  constructor() {
    super("Pending action cannot accept this decision.", "PENDING_ACTION_CONFLICT");
  }
}

export class PendingActionExecutionError extends DomainError {
  constructor() {
    super("Approved incident action failed.", "PENDING_ACTION_EXECUTION_FAILED");
  }
}
