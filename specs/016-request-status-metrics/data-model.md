# Data Model: Métricas Agregadas de Solicitações

## RequestStatusRecord

Projeção de uma execução persistida necessária para agregar status em uma janela.

| Campo | Tipo | Regra |
|---|---|---|
| `id` | string | UUID da solicitação |
| `route` | rota ou null | rota final persistida; null quando não foi determinada |
| `modelUsed` | string ou null | modelo efetivo associado à resposta; null quando indisponível |
| `promptTokens` | integer ou null | tokens de entrada reportados; campo persistido existente |
| `completionTokens` | integer ou null | tokens de saída reportados; nullable para provedores ou registros antigos sem uso |
| `latencyMs` | number ou null | latência não negativa, quando disponível |
| `status` | enum | `running`, `ok` ou `failed` |
| `startedAt` | Date | início usado para inclusão na janela |

**Persistência**: manter a coluna `prompt_tokens`; adicionar `completion_tokens` em migração SQLite aditiva. Criar índice para consultas por `started_at`. Não renomear nem apagar colunas existentes.

## ModelPrice

Preço local para estimar custo de uma solicitação usando seu `modelUsed`.

| Campo | Tipo | Regra |
|---|---|---|
| `modelId` | string | identificador exato, não vazio e único na tabela |
| `inputUsdPerMillion` | number | valor finito não negativo em USD por milhão de tokens de entrada |
| `outputUsdPerMillion` | number | valor finito não negativo em USD por milhão de tokens de saída |

IDs terminados em `:free` custam USD 0 sem depender de um registro de preço. Não existem taxas embutidas até serem aprovadas e cadastradas pela aplicação. A estimativa usa a tabela vigente quando a consulta é feita.

## StatusAggregate

Resumo do conjunto de solicitações iniciado na janela selecionada.

| Campo | Tipo | Regra |
|---|---|---|
| `since` | string | duração validada ou padrão `24h` |
| `from`, `to` | ISO date-time | limites da janela, com ambos os extremos incluídos |
| `total` | integer | todos os estados, incluindo `running` |
| `errors` | integer | solicitações com `status: "failed"` |
| `tokens.input` | integer | soma das contagens de entrada conhecidas |
| `tokens.output` | integer | soma das contagens de saída conhecidas |
| `tokens.total` | integer ou null | soma completa; null se alguma solicitação não tiver ambas as contagens |
| `tokens.unreportedRequests` | integer | solicitações sem ao menos uma contagem de token |
| `cost.usd` | number ou null | estimativa completa; null se algum custo não puder ser calculado |
| `cost.costUnavailableRequests` | integer | solicitações que impedem um custo total completo |
| `cost.unpricedRequests` | integer | modelos pagos sem preço cadastrado |
| `latencyMs.p50`, `latencyMs.p95` | number ou null | nearest-rank sobre latências conhecidas dos estados terminais |
| `byRoute` | array de grupos | mesmo agregado para cada rota, incluindo rota nula |
| `byModel` | array de grupos | mesmo agregado para cada `modelUsed`, incluindo modelo nulo |

`input` e `output` somam somente os valores conhecidos. Se existir solicitação com tokens incompletos, `total` é nulo para não apresentar soma parcial como completa. Um grupo vazio não é emitido; o conjunto sem solicitações retorna contadores/tokens iguais a zero, `cost.usd: 0` e percentis nulos.

## Regras de cálculo

- Filtrar `startedAt >= from` e `startedAt <= to`.
- `errors` conta somente `failed`; `running` permanece em `total`.
- `p50` e `p95` consideram `latencyMs` disponíveis de estados terminais, ordenados crescente. Para N valores, nearest-rank usa o elemento de índice `ceil(p * N) - 1`.
- Um custo individual é zero para `modelUsed` terminado em `:free`; caso contrário, exige preço cadastrado e tokens de entrada e saída. O cálculo é `(input * inputUsdPerMillion + output * outputUsdPerMillion) / 1_000_000`.
- `cost.usd` é nulo quando há solicitação cujo custo individual não pode ser calculado; `unpricedRequests` identifica o subconjunto sem preço de modelo.
- A tabela de preço é aplicada ao `modelUsed` efetivo no nível da solicitação; não divide tokens entre chamadas de modelos primário/fallback.
- Grupos e arrays devem ter ordenação determinística: chave nula primeiro, depois valores em ordem lexical crescente.

## Compatibilidade e validação

- `prompt_tokens` continua sendo a métrica de entrada para compatibilidade; `completion_tokens` nullable é adicionado sem apagar registros anteriores.
- Valores legados sem `completion_tokens` contam em `unreportedRequests` e podem tornar custo e total de tokens indisponíveis.
- Validar métricas, tabela de preços e objeto de saída com Zod.
- Valores temporais e preços não são interpolados em SQL; usar statements preparados e parâmetros vinculados.
