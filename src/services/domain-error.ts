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

export class ValidationDomainError extends DomainError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
  }
}
