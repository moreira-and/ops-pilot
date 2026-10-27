# Contrato: trace e métricas

- Evento de trace: `{ "type": "fallback", "sequence": n, "node": "...", "from": "<primário>", "to": "<reserva>", "reason": "<texto curto>" }`; emitido apenas quando o reserva é acionado.
- `metrics.modelUsed`: string opcional; presente em execuções que chamaram o modelo; igual ao reserva após fallback.
- Campos existentes permanecem compatíveis (novos campos opcionais/novo membro da união).
