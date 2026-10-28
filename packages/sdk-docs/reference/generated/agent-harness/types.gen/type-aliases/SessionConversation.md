# Type Alias: SessionConversation

> **SessionConversation** = \{ `botId`: `string`; `harness`: `string`; `isArchived`: `boolean`; `messages`: [`SessionConversationMessage`](SessionConversationMessage.md)[]; `model`: `string`; `name`: `string`; `ownerId`: `string`; `sessionId`: `string`; `status`: `string`; `totalMessages`: `number`; `truncated`: `boolean`; \}

A readable session conversation, including tool activity and failures.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-botid"></a> `botId` | `string` | Agent persona id. |
| <a id="property-harness"></a> `harness` | `string` | Configured runtime. |
| <a id="property-isarchived"></a> `isArchived` | `boolean` | Whether the session is archived and read-only. |
| <a id="property-messages"></a> `messages` | [`SessionConversationMessage`](SessionConversationMessage.md)[] | Messages in the requested turn, or the latest messages, oldest first. |
| <a id="property-model"></a> `model` | `string` | Selected model. |
| <a id="property-name"></a> `name` | `string` | User-facing session name. |
| <a id="property-ownerid"></a> `ownerId` | `string` | Owner's principal id. |
| <a id="property-sessionid"></a> `sessionId` | `string` | Session identity. |
| <a id="property-status"></a> `status` | `string` | Last runtime status. |
| <a id="property-totalmessages"></a> `totalMessages` | `number` | Number of messages matching the requested turn before bounding. |
| <a id="property-truncated"></a> `truncated` | `boolean` | Whether older messages or text were omitted. |
