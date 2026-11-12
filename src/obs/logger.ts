import { z } from "zod";

const logMetadataSchema = z.object({
  requestId: z.string().uuid().optional(),
  node: z.enum(["solicitacao", "resposta"]),
  type: z.enum(["start", "done", "failed"]),
  route: z.enum(["react", "plan-and-execute", "reflect:react"]).optional(),
  tokens: z.number().int().nonnegative().optional(),
  latencyMs: z.number().nonnegative().optional(),
  status: z.enum(["ok", "failed"]).optional(),
  errorCode: z.string().regex(/^[A-Z0-9_]+$/).max(64).optional(),
}).strict();

export type LogMetadata = z.infer<typeof logMetadataSchema>;
export type LogWriter = (line: string) => void;

export interface StructuredLogger {
  info(metadata: LogMetadata): void;
  error(metadata: LogMetadata): void;
}

export function createLogger(
  writeLine: LogWriter = (line) => process.stdout.write(line),
): StructuredLogger {
  const emit = (level: "info" | "error", metadataInput: LogMetadata) => {
    const metadata = logMetadataSchema.parse(metadataInput);
    writeLine(`${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      ...metadata,
    })}\n`);
  };

  return {
    info: (metadata) => emit("info", metadata),
    error: (metadata) => emit("error", metadata),
  };
}

export const logger = createLogger();
