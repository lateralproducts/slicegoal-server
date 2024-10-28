import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';
import { getprofileid, getuserid, getwheelid, updateUserOnboarding } from './users'
import DbConnection from './database'
import { date2str, getuiversion } from '../util/functions'
import { activityrecord } from './pomodoros'
import { log } from './logging';
let pjson = require('../package.json')

export const typeDefs = `
    extend type Query {
        goal(goalid: String!): Goal
        goals(area: String, search: String, date: String, goal: String): [Goal]
        goalstolink: [Goal]
        linkedgoals(goal: String): [Goal]
        parentgoals(goal: String, filterid: String): [Goal]
        goalTags(area: String, goal: String): [InsightTag]
    }

    extend type Mutation {
        createGoal(datetime: String, goal: String, notes: String, tasks:[KeyIn], areatags: [AreaTagIn], description: String): Goal
        updateGoal(goalId: String!, goal: String, notes: String, datetime: String, complete: String, description: String): Goal
        finishGoal(goal: String!, notes: String, complete: String): Boolean
        removeGoal(goalid: String!): Boolean
        snoozeGoal(goalid: String!, snooze: String!): Boolean
        
        updateGoalOrder(goals: [String]): Boolean
        updateGoalListOrder(goals: [String]): Boolean
        updateSubGoalListOrder(goal: String, subgoals: [String]): Boolean
        
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
`

export const resolvers = {
    Query: {
        goal: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')

            return await Goals.findOne({profileid: getprofileid(req.session), _id: new ObjectId(args.goalid)})
        },
        goals: async(_, { area, search, date, goal }, { req }) => {
            return await getGoals({area, search, date, goal, profileid: getprofileid(req.session)})
        },
        goalstolink: async(_, args, { req }) => {
            //used for giving list of goals that can be selected. ie. to link to a task.
            
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')

            let query = new Object()
            query.profileid = getprofileid(req.session)
            query.complete = { $eq: null }

            return await Goals.find(query).sort({ datecreated: -1 }).toArray()
        },
        linkedgoals: async(_, args, { req }) => {
            //show linked sub goals on a goal.
            
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            const Goals = db.collection('goals')

            let query = new Object()
            query.profileid = getprofileid(req.session)
            query.rootgoal = args.goal //find all goals that this goal links to.

            var linklist = await GoalLinks.find(query).toArray()
            return await Goals.find({ _id: { $in: linklist.map(function(link) {return new ObjectId(link.goal)}) }, $or: [{snooze: { $lt: new Date() }},{snooze: {$eq: null}}]}).sort({orderrank: 1}).toArray()
        },
        parentgoals: async(_, args, { req }) => {
            //show linked sub goals on a goal.
            
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            const Goals = db.collection('goals')

            let query = new Object()
            query.profileid = getprofileid(req.session)
            query.goal = args.goal //find goals that link to this goal.
            query.rootgoal = {$not: {$eq: args.filterid}}

            var linklist = await GoalLinks.find(query).toArray()
            return await Goals.find({ _id: { $in: linklist.map(function(link) {return new ObjectId(link.rootgoal)}) }}).sort({orderrank: 1}).toArray()
        },
        goalTags: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')
            
            let query = Object()
            if(args.area) query.area = args.area
            if(args.goal) query.goalid = args.goal
            query.profileid = getprofileid(req.session)
            query.complete = { $eq: null }
            query.$or = [{ snooze: null }, { snooze: { $lt: new Date() } }]
            
            return await Tags.find(query, {
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
                            return new ObjectId(link)
                        })
                    }
                }).toArray()
            else return null
        },
        time: async({ time }, _, { req }) => {
            /* const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            const aggCursor = await Pomodoros.aggregate(
                [{
                    $match: {
                        profileid: getprofileid(req.session),
                        goal: _id.toString()
                    }
                },
                {
                    $group: {
                        _id: _id.toString(), //"$area"
                        count: { $sum: '$minutes' }
                    }
                }]
            )
            
            var result
            await aggCursor.forEach(doc => {
                result = doc
            }) */

            return {count: time}
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
                        return new ObjectId(id)
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
    Mutation: {
        createGoal: async(root, args, { req }) => {
            
            args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.date = args.datetime ? new Date(args.datetime) : null //time set from client argument
            args.datecreated = new Date()
            return creategoal(args, req).then(goalid => {
                return {_id: goalid, goal: args.goal}
            })
        },
        updateGoalTag: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')
            Tags.updateOne(
                { _id: new ObjectId(args.tagid), profileid: getprofileid(req.session)},
                { $set: { notes: args.notes } },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        createGoalTag: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const Tags = db.collection('insighttags')
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

            const link = await Tags.insertOne({
                //insert the link to connect note and new area.
                goalid: args.goalid,
                profileid: getprofileid(req.session),
                area: areaid,
                datecreated: new Date()
            })
            return {
                tagid: link.insertedId.toString(),
                tagname: args.areaname
            }
        },
        removeGoalTag: async(root, args, { req }) => {
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')
            Tags.deleteOne(
                {
                    _id: new ObjectId(args.tagid),
                    profileid: getprofileid(req.session)
                },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        finishGoal: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')

            if (args.complete) {
                activityrecord({goalid: args.goal, req: req, notes: 'marked as complete 🎉', checked: true})
                if (args.notes) activityrecord({goalid: args.goal, req: req, notes: args.notes, checked: true}) //save note as a record.
                await Goals.updateOne(
                    { _id: new ObjectId(args.goal), profileid: getprofileid(req.session)  },
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
            
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            let goalId = args.goalId
            delete args.goalId
            args.date = args.datetime ? new Date(args.datetime) : null //time set from client argument
            //args.complete = args.complete ? new Date(args.complete) : null; //time set from client argument
            args.lastupdated = new Date()
            let goal = await Goals.findOneAndUpdate(
                { _id: new ObjectId(goalId), profileid: getprofileid(req.session) },
                { $set: args },
                { returnOriginal: false },
            )
            return goal.value
        },
        removeGoal: async(root, { goalid }, { req }) => {
            
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')
            const Goals = db.collection('goals')
            const GoalLinks = db.collection('goallinks')
            await Tags.deleteMany({ goalid: goalid, profileid: getprofileid(req.session) })
            await GoalLinks.deleteMany({ $or: [{rootgoal: goalid},{goal: goalid}], profileid: getprofileid(req.session) })
            Goals.deleteMany({ _id: new ObjectId(goalid), profileid: getprofileid(req.session) }).then(result => {
                if (result.result.n > 0) return true
                else return false
            })
        },
        updateGoalListOrder: async(parent, args, { req }) => {
            //update the main goal list order rank. persist in database.
            
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            args.goals.map(function(_id, count) {
                Goals.updateOne(
                    { _id: new ObjectId(_id) },
                    { $set: { orderrank: count } },
                )
            })
            return true
        },
        updateSubGoalListOrder: async(parent, {goal, subgoals}, { req }) => {
            //update the main goal list order rank. persist in database.
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            Goals.updateOne(
                { _id: new ObjectId(goal) },
                { $set: { subgoals: subgoals} },
            )
            return true
        },
        updateGoalOrder: async(parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')
            args.goals.map(function(_id, count) {
                Tags.updateOne(
                    { _id: new ObjectId(_id) },
                    { $set: { orderrank: count } },
                )
            })
            return true
        },
        snoozeGoal: async(root, {goalid, snooze}, { req }) => {
            
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            const Tags = db.collection('insighttags')
            const profileid = getprofileid(req.session)
            let snoozedate = new Date(snooze) //time set from client argument
            snoozedate.setHours(0, 0, 0, 0)
            await Goals.updateOne(
                { _id: new ObjectId(goalid) },
                { $set: { snooze: snoozedate }}
            )
            await Tags.updateMany(
                { goalid: goalid, profileid: profileid },
                { $set: { snooze: snoozedate }}
            )

            activityrecord({goalid: goalid, req: req, notes: 'Goal snoozed to ' + date2str(snoozedate,'MM-dd-yyyy'), snoozed: true})
            return true
        },
        createGoalLink: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            const Goals = db.collection('goals')

            if(args.rootgoal !== args.goal){
                GoalLinks.insertOne({
                    rootgoal: args.rootgoal,
                    goal: args.goal,
                    profileid: getprofileid(req.session),
                    created: new Date()
                })
                Goals.updateOne(
                    { _id: new ObjectId(args.goal) },
                    { $set: { linkreferenced: true }}
                )
                return true
            }else{
                return triggererror('Can\'t link the same goal')
            }
        },
        deleteGoalLink: async(_, { rootgoal, goal }, { req }) => {
            
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            const Goals = db.collection('goals')
            
            const res = await GoalLinks.deleteMany(
                {
                    rootgoal: rootgoal,
                    goal: goal,
                    profileid: getprofileid(req.session)
                }
            )
            Goals.updateOne(
                { _id: new ObjectId(goal) },
                { $unset: { linkreferenced: '' }}
            )
            return res
        },
    }
}

export async function creategoal(newgoal, req) {
    const db = await DbConnection.Get()
    const Goals = db.collection('goals')
    const Tags = db.collection('insighttags')
    const Areas = db.collection('areas')
    const Tasks = db.collection('tasks')
    try {
        return Goals.insertOne(newgoal).then(result => {
            const newgoalid = result.insertedId.toString()
            activityrecord({goalid: newgoalid, req: req, notes: 'Goal created.', created: true})
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

                        const res = await Areas.insertOne(area)
                        areaid = res.insertedId
                    }

                    let goaltag = new Object()
                    goaltag.goalid = result.insertedId.toString()
                    goaltag.profileid = newgoal.profileid
                    goaltag.area = areaid
                    goaltag.datecreated = new Date()
                    Tags.insertOne(goaltag)
                })
            
            const user = req.session.user
            if (user.onboarding && user.onboarding.show) updateUserOnboarding(getuserid(req.session), 'goal')

            return result.insertedId
        })
    } catch (error) {
        log(error)
    }
}

export async function testfunction(newgoal, req) {
    const db = await DbConnection.Get()
    const Areas = db.collection('areas')
    let res = await Areas.insertOne(newgoal)
    res.wheelid = getwheelid(req.session)
    return res
}

export async function getGoals({area, search, date, goal, profileid}) {
    const db = await DbConnection.Get();
    const Goals = db.collection('goals');
    const GoalLinks = db.collection('goallinks');

    let order = { orderrank: 1 };
    let query = {
        profileid: profileid,
        complete: { $eq: null }
    };

    if (area) query.area = area;

    if (search || date) {
        if (search) query.goal = new RegExp(search, 'i');
        if (date) {
            query.$or = [
                { date: null },
                { date: { $lte: new Date(date) } }
            ];
        }
    } else {
        query.$or = [
            { snooze: null },
            { snooze: { $lt: new Date() } }
        ];
    }

    if (goal) {
        const linklist = await GoalLinks.find({ profileid: profileid, rootgoal: goal }).toArray();
        query._id = { $in: linklist.map(link => new ObjectId(link.goal)) };
    }

    if (!goal && !search && !area) {
        query.linkreferenced = { $ne: true };
    }

    return await Goals.find(query).sort(order).toArray();
}