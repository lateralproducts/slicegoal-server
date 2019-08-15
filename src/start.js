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

const data = {};

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
    const Wheels = db.collection("wheels");
    const Areas = db.collection("areas");
    const RankTimes = db.collection("ranktimes");
    const GoalTimes = db.collection("goaltimes");
    const WheelAreaLinks = db.collection("wheelarealink");
    const Users = db.collection("users");
    const Pomodoros = db.collection("pomodoros");

    const typeDefs = [
      `
      type Query {
        isLoggedin: User
        wheel(_id: String): Wheel
        wheels: [Wheel]
        areas: [Area]
        users: [User]
        ranktimes(areaId: String): [RankTime]
        goaltimes(areaId: String): [GoalTime]
        area(_id: String): Area
        lastranktime(areaId: String): RankTime
        lastgoaltime(areaId: String): GoalTime
        wheelarealinks(areaId: String, wheelId: String): [WheelAreaLink]
      }

      type WheelAreaLink {
        _id: String
        area: String
        wheel: String
      }

      type Wheel {
        _id: String
        title: String
        vision: String
        notes: String
        areas: [Area]
      }

      type Area {
        _id: String
        wheelId: String
        wheel: Wheel
        name: String
        rank: RankTime
        goal: GoalTime
        definition: String
        wheellink: Wheel
        focus: Boolean
      }

      type User {
        _id: String
        firstname: String
        email: String
        startwheel: String
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
        createWheel(title: String, vision: String, notes: String): Wheel
        updateWheel(wheelId: String!, title: String, vision: String, notes: String): Wheel
        createArea(wheelId: String, wheel: String, name: String, definition: String, wheellink: String): Area
        addExistingArea(wheelId: String, areaId: String): Area
        updateArea(areaId: String, wheel: String, name: String, definition: String, wheellink: String): Area
        createWheelLink(areaId: String!,title: String!, notes: String): Wheel
        deleteWheelLink(areaId: String!): Area
        createRankTime(areaId: String, rank: Int, datetime: String, note: String): RankTime
        createGoalTime(areaId: String, goal: Int, datetime: String, note: String): GoalTime
        deleteArea(areaId: String, wheelId: String): Area
        shiftLinks(areaId: String): String
        login(username: String!, pwd: String!, uiversion: String): User
        logout: Boolean!
        googleLogin(firstname: String!, lastname: String!, email: String!, token: String!, googleid: String!, uiversion: String): User
        signup(username: String!, pwd: String!, uiversion: String): Boolean!
        updateProfile(firstname: String, lastname: String, email: String, startwheel: String): User
        savePomodoro(wheelId: String, areaId: String, objectiveId: String, notes: String, objective: String, datetime: String, minutes: Int): Boolean!
        toggleFocusFlag(areaId: String!): Boolean
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
        wheel: async (root, { _id }, { req }) => {
          if (req.session.user) {
            return prepare(
              await Wheels.findOne({
                _id: ObjectId(_id),
                userid: req.session.user._id
              })
            );
          } else {
            return "";
          }
        },
        wheels: async (parent, args, { req }) => {
          return (await Wheels.find({
            userid: req.session.user._id
          }).toArray()).map(prepare);
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
        wheelarealinks: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          return (await WheelAreaLinks.find(args).toArray()).map(prepare);
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
      Wheel: {
        areas: async ({ _id }, parent, { req }) => {
          const args = { wheel: _id, userid: req.session.user._id };
          const arealinks = await WheelAreaLinks.distinct("area", args);

          return (await Areas.find({
            _id: {
              $in: arealinks.map(function(id) {
                return ObjectId(id);
              })
            }
          }).toArray()).map(prepare);
        }
      },
      Area: {
        wheel: async ({ wheelId }) => {
          return prepare(await Wheels.findOne(ObjectId(wheelId)));
        },
        wheellink: async ({ wheellink }) => {
          return wheellink
            ? prepare(await Wheels.findOne(ObjectId(wheellink)))
            : null;
        },
        rank: async ({ _id }) => {
          const rank = await RankTimes.findOne(
            { areaId: _id },
            { sort: { date: -1 } }
          );
          return rank ? prepare(rank) : null;
        },
        goal: async ({ _id }) => {
          const goal = await GoalTimes.findOne(
            { areaId: _id },
            { sort: { date: -1 } }
          );
          return goal ? prepare(goal) : null;
        }
      },
      Mutation: {
        toggleFocusFlag: async (parent, args, { req }) => {
          const area = await Areas.findOne({
            _id: ObjectId(args.areaId)
          });
          var focusflag;

          if (area.focus) focusflag = false;
          else focusflag = true;

          const res = await Areas.updateOne(
            { _id: ObjectId(args.areaId) },
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
              startwheel: user.startwheel,
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
        createWheel: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          args.serverversion = pjson.version;
          args.uiversion = req.session.user.uiversion;
          const res = await Wheels.insertOne(args);
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
        updateWheel: async (root, args, { req }) => {
          await Wheels.updateOne(
            { _id: ObjectId(args.wheelId), userid: req.session.user._id },
            { $set: args }
          );
          return prepare(args);
        },
        deleteWheelLink: async (root, { areaId }, { req }) => {
          const res = await Areas.updateOne(
            { _id: ObjectId(areaId), userid: req.session.user._id },
            { $set: { wheellink: null } }
          );
          return res;
        },
        updateArea: async (root, args, { req }) => {
          const res = await Areas.updateOne(
            { _id: ObjectId(args.areaId), userid: req.session.user._id },
            { $set: args }
          );
          return res;
        },
        createWheelLink: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          args.serverversion = pjson.version;
          args.uiversion = req.session.user.uiversion;
          const res = await Wheels.insertOne(args);
          const newwheelid = res.ops[0]._id.toString();

          await Areas.updateOne(
            { _id: ObjectId(args.areaId), userid: req.session.user._id },
            { $set: { wheellink: newwheelid } }
          );

          return prepare(res.ops[0]);
        },

        shiftLinks: async (root, args, { req }) => {
          /* Areas.update(
            { userid: null },
            { $set: { userid: "5d2adcf120f52b0d7d7faba0" } },
            { multi: true }
          );
          */
          return "shiftLinks was run once, commented out.";
        },

        createArea: async (root, args, { req }) => {
          args.userid = req.session.user._id;
          args.serverversion = pjson.version;
          args.uiversion = req.session.user.uiversion;

          const res = await Areas.insert(args);

          await WheelAreaLinks.insertOne({
            wheel: args.wheelId,
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
        addExistingArea: async (root, args, { req }) => {
          const res = await WheelAreaLinks.insertOne({
            wheel: args.wheelId,
            area: args.areaId,
            userid: req.session.user._id
          });
          return prepare(await Areas.findOne({ _id: ObjectId(args.areaId) }));
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
        deleteArea: async (root, { areaId, wheelId }, { req }) => {
          var message = "";
          WheelAreaLinks.deleteOne(
            { area: areaId, wheel: wheelId, userid: req.session.user._id },
            function(err, obj) {
              if (err) throw err;
              message = obj.deletedCount + " area(s) deleted";
            }
          );
          return { _id: areaId, title: message };
        }
      }
    };

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
