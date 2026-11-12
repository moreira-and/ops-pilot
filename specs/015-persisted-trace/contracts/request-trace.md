# Contrato: Correlação, Consulta de Trace e Logs

## `POST /chat`

O serviço atribui um `requestId` para a solicitação aceita para processamento.

### Resposta de sucesso: `200 OK`

O corpo de sucesso existente mantém `answer`, `trace` e `metrics`, adicionando `requestId`. O cabeçalho `X-Request-Id` contém o mesmo identificador.

```json
{
  "requestId": "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1",
  "answer": "A resposta do agente",
  "trace": [],
  "metrics": {
    "llmCalls": 1,
    "latencyMs": 25
  }
}
```

O exemplo de trace está abreviado. Os eventos persistidos preservam os campos e a semântica da união `TraceEvent` existente.

### Erros após atribuição do identificador

Se a execução falhar depois que o serviço atribuiu o identificador, o cabeçalho `X-Request-Id` e a resposta de erro incluem o mesmo `requestId`. O status e o formato de erro existentes permanecem aplicáveis; a falha não contém payload de resultado de sucesso.

Solicitações rejeitadas pela validação inicial não exigem registro de execução ou `requestId`.

## `GET /requests/:id`

Retorna o registro da solicitação e todos os eventos do trace associados ao identificador consultado.

### Sucesso: `200 OK`

```json
{
  "request": {
    "id": "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1",
    "userId": "operator-1",
    "route": "react",
    "modelUsed": "provider/model",
    "promptTokens": 12,
    "latencyMs": 25,
    "status": "ok",
    "startedAt": "2026-11-12T00:00:00.000Z",
    "completedAt": "2026-11-12T00:00:00.025Z",
    "errorCode": null
  },
  "trace": [
    {
      "sequence": 0,
      "type": "answer",
      "node": "response",
      "content": "A resposta do agente"
    }
  ]
}
```

Os campos `route`, `modelUsed`, `promptTokens`, `latencyMs` e `errorCode` podem ser nulos se não estiverem disponíveis. Um registro ainda em processamento tem `status: "running"` e `completedAt: null`. Os eventos são devolvidos por sequência crescente; nenhum evento de outra solicitação pode ser incluído.

### Erro: `404 Not Found`

Um identificador sem solicitação correspondente retorna um erro de entidade não encontrada. A resposta não contém registro ou evento.

## Persistência e consistência

- A solicitação e seus eventos são armazenados em `requests` e `trace_eventos`, respectivamente.
- O registro inclui o ID, `userId`, `route`, `modelUsed`, `promptTokens`, `latencyMs` e `status: "ok"` para sucesso; falhas usam `status: "failed"` e valores nulos quando ainda indisponíveis.
- Eventos referenciam o registro por `requestId`; cada linha registra `seq`, `node`, `type` e o evento completo como `payload`.
- O nó final salva o registro e todos os eventos de forma atômica antes de a resposta de sucesso ser devolvida.
- Eventos são consultados em ordem de sequência.
- Métricas e eventos devem ser validados antes de serem devolvidos.
- Erros de persistência são explícitos; o serviço não deve responder com sucesso se o registro requerido não foi persistido.

## Logging

O ciclo de vida emite eventos `info` de início e conclusão e `error` de falha. O evento de conclusão inclui `requestId`, `node: "resposta"`, `type: "done"`, `route` e `tokens` quando disponíveis. Cada evento de log gera exatamente uma linha JSON. Mensagens, respostas, trace completo, payloads, argumentos de ferramentas, segredos e mensagens/stack traces de erros não são campos válidos do contrato de log.
