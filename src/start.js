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

const typeDefs2 = `
      type Query {
        isLogin: Boolean!
      }
      type Mutation {
        login(username: String!, pwd: String!): Boolean!
        signup(username: String!, pwd: String!): Boolean!
      }
    `;

const data = {};

const resolvers2 = {
  Query: {
    isLogin: (parent, args, { req }) => typeof req.session.user !== "undefined"
  },
  Mutation: {
    signup: async (parent, { username, pwd }, ctx) => {
      if (data[username]) {
        throw new Error("Another User with same username exists.");
      }

      data[username] = {
        pwd: await bcrypt.hashSync(pwd, 10)
      };

      return true;
    },
    login: async (parent, { username, pwd }, { req }) => {
      const user = data[username];
      if (user) {
        if (await bcrypt.compareSync(pwd, user.pwd)) {
          req.session.user = {
            user
          };
          return true;
        }

        throw new Error("Incorrect password.");
      }

      throw new Error("No Such User exists.");
    }
  }
};

export const start = async () => {
  try {
    const db = await MongoClient.connect(MONGO_URL);

    console.log("connected now for the dbs");
    const Wheels = db.collection("wheels");
    const Areas = db.collection("areas");
    const RankTimes = db.collection("ranktimes");
    const GoalTimes = db.collection("goaltimes");
    const WheelAreaLinks = db.collection("wheelarealink");

    const typeDefs = [
      `
      type Query {
        wheel(_id: String): Wheel
        wheels: [Wheel]
        areas: [Area]
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
        areasold: [Area]
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
        createWheel(title: String!, notes: String): Wheel
        createArea(wheelId: String, wheel: String, name: String, definition: String, wheellink: String): Area
        addExistingArea(wheelId: String, areaId: String): Area
        updateArea(areaId: String, wheel: String, name: String, definition: String, wheellink: String): Area
        createWheelLink(areaId: String!,title: String!, notes: String): Wheel
        deleteWheelLink(areaId: String!): Area
        createRankTime(areaId: String, rank: Int, datetime: String, note: String): RankTime
        createGoalTime(areaId: String, goal: Int, datetime: String, note: String): GoalTime
        deleteArea(areaId: String, wheelId: String): Area
        shiftLinks(areaId: String): String
      }

      schema {
        query: Query
        mutation: Mutation
      }
    `
    ];

    const resolvers = {
      Query: {
        wheel: async (root, { _id }) => {
          return prepare(await Wheels.findOne(ObjectId(_id)));
        },
        wheels: async () => {
          return (await Wheels.find({}).toArray()).map(prepare);
        },
        areas: async () => {
          return (await Areas.find({}).toArray()).map(prepare);
        },
        area: async (root, { _id }) => {
          return prepare(await Areas.findOne(ObjectId(_id)));
        },
        ranktimes: async (root, { areaId }) => {
          return (await RankTimes.find({ areaId: areaId })
            .sort({ date: -1 })
            .toArray()).map(prepare); // (await RankTimes.find({}).toArray()).map(prepare);
        },
        wheelarealinks: async (root, args) => {
          return (await WheelAreaLinks.find(args).toArray()).map(prepare); // (await RankTimes.find({}).toArray()).map(prepare);
        },
        goaltimes: async (root, { _id }) => {
          return (await GoalTimes.find({})
            .sort({ date: -1 })
            .toArray()).map(prepare);
        },
        lastranktime: async (root, { areaId }) => {
          return prepare(
            await RankTimes.findOne({ areaId: areaId }, { sort: { date: -1 } })
          );
        },
        lastgoaltime: async (root, { areaId }) => {
          return prepare(
            await GoalTimes.findOne({ areaId: areaId }, { sort: { date: -1 } })
          );
        }
      },
      Wheel: {
        areasold: async ({ _id }) => {
          return (await Areas.find({ wheelId: _id }).toArray()).map(prepare);
          // product_parts = db.parts.find({_id: { $in : product.parts } } ).toArray()
        },
        areas: async ({ _id }) => {
          const arealinks = await WheelAreaLinks.distinct("area", {
            wheel: _id
          });

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
        createWheel: async (root, args, context, info) => {
          const res = await Wheels.insertOne(args);
          return prepare(res.ops[0]); // https://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#~insertOneWriteOpResult
        },
        deleteWheelLink: async (root, { areaId }) => {
          const res = await Areas.updateOne(
            { _id: ObjectId(areaId) },
            { $set: { wheellink: null } }
          );
          return res;
        },
        updateArea: async (root, args, context, info) => {
          //const definition = args.definition;
          const res = await Areas.updateOne(
            { _id: ObjectId(args.areaId) },
            { $set: args }
          );
          return res; // https://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#~insertOneWriteOpResult
        },
        createWheelLink: async (root, args, context, info) => {
          const res = await Wheels.insertOne(args);
          const newwheelid = res.ops[0]._id.toString();

          await Areas.updateOne(
            { _id: ObjectId(args.areaId) },
            { $set: { wheellink: newwheelid } }
          );

          /* await WheelAreaLinks.insertOne({
            wheel: newwheelid,
            area: args.areaId
          }); */

          return prepare(res.ops[0]); // https://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#~insertOneWriteOpResult
        },

        shiftLinks: async (root, args, context, info) => {
          /* const wheel_areas = await Areas.find().toArray();

          await WheelAreaLinks.insert(
            wheel_areas.map(function(area) {
              return { wheel: area.wheelId, area: area._id.toString() };
            })
          ); */
          return "shiftLinks was run once, commented out.";
        },

        createArea: async (root, args) => {
          const res = await Areas.insert(args);

          await WheelAreaLinks.insertOne({
            wheel: args.wheelId,
            area: res.insertedIds[0].toString()
          });
          return prepare(await Areas.findOne({ _id: res.insertedIds[0] }));
        },
        addExistingArea: async (root, args) => {
          const res = await WheelAreaLinks.insertOne({
            wheel: args.wheelId,
            area: args.areaId
          });
          console.log(res);
          return prepare(await Areas.findOne({ _id: ObjectId(args.areaId) }));
        },
        createRankTime: async (root, args) => {
          args.date = new Date(args.datetime);
          const res = await RankTimes.insert(args); // args,
          console.log(res);
          return { _id: res.insertedIds[1], message: "new rank entry created" };
        },
        createGoalTime: async (root, args) => {
          args.date = new Date(args.datetime);
          const res = await GoalTimes.insert(args); // args,
          return { _id: res.insertedIds[1], message: "new goal entry created" };
        },
        deleteArea: async (root, { areaId, wheelId }) => {
          var message = "";
          /* Areas.deleteOne({ _id: ObjectId(areaId) }, function(err, obj) {
            if (err) throw err;
            message = obj.deletedCount + " area(s) deleted";
            console.log(message);
          }); //introduced WheelAreaLinks, so can just delete the link now*/

          WheelAreaLinks.deleteOne({ area: areaId, wheel: wheelId }, function(
            err,
            obj
          ) {
            if (err) throw err;
            message = obj.deletedCount + " area(s) deleted";
          });
          return { _id: areaId, title: message };
        }
      }
    };

    const opts = {
      port: 3001,
      cors: {
        credentials: true,
        origin: [
          "http://localhost:8000",
          "http://qa.lateralproducts.com.au",
          "http://staging.lateralproducts.com.au",
          "http://strategy.lateralproducts.com.au",
          "http://www.lateralproducts.com.au"
        ] //your frontend url.
      }
    };

    // context
    const context = req => ({
      req: req.request
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
    //the function above tracks the ip address

    // session middleware
    server.express.use(
      session({
        name: "qid",
        secret: `some-random-secret-here`,
        resave: true,
        saveUninitialized: true,
        cookie: {
          secure: process.env.NODE_ENV === "production",
          maxAge: ms("1d")
        }
      })
    );

    // start server
    server.start(opts, () =>
      console.log(`Server is running on http://localhost:${opts.port}`)
    );
  } catch (e) {
    console.log(e);
  }
};
