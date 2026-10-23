import { z } from "zod";
import { createModel } from "../agents/model.js";
import type { MemoryRecord } from "../memory/memory-types.js";
import { containsSecret } from "./memory-safety.js";

export const learningCandidateSchema = z.object({
  hasLearning: z.boolean(),
  fact: z.string().trim().max(500),
});

export type LearningCandidate = z.infer<typeof learningCandidateSchema>;

export interface LearningExtractor {
  extract(message: string): Promise<unknown>;
}

export interface LearningMemoryWriter {
  remember(userId: string, fact: string): Promise<MemoryRecord>;
}

export interface LearningLogger {
  info?(message: string): void;
  error(message: string, details: { errorName: string }): void;
}

export type LearningOutcome =
  | { status: "skipped" }
  | { status: "remembered"; memory: MemoryRecord };

export const LEARNING_EXTRACTION_PROMPT =
  "Identifique no máximo um fato duradouro declarado explicitamente pela " +
  "pessoa e que possa melhorar conversas futuras. Aprenda preferências " +
  "duradouras ou contexto pessoal/profissional estável, não perguntas, pedidos " +
  "ou instruções pontuais, suposições nem conteúdo escrito pelo assistente. " +
  "Nunca retorne senhas, tokens, chaves, credenciais ou outros segredos. " +
  "Escreva o fato no mesmo idioma da mensagem da pessoa, de forma concisa, " +
  "para manter a recuperação semântica nesse idioma. Se não houver fato " +
  "duradouro e seguro declarado explicitamente, retorne " +
  "{ hasLearning: false, fact: \"\" }.";

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export function createLearningExtractor(
  modelFactory: typeof createModel = createModel,
): LearningExtractor {
  let model: ReturnType<typeof createModel> | undefined;
  return {
    async extract(message) {
      model ??= modelFactory();
      const structured = model.withStructuredOutput(learningCandidateSchema);
      return structured.invoke([
        ["system", LEARNING_EXTRACTION_PROMPT],
        ["user", message],
      ]);
    },
  };
}

export function createLearningService(
  dependencies: {
    extractor: LearningExtractor;
    remember(userId: string, fact: string): Promise<MemoryRecord>;
    logger?: LearningLogger;
  },
) {
  const logger = dependencies.logger ?? console;
  return {
    async learn(userIdInput: string, messageInput: string): Promise<LearningOutcome> {
      const userId = z.string().trim().min(1).parse(userIdInput);
      const message = z.string().trim().min(1).parse(messageInput);
      if (containsSecret(message)) return { status: "skipped" };

      const output = await dependencies.extractor.extract(message);
      const candidate = learningCandidateSchema.parse(output);
      if (candidate.hasLearning && !candidate.fact) {
        throw new Error("Learning extractor returned an empty fact.");
      }
      if (!candidate.hasLearning || containsSecret(candidate.fact)) {
        return { status: "skipped" };
      }

      const memory = await dependencies.remember(userId, candidate.fact);
      logger.info?.("Durable user memory learned.");
      return { status: "remembered", memory };
    },
  };
}

export function logLearningFailure(
  logger: LearningLogger,
  error: unknown,
): void {
  logger.error("Asynchronous memory learning failed.", {
    errorName: errorName(error),
  });
}
