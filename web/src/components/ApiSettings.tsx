import { useReducer, type FormEvent } from "react";
import {
  createSettingsFormState,
  saveSettingsForm,
  settingsFormReducer,
} from "../settings-state.js";

export interface ApiSettingsProps {
  apiBaseUrl: string | null;
  onSave: (apiBaseUrl: string) => void;
}

export function ApiSettings({ apiBaseUrl, onSave }: ApiSettingsProps) {
  const [state, dispatch] = useReducer(
    settingsFormReducer,
    apiBaseUrl,
    createSettingsFormState,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = saveSettingsForm(state, window.localStorage, apiBaseUrl);
    if (saved.apiBaseUrl === null) {
      dispatch({ type: "saveFailed", error: saved.state.error ?? "URL inválida." });
      return;
    }
    dispatch({ type: "saved", apiBaseUrl: saved.apiBaseUrl });
    onSave(saved.apiBaseUrl);
  }

  return (
    <div className="api-settings">
      <button
        type="button"
        className="api-settings__toggle"
        aria-label="Configurações da API"
        aria-expanded={state.isOpen}
        onClick={() =>
          dispatch(state.isOpen
            ? { type: "closed" }
            : { type: "opened", currentApiBaseUrl: apiBaseUrl })}
      >
        <span aria-hidden="true">⚙</span>
      </button>
      {state.isOpen && (
        <form className="api-settings__form" onSubmit={submit}>
          <label htmlFor="api-base-url">URL base da API</label>
          <input
            id="api-base-url"
            type="url"
            autoComplete="url"
            value={state.draft}
            onChange={(event) =>
              dispatch({ type: "changed", draft: event.target.value })}
            placeholder="https://api.example/opspilot"
          />
          <p className="api-settings__hint">
            Destino atual: <code>{apiBaseUrl ?? "Não configurado"}</code>
          </p>
          {state.error && <p className="api-settings__error" role="alert">{state.error}</p>}
          <p className="api-settings__hint">
            A URL fica salva neste navegador. Não inclua credenciais; erros de
            conexão e CORS serão exibidos pela conversa.
          </p>
          <div className="api-settings__actions">
            <button
              type="button"
              className="button button--secondary"
              onClick={() => dispatch({ type: "closed" })}
            >
              Cancelar
            </button>
            <button type="submit" className="button">Salvar</button>
          </div>
        </form>
      )}
    </div>
  );
}
