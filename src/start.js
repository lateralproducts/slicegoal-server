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

import { Queries } from "./schema/queries";
import { Mutations } from "./schema/mutations";
import { Schema } from "./schema/schema";

import {
  newClientEmail,
  newpersonalEmail,
  newCoachEmail,
  objectivesummaryemail
} from "./emails";

//import { verifier } from "google-id-token-verifier";
const { OAuth2Client } = require("google-auth-library");

var pjson = require("../package.json");
console.log("server version: " + pjson.version);

var googleclientId =
  "200442864570-r2ro7rh3app55g83g2bqtfdkt7o398cj.apps.googleusercontent.com";

const oAuth2Client = new OAuth2Client({
  clientId: googleclientId
});

const app = express();

var env = "test";

var schedule = require("node-schedule");

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
    const Wheels = db.collection("wheels");
    const Views = db.collection("views");
    const Profiles = db.collection("profiles");
    //const Signup = db.collection("signup");

    var j = schedule.scheduleJob({ hour: 15, minute: 21 }, function() {
      objectivesummary("daniel@lateralproducts.com");
    });

    async function objectivesummary(email) {
      const user = await Users.findOne({ email: email });

      const links = await FocusLinks.find({
        userid: user._id.toString(),
        $or: [{ snooze: null }, { snooze: { $lt: new Date() } }]
      })
        .sort({ orderrank: 1 })
        .limit(3)
        .toArray();

      const objectives = await Objectives.find({
        _id: {
          $in: links.map(function(link) {
            return ObjectId(link.objective);
          })
        },
        $or: [{ snooze: null }, { snooze: { $lt: new Date() } }]
      })
        .sort({ orderrank: 1 })
        .limit(100)
        .toArray();

      objectivesummaryemail(user, links, objectives);
    }

    const resolvers = {
      Query: {
        isLoggedin: async (root, args, { req, ip }) => {
          if (req.session.user) {
            const user = await Users.findOne({
              _id: ObjectId(getuserid(req.session))
            });

            await Logins.insertOne({
              email: req.session.user.email,
              lastip: getuserIpAddress(req),
              result: "success",
              type: "loggedin refresh",
              lastlogin: new Date()
            });
            return prepare(user);
          } else {
            await Logins.insertOne({
              request: args,
              lastip: getuserIpAddress(req),
              result: "failed",
              type: "loggedin refresh",
              lastlogin: new Date()
            });
            throw new Error("User not logged in");
          }
        },
        views: async (parent, args, { req }) => {
          var query = new Object();
          query.user = getuserid(req.session);
          if (args.default) query._id = ObjectId(args.defaultview); //if asking for default profile only return the default.
          return (await Views.find(query).toArray()).map(prepare);
        },
        wheels: async (parent, args, { req }) => {
          return (await Wheels.find({ global: true }).toArray()).map(prepare);
        },
        objectives: async (parent, args, { req }) => {
          return (await Objectives.find(
            {
              area: args.area,
              userid: getprofileid(req.session),
              complete: { $eq: null }
            } //update sort at some stage.
          )
            .sort({ orderrank: 1 })
            .toArray()).map(prepare);
        },
        objectiveLinks: async (parent, args, { req }) => {
          if (args.search || args.date) {
            var query = new Object();
            query.userid = getprofileid(req.session);
            query.complete = { $eq: null };
            if (args.search) query.objective = new RegExp(args.search, "i");
            if (args.date)
              query.$or = [
                { date: null },
                { date: { $lte: new Date(args.date) } }
              ];

            const objectives = await Objectives.find(query).toArray();

            query = {
              userid: getprofileid(req.session),
              objectiveid: {
                $in: objectives.map(function(objective) {
                  return objective._id ? objective._id.toString() : null;
                })
              }
            };

            return new Promise(function(resolve, reject) {
              ObjectiveLinks.aggregate(
                {
                  $match: query
                },
                {
                  $group: {
                    _id: "$objectiveid",
                    doc: { $first: "$$ROOT" }
                  }
                },
                {
                  $replaceRoot: {
                    newRoot: "$doc"
                  }
                },
                { $sort: { date: -1 } },

                function(err, objectivelinks) {
                  if (err) throw err;
                  resolve(objectivelinks.map(prepare));
                }
              );
            });
          } else {
            var query = Object();
            args.area ? (query.areaid = args.area) : "";
            args.objective ? (query.objectiveid = args.objective) : "";
            query.userid = getprofileid(req.session);
            query.complete = { $eq: null };
            query.$or = [{ snooze: null }, { snooze: { $lt: new Date() } }];

            return (await ObjectiveLinks.find(query, {
              sort: { orderrank: 1 }
            }).toArray()).map(prepare);
          }
        },
        focusLinks: async (parent, args, { req }) => {
          return (await FocusLinks.find(
            {
              userid: getprofileid(req.session),
              $or: [{ snooze: null }, { snooze: { $lt: new Date() } }],
              links: args.area
            } //update sort at some stage.
          )
            .sort({ orderrank: 1 })
            .limit(args.limit)
            .toArray()).map(prepare);
        },
        focusLink: async (parent, args, { req }) => {
          return await FocusLinks.findOne(
            {
              userid: getprofileid(req.session),
              _id: ObjectId(args.focuslink)
            },
            { sort: { date: -1 } } //update sort at some stage.
          );
        },
        notes: async (parent, args, { req }) => {
          const notelinks = (await NoteLinks.find(
            {
              area: args.area,
              userid: getprofileid(req.session),
              $or: [{ nextdate: null }, { nextdate: { $lte: new Date() } }]
            },
            { sort: { datecreated: -1 } } //return reverse chron. Last note created at top of list.
          ).toArray()).map(prepare);

          return notelinks.map(prepare);
        },
        searchnotes: async (parent, args, { req }) => {
          const notes = (await Notes.find(
            {
              answer: new RegExp(args.search, "i"),
              userid: getprofileid(req.session),
              prompt: args.spaced ? { $not: { $eq: "" } } : ""
            },
            { sort: { datecreated: -1 } } //return reverse chron. Last note created at top of list.
          ).toArray()).map(prepare);

          return notes.map(prepare);
        },
        noteLinks: async (parent, args, { req }) => {
          const notelinks = (await NoteLinks.find({
            noteid: args.noteid,
            userid: getprofileid(req.session)
          }).toArray()).map(prepare);
          return notelinks;
        },
        areas: async (parent, args, { req }) => {
          var areas = (await Areas.find({
            $or: [{ userid: getwheelid(req.session) }] //, { userid: "global" } if we want to use global.
          })
            .sort({ clicks: -1 })
            .toArray()).map(prepare);

          return areas.map(prepare);
        },
        profiles: async (parent, args, { req }) => {
          if (req.session.view.type === "coach") {
            const profiles = await Profiles.find({
              wheel: getwheelid(req.session) //return all profiles on wheel
            })
              .sort({ type: -1, name: 1 })
              .toArray(); //.map(function(client) {return client._id;})
            return profiles.map(prepare);
          }

          return (await Profiles.find({
            wheel: getwheelid(req.session),
            $or: [
              { user: getuserid(req.session) },
              { type: "team" },
              { type: "average" }
            ] //return both personal profile and team wheels
          })
            .sort({ type: -1, name: 1 })
            .toArray()).map(prepare);
        },
        area: async (root, { _id, navdirection, global }, { req }) => {
          logareaclick(_id, navdirection, req);

          var area = await Areas.findOne({
            _id: ObjectId(_id),
            $or: [
              { userid: getwheelid(req.session) }
              //{ userid: "global" }
              //{ userid: { $in: getcoachesid(req.session) } } //this makes the area visible to clients. Using coach:true field.
            ]
          });

          return prepare(area);
        },
        ranktimes: async (root, { areaId }, { req }) => {
          return (await RankTimes.find({
            areaId: areaId,
            userid: getprofileid(req.session)
          })
            .sort({ date: -1 })
            .toArray()).map(prepare);
        },
        arealinks: async (root, args, { req }) => {
          return (await AreaLinks.find({
            rootarea: { $not: { $eq: null } },
            area: args.area,
            userid: getwheelid(req.session)
          }).toArray()).map(prepare);
        },
        goaltimes: async (root, { _id }, { req }) => {
          return (await GoalTimes.find({ userid: getprofileid(req.session) })
            .sort({ date: -1 })
            .toArray()).map(prepare);
        },
        lastranktime: async (root, { areaId }, { req }) => {
          //if coach, return average of coachees.
          return prepare(
            await RankTimes.findOne(
              { areaId: areaId, userid: getprofileid(req.session) },
              { sort: { date: -1 } }
            )
          );
        },
        lastgoaltime: async (root, { areaId }, { req }) => {
          return prepare(
            await GoalTimes.findOne(
              { areaId: areaId, userid: getprofileid(req.session) },
              { sort: { date: -1 } }
            )
          );
        },
        pomodoros: async (root, { objectiveId }, { req }) => {
          return (await Pomodoros.find(
            {
              objective: objectiveId,
              userid: getprofileid(req.session)
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
        area: async ({ startarea }, args, { req }) => {
          return startarea
            ? prepare(await Areas.findOne({ _id: ObjectId(startarea) }))
            : null;
        },
        views: async (parent, args, { req }) => {
          var query = new Object();
          query.user = getuserid(req.session); //need to return BSON as string.
          return (await Views.find(query).toArray()).map(prepare);
        }
      },
      Note: {
        spaced: async ({ _id }, args, { req }) => {
          var spaced = await Spaced.findOne({
            noteid: _id,
            userid: getprofileid(req.session)
          });
          return spaced;
        }
      },
      Wheel: {
        profiles: async (parent, args, { req }) => {
          var query = new Object();
          query.wheel = parent._id;
          if (parent.view.type !== "coach") query.user = getuserid(req.session);
          //if (args.default) query._id = ObjectId(parent.view.defaultprofile); //if asking for default profile only return the default.
          return (await Profiles.find(query)
            .sort({ type: -1, name: 1 })
            .toArray()).map(prepare);
        },
        startarea: async (parent, args, { req }) => {
          var query = new Object();
          query._id = ObjectId(parent.startarea);
          return await Areas.findOne(query);
        }
      },
      View: {
        user: async (view, args, { req }) => {
          return prepare(
            await Users.findOne({
              _id: ObjectId(view.user)
            })
          );
        }
      },
      Profile: {
        wheel: async (parent, args, { req }) => {
          return prepare(
            await Wheels.findOne({
              _id: ObjectId(parent.wheel)
            })
          );
        }
      },
      AreaLink: {
        linkedarea: async (parent, args, { req }) => {
          return prepare(
            parent.rootarea
              ? await Areas.findOne({
                  _id: ObjectId(parent.rootarea)
                })
              : { _id: ObjectId(parent.area), name: null }
          );
        }
      },
      NoteLink: {
        area: async (parent, args, { req }) => {
          return prepare(
            await Areas.findOne({
              _id: ObjectId(parent.area)
            })
          );
        },
        note: async ({ noteid }, args, { req }) => {
          return prepare(
            await Notes.findOne({
              _id: ObjectId(noteid)
            })
          );
        }
      },
      ObjectiveLink: {
        area: async ({ areaid }, args, { req }) => {
          return prepare(
            await Areas.findOne({
              _id: ObjectId(areaid)
            })
          );
        },
        objective: async ({ objectiveid }, args, { req }) => {
          return prepare(
            await Objectives.findOne({
              _id: ObjectId(objectiveid)
              //complete: { $eq: null } This causes an error.
            })
          );
        }
      },
      Focus: {
        area: async ({ area }, args, { req }) => {
          return prepare(
            await Areas.findOne({
              _id: ObjectId(area)
            })
          );
        },
        objective: async ({ objective }, args, { req }) => {
          return prepare(
            await Objectives.findOne({
              _id: ObjectId(objective)
            })
          );
        }
      },
      View: {
        wheel: async (obj, args, context, info) => {
          var wheel = await Wheels.findOne({
            _id: ObjectId(obj.wheel)
          });
          wheel.view = obj;
          return prepare(wheel);
        }
      },
      Area: {
        clicks: async ({ _id }, args, { req }) => {
          var currentDate = new Date();
          currentDate.setDate(currentDate.getDate() - 7); //currently reading one week's trailing data.
          return new Promise(function(resolve, reject) {
            Clicks.aggregate(
              {
                $match: {
                  areaid: _id,
                  userid: getuserid(req.session),
                  date: {
                    $gte: currentDate
                  }
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
        areas: async ({ _id }, args, { req }) => {
          const query = {
            rootarea: _id,
            $or: [{ userid: getwheelid(req.session) }, { userid: "global" }] //use this global flag to return global wheels for templates.
          };
          const arealinks = await AreaLinks.distinct("area", query);

          return (await Areas.find({
            _id: {
              $in: arealinks.map(function(id) {
                return ObjectId(id);
              })
            }
          }).toArray()).map(prepare);
        },
        rank: async ({ _id, coach }, args, { req }) => {
          if (req.session.profile)
            if (req.session.profile.type === "average") {
              //was previously using "coach" in area to decide to aggregate rank
              const profiles = await Profiles.find({
                wheel: req.session.profile.wheel
              }).toArray();

              return new Promise(function(resolve, reject) {
                //returning the average of the area for coaching
                RankTimes.aggregate(
                  {
                    $match: {
                      area: _id,
                      //userid: req.session.profile.wheel
                      userid: {
                        $in: profiles.map(profile => {
                          return profile._id.toString();
                        })
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
                            note: "team average"
                          }
                        : null
                    );
                  }
                );
              });
            } else {
              const rank = await RankTimes.findOne(
                { area: _id, userid: getprofileid(req.session) },
                { sort: { date: -1 } }
              );
              return rank ? prepare(rank) : null;
            }
        },
        goal: async ({ _id }, args, { req }) => {
          const goal = await GoalTimes.findOne(
            { area: _id, userid: getprofileid(req.session) },
            { sort: { date: -1 } }
          );
          return goal ? prepare(goal) : null;
        },
        time: async ({ _id }, args, { req }, query) => {
          if (args || item) {
          }
          return new Promise(function(resolve, reject) {
            var currentDate = new Date();
            currentDate.setDate(currentDate.getDate() - 7); //currently reading one week's trailing data.
            Pomodoros.aggregate(
              {
                $match: {
                  userid: getprofileid(req.session),
                  date: {
                    $gte: currentDate
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
        runUpdate101: async (parent, args, { req }) => {
          //use playground http://localhost:3001/ and run mutation: "mutation{runUpdate}"
          /* const users = await Users.find().toArray();

          users.map(async user => {
            //create new view
            if (user.startarea) {
              var newwheel = {
                _id: user._id,
                user: user._id.toString(),
                email: user.email,
                startarea: user.startarea,
                name: "my wheel"
              };
              var wheel = await Wheels.insertOne(newwheel);

              var newview = {
                _id: user._id,
                user: user._id.toString(),
                email: user.email,
                wheel: wheel.insertedId.toString(),
                name: "my view",
                type:
                  user.profile === "client"
                    ? "team"
                    : user.profile === "daniel"
                    ? "personal"
                    : "coach"
              };
              Views.insertOne(newview);

              //create new profile
              var newprofile = {
                _id: user._id,
                user: user._id.toString(),
                email: user.email,
                name:
                  user.profile === "coach"
                    ? "Team Ranking"
                    : getname(user.firstname, user.lastname, user.email),
                type:
                  user.profile === "client"
                    ? "member"
                    : user.profile === "daniel"
                    ? "personal"
                    : "member",
                wheel: wheel.insertedId.toString()
              };
              Profiles.insertOne(newprofile);
            }
          }); */

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
        setView: async (parent, { viewid }, { req }) => {
          //set wheel, view, and profile to the context.

          const view = await Views.findOne({
            _id: ObjectId(viewid),
            user: getuserid(req.session) //check that this user own's the view. If not, return error.
          });

          var query = new Object();
          query.wheel = view.wheel;
          if (view.type === "team") query.user = getuserid(req.session); //access allowed to all profiles for coach.

          const profile = await Profiles.findOne(query);

          if (!profile) throw new Error("View Profile combination not found");

          req.session.view = view;
          req.session.profile = profile;

          /*           console.log("set view to:");
          console.log(view);
          console.log("set profile to:");
          console.log(profile); */

          return prepare(view); //need to return the view, area.
        },

        createNewWheel: async (
          parent,
          { viewtype, templatewheel },
          { req }
        ) => {
          //set wheel, view, and profile to the context.
          var { newview, newprofile } = await createWheel(
            req.session.user,
            req.session.user._id.toString(),
            viewtype,
            templatewheel
          );
          req.session.view = newview;
          req.session.profile = newprofile;

          return prepare(newview); //need to return the view, area.
        },

        removeStartArea: async (parent, args, { req }) => {
          await Users.updateOne(
            { _id: ObjectId(getprofileid(req.session)) },
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
          var user = await Users.findOneAndUpdate(
            { _id: ObjectId(getuserid(req.session)) }, //update this
            { $set: args },
            { returnOriginal: false }
          );
          return user.value;
        },
        createClient: async (parent, args, { req }) => {
          var user = await Users.findOne({ email: args.email });
          var userid;
          if (user) {
            userid = user._id.toString();
          } else {
            //args.profile = "client"; //this belongs on the view now
            args.state = "new";
            args.code = bcrypt.hashSync("verifythisyo", 7);
            args.created = new Date();

            var newuser = await Users.insertOne(args); //create record to return id
            args._id = newuser.insertedId.toString(); //use args to pass new user id for email link
            newClientEmail(args, req.session.user, req.session.view.name);

            userid = newuser.insertedId.toString(); //pass id for creating view and profiles
          }

          //create new view
          var newview = {
            user: userid,
            wheel: req.session.view.wheel,
            name: req.session.view.name,
            type: "team"
          };
          Views.insertOne(newview);

          //create new profile
          var newprofile = {
            user: userid,
            wheel: req.session.view.wheel,
            name: getname(args.firstname, args.lastname, args.email),
            type: "member"
          };
          Profiles.insertOne(newprofile);

          return true;
        },
        verifyAccount: async (parent, args, { req }) => {
          const user = await Users.findOneAndUpdate(
            { _id: ObjectId(args.userid), code: args.code, state: "new" },
            {
              $set: {
                state: "verified",
                password: bcrypt.hashSync(args.password, 10)
              }
            }
          );
          req.session.user = user.value;
          if (user.value) return prepare(user.value);
          else {
            throw new Error(
              "Your account didn't verify. If you've signed up before, try logging in."
            );
          }
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
        setProfile: async (parent, { profileid }, { req }) => {
          const profile = await Profiles.findOne({
            _id: ObjectId(profileid),
            wheel: req.session.view.wheel
          });

          if (!profile) throw new Error("user could not be retrieved.");

          req.session.profile = profile;
          return profile;
        },

        login: async (parent, args, { req, ip }) => {
          const user = await Users.findOne({ email: args.username });
          //const user = data[username];

          if (user) {
            if (await bcrypt.compareSync(args.pwd, user.password)) {
              var loggedinuser = await login(user, args, req);
              return prepare(loggedinuser);
            } else {
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
                lastip: getuserIpAddress(req),
                result: "failed",
                type: "username login",
                lastlogin: new Date()
              });

              throw new Error("Incorrect password.");
            }
          }

          await Logins.insertOne({
            email: args.username,
            lastip: getuserIpAddress(req),
            result: "not registered",
            type: "username login",
            lastlogin: new Date()
          });

          /*           await Users.insertOne({
            email: args.username,
            password: bcrypt.hashSync(args.pwd, 10),
            uiversion: args.uiversion,
            serverversion: pjson.version,
            state: "new",
            profile: "client",
            created: new Date()
          }); */
          throw new Error("Email not registered");
        },

        setSignUpContext: async (parent, { account }, { req }) => {
          req.session.signupcontext = account;
          return true;
        },

        copyWheel: async (parent, { wheelid, viewtype }, { req }) => {
          var user = await Users.findOne({
            _id: ObjectId(getuserid(req.session))
          });
          if (user) createWheel(user, user._id.toString(), viewtype, wheelid);
          return true;
        },

        signup: async (parent, args, { req }) => {
          const user = await Users.findOne({ email: args.email });
          if (user) {
            throw new Error(
              "If you already have a Cavestep profile with this email you can log in."
            );
          }

          const date = new Date();

          var newuser = {
            email: args.email,
            firstname: args.firstname,
            code: bcrypt.hashSync(date.toString(), 7),
            uiversion: args.uiversion,
            serverversion: pjson.version,
            state: "new",
            profile: args.account,
            created: new Date(),
            createdip: getuserIpAddress(req)
          };
          var emailuser = await signup(newuser, args, req);

          if (args.account === "coach") newCoachEmail(emailuser);
          else newpersonalEmail(emailuser);

          return true;
        },

        googleLogin: async (parent, args, { req, ip }) => {
          const tokenInfo = await oAuth2Client.getTokenInfo(args.token);

          if ((tokenInfo.email = args.email)) {
            //check token authentication...

            var user = await Users.findOne({ email: args.email });
            if (!user) {
              //sign up new google user.
              args.profile = ""; //can't just be coach. need to fix this.
              args.state = "verified";
              args.serverversion = pjson.version;
              args.lastip = getuserIpAddress(req);
              args.type = "personal";
              //req.session.user = user;
              //args.token = null; //removing the token from saving in database for security
              args.created = new Date();
              user = args;
              var newuser = await signup(user, args, req); //automatically sign up google login.
              return await login(newuser, args, req);
            } else {
              return await login(user, args, req);
            }
          }
          await Logins.insertOne({
            email: args.email,
            result: "failed",
            type: "google login",
            ip: getuserIpAddress(req),
            lastlogin: new Date()
          });
          throw new Error("Error authenticating with google");

          // https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=%22ya29.GltCByku5ux1wZwDEZziUSrMh_3BVkjqHcpafZF_hC621Z4WivwtzTOysquVDgq73gHoueqReNMgnkoTjUKkdMXbHku_XO1onwyZ_rnGj-yW71foQfBo2NkNlDhx%22
          // https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=%22ya29.GltCByku5ux1wZwDEZziUSrMh_3BVkjqHcpafZF_hC621Z4WivwtzTOysquVDgq73gHoueqReNMgnkoTjUKkdMXbHku_XO1onwyZ_rnGj-yW71foQfBo2NkNlDhx%22
        },

        logout: async (parent, args, { req }) => {
          if (req.session.user)
            if (req.session.user.token)
              try {
                await oAuth2Client.revokeToken(req.session.user.token);
              } catch (error) {
                console.log(error);
              }
          req.session.destroy();
          return true;
        },
        savePomodoro: async (root, args, { req }) => {
          args.userid = getprofileid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.date = new Date(args.datetime);
          await Pomodoros.insertOne(args);
          return true;
        },
        saveFocusLink: async (root, args, { req }) => {
          var focuslink = await FocusLinks.findOne(
            {
              userid: getprofileid(req.session),
              objective: args.objective
            },
            { sort: { date: -1 } } //update sort at some stage.
          );

          if (focuslink) {
            args.userid = getprofileid(req.session);
            await FocusLinks.deleteOne({
              _id: focuslink._id,
              userid: args.userid
            });
            return true;
          } else {
            args.userid = getprofileid(req.session);
            args.serverversion = pjson.version;
            args.uiversion = getuiversion(req.session);
            args.date = new Date(args.datetime);
            await FocusLinks.insertOne(args);
            return true;
          }
        },
        snoozeFocusLink: async (root, args, { req }) => {
          args.userid = getprofileid(req.session);
          args.snoozedate = new Date(args.snooze);
          args.snoozedate.setHours(0, 0, 0, 0);
          await FocusLinks.updateMany(
            { objective: args.objectiveid, userid: args.userid },
            {
              $set: {
                snooze: args.snoozedate
              }
            }
          );
          return true;
        },
        snoozeObjectiveLink: async (root, args, { req }) => {
          args.userid = getprofileid(req.session);
          args.snoozedate = new Date(args.snooze);
          args.snoozedate.setHours(0, 0, 0, 0);
          await ObjectiveLinks.updateMany(
            { objectiveid: args.objectiveid, userid: args.userid },
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
            { _id: ObjectId(args.area), userid: getwheelid(req.session) },
            { $set: args }
          );
          args._id = args.area;
          return args;
        },
        deleteAreaLink: async (root, { rootarea, area }, { req }) => {
          const res = await AreaLinks.deleteMany(
            { rootarea: rootarea, area: area, userid: getwheelid(req.session) },
            { $set: { arealink: null } }
          );
          return res;
        },
        createAreaLink: async (root, args, { req }) => {
          // args.userid = getwheelid(req.session);
          // args.serverversion = pjson.version;
          // args.uiversion = getuiversion(req.session);
          await AreaLinks.insertOne({
            rootarea: args.rootarea,
            area: args.area,
            userid: getwheelid(req.session),
            created: new Date()
          });

          return true;
        },
        createArea: async (root, args, { req }) => {
          args.userid = getwheelid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.created = new Date();

          const res = await Areas.insert(args);

          await AreaLinks.insertOne({
            rootarea: args.rootarea,
            area: res.insertedIds[0].toString(),
            areaname: args.name,
            userid: getwheelid(req.session),
            serverversion: pjson.version,
            uiversion: getuiversion(req.session)
          });
          return prepare(
            await Areas.findOne({
              _id: res.insertedIds[0],
              userid: getwheelid(req.session)
            })
          );
        },
        createCoachArea: async (root, args, { req }) => {
          args.userid = getwheelid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.created = new Date();
          args.coach = true;

          const res = await Areas.insert(args);

          await AreaLinks.insertOne({
            rootarea: args.rootarea,
            area: res.insertedIds[0].toString(),
            areaname: args.name,
            userid: getwheelid(req.session),
            serverversion: pjson.version,
            uiversion: getuiversion(req.session)
          });

          const area = await Areas.findOne({
            _id: res.insertedIds[0],
            userid: getwheelid(req.session)
          });

          return prepare(area);
        },
        createRankTime: async (root, args, { req }) => {
          args.userid = getprofileid(req.session);
          args.date = new Date(args.datetime);
          const res = await RankTimes.insert(args);
          return {
            _id: res.insertedIds[1],
            message: "new rank entry created"
          };
        },
        createGoalTime: async (root, args, { req }) => {
          args.userid = getprofileid(req.session);
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
          args.userid = getprofileid(req.session);
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
          args.userid = getprofileid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.datecreated = new Date(args.datetime);
          args.lastedited = new Date(args.datetime);
          createnote(args, req);

          return {
            _id: 1,
            message: "new note created"
          };
        },
        createNoteLink: async (root, args, { req }) => {
          args.userid = getprofileid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.datecreated = new Date();
          const res = await NoteLinks.insert(args);
          return res.insertedIds[1] ? true : false;
        },
        createNewObjectiveLink: async (root, args, { req }) => {
          var newarea = new Object(); //create new area.
          newarea.userid = getprofileid(req.session);
          newarea.name = args.areaname;
          const res = await Areas.insert(newarea);

          await ObjectiveLinks.insertOne({
            //insert the link to connect note and new area.
            objectiveid: args.objectiveid,
            userid: getprofileid(req.session),
            areaid: res.insertedIds[0].toString(),
            datecreated: new Date(args.datetime)
          });

          return res.insertedIds[1] ? true : false;
        },
        createNewNoteLink: async (root, args, { req }) => {
          var newarea = new Object(); //create new area.
          newarea.userid = getprofileid(req.session);
          newarea.name = args.areaname;
          const res = await Areas.insert(newarea);

          await NoteLinks.insertOne({
            //insert the link to connect note and new area.
            noteid: args.noteid,
            userid: getprofileid(req.session),
            area: res.insertedIds[0].toString(),
            datecreated: new Date(args.datetime)
          });
          return res.insertedIds[1] ? true : false;
        },
        removeNoteLink: async (root, args, { req }) => {
          args.userid = getprofileid(req.session);
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
            {
              _id: ObjectId(args.objectiveId),
              userid: getprofileid(req.session)
            },
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
          args.userid = getprofileid(req.session);
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
          args.userid = getprofileid(req.session);
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
          args.userid = getprofileid(req.session);
          args.serverversion = pjson.version;
          args.uiversion = getuiversion(req.session);
          args.datecreated = new Date(args.datetime);
          const res = await ObjectiveLinks.insert(args);
          return res.insertedIds[1] ? true : false;
        },
        removeObjectiveLink: async (root, args, { req }) => {
          args.userid = getprofileid(req.session);
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
          var objective = await Objectives.findOneAndUpdate(
            { _id: ObjectId(objectiveId) },
            { $set: args },
            { returnOriginal: false }
          );
          if (args.complete) {
            await ObjectiveLinks.update(
              { objectiveid: objectiveId },
              {
                $set: { complete: args.complete, lastupdated: args.lastupdated }
              },
              { multi: true }
            );
            removefocuslink(req, objectiveId);
          }
          return objective.value;
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
            userid: getprofileid(req.session)
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
            { noteid: noteId, userid: getprofileid(req.session) },
            {
              $set: { nextdate: nextdate }
            },
            { multi: true }
          );

          Spaced.update(
            { noteid: noteId, userid: getprofileid(req.session) },
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
            userid: getprofileid(req.session)
          });

          await NoteLinks.update(
            { noteid: noteId, userid: getprofileid(req.session) },
            {
              $set: { nextdate: nextdate }
            },
            { multi: true }
          );

          args.markedno = spaced.markedno ? spaced.markedno + 1 : 1;

          await Spaced.update(
            { noteid: noteId, userid: getprofileid(req.session) },
            {
              $set: args
            }
          );
          return true;
        },
        deleteArea: async (root, { rootarea, area }, { req }) => {
          var message = "";
          AreaLinks.deleteOne(
            { rootarea: rootarea, area: area, userid: getwheelid(req.session) },
            function(err, obj) {
              if (err) throw err;
              message = obj.deletedCount + " area(s) deleted";
            }
          );
          return { _id: areaId, title: message };
        }
      }
    };

    function getname(firstname, lastname, email) {
      return firstname ? firstname + (lastname ? " " + lastname : "") : email;
    }

    function getprofileid(session) {
      if (session.profile) return session.profile._id.toString();
      //if (session.profile._id) return session.profile._id;
      /* else if (env === "test") {
        return "605da7eedc0c981608c40126"; //default for test??
      } */ else {
        getuserid(session);
        throw new Error("Profile not found");
        //return null; //
      }
    }

    function getwheelid(session) {
      if (session.view) return session.view.wheel;
      //if (session.view._id) return session.view._id;
      /* else if (env === "test") {
        return "5d27ffef2f25635b27f0a450"; //default for test??
      } */ else
        throw new Error("Wheel not found");
    }

    function getuserid(session) {
      if (session.user) return session.user._id.toString();
      /* else if (env === "test") {
        return "5d70b68aa1e6bf52b9906b8e"; //default for test??
      } */ else
        throw new Error("Invalid Session");
    }

    function getuiversion(session) {
      if (session.user) return session.user.uiversion;
      else return "test";
    }

    async function createobjective(newobjective) {
      try {
        Objectives.insertOne(newobjective).then(result => {
          if (newobjective.arealinks)
            newobjective.arealinks.map(async link => {
              var areaid = link.area._id;
              var objectivelink = new Object();
              objectivelink.objectiveid = result.insertedId.toString();
              objectivelink.userid = newobjective.userid;
              objectivelink.areaid = areaid;
              objectivelink.datetime = newobjective.datetime;
              objectivelink.date = new Date(newobjective.datetime);
              objectivelink.datecreated = new Date();
              ObjectiveLinks.insert(objectivelink);
            });
        });
      } catch (error) {
        console.log(error);
      }
    }

    async function login(user, args, req) {
      if (
        (user.incorrecttries < 6 || user.incorrecttries === undefined) &&
        user.state == "verified"
      ) {
        user.serverversion = pjson.version;
        req.session.user = user;

        const view = await Views.findOne({
          user: user._id.toString()
        });

        if (view) {
          req.session.view = view;
          var query = new Object();

          if (view.type !== "coach") query.user = user._id.toString();
          query.wheel = view.wheel;
          const profile = await Profiles.findOne(query, {
            sort: { type: -1 }
          });

          if (profile) req.session.profile = profile;
        } else {
          createWheel(user, user._id.toString(), "personal");
        }

        await Logins.insertOne({
          email: args.username,
          lastip: getuserIpAddress(req),
          result: "success",
          type: "username login",
          lastlogin: new Date()
        });

        await Users.updateOne(
          { _id: ObjectId(user._id) },
          {
            $set: {
              uiversion: args.uiversion,
              lastip: getuserIpAddress(req),
              lastlogin: new Date()
            }
          }
        );

        return user;
      }

      await Logins.insertOne({
        email: args.username,
        lastip: getuserIpAddress(req),
        result: "failed",
        type: "username login",
        lastlogin: new Date()
      });

      await Users.updateOne(
        { _id: ObjectId(user._id) },
        {
          $set: {
            incorrecttries: (user.incorrecttries ? user.incorrecttries : 0) + 1
          }
        }
      );

      throw new Error("Login Failed.");
    }

    async function signup(newuser, args, req) {
      newuser.lastip = getuserIpAddress(req);
      var userid = (await Users.insertOne(newuser)).insertedId.toString();
      await createWheel(newuser, userid, newuser.type);

      return newuser;
    }

    async function createWheel(user, userid, viewtype, wheel) {
      var wheelid;

      switch (viewtype) {
        case "coach": //currently not copying wheel for coach. Just creating a blank wheel.
          var startareaid = (await Areas.insertOne({
            name: "Coaching Wheel",
            email: user.email,
            created: new Date()
          })).insertedId.toString();

          wheelid = (await Wheels.insertOne({
            name: user.email + "'s new coach wheel",
            startarea: startareaid
          })).insertedId.toString();

          Areas.updateOne(
            { _id: ObjectId(startareaid) },
            {
              $set: {
                userid: wheelid
              }
            }
          );
          break;
        case "personal":
        default:
          //use wheel here to copy the global wheel for the new wheel
          if (!wheel)
            wheel =
              env === "test"
                ? "6025e1bc216eef4f3fda3c1f"
                : "607cbc0b49e8769358992564"; //req.session.view.wheel,
          wheelid = await copywheel(wheel, userid);
      }

      //create new view
      var newview = {
        user: userid,
        email: user.email,
        wheel: wheelid, //req.session.view.wheel,
        name:
          viewtype === "coach"
            ? getname(user.firstname, "", user.email) + "'s Coaching"
            : "Wheel of Life", //req.session.view.name,
        type: viewtype
      };
      Views.insertOne(newview);

      //create new profile
      var newprofile = {
        user: userid,
        wheel: wheelid,
        email: user.email,
        name:
          viewtype === "coach"
            ? "Team Ranking"
            : getname(user.firstname, user.lastname, user.email),
        type: viewtype === "coach" ? "team" : viewtype
      };
      Profiles.insertOne(newprofile);

      return { newview, newprofile };
    }

    async function copywheel(wheelid, userid) {
      //wheel - global
      var newwheel = await Wheels.findOne({
        _id: ObjectId(wheelid)
      });
      newwheel.copy = wheelid;
      newwheel.user = userid;
      delete newwheel._id;
      delete newwheel.global;
      var newwheelid = (await Wheels.insertOne(newwheel)).insertedId.toString();
      //areas - global
      var newareas = await Areas.find({ userid: wheelid }).toArray();
      newareas.map(area => {
        area.user = userid;
        area.userid = newwheelid;
        area.copywheel = wheelid;
        area.copyarea = area._id.toString();
        delete area._id;
        return area;
      });

      await Areas.insertMany(newareas);
      var newstartareaid = (await Areas.findOne({
        user: userid,
        copyarea: newwheel.startarea,
        userid: newwheelid //this is the id used for returning wheels
      }))._id.toString();

      Wheels.updateOne(
        { _id: ObjectId(newwheelid) },
        { $set: { startarea: newstartareaid } }
      );
      //arealinks - global
      var newarealinks = await AreaLinks.find({
        userid: wheelid
      }).toArray();
      newarealinks.map(arealink => {
        arealink.user = userid; //this is just copied as a reference for ease
        arealink.userid = newwheelid; //this is the id used for returning arealinks
        arealink.rootarea = newareas
          .find(o => o.copyarea === arealink.rootarea)
          ._id.toString();
        arealink.area = newareas
          .find(o => o.copyarea === arealink.area)
          ._id.toString();
        arealink.copywheel = wheelid;
        arealink.copylink = arealink._id.toString();
        delete arealink._id;
        return arealink;
      });
      AreaLinks.insertMany(newarealinks);
      //return wheel
      return newwheelid;
    }

    async function logareaclick(_id, navdirection, req) {
      try {
        if (navdirection == "forward") {
          Clicks.insertOne({
            userid: getprofileid(req.session),
            date: new Date(),
            areaid: _id
          });

          Areas.updateOne(
            {
              userid: getprofileid(req.session),
              _id: ObjectId(_id)
            },
            { $inc: { clicks: 1 }, $set: { lastclicked: new Date() } }
          );
        }
      } catch (error) {
        console.log(error);
      }
    }

    async function createnote(newnote, req) {
      try {
        const result = await Notes.insertOne(newnote);

        var note = new Object();
        note.noteid = result.insertedId.toString();
        note.userid = newnote.userid;
        note.fib0 = 0;
        note.fib1 = 1;
        var nextdate = new Date(); //set nextdate for tomorrow.
        if (newnote.prompt) nextdate.setDate(nextdate.getDate() + 1);
        note.datenext = nextdate;
        Spaced.insert(note);

        if (newnote.arealinks)
          newnote.arealinks.map(async link => {
            var areaid = link.area._id;
            if (!areaid) {
              var area = {
                name: link.name,
                userid: getprofileid(req.session),
                serverversion: pjson.version,
                uiversion: getuiversion(req.session),
                created: new Date()
              };

              const res = await Areas.insert(area);
              areaid = res.insertedIds[0].toString();
            }

            var notelink = new Object();
            notelink.noteid = result.insertedId.toString();
            notelink.userid = newnote.userid;
            notelink.area = areaid;
            notelink.notes = link.notes;
            notelink.datecreated = new Date();
            NoteLinks.insert(notelink);
          });
      } catch (error) {
        console.log(error);
      }
    }

    async function removefocuslink(req, objectiveid) {
      await FocusLinks.deleteOne({
        objective: objectiveid,
        userid: getprofileid(req.session)
      });

      return true;
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
      typeDefs: [Queries, Mutations, Schema],
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
        rolling: true,
        cookie: {
          secure: false, //if this is true it is not working in production. cookies don't work at all in dev with apache on http.
          maxAge: ms("1d")
        }
      })
    );

    const getuserIpAddress = request => {
      const headers = request.headers;
      if (!headers) return null;
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
