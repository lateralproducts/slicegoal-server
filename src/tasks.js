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
    }
`

export const typeDefs = `
    extend type Query {
        tasks(starttime: String, endtime: String) : [Task]
    }
    
    extend type Mutation {
        newTask(starttime: String, endtime: String, title: String!, description: String) : Boolean
        editTask(taskid: String!, starttime: String, endtime: String, title: String, description: String) : Boolean
        deleteTask(taskid: String!) : Boolean
    }
`

export const resolvers = {
    Query: {
        tasks: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const starttime = new Date(args.starttime)
            const endtime = new Date(args.endtime)

            const tasks = await Tasks.find(
                {
                    profile: getprofileid(req.session),
                    $and: [
                        {'starttime': {$gte: starttime}},
                        {'starttime': {$lt: endtime}}
                   ]
                }
            )
            .sort({daytask: 1, starttime: 1}).toArray()
            return tasks
        }
    },
    Mutation: {
        newTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            var task = new Object(args)
            task.starttime = new Date(args.starttime)
            if (args.endtime) {task.endtime = new Date(args.endtime)}
            else task.daytask = true
            task.title = args.title
            task.description = args.description
            task.profile = getprofileid(req.session)

            return (await Tasks.insertOne(task)).result.ok === 1
        },
        editTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            var updates = new Object()
            updates.starttime = new Date(args.starttime)
            if (args.endtime) {updates.endtime = new Date(args.endtime)}
            else updates.daytask = true
            updates.title = args.title
            updates.description = args.description

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
        }
    }
}