# Contrato: falha total de modelo

`POST /chat` (e demais rotas que invocam o modelo), quando primário (após retentativas) e reserva falham:

- **Status**: `503`
- **Corpo**: `{ "error": "Model unavailable" }` (validado com Zod)
- Sem stack, nome de modelo, chave ou mensagem do provedor.
- Erros de configuração ausente continuam fora desse contrato.
