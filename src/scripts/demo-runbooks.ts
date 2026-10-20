import { z } from "zod";
import {
  runbookRecordSchema,
  type RunbookRecord,
} from "../services/operational-store.js";

const runbooksSchema = z.array(runbookRecordSchema).length(3);

export const DEMO_RUNBOOKS: RunbookRecord[] = runbooksSchema.parse([
  {
    id: "runbook-checkout",
    serviceId: "checkout",
    title: "Investigar falhas no checkout",
    instructions:
      "Verifique a taxa de erros e a latência do checkout, confirme a saúde das dependências de catálogo e pagamentos, e valide o fluxo com uma transação de teste antes de encerrar o incidente.",
  },
  {
    id: "runbook-payments",
    serviceId: "payments",
    title: "Investigar fila de pagamentos",
    instructions:
      "Inspecione o tamanho e a idade das mensagens na fila, confira os erros recentes dos provedores e a saúde dos consumidores, e não repita cobranças sem validar a idempotência.",
  },
  {
    id: "runbook-auth",
    serviceId: "auth",
    title: "Investigar falhas de autenticação",
    instructions:
      "Verifique disponibilidade e latência do serviço de autenticação, confira erros de emissão e validação de tokens e valide a conectividade com seus provedores de identidade.",
  },
]);
