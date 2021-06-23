import express from "express";
//import bodyParser from "body-parser";
//import { graphqlExpress, graphiqlExpress } from "graphql-server-express";
//import { makeExecutableSchema } from "graphql-tools";
import cors from "cors";

//import { AsyncResource } from "async_hooks";

import { GraphQLServer } from "graphql-yoga";
import session from "express-session";
import ms from "ms";

import { Queries } from "./schema/queries";
import { Mutations } from "./schema/mutations";

import { merge } from "lodash";
import { typeDefs as payments } from "./payments";
import { resolvers as paymentResolvers } from "./payments"
import { typeDefs as users } from "./users"
import { resolvers as userResolvers } from "./users"
import { schema as userSchema } from "./users"
import { typeDefs as areas } from "./areas"
import { resolvers as areaResolvers } from "./areas"
import { schema as areaSchema } from "./areas"
import { typeDefs as notes } from "./notes"
import { resolvers as noteResolvers } from "./notes"
import { schema as noteSchema } from "./notes"
import { typeDefs as objectives } from "./objectives"
import { resolvers as objectiveResolvers } from "./objectives"
import { schema as objectiveSchema } from "./objectives"


import "./schedules"

var pjson = require("../package.json");
console.log("server version: " + pjson.version);
console.log("environment: " + process.env.npm_lifecycle_event);

const app = express();
app.use(cors());

export const start = async () => {
  try {

    //const Signup = db.collection("signup");

    /*  async function migrateobjectives(objective) {
      var objectivelink = new Object();
      objectivelink.areaid = objective.area;
      objectivelink.userid = objective.userid;
      objectivelink.objectiveid = objective._id.toString();
      objectivelink.date = objective.date;
      objectivelink.orderrank = objective.orderrank;
      objectivelink.datetime = objective.datetime;
      objectivelink.complete = objective.complete;

      try {
        ObjectiveLinks.insertOne(objectivelink);
      } catch (error) {
        console.log(error);
      }
    }

    async function migratenotes(spaced) {
      var newnote = new Object();
      newnote.area = spaced.area;
      newnote.answer = spaced.answer;
      newnote.prompt = spaced.prompt;
      newnote.userid = spaced.userid;
      newnote.datecreated = spaced.datecreated;
      newnote.lastedited = spaced.lastedited;
      newnote.datetime = spaced.datetime;

      try {
        Notes.insertOne(newnote).then(result => {
          var note = new Object();
          note.noteid = result.insertedId.toString();
          note.userid = newnote.userid;
          note.fib0 = 0;
          note.fib1 = 1;
          var nextdate = new Date(); //set nextdate for tomorrow.
          if (newnote.prompt) nextdate.setDate(nextdate.getDate() + 1);
          note.datenext = nextdate;

          var notelink = new Object();
          notelink.noteid = result.insertedId.toString();
          notelink.userid = newnote.userid;
          notelink.area = newnote.area;
          notelink.datecreated = new Date();
          NoteLinks.insert(notelink);

          Spaced.updateOne(
            {
              _id: spaced._id
            },
            { $set: { noteid: result.insertedId.toString() } }
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

    async function updatenotes(spaced) {
      try {
        if (area.notes) {
          await Spaced.insertOne({
            area: area._id.toString(),
            answer: area.notes,
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
      endpoint: "/server",
      cors: {
        credentials: true,
        preflightContinue: true,
        origin: [
          "https://www.cavestep.com.au",
          "https://www.lateralproducts.com",
          "https://localhost:8000",
          "https://localhost:3000"
        ] //your frontend url.
      }
    };

    // context
    const context = req => ({
      req: req.request,
      version: pjson.version
    });

    
    // server
    const server = new GraphQLServer({
      typeDefs: [
        Queries,
        Mutations, 
        userSchema,
        areaSchema,
        noteSchema,
        objectiveSchema, 
        payments, 
        users, 
        notes,
        areas,
        objectives
      ],

      resolvers: merge(
        paymentResolvers, 
        userResolvers, 
        noteResolvers,
        areaResolvers,
        objectiveResolvers
        ),
      context
    });

    /* function loggingMiddleware(req, res, next) {
      console.log("ip:", ip);
      next();
    }
    server.express.use(loggingMiddleware); */
    //the function above tracks the ip address of requests

    // session middleware
    server.express.use(
      session({
        name: "qid",
        secret: `whale-schradernator`, //random secret
        resave: true,
        saveUninitialized: true,
        rolling: true,
        cookie: {
          secure: false, //if this is true it is not working in production. cookies don't work at all in dev with apache on http.
          maxAge: ms("1d")
        }
      })
    );

    // start server
    server.start(opts, () =>
      console.log(
        `Server is running on http://localhost:${opts.port}${opts.endpoint}`
      )
    );
  } catch (e) {
    console.log(e);
  }
};
