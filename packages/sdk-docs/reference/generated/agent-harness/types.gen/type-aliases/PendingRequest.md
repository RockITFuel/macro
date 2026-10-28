# Type Alias: PendingRequest

> **PendingRequest** = \{ `kind`: [`PendingRequestKind`](PendingRequestKind.md); `message`: `string`; `options`: `string`[]; `turn`: `number`; \}

One request the turn is blocked on.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-kind"></a> `kind` | [`PendingRequestKind`](PendingRequestKind.md) | What kind of answer it needs. |
| <a id="property-message"></a> `message` | `string` | The question, or what needs approval, in prose. |
| <a id="property-options"></a> `options` | `string`[] | The choices offered, when the request offers fixed ones. |
| <a id="property-turn"></a> `turn` | `number` | The turn that asked. |
