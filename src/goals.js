import { ObjectId } from 'mongodb'

import { getprofileid, getuserid, getwheelid } from './users'
import { getuiversion } from '../util/index'
import DbConnection from './database'
let pjson = require('../package.json')

export const typeDefs = `
    extend type Query {
        goals(area: String!): [Goal]
        goalLinks(area: String, goal: String, search: String, date: String): [GoalLink]
        readPomoData(area: String): PomodoroData
        readGoalPomoData(goal: String): PomodoroData
        pomodoros(goalId: String): [Pomodoro]
    }

    extend type Mutation {
        createGoal(datetime: String, goal: String, notes: String, keys:[KeyIn], areatags: [AreaTagIn], links: [String]): Goal
        updateGoal(goalId: String!, goal: String, notes: String, datetime: String, complete: String, keys:[KeyIn]): Goal
        removeGoal(goalid: String!): Boolean
        updateGoalOrder(goals: [String]): Boolean
        savePomodoro(area: String, links: [String], notes: String, goal: String, datetime: String, minutes: Int): Boolean!
        checkKey(goalId: String!, index: Int, check: Boolean): Boolean
    }
    
    extend type Mutation {
        createGoalLink(goalid: String, areaid: String, areaname: String): Tag
        updateGoalLink(linkid: String!, notes: String, snooze: String): Boolean
        removeGoalLink(linkid: String!): Boolean
        snoozeGoalLink(goalid: String!, snooze: String!): Boolean
    }

    extend type Mutation {
        updateFocusOrder(goals: [String]): Boolean
        saveFocusLink(area: String!, goal: String!, datetime: String!, links: [String]): Boolean
        snoozeFocusLink(goalid: String!, snooze: String!): Boolean
    }
`

export const schema = `
    type Goal {
        _id: String
        goal: String
        notes: String
        area: String
        datetime: String
        complete: String
        date: String
        keys: [Key]
        time: PomodoroData
        links: [Area]
    }

    input KeyIn {
        title: String
        checked: Boolean
    }

    type Key {
        title: String
        checked: Boolean
    }

    type GoalLink {
        _id: String
        goalid: String
        areaid: String
        notes: String
        area: Area
        goal: Goal
    }

    type Pomodoro {
        _id: String
        area: String
        links: String
        goal: String
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

export const resolvers = {
    Query: {
        goals: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            return await Goals.find(
                {
                    area: args.area,
                    profileid: getprofileid(req.session),
                    complete: { $eq: null }
                }, //update sort at some stage.
            )
                .sort({ orderrank: 1 })
                .toArray()
        },
        goalLinks: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            const GoalLinks = db.collection('goallinks')
            if (args.search || args.date) {
                let query = new Object()
                query.profileid = getprofileid(req.session)
                query.complete = { $eq: null }
                if (args.search) query.goal = new RegExp(args.search, 'i')
                if (args.date)
                    query.$or = [
                        { date: null },
                        { date: { $lte: new Date(args.date) } }
                    ]

                const goals = await Goals.find(query).toArray()

                query = {
                    profileid: getprofileid(req.session),
                    goalid: {
                        $in: goals.map(function(goal) {
                            return goal._id ? goal._id.toString() : null
                        })
                    }
                }

                const ObjLinksReturn = new Promise(function(resolve) {
                    GoalLinks.aggregate(
                        {
                            $match: query
                        },
                        {
                            $group: {
                                _id: '$goalid',
                                doc: { $first: '$$ROOT' }
                            }
                        },
                        {
                            $replaceRoot: {
                                newRoot: '$doc'
                            }
                        },
                        { $sort: { date: -1 } },

                        function(err, goallinks) {
                            if (err) throw err
                            resolve(goallinks)
                        },
                    )
                })
                return ObjLinksReturn
            } else {
                let query = Object()
                args.area ? (query.areaid = args.area) : ''
                args.goal ? (query.goalid = args.goal) : ''
                query.profileid = getprofileid(req.session)
                query.complete = { $eq: null }
                query.$or = [{ snooze: null }, { snooze: { $lt: new Date() } }]

                return await GoalLinks.find(query, {
                    sort: { orderrank: 1 }
                }).toArray()
            }
        },
        pomodoros: async(_, { goalId }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            return await Pomodoros.find(
                {
                    goal: goalId,
                    userid: getprofileid(req.session)
                },
                { sort: { date: -1 } },
            ).toArray()
        },
        readPomoData: async(_, { area }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            return new Promise(function(resolve) {
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
                            count: { $sum: '$minutes' },
                            records: { $sum: 1 },
                            direct: {
                                $sum: {
                                    $cond: {
                                        if: { $eq: ['$area', area] },
                                        then: 1,
                                        else: 0
                                    }
                                }
                            },
                            countdirect: {
                                $sum: {
                                    $cond: {
                                        if: { $eq: ['$area', area] },
                                        then: '$minutes',
                                        else: 0
                                    }
                                }
                            }
                        }
                    },

                    function(err, data) {
                        if (err) throw err
                        resolve(data[0] ? data[0] : 0)
                    },
                )
            })
        },
        readGoalPomoData: async(_, { goal }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            return new Promise(function(resolve) {
                Pomodoros.aggregate(
                    {
                        $match: {
                            $or: [
                                {
                                    goal: goal
                                }
                            ]
                        }
                    },
                    {
                        $group: {
                            _id: { links: null },
                            count: { $sum: '$minutes' },
                            records: { $sum: 1 }
                        }
                    },

                    function(err, data) {
                        if (err) throw err
                        resolve(data[0] ? data[0] : 0)
                    },
                )
            })
        }
    },
    Goal: {
        links: async({ links }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            if (links)
                return await Areas.find({
                    _id: {
                        $in: links.map(link => {
                            return ObjectId(link)
                        })
                    }
                }).toArray()
            else return null
        },
        time: async({ _id }, _, { req }) => {
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            return new Promise(function(resolve) {
                Pomodoros.aggregate(
                    {
                        $match: {
                            userid: getprofileid(req.session),
                            goal: _id.toString()
                        }
                    },
                    {
                        $group: {
                            _id: { links: null }, //"$area"
                            count: { $sum: '$minutes' }
                        }
                    },

                    function(err, data) {
                        if (err) throw err
                        resolve(data[0] ? data[0] : 0)
                    },
                )
            })
        }
    },
    GoalLink: {
        area: async({ areaid }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return await Areas.findOne({ _id: ObjectId(areaid) })
        },
        goal: async({ goalid }) => {
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            return await Goals.findOne({ _id: ObjectId(goalid) })
        }
    },
    Focus: {
        area: async({ area }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return await Areas.findOne({
                _id: ObjectId(area)
            })
        },
        goal: async({ goal }) => {
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            return await Goals.findOne({
                _id: ObjectId(goal)
            })
        }
    },
    Mutation: {
        createGoal: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.date = args.datetime ? new Date(args.datetime) : null
            args.datecreated = new Date()
            creategoal(args, req)
            return {
                _id: 1,
                message: 'new goal created'
            }
        },
        checkKey: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            await Goals.updateOne(
                {
                    _id: ObjectId(args.goalId),
                    profileid: getprofileid(req.session)
                },
                {
                    $set: {
                        [`keys.${args.index}.checked`]: args.check,
                        [`keys.${args.index}.date`]: new Date()
                    }
                },
            )
            return true
        },
        updateGoalLink: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            args.profileid = getprofileid(req.session)
            GoalLinks.updateOne(
                { _id: ObjectId(args.linkid) },
                { $set: { notes: args.notes } },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        createGoalLink: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const GoalLinks = db.collection('goallinks')
            let areaid
            if (!args.areaid) {
                let newarea = new Object() //create new area.
                newarea.wheelid = getwheelid(req.session)
                newarea.name = args.areaname
                const inserted = await Areas.insertOne(newarea) //only creating new area if "areaname is added"
                areaid = inserted.insertedId.toString()
            } else {
                areaid = args.areaid
            }

            const link = await GoalLinks.insertOne({
                //insert the link to connect note and new area.
                goalid: args.goalid,
                profileid: getprofileid(req.session),
                areaid: areaid,
                datecreated: new Date()
            })
            return {
                tagid: link.insertedId.toString(),
                tagname: args.areaname
            }
        },
        removeGoalLink: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            args.profileid = getprofileid(req.session)
            GoalLinks.deleteOne(
                {
                    _id: ObjectId(args.linkid),
                    profileid: args.profileid
                },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        updateGoal: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            const GoalLinks = db.collection('goallinks')
            let goalId = args.goalId
            delete args.goalId
            args.date = args.datetime ? new Date(args.datetime) : null
            //args.complete = args.complete ? new Date(args.complete) : null;
            args.lastupdated = new Date()
            let goal = await Goals.findOneAndUpdate(
                { _id: ObjectId(goalId) },
                { $set: args },
                { returnOriginal: false },
            )
            if (args.complete) {
                await GoalLinks.update(
                    { goalid: goalId },
                    {
                        $set: {
                            complete: args.complete,
                            lastupdated: args.lastupdated
                        }
                    },
                    { multi: true },
                )
                removefocuslink(req, goalId)
            }
            return goal.value
        },
        removeGoal: async(root, { goalid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            const Goals = db.collection('goals')
            const Profiles = db.collection('profiles')

            const goal = await Goals.findOne({ _id: ObjectId(goalid) })
            const profile = await Profiles.findOne({
                _id: ObjectId(goal.profileid)
            })
            if (profile.user !== getuserid(req.session)) {
                throw new Error('Unauthorised Goal Delete')
            } else {
                const goalLinksDeleted = GoalLinks.deleteMany({
                    goalid: goalid
                })
                const goalsDeleted = Goals.deleteOne({ _id: ObjectId(goalid) })
                const result = await Promise.all([
                    goalLinksDeleted,
                    goalsDeleted
                ])
                if (result) return true
                else return false
            }
        },
        updateGoalOrder: async(parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            args.goals.map(function(_id, count) {
                GoalLinks.updateOne(
                    { _id: ObjectId(_id) },
                    { $set: { orderrank: count } },
                )
            })
            return true
        },
        updateFocusOrder: async(parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const FocusLinks = db.collection('focuslinks')
            args.goals.map(function(_id, count) {
                FocusLinks.updateOne(
                    { _id: ObjectId(_id) },
                    { $set: { orderrank: count } },
                )
            })
            return true
        },
        saveFocusLink: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const FocusLinks = db.collection('focuslinks')
            let focuslink = await FocusLinks.findOne(
                {
                    userid: getprofileid(req.session),
                    goal: args.goal
                },
                { sort: { date: -1 } }, //update sort at some stage.
            )

            if (focuslink) {
                args.userid = getprofileid(req.session)
                await FocusLinks.deleteOne({
                    _id: focuslink._id,
                    userid: args.userid
                })
                return true
            } else {
                args.userid = getprofileid(req.session)
                args.serverversion = pjson.version
                args.uiversion = getuiversion(req.session)
                args.date = new Date(args.datetime)
                await FocusLinks.insertOne(args)
                return true
            }
        },
        snoozeFocusLink: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const FocusLinks = db.collection('focuslinks')
            args.userid = getprofileid(req.session)
            args.snoozedate = new Date(args.snooze)
            args.snoozedate.setHours(0, 0, 0, 0)
            await FocusLinks.updateMany(
                { goal: args.goalid, userid: args.userid },
                {
                    $set: {
                        snooze: args.snoozedate
                    }
                },
            )
            return true
        },
        snoozeGoalLink: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            args.profileid = getprofileid(req.session)
            args.snoozedate = new Date(args.snooze)
            args.snoozedate.setHours(0, 0, 0, 0)
            await GoalLinks.updateMany(
                { goalid: args.goalid, profileid: args.profileid },
                {
                    $set: {
                        snooze: args.snoozedate
                    }
                },
            )
            return true
        },
        savePomodoro: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            args.userid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.date = new Date(args.datetime)
            //need to check the goal and overwrite the links.
            const Goals = db.collection('goals')
            const Goal = await Goals.findOne({
                _id: ObjectId(args.goal)
            })
            if (Goal.links) args.links = Goal.links
            else
                Goals.updateOne(
                    { _id: ObjectId(args.goal) },
                    { $set: { links: args.links } },
                )
            //overwrite links if they are defined on the goal.
            await Pomodoros.insertOne(args)
            return true
        }
    }
}

async function creategoal(newgoal, req) {
    const db = await DbConnection.Get()
    const Goals = db.collection('goals')
    const GoalLinks = db.collection('goallinks')
    const Areas = db.collection('areas')
    try {
        Goals.insertOne(newgoal).then(result => {
            if (newgoal.areatags)
                newgoal.areatags.map(async link => {
                    let areaid = link.area._id

                    if (!areaid) {
                        let area = {
                            name: link.name,
                            wheelid: getwheelid(req.session),
                            serverversion: pjson.version,
                            uiversion: getuiversion(req.session),
                            created: new Date()
                        }

                        const res = await Areas.insert(area)
                        areaid = res.insertedIds[0].toString()
                    }

                    let goallink = new Object()
                    goallink.goalid = result.insertedId.toString()
                    goallink.profileid = newgoal.profileid
                    goallink.areaid = areaid
                    goallink.datetime = newgoal.datetime
                    goallink.date = new Date(newgoal.datetime)
                    goallink.datecreated = new Date()
                    GoalLinks.insert(goallink)
                })
        })
    } catch (error) {
        console.log(error)
    }
}

async function removefocuslink(req, goalid) {
    const db = await DbConnection.Get()
    const FocusLinks = db.collection('focuslinks')
    await FocusLinks.deleteOne({
        goal: goalid,
        userid: getprofileid(req.session)
    })

    return true
}
