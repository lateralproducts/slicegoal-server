import bodyParser from 'body-parser'
import { graphql as executeGraphql } from 'graphql'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import * as z from 'zod/v4'

import { app, buildAuthenticatedContext, schemaWithMiddleware } from './graphqlserver'
import { log } from './logging'

let pjson = require('../package.json')

const mcpEndpoint = process.env.MCP_ENDPOINT || '/mcp'
let mcpConfigured = false

function mcpEnabled() {
    return process.env.ENABLE_MCP_SERVER === 'true'
}

function jsonRpcError(res, status, code, message) {
    res.status(status).json({
        jsonrpc: '2.0',
        error: {
            code,
            message
        },
        id: null
    })
}

function toolResult(name, payload) {
    return {
        content: [
            {
                type: 'text',
                text: `${name} result:\n${JSON.stringify(payload, null, 2)}`
            }
        ]
    }
}

function getGraphqlErrors(errors) {
    return errors.map(error => error.message).join('; ')
}

async function runGraphqlTool({ query, variables, dataPath, contextValue }) {
    const result = await executeGraphql(schemaWithMiddleware, query, null, contextValue, variables)

    if (result.errors && result.errors.length) {
        throw new Error(getGraphqlErrors(result.errors))
    }

    return result.data ? result.data[dataPath] : null
}

function createMcpServer(contextValue) {
    const server = new McpServer({
        name: 'slicegoal-server',
        version: pjson.version
    }, {
        capabilities: {
            logging: {}
        }
    })

    const annotations = {
        readOnlyHint: true,
        openWorldHint: false
    }

    server.registerTool('search_global', {
        description: 'Search goals, tasks, insights, sources, and people for the authenticated SliceGoal profile.',
        inputSchema: {
            search: z.string().min(1).describe('Search text to match across the profile')
        },
        annotations
    }, async({ search }) => {
        const payload = await runGraphqlTool({
            query: `
                query SearchGlobal($search: String) {
                    searchglobal(search: $search) {
                        goals { _id goal description complete datetime }
                        tasks { _id title description date starttime complete completed schedule }
                        insights { _id prompt answer snoozedSwipe }
                        sources { _id name notes }
                        people { _id name created }
                    }
                }
            `,
            variables: { search },
            dataPath: 'searchglobal',
            contextValue
        })

        return toolResult('search_global', payload)
    })

    server.registerTool('list_tasks', {
        description: 'List tasks for the authenticated SliceGoal profile using the existing task query filters.',
        inputSchema: {
            date: z.string().optional().describe('ISO date to scope task results'),
            scheduled: z.boolean().optional().describe('Limit to scheduled tasks'),
            complete: z.boolean().optional().describe('Filter by completion state'),
            today: z.string().optional().describe('ISO date used by the scheduler query'),
            goal: z.string().optional().describe('Goal id to filter tasks'),
            list: z.string().optional().describe('Task list mode, such as day or main'),
            filter: z.string().optional().describe('Area filter id')
        },
        annotations
    }, async args => {
        const payload = await runGraphqlTool({
            query: `
                query ListTasks(
                    $date: String
                    $scheduled: Boolean
                    $complete: Boolean
                    $today: String
                    $goal: String
                    $list: String
                    $filter: String
                ) {
                    tasks(
                        date: $date
                        scheduled: $scheduled
                        complete: $complete
                        today: $today
                        goal: $goal
                        list: $list
                        filter: $filter
                    ) {
                        _id
                        title
                        description
                        date
                        starttime
                        complete
                        completed
                        schedule
                        snooze
                    }
                }
            `,
            variables: args,
            dataPath: 'tasks',
            contextValue
        })

        return toolResult('list_tasks', payload)
    })

    server.registerTool('get_task', {
        description: 'Fetch a single task for the authenticated SliceGoal profile.',
        inputSchema: {
            taskid: z.string().min(1).describe('Task id')
        },
        annotations
    }, async({ taskid }) => {
        const payload = await runGraphqlTool({
            query: `
                query GetTask($taskid: String!) {
                    task(taskid: $taskid) {
                        _id
                        title
                        description
                        date
                        starttime
                        complete
                        completed
                        schedule
                        snooze
                        dayorder
                        listorder
                        goalorder
                    }
                }
            `,
            variables: { taskid },
            dataPath: 'task',
            contextValue
        })

        return toolResult('get_task', payload)
    })

    server.registerTool('list_goals', {
        description: 'List goals for the authenticated SliceGoal profile using the existing goal query filters.',
        inputSchema: {
            area: z.string().optional().describe('Area id filter'),
            search: z.string().optional().describe('Search text for goal titles'),
            date: z.string().optional().describe('ISO date filter'),
            goal: z.string().optional().describe('Parent or linked goal id filter')
        },
        annotations
    }, async args => {
        const payload = await runGraphqlTool({
            query: `
                query ListGoals($area: String, $search: String, $date: String, $goal: String) {
                    goals(area: $area, search: $search, date: $date, goal: $goal) {
                        _id
                        goal
                        description
                        area
                        datetime
                        complete
                        date
                    }
                }
            `,
            variables: args,
            dataPath: 'goals',
            contextValue
        })

        return toolResult('list_goals', payload)
    })

    server.registerTool('search_insights', {
        description: 'Search insights for the authenticated SliceGoal profile.',
        inputSchema: {
            search: z.string().optional().describe('Search text matched against prompt and answer'),
            swipe: z.boolean().optional().describe('Whether to apply swipe-specific filtering')
        },
        annotations
    }, async args => {
        const payload = await runGraphqlTool({
            query: `
                query SearchInsights($search: String, $swipe: Boolean) {
                    searchinsights(search: $search, swipe: $swipe) {
                        _id
                        prompt
                        answer
                        snoozedSwipe
                    }
                }
            `,
            variables: args,
            dataPath: 'searchinsights',
            contextValue
        })

        return toolResult('search_insights', payload)
    })

    return server
}

export function configureMcpServer() {
    if (mcpConfigured || !mcpEnabled()) return app

    app.post(mcpEndpoint, bodyParser.json({ type: ['application/json', 'application/*+json'] }), async(req, res) => {
        let transport
        let server

        try {
            const contextValue = await buildAuthenticatedContext({ req, res })
            if (!req.session || !req.session.user || !req.session.profile) {
                jsonRpcError(res, 401, -32001, 'Unauthorized')
                return
            }

            server = createMcpServer(contextValue)
            transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined
            })

            await server.connect(transport)
            res.on('close', async() => {
                if (transport) await transport.close()
                if (server) await server.close()
            })
            await transport.handleRequest(req, res, req.body)
        } catch (error) {
            log({type: 'error', source: 'mcp', message: error.message})
            if (!res.headersSent) {
                jsonRpcError(res, 500, -32603, 'Internal server error')
            }
        }
    })

    app.get(mcpEndpoint, async(req, res) => {
        jsonRpcError(res, 405, -32000, 'Method not allowed. Use POST for this stateless MCP endpoint.')
    })

    app.delete(mcpEndpoint, async(req, res) => {
        jsonRpcError(res, 405, -32000, 'Method not allowed. Use POST for this stateless MCP endpoint.')
    })

    mcpConfigured = true
    log({type: 'info', message: `MCP server enabled on ${mcpEndpoint}`})
    return app
}
