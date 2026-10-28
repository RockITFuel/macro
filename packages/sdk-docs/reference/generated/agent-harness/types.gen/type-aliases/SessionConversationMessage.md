# Type Alias: SessionConversationMessage

> **SessionConversationMessage** = \{ `content`: `string`; `failure?`: `string` \| `null`; `role`: [`SessionMessageRole`](SessionMessageRole.md); `truncated`: `boolean`; `turn`: `number`; \}

One folded prompt or reply.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-content"></a> `content` | `string` | Readable prose, tool activity, outputs, and errors. |
| <a id="property-failure"></a> `failure?` | `string` \| `null` | Terminal runtime error, retained separately even when earlier text is truncated. |
| <a id="property-role"></a> `role` | [`SessionMessageRole`](SessionMessageRole.md) | Whether this message came from the user or agent. |
| <a id="property-truncated"></a> `truncated` | `boolean` | Whether this message's text exceeded the character budget. |
| <a id="property-turn"></a> `turn` | `number` | Turn number; pass it back to read that turn specifically. |
