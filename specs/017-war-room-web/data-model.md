# Modelo de Dados: War Room Web

## Identidade e configurações do navegador

Representa a configuração local usada para chamar uma API a partir de um navegador.

| Campo | Tipo | Validação | Persistência |
|---|---|---|---|
| `apiBaseUrl` | texto URL | Parse Zod de URL; esquema `http:` ou `https:`; sem credenciais, query ou fragmento; barra final normalizada | `localStorage` |
| `userId` | UUID | Gerado uma vez por perfil do navegador e validado como UUID | `localStorage` |
| `conversationId` | texto não vazio ou nulo | Recebido em resposta de chat validada; associado à URL configurada e ao `userId` | `localStorage` |

`userId` é uma chave anônima de correlação exigida pela API de chat existente; não é uma identidade autenticada nem uma credencial de autorização. As configurações do navegador não armazenam tokens ou segredos.

## Interação de chat

Representa uma mensagem do operador e o resultado correspondente da API.

| Campo | Tipo | Validação |
|---|---|---|
| `requestId` | UUID | Identificador existente do trace de solicitação |
| `conversationId` | texto não vazio | Retornado pela API de chat |
| `userId` | UUID | Identificador atual, local ao navegador |
| `message` | texto não vazio | Removido de espaços extras antes do envio |
| `answer` | texto não vazio | Obrigatório em uma resposta normal concluída |
| `trace` | array ordenado de `TraceEvent` | Parseado pela união Zod compartilhada; sequência e campos específicos permanecem tipados |
| `metrics` | objeto de métricas de raciocínio | Validado pelo schema de resposta Zod existente |

Uma interação normal bem-sucedida usa HTTP 200. Se houver ações pendentes, usa HTTP 202 e inclui a coleção validada de ações junto com o resultado do chat. O registro de execução de chat é concluído quando o agente termina; o estado da ação permanece independente e pode continuar pendente depois da resposta 202.

## Ação pendente

Representa uma mutação operacional proposta durante o chat e aguardando uma decisão do operador. Os registros são persistidos no SQLite e listados para o `userId` do navegador para que cartões pendentes possam ser restaurados após uma recarga.

| Campo | Tipo | Validação |
|---|---|---|
| `id` | UUID | Gerado pela API e usado como identificador do recurso de decisão |
| `requestId` | UUID | Referencia a solicitação de chat que propôs a ação |
| `userId` | UUID | Deve corresponder ao ID anônimo de navegador associado à ação |
| `kind` | `open_incident` ou `resolve_incident` | Enum Zod fechado que determina a operação permitida |
| `summary` | texto não vazio | Resumo seguro para exibição, derivado da entrada validada |
| `details` | objeto discriminado | Campos operacionais exibidos para revisão, sem incluir payload de execução não necessário |
| `payload` | objeto discriminado | Validado pelos schemas existentes das ferramentas de incidente; nunca aceito como comando arbitrário não validado |
| `status` | `pending`, `processing`, `approved`, `denied`, `failed` ou `reconciliation_required` | Valores fechados validados e impostos por constraints SQLite |
| `createdAt` | timestamp ISO | Gerado pela API |
| `decidedAt` | timestamp ISO ou nulo | Definido quando uma decisão ou resultado terminal é registrado |
| `result` | resultado de incidente validado ou nulo | Presente somente após execução aprovada com sucesso |
| `errorCode` | texto não vazio ou nulo | Código de domínio seguro; sem stack ou detalhes internos |

### Transições de estado

```text
pending -> processing -> approved
pending -> denied
processing -> failed
processing -> reconciliation_required
```

O store reivindica uma ação pendente por transição condicional antes de executá-la, impedindo decisões concorrentes conflitantes. Repetir a mesma decisão terminal retorna o resultado registrado sem executar a operação novamente. Uma decisão contraditória para uma ação terminal retorna conflito. Falhas são explícitas e nunca são representadas como aprovação. No início do serviço, uma ação que permaneça em `processing` após interrupção é marcada `reconciliation_required`; ela não é repetida automaticamente e exige verificação operacional explícita. A listagem inclui ações `pending`, `processing`, `failed` e `reconciliation_required`, para que a UI nunca perca um resultado que não foi confirmado.

## Relacionamentos

- Uma interação de chat tem zero ou mais ações pendentes.
- Cada ação pendente referencia exatamente uma solicitação de chat e um `userId`.
- Uma decisão se aplica a uma ação pendente e produz um resultado validado ou um erro de domínio.
- A interface renderiza um cartão por ação pendente recebida em 202 e consulta ações ativas ao carregar a sala.
- As configurações do navegador selecionam a API e o contexto de conversa; não autorizam uma decisão.
