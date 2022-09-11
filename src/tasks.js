import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getprofileid } from './users'
import { activityrecord } from './pomodoros'

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
        rescheduled: Int
    }
`

export const typeDefs = `
    extend type Query {
        tasks(starttime: String, endtime: String, scheduled: Boolean, complete: Boolean, today: String, goal: String, list: String) : [Task]
    }
    
    extend type Mutation {
        newTask(setdate: String, starttime: String, endtime: String, title: String, description: String, goal: String, complete: Boolean, schedule: Boolean) : String
        editTask(taskid: String!, starttime: String, endtime: String, title: String, description: String, setdate: String, goal: String, complete: Boolean, schedule: Boolean, reschedule: Boolean) : Boolean
        deleteTask(taskid: String!) : Boolean
        listTask(taskid: String!) : Boolean
        unlistTask(taskid: String!) : Boolean
        scheduleTask(taskid: String!, setdate: String) : Boolean
        checkTask(taskid: String!, checked: Boolean) : Boolean
        removeTaskGoal(taskid: String!): Boolean
        updateDayTaskOrder(tasks: [String]): Boolean
        updateGoalTaskOrder(tasks: [String]): Boolean
        updateTaskListOrder(tasks: [String]): Boolean
    }
`

export const resolvers = {
    Query: {
        tasks: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            if (args.goal) { //return list of unscheduled/unfinished tasks
                return await Tasks.find(
                    {
                        profile: getprofileid(req.session),
                        goal: args.goal,
                    }
                ).sort({goalorder: 1}).toArray()
            }

            if (args.scheduled && args.list === 'day') { //return list of unscheduled/unfinished tasks for scheduler
                const today = new Date(args.today)
                return await Tasks.find(
                    {
                        profile: getprofileid(req.session),
                        schedule: true,
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
                let query = new Object()
                query.profile = getprofileid(req.session)
                if(args.starttime || args.endtime){
                    const starttime = new Date(args.starttime)
                    const endtime = new Date(args.endtime) 
                    query.$and = [
                            {'starttime': {$gte: starttime}},
                            {'starttime': {$lt: endtime}}
                        ]
                }
                query.schedule = true //only return 'scheduled' tasks.
                if(!args.complete) query.$or = [ //only return if complete not equal to true (or doesn't exist)
                    {complete: null},
                    {complete: false},
                    {complete: {$exists: false}}]
                let sort = new Object()
                //sort.complete = 1
                if(args.list == 'day') sort.dayorder = 1 
                else sort.listorder = 1

                return await Tasks.find(query)
                .sort(sort).toArray()
            }
        }
    },
    Task: {
        goal: async({ goal }) => {
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            return await Goals.findOne({ _id: ObjectId(goal) })
        }
    },
    Mutation: {
        newTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            var task = new Object(args)
            task.starttime = args.starttime ? new Date(args.starttime) : (args.setdate ? new Date(args.setdate) : null)
            task.created = new Date()
            if (args.endtime) {
                task.endtime = new Date(args.endtime),
                task.daytask = false
            }
            else {
                task.daytask = true
                task.endtime = null
            }
            task.profile = getprofileid(req.session)

            return (await Tasks.insertOne(task)).insertedId.toString()
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
            if(args.setdate || args.starttime) 
                {updates.starttime = args.starttime ? new Date(args.starttime) : new Date(args.setdate)} 
            /* else 
                updates.starttime = null */
            if(args.title) updates.title = args.title
            if(args.complete !== null) updates.complete = args.complete
            if(args.description) updates.description = args.description
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
                {$set: {schedule: true}}
            )).result.ok === 1
        },
        unlistTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            return (await Tasks.updateOne(
                {_id: ObjectId(args.taskid)},
                {
                    $unset: { starttime: null, schedule: null },
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
            
            if(args.setdate) {
                updates.$set = {
                    starttime: args.starttime ? new Date(args.starttime) : new Date(args.setdate),
                    daytask: true,
                    schedule: true,
                    endtime: null
                }
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
        }
    }
}

export async function checkTask(args, req){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    var updatetask = new Object()

    if(args.checked) {
        args.task = args.taskid
        activityrecord(args, req, '✔')
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