import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getprofileid } from './users'
//import { activityrecord } from './pomodoros'

export const schema = `
    type Task {
        _id: String
        date: String
        starttime: String
        endtime: String
        title: String
        description: String
        goal: Goal,
        complete: Boolean,
        schedule: Boolean,
        rescheduled: Int,
        tasks: [Task]
    }
`

export const typeDefs = `
    extend type Query {
        tasks(starttime: String, endtime: String, scheduled: Boolean, complete: Boolean, today: String, goal: String, list: String) : [Task]
        task(taskid: String!): Task
        searchTasks(search: String!): [Task]
        pastTasks(date: String!): [Task]
        taskInsights(taskid: String!): [Insight]
    }
    
    extend type Mutation {
        newTask(setdate: String, starttime: String, endtime: String, title: String, description: String, insightid: String, goal: String, complete: Boolean, schedule: Boolean) : String        
        editTask(taskid: String!, starttime: String, endtime: String, title: String, description: String, setdate: String, goal: String, complete: Boolean, schedule: Boolean, reschedule: Boolean) : Boolean
        deleteTask(taskid: String!) : Boolean
        listTask(taskid: String!) : Boolean
        unlistTask(taskid: String!) : Boolean
        scheduleTask(taskid: String!, setdate: String, reschedule: Boolean) : Boolean
        checkTask(taskid: String!, checked: Boolean) : Boolean
        removeTaskGoal(taskid: String!): Boolean
        updateDayTaskOrder(tasks: [String]): Boolean
        updateGoalTaskOrder(tasks: [String]): Boolean
        updateTaskListOrder(tasks: [String]): Boolean
        newSubTask(taskid: String!, task: String!): Boolean
        linkInsightToTask(taskid: String!, insightid: String!): Boolean
    }
`

export const resolvers = {
    Query: {
        tasks: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            let query = new Object()

            if(!args.complete) query.$or = [ //only return if complete not equal to true (or doesn't exist)
                {complete: null},
                {complete: false},
                {complete: {$exists: false}}]
            else query.complete = true

            if (args.goal) { //return list of unscheduled/unfinished tasks
                query.profile = getprofileid(req.session)
                query.goal = args.goal
                query.type = {$ne: 'subtask'}
                return await Tasks.find(query).sort({goalorder: 1}).toArray()
            }

            if (args.scheduled && args.list === 'day') { //return list of unscheduled/unfinished tasks for scheduler
                const today = new Date(args.today)
                return await Tasks.find(
                    {
                        profile: getprofileid(req.session),
                        schedule: true,
                        type: {$ne: 'subtask'},
                        $and: [{$or: [
                            {complete: null},
                            {complete: false},
                            {complete: {$exists: false}}
                        ]},
                        {$or: [
                            {starttime: null},
                            {starttime: {$exists: false}},
                            {starttime: {$lt: today}}
                        ]}]
                    }
                ).sort({rescheduled: -1}).toArray()
            } else { //return list of tasks for the day OR main list.
                
                if(args.list === 'main') { //only return 'scheduled' tasks for main list.
                    query.schedule = true 
                    query.starttime = null
                }
                
                query.profile = getprofileid(req.session)
                if(args.starttime || args.endtime){
                    const starttime = new Date(args.starttime)
                    const endtime = new Date(args.endtime) 
                    query.$and = [
                            {'starttime': {$gte: starttime}},
                            {'starttime': {$lt: endtime}}
                        ]
                }
                let sort = new Object()
                //sort.complete = 1
                query.type = {$ne: 'subtask'}
                if(args.list == 'day') sort.dayorder = 1 
                else sort.listorder = 1

                return await Tasks.find(query)
                .sort(sort).toArray()
            }
        },
        task: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            return await Tasks.findOne(
                {
                    profile: getprofileid(req.session),
                    _id: ObjectId(args.taskid)
                }
            )
        },
        searchTasks: async(_, {search}, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            return await Tasks.find({profile: getprofileid(req.session), title: new RegExp(search, 'i')}).sort({created: -1}).toArray()
        },
        pastTasks: async(_, {date}, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const starttime = new Date(date)
            return await Tasks.find({
                profile: getprofileid(req.session), 
                starttime: {$lt: starttime}, 
                $or: [
                    {complete: null},
                    {complete: false},
                    {complete: {$exists: false}}
                ]}).sort({starttime: -1}).toArray()
        },
        taskInsights: async(_, {taskid}, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const Insights = db.collection('insights')
            const task = await Tasks.findOne({profile: getprofileid(req.session), _id: ObjectId(taskid)})

            if (task.insights) 
                return await Insights.find({
                    _id: {
                        $in: task.insights.map(insightid => {return ObjectId(insightid)})
                    }
                }).toArray()
            else return []
        }
    },
    Task: {
        goal: async({ goal }) => {
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            return await Goals.findOne({ _id: ObjectId(goal) })
        },
        tasks: async({ tasks }) => {
                try {
                    const db = await DbConnection.Get()
                    const Tasks = db.collection('tasks')
                    return await Tasks.find({_id: {
                        $in: tasks.map(function(taskid) {
                            if(taskid.task) return 
                            else return ObjectId(taskid)
                        })
                    }}).toArray()
                }
                 catch (error) {
                    return []
                }
        }
    },
    Mutation: {
        newTask: async(_, args, { req }) => {
            //need to move business logic to server.
            if (!req.session.user) throw new Error('Invalid Session')
            args.profileid = getprofileid(req.session)
            const taskid = await createNewTask(args)
            if (args.insightid) linkInsightTask(taskid, args.insightid)
            return taskid
        },
        editTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            var updates = new Object()
            if (args.endtime) {
                updates.endtime = new Date(args.endtime),
                updates.daytask = false
            }
            else {
                updates.daytask = true
                updates.endtime = null
            }

            if (!args.goal && !args.starttime) updates.schedule = true
            else updates.schedule = false

            if(args.setdate || args.starttime) 
                {updates.starttime = args.starttime ? new Date(args.starttime) : new Date(args.setdate)} 
            /* else 
                updates.starttime = null */
            if(args.title) updates.title = args.title
            if(args.complete !== null) updates.complete = args.complete
            if(args.description !== null) updates.description = args.description
            if(args.goal) updates.goal = args.goal

            var updatetask = new Object()
            updatetask.$set = updates
            if (args.reschedule){
                updatetask.$inc = { rescheduled: 1}
            }

            return (await Tasks.updateOne(
                {_id: ObjectId(args.taskid)},
                updatetask
            )).result.ok === 1
        },
        deleteTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            return (await Tasks.deleteOne({_id: ObjectId(args.taskid)})).result.ok === 1
        },
        listTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            return (await Tasks.updateOne(
                {_id: ObjectId(args.taskid)},
                {
                    $set: {schedule: true}, 
                    $unset: {starttime: null}
                }
            )).result.ok === 1
        },
        unlistTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            return (await Tasks.updateOne(
                {_id: ObjectId(args.taskid)},
                {
                    $unset: { schedule: null },
                    $inc: { rescheduled: 1}
                }
            )).result.ok === 1
        },
        updateDayTaskOrder: async(parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            args.tasks.map(function(_id, count) {
                Tasks.updateOne(
                    { _id: ObjectId(_id) },
                    { $set: { dayorder: count } },
                )
            })
            return true
        },
        updateGoalTaskOrder: async(parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            args.tasks.map(function(_id, count) {
                Tasks.updateOne(
                    { _id: ObjectId(_id) },
                    { $set: { goalorder: count } },
                )
            })
            return true
        },
        updateTaskListOrder: async(parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            args.tasks.map(function(_id, count) {
                Tasks.updateOne(
                    { _id: ObjectId(_id) },
                    { $set: { listorder: count } },
                )
            })
            return true
        },
        scheduleTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            var updates = new Object()

            if (args.reschedule){ //if date existing, then increment reschedule count.
                updates.$inc = { rescheduled: 1}
            }
            
            if(args.setdate) {
                updates.$set = {
                    starttime: args.starttime ? new Date(args.starttime) : new Date(args.setdate),
                    daytask: true,
                    endtime: null
                }
                updates.$unset = {schedule: null}
            } else {
                updates.$unset = { //unsetting, variables don't matter.
                    starttime: ''
                }
            }
            return (await Tasks.updateOne(
                {_id: ObjectId(args.taskid)},
                updates
            )).result.ok === 1    
        },
        checkTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            return checkTask(args, req)
        },
        removeTaskGoal: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            return (await Tasks.updateOne(
                {_id: ObjectId(args.taskid)},
                {$unset: {goal:''}}
            )).result.ok === 1
        },
        newSubTask: async(_, {taskid,task}, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const subtaskid = await createNewTask({title: task, profileid: getprofileid(req.session), type: 'subtask'})
            const Tasks = db.collection('tasks')
            return (await Tasks.updateOne(
                {_id: ObjectId(taskid)},
                {$push: {tasks: subtaskid }}
            )).result.ok === 1
        },
        linkInsightToTask: async(_, {taskid,insightid}, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            return await linkInsightTask(taskid, insightid)
        }
    }
}

export async function linkInsightTask(taskid, insightid){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    return (await Tasks.updateOne(
        {_id: ObjectId(taskid)},
        {$push: {insights: insightid}}
    )).result.ok === 1
}

async function createNewTask({title, description, goal, complete, setdate, starttime, endtime, profileid, type}) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')

    var task = new Object({title: title, description: description, goal: goal, complete: complete })
    task.starttime = starttime ? new Date(starttime) : (setdate ? new Date(setdate) : null)
    task.created = new Date()

    if (!goal && !starttime) task.schedule = true
    else task.schedule = false
    
    if (endtime) {
        task.endtime = new Date(endtime),
        task.daytask = false
    }
    else {
        task.daytask = true
        task.endtime = null
    }
    task.profile = profileid
    task.type = type

    return (await Tasks.insertOne(task)).insertedId.toString()
}

export async function checkTask(args, req){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    var updatetask = new Object()

    if(args.checked) {
        updatetask.goalorder = 1000 //setting order to 1000 - to bottom of list.
        //make completed task show on the day schedule.
        updatetask.schedule = true //listing as scheduled so it appears in the day record.
        updatetask.starttime = new Date() //making task date today, so that it's recorded against the day.
    }
    updatetask.complete = args.checked

    return (await Tasks.updateOne(
        {_id: ObjectId(args.taskid)},
        {$set: updatetask}
    )).result.ok === 1
}