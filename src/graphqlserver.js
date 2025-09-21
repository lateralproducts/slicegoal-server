import express from 'express'
import session from 'express-session'
import { createServer, GraphQLYogaError } from '@graphql-yoga/node'
import { makeExecutableSchema } from '@graphql-tools/schema'
import { applyMiddleware } from 'graphql-middleware'
import querystring from 'querystring';

import RedisStore from "connect-redis"
import {createClient} from "redis"
import axios from 'axios'

process.env.TZ = 'UTC' //set server timezone to UTC

const redis_db = `${process.env.REDIS_DB}`
const spotify_redirect_uri = `${process.env.SPOTIFY_REDIRECT_URI}`
const spotify_client_id = `${process.env.SPOTIFY_CLIENT_ID}`
const spotify_client_secret = `${process.env.SPOTIFY_CLIENT_SECRET}`


// Initialize client.
let redisClient = createClient({
    url: 'redis://' + redis_db + ':6379', //not using authentication as AWS manages authentication between devices with VPC.
    socket: {
        tls: false,  // Enable TLS/SSL if any URL except localhost (dev)
        rejectUnauthorized: false // Optional: Bypass certificate validation (not recommended for production)
    }
})
redisClient.connect().catch(console.error)

// Initialize store.
let redisStore = new RedisStore({
  client: redisClient,
  prefix: "appsession:",
})

import ms from 'ms'
import { Queries } from './schema/queries'
import { Mutations } from './schema/mutations'
import { merge } from 'lodash'
import { getIxFile, updateIx } from './interactions'
import { getCurrentView, getipaddress, getprofileid } from './users'
import { schema as userSchema } from './users'
import { schema as areaSchema, setView } from './areas'
import { schema as insightSchema } from './insights'
import { schema as goalSchema } from './goals'
import { schema as tagSchema } from './tags'
import { schema as taskSchema } from './tasks'
import { schema as templateSchema } from './templates'
import { schema as sourceSchema } from './sources'
import { schema as paymentSchema } from './payments'
import { schema as websiteSchema } from './website'
import { schema as pomodoroSchema } from './pomodoros'
import { schema as recapSchema } from './recaps'
import { schema as fileserverSchema } from './fileserver'
import { schema as chatSchema } from './chat'
import { schema as peopleSchema } from './people'
import { typeDefs as userQueryMutation } from './users'
import { typeDefs as areaQueryMutation } from './areas'
import { typeDefs as insightQueryMutation } from './insights'
import { typeDefs as paymentQueryMutation } from './payments'
import { typeDefs as feedbackQueryMutation } from './feedback'
import { typeDefs as goalQueryMutation } from './goals'
import { typeDefs as webQueryMutation } from './website'
import { typeDefs as tagQueryMutation } from './tags'
import { typeDefs as templateQueryMutation } from './templates'
import { typeDefs as taskQueryMutation } from './tasks'
import { typeDefs as sourceQueryMutation } from './sources'
import { typeDefs as pomodoroQueryMutation } from './pomodoros'
import { typeDefs as dbUpdateQueryMutation } from '../util/db_migrate'
import { typeDefs as recapQueryMutation } from './recaps'
import { typeDefs as fileserverQueryMutation } from './fileserver'
import { typeDefs as chatQueryMutation } from './chat'
import { typeDefs as peopleQueryMutation } from './people'
import { resolvers as userResolvers } from './users'
import { resolvers as areaResolvers } from './areas'
import { resolvers as insightResolvers } from './insights'
import { resolvers as paymentResolvers } from './payments'
import { resolvers as feedbackResolvers } from './feedback'
import { resolvers as goalResolvers } from './goals'
import { resolvers as webResolvers } from './website'
import { resolvers as tagResolvers } from './tags'
import { resolvers as taskResolvers } from './tasks'
import { resolvers as templateResolvers } from './templates'
import { resolvers as sourceResolvers } from './sources'
import { resolvers as pomodoroResolvers } from './pomodoros'
import { resolvers as dbUpdateResolvers } from '../util/db_migrate'
import { resolvers as recapResolvers } from './recaps'
import { resolvers as fileserverResolvers } from './fileserver'
import { resolvers as chatResolvers } from './chat'
import { resolvers as peopleResolvers } from './people'
import { getfile } from './storage'
import './schedules'
import { log } from './logging'
import { getBearerClaimsFromContext, getuserbysub } from './auth'
let pjson = require('../package.json')
var path = require('path')
 
const app = express()

//import schemas

//import queries and mutations

//import resolvers

//upload()
log({type: 'info', message: 'server version: ' + pjson.version})
log({type: 'info', message: 'environment: ' + process.env.NODE_ENV})
log({type: 'info', message: new Date()})

// context
const context = req => ({
    req: req.request.body,
    version: pjson.version
})

// server
export const schema = makeExecutableSchema({
    typeDefs: [
        Queries,
        Mutations,
        userSchema,
        areaSchema,
        insightSchema,
        goalSchema,
        tagSchema,
        taskSchema,
        templateSchema,
        sourceSchema,
        paymentSchema,
        websiteSchema,
        pomodoroSchema,
        recapSchema,
        fileserverSchema,
        chatSchema,
        peopleSchema,

        paymentQueryMutation,
        userQueryMutation,
        insightQueryMutation,
        areaQueryMutation,
        goalQueryMutation,
        feedbackQueryMutation,
        webQueryMutation,
        tagQueryMutation,
        taskQueryMutation,
        templateQueryMutation,
        sourceQueryMutation,
        pomodoroQueryMutation,
        dbUpdateQueryMutation,
        recapQueryMutation,
        fileserverQueryMutation,
        chatQueryMutation,
        peopleQueryMutation
        //could combine the Schema and QueryMutation defs.
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
        templateResolvers,
        sourceResolvers,
        pomodoroResolvers,
        dbUpdateResolvers,
        recapResolvers,
        fileserverResolvers,
        chatResolvers,
        peopleResolvers
    )
})

export const schemaWithMiddleware = applyMiddleware(schema, authMiddleWareInput); //, authMiddleWareOutput - to track the output.

const graphQLServer = createServer({
    schema: schemaWithMiddleware,
    graphiql: false,
    context: async ({ req, res }) => {
        // Build the per-request context first
        const ctx = { req, res }
    
        // Use the cookie session if present; otherwise create a request-scoped store
        if (!req.session) {
            ctx.session = {} // Create request-scoped session for JWT-only requests
        }
      
        //console.log('🔎 bearer claim check')
        // ✅ Pass the right object to your jose helper
        const claims = await getBearerClaimsFromContext({ req }) // or getBearerClaimsFromContext(ctx)
        if (claims && claims.sub) {
            //console.log('🔎 bearer claim found')
            const user = await getuserbysub(claims.sub)
            //const profile = user ? await getprofileid(user.id) : null

            if (req.session) {
                // mutate, don't replace
                req.session.user = user
                const view = await getCurrentView(req)
                if (view) await setView(view._id.toString(), req)
                // (optional) persist immediately so Set-Cookie is sent
                await new Promise((r, j) => req.session.save(err => (err ? j(err) : r())))
            } else {
                // JWT-only path (no cookie session): keep it on ctx for this request
                ctx.session.user = user
                const view = await getCurrentView(ctx)
                if (view) await setView(view.id.toString(), ctx)
                //ctx.session.profile = profile
            }

            ctx.auth0 = {
                sub: claims.sub,
                scope: claims.scope,
                permissions: claims.permissions,
                exp: claims.exp,
            }
        }
       
        return ctx
    },
  })

// List of query names that can be accessed by unauthenticated users
const unauthenticatedQueries = [
    'isLoggedin', 
    'login', 
    'googleLogin', 
    'trackpage', 
    'sendlateralproductsemail', 
    'signup', 
    'verifyAccount', 
    'resetPassword', 
    'setPassword', 
    'publicwheels',
    'sendofferrequest',
    'sendunsubscriberequest',
];

async function authMiddleWareInput(resolve, root, args, context, info) {
    console.log('🔎 middleware - info:', info.fieldName)
    //using root to check if the query is a root query (from the client) or a nested query/resolver. The query from the client doesn't have a root attached.
    if (!root && !unauthenticatedQueries.includes(info.fieldName)){
        const sessionUser = (context.req.session && context.req.session.user) || (context.session && context.session.user)
        if (!sessionUser) return triggererror('Invalid Session')
        //what about introducing a check on the profile too? For profile specific requests.
    }
    return resolve(root, args, context)
}

export const graphql = async() => {
    try {
        
        const opts = {
            port: 3001,
            endpoint: '/server',
            cors: {
                credentials: true,
                preflightContinue: true,
                origin: [
                    'https://www.slicegoal.com',
                    'https://www.slicegoal.com.au',
                    'https://www.lateralproducts.com',
                    'https://localhost:8000',
                    'https://localhost:3000'
                ] //your frontend url.
            }
        }


        /* function loggingMiddleware(req, res, next) {
          log("ip:", ip);
          next();
        }
        app.use(loggingMiddleware); */
        //the function above tracks the ip address of requests

        //app.use(cors())

        // session middleware
        app.use(
            session({
                name: 'qid',
                secret: 'xxtA#5qM&fJ7A@#n', //random secret
                store: redisStore,
                resave: false,
                saveUninitialized: true,
                rolling: true,
                cookie: {
                    secure: false, //if this is true it is not working in production. cookies don't work at all in dev with apache on http.
                    maxAge: ms('1d')
                }
            }),
        )
        // Bind GraphQL Yoga to `/server` endpoint
        app.use('/server', graphQLServer)

        // start server
        app.listen(opts, () => {
            log({type: 'info', message: `Server is running on http://localhost:${opts.port}${opts.endpoint}`})
        }) 

        // file server
        app.get('/files/*', async (req, res, next) => {
            // here you can use your way to get the path dir ..  
            //const pathDir = path.join(__dirname, "files/slicegoallong.png"); //using local files
            //res.sendFile(pathDir);

            const filename = path.basename(req.path);
            const item = req.query
            
            if (filename === 'slicegoallong.png' || filename === 'cavesteplong.png' || filename === 'pixel.png' || filename === 'target-small.png') {
                //logaccess
                getfile(filename, res)
                if(item.ix) {
                    updateIx(item.ix,'seen','open','email', getipaddress(req))
                    log({type: 'info', message: 'slicegoal image accessed - ' + item.ix})
                    return
                }
            } else {
                if(!item.ix) {
                    if(req.session.user) log(req.session._id)
                    log("failed file read at ip address: " + getipaddress(req))
                    res.status(401).json({ error: 'Unauthorized' })
                    return
                } else {
                    const interactionexist = await updateIx(item.ix,'seen','open','email', getipaddress(req))
                    if (interactionexist) {
                        const ixfilename = await getIxFile(item.ix)
                        getfile(ixfilename, res)
                        return
                    }else {
                        res.status(401).json({ error: 'Unauthorized' })
                        return
                    }
                }
                //check that there is a valid session before giving access to any files.
            }

        }) // ✔️🚀

        // spotify token validation
        app.post('/api/spotify/token/', async (req, res) => {
            let data = '';
        
            req.on('data', chunk => {
                data += chunk;
            });
        
            req.on('end', async () => {
                try {
                    console.log('Raw body:', data);
        
                    // 🔓 Parse URL-encoded form data manually
                    const body = querystring.parse(data);
                    console.log('Parsed code:', body.code);
        
                    if (body.code) {
                        try {
                            const response = await axios.post('https://accounts.spotify.com/api/token', new URLSearchParams({
                                grant_type: 'authorization_code',
                                code: body.code,
                                redirect_uri: spotify_redirect_uri,
                            }).toString(), {
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                    'Authorization': 'Basic ' + Buffer.from(spotify_client_id + ':' + spotify_client_secret).toString('base64')
                                }
                            });

                            console.log(response.data)
                            return res.status(200).json(response.data);
                        } catch (error) {
                            console.error('❌ Token swap failed', error.response ? error.response.data : error.message);
                            return res.status(500).json({ error: 'Token swap failed' });
                        }
                    } else {
                        console.log('❌ Missing code or code_verifier')
                        return res.status(400).json({ error: 'Missing code or code_verifier' });
                    }
                } catch (err) {
                    console.error('❌ Parse error:', err.message);
                    return res.status(400).json({ error: 'Invalid body format' });
                }
            });
        });

        app.post('/api/spotify/refresh_token/', async (req, res) => {
            let data = '';
            req.on('data', chunk => {
                data += chunk;
            });
        
            req.on('end', async () => {
                try {
                    console.log('Raw body:', data);
                    // 🔓 Parse URL-encoded form data manually
                    const body = querystring.parse(data);
                    console.log(body)
                    return res.status(200).json({ error: 'Not implemented yet' });
                } catch (err) {
                    console.error('❌ Parse error:', err.message);
                    return res.status(400).json({ error: 'Invalid body format' });
                }
            });
        });

    } catch (e) {
        log(e)
    }
}

export function triggererror(message){
    //using the GraphQLYogaError to return to client in production.
    return Promise.reject(new GraphQLYogaError(message))
}
