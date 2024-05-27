import { ObjectId } from 'mongodb' 
import { getprofileid, getuserid } from './users'
import DbConnection from './database'
import { dayofyear, getEndDateFromWeek, getStartDateFromWeek, getWeekNumber, getWeekYear} from '../util/functions'
import { checkTask, createRepeatTask } from './tasks'
import { triggererror } from './graphqlserver';
import { getareatree } from './areas'
//let pjson = require('../package.json')

export const typeDefs = `
    extend type Query {
        readAreaPomoData(area: String): PomodoroData
        readGoalPomoData(goal: String): PomodoroData
        readDayPomoData(day: String): PomodoroData
        goalpomodoros(goalId: String): [Pomodoro]
        taskpomodoros(taskId: String): [Pomodoro]
        daypomodoros(date: String): [Pomodoro]
        weeklystats(week: Int, year: Int): Aggregates
    }

    extend type Mutation {
        savePomodoro(notes: String, taskid: String, datetime: String, minutes: Int, checked: Boolean, alreadydone: Boolean, repeat: Boolean): Boolean!
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

    type Aggregates {
        _id: String
        year: String
        week: String
        startday: String
        endday: String 
        logtime: Int
        goaltime: Int
        goalattached: Int
        logcount: Int
        taskcreated: Int
        alreadydone: Int
        taskcopied: Int
        taskcompleted: Int
        taskreopened: Int
        tasksnoozed: Int
        taskpriorityadded: Int
        messagetotal: Int
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
            const starttime = startOfDayTZ({datetime, timezoneOffset: -11})
            const endtime = endOfDayTZ({datetime, timezoneOffset: -11})  */

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
        },
        weeklystats: async(_, { year, week }, { req }) => {
            const db = await DbConnection.Get()
            const AggWeek = db.collection('aggweek')
            let today = new Date()

            week = week ? week : getWeekNumber(today) //if no year and week supplied, use today's date as reference.
            year = year ? year : getWeekYear(today)
        
            let weeklydata = new Object()           
            weeklydata = (await AggWeek.findOne({
                week: week,
                year: year,
                userid: getuserid(req.session)
            })) || {
                year: year,   
                week: week
            }

            weeklydata.startday = getStartDateFromWeek(week, year)
            weeklydata.endday = getEndDateFromWeek(week, year)

            return weeklydata
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
            if (args.alreadydone) args.checked = true //if labeled as "already done", then check the completed boolean
            activityrecord({taskid: args.taskid, alreadydone: args.alreadydone, checked: args.checked, minutes: args.minutes, req: req, notes: args.notes, datetime: args.datetime ? args.datetime : null})
            if((args.checked) && args.taskid){ //Only mark as done if a taskid is sent. Not marking Goals as done.
                const checkresult = await checkTask(args, req)
                if (checkresult === 0) return triggererror('Not all sub tasks marked as complete.') 
            }

            //copy the task as new if repeat task selected.
            if (args.repeat){ 
                createRepeatTask(args.taskid, req)
                activityrecord({taskid: args.taskid, req: req, notes: 'This task copied as a repeat task.', copied: true})
            }
            return true
        }
    },
    
}

export async function activityrecord({
    templateid, 
    taskid, 
    goalid, 
    notes, 
    minutes, 
    req, 
    datetime, 
    checked,
    rescheduled, 
    //unscheduled, //this is the same behaviour as adding to priority list
    reopened, 
    created, 
    priorityremoved, 
    priorityadded,
    snoozed, 
    copied,
    alreadydone
}) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const Pomodoros = db.collection('pomodoros')

    let record = new Object()
    
    if(taskid){ 
        record.task = taskid //this is masking the problem that I don't have a universally defined variable for "taskid"
        const Task = await Tasks.findOne({ _id: new ObjectId(taskid)})
        if (Task) {
            if (Task.goal) record.goal = Task.goal //add a goal if attached.
            if (Task.templateid) record.templateid = Task.templateid //add a goal if attached.
            if (Task.tags) record.tags = Task.tags
        }
    }
    if(goalid) record.goal = goalid
    if(templateid) record.templateid = templateid

    record.userid = getuserid(req.session)
    record.profileid = getprofileid(req.session)
/*     record.serverversion = pjson.version
    record.uiversion = getuiversion(req.session) */
    record.notes = (notes ? (notes + ' ') : "") + (checked === true ? "Closed." : "")
    record.created = new Date()
    if(datetime) record.date = new Date(datetime) //time set from client argument
    else record.date = new Date()

    if (minutes) record.minutes = minutes
    if (checked) record.checked = checked
    if (rescheduled) record.rescheduled = rescheduled
    if (reopened) record.reopened = reopened
    if (created) record.created = created
    if (priorityremoved) record.priorityremoved = priorityremoved
    if (priorityadded) record.priorityadded = priorityadded
    if (snoozed) record.snoozed = snoozed
    if (copied) record.copied = copied
    if (alreadydone) record.alreadydone = alreadydone
    //if (unscheduled) record.unscheduled = unscheduled //removed


    const pomoid = (await Pomodoros.insertOne(record)).insertedId.toString()

    //save all the aggregate data and history
    let tasklist = []
    if (record.task) tasklist = await 
    taskaggregate({
        taskid: record.task, 
        minutes, 
        pomoid
    })
    
    goalaggregate({
        goalid: record.goal, 
        minutes, 
        pomoid, 
        tasklist
    })

    areaaggregate({
        datetime: datetime,
        tags: record.tags, 
        minutes, 
        pomoid, 
        req, 
        completed: checked === true ? 1 : 0, 
        rescheduled, 
        tasklist, 
        reopened, 
        created,
        priorityremoved, 
        priorityadded,
        snoozed, 
        copied,
        goalid: record.goal, 
        alreadydone
    })

}

export async function taskaggregate({taskid, minutes, pomoid}) {
    //future development: check/aggregate parent tasks.
    if (!taskid || !pomoid) { //must have all fields
        console.log('taskaggregate error - missing fields')
        console.log('taskid: ' + taskid)
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
            $inc: {time: minutes ? minutes : 0},
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

export async function areaaggregate({
    datetime,
    tags, 
    minutes = 0, 
    created, 
    completed, 
    rescheduled, 
    snoozed, 
    pomoid, 
    req, 
    tasklist,
    reopened,
    priorityremoved, 
    priorityadded,
    copied,
    goalid,
    alreadydone
}) {
    //future development: check/aggregate parent tasks.
    if ((!tags && !tasklist) || !pomoid) { //must have all fields
        console.log('areaaggregate error - missing fields')
        console.log('tags: ' + tags)
        console.log('pomoid: ' + pomoid)
        return
    }
    let areatree = await getareatree({tags: tags, tasklist, req})
    const db = await DbConnection.Get()

    let increment = new Object()

    if(minutes) {
        increment.logtime = minutes
        increment.logcount = 1 //only count if there is a pomodoro with minutes
        if(goalid) increment.goaltime = minutes
    }
    if(created) increment.taskcreated = 1
    if(completed) {
        increment.taskcompleted = 1
        if(goalid) increment.taskcompletedgoal = 1
    }
    if(rescheduled) increment.taskrescheduled = 1
    if(snoozed) increment.tasksnoozed = 1
    if(reopened) increment.taskreopened = 1
    if(priorityremoved) increment.taskpriorityremove = 1 
    if(priorityadded) increment.taskpriorityadded = 1
    if(copied) increment.taskcopied = 1
    if(goalid) increment.goalattached = 1
    if(alreadydone) increment.alreadydone = 1

    if (areatree.length > 0){
        const Areas = db.collection('areas')
        
        Areas.updateMany(
            {_id: {
                $in: areatree.map(function(id) {
                    return new ObjectId(id)
                })
            }},
            {
                $inc: increment,
                $push: {history: pomoid} //this might be too much info. Could remove this.
            }
    )} else {
        areatree = ['none']
    }
    //Update time aggregates: Year, Month, Week, Day.
    //Need to adjust for timezone on profile. Do this later.d
    //America/Los_Angeles, Australia/Melbourne, Pacific/Honolulu
    if (!datetime) datetime = new Date(new Date().toLocaleString("en-US", {timeZone: "Australia/Melbourne"}))
    else datetime = new Date(new Date(datetime).toLocaleString("en-US", {timeZone: "Australia/Melbourne"}))
    const year = datetime.getFullYear()
    const month = datetime.getMonth() + 1
    const yearday = dayofyear(datetime)
    const week = getWeekNumber(datetime)
    const weekyear = getWeekYear(datetime) //different at start of year sometimes.
    const day = datetime.getDate()

    const WeekAggregate = db.collection('aggweek')

    WeekAggregate.updateOne(
        {
            year: weekyear,
            week: week,
            userid: getuserid(req.session)
        },
        {
            $inc: increment
        },
        {upsert: true}
    )
    
    const AggYear = db.collection('aggareayear')
    const AggMonth = db.collection('aggareamonth')
    const AggWeek = db.collection('aggareaweek')
    const AggDay= db.collection('aggareaday')

    areatree.map(function(id) {
        const objectid = (id === 'none') ? 'none' : new ObjectId(id)
        AggYear.updateOne(
            {
                area: objectid,
                year: year
            },
            {
                $inc: increment
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
                $inc: increment
            },
            {upsert: true}
        )

        AggWeek.updateOne(
            {
                area: objectid,
                year: weekyear,
                week: week
            },
            {
                $inc: increment
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
                $inc: increment
            },
            {upsert: true}
        )
    })
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

