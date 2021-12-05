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
        schedule: Boolean
    }
`

export const typeDefs = `
    extend type Query {
        tasks(starttime: String, endtime: String, scheduled: Boolean, today: String, goal: String) : [Task]
    }
    
    extend type Mutation {
        newTask(starttime: String, endtime: String, title: String, description: String, goal: String, complete: Boolean, schedule: Boolean) : String
        editTask(taskid: String!, starttime: String, endtime: String, title: String, description: String, setdate: String, goal: String, complete: Boolean, schedule: Boolean) : Boolean
        deleteTask(taskid: String!) : Boolean
        scheduleTask(taskid: String!, schedule: Boolean) : Boolean
        checkTask(taskid: String!, checked: Boolean) : Boolean
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
            } else {
                const starttime = new Date(args.starttime)
                const endtime = new Date(args.endtime)
                //return list of tasks for the day.
                return await Tasks.find(
                    {
                        profile: getprofileid(req.session),
                        schedule: true,
                        $and: [
                            {'starttime': {$gte: starttime}},
                            {'starttime': {$lt: endtime}}
                        ]
                    }
                )
                .sort({daytask: 1, starttime: 1}).toArray()
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
            task.starttime = args.starttime ? new Date(args.starttime) : null
            if (args.endtime) {
                task.endtime = new Date(args.endtime),
                task.daytask = false
            }
            else {
                task.daytask = true
                task.endtime = null
            }
            task.schedule = args.schedule
            task.title = args.title
            task.description = args.description
            task.profile = getprofileid(req.session)

            return (await Tasks.insertOne(task)).insertedId.toString()
        },
        editTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            var updates = new Object()
            updates.starttime = args.starttime ? new Date(args.starttime) : null
            if(args.setdate && !args.starttime) updates.starttime = new Date(args.setdate)
            if (args.endtime) {
                updates.endtime = new Date(args.endtime),
                updates.daytask = false
            }
            else {
                updates.daytask = true
                updates.endtime = null
            }
            if(args.title) updates.title = args.title
            if(args.complete !== null) updates.complete = args.complete
            if(args.description) updates.description = args.description

            return (await Tasks.updateOne(
                {_id: ObjectId(args.taskid)},
                {$set: updates}
            )).result.ok === 1
        },
        deleteTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            return (await Tasks.deleteOne({_id: ObjectId(args.taskid)})).result.ok === 1
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
        }
    }
}