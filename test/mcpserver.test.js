describe('configureMcpServer', () => {
    let app
    let routes
    let buildAuthenticatedContextMock
    let executeGraphqlMock
    let logMock
    let connectMock
    let transportCloseMock
    let serverCloseMock
    let lastServer
    let mcpModuleLoadCount
    let transportModuleLoadCount

    function createResponse() {
        const listeners = {}

        return {
            headersSent: false,
            writableEnded: false,
            status: jest.fn(function status() { return this }),
            json: jest.fn(function json() {
                this.headersSent = true
                this.writableEnded = true
                return this
            }),
            on: jest.fn((event, handler) => {
                listeners[event] = handler
            }),
            listeners
        }
    }

    function loadModule() {
        jest.resetModules()
        process.env.ENABLE_MCP_SERVER = 'true'
        process.env.MCP_ENDPOINT = '/mcp'

        routes = {}
        buildAuthenticatedContextMock = jest.fn()
        executeGraphqlMock = jest.fn()
        logMock = jest.fn()
        connectMock = jest.fn().mockResolvedValue(undefined)
        transportCloseMock = jest.fn().mockResolvedValue(undefined)
        serverCloseMock = jest.fn().mockResolvedValue(undefined)
        mcpModuleLoadCount = 0
        transportModuleLoadCount = 0

        app = {
            post: jest.fn((path, ...handlers) => {
                routes.post = { path, handlers }
                return app
            }),
            get: jest.fn((path, ...handlers) => {
                routes.get = { path, handlers }
                return app
            }),
            delete: jest.fn((path, ...handlers) => {
                routes.delete = { path, handlers }
                return app
            })
        }

        jest.doMock('body-parser', () => ({
            __esModule: true,
            default: {
                json: jest.fn(() => 'json-middleware')
            }
        }))

        jest.doMock('express-rate-limit', () => ({
            __esModule: true,
            default: jest.fn(() => 'rate-limit-middleware')
        }))

        jest.doMock('graphql', () => ({
            graphql: (...args) => executeGraphqlMock(...args)
        }))

        jest.doMock('../src/graphqlserver', () => ({
            app,
            buildAuthenticatedContext: buildAuthenticatedContextMock,
            schemaWithMiddleware: {}
        }))

        jest.doMock('../src/logging', () => ({
            log: (...args) => logMock(...args)
        }))

        jest.doMock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
            __esModule: true,
            ...(() => {
                mcpModuleLoadCount += 1
                return {}
            })(),
            McpServer: class MockMcpServer {
                constructor() {
                    this.tools = {}
                    lastServer = this
                }

                registerTool(name, config, handler) {
                    this.tools[name] = { config, handler }
                }

                connect(transport) {
                    return connectMock(transport)
                }

                close() {
                    return serverCloseMock()
                }
            }
        }))

        jest.doMock('@modelcontextprotocol/sdk/server/streamableHttp.js', () => ({
            __esModule: true,
            ...(() => {
                transportModuleLoadCount += 1
                return {}
            })(),
            StreamableHTTPServerTransport: class MockTransport {
                handleRequest(req, res, body) {
                    if (body && body.params && body.params.name) {
                        return Promise.resolve(lastServer.tools[body.params.name].handler(body.params.arguments))
                            .then(result => {
                                res.result = result
                                res.headersSent = true
                                res.writableEnded = true
                            })
                    }

                    res.headersSent = true
                    res.writableEnded = true
                    return Promise.resolve()
                }

                close() {
                    return transportCloseMock()
                }
            }
        }))

        return require('../src/mcpserver')
    }

    afterEach(() => {
        delete process.env.ENABLE_MCP_SERVER
        delete process.env.MCP_ENDPOINT
        jest.resetModules()
        jest.clearAllMocks()
    })

    it('returns 401 for unauthenticated MCP requests', async() => {
        const { configureMcpServer } = loadModule()
        buildAuthenticatedContextMock.mockResolvedValue({})

        configureMcpServer()

        expect(mcpModuleLoadCount).toBe(0)
        expect(transportModuleLoadCount).toBe(0)

        const handler = routes.post.handlers[routes.post.handlers.length - 1]
        const req = { session: {}, body: {} }
        const res = createResponse()

        await handler(req, res)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.json).toHaveBeenCalledWith({
            jsonrpc: '2.0',
            error: {
                code: -32001,
                message: 'Unauthorized'
            },
            id: null
        })
        expect(connectMock).not.toHaveBeenCalled()
        expect(mcpModuleLoadCount).toBe(0)
        expect(transportModuleLoadCount).toBe(0)
    })

    it('handles an authenticated MCP tool request with the schema-safe people fields', async() => {
        const { configureMcpServer } = loadModule()
        buildAuthenticatedContextMock.mockResolvedValue({
            session: {
                user: { _id: 'user-1' },
                profile: { _id: 'profile-1' }
            }
        })
        executeGraphqlMock.mockImplementation(async(_, query) => {
            expect(query).toContain('people { _id name notes }')
            expect(query).not.toContain('people { _id name created }')

            return {
                data: {
                    searchglobal: {
                        people: [{ _id: 'person-1', name: 'Ada', notes: 'mathematician' }]
                    }
                }
            }
        })

        configureMcpServer()

        expect(mcpModuleLoadCount).toBe(0)
        expect(transportModuleLoadCount).toBe(0)

        const handler = routes.post.handlers[routes.post.handlers.length - 1]
        const req = {
            session: {
                user: { _id: 'user-1' },
                profile: { _id: 'profile-1' }
            },
            body: {
                params: {
                    name: 'search_global',
                    arguments: {
                        search: 'Ada'
                    }
                }
            }
        }
        const res = createResponse()

        await handler(req, res)

        expect(executeGraphqlMock).toHaveBeenCalled()
        expect(res.result).toEqual({
            content: [
                {
                    type: 'text',
                    text: 'search_global result:\n{\n  "people": [\n    {\n      "_id": "person-1",\n      "name": "Ada",\n      "notes": "mathematician"\n    }\n  ]\n}'
                }
            ]
        })
        expect(connectMock).toHaveBeenCalled()
        expect(transportCloseMock).toHaveBeenCalled()
        expect(serverCloseMock).toHaveBeenCalled()
        expect(mcpModuleLoadCount).toBe(1)
        expect(transportModuleLoadCount).toBe(1)
    })
})
