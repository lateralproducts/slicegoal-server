import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getprofileid } from './users'

export const schema = `
    type Task {
        _id: String
        date: String
        starttime: StoredTime
        endtime: StoredTime
        title: String
        description: String
    }

    input Time {
        hours: Int
        minutes: Int
    }

    type StoredTime {
        specified: Boolean
        time: String
    }
`

export const typeDefs = `
    extend type Query {
        tasks(date: String) : [Task]
    }
    
    extend type Mutation {
        newTask(date: String!, starttime: Time, endtime: Time, title: String!, description: String) : Boolean
        editTask(taskid: String!, date: String, starttime: Time, endtime: Time, title: String, description: String) : Boolean
        deleteTask(taskid: String!) : Boolean
    }
`

export const resolvers = {
    Query: {
        tasks: async(_, { date }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const dateobj = new Date(date)
            const prevmidnight = new Date(
                dateobj.getFullYear(),
                dateobj.getMonth(),
                dateobj.getDate()
            )

            const nextmidnight = new Date(prevmidnight)
            nextmidnight.setDate(nextmidnight.getDate() + 1)

            return await Tasks.find(
                {
                    profile: getprofileid(req.session),
                    $and: [
                        {'starttime.time': {$gte: prevmidnight}},
                        {'starttime.time': {$lt: nextmidnight}}
                   ]
                }
            )
            .sort({'starttime.specified': 1, 'starttime.time': 1})
            .toArray()
        }
    },
    Mutation: {
        newTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const setdate = new Date(args.date)
            const starttime = startTime(setdate, args.starttime)
            const endtime = endTime(setdate, args.endtime, starttime)

            return (await Tasks.insertOne({
                starttime: starttime,
                endtime: endtime,
                title: args.title,
                description: args.description,
                profile: getprofileid(req.session)
            })).result.ok === 1
        },
        editTask: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const setdate = new Date(args.date)
            const starttime = startTime(setdate, args.starttime)
            const endtime = endTime(setdate, args.endtime, starttime)

            var updates = new Object()
            updates.starttime = starttime
            updates.endtime = endtime
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

// specify the start time object - defaults to UTC 00:00 of date
function startTime(setdate, starttime) {
    
    const time =  new Date(
        setdate.getFullYear(), 
        setdate.getMonth(), 
        setdate.getDate(), 
        starttime.hours || 0, 
        starttime.minutes || 0
    )

    return {
        specified: starttime.hours ? true : false,
        time: time 
    }

}

// specify the end time - defaults to 24 hours after start 
function endTime(setdate, endtime, starttime) {
    const daylater = new Date(starttime.time)
    daylater.setDate(daylater.getDate() + 1)

    const time = endtime.hours ? new Date(
        setdate.getFullYear(), 
        setdate.getMonth(), 
        setdate.getDate(), 
        endtime.hours || 0, 
        endtime.minutes || 0
    ) : daylater

    return {
        specified: endtime.hours ? true : false,
        time: time
    }
}