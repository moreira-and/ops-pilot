# ops-pilot

## Servidor HTTP

Inicie o servidor de desenvolvimento na raiz do projeto:

```sh
npm run dev
```

O servidor escuta na porta `3000` por padrão. Para usar outra porta, defina `PORT` antes de iniciar o processo.

Envie uma mensagem para o agente com `POST /chat`. O campo `reflact` habilita a reflexão:

```sh
curl -s localhost:3000/chat -X POST \
  -H 'content-type: application/json' \
  -d '{"message":"abra um incidente sev2 para o catalog","strategy":"react","reflact":true}' \
| jq '{answer, llmCalls: .metrics.llmCalls}'
```