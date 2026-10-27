# Type Alias: WaitOptions

> **WaitOptions** = \{ `timeoutMs?`: `number`; \}

How long [AgentSession.wait](../classes/AgentSession.md#wait) waits.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-timeoutms"></a> `timeoutMs?` | `number` | Milliseconds to wait before returning with `timedOut`; default 120000, at most 600000. |
