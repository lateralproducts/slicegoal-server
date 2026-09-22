import 'babel-core/register'
import 'babel-polyfill' //required for production build.
import { configureGraphqlServer, startHttpServer } from './graphqlserver'
import { configureMcpServer } from './mcpserver'

const start = async() => {
    await configureGraphqlServer()
    configureMcpServer()
    await startHttpServer()
}

start()
