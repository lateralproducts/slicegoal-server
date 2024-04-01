import { ObjectId } from 'mongodb' 
import { getprofileid, getuserid } from './users'
import DbConnection from './database'
import { endOfDayTZ, dayofyear, getuiversion, startOfDayTZ } from '../util/functions'
import { checkTask, createRepeatTask } from './tasks'
import { triggererror } from './graphqlserver';
import { getareatree } from './areas'
let pjson = require('../package.json')

export const typeDefs = `
    extend type Query {
        readAreaPomoData(area: String): PomodoroData
        readGoalPomoData(goal: String): PomodoroData
        readDayPomoData(day: String): PomodoroData
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
        tasks: Int
    }
`

export const resolvers = {
    Query: {
        goalpomodoros: async(_, { goalId }, { req }) => {
            
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
            
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            //const task = await Tasks.findOne({_id: new ObjectId(taskId)})

            let taskids = []
            //if (task.subtasks) taskids = task.subtasks
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
            
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')

            let query = new Object()
            query.profileid = getprofileid(req.session) //need to update DB and mutations/queries to use profileid.

            var start = new Date(date) //time set from client argument
            var end = new Date(date) //time set from client argument
            end.setDate(start.getDate() + 1)

            query.$and = [
                    {'date': {$gte: start}},
                    {'date': {$lt: end}}
                ]

            return await Pomodoros.find(query).sort({date: -1}).toArray()
        },
        readAreaPomoData: async(_, { area }, { req }) => {
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            const aggCursor = await Pomodoros.aggregate(
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
            var result
            await aggCursor.forEach(doc => {
                result = doc
            })
            return result !== undefined ? result : null
        },
        readGoalPomoData: async(_, { goal }, { req }) => {
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            const aggCursor = await Pomodoros.aggregate(
                [{
                    $match: {
                        $or: [
                            {goal: goal}
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
            var result
            await aggCursor.forEach(doc => {
                result = doc
            })
            return result
        },
        readDayPomoData: async(_, { day }, { req }) => {
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            /* const datetime = new Date(day) //time set from client argument
            const starttime = startOfDayTZ({datetime, timezoneOffset: 11})
            const endtime = endOfDayTZ({datetime, timezoneOffset: 11})  */

            var starttime = new Date(day) //time set from client argument
            var endtime = new Date(day) //time set from client argument
            endtime.setDate(starttime.getDate() + 1)

            const aggCursor = await Pomodoros.aggregate(
                [{
                    $match: {
                        $and:[
                            {'date': {$gte: starttime}},
                            {'date': {$lt: endtime}}
                        ],
                        profileid: getprofileid(req.session)
                    }
                },
                {
                    $group: {
                        _id: null ,
                        count: { $sum: '$minutes' },
                        records: { $sum: 1 },
                        tasks: { $addToSet: "$task" } // Collecting distinct values of 'fieldname'
                    }
                },
                {
                    $project: {
                        count: 1,
                        records: 1,
                        tasks: { $size: "$tasks" } // Counting the number of distinct values
                    }
                }
            ]
            )   
            var result
            await aggCursor.forEach(doc => {
                result = doc
            })
            return result
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
            
            if(args.checked && args.taskid){ //Only mark as done if a taskid is sent. Not marking Goals as done.
                const checkresult = await checkTask(args, req)
                if (checkresult === 0) return triggererror('Not all sub tasks marked as complete.') 
            }
            activityrecord({taskid: args.taskid, checked: args.checked, minutes: args.minutes, req: req, notes: args.notes, datetime: args.datetime ? args.datetime : null})

            //copy the task as new if repeat task selected.
            if (args.repeat){ 
                createRepeatTask(args.taskid, req)
                activityrecord({taskid: args.taskid, req: req, notes: 'This task copied as a repeat task.'})
            }
            return true
        }
    },
    
}

export async function activityrecord({templateid, taskid, goalid, notes, checked, minutes, req, datetime, rescheduled}) {
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
            if (Task.tags) record.tags = Task.tags
        }
        
    }
    if(goalid) record.goal = goalid
    if(templateid) record.templateid = templateid

    record.userid = getuserid(req.session)
    record.profileid = getprofileid(req.session)
    record.serverversion = pjson.version
    record.uiversion = getuiversion(req.session)
    record.notes = (notes ? (notes + ' ') : "") + (checked === true ? "Closed." : "")
    record.checked = checked
    record.minutes = minutes

    if(datetime) record.date = new Date(datetime) //time set from client argument
    else record.date = new Date()

    const pomoid = (await Pomodoros.insertOne(record)).insertedId.toString()

    //save all the aggregate data and history
    let tasklist = []
    if (record.task) tasklist = await taskaggregate({taskid: record.task, minutes, pomoid})
    goalaggregate({goalid: record.goal, minutes, pomoid, tasklist})
    areaaggregate({tags: record.tags, minutes, pomoid, req, completed: checked === true ? 0 : 1, rescheduled: rescheduled ? 1 : 0, tasklist})

}

export async function taskaggregate({taskid, minutes, pomoid}) {
    //future development: check/aggregate parent tasks.
    if (!taskid || !minutes || !pomoid) { //must have all fields
        console.log('taskaggregate error - missing fields')
        console.log('taskid: ' + taskid)
        console.log('mins: ' + minutes)
        console.log('pomoid: ' + pomoid)
        return
    }
    const tasktree = await gettasktree(taskid)

    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    Tasks.updateMany(
        {_id: {
            $in: tasktree.map(function(id) {
                return new ObjectId(id)
            })
        }},
        {
            $inc: { time: minutes },
            $push: {history: pomoid}
        }
    )
    return tasktree
}

export async function goalaggregate({goalid, minutes, pomoid, tasklist}) {
    //future development: check/aggregate parent tasks.
    if ( !minutes || !pomoid || (!goalid && !tasklist)) { //must have all fields
        console.log('goalaggregate error - missing fields')
        console.log('goalid: ' + goalid)
        console.log('mins: ' + minutes)
        console.log('pomoid: ' + pomoid)
        return
    }
    const goaltree = await getgoaltree({goalid, tasklist})

    const db = await DbConnection.Get()
    const Goals = db.collection('goals')
    
    Goals.updateMany(
        {_id: {
            $in: goaltree.map(function(id) {
                return new ObjectId(id)
            })
        }},
        {
            $inc: { time: minutes },
            $push: {history: pomoid}
        }
    )
}

export async function areaaggregate({tags, minutes, created, completed, rescheduled, snoozed, pomoid, req, tasklist}) {
    //future development: check/aggregate parent tasks.
    if ((!tags && !tasklist) || !minutes || !pomoid) { //must have all fields
        console.log('areaaggregate error - missing fields')
        console.log('tags: ' + tags)
        console.log('mins: ' + minutes)
        console.log('pomoid: ' + pomoid)
        return
    }
    const areatree = await getareatree({tags: tags, tasklist, req})

    if (areatree){
    const db = await DbConnection.Get()
    const Areas = db.collection('areas')
    
    Areas.updateMany(
        {_id: {
            $in: areatree.map(function(id) {
                return new ObjectId(id)
            })
        }},
        {
            $inc: { 
                time: minutes ? minutes : 0
            },
            $push: {history: pomoid} //this might be too much info. Could remove this.
        }
    )
    //Update time aggregates: Year, Month, Week, Day.
    //Need to adjust for timezone on profile. Do this later.d
    //America/Los_Angeles, Australia/Melbourne, Pacific/Honolulu

    let datetime = new Date(new Date().toLocaleString("en-US", {timeZone: "Australia/Melbourne"}))
    const year = datetime.getFullYear()
    const month = datetime.getMonth() + 1
    const yearday = dayofyear(datetime)
    const week = ((yearday / 7) | 0) + 1 
    const day = datetime.getDate()

    const AggYear = db.collection('aggareayear')
    const AggMonth = db.collection('aggareamonth')
    const AggWeek = db.collection('aggareaweek')
    const AggDay= db.collection('aggareaday')

    areatree.map(function(id) {
        const objectid = new ObjectId(id)
        AggYear.updateOne(
            {
                area: objectid,
                year: year
            },
            {
                $inc: { 
                    time: minutes ? minutes : 0, 
                    created: created ? 1 : 0,
                    completed: completed ? 1 : 0,
                    rescheduled: rescheduled ? 1 : 0,
                    snoozed: snoozed ? 1 : 0,
                    count: minutes ? 1 : 0 //only count if there is a pomodoro with minutes
                }
            },
            {upsert: true}
        )

        AggMonth.updateOne(
            {
                area: objectid,
                year: year,
                month: month
            },
            {
                $inc: { 
                    time: minutes ? minutes : 0,  
                    created: created ? 1 : 0,
                    completed: completed ? 1 : 0,
                    rescheduled: rescheduled ? 1 : 0,
                    snoozed: snoozed ? 1 : 0,
                    count: minutes ? 1 : 0 //only count if there is a pomodoro with minutes
                }
            },
            {upsert: true}
        )

        AggWeek.updateOne(
            {
                area: objectid,
                year: year,
                week: week
            },
            {
                $inc: { 
                    time: minutes ? minutes : 0,  
                    created: created ? 1 : 0,
                    completed: completed ? 1 : 0,
                    rescheduled: rescheduled ? 1 : 0,
                    snoozed: snoozed ? 1 : 0,
                    count: minutes ? 1 : 0 //only count if there is a pomodoro with minutes
                }
            },
            {upsert: true}
        )

        AggDay.updateOne(
            {
                area: objectid,
                year: year,
                month: month,
                week: week,
                dayofyear: yearday,
                day: day
            },
            {
                $inc: { 
                    time: minutes ? minutes : 0, 
                    created: created ? 1 : 0,
                    completed: completed ? 1 : 0,
                    rescheduled: rescheduled ? 1 : 0,
                    snoozed: snoozed ? 1 : 0,
                    count: minutes ? 1 : 0 //only count if there is a pomodoro with minutes
                }
            },
            {upsert: true}
        )
    })}
}

async function getgoaltree({goalid, tasklist}) {
    const db = await DbConnection.Get()
    const GoalLinks = db.collection('goallinks')
    const Tasks = db.collection('tasks')

    let goaltree = [goalid]
    let newgoals = []
    let checkgoals = [goalid]

    const tasks = await Tasks.find(
        {_id: {
            $in: tasklist.map(taskid => new ObjectId(taskid))
        }}
    ).toArray()

    if (tasks) {
        goaltree = tasks.map(task => {if (task.goal) return task.goal})
        checkgoals = goaltree
    }
    
    while (checkgoals.length > 0) {
        //find all parent goals linked to goals
        let addgoals = await GoalLinks.find(
            {goal: {
                $in: checkgoals
            }}
        ).toArray()

        let thesegoals = addgoals.map(
            link => link.rootgoal
        )
        //turn into set for more efficient processing (need to confirm)
        let goalset = new Set(goaltree); 
        newgoals = thesegoals.filter(item => !goalset.has(item));

        //add all new parent goals to the tree.
        goaltree = goaltree.concat(newgoals)
        //update checkgoals to new goals and loop
        checkgoals = newgoals
    }

    return goaltree
}

async function gettasktree(taskid) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')

    let tasktree = [taskid]
    let newtasks = []
    let checktasks = [taskid]
    
    while (checktasks.length > 0) {
        //find all parent tasks linked to tasks
        let addtasks = await Tasks.find(
            {subtasks: {
                $in: checktasks
            }}
        ).toArray()

        let thesetasks = addtasks.map(
            link => link._id.toString()
        )
        //turn into set for more efficient processing (need to confirm)
        let taskset = new Set(tasktree); 
        newtasks = thesetasks.filter(item => !taskset.has(item));

        //add all new parent tasks to the tree.
        tasktree = tasktree.concat(newtasks)
        //update checktasks to new tasks and loop
        checktasks = newtasks
    }

    return tasktree
}

