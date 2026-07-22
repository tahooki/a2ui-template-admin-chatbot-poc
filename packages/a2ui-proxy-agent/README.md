# A2UI Proxy Agent

The Proxy Agent sits between the Chatbot and Main Agent.

```text
Chatbot -> A2UI Proxy Agent -> Main Agent -> business data
                    |
                    +-> static templates -> display options -> selected Surface
```

It relays Main Agent text events, keeps `data_result` server-side, and exposes exactly three display options:

- `collection.list`
- `collection.cardGrid`
- `matrix.table`

After the user selects an option, the Proxy normalizes the business data, builds the field mapping, and returns the Surface directly. It does not call an MCP server, A2A Agent, template Admin, or external surface planner.
