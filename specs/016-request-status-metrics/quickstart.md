# Quickstart: validar Métricas Agregadas de Solicitações

## Pré-requisitos

- Node.js 22 e dependências do projeto instaladas.
- SQLite em memória nos testes; nenhuma credencial OpenRouter ou rede externa é necessária.
- Uma tabela de preços fake determinística para cenários de custo pago. A tabela local versionada começa vazia; preços pagos não são presumidos.

## Validação automatizada

1. Verificar os tipos:

   ```sh
   npm run typecheck
   ```

   **Esperado**: compilação TypeScript concluída sem erros.

2. Executar a suíte:

   ```sh
   npm test
   ```

   **Esperado**: testes existentes e novos passam sem acesso ao banco de produção ou serviços externos.

## Cenários de aceitação

- Inserir registros antes, dentro e depois da janela e consultar `GET /status?since=24h`; conferir `total`, erros e limites retornados.
- Consultar sem `since`; conferir que a janela usada é `24h`.
- Consultar com `since` inválido; conferir HTTP 400 e que não há resposta em formato de sucesso.
- Incluir tokens de entrada e saída conhecidos e desconhecidos; conferir as somas, `unreportedRequests` e `tokens.total` nulo quando incompleto.
- Usar tabela fake de preços de entrada/saída; conferir custo para um modelo pago, custo zero para ID `:free` e custo nulo quando a taxa estiver ausente.
- Conferir que `costUnavailableRequests` conta custos pagos sem tarifa ou uso completo; `unpricedRequests` identifica modelos conhecidos sem tarifa. Um modelo nulo torna o custo indisponível, mas não é classificado como modelo pago sem preço.
- Conferir que um ID terminado em `:free` custa zero mesmo sem contagens de tokens; a falta de tokens ainda aparece em `unreportedRequests` e pode tornar `tokens.total` nulo.
- Distribuir solicitações por rotas/modelos e verificar grupos, erros e totais sem mistura entre grupos.
- Criar latências com valores conhecidos e empates; verificar p50/p95 pela regra nearest-rank e a ordenação determinística.
- Abrir um banco criado com o schema de requests legado, iniciar o store novo e conferir que os registros continuam legíveis e `completion_tokens` fica nulo nos dados antigos.

## Preços locais

`src/services/model-pricing.ts` define `LOCAL_MODEL_PRICES` e valida IDs exatos e únicos, com tarifas finitas e não negativas em USD por milhão de tokens. Nenhuma tarifa paga vem cadastrada por padrão; uma configuração de teste pode ser injetada em `createApp` pela opção `modelPrices`. Adicione apenas preços pagos aprovados à tabela local, sem tratar preço ausente como custo zero.

## Referências

- [Contrato HTTP](./contracts/status.md)
- [Entidades e cálculos](./data-model.md)
- [Decisões de pesquisa](./research.md)
