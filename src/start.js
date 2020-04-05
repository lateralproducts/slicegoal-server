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
    const Objectives = db.collection("objectives");
    const Spaced = db.collection("spaced");
    const Signup = db.collection("signup");

    const Wheels = db.collection("wheels");
    const Clicks = db.collection("clicks");
    //const WheelAreaLinks = db.collection("wheelarealink");

    const Feedback = db.collection("feedback");

    const typeDefs = [
      `
      type Query {
        isLoggedin: User
        areas: [Area]
        users: [User]
        ranktimes(areaId: String): [RankTime]
        goaltimes(areaId: String): [GoalTime]
        area(_id: String!, navdirection: String): Area
        lastranktime(areaId: String): RankTime
        lastgoaltime(areaId: String): GoalTime
        arealinks(areaId: String, areaId: String): [AreaLink]
        readPomoData(area: String): PomodoroData
        readObjectivePomoData(objective: String): PomodoroData
        objectives(area: String): [Objective]
        pomodoros(objectiveId: String): [Pomodoro]
        spaced(area: String): [Spaced]
      }

      type Mutation {
        createArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
        updateArea(rootarea: String, name: String, definition: String, vision: String, notes: String, area: String): Area
        deleteArea(area: String): Area
        createAreaLink(rootarea: String, area: String, title: String, notes: String): Boolean
        deleteAreaLink(rootarea: String, area: String): Area
        createRankTime(area: String, rank: Int, datetime: String, note: String): RankTime
        createGoalTime(area: String, goal: Int, datetime: String, note: String, goaldate: String): GoalTime
        createObjective(area: String, datetime: String, objective: String, notes: String): Objective
        updateObjective(objectiveId: String, objective: String, notes: String, complete: String): Boolean
        createSpaced(area: String, datetime: String, prompt: String, answer: String): Spaced
        markSpacedYes(spacedId: String, datetime: String): Boolean
        markSpacedNo(spacedId: String, datetime: String): Boolean
        savePomodoro(area: String, links: [String], notes: String, objective: String, datetime: String, minutes: Int): Boolean!
        submitFeedback(title: String, description: String): Boolean
        toggleFocusFlag(rootarea: String!, area: String!): Boolean
        login(username: String!, pwd: String!, uiversion: String): User
        setUser(email: String!): User
        logout: Boolean!
        googleLogin(firstname: String!, lastname: String!, email: String!, token: String!, googleid: String!, uiversion: String): User
        signup(email: String, name: String, username: String, pwd: String, uiversion: String): Boolean!
        updateProfile(firstname: String, lastname: String, email: String, startarea: String): User
        runUpdate: Boolean!
        removeStartArea: Boolean!
        updateObjectiveOrder(objectives: [String]): Boolean
      }

      type AreaLink {
        _id: String
        rootarea: String
        area: String
        focus: Boolean
      }

      type Objective {
        _id: String
        objective: String
        notes: String
        area: String
        datetimecreated: Float
        datetimecompleted: Float
      }

      type Spaced {
        _id: String
        area: String
        prompt: String
        answer: String
        datetimecreated: Float
        datetimelast: Float
        fib0: String
        fib1: String
      }

      type Pomodoro {
        _id: String
        area: String
        links: String
        objective: String
        notes: String
        datetime: String
        minutes: Int
        date: String
      }

      type PomodoroData {
        _id: String
        count: Int
        records: Int
        direct: Int
        countdirect: Int
      }

      type ClickData {
        clicks: Int
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
        time: PomodoroData
        clicks: ClickData
      }

      type User {
        _id: String
        firstname: String
        email: String
        startarea: String
        area: Area
        serverversion: String
        state: String
        coach: Boolean
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
        goaldate: String
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
              _id: ObjectId(getuserid(req.session))
            });
            return prepare(user);
          } else {
            throw new Error("User not logged in");
          }
        },
        objectives: async (parent, args, { req }) => {
          return (await Objectives.find(
            {
              area: args.area,
              userid: getuserid(req.session),
              complete: { $eq: null }
            } //update sort at some stage.
          )
            .sort({ orderrank: 1 })
            .toArray()).map(prepare);
        },
        spaced: async (parent, args, { req }) => {
          const datecompare = new Date();
          console.log(new Date(datecompare.getTime() + 1000 * 3600 * 24 * 1));
          return (await Spaced.find(
            {
              area: args.area,
              userid: getuserid(req.session),
              $or: [{ datenext: null }, { datenext: { $lte: new Date() } }]
            } //update sort at some stage.
          ).toArray()).map(prepare);
        },
        areas: async (parent, args, { req }) => {
          return (await Areas.find({
            userid: getuserid(req.session)
          }).toArray()).map(prepare);
        },
        users: async (parent, args, { req }) => {
          if (req.session.user.coach) {
            return (await Users.find({}).toArray()).map(prepare);
          }

          return (await Users.find({
            userid: getuserid(req.session)
          }).toArray()).map(prepare);
        },
        area: async (root, { _id, navdirection }, { req }) => {
          if (navdirection == "forward") {
            Clicks.insertOne({
              userid: getuserid(req.session),
              date: new Date(),
              area: _id
            });
          }

          return prepare(
            await Areas.findOne({
              _id: ObjectId(_id),
              userid: getuserid(req.session)
            })
          );
        },
        ranktimes: async (root, { areaId }, { req }) => {
          return (await RankTimes.find({
            areaId: areaId,
            userid: getuserid(req.session)
          })
            .sort({ date: -1 })
            .toArray()).map(prepare);
        },
        arealinks: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          return (await AreaLinks.find(args).toArray()).map(prepare);
        },
        goaltimes: async (root, { _id }, { req }) => {
          return (await GoalTimes.find({ userid: getuserid(req.session) })
            .sort({ date: -1 })
            .toArray()).map(prepare);
        },
        lastranktime: async (root, { areaId }, { req }) => {
          return prepare(
            await RankTimes.findOne(
              { areaId: areaId, userid: getuserid(req.session) },
              { sort: { date: -1 } }
            )
          );
        },
        lastgoaltime: async (root, { areaId }, { req }) => {
          return prepare(
            await GoalTimes.findOne(
              { areaId: areaId, userid: getuserid(req.session) },
              { sort: { date: -1 } }
            )
          );
        },
        pomodoros: async (root, { objectiveId }, { req }) => {
          return (await Pomodoros.find(
            {
              objective: objectiveId
              //userid: getuserid(req.session)
            },
            { sort: { date: -1 } }
          ).toArray()).map(prepare);
        },
        readPomoData: async (root, { area }, { req }) => {
          return new Promise(function(resolve, reject) {
            Pomodoros.aggregate(
              {
                $match: {
                  $or: [
                    {
                      area: area
                    },
                    {
                      links: area
                    }
                  ]
                }
              },
              {
                $group: {
                  _id: { links: null }, //"$area"
                  count: { $sum: "$minutes" },
                  records: { $sum: 1 },
                  direct: {
                    $sum: {
                      $cond: { if: { $eq: ["$area", area] }, then: 1, else: 0 }
                    }
                  },
                  countdirect: {
                    $sum: {
                      $cond: {
                        if: { $eq: ["$area", area] },
                        then: "$minutes",
                        else: 0
                      }
                    }
                  }
                }
              },

              function(err, data) {
                console.log(err, data);
                if (err) throw err;
                resolve(data[0] ? data[0] : 0);
              }
            );
          });
        },
        readObjectivePomoData: async (root, { objective }, { req }) => {
          return new Promise(function(resolve, reject) {
            Pomodoros.aggregate(
              {
                $match: {
                  $or: [
                    {
                      objective: objective
                    }
                  ]
                }
              },
              {
                $group: {
                  _id: { links: null },
                  count: { $sum: "$minutes" },
                  records: { $sum: 1 }
                }
              },

              function(err, data) {
                console.log(err, data);
                if (err) throw err;
                resolve(data[0] ? data[0] : 0);
              }
            );
          });
        }
      },
      User: {
        area: async ({ startarea }, parent, { req }) => {
          return startarea
            ? prepare(await Areas.findOne({ _id: ObjectId(startarea) }))
            : null;
        }
      },
      Area: {
        clicks: async ({ _id }, parent, { req }) => {
          return new Promise(function(resolve, reject) {
            Clicks.aggregate(
              {
                $match: {
                  area: _id
                }
              },
              {
                $group: {
                  _id: null,
                  clicks: { $sum: 1 }
                }
              },

              function(err, data) {
                console.log(err, data);
                if (err) throw err;
                resolve(data[0] ? data[0] : 0);
              }
            );
          });
        },
        areas: async ({ _id }, parent, { req }) => {
          const args = { rootarea: _id, userid: getuserid(req.session) };
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
        },
        time: async ({ _id }) => {
          return new Promise(function(resolve, reject) {
            Pomodoros.aggregate(
              {
                $match: {
                  $or: [
                    {
                      area: _id
                    },
                    {
                      links: _id
                    }
                  ]
                }
              },
              {
                $group: {
                  _id: { links: null }, //"$area"
                  count: { $sum: "$minutes" },
                  records: { $sum: 1 },
                  direct: {
                    $sum: {
                      $cond: { if: { $eq: ["$area", _id] }, then: 1, else: 0 }
                    }
                  },
                  countdirect: {
                    $sum: {
                      $cond: {
                        if: { $eq: ["$area", _id] },
                        then: "$minutes",
                        else: 0
                      }
                    }
                  }
                }
              },

              function(err, data) {
                console.log(err, data);
                if (err) throw err;
                resolve(data[0] ? data[0] : 0);
              }
            );
          });
        }
      },
      Mutation: {
        runUpdate: async (parent, args, { req }) => {
          // runUpdate: Boolean
          const pomos = await Pomodoros.find({
            links: { $eq: null }
          }).toArray();

          pomos.map(function(pomo) {
            updatepomos(pomo);
          });

          /* const wheelarealinks = await WheelAreaLinks.find().toArray();
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
          }); */

          return true;
        },
        removeStartArea: async (parent, args, { req }) => {
          await Users.updateOne(
            { _id: ObjectId(getuserid(req.session)) },
            { $set: { startarea: null } }
          );

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
          await Users.updateOne(
            { _id: ObjectId(getuserid(req.session)) },
            { $set: args }
          );
          return args;
        },
        updateObjectiveOrder: async (parent, args, { req }) => {
          console.log(args);
          args.objectives.map(function(_id, count) {
            Objectives.updateOne(
              { _id: ObjectId(_id) },
              { $set: { orderrank: count } }
            );
          });
          return true;
        },
        setUser: async (parent, { email }, { req }) => {
          const newuser = await Users.findOne({ email: email });

          //make it possible only for users who have impersonate function to impersonate another user for coaches
          if (req.session.user.coach) {
            req.session.user = newuser;
            //setTimeout(() => console.log("waited 5 seconds"), 10000);
            return newuser;
          }
          return null;
        },
        signup: async (parent, { email, name }, { req }) => {
          await Signup.insertOne({
            email: email,
            name: name
          });

          return true;
        },
        /* signupold: async (parent, { username, pwd, uiversion }, { req }) => {
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
        }, */
        login: async (parent, args, { req }) => {
          const user = await Users.findOne({ email: args.username });
          //const user = data[username];
          if (user) {
            if (user.incorrecttries < 6) {
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

              await Users.updateOne(
                { _id: ObjectId(user._id) },
                {
                  $set: {
                    incorrecttries:
                      (user.incorrecttries ? user.incorrecttries : 0) + 1
                  }
                }
              );

              throw new Error("Incorrect password.");
            }

            await Users.updateOne(
              { _id: ObjectId(user._id) },
              {
                $set: {
                  incorrecttries:
                    (user.incorrecttries ? user.incorrecttries : 0) + 1
                }
              }
            );
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
              state: user.state,
              coach: user.coach,
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
        savePomodoro: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.date = new Date(args.datetime);
          await Pomodoros.insertOne(args);
          return true;
        },
        submitFeedback: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.date = new Date(args.datetime);
          await Feedback.insertOne(args);
          return true;
        },
        updateArea: async (root, args, { req }) => {
          await Areas.updateOne(
            { _id: ObjectId(args.area), userid: getuserid(req.session) },
            { $set: args }
          );
          args._id = args.area;
          return args;
        },
        deleteAreaLink: async (root, { rootarea, area }, { req }) => {
          const res = await AreaLinks.deleteMany(
            { rootarea: rootarea, area: area, userid: getuserid(req.session) },
            { $set: { arealink: null } }
          );
          return res;
        },
        createAreaLink: async (root, args, { req }) => {
          // args.userid = getuserid(req.session);
          // args.serverversion = pjson.version;
          // args.uiversion = getuiversion(req.session);
          await AreaLinks.insertOne({
            rootarea: args.rootarea,
            area: args.area,
            userid: getuserid(req.session)
          });

          return true;
        },
        createArea: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);

          const res = await Areas.insert(args);

          await AreaLinks.insertOne({
            rootarea: args.rootarea,
            area: res.insertedIds[0].toString(),
            areaname: args.name,
            userid: getuserid(req.session),
            serverversion: pjson.version,
            uiversion: getuiversion(req.session)
          });
          return prepare(
            await Areas.findOne({
              _id: res.insertedIds[0],
              userid: getuserid(req.session)
            })
          );
        },
        createRankTime: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.date = new Date(args.datetime);
          const res = await RankTimes.insert(args);
          return {
            _id: res.insertedIds[1],
            message: "new rank entry created prod"
          };
        },
        createGoalTime: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.date = new Date(args.datetime);
          if (args.goaldate) args.goaldate = new Date(args.goaldate);
          const res = await GoalTimes.insert(args);
          return {
            _id: res.insertedIds[1],
            message: "new goal entry created"
          };
        },
        createObjective: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.date = new Date(args.datetime);
          const res = await Objectives.insert(args);
          return {
            _id: res.insertedIds[1],
            message: "new objective created"
          };
        },
        createSpaced: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.datecreated = new Date(args.datetime);
          args.date = new Date(args.datetime);
          args.fib0 = 0;
          args.fib1 = 1;
          var nextdate = new Date(); //set nextdate for tomorrow.
          nextdate.setDate(nextdate.getDate() + 1);
          args.datenext = nextdate;
          const res = await Spaced.insert(args);
          return {
            _id: res.insertedIds[1],
            message: "new objective created"
          };
        },
        markSpacedYes: async (root, args, { req }) => {
          args.date = new Date(args.datetime);
          const Id = args.spacedId;
          delete args.spacedId;
          const spacedobject = await Spaced.findOne({
            _id: ObjectId(Id),
            userid: getuserid(req.session)
          });
          if (spacedobject.fib1) {
            args.fib1 = spacedobject.fib0 + spacedobject.fib1;
            args.fib0 = spacedobject.fib1;
          } else {
            args.fib1 = 1;
            args.fib0 = 1;
          }
          var nextdate = new Date(args.datetime); //set nextdate for today + fibonacci sequence
          nextdate.setDate(nextdate.getDate() + args.fib1);
          args.datenext = nextdate;
          await Spaced.update(
            { _id: ObjectId(Id), userid: getuserid(req.session) },
            {
              $set: args
            }
          );
          return true;
        },
        markSpacedNo: async (root, args, { req }) => {
          args.date = new Date(args.datetime);
          args.fib0 = 0;
          args.fib1 = 1;
          const Id = args.spacedId;
          delete args.spacedId;
          var nextdate = new Date();
          nextdate.setDate(nextdate.getDate() + 1);
          args.datenext = nextdate;

          const spacedobject = await Spaced.findOne({
            _id: ObjectId(Id),
            userid: getuserid(req.session)
          });

          args.markedno = spacedobject.markedno ? spacedobject.markedno + 1 : 1;

          await Spaced.update(
            { _id: ObjectId(Id), userid: getuserid(req.session) },
            {
              $set: args
            }
          );
          return true;
        },
        updateObjective: async (root, args, { req }) => {
          if (args.complete) args.complete = new Date(args.complete);
          const objective = args.objectiveId;
          delete args.objectiveId;
          await Objectives.update(
            { _id: ObjectId(objective), userid: getuserid(req.session) },
            {
              $set: args
            }
          );
          return true;
        },

        deleteArea: async (root, { rootarea, area }, { req }) => {
          var message = "";
          AreaLinks.deleteOne(
            { rootarea: rootarea, area: area, userid: getuserid(req.session) },
            function(err, obj) {
              if (err) throw err;
              message = obj.deletedCount + " area(s) deleted";
            }
          );
          return { _id: areaId, title: message };
        }
      }
    };

    function getuserid(session) {
      if (session.user) return session.user._id;
      else return "5d70b68aa1e6bf52b9906b8e";
    }

    function getuiversion(session) {
      if (session.user) return session.user.uiversion;
      else return "test";
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

          console.log(JSON.stringify(data, undefined, 2));
          console.log(data[0].count);
          return data[0].count;
        }
      );
    }

    async function updatepomos(area) {
      try {
        if (area.area) {
          console.log(area);
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

    async function queryarea(area) {
      try {
        const wheel = await Wheels.findOne({ _id: ObjectId(area.wheel) });
        // console.log(wheel);
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
        // console.log(ranktime);
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
