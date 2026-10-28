# Type Alias: BotActivity

> **BotActivity** = \{ `max_hops`: `number`; `max_runs_per_hour`: `number`; \}

Lets a filter match changes made by agents and bots, within limits that
stop bots from triggering each other forever. A routine never runs for
activity its own runs caused.

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-max_hops"></a> `max_hops` | `number` | Bot hand-offs allowed since the last human action, 1 to 5 (default 3). A run started by a bot that a person started is hop 1. |
| <a id="property-max_runs_per_hour"></a> `max_runs_per_hour` | `number` | Runs bot activity may start per hour, 1 to 60 (default 10). |
