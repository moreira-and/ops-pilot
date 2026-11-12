# Contrato HTTP: Métricas de Status

## `GET /status?since=24h`

Retorna um resumo de solicitações iniciadas na janela relativa. `since` é opcional; se omitido, o valor usado é `24h`. Os sufixos aceitos são `m`, `h` e `d`, com valor positivo.

Exemplos válidos: `15m`, `24h`, `7d`.

### Sucesso: `200 OK`

```json
{
  "since": "24h",
  "from": "2026-11-11T00:00:00.000Z",
  "to": "2026-11-12T00:00:00.000Z",
  "total": 3,
  "errors": 1,
  "tokens": {
    "input": 1200,
    "output": 300,
    "total": 1500,
    "unreportedRequests": 0
  },
  "cost": {
    "usd": 0.00006,
    "costUnavailableRequests": 0,
    "unpricedRequests": 0
  },
  "latencyMs": {
    "p50": 120,
    "p95": 240
  },
  "byRoute": [
    {
      "route": "react",
      "total": 2,
      "errors": 1,
      "tokens": {
        "input": 900,
        "output": 200,
        "total": 1100,
        "unreportedRequests": 0
      },
      "cost": {
        "usd": 0.00004,
        "costUnavailableRequests": 0,
        "unpricedRequests": 0
      },
      "latencyMs": {
        "p50": 100,
        "p95": 100
      }
    }
  ],
  "byModel": [
    {
      "modelUsed": "provider/model",
      "total": 2,
      "errors": 1,
      "tokens": {
        "input": 900,
        "output": 200,
        "total": 1100,
        "unreportedRequests": 0
      },
      "cost": {
        "usd": 0.00004,
        "costUnavailableRequests": 0,
        "unpricedRequests": 0
      },
      "latencyMs": {
        "p50": 100,
        "p95": 100
      }
    }
  ]
}
```

`byRoute` usa a chave `route`; `byModel` usa `modelUsed`. A resposta real inclui todos os grupos não vazios no período, inclusive grupos com chave nula para rota/modelo indisponível. Grupos são ordenados deterministicamente, nulo primeiro e depois lexicalmente.

### Valores incompletos

- `tokens.input` e `tokens.output` somam contagens conhecidas. `tokens.total` é nulo se ao menos um request não informou entrada ou saída; `unreportedRequests` informa quantos.
- `cost.usd` é estimativa em USD e só é número quando todos os custos individuais são calculáveis. Caso contrário, é nulo e `costUnavailableRequests` informa a quantidade incompleta.
- `unpricedRequests` conta solicitações com identificador de modelo conhecido, não gratuito e sem preço cadastrado. Um `modelUsed` nulo torna o custo indisponível, mas não é classificado como modelo pago sem preço.
- Modelos com ID terminado em `:free` têm custo zero mesmo sem contagens de tokens. A ausência de tokens continua refletida em `tokens.unreportedRequests` e pode tornar `tokens.total` nulo.
- p50/p95 são nulos quando não há latência conhecida de solicitação terminal.
- Sem solicitações, totais e tokens são zero, custo é zero, e percentis são nulos.

### Erro: `400 Bad Request`

Parâmetro `since` vazio, malformado, não positivo ou com unidade não aceita:

```json
{
  "error": "Invalid since parameter"
}
```

Não é feita consulta de status com sucesso para uma janela inválida. Erros inesperados de SQLite permanecem erros internos e não são convertidos em um agregado vazio.

## Definições

- O intervalo inclui `from` e `to`; `to` é o instante de criação do resumo e `from = to - since`.
- A inclusão é por horário de início da solicitação. Estados `running` contam em `total`; apenas `failed` conta em `errors`.
- Tokens são agregados por solicitação e por seu `modelUsed` efetivo persistido. O custo usa os preços locais vigentes, não uma reconciliação de cobrança OpenRouter.
- A tabela local de preços começa vazia; tarifas pagas só são calculadas depois de cadastradas explicitamente. Valores de preço ausentes nunca são interpretados como custo zero.
