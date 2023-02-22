import { ObjectId } from 'mongodb'
import { getprofileid, getwheelid } from './users'
import DbConnection from './database'
import { date2str, getuiversion } from '../util/functions'
import { activityrecord } from './pomodoros'
let pjson = require('../package.json')

export const typeDefs = `
    extend type Query {
        goals(area: String, search: String, date: String, goal: String): [Goal]
        goalstolink: [Goal]
        linkedgoals(goal: String): [Goal]
        parentgoals(goal: String, filterid: String): [Goal]
        goalTags(area: String, goal: String): [GoalTag]
    }

    extend type Mutation {
        createGoal(datetime: String, goal: String, notes: String, tasks:[KeyIn], areatags: [AreaTagIn], description: String): Goal
        updateGoal(goalId: String!, goal: String, notes: String, datetime: String, complete: String, description: String): Goal
        finishGoal(goal: String!, notes: String, complete: String): Boolean
        removeGoal(goalid: String!): Boolean
        snoozeGoal(goalid: String!, snooze: String!): Boolean
        updateGoalOrder(goals: [String]): Boolean
        updateGoalListOrder(goals: [String]): Boolean
        createGoalLink(rootgoal: String, goal: String): Boolean
        deleteGoalLink(rootgoal: String, goal: String): Area
    }
    
    extend type Mutation {
        createGoalTag(goalid: String, areaid: String, areaname: String): Tag
        updateGoalTag(tagid: String!, notes: String, snooze: String): Boolean
        removeGoalTag(tagid: String!): Boolean
    }
`

export const schema = `
    type Goal {
        _id: String
        goal: String
        description: String
        area: String
        datetime: String
        complete: String
        date: String
        keys: [Key]
        time: PomodoroData
        links: [Area]
        tasks: [Task]
        goals: [Goal]
        goalslinked: Boolean
        linkreferenced: Boolean
    }

    input KeyIn {
        title: String
        checked: Boolean
    }

    type Key {
        title: String
        checked: Boolean
    }

    type GoalTag {
        _id: String
        goalid: String
        areaid: String
        notes: String
        area: Area
        goal: Goal
    }
`

export const resolvers = {
    Query: {
        goals: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            const GoalLinks = db.collection('goallinks')

            let order = new Object()
            order = { orderrank: 1 }
            let query = new Object()
            query.profileid = getprofileid(req.session) //show goals from profileid.
            query.complete = { $eq: null } //only show goals that aren't complete.

            if(args.area) query.area = args.area

            if (args.search || args.date) { //this is the search query on a goal.
                query.profileid = getprofileid(req.session)
                query.complete = { $eq: null }
                if (args.search) query.goal = new RegExp(args.search, 'i')
                if (args.date)
                    query.$or = [
                        { date: null },
                        { date: { $lte: new Date(args.date) } }
                    ]
            } else query.$or = [{ snooze: null }, { snooze: { $lt: new Date() } }] //if not a search query, only show unsnoozed goals.
            
            if(args.goal) {
                var linklist = await GoalLinks.find({profileid: getprofileid(req.session), rootgoal: args.goal}).toArray()
                query._id = {$in: linklist.map(function(link) {return ObjectId(link.goal)})}
                //need to eventually fix the sort on linked goals. Think this will task a refactor to figure out the way to do it.
            }

            return await Goals.find(query).sort(order).toArray()
        },
        goalstolink: async(_, args, { req }) => {
            //used for giving list of goals that can be selected. ie. to link to a task.
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')

            let query = new Object()
            query.profileid = getprofileid(req.session)
            query.complete = { $eq: null }

            return await Goals.find(query).sort({ datecreated: -1 }).toArray()
        },
        linkedgoals: async(_, args, { req }) => {
            //show linked sub goals on a goal.
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            const Goals = db.collection('goals')

            let query = new Object()
            query.profileid = getprofileid(req.session)
            query.rootgoal = args.goal //find all goals that this goal links to.

            var linklist = await GoalLinks.find(query).toArray()
            return await Goals.find({ _id: { $in: linklist.map(function(link) {return ObjectId(link.goal)}) }}).sort({orderrank: 1}).toArray()
        },
        parentgoals: async(_, args, { req }) => {
            //show linked sub goals on a goal.
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            const Goals = db.collection('goals')

            let query = new Object()
            query.profileid = getprofileid(req.session)
            query.goal = args.goal //find goals that link to this goal.
            query.rootgoal = {$not: {$eq: args.filterid}}

            var linklist = await GoalLinks.find(query).toArray()
            return await Goals.find({ _id: { $in: linklist.map(function(link) {return ObjectId(link.rootgoal)}) }}).sort({orderrank: 1}).toArray()
        },
        goalTags: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTags = db.collection('goaltags')
            
            let query = Object()
            args.area ? (query.areaid = args.area) : ''
            args.goal ? (query.goalid = args.goal) : ''
            query.profileid = getprofileid(req.session)
            query.complete = { $eq: null }
            query.$or = [{ snooze: null }, { snooze: { $lt: new Date() } }]
            
            return await GoalTags.find(query, {
                sort: { orderrank: 1 }
            }).toArray()
            
        }
    },
    Goal: {
        tasks: async({ _id }, _, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const tasks = await Tasks.find(
                {
                    profile: getprofileid(req.session),
                    goal: _id.toString()
                }
            )
            .sort({daytask: 1, starttime: 1}).toArray()
            return tasks
        },
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
        },
        goals: async(parent, __, { req }) => {
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            const Goallinks = db.collection('goallinks')
            const query = {
                rootgoal: parent._id.toString(),
                profileid: parent.profileid
            }
            const goallinks = await Goallinks.distinct('area', query)

            return await Goals.find({
                _id: {
                    $in: goallinks.map(function(id) {
                        return ObjectId(id)
                    })
                }
            }).toArray()
        },
        goalslinked: async(parent, __, { req }) => {
            //return whether this goal links other goals.
            const db = await DbConnection.Get()
            const Goallinks = db.collection('goallinks')
            const query = {
                rootgoal: parent._id.toString(),
                profileid: parent.profileid
            }
            const goallinks = await Goallinks.findOne(query)
            if (goallinks) return true
            else return false
        },
        linkreferenced: async(parent, __, { req }) => {
            //return whether other goals are linking this one.
            const db = await DbConnection.Get()
            const Goallinks = db.collection('goallinks')
            const query = {
                goal: parent._id.toString(),
                profileid: parent.profileid
            }
            const goallinks = await Goallinks.findOne(query)
            if (goallinks) return true
            else return false
        },
    },
    GoalTag: {
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
    Mutation: {
        createGoal: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.date = args.datetime ? new Date(args.datetime) : null
            args.datecreated = new Date()
            return creategoal(args, req).then(goalid => {
                return {_id: goalid, goal: args.goal}
            })
        },
        updateGoalTag: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTags = db.collection('goaltags')
            args.profileid = getprofileid(req.session)
            GoalTags.updateOne(
                { _id: ObjectId(args.tagid) },
                { $set: { notes: args.notes } },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        createGoalTag: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const GoalTags = db.collection('goaltags')
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

            const link = await GoalTags.insertOne({
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
        removeGoalTag: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTags = db.collection('goaltags')
            args.profileid = getprofileid(req.session)
            GoalTags.deleteOne(
                {
                    _id: ObjectId(args.tagid),
                    profileid: args.profileid
                },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        finishGoal: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')

            if (args.complete) {
                activityrecord(args, req, 'marked as complete 🎉')
                if (args.notes) activityrecord(args, req) //save note as a record.
                await Goals.updateOne(
                    { _id: ObjectId(args.goal), profileid: getprofileid(req.session)  },
                    {
                        $set: {
                            complete: args.complete,
                            lastupdated: args.lastupdated
                        }
                    }
                )
            }
            return (true)
        },
        updateGoal: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            let goalId = args.goalId
            delete args.goalId
            args.date = args.datetime ? new Date(args.datetime) : null
            //args.complete = args.complete ? new Date(args.complete) : null;
            args.lastupdated = new Date()
            let goal = await Goals.findOneAndUpdate(
                { _id: ObjectId(goalId), profileid: getprofileid(req.session) },
                { $set: args },
                { returnOriginal: false },
            )
            return goal.value
        },
        removeGoal: async(root, { goalid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTags = db.collection('goaltags')
            const Goals = db.collection('goals')
            const GoalLinks = db.collection('goallinks')
            await GoalTags.deleteMany({ goalid: goalid, profileid: getprofileid(req.session) })
            await GoalLinks.deleteMany({ $or: [{rootgoal: goalid},{goal: goalid}], profileid: getprofileid(req.session) })
            Goals.deleteMany({ _id: ObjectId(goalid), profileid: getprofileid(req.session) }).then(result => {
                if (result.result.n > 0) return true
                else return false
            })
        },
        updateGoalListOrder: async(parent, args, { req }) => {
            //update the main goal list order rank. persist in database.
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            args.goals.map(function(_id, count) {
                Goals.updateOne(
                    { _id: ObjectId(_id) },
                    { $set: { orderrank: count } },
                )
            })
            return true
        },
        updateGoalOrder: async(parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTags = db.collection('goaltags')
            args.goals.map(function(_id, count) {
                GoalTags.updateOne(
                    { _id: ObjectId(_id) },
                    { $set: { orderrank: count } },
                )
            })
            return true
        },
        snoozeGoal: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            const GoalTags = db.collection('goaltags')
            args.profileid = getprofileid(req.session)
            args.snoozedate = new Date(args.snooze)
            args.snoozedate.setHours(0, 0, 0, 0)
            await Goals.update(
                { _id: ObjectId(args.goalid) },
                { $set: { snooze: args.snoozedate }}
            )
            await GoalTags.updateMany(
                { goalid: args.goalid, profileid: args.profileid },
                { $set: { snooze: args.snoozedate }}
            )
            var pomo = new Object()
            pomo.goal = args.goalid
            activityrecord(pomo, req, 'Goal snoozed to ' + date2str(args.snoozedate,'MM-dd-yyyy'))
            return true
        },
        createGoalLink: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')

            if(args.rootgoal !== args.goal){
                GoalLinks.insertOne({
                    rootgoal: args.rootgoal,
                    goal: args.goal,
                    profileid: getprofileid(req.session),
                    created: new Date()
                })
                return true
            }else{
                throw new Error('Can\'t link the same goal')
            }
        },
        deleteGoalLink: async(_, { rootgoal, goal }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            const res = await GoalLinks.deleteMany(
                {
                    rootgoal: rootgoal,
                    goal: goal,
                    profileid: getprofileid(req.session)
                }
            )
            return res
        },
    }
}

async function creategoal(newgoal, req) {
    const db = await DbConnection.Get()
    const Goals = db.collection('goals')
    const GoalTags = db.collection('goaltags')
    const Areas = db.collection('areas')
    const Tasks = db.collection('tasks')
    try {
        return Goals.insertOne(newgoal).then(result => {
            var pomo = new Object()
            pomo.goal = result.insertedId.toString()
            activityrecord(pomo, req, 'Goal created.')
            if (newgoal.tasks){
                newgoal.tasks.map(async task => {   
                    var newtask = new Object()
                    newtask.title = task.title
                    newtask.complete = task.checked
                    newtask.goal = result.insertedId.toString()
                    newtask.profile = getprofileid(req.session)
                    Tasks.insertOne(newtask)
                })
            }
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

                    let goaltag = new Object()
                    goaltag.goalid = result.insertedId.toString()
                    goaltag.profileid = newgoal.profileid
                    goaltag.areaid = areaid
                    goaltag.datetime = newgoal.datetime
                    goaltag.date = new Date(newgoal.datetime)
                    goaltag.datecreated = new Date()
                    GoalTags.insert(goaltag)
                })
            return result.insertedId
        })
    } catch (error) {
        console.log(error)
    }
}
