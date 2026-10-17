import assert from "node:assert/strict";
import test from "node:test";
import { getModelConfig } from "./model.js";

test("model configuration fails explicitly when required settings are missing", () => {
  assert.throws(
    () => getModelConfig({ OPENROUTER_API_KEY: "test-key" }),
    /OPENROUTES_MODEL/,
  );
  assert.throws(
    () => getModelConfig({ OPENROUTES_MODEL: "test/model" }),
    /OPENROUTER_API_KEY/,
  );
});

test("model configuration uses OpenRouter and deterministic temperature", () => {
  assert.deepEqual(
    getModelConfig({
      OPENROUTER_API_KEY: "test-key",
      OPENROUTES_MODEL: "test/model",
    }),
    {
      apiKey: "test-key",
      model: "test/model",
      baseURL: "https://openrouter.ai/api/v1",
      temperature: 0,
    },
  );
});
