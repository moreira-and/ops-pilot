# Quickstart: validar Trace Persistido e Logs JSON

## Pré-requisitos

- Node.js 22 e dependências do projeto instaladas.
- Nenhuma credencial OpenRouter ou rede externa é necessária para os testes.
- Os testes devem injetar stores SQLite em memória e estratégias fake.

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

   **Esperado**: testes existentes e novos passam sem acessar o banco persistente ou serviços externos.

## Cenários de aceitação

- Enviar `POST /chat` válido; verificar que `requestId` do corpo é idêntico ao cabeçalho `X-Request-Id`.
- Completar o chat e consultar `GET /requests/:id`; verificar registro, métricas e todos os eventos em sequência crescente.
- Consultar ID inexistente; verificar 404 e ausência de dados de outras solicitações.
- Criar dois eventos com o mesmo horário; verificar que a consulta preserva a ordem de sequência.
- Exercitar falha de estratégia após atribuição do ID; verificar estado `failed`, correlação no erro e ausência de resultado de sucesso.
- Emitir evento de log contendo metadados e valores de payload; verificar uma única linha JSON por evento e ausência dos valores de mensagem, resposta, payload ou segredo.
- Simular falha de persistência; verificar que o resultado não indica sucesso com trace persistido.

## Referências

- Contrato de API e logging: [contracts/request-trace.md](./contracts/request-trace.md)
- Entidades e validações: [data-model.md](./data-model.md)
- Requisitos e critérios: [spec.md](./spec.md)
