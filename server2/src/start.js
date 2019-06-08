import { MongoClient, ObjectId } from "mongodb";
import express from "express";
import bodyParser from "body-parser";
import { graphqlExpress, graphiqlExpress } from "graphql-server-express";
import { makeExecutableSchema } from "graphql-tools";
import cors from "cors";
import { prepare } from "../util/index";
import { AsyncResource } from "async_hooks";

const app = express();

app.use(cors());

const homePath = "/graphiql";
const URL = "http://localhost";
const PORT = 3001;
const MONGO_URL = "mongodb://localhost:27017/strategy";

export const start = async () => {
  try {
    const db = await MongoClient.connect(MONGO_URL);

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
          return prepare({ _id: areaId });
        },
        updateArea: async (root, args, context, info) => {
          const definition = args.definition;
          const res = await Areas.updateOne(
            { _id: ObjectId(args.areaId) },
            { $set: { definition: definition } }
          );
          return prepare({ _id: args.areaId }); // https://mongodb.github.io/node-mongodb-native/3.1/api/Collection.html#~insertOneWriteOpResult
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
          return "run shiftLinks";
        },

        createArea: async (root, args) => {
          const res = await Areas.insert(args);

          await WheelAreaLinks.insertOne({
            wheel: args.wheelId,
            area: res.insertedIds[1].toString()
          });
          return prepare(await Areas.findOne({ _id: res.insertedIds[1] }));
        },
        addExistingArea: async (root, args) => {
          await WheelAreaLinks.insertOne({
            wheel: args.wheelId,
            area: args.areaId
          });
          console.log(args);
          return prepare(await Areas.findOne({ _id: ObjectId(args.areaId) }));
        },
        createRankTime: async (root, args) => {
          args.date = new Date(args.datetime);
          console.log(args.date);
          const res = await RankTimes.insert(args); // args,
          return prepare(await RankTimes.findOne({ _id: res.insertedIds[1] }));
        },
        createGoalTime: async (root, args) => {
          args.date = new Date(args.datetime);
          console.log(args.date);
          const res = await GoalTimes.insert(args); // args,
          return prepare(await GoalTimes.findOne({ _id: res.insertedIds[1] }));
        },
        deleteArea: async (root, { areaId, wheelId }) => {
          var message = "";
          /* Areas.deleteOne({ _id: ObjectId(areaId) }, function(err, obj) {
            if (err) throw err;
            message = obj.deletedCount + " area(s) deleted";
            console.log(message);
          }); */

          WheelAreaLinks.deleteOne({ area: areaId, wheel: wheelId }, function(
            err,
            obj
          ) {
            if (err) throw err;
            message = obj.deletedCount + " area(s) deleted";
            console.log(message);
          });
          return { _id: areaId, title: message };
        }
      }
    };

    const schema = makeExecutableSchema({
      typeDefs,
      resolvers
    });

    app.use("/graphql", bodyParser.json(), graphqlExpress({ schema }));

    app.use(
      homePath,
      graphiqlExpress({
        endpointURL: "/graphql"
      })
    );

    app.listen(PORT, () => {
      console.log(`Visit ${URL}:${PORT}${homePath}`);
    });
  } catch (e) {
    console.log(e);
  }
};
