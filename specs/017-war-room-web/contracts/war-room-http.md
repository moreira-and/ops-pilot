# Contrato HTTP: War Room

A API HTTP continua sendo responsável pela execução do chat, estado das ações pendentes e mutações de incidente. Corpos de requisição e resposta são validados com schemas Zod compartilhados. O navegador usa o endereço-base configurado e acrescenta os caminhos das operações sem descartar um prefixo configurado.

## `POST /chat`

Aceita os campos existentes de chat e continua retornando 200 quando nenhuma ação requer aprovação.

### Requisição

```json
{
  "message": "Open an incident for the checkout service",
  "userId": "8bd40b90-b1c8-4ab0-82a9-27be74b85e36",
  "conversationId": "conversation-id"
}
```

`message` e `userId` são obrigatórios. `conversationId`, `strategy` e `reflact` mantêm o comportamento opcional existente. O navegador gera e persiste um UUID `userId`; ele não é uma identidade autenticada.

### Sucesso: `200 OK`

A resposta existente permanece inalterada: `answer`, `trace` tipado, `metrics`, `requestId` e `conversationId`.

### Ação pendente: `202 Accepted`

Retornado quando uma ou mais ações operacionais compatíveis aguardam decisão. O resultado do chat e o trace são mantidos, e cada ação pendente é representada separadamente.

```json
{
  "requestId": "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1",
  "conversationId": "conversation-id",
  "answer": "An incident action is waiting for your decision.",
  "trace": [],
  "metrics": {
    "llmCalls": 1,
    "latencyMs": 25
  },
  "pendingActions": [
    {
      "id": "b81ef9a6-9465-43ad-85a8-19b4d13c6a5e",
      "requestId": "c1d9a7f1-a944-4ace-b7d8-6ab7f7c947b1",
      "kind": "open_incident",
      "summary": "Open a high-severity incident for checkout",
      "details": {
        "title": "Checkout unavailable",
        "service": "checkout",
        "severity": "high"
      },
      "status": "pending"
    }
  ]
}
```

Somente ações retornadas pela API podem ser decididas. O servidor persiste a ação validada antes de retornar 202 e não a executa até a aprovação. O navegador apresenta um cartão por ação.

O servidor só emite ações 202 que passam pelo schema completo compartilhado. Como proteção para respostas parciais de implantações incompatíveis, o cliente mantém visível uma ação cujo `status` é `pending`, mas remove campos não permitidos e desabilita a decisão se `id` ou detalhes tipados estiverem ausentes.

### Erros

Erros existentes de validação, estratégia, conversa, timeout, modelo e execução interna mantêm status e formatos atuais. Uma resposta 202 nunca é apresentada como operação concluída.

## `GET /actions?userId=...`

Lista ações não resolvidas (`pending`, `processing`, `failed` ou `reconciliation_required`) associadas ao ID anônimo fornecido. O `userId` é validado como UUID; o endpoint não o trata como autenticação. Essa consulta permite restaurar cartões e estados não confirmados ao abrir ou recarregar a sala.

### Sucesso: `200 OK`

Retorna uma lista validada de ações com `id`, `requestId`, `kind`, `summary`, `details` e `status`. Uma lista vazia é válida. O payload interno de execução não é necessário para renderizar o cartão e não é retornado. Somente ações `pending` habilitam controles de decisão; `processing`, `failed` e `reconciliation_required` permanecem visíveis sem permitir uma nova execução.

### Erro: `400 Bad Request`

Um `userId` malformado retorna erro de validação e não consulta ações.

## `POST /actions/:id/decision`

Registra uma decisão explícita para uma ação pendente.

### Requisição

```json
{
  "userId": "8bd40b90-b1c8-4ab0-82a9-27be74b85e36",
  "decision": "approve"
}
```

`decision` é exatamente `approve` ou `deny`. A API valida o ID da ação, o corpo da requisição, a associação com `userId` e o payload antes de agir.

### Sucesso: `200 OK`

```json
{
  "id": "b81ef9a6-9465-43ad-85a8-19b4d13c6a5e",
  "status": "approved",
  "result": {
    "id": "incident-id",
    "status": "open"
  }
}
```

Para `deny`, a resposta usa `status: "denied"` e não tem resultado de operação. Repetir a mesma decisão retorna o resultado terminal registrado sem repetir a mutação.

### Erros

| Status | Condição | Comportamento |
|---|---|---|
| `400 Bad Request` | Corpo ou identificador de ação inválido | Nenhuma ação é executada |
| `404 Not Found` | A ação não existe ou não está associada ao `userId` informado | Nenhum detalhe da ação é exposto |
| `409 Conflict` | A ação está em processamento, requer reconciliação ou já recebeu decisão terminal diferente | Nenhuma operação concorrente é executada |
| `500 Internal Server Error` | A operação aprovada falha | Retorna erro explícito; nunca afirma que a aprovação foi concluída |

O servidor armazena a decisão terminal e o resultado para que novas tentativas não executem a mesma ação novamente. Uma operação falha não é repetida silenciosamente; ações interrompidas em `processing` são marcadas para reconciliação e não podem ser aprovadas de novo automaticamente.

## CORS

O servidor lê a origem web autorizada exata de `CORS_ORIGIN`, incluindo esquema, host e porta, mas não `/opspilot/`. Em desenvolvimento pode ser configurado `http://localhost:5173`; cada ambiente publicado deve configurar sua origem confiável real.

- Responder ao preflight `OPTIONS` de requisições `POST` JSON.
- Permitir somente os métodos usados pela interface: `GET`, `POST` e `OPTIONS`.
- Permitir `Content-Type`; não habilitar credenciais nem origens curinga.
- Requisições de origens não listadas não recebem permissão para ler respostas da API.
- CORS não é autenticação. O controle de acesso pela infraestrutura de implantação continua obrigatório.

## Publicação e configuração do frontend

O frontend estático é compilado para `/opspilot/`. O endereço-base informado pelo usuário pode conter um prefixo de caminho; o cliente acrescenta caminhos como `/chat`, `/actions?userId=...` e `/actions/:id/decision` sem substituir esse prefixo. A URL rejeita credenciais embutidas, query e fragmento. Um valor inicial público pode ser fornecido em tempo de build por `VITE_API_BASE_URL`; a configuração salva pelo operador no navegador tem precedência. Nenhum segredo pode ser colocado em variável `VITE_*`.
