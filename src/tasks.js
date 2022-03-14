import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getprofileid } from './users'

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
        tasks(starttime: String, endtime: String, scheduled: Boolean, complete: Boolean, today: String, goal: String) : [Task]
    }
    
    extend type Mutation {
        newTask(setdate: String, starttime: String, endtime: String, title: String, description: String, goal: String, complete: Boolean, schedule: Boolean) : String
        editTask(taskid: String!, starttime: String, endtime: String, title: String, description: String, setdate: String, goal: String, complete: Boolean, schedule: Boolean, reschedule: Boolean) : Boolean
        deleteTask(taskid: String!) : Boolean
        scheduleTask(taskid: String!, schedule: Boolean) : Boolean
        checkTask(taskid: String!, checked: Boolean) : Boolean
        removeTaskGoal(taskid: String!): Boolean
        updateDayTaskOrder(tasks: [String]): Boolean
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
                ).toArray()
            }

            if (args.scheduled) { //return list of unscheduled/unfinished tasks
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
                ).toArray()
            } else { //return list of tasks for the day.
                const starttime = new Date(args.starttime)
                const endtime = new Date(args.endtime)
                
                let query = new Object()
                query = { //find tasks scheduled for that day
                    $and: [
                        {'starttime': {$gte: starttime}},
                        {'starttime': {$lt: endtime}}
                    ]
                }
                query.profile = getprofileid(req.session)
                query.schedule = true
                if(!args.complete){
                    query.$or = [{complete: false}, {complete: null}]
                }

                return await Tasks.find(query)
                .sort({dayorder: 1}).toArray()
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
            else 
                updates.starttime = null
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
        scheduleTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            return (await Tasks.updateOne(
                {_id: ObjectId(args.taskid)},
                {$set: {schedule: args.schedule}}
            )).result.ok === 1
        },
        checkTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            return (await Tasks.updateOne(
                {_id: ObjectId(args.taskid)},
                {$set: {complete: args.checked}}
            )).result.ok === 1
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