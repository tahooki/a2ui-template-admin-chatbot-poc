# A2UI Proxy Agent

The Proxy Agent sits between the Chatbot and Main Agent.

```text
Chatbot -> A2UI Proxy Agent -> Main Agent -> business data
                    |
                    +-> A2UI Agent -> display options -> selected Surface
```

It relays Main Agent text events, keeps `data_result` server-side, asks the A2UI Agent for template candidates, and returns a Surface only after the user selects a template.
