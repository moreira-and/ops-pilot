#!/usr/bin/env bash
# Conversa longa: imprime o promptTokens de cada turno do /chat.
# Uso: BASE_URL=http://localhost:3000 TURNS=10 ./conversa-longa.sh
set -u

BASE_URL="${BASE_URL:-http://localhost:3000}"
TURNS="${TURNS:-10}"
USER_ID="${USER_ID:-operador-conversa-longa}"
conversation_id=""

for turn in $(seq 1 "$TURNS"); do
  payload=$(TURN="$turn" USER_ID="$USER_ID" CONVERSATION_ID="$conversation_id" node -e '
    const body = {
      message: `Turno ${process.env.TURN}: resuma o estado dos alertas e o que ja foi investigado.`,
      userId: process.env.USER_ID,
    };
    if (process.env.CONVERSATION_ID) body.conversationId = process.env.CONVERSATION_ID;
    process.stdout.write(JSON.stringify(body));
  ')
  response_file=$(mktemp)
  status=$(curl -s -o "$response_file" -w '%{http_code}' \
    -X POST "$BASE_URL/chat" -H 'content-type: application/json' -d "$payload")

  if [ "$status" != "200" ]; then
    echo "turno $turn erro=$status"
    rm -f "$response_file"
    continue
  fi

  parsed=$(node -e '
    const body = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const tokens = body.metrics?.promptTokens;
    console.log(`${body.conversationId ?? ""} ${Number.isInteger(tokens) ? tokens : "n/a"}`);
  ' "$response_file")
  rm -f "$response_file"
  conversation_id="${parsed% *}"
  echo "turno $turn promptTokens=${parsed##* }"
done
