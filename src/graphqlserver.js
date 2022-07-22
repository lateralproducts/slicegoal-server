//import express from 'express'
//import bodyParser from "body-parser";
//import { graphqlExpress, graphiqlExpress } from "graphql-server-express";
//import { makeExecutableSchema } from "graphql-tools";
//import cors from 'cors'

//import { querytojson } from './website'

//import { AsyncResource } from "async_hooks";

import { GraphQLServer } from 'graphql-yoga'
import session from 'express-session'
import ms from 'ms'
import { Queries } from './schema/queries'
import { Mutations } from './schema/mutations'
import { merge } from 'lodash'
import { updateIx } from './interactions'
import { getipaddress } from './users'

//import schemas
import { schema as userSchema } from './users'
import { schema as areaSchema } from './areas'
import { schema as insightSchema } from './insights'
import { schema as goalSchema } from './goals'
import { schema as tagSchema } from './tags'
import { schema as taskSchema } from './tasks'
import { schema as sourceSchema } from './sources'
import { schema as paymentSchema } from './payments'
import { schema as websiteSchema } from './website'

//import queries and mutations
import { typeDefs as userQueryMutation } from './users'
import { typeDefs as areaQueryMutation } from './areas'
import { typeDefs as insightQueryMutation } from './insights'
import { typeDefs as paymentQueryMutation } from './payments'
import { typeDefs as feedbackQueryMutation } from './feedback'
import { typeDefs as goalQueryMutation } from './goals'
import { typeDefs as webQueryMutation } from './website'
import { typeDefs as tagQueryMutation } from './tags'
import { typeDefs as taskQueryMutation } from './tasks'
import { typeDefs as sourceMutation } from './sources'
import { typeDefs as dbUpdateMutation } from '../util/db_updates'

//import resolvers
import { resolvers as userResolvers } from './users'
import { resolvers as areaResolvers } from './areas'
import { resolvers as insightResolvers } from './insights'
import { resolvers as paymentResolvers } from './payments'
import { resolvers as feedbackResolvers } from './feedback'
import { resolvers as goalResolvers } from './goals'
import { resolvers as webResolvers } from './website'
import { resolvers as tagResolvers } from './tags'
import { resolvers as taskResolvers } from './tasks'
import { resolvers as sourceResolvers } from './sources'
import { resolvers as dbUpdateResolvers } from '../util/db_updates'

//upload()
import { getfile } from './storage'
import './schedules'

let pjson = require('../package.json')
console.log('server version: ' + pjson.version)
console.log('environment: ' + process.env.npm_lifecycle_event)

//const app = express()
//app.use(cors())

export const graphql = async() => {
    try {
        var path = require('path')
        
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
                taskSchema,
                sourceSchema,
                paymentSchema,
                websiteSchema,
                paymentQueryMutation,
                userQueryMutation,
                insightQueryMutation,
                areaQueryMutation,
                goalQueryMutation,
                feedbackQueryMutation,
                webQueryMutation,
                tagQueryMutation,
                taskQueryMutation,
                sourceMutation,
                dbUpdateMutation
            ],

            resolvers: merge(
                paymentResolvers,
                userResolvers,
                insightResolvers,
                areaResolvers,
                goalResolvers,
                feedbackResolvers,
                webResolvers,
                tagResolvers,
                taskResolvers,
                sourceResolvers,
                dbUpdateResolvers
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

        // file server
        server.express.get('/files/*', (req, res, next) => {
            // here you can use your way to get the path dir ..  
            //const pathDir = path.join(__dirname, "files/cavesteplong.png"); //using local files
            //res.sendFile(pathDir);
            if(req.session.user) console.log(req.session.user.firstname)
            console.log("ip address - " + getipaddress(req))

            const filename = path.basename(req.path);
            
            if (filename === 'cavesteplong.png' || filename === 'pixel.png') {
                //logaccess
                getfile(filename, res)
                const item = req.query
                if(item.ix) {
                    updateIx(item.ix,'seen','open','email')
                    console.log('cavestep image accessed - ' + item.ix)
                }
            } else {
                getfile(filename, res)
            }

        }) // ✔️🚀

    } catch (e) {
        console.log(e)
    }
}
