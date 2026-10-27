# Quickstart: validar Resiliência de Modelo

**Pré-requisitos**: `npm install`; não é necessário chave real (testes usam modelos falsos).

1. Configuração: defina `OPENROUTER_MODEL_FALLBACK` (diferente de `OPENROUTES_MODEL`) — ver `.env.example`.
2. `npm run typecheck && npm test`.
3. Cenários cobertos por testes (ver [spec.md](./spec.md)):
   - primário falha 1× → retry responde com o primário (US1.1);
   - primário falha sempre → reserva responde; trace tem `fallback`; `metrics.modelUsed` = reserva (US1.2, US2);
   - sem reserva + primário falha → 503 (US3);
   - ambos falham → 503 sem detalhes internos (US3.1);
   - erro 401/400 → sem retry/fallback (FR-008);
   - reserva = primário → `ModelConfigurationError` (FR-009).
4. Manual (opcional): `npm run dev` com primário inválido e reserva válida; `POST /chat` deve responder com `metrics.modelUsed` do reserva. Contratos: [http-503](./contracts/http-503.md), [trace-metrics](./contracts/trace-metrics.md).
