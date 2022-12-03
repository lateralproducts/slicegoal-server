import { ObjectId } from 'mongodb'
import { getprofileid } from './users'
import DbConnection from './database'
import { getuiversion } from '../util/functions'
import { checkTask } from './tasks'
let pjson = require('../package.json')

export const typeDefs = `
    extend type Query {
        readPomoData(area: String): PomodoroData
        readGoalPomoData(goal: String): PomodoroData
        goalpomodoros(goalId: String): [Pomodoro]
        taskpomodoros(taskId: String): [Pomodoro]
    }

    extend type Mutation {
        savePomodoro(notes: String, taskid: String, datetime: String, minutes: Int, checked: Boolean): Boolean!
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
        taskpomodoros: async(_, { taskId }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            return await Pomodoros.find(
                {
                    task: taskId,
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
    Pomodoro: {
        task: async(parent) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            return await Tasks.findOne({_id: ObjectId(parent.task)})
        }
    },
    Mutation: {
        savePomodoro: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            activityrecord(args, req)
            if(args.checked && args.taskid) checkTask(args, req) //Only mark as done if a taskid is sent. Not marking Goals as done.
            return true
        }
    },
    
}

export async function activityrecord(args, req) {
    const db = await DbConnection.Get()
    
    if(args.taskid) args.task = args.taskid //this is masking the problem that I don't have a universally defined variable for "taskid"

    const Tasks = db.collection('tasks')
    const Task = await Tasks.findOne({ _id: ObjectId(args.task)})
    if (Task) args.goal = Task.goal //add a goal if attached.
    const Pomodoros = db.collection('pomodoros')
    args.userid = getprofileid(req.session)
    args.serverversion = pjson.version
    args.uiversion = getuiversion(req.session)
    if(args.datetime) args.date = new Date(args.datetime)
    else args.date = new Date()

    if(args._id) delete args._id //deleting _id, because was attempting to insert duplicate IDs.
    await Pomodoros.insertOne(args)
}