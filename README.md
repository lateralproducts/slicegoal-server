# Welcome to the SliceGoal Server

SliceGoal is a tracker for goals, insights, and coaching.
Designed to support optimal outcomes for users.
Helping people focus on the right things at the right time for the best results.

For Local Development

You need to start Mongodb for Local development
mongod --dbpath "$HOME/.local/var/mongodb" --logpath "$HOME/.local/var/log/mongod.log" --fork

```
yarn develop - this starts the server with nodemon which means you can run diagnostics
yarn start - start server without diagnostics
```

## MCP server

This server can expose a small read-only MCP endpoint for authenticated agents.

### Enable it

Set these environment variables before starting the server:

```
ENABLE_MCP_SERVER=true
MCP_ENDPOINT=/mcp
MCP_RATE_LIMIT_MAX=60
```

`MCP_ENDPOINT` is optional and defaults to `/mcp`.
`MCP_RATE_LIMIT_MAX` is optional and defaults to 60 requests per 15 minutes per IP.

### Authentication

The MCP endpoint reuses the existing server authentication flow.

- Session-cookie requests use the existing Express session
- Bearer-token requests use the same Auth0 bearer-token lookup used by GraphQL
- MCP tools require an authenticated user and an active profile in session context

### Transport

The endpoint is exposed as a stateless HTTP MCP server.

- `POST /mcp` handles MCP JSON-RPC requests
- `GET /mcp` and `DELETE /mcp` are handled by the streamable HTTP transport when clients use them

### Available tools

- `search_global` - search goals, tasks, insights, sources, and people
- `list_tasks` - list tasks with the existing task query filters
- `get_task` - fetch one task by id
- `list_goals` - list goals with the existing goal query filters
- `search_insights` - search insights by prompt and answer text

### Safety boundaries

- The MCP tool registry is intentionally read-only
- Tools delegate to the existing GraphQL schema instead of duplicating business logic
- Keep the endpoint disabled outside environments where agent access is explicitly allowed
