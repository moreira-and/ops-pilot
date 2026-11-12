# Data Model: Trace Persistido e Logs JSON

## RequestRecord

Representa uma solicitação de chat em processamento, concluída ou falha. O registro de sucesso é escrito no nó final do grafo com os dados efetivos da resposta; uma falha de execução pode gravar um registro sem os valores que ainda não estavam disponíveis.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | string | UUID gerado pelo serviço; chave primária e identificador de correlação |
| `userId` | string | identificador não vazio do operador enviado ao chat |
| `route` | string ou null | estratégia selecionada; null se a execução falhar antes da seleção |
| `modelUsed` | string ou null | identificador do modelo que produziu a resposta, se disponível |
| `promptTokens` | integer ou null | número não negativo informado pelo modelo, se disponível |
| `latencyMs` | number ou null | latência não negativa, se disponível |
| `status` | enum | `running` durante o processamento; `ok` para sucesso e `failed` para falha |
| `startedAt` | Date | obrigatório; instante em que o processamento começa |
| `completedAt` | Date ou null | null enquanto `running`; instante em que a execução termina nos estados terminais |
| `errorCode` | string ou null | código sanitizado em falha; não contém mensagem, stack ou segredo |

**Persistência**: tabela `requests`. Armazenar `userId`, `route`, `modelUsed`, `promptTokens`, `latencyMs` e `status` como campos consultáveis, além dos horários e código de erro.

## TraceEventRecord

Representa um evento do trace pertencente a uma única solicitação.

| Campo | Tipo | Regra |
|---|---|---|
| `requestId` | string | obrigatório; chave estrangeira para `requests.id` |
| `sequence` | integer | não negativo; ordem estável dentro da solicitação |
| `node` | string | obrigatório e não vazio; nó produtor do evento |
| `type` | string | tipo do evento conforme a união `TraceEvent` existente |
| `payload` | objeto JSON | evento completo, igual ao `TraceEvent` validado |
| `createdAt` | Date | horário de persistência do evento |

**Persistência**: tabela `trace_eventos`, com chave composta por `requestId` e `sequence`. `sequence` é a posição do evento no trace completo; o payload JSON contém o evento completo. A consulta é ordenada por `sequence`, não apenas por `createdAt`.

## LogEvent

Representa uma linha de observabilidade, independente do payload persistido no trace.

| Campo | Tipo | Regra |
|---|---|---|
| `level` | string | nível do evento, por exemplo `info` |
| `timestamp` | string | instante em ISO 8601 |
| `requestId` | string ou ausente | identificador da solicitação quando disponível |
| `node` | string | nome do nó, por exemplo `resposta` |
| `type` | string | tipo do evento, por exemplo `done` |
| `route` | string | rota selecionada |
| `tokens` | integer ou ausente | prompt tokens não negativos, quando disponíveis |

O logger aceita apenas campos permitidos e emite um objeto JSON por linha. Não existe relação persistida entre `LogEvent` e payloads de trace.

## Relações e transições

- `RequestRecord 1 -> 0..N TraceEventRecord`.
- Cada evento referencia exatamente uma solicitação existente.
- O registro começa com `status: "running"`. Um sucesso é salvo com `status: "ok"`; uma falha é salva com `status: "failed"`.
- Uma falha de execução pode não conter rota, modelo, tokens ou trace se esses valores ainda não estavam disponíveis.
- Uma falha ao persistir o registro/eventos é explicitada pela operação de serviço; não gera resposta de sucesso alegando persistência concluída.

## Validação

- Validar os identificadores e objetos de fronteira com Zod.
- Rejeitar estado fora de `running`, `ok` ou `failed`.
- Exigir `completedAt` para estados terminais e mantê-lo nulo para `running`.
- Validar a rota e os identificadores de modelo quando presentes; validar `promptTokens` como inteiro não negativo e `latencyMs` como número não negativo.
- Validar eventos reconstruídos com `traceEventSchema`.
- Utilizar queries estáticas preparadas e parâmetros vinculados; habilitar chaves estrangeiras e impor `NOT NULL`, unicidade e chave composta no SQLite.
- Não usar conteúdo de evento, mensagem, resposta ou payload como campo de log.
