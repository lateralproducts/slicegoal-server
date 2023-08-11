import { ObjectId } from 'mongodb' 
import { getprofileid, getuserid } from './users'
import DbConnection from './database'
import { getuiversion } from '../util/functions'
import { checkTask, createRepeatTask } from './tasks'
import { triggererror } from './graphqlserver';
let pjson = require('../package.json')

export const typeDefs = `
    extend type Query {
        readPomoData(area: String): PomodoroData
        readGoalPomoData(goal: String): PomodoroData
        goalpomodoros(goalId: String): [Pomodoro]
        taskpomodoros(taskId: String): [Pomodoro]
        daypomodoros(date: String): [Pomodoro]
    }

    extend type Mutation {
        savePomodoro(notes: String, taskid: String, datetime: String, minutes: Int, checked: Boolean, repeat: Boolean): Boolean!
    }
`

export const schema = `
    type Pomodoro {
        _id: String
        area: String
        links: String
        goal: String
        task: Task
        notes: String
        datetime: String
        minutes: Int
        date: String
        checked: Boolean
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
        goalpomodoros: async(_, { goalId }, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            return await Pomodoros.find(
                {
                    goal: goalId,
                    profileid: getprofileid(req.session) //need to update DB and mutations/queries to use profileid.
                },
                { sort: { date: -1 } },
            ).toArray()
        },
        taskpomodoros: async(_, { taskId }, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const TaskLinks = db.collection('tasklinks')

            let taskids = await TaskLinks.find({parenttask: taskId}).toArray()
            taskids.push(taskId) //add parent taskid.

            const Pomodoros = db.collection('pomodoros') 
            return await Pomodoros.find(
                {
                    task: { $in: taskids },
                    profileid: getprofileid(req.session) //need to update DB and mutations/queries to use profileid.
                },
                { sort: { date: -1 } },
            ).toArray()
        },
        daypomodoros: async(_, {date}, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')

            let query = new Object()
            query.profileid = getprofileid(req.session) //need to update DB and mutations/queries to use profileid.

            var start = new Date(date)
            var end = new Date(date)
            end.setDate(start.getDate() + 1)

            query.$and = [
                    {'date': {$gte: start}},
                    {'date': {$lt: end}}
                ]

            return await Pomodoros.find(query).sort({date: -1}).toArray()
        },
        readPomoData: async(_, { area }, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            const data = await Pomodoros.aggregate(
                [{
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
                }]
            )
            if (data[0]) return data[0] 
            else return 0
        },
        readGoalPomoData: async(_, { goal }, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            const data = await Pomodoros.aggregate(
                [{
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
                }]
            )   
            if (data[0]) return data[0] 
            else return 0
        }
    },
    Pomodoro: {
        task: async(parent) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            return await Tasks.findOne({_id: new ObjectId(parent.task)})
        }
    },
    Mutation: {
        savePomodoro: async(root, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            if(args.checked && args.taskid){ //Only mark as done if a taskid is sent. Not marking Goals as done.
                const checkresult = await checkTask(args, req)
                if (checkresult === 0) return triggererror('Not all sub tasks marked as complete.') 
            }
            activityrecord({goalid: args.goal, taskid: args.taskid, checked: args.checked, minutes: args.minutes, req: req, notes: args.notes})
            if (args.repeat) createRepeatTask(args.taskid, req)
            return true
        }
    },
    
}

export async function activityrecord({templateid, taskid, goalid, notes, checked, minutes, req, datetime}) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const Pomodoros = db.collection('pomodoros')

    let record = new Object()
    
    if(taskid){ 
        record.task = taskid //this is masking the problem that I don't have a universally defined variable for "taskid"
        const Task = await Tasks.findOne({ _id: new ObjectId(taskid)})
        if (Task) {
            record.goal = Task.goal //add a goal if attached.
            record.templateid = Task.templateid //add a goal if attached.
        }
    }
    if(goalid) record.goal = goalid
    if(templateid) record.templateid = templateid

    record.userid = getuserid(req.session)
    record.profileid = getprofileid(req.session)
    record.serverversion = pjson.version
    record.uiversion = getuiversion(req.session)
    record.notes = notes
    record.checked = checked
    record.minutes = minutes

    if(datetime) record.date = new Date(datetime)
    else record.date = new Date()

    await Pomodoros.insertOne(record)
}