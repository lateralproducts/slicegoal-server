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

var env = "test";

app.use(cors());
/* const homePath = "/graphiql";
const URL = "http://localhost";
const PORT = 3001; */
var MONGO_URL = `${process.env.MONGODB_URL}`; //27017
if (MONGO_URL == "undefined") {
  MONGO_URL = "mongodb://172.31.1.156:27017/strategy";
  env = "prod";
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
    const ObjectiveLinks = db.collection("objectivelinks");
    const Spaced = db.collection("spaced");
    const Notes = db.collection("notes");
    const NoteLinks = db.collection("notelinks");
    const FocusLinks = db.collection("focuslinks");
    const Logins = db.collection("logins");
    const Clicks = db.collection("clicks");
    const Feedback = db.collection("feedback");

    //const Wheels = db.collection("wheels");
    //const WheelAreaLinks = db.collection("wheelarealink");
    //const Signup = db.collection("signup");

    const typeDefs = [
      `
      type Query {
        isLoggedin: User
        areas (readdate: String): [Area]
        users: [User]
        ranktimes(areaId: String): [RankTime]
        goaltimes(areaId: String): [GoalTime]
        area(_id: String!, navdirection: String, readdate: String): Area
        lastranktime(areaId: String): RankTime
        lastgoaltime(areaId: String): GoalTime
        arealinks(area: String): [AreaLink]
        readPomoData(area: String): PomodoroData
        readObjectivePomoData(objective: String): PomodoroData
        objectives(area: String!): [Objective]
        objectiveLinks(area: String, objective: String): [ObjectiveLink]
        pomodoros(objectiveId: String): [Pomodoro]
        notes(area: String): [NoteLink]
        noteLinks(noteid: String): [NoteLink]
        focusLinks: [Focus]
        focusLink(focuslink: String): Focus
      }

      type Mutation {
        createArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
        updateArea(rootarea: String, name: String, definition: String, vision: String, area: String): Area
        deleteArea(area: String): Area
        createAreaLink(rootarea: String, area: String, title: String, notes: String): Boolean
        deleteAreaLink(rootarea: String, area: String): Area
        createCoachArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
        createRankTime(area: String, rank: Int, datetime: String, note: String): RankTime
        createGoalTime(area: String, goal: Int, datetime: String, note: String, goaldate: String): GoalTime
        createNote(area: String, datetime: String, prompt: String, answer: String, linknote: String): Spaced
        updateNote(noteid: String, datetime: String, prompt: String, answer: String): Spaced 
        createNoteLink(noteid: String, area: String): Boolean
        updateNoteLink(linkid: String, notes: String): Boolean
        removeNoteLink(linkid: String): Boolean
        createNewNoteLink(areaname: String!, noteid: String!): Boolean
        markSpacedYes(noteId: String, datetime: String): Boolean
        markSpacedNo(noteId: String, datetime: String): Boolean
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
        createObjective(area: String, datetime: String, objective: String, notes: String, keys:[KeyIn]): Objective
        updateObjective(objectiveId: String!, objective: String, notes: String, datetime: String, complete: String, keys:[KeyIn]): Boolean
        checkKey(objectiveId: String!, index: Int, check: Boolean): Boolean
        updateObjectiveOrder(objectives: [String]): Boolean
        updateFocusOrder(objectives: [String]): Boolean
        createObjectiveLink(objectiveid: String, areaid: String): Boolean
        updateObjectiveLink(linkid: String!, notes: String, snooze: String): Boolean
        removeObjectiveLink(linkid: String!): Boolean
        saveFocusLink(area: String!, objective: String!, datetime: String!, links: [String]): Boolean
        snoozeFocusLink(linkid: String!, snooze: String!): Boolean
      }

      type AreaLink {
        _id: String
        rootarea: String
        area: String
        focus: Boolean
        linkedarea: Area
      }

      type Objective {
        _id: String
        objective: String
        notes: String
        area: String
        datetime: String
        complete: String
        date: String
        keys: [Key]
      }

      input KeyIn {
        title: String
        checked: Boolean
      }

      type Key {
        title: String
        checked: Boolean
      }

      type ObjectiveLink {
        _id: String
        objectiveid: String
        areaid: String
        notes: String
        area: Area
        objective: Objective
      }

      type Focus {
        _id: String
        area: Area
        objective: Objective
        links: [String]
      }

      type Note {
        _id: String
        area: String
        prompt: String
        answer: String
        spaced: Spaced
        notelink: String
      }

      type NoteLink {
        _id: String
        noteid: String
        areaid: String
        area: Area
        note: Note
        notes: String 
      }

      type Spaced {
        _id: String
        noteid: String
        note: Note
        area: String
        datetimecreated: Float
        datetimelast: Float
        fib0: String
        fib1: String
        datenext: String
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
        time(readdate: String): PomodoroData
        clicks: ClickData
        coach: Boolean
      }

      type User {
        _id: String
        firstname: String
        email: String
        startarea: String
        area: Area
        serverversion: String
        state: String
        profile: String
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
        isLoggedin: async (root, args, { req, ip }) => {
          if (req.session.user) {
            const user = await Users.findOne({
              _id: ObjectId(getuserid(req.session))
            });

            await Logins.insertOne({
              email: req.session.user.email,
              lastip: ip,
              result: "success",
              type: "loggedin refresh",
              lastlogin: new Date()
            });
            return prepare(user);
          } else {
            await Logins.insertOne({
              request: args,
              lastip: ip,
              result: "failed",
              type: "loggedin refresh",
              lastlogin: new Date()
            });
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
        objectiveLinks: async (parent, args, { req }) => {
          var query = Object();
          args.area ? (query.areaid = args.area) : "";
          args.objective ? (query.objectiveid = args.objective) : "";
          query.userid = getuserid(req.session);
          query.complete = { $eq: null };

          return (await ObjectiveLinks.find(query, {
            sort: { orderrank: 1 }
          }).toArray()).map(prepare);
        },
        focusLinks: async (parent, args, { req }) => {
          return (await FocusLinks.find(
            {
              userid: getuserid(req.session),
              $or: [{ snooze: null }, { snooze: { $lt: new Date() } }]
            } //update sort at some stage.
          )
            .sort({ orderrank: 1 })
            .toArray()).map(prepare);
        },
        focusLink: async (parent, args, { req }) => {
          return await FocusLinks.findOne(
            {
              userid: getuserid(req.session),
              _id: ObjectId(args.focuslink)
            },
            { sort: { date: -1 } } //update sort at some stage.
          );
        },
        notes: async (parent, args, { req }) => {
          const notelinks = (await NoteLinks.find(
            {
              area: args.area,
              userid: getuserid(req.session),
              $or: [{ nextdate: null }, { nextdate: { $lte: new Date() } }]
            },
            { sort: { datecreated: -1 } } //return reverse chron. Last note created at top of list.
          ).toArray()).map(prepare);

          return notelinks.map(prepare);
        },
        noteLinks: async (parent, args, { req }) => {
          const notelinks = (await NoteLinks.find({
            noteid: args.noteid,
            userid: getuserid(req.session)
          }).toArray()).map(prepare);
          return notelinks;
        },
        areas: async (parent, args, { req }) => {
          return (await Areas.find({
            $or: [
              { userid: getuserid(req.session) },
              { coach: true, userid: { $in: getcoachid(req.session) } }
            ]
          })
            .sort({ clicks: -1 })
            .toArray()).map(prepare);
        },
        users: async (parent, args, { req }) => {
          if (req.session.user.thiscoach != null) {
            return [req.session.user.thiscoach];
          }

          if (req.session.user.profile == "coach") {
            const clients = await Users.find({
              coaches: getuserid(req.session)
            }).toArray(); //.map(function(client) {return client._id;})
            req.session.user.clients = clients;
            return clients.map(prepare);
          }

          return (await Users.find({
            userid: getuserid(req.session)
          }).toArray()).map(prepare);
        },
        area: async (root, { _id, navdirection }, { req }) => {
          logareaclick(_id, navdirection, req);

          return prepare(
            await Areas.findOne({
              _id: ObjectId(_id),
              $or: [
                { userid: getuserid(req.session) },
                { coach: true, userid: { $in: getcoachid(req.session) } } //this makes the area visible to clients. Using coach:true field.
              ]
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
          return (await AreaLinks.find({
            rootarea: { $not: { $eq: null } },
            area: args.area
          }).toArray()).map(prepare);
        },
        goaltimes: async (root, { _id }, { req }) => {
          return (await GoalTimes.find({ userid: getuserid(req.session) })
            .sort({ date: -1 })
            .toArray()).map(prepare);
        },
        lastranktime: async (root, { areaId }, { req }) => {
          //if coach, return average of coachees.
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
      Note: {
        spaced: async ({ _id }, parent, { req }) => {
          var spaced = await Spaced.findOne({
            noteid: _id,
            userid: getuserid(req.session)
          });
          return spaced;
        }
      },
      AreaLink: {
        linkedarea: async (args, parent, { req }) => {
          return prepare(
            args.rootarea
              ? await Areas.findOne({
                  _id: ObjectId(args.rootarea)
                })
              : { _id: ObjectId(args.area), name: null }
          );
        }
      },
      NoteLink: {
        area: async (args, parent, { req }) => {
          return prepare(
            await Areas.findOne({
              _id: ObjectId(args.area)
            })
          );
        },
        note: async ({ noteid }, parent, { req }) => {
          return prepare(
            await Notes.findOne({
              _id: ObjectId(noteid)
            })
          );
        }
      },
      ObjectiveLink: {
        area: async ({ areaid }, parent, { req }) => {
          return prepare(
            await Areas.findOne({
              _id: ObjectId(areaid)
            })
          );
        },
        objective: async ({ objectiveid }, parent, { req }) => {
          return prepare(
            await Objectives.findOne({
              _id: ObjectId(objectiveid)
              //complete: { $eq: null } This causes an error.
            })
          );
        }
      },
      Focus: {
        area: async ({ area }, parent, { req }) => {
          return prepare(
            await Areas.findOne({
              _id: ObjectId(area)
            })
          );
        },
        objective: async ({ objective }, parent, { req }) => {
          return prepare(
            await Objectives.findOne({
              _id: ObjectId(objective)
            })
          );
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
        rank: async ({ _id, coach }, parent, { req }) => {
          if (req.session.user)
            if ((req.session.user.profile === "coach") & (coach === true)) {
              return new Promise(function(resolve, reject) {
                //returning the average of the area for coaching
                RankTimes.aggregate(
                  {
                    $match: {
                      area: _id,
                      userid: {
                        $in: req.session.user.clients
                          ? req.session.user.clients.map(client => client._id)
                          : []
                      }
                    }
                  },
                  {
                    $group: {
                      _id: { area: "$area", userid: "$userid" },
                      date: {
                        $last: "$date"
                      },
                      rank: { $last: "$rank" }
                    }
                  },
                  {
                    $group: {
                      _id: "$*_*id.area",
                      rank: { $avg: "$rank" }
                    }
                  },

                  function(err, data) {
                    if (err) throw err;
                    resolve(
                      data[0]
                        ? {
                            rank: parseInt(data[0].rank),
                            note: "coaching team average"
                          }
                        : null
                    );
                  }
                );
              });
            } else {
              const rank = await RankTimes.findOne(
                { area: _id, userid: getuserid(req.session) },
                { sort: { date: -1 } }
              );
              return rank ? prepare(rank) : null;
            }
        },
        goal: async ({ _id }, parent, { req }) => {
          const goal = await GoalTimes.findOne(
            { area: _id, userid: getuserid(req.session) },
            { sort: { date: -1 } }
          );
          return goal ? prepare(goal) : null;
        },
        time: async ({ _id }, parent, { req }, query) => {
          if (parent || item) {
          }
          return new Promise(function(resolve, reject) {
            Pomodoros.aggregate(
              {
                $match: {
                  userid: getuserid(req.session),
                  date: {
                    $gte: new Date(
                      query.variableValues.readdate
                        ? query.variableValues.readdate
                        : null
                    )
                  },
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
                      $cond: {
                        if: { $eq: ["$area", _id] },
                        then: 1,
                        else: 0
                      }
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
          /* const objectives = await Objectives.find().toArray();

          objectives.map(function(objective) {
            migrateobjectives(objective);
          }); */

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
          args.objectives.map(function(_id, count) {
            ObjectiveLinks.updateOne(
              { _id: ObjectId(_id) },
              { $set: { orderrank: count } }
            );
          });
          return true;
        },
        updateFocusOrder: async (parent, args, { req }) => {
          args.objectives.map(function(_id, count) {
            FocusLinks.updateOne(
              { _id: ObjectId(_id) },
              { $set: { orderrank: count } }
            );
          });
          return true;
        },
        setUser: async (parent, { email }, { req }) => {
          const newuser = await Users.findOne({ email: email });

          //make it possible only for users who have impersonate function to impersonate another user for coaches
          if (req.session.user.thiscoach) {
            req.session.user = newuser;

            const clients = await Users.find({
              coaches: newuser._id.toString()
            }).toArray();
            req.session.user.clients = clients;

            return newuser;
          } else if (req.session.user.profile == "coach") {
            newuser.thiscoach = req.session.user;
            req.session.user = newuser;
            return newuser;
          } else return null;
        },
        signup: async (parent, args, { req }) => {
          /* await Signup.insertOne({
            email: email,
            name: name
          }); */

          await Users.insertOne({
            email: args.username,
            password: bcrypt.hashSync(args.pwd, 10),
            uiversion: args.uiversion,
            serverversion: pjson.version,
            state: "new",
            profile: "client"
          });

          const newuser = await Users.findOne({ email: args.username });

          req.session.user = {
            newuser
          };

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
        login: async (parent, args, { req, ip }) => {
          const user = await Users.findOne({ email: args.username });
          //const user = data[username];

          if (user) {
            if (user.incorrecttries < 6 && user.state == "verified") {
              if (await bcrypt.compareSync(args.pwd, user.password)) {
                req.session.user = user;
                user.serverversion = pjson.version;

                await Logins.insertOne({
                  email: args.username,
                  lastip: ip,
                  result: "success",
                  type: "username login",
                  lastlogin: new Date()
                });

                await Users.updateOne(
                  { _id: ObjectId(user._id) },
                  {
                    $set: {
                      uiversion: args.uiversion,
                      lastip: ip,
                      lastlogin: new Date()
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

              await Logins.insertOne({
                email: args.username,
                lastip: ip,
                result: "failed",
                type: "username login",
                lastlogin: new Date()
              });

              throw new Error("Incorrect password.");
            }

            await Logins.insertOne({
              email: args.username,
              lastip: ip,
              result: "failed",
              type: "username login",
              lastlogin: new Date()
            });

            await Users.updateOne(
              { _id: ObjectId(user._id) },
              {
                $set: {
                  incorrecttries:
                    (user.incorrecttries ? user.incorrecttries : 0) + 1
                }
              }
            );

            throw new Error("Login Failed.");
          }

          await Logins.insertOne({
            email: args.username,
            lastip: ip,
            result: "not registered",
            type: "username login",
            lastlogin: new Date()
          });

          await Users.insertOne({
            email: args.username,
            password: bcrypt.hashSync(args.pwd, 10),
            uiversion: args.uiversion,
            serverversion: pjson.version,
            state: "new",
            profile: "client"
          });

          throw new Error("Email not registered");
        },
        googleLogin: async (parent, args, { req, ip }) => {
          const tokenInfo = await oAuth2Client.getTokenInfo(args.token);

          if ((tokenInfo.email = args.email)) {
            //check token authentication...

            const user = await Users.findOne({ email: args.email });
            if (!user) {
              args.profile = "client";
              args.state = "new";
              args.serverversion = pjson.version;
              args.lastip = ip;
              const user = args;
              req.session.user = user;
              args.token = null; //removing the token from saving in database for security
              args.datecreated = new Date();
              await Users.insertOne(args);
              return prepare(user);
            }

            if (user.profile == "coach") {
              const clients = await Users.find({
                coaches: user._id.toString()
              }).toArray();
              user.clients = clients;
            }

            await Logins.insertOne({
              email: args.email,
              lastip: ip,
              result: "success",
              type: "google login",
              lastlogin: new Date()
            });

            await Users.updateOne(
              { _id: ObjectId(user._id) },
              {
                $set: {
                  uiversion: args.uiversion,
                  googleid: args.googleid,
                  lastip: ip
                }
              }
            );
            user.token = args.token;
            req.session.user = user;

            return {
              firstname: user.firstname,
              startarea: user.startarea,
              state: user.state,
              profile: user.profile,
              email: user.email,
              serverversion: pjson.version
            };
          }
          await Logins.insertOne({
            email: args.email,
            result: "failed",
            type: "google login",
            ip: ip,
            lastlogin: new Date()
          });
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
        saveFocusLink: async (root, args, { req }) => {
          var focuslink = await FocusLinks.findOne(
            {
              userid: getuserid(req.session),
              objective: args.objective
            },
            { sort: { date: -1 } } //update sort at some stage.
          );

          if (focuslink) {
            args.userid = getuserid(req.session);
            await FocusLinks.deleteOne({
              _id: focuslink._id,
              userid: args.userid
            });
            return true;
          } else {
            args.userid = getuserid(req.session);
            args.serverversion = pjson.version;
            args.uiversion = getuiversion(req.session);
            args.date = new Date(args.datetime);
            await FocusLinks.insertOne(args);
            return true;
          }
        },
        snoozeFocusLink: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.snoozedate = new Date(args.snooze);
          args.snoozedate.setHours(0, 0, 0, 0);
          await FocusLinks.updateOne(
            { _id: ObjectId(args.linkid), userid: args.userid },
            {
              $set: {
                snooze: args.snoozedate
              }
            }
          );
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
            userid: getuserid(req.session),
            created: new Date()
          });

          return true;
        },
        createArea: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.created = new Date();

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
        createCoachArea: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.created = new Date();
          args.coach = true;

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
            message: "new rank entry created"
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
          args.date = args.datetime ? new Date(args.datetime) : null;
          args.datecreated = new Date();
          createobjective(args);
          return {
            _id: 1,
            message: "new objective created"
          };
        },
        createNote: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.datecreated = new Date(args.datetime);
          args.lastedited = new Date(args.datetime);
          createnote(args);

          return {
            _id: 1,
            message: "new note created"
          };
        },
        createNoteLink: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.datecreated = new Date(args.datetime);
          const res = await NoteLinks.insert(args);
          return res.insertedIds[1] ? true : false;
        },
        createNewNoteLink: async (root, args, { req }) => {
          var newarea = new Object(); //create new area.
          newarea.userid = getuserid(req.session);
          newarea.name = args.areaname;
          const res = await Areas.insert(newarea);

          await NoteLinks.insertOne({
            //insert the link to connect note and new area.
            noteid: args.noteid,
            userid: getuserid(req.session),
            area: res.insertedIds[0].toString(),
            datecreated: new Date(args.datetime)
          });
          return res.insertedIds[1] ? true : false;
        },
        removeNoteLink: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          NoteLinks.deleteOne(
            {
              _id: ObjectId(args.linkid),
              userid: args.userid
            },
            function(err, obj) {
              if (err) throw err;
            }
          );
          return true;
        },
        checkKey: async (root, args, { req }) => {
          await Objectives.updateOne(
            { _id: ObjectId(args.objectiveId), userid: getuserid(req.session) },
            {
              $set: {
                [`keys.${args.index}.checked`]: args.check,
                [`keys.${args.index}.date`]: new Date()
              }
            }
          );
          return true;
        },
        updateNoteLink: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          NoteLinks.updateOne(
            { _id: ObjectId(args.linkid) },
            { $set: { notes: args.notes } },
            function(err, obj) {
              if (err) throw err;
            }
          );
          return true;
        },
        updateObjectiveLink: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          ObjectiveLinks.updateOne(
            { _id: ObjectId(args.linkid) },
            { $set: { notes: args.notes } },
            function(err, obj) {
              if (err) throw err;
            }
          );
          return true;
        },
        createObjectiveLink: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.datecreated = new Date(args.datetime);
          const res = await ObjectiveLinks.insert(args);
          return res.insertedIds[1] ? true : false;
        },
        removeObjectiveLink: async (root, args, { req }) => {
          args.userid = getuserid(req.session);
          ObjectiveLinks.deleteOne(
            {
              _id: ObjectId(args.linkid),
              userid: args.userid
            },
            function(err, obj) {
              if (err) throw err;
            }
          );
          return true;
        },
        updateObjective: async (root, args, { req }) => {
          var objectiveId = args.objectiveId;
          delete args.objectiveId;
          args.date = args.datetime ? new Date(args.datetime) : null;
          //args.complete = args.complete ? new Date(args.complete) : null;
          args.lastupdated = new Date();
          await Objectives.updateOne(
            { _id: ObjectId(objectiveId) },
            { $set: args }
          );
          if (args.complete)
            await ObjectiveLinks.update(
              { objectiveid: objectiveId },
              {
                $set: { complete: args.complete, lastupdated: args.lastupdated }
              },
              { multi: true }
            );
          return true;
        },
        updateNote: async (root, args, { req }) => {
          args.lastedited = new Date(args.datetime);
          var noteid = args.noteid;
          delete args.noteid;
          const res = await Notes.updateOne(
            { _id: ObjectId(noteid) },
            { $set: args }
          );
          return {
            _id: noteid,
            message: "note updated"
          };
        },
        markSpacedYes: async (root, args, { req }) => {
          args.date = new Date(args.datetime);
          const noteId = args.noteId;
          delete args.noteId;
          const spaced = await Spaced.findOne({
            noteid: noteId,
            userid: getuserid(req.session)
          });
          if (spaced.fib1) {
            args.fib1 = spaced.fib0 + spaced.fib1;
            args.fib0 = spaced.fib1;
          } else {
            args.fib1 = 1;
            args.fib0 = 1;
          }
          var nextdate = new Date(args.datetime); //set nextdate for today + fibonacci sequence
          nextdate.setDate(nextdate.getDate() + args.fib1);
          args.datenext = nextdate;

          NoteLinks.update(
            { noteid: noteId, userid: getuserid(req.session) },
            {
              $set: { nextdate: nextdate }
            },
            { multi: true }
          );

          Spaced.update(
            { noteid: noteId, userid: getuserid(req.session) },
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
          const noteId = args.noteId;
          delete args.noteId;
          var nextdate = new Date();
          nextdate.setDate(nextdate.getDate() + 1);
          args.datenext = nextdate;

          const spaced = await Spaced.findOne({
            noteid: noteId,
            userid: getuserid(req.session)
          });

          await NoteLinks.update(
            { noteid: noteId, userid: getuserid(req.session) },
            {
              $set: { nextdate: nextdate }
            },
            { multi: true }
          );

          args.markedno = spaced.markedno ? spaced.markedno + 1 : 1;

          await Spaced.update(
            { noteid: noteId, userid: getuserid(req.session) },
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
      else if (env === "test") {
        return "5d70b68aa1e6bf52b9906b8e";
        //throw new Error("Invalid Session");
      } else throw new Error("Invalid Session");
    }

    function getcoachid(session) {
      if (session.user.coaches) return session.user.coaches;
      else return ["none"];
    }

    function getuiversion(session) {
      if (session.user) return session.user.uiversion;
      else return "test";
    }

    async function createobjective(newobjective) {
      try {
        Objectives.insertOne(newobjective).then(result => {
          var objectivelink = new Object();
          objectivelink.objectiveid = result.insertedId.toString();
          objectivelink.userid = newobjective.userid;
          objectivelink.areaid = newobjective.area;
          objectivelink.datetime = newobjective.datetime;
          objectivelink.date = new Date(newobjective.datetime);
          objectivelink.datecreated = new Date();
          ObjectiveLinks.insert(objectivelink);
        });
      } catch (error) {
        console.log(error);
      }
    }

    async function logareaclick(_id, navdirection, req) {
      try {
        if (navdirection == "forward") {
          Clicks.insertOne({
            userid: getuserid(req.session),
            date: new Date(),
            areaid: _id
          });

          Areas.updateOne(
            {
              userid: getuserid(req.session),
              _id: ObjectId(_id)
            },
            { $inc: { clicks: 1 }, $set: { lastclicked: new Date() } }
          );
        }
      } catch (error) {
        console.log(error);
      }
    }

    async function createnote(newnote) {
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
          Spaced.insert(note);

          var notelink = new Object();
          notelink.noteid = result.insertedId.toString();
          notelink.userid = newnote.userid;
          notelink.area = newnote.area;
          notelink.notes = newnote.linknote;
          notelink.datecreated = new Date();
          NoteLinks.insert(notelink);
        });
      } catch (error) {
        console.log(error);
      }
    }

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
      version: pjson.version,
      ip: getuserIpAddress(req)
    });

    // server
    const server = new GraphQLServer({
      typeDefs,
      resolvers,
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
        cookie: {
          secure: false, //if this is true it is not working in production. cookies don't work at all in dev with apache on http.
          maxAge: ms("1d")
        }
      })
    );

    const getuserIpAddress = ({ request }) => {
      const headers = request.headers;
      if (!headers) return null;
      return headers;
      const ipAddress = headers["x-forwarded-for"];
      if (!ipAddress) return null;
      return ipAddress;
    };

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
