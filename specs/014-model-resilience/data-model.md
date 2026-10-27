# Data Model: Resiliência de Modelo

Sem persistência nova; apenas tipos/schemas Zod.

## ModelConfig (estendido)
| Campo | Tipo | Regra |
|---|---|---|
| model | string | obrigatório (existente) |
| fallbackModel | string? | opcional; trim; vazio → ausente; ≠ `model` |
| maxRetries | number | padrão 2 (retentativas no primário) |

## TraceEvent `fallback` (novo na união)
| Campo | Tipo |
|---|---|
| type | `"fallback"` |
| sequence, node | herdados |
| from | string (modelo primário) |
| to | string (modelo reserva) |
| reason | string (mensagem curta e sanitizada) |

## ReasoningMetrics (estendido)
| Campo | Tipo |
|---|---|
| modelUsed | string? — modelo que produziu a resposta final |

## ModelUnavailableError
Erro de domínio, sem campos sensíveis; mensagem genérica. Causa original só em `cause` (não serializada).
