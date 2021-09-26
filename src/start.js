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

//import resolvers
import { resolvers as userResolvers } from './users'
import { resolvers as areaResolvers } from './areas'
import { resolvers as insightResolvers } from './insights'
import { resolvers as paymentResolvers } from './payments'
import { resolvers as feedbackResolvers } from './feedback'
import { resolvers as goalResolvers } from './goals'
import { resolvers as webResolvers } from './website'

import './schedules'

let pjson = require('../package.json')
console.log('server version: ' + pjson.version)
console.log('environment: ' + process.env.npm_lifecycle_event)

const app = express()
app.use(cors())

export const start = async() => {
    try {
        //const Signup = db.collection("signup");

        /*  async function migrategoals(goal) {
      let goallink = new Object();
      goallink.areaid = goal.area;
      goallink.userid = goal.userid;
      goallink.goalid = goal._id.toString();
      goallink.date = goal.date;
      goallink.orderrank = goal.orderrank;
      goallink.datetime = goal.datetime;
      goallink.complete = goal.complete;

      try {
        GoalLinks.insertOne(goallink);
      } catch (error) {
        console.log(error);
      }
    }

    async function migrateinsights(spaced) {
      let newinsight = new Object();
      newinsight.area = spaced.area;
      newinsight.answer = spaced.answer;
      newinsight.prompt = spaced.prompt;
      newinsight.userid = spaced.userid;
      newinsight.datecreated = spaced.datecreated;
      newinsight.lastedited = spaced.lastedited;
      newinsight.datetime = spaced.datetime;

      try {
        Insights.insertOne(newinsight).then(result => {
          let insight = new Object();
          insight.insightid = result.insertedId.toString();
          insight.userid = newinsight.userid;
          insight.fib0 = 0;
          insight.fib1 = 1;
          let nextdate = new Date(); //set nextdate for tomorrow.
          if (newinsight.prompt) nextdate.setDate(nextdate.getDate() + 1);
          insight.datenext = nextdate;

          let insightlink = new Object();
          insightlink.insightid = result.insertedId.toString();
          insightlink.userid = newinsight.userid;
          insightlink.area = newinsight.area;
          insightlink.datecreated = new Date();
          InsightLinks.insert(insightlink);

          Spaced.updateOne(
            {
              _id: spaced._id
            },
            { $set: { insightid: result.insertedId.toString() } }
          );
        });
      } catch (error) {
        console.log(error);
      }
    }

    function aggregatePomo(area) {
      Pomodoros.aggregate(
        {
          $match: {
            area: area
          }
        },
        {
          $group: {
            _id: { area: "$area" },
            count: { $sum: "$minutes" },
            records: { $sum: 1 }
          }
        },
        function(err, data) {
          if (err) throw err;

          /*  console.log(JSON.stringify(data, undefined, 2));
          console.log(data[0].count); 
          return data[0].count;
        }
      );
    }

    async function updateinsights(spaced) {
      try {
        if (area.insights) {
          await Spaced.insertOne({
            area: area._id.toString(),
            answer: area.insights,
            userid: area.userid
          });
          return false;
        }
      } catch (error) {
        console.log(error);
      }
    }

    async function updatepomos(area) {
      try {
        if (area.area) {
          const link = await Pomodoros.findOne({
            area: area.area,
            links: { $not: { $eq: null } }
          });

          if (link) {
            console.log(link);
            await Pomodoros.update(
              { _id: ObjectId(area._id) },
              {
                $set: {
                  links: link.links
                },
                $unset: { areaId: "" }
              }
            );
          }
          return false;
        }
      } catch (error) {
        console.log(error);
      }
    }

    async function updaterank(ranktime) {
      try {
        await RankTimes.update(
          { _id: ObjectId(ranktime._id) },
          {
            $set: {
              area: ranktime.areaId
            },
            $unset: { areaId: "" }
          }
        );
        return true;
      } catch (error) {
        console.log(error);
      }
    }

    async function updategoal(goaltime) {
      try {
        await GoalTimes.update(
          { _id: ObjectId(goaltime._id) },
          {
            $set: {
              area: goaltime.areaId
            },
            $unset: { areaId: "" }
          }
        );
        return true;
      } catch (error) {
        console.log(error);
      }
    } */

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
                webQueryMutation
            ],

            resolvers: merge(
                paymentResolvers,
                userResolvers,
                insightResolvers,
                areaResolvers,
                goalResolvers,
                feedbackResolvers,
                webResolvers,
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
