# Type Alias: SessionWait

> **SessionWait** = \{ `conversation`: [`SessionConversation`](SessionConversation.md); `failure?`: `string` \| `null`; `pendingRequests`: [`PendingRequest`](PendingRequest.md)[]; `status`: [`SessionWaitStatus`](SessionWaitStatus.md); `timedOut`: `boolean`; \}

A session's state when a wait ended, with its latest messages.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-conversation"></a> `conversation` | [`SessionConversation`](SessionConversation.md) | The latest messages, bounded as `ReadAgentSession` bounds them. |
| <a id="property-failure"></a> `failure?` | `string` \| `null` | The runtime error that ended the last turn, when `status` is `failed`. |
| <a id="property-pendingrequests"></a> `pendingRequests` | [`PendingRequest`](PendingRequest.md)[] | Requests the turn is blocked on; empty unless `status` is `waiting`. |
| <a id="property-status"></a> `status` | [`SessionWaitStatus`](SessionWaitStatus.md) | Where the current turn stands. |
| <a id="property-timedout"></a> `timedOut` | `boolean` | Whether the wait ended at its deadline with the turn still running. |
