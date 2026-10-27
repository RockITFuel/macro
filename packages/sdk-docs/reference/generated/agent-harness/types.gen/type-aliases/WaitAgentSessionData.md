# Type Alias: WaitAgentSessionData

> **WaitAgentSessionData** = \{ `body?`: `never`; `path`: \{ `session_id`: `string`; \}; `query?`: \{ `timeoutMs?`: `number`; \}; `url`: `"/agent-sessions/{session_id}/wait"`; \}

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `never` | - |
| <a id="property-path"></a> `path` | \{ `session_id`: `string`; \} | - |
| `path.session_id` | `string` | ID of the agent session |
| <a id="property-query"></a> `query?` | \{ `timeoutMs?`: `number`; \} | - |
| `query.timeoutMs?` | `number` | Milliseconds to wait before returning with `timedOut`; default 120000, at most 600000. |
| <a id="property-url"></a> `url` | `"/agent-sessions/{session_id}/wait"` | - |
