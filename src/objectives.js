import { ObjectId } from "mongodb";

import { getprofileid } from "./users"
import { prepare, getuiversion } from "../util/index";
import DbConnection from "./database"
let pjson = require("../package.json");


export const schema = `
    type Objective {
        _id: String
        objective: String
        notes: String
        area: String
        datetime: String
        complete: String
        date: String
        keys: [Key]
        time: PomodoroData
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
`

export const typeDefs = `
    extend type Query {
        objectives(area: String!): [Objective]
        objectiveLinks(area: String, objective: String, search: String, date: String): [ObjectiveLink]
        readPomoData(area: String): PomodoroData
        readObjectivePomoData(objective: String): PomodoroData
        pomodoros(objectiveId: String): [Pomodoro]
    }

    extend type Mutation {
        createObjective(datetime: String, objective: String, notes: String, keys:[KeyIn], arealinks: [AreaLinkIn]): Objective
        createObjectiveLink(objectiveid: String, areaid: String, areaname: String): String
        checkKey(objectiveId: String!, index: Int, check: Boolean): Boolean
        updateObjectiveLink(linkid: String!, notes: String, snooze: String): Boolean
        removeObjectiveLink(linkid: String!): Boolean
        updateObjective(objectiveId: String!, objective: String, notes: String, datetime: String, complete: String, keys:[KeyIn]): Objective
        updateObjectiveOrder(objectives: [String]): Boolean
        updateFocusOrder(objectives: [String]): Boolean
        saveFocusLink(area: String!, objective: String!, datetime: String!, links: [String]): Boolean
        snoozeFocusLink(objectiveid: String!, snooze: String!): Boolean
        snoozeObjectiveLink(objectiveid: String!, snooze: String!): Boolean
        savePomodoro(area: String, links: [String], notes: String, objective: String, datetime: String, minutes: Int): Boolean!
    }

`
export const resolvers = {

    Query: {
        objectives: async (parent, args, { req }) => {
            const db = await DbConnection.Get();
            const Objectives = db.collection("objectives")
            return (await Objectives.find(
              {
                area: args.area,
                profileid: getprofileid(req.session),
                complete: { $eq: null }
              } //update sort at some stage.
            )
              .sort({ orderrank: 1 })
              .toArray()).map(prepare);
        },
        objectiveLinks: async (parent, args, { req }) => {
            const db = await DbConnection.Get();
            const Objectives = db.collection("objectives")
            const ObjectiveLinks = db.collection("objectivelinks")
            if (args.search || args.date) {
                let query = new Object();
                query.profileid = getprofileid(req.session);
                query.complete = { $eq: null };
                if (args.search) query.objective = new RegExp(args.search, "i");
                if (args.date)
                query.$or = [
                    { date: null },
                    { date: { $lte: new Date(args.date) } }
                ];

                const objectives = await Objectives.find(query).toArray();

                query = {
                profileid: getprofileid(req.session),
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
                let query = Object();
                args.area ? (query.areaid = args.area) : "";
                args.objective ? (query.objectiveid = args.objective) : "";
                query.profileid = getprofileid(req.session);
                query.complete = { $eq: null };
                query.$or = [{ snooze: null }, { snooze: { $lt: new Date() } }];

                return (await ObjectiveLinks.find(query, {
                    sort: { orderrank: 1 }
                }).toArray()).map(prepare);
            }
        },
        pomodoros: async (root, { objectiveId }, { req }) => {
            const db = await DbConnection.Get();
            const Pomodoros = db.collection("pomodoros")
            return (await Pomodoros.find(
                {
                    objective: objectiveId,
                    userid: getprofileid(req.session)
                },
                { sort: { date: -1 } }
            ).toArray()).map(prepare);
        },
        readPomoData: async (root, { area }, { req }) => {
            const db = await DbConnection.Get();
            const Pomodoros = db.collection("pomodoros")
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
                });
            });
        },
        readObjectivePomoData: async (root, { objective }, { req }) => {
            const db = await DbConnection.Get();
            const Pomodoros = db.collection("pomodoros")
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
                });
            });
        }
    },
    Mutation: {
        createObjective: async (root, args, { req }) => {
            args.profileid = getprofileid(req.session);
            args.serverversion = pjson.version;
            args.uiversion = getuiversion(req.session);
            args.date = args.datetime ? new Date(args.datetime) : null;
            args.datecreated = new Date();
            createobjective(args, req);            
            return {
                _id: 1,
                message: "new objective created"
            };
        },
        checkKey: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const Objectives = db.collection("objectives")
            await Objectives.updateOne(
                {
                _id: ObjectId(args.objectiveId),
                profileid: getprofileid(req.session)
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
        updateObjectiveLink: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const ObjectiveLinks = db.collection("objectivelinks")
            args.profileid = getprofileid(req.session);
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
            const db = await DbConnection.Get();
            const Areas = db.collection("areas")
            const ObjectiveLinks = db.collection("objectivelinks")
            let areaid;
            if (!args.areaid) {
              let newarea = new Object(); //create new area.
              newarea.wheelid = getprofileid(req.session);
              newarea.name = args.areaname;
              const inserted = await Areas.insertOne(newarea); //only creating new area if "areaname is added"
              areaid = inserted.insertedId.toString();
            } else {
              areaid = args.areaid;
            }
  
            const link = await ObjectiveLinks.insertOne({
              //insert the link to connect note and new area.
              objectiveid: args.objectiveid,
              profileid: getprofileid(req.session),
              areaid: areaid,
              datecreated: new Date()
            });
            return link.insertedId.toString();
        },
        removeObjectiveLink: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const ObjectiveLinks = db.collection("objectivelinks")
            args.profileid = getprofileid(req.session);
            ObjectiveLinks.deleteOne(
                {
                _id: ObjectId(args.linkid),
                profileid: args.profileid
                },
                function(err, obj) {
                if (err) throw err;
                }
            );
            return true;
        },
        updateObjective: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const Objectives = db.collection("objectives")
            const ObjectiveLinks = db.collection("objectivelinks")
            let objectiveId = args.objectiveId;
            delete args.objectiveId;
            args.date = args.datetime ? new Date(args.datetime) : null;
            //args.complete = args.complete ? new Date(args.complete) : null;
            args.lastupdated = new Date();
            let objective = await Objectives.findOneAndUpdate(
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
        updateObjectiveOrder: async (parent, args, { req }) => {
            const db = await DbConnection.Get();
            const ObjectiveLinks = db.collection("objectivelinks")
            args.objectives.map(function(_id, count) {
                ObjectiveLinks.updateOne(
                { _id: ObjectId(_id) },
                { $set: { orderrank: count } }
                );
            });
            return true;
        },
        updateFocusOrder: async (parent, args, { req }) => {
            const db = await DbConnection.Get();
            const FocusLinks = db.collection("focuslinks")
            args.objectives.map(function(_id, count) {
                FocusLinks.updateOne(
                { _id: ObjectId(_id) },
                { $set: { orderrank: count } }
                );
            });
            return true;
        },
        saveFocusLink: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const FocusLinks = db.collection("focuslinks")
            let focuslink = await FocusLinks.findOne(
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
            const db = await DbConnection.Get();
            const FocusLinks = db.collection("focuslinks")
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
            const db = await DbConnection.Get();
            const ObjectiveLinks = db.collection("objectivelinks")
            args.profileid = getprofileid(req.session);
            args.snoozedate = new Date(args.snooze);
            args.snoozedate.setHours(0, 0, 0, 0);
            await ObjectiveLinks.updateMany(
                { objectiveid: args.objectiveid, profileid: args.profileid },
                {
                $set: {
                    snooze: args.snoozedate
                }
                }
            );
            return true;
        },
        savePomodoro: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const Pomodoros = db.collection("pomodoros")
            args.userid = getprofileid(req.session);
            args.serverversion = pjson.version;
            args.uiversion = getuiversion(req.session);
            args.date = new Date(args.datetime);
            await Pomodoros.insertOne(args);
            return true;
        },
    },
    Objective: {
        time: async ({ _id }, args, { req }, query) => {
          const db = await DbConnection.Get();
          const Pomodoros = db.collection("pomodoros")
          return new Promise(function(resolve, reject) {

            Pomodoros.aggregate(
              {
                $match: {
                  userid: getprofileid(req.session),

                  objective: _id
                }
              },
              {
                $group: {
                  _id: { links: null }, //"$area"
                  count: { $sum: "$minutes" }
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
    ObjectiveLink: {
        area: async ({ areaid }, args, { req }) => {
          const db = await DbConnection.Get();
          const Areas = db.collection("areas")
          return prepare(
            await Areas.findOne({
              _id: ObjectId(areaid)
            })
          );
        },
        objective: async ({ objectiveid }, args, { req }) => {
          const db = await DbConnection.Get();
          const Objectives = db.collection("objectives")
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
          const db = await DbConnection.Get();
          const Areas = db.collection("areas")
          return prepare(
            await Areas.findOne({
              _id: ObjectId(area)
            })
          );
        },
        objective: async ({ objective }, args, { req }) => {
          const db = await DbConnection.Get();
          const Objectives = db.collection("objectives")
          return prepare(
            await Objectives.findOne({
              _id: ObjectId(objective)
            })
          );
        }
    },
}

async function createobjective(newobjective, req) {
    const db = await DbConnection.Get();
    const Objectives = db.collection("objectives")
    const ObjectiveLinks = db.collection("objectivelinks")
    try {
      Objectives.insertOne(newobjective).then(result => {
        if (newobjective.arealinks)
          newobjective.arealinks.map(async link => {
            let areaid = link.area._id;

            if (!areaid) {
              let area = {
                name: link.name,
                wheelid: getprofileid(req.session),
                serverversion: pjson.version,
                uiversion: getuiversion(req.session),
                created: new Date()
              };

              const res = await Areas.insert(area);
              areaid = res.insertedIds[0].toString();
            }

            let objectivelink = new Object();
            objectivelink.objectiveid = result.insertedId.toString();
            objectivelink.profileid = newobjective.profileid;
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

async function removefocuslink(req, objectiveid) {
    const db = await DbConnection.Get();
    const FocusLinks = db.collection("focuslinks")
    await FocusLinks.deleteOne({
        objective: objectiveid,
        userid: getprofileid(req.session)
    });

    return true;
}