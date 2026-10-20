# Operational Agent Tools Contract

This contract describes the operational tools available to an OpsPilot agent. Inputs are validated
before the operation runs. Successful results are JSON representations of the requested records;
domain and storage errors remain explicit failures and MUST NOT be represented as empty success
results.

## Tool descriptions

Every tool description given to the agent must communicate all of the following:

1. Purpose and expected result.
2. When to use the tool.
3. When not to use it.
4. The meaning and required/optional status of every input field.
5. Accepted enum values, aliases, and defaults.
6. Use known identifiers and information; do not invent missing data or claim success before a
   successful result is returned.

In particular, `open_incident` is for a confirmed issue being formally tracked or an explicit user
request to open an incident. It is not a substitute for investigating or summarizing alerts.

## `list_alerts`

| Input | Required | Values / default | Meaning |
|---|---|---|---|
| `status` | No | `firing`, `resolved`, `all`; default `firing` | Selects alert states to return |

Returns alerts matching the requested filter.

## `open_incident`

| Input | Required | Values / default | Meaning |
|---|---|---|---|
| `title` | Yes | Non-empty text | Short title for the confirmed issue |
| `service` | Yes | Existing service identifier | Service affected |
| `severity` | Yes | `critical`, `high`, `medium`, `low`, `sev1`, `sev2`, `sev3`, `sev4` | Incident severity; aliases map in order to `critical`, `high`, `medium`, `low` |

Returns the created incident. The initial state is `open`; `summary` and `resolvedAt` are null.
This feature does not add an operation to populate `summary`. An unknown service is an explicit
error.

## `resolve_incident`

| Input | Required | Values / default | Meaning |
|---|---|---|---|
| `id` | Yes | Non-empty existing incident identifier | Incident to resolve |

Returns the resolved incident, including its resolution time. An unknown identifier is an explicit
error; resolving an already resolved incident does not change its resolution time.

## `list_incidents`

| Input | Required | Values / default | Meaning |
|---|---|---|---|
| `status` | No | `open`, `resolved`, `all`; default `open` | Selects incident states to return |

Returns incidents matching the requested filter.

## `consultar_runbook`

| Input | Required | Values / default | Meaning |
|---|---|---|---|
| `service` | Yes | Existing service identifier with an associated runbook | Service whose procedure is requested |

Returns only the runbook associated with the requested service. Unknown services and services
without a runbook produce an explicit unavailable result and never return another service's
procedure.
