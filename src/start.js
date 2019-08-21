import { MongoClient, ObjectId } from "mongodb";
import express from "express";
//import bodyParser from "body-parser";
//import { graphqlExpress, graphiqlExpress } from "graphql-server-express";
//import { makeExecutableSchema } from "graphql-tools";
import cors from "cors";
import { prepare } from "../util/index";
//import { AsyncResource } from "async_hooks";

import { GraphQLServer } from "graphql-yoga";
import session from "express-session";
import bcrypt from "bcryptjs";
import ms from "ms";

//import { verifier } from "google-id-token-verifier";
const { OAuth2Client } = require("google-auth-library");

var pjson = require("../package.json");
console.log("server version: " + pjson.version);

var googleclientId =
  "66261576180-30if4t1svq870fh2jpnabrklagd43l0i.apps.googleusercontent.com";

const oAuth2Client = new OAuth2Client({
  clientId: googleclientId
});

const app = express();

app.use(cors());

/* const homePath = "/graphiql";
const URL = "http://localhost";
const PORT = 3001; */
var MONGO_URL = `${process.env.MONGODB_URL}`; //27017
if (MONGO_URL == "undefined") {
  MONGO_URL = "mongodb://172.31.1.156:27017/strategy";
  //override address if necessary
}
console.log("attempting to open server: " + MONGO_URL);

export const start = async () => {
  try {
    const db = await MongoClient.connect(MONGO_URL);

    console.log("connected now for the dbs");
    const Users = db.collection("users");
    const Areas = db.collection("areas");
    const AreaLinks = db.collection("arealinks");
    const RankTimes = db.collection("ranktimes");
    const GoalTimes = db.collection("goaltimes");
    const Pomodoros = db.collection("pomodoros");

    const Wheels = db.collection("wheels");
    const WheelAreaLinks = db.collection("wheelarealink");

    const typeDefs = [
      `
      type Query {
        isLoggedin: User
        areas: [Area]
        users: [User]
        ranktimes(areaId: String): [RankTime]
        goaltimes(areaId: String): [GoalTime]
        area(_id: String): Area
        lastranktime(areaId: String): RankTime
        lastgoaltime(areaId: String): GoalTime
        arealinks(areaId: String, areaId: String): [AreaLink]
      }

      type AreaLink {
        _id: String
        rootarea: String
        area: String
        focus: Boolean
      }

      type Area {
        _id: String
        name: String
        rank: RankTime
        goal: GoalTime
        definition: String
        focus: Boolean
        vision: String
        notes: String
        areas: [Area]
      }

      type User {
        _id: String
        firstname: String
        email: String
        startarea: String
        area: Area
        serverversion: String
        state: String
      }

      type RankTime {
        _id: String
        areaId: String
        rank: Int
        datetime: String
        note: String
        date: Float
      }

      type GoalTime {
        _id: String
        areaId: String
        goal: Int
        datetime: String
        note: String
        date: Float
      }

      type Mutation {
        createArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
        updateArea(rootarea: String, name: String, definition: String, vision: String, notes: String, area: String): Area
        deleteArea(area: String): Area
        createAreaLink(rootarea: String, area: String, title: String, notes: String): Boolean
        deleteAreaLink(rootarea: String, area: String): Area
        createRankTime(area: String, rank: Int, datetime: String, note: String): RankTime
        createGoalTime(area: String, goal: Int, datetime: String, note: String): GoalTime
        savePomodoro(rootarea: String, area: String, objectiveId: String, notes: String, objective: String, datetime: String, minutes: Int): Boolean!
        toggleFocusFlag(rootarea: String!, area: String!): Boolean
        login(username: String!, pwd: String!, uiversion: String): User
        logout: Boolean!
        googleLogin(firstname: String!, lastname: String!, email: String!, token: String!, googleid: String!, uiversion: String): User
        signup(username: String!, pwd: String!, uiversion: String): Boolean!
        updateProfile(firstname: String, lastname: String, email: String, startarea: String): User
        runUpdate: Boolean
      }

      schema {
        query: Query
        mutation: Mutation
      }
    `
    ];

    const resolvers = {
      Query: {
        isLoggedin: async (root, args, { req }) => {
          if (req.session.user) {
            const user = await Users.findOne({
              _id: ObjectId(req.session.user._id)
            });
            return prepare(user);
          } else {
            throw new Error("User not logged in");
          }
        },
        areas: async (parent, args, { req }) => {
          return (await Areas.find({
            userid: req.session.user._id
          }).toArray()).map(prepare);
        },
        users: async (parent, args, { req }) => {
          return (await Users.find({
            userid: req.session.user._id
          }).toArray()).map(prepare);
        },
        area: async (root, { _id }, { req }) => {
          return prepare(
            await Areas.findOne({
              _id: ObjectId(_id),
              userid: req.session.user._id
            })
          );
        },
        ranktimes: async (root, { areaId }, { req }) => {
          return (await RankTimes.find({
            areaId: areaId,
            userid: req.session.user._id
          })
            .sort({ date: -1 })
            .toArray()).map(prepare);
        },
        arealinks: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          return (await AreaLinks.find(args).toArray()).map(prepare);
        },
        goaltimes: async (root, { _id }, { req }) => {
          return (await GoalTimes.find({ userid: req.session.user._id })
            .sort({ date: -1 })
            .toArray()).map(prepare);
        },
        lastranktime: async (root, { areaId }, { req }) => {
          return prepare(
            await RankTimes.findOne(
              { areaId: areaId, userid: req.session.user._id },
              { sort: { date: -1 } }
            )
          );
        },
        lastgoaltime: async (root, { areaId }, { req }) => {
          return prepare(
            await GoalTimes.findOne(
              { areaId: areaId, userid: req.session.user._id },
              { sort: { date: -1 } }
            )
          );
        }
      },
      User: {
        area: async ({ startarea }, parent, { req }) => {
          return prepare(await Areas.findOne({ _id: ObjectId(startarea) }));
        }
      },
      Area: {
        areas: async ({ _id }, parent, { req }) => {
          const args = { rootarea: _id, userid: req.session.user._id };
          const arealinks = await AreaLinks.distinct("area", args);

          return (await Areas.find({
            _id: {
              $in: arealinks.map(function(id) {
                return ObjectId(id);
              })
            }
          }).toArray()).map(prepare);
        },
        rank: async ({ _id }) => {
          const rank = await RankTimes.findOne(
            { area: _id },
            { sort: { date: -1 } }
          );
          return rank ? prepare(rank) : null;
        },
        goal: async ({ _id }) => {
          const goal = await GoalTimes.findOne(
            { area: _id },
            { sort: { date: -1 } }
          );
          return goal ? prepare(goal) : null;
        }
      },
      Mutation: {
        runUpdate: async (parent, args, { req }) => {
          const areas = await Areas.find({
            wheellink: { $ne: null }
          }).toArray();
          areas.map(function(area) {
            updatewheels(area);
          });

          const wheelarealinks = await WheelAreaLinks.find().toArray();
          wheelarealinks.map(function(wheelarealink) {
            queryarea(wheelarealink);
          });

          const ranktimes = await RankTimes.find().toArray();
          ranktimes.map(function(ranktime) {
            updaterank(ranktime);
          });

          const goaltimes = await GoalTimes.find().toArray();
          goaltimes.map(function(goaltime) {
            updategoal(goaltime);
          });

          return true;
        },
        toggleFocusFlag: async (parent, args, { req }) => {
          const area = await AreaLinks.findOne({
            rootarea: args.rootarea,
            area: args.area
          });
          var focusflag;

          if (area.focus) focusflag = false;
          else focusflag = true;

          await AreaLinks.updateOne(
            { rootarea: args.rootarea, area: args.area },
            { $set: { focus: focusflag } }
          );
          await Areas.updateOne(
            { _id: ObjectId(args.area) },
            { $set: { focus: focusflag } }
          );
          return focusflag;
        },
        updateProfile: async (parent, args, { req }) => {
          const res = await Users.updateOne(
            { _id: ObjectId(req.session.user._id) },
            { $set: args }
          );
          return prepare(res);
        },
        signup: async (parent, { username, pwd, uiversion }, { req }) => {
          const user = await Users.findOne({ email: username });
          if (user) {
            throw new Error("Another User with same username exists.");
          }

          const res = await Users.insertOne({
            email: username,
            password: bcrypt.hashSync(pwd, 10),
            uiversion: uiversion,
            serverversion: pjson.version
          });

          req.session.user = {
            user
          };

          return true;
        },
        login: async (parent, args, { req }) => {
          const user = await Users.findOne({ email: args.username });
          //const user = data[username];
          if (user) {
            if (await bcrypt.compareSync(args.pwd, user.password)) {
              req.session.user = user;
              user.serverversion = pjson.version;

              await Users.updateOne(
                { _id: ObjectId(user._id) },
                {
                  $set: {
                    uiversion: args.uiversion,
                    lastip: req.ip
                  }
                }
              );

              return prepare(user);
            }

            throw new Error("Incorrect password.");
          }

          await Users.insertOne({
            email: args.username,
            password: bcrypt.hashSync(args.pwd, 10),
            uiversion: args.uiversion,
            serverversion: pjson.version,
            state: "new"
          });

          const newuser = await Users.findOne({ email: args.username });

          req.session.user = {
            newuser
          };

          return prepare(user);
        },
        googleLogin: async (parent, args, { req }) => {
          const tokenInfo = await oAuth2Client.getTokenInfo(args.token);

          if ((tokenInfo.email = args.email)) {
            //check token authentication...

            const user = await Users.findOne({ email: args.email });
            if (!user) {
              args.state = "new";
              args.serverversion = pjson.version;
              args.lastip = req.ip;
              const user = args;
              req.session.user = user;
              args.token = null; //removing the token from saving in database for security
              await Users.insertOne(args);
              return prepare(user);
            }

            await Users.updateOne(
              { _id: ObjectId(user._id) },
              {
                $set: {
                  uiversion: args.uiversion,
                  googleid: args.googleid,
                  lastip: req.ip
                }
              }
            );
            user.token = args.token;
            req.session.user = user;

            return {
              firstname: user.firstname,
              startarea: user.startarea,
              serverversion: pjson.version
            };
          }
          throw new Error("Error authenticating with google");

          // https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=%22ya29.GltCByku5ux1wZwDEZziUSrMh_3BVkjqHcpafZF_hC621Z4WivwtzTOysquVDgq73gHoueqReNMgnkoTjUKkdMXbHku_XO1onwyZ_rnGj-yW71foQfBo2NkNlDhx%22
          // https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=%22ya29.GltCByku5ux1wZwDEZziUSrMh_3BVkjqHcpafZF_hC621Z4WivwtzTOysquVDgq73gHoueqReNMgnkoTjUKkdMXbHku_XO1onwyZ_rnGj-yW71foQfBo2NkNlDhx%22
        },

        logout: async (parent, args, { req }) => {
          if (req.session.user.token)
            await oAuth2Client.revokeToken(req.session.user.token);
          req.session.user = null;
          return true;
        },
        createArea: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          args.serverversion = pjson.version;
          args.uiversion = req.session.user.uiversion;
          const res = await Areas.insertOne(args);
          return prepare(res.ops[0]);
        },
        savePomodoro: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          args.serverversion = pjson.version;
          args.uiversion = req.session.user.uiversion;
          args.date = new Date(args.datetime);
          await Pomodoros.insertOne(args);
          return true;
        },
        updateArea: async (root, args, { req }) => {
          await Areas.updateOne(
            { _id: ObjectId(args.areaId), userid: req.session.user._id },
            { $set: args }
          );
          return prepare(args);
        },
        deleteAreaLink: async (root, { rootarea, area }, { req }) => {
          const res = await AreaLinks.deleteMany(
            { rootarea: rootarea, area: area, userid: req.session.user._id },
            { $set: { arealink: null } }
          );
          return res;
        },
        updateArea: async (root, args, req) => {
          const res = await Areas.updateOne(
            { _id: ObjectId(args.area), userid: req.req.session.user._id },
            { $set: args }
          );
          return res;
        },
        createAreaLink: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          args.serverversion = pjson.version;
          args.uiversion = req.session.user.uiversion;
          await AreaLinks.insertOne({
            rootarea: args.rootarea,
            area: args.area,
            userid: req.session.user._id
          });

          return true;
        },
        createArea: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          args.serverversion = pjson.version;
          args.uiversion = req.session.user.uiversion;

          const res = await Areas.insert(args);

          await AreaLinks.insertOne({
            rootarea: args.rootarea,
            area: res.insertedIds[0].toString(),
            areaname: args.name,
            userid: req.session.user._id,
            serverversion: pjson.version,
            uiversion: req.session.user.uiversion
          });
          return prepare(
            await Areas.findOne({
              _id: res.insertedIds[0],
              userid: req.session.user._id
            })
          );
        },
        createRankTime: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          args.date = new Date(args.datetime);
          const res = await RankTimes.insert(args);
          return {
            _id: res.insertedIds[1],
            message: "new rank entry created prod"
          };
        },
        createGoalTime: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          args.serverversion = pjson.version;
          args.uiversion = req.session.user.uiversion;
          args.date = new Date(args.datetime);
          const res = await GoalTimes.insert(args);
          return {
            _id: res.insertedIds[1],
            message: "new goal entry created prod"
          };
        },
        deleteArea: async (root, { rootarea, area }, { req }) => {
          var message = "";
          AreaLinks.deleteOne(
            { rootarea: rootarea, area: area, userid: req.session.user._id },
            function(err, obj) {
              if (err) throw err;
              message = obj.deletedCount + " area(s) deleted";
            }
          );
          return { _id: areaId, title: message };
        }
      }
    };

    async function updatewheels(area) {
      try {
        const wheel = await Wheels.update(
          { _id: ObjectId(area.wheellink) },
          {
            $set: {
              rootarea: area._id.toString()
            }
          }
        );
        return wheel;
      } catch (error) {
        console.log(error);
      }
    }

    async function queryarea(area) {
      try {
        const wheel = await Wheels.findOne({ _id: ObjectId(area.wheel) });
        console.log(wheel);
        AreaLinks.insert({
          area: area.area,
          userid: area.userid,
          rootarea: wheel.rootarea
        });
        return wheel;
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
        console.log(ranktime);
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
    }

    const opts = {
      port: 3001,
      endpoint: "/server",
      cors: {
        credentials: true,
        origin: [
          "http://localhost:8000",
          "http://qa.lateralproducts.com.au",
          "http://staging.lateralproducts.com.au",
          "http://strategy.lateralproducts.com.au",
          "https://www.lateralproducts.com.au",
          "https://www.lateralproducts.com"
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
      typeDefs,
      resolvers,
      context
    });

    /* function loggingMiddleware(req, res, next) {
      console.log("ip:", req.ip);
      next();
    }
    server.express.use(loggingMiddleware); */
    //the function above tracks the ip address of requests

    // session middleware
    server.express.use(
      session({
        name: "qid",
        secret: `some-random-secret-here`,
        resave: true,
        saveUninitialized: true,
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
