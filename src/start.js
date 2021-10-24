import express from 'express'
//import bodyParser from "body-parser";
//import { graphqlExpress, graphiqlExpress } from "graphql-server-express";
//import { makeExecutableSchema } from "graphql-tools";
import cors from 'cors'

//import { AsyncResource } from "async_hooks";

import { GraphQLServer } from 'graphql-yoga'
import session from 'express-session'
import ms from 'ms'
import { Queries } from './schema/queries'
import { Mutations } from './schema/mutations'
import { merge } from 'lodash'

//import schemas
import { schema as userSchema } from './users'
import { schema as areaSchema } from './areas'
import { schema as insightSchema } from './insights'
import { schema as goalSchema } from './goals'
import { schema as tagSchema } from './tags'

//import queries and mutations
import { typeDefs as userQueryMutation } from './users'
import { typeDefs as areaQueryMutation } from './areas'
import { typeDefs as insightQueryMutation } from './insights'
import { typeDefs as paymentQueryMutation } from './payments'
import { typeDefs as feedbackQueryMutation } from './feedback'
import { typeDefs as goalQueryMutation } from './goals'
import { typeDefs as webQueryMutation } from './website'
import { typeDefs as tagQueryMutation } from './tags'

//import resolvers
import { resolvers as userResolvers } from './users'
import { resolvers as areaResolvers } from './areas'
import { resolvers as insightResolvers } from './insights'
import { resolvers as paymentResolvers } from './payments'
import { resolvers as feedbackResolvers } from './feedback'
import { resolvers as goalResolvers } from './goals'
import { resolvers as webResolvers } from './website'
import { resolvers as tagResolvers } from './tags'

import './schedules'

let pjson = require('../package.json')
console.log('server version: ' + pjson.version)
console.log('environment: ' + process.env.npm_lifecycle_event)

const app = express()
app.use(cors())

export const start = async() => {
    try {
        
        const opts = {
            port: 3001,
            endpoint: '/server',
            cors: {
                credentials: true,
                preflightContinue: true,
                origin: [
                    'https://www.cavestep.com.au',
                    'https://www.lateralproducts.com',
                    'https://localhost:8000',
                    'https://localhost:3000'
                ] //your frontend url.
            }
        }

        // context
        const context = req => ({
            req: req.request,
            version: pjson.version
        })

        // server
        const server = new GraphQLServer({
            typeDefs: [
                Queries,
                Mutations,
                userSchema,
                areaSchema,
                insightSchema,
                goalSchema,
                tagSchema,
                paymentQueryMutation,
                userQueryMutation,
                insightQueryMutation,
                areaQueryMutation,
                goalQueryMutation,
                feedbackQueryMutation,
                webQueryMutation,
                tagQueryMutation
            ],

            resolvers: merge(
                paymentResolvers,
                userResolvers,
                insightResolvers,
                areaResolvers,
                goalResolvers,
                feedbackResolvers,
                webResolvers,
                tagResolvers
            ),
            context
        })

        /* function loggingMiddleware(req, res, next) {
          console.log("ip:", ip);
          next();
        }
        server.express.use(loggingMiddleware); */
        //the function above tracks the ip address of requests

        // session middleware
        server.express.use(
            session({
                name: 'qid',
                secret: 'whale-schradernator', //random secret
                resave: true,
                saveUninitialized: true,
                rolling: true,
                cookie: {
                    secure: false, //if this is true it is not working in production. cookies don't work at all in dev with apache on http.
                    maxAge: ms('1d')
                }
            }),
        )

        // start server
        server.start(opts, () =>
            console.log(
                `Server is running on http://localhost:${opts.port}${opts.endpoint}`,
            ),
        )
    } catch (e) {
        console.log(e)
    }
}
