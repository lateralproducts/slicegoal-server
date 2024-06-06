import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';

import DbConnection from './database'
import { getprofileid } from './users'
import { activityrecord } from './pomodoros';
import { date2str, startOfDay, daylater, startOfDayTZ, endOfDayTZ } from '../util/functions';
//import { activityrecord } from './pomodoros'

export const schema = `
    type Task {
        _id: String
        date: String
        starttime: String
        title: String
        description: String
        goal: Goal
        complete: Boolean
        completed: String
        schedule: Boolean
        rescheduled: Int
        tasks: [Task]
        parenttask: Task
        tags: [Area]
        time: Int
        snooze: String
        listorder: Int
        dayorder: Int
        goalorder: Int
        dayglow: Boolean
        listglow: Boolean
        goalglow: Boolean
    }
    type TaskTag {
        _id: String
        taskid: String
        areaid: String
        area: Area
        task: Task
    }
`

export const typeDefs = `
    extend type Query {
        tasks(date: String, scheduled: Boolean, complete: Boolean, today: String, goal: String, list: String, filter: String): [Task]
        task(taskid: String!): Task
        searchTasks(search: String, past: Boolean): [Task]
        pastTasks(date: String!, filter: String): [Task]
        taskInsights(taskid: String!): [Insight]
        taskDayListTags(day: String): [Area]
        taskPriorityList(filter: String): [Task]
        taskPriorityListTags(filter: String): [Area]
    }
    
    extend type Mutation {
        newTask(date: String, title: String, description: String, insightid: String, goal: String, parenttask: String, complete: Boolean, schedule: Boolean, tags: [String]): String        
        editTask(taskid: String!, date: String, title: String, description: String, date: String, goal: String, parenttask: String, complete: Boolean, schedule: Boolean, reschedule: Boolean, tags: [String]): Boolean
        deleteTask(taskid: String!): Boolean

        listTask(taskid: String!): Boolean
        unlistTask(taskid: String!): Boolean
        
        scheduleTask(taskid: String!, date: String, reschedule: Boolean): Boolean
        scheduleTasks(date: String, taskids: [String!]): Boolean
        snoozeTask(taskid: String!, snooze: String!): Boolean
        unlistTasks(taskids: [String!]): Boolean
        
        checkTask(taskid: String!, checked: Boolean): Boolean
        setTaskGoal(taskid: String!, goalid: String!): Boolean
        setSelectedTasksGoal(goalid: String!, taskids: [String!]): Boolean
        removeTaskGoal(taskid: String!): Boolean
        
        updateDayTaskOrder(tasks: [String]): Boolean
        updateGoalTaskOrder(tasks: [String]): Boolean
        updateTaskListOrder(tasks: [String]): Boolean

        newSubTask(taskid: String!, task: String!): Boolean
        updateSubTaskListOrder(task: String, subtasks: [String]): Boolean

        linkTask(parenttaskid: String!, subtaskid: String!): Boolean
        linkSelectedTasks(parenttaskid: String, newparenttask: String, taskids: [String!]): Boolean
        linkInsightToTask(taskid: String!, insightid: String!): Boolean
        linkSourceToTask(taskid: String!, sourceid: String!): Boolean
        unlinkInsightToTask(taskid: String!, insightid: String!): Boolean
        unlinkSourceToTask(taskid: String!, sourceid: String!): Boolean

        unglowTask(taskid: String!, listtype: String!): Boolean
    }
`

export const resolvers = {
    //need to clean up starttime
    Query: {
        tasks: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            let query = new Object()

            const datetime = new Date(args.date) //time set from client argument
            const starttime = startOfDay(datetime)
            const endtime = daylater(datetime) // can retire this later if I want to migrate old DB records.

            const starttimeTZ = startOfDayTZ({datetime, timezoneOffset: -11}) //setting to offset Melbourne TZ +11
            const endtimeTZ = endOfDayTZ({datetime, timezoneOffset: -11}) //setting to offset Melbourne TZ +11
            /* console.log(datetime)
            console.log(starttimeTZ)
            console.log(endtimeTZ) */

            if(args.filter) {
                query.tags = args.filter
            }

            if(!args.complete) {
                query.$or = [ //only return if complete not equal to true (or doesn't exist)
                    {complete: null},
                    {complete: false},
                    {complete: {$exists: false}}
                ]
                if(args.date){
                    query.$and = [
                            {'starttime': {$gte: starttime}},
                            {'starttime': {$lt: endtime}},
                            {$or: [
                                {snooze: null},
                                {snooze: {$exists: false}},
                                {snooze: {$lt: new Date()}}
                            ]}
                        ]
                }
            }
            else {
                query.complete = true
                if (!args.goal) query.$or = [ //only check day if day query, not goal.
                    {$and: [
                        {'completed': {$gte: starttimeTZ}},
                        {'completed': {$lt: endtimeTZ}}
                    ]},
                    {$and: [ //if no completed date, use the start time. Phase this out.
                    //if I want to phase this out. Migrate the DB.
                        {'completed': {$exists: false}},
                        {'starttime': {$gte: starttimeTZ}},
                        {'starttime': {$lt: endtimeTZ}}
                    ]}
                ]
            }

            if (args.goal) { //return list of unscheduled/unfinished tasks
                query.profile = getprofileid(req.session)
                query.goal = args.goal
                return await Tasks.find(query).sort({goalorder: 1}).toArray()
            }

            if (args.scheduled && args.list === 'day') { //return list of unscheduled/unfinished tasks for scheduler
                const today = new Date(args.today) //time set from client argument
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
                    query.type = {$ne: 'subtask'}
                }
                
                query.profile = getprofileid(req.session)
                
                let sort = new Object()
                if (args.complete) sort.completed = -1
                else {
                    if(args.list == 'day') sort.dayorder = 1 
                    else sort.listorder = 1
                }

                return await Tasks.find(query)
                .sort(sort).toArray()
            }
        },
        task: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const task = await Tasks.findOne(
                {
                    profile: getprofileid(req.session),
                    _id: new ObjectId(args.taskid)
                }
            )
            return task
        },
        searchTasks: async(_, {search, past}, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const today = startOfDay(new Date())
            if(past) return await Tasks.find({profile: getprofileid(req.session), starttime: {$lt: today}, $or: [{complete: {$exists: false}}, {complete: {$eq: null}}, {complete: false}]}).sort({starttime: 1}).toArray()
            return await Tasks.find({profile: getprofileid(req.session), title: new RegExp(search, 'i')}).sort({created: -1}).toArray()
        },
        taskPriorityList: async(_, {filter}, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const daytime = new Date() //time set from client argument
            const today = startOfDay(daytime)
            let query = {
                profile: getprofileid(req.session),
                type: {$ne: 'subtask'},
                $and: [
                    {$or: [
                        {complete: null},
                        {complete: false},
                        {complete: {$exists: false}}
                    ]},
                    {$or: [
                        {starttime: null},
                        {starttime: {$exists: false}},
                        {schedule: true}
                    ]},
                    {$or: [
                        {goal: {$eq: null}}, //no goal
                        {goal: {$exists: false}}, //no goal
                        {goal: {$ne: null}, schedule: true}, //is a goal and scheduled = true
                        {goal: {$ne: null}, starttime: {$lt: today}} //is a goal and scheduled in past.
                    ]}
                ]
            }

            if(filter) {
                query.tags = filter
            } 

            return await Tasks.find(query)
            .sort({listorder: 1}).toArray()
        },
        pastTasks: async(_, {date, filter}, { req }) => {
            
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const starttime = startOfDay(new Date(date)) //time set from client argument
            let query = {
                profile: getprofileid(req.session), 
                starttime: {$lt: starttime}, 
                $or: [
                    {complete: null},
                    {complete: false},
                    {complete: {$exists: false}}
                ]}

            if(filter) {
                query.tags = filter
            } 

            return await Tasks.find(query).sort({starttime: -1}).toArray()
        },
        taskInsights: async(_, {taskid}, { req }) => {
            
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const Insights = db.collection('insights')
            const task = await Tasks.findOne({profile: getprofileid(req.session), _id: new ObjectId(taskid)})

            if (task.insights) 
                return await Insights.find({
                    _id: {
                        $in: task.insights.map(insightid => {return new ObjectId(insightid)})
                    }
                }).toArray()
            else return []
        },
        taskDayListTags: async(_, {day}, { req }) => {
            //could replace the day task list query with this one.
            
            //return triggererror('Test Error')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const Areas = db.collection('areas')
            let query = new Object()

            const daytime = new Date(day) //time set from client argument
            const starttime = startOfDay(daytime)
            const endtime = daylater(daytime)
            
            query.$and = [
                {'starttime': {$gte: starttime}},
                {'starttime': {$lt: endtime}}
            ]

            query.$or = [ //only return if complete not equal to true (or doesn't exist)
                {complete: null},
                {complete: false},
                {complete: {$exists: false}},
            ]

            query.profile = getprofileid(req.session)
            
            const tasks = await Tasks.find(query).sort({dayorder: 1}).toArray() 

            let areas = []
            if(tasks.length > 1) {
                tasks.map(task => {
                    if(task.tags) areas.push(...task.tags)
                })
            }
            
            //only makes sense to filter if the task list is larger than 1

            if(areas.length > 0){
                areas = areas.map(area => new ObjectId(area))
                const tags = await Areas.find(
                    {_id: {$in: areas}}
                ).toArray()
                return tags
            }

            return []
        },
        taskPriorityListTags: async(_, {filter}, { req }) => {
            //could replace the day task list query with this one.
            
            //return triggererror('Test Error')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const Areas = db.collection('areas')
            const today = startOfDay(new Date()) //time set from client argument
            
            let query = {
                profile: getprofileid(req.session),
                type: {$ne: 'subtask'},
                $and: [
                    {$or: [
                        {complete: null},
                        {complete: false},
                        {complete: {$exists: false}}
                    ]},
                    {$or: [
                        {starttime: null},
                        {starttime: {$exists: false}},
                        {schedule: true}
                    ]},
                    {$or: [
                        {goal: {$eq: null}}, //no goal
                        {goal: {$exists: false}}, //no goal
                        {goal: {$ne: null}, schedule: true}, //is a goal and scheduled = true
                        {goal: {$ne: null}, starttime: {$lt: today}} //is a goal and scheduled in past.
                    ]}
                ]
            }

            if(filter) {
                query.tags = filter
            } 
            const tasks = await Tasks.find(query).toArray()

            let areas = []
            if(tasks.length > 1) tasks.map(task => {if(task.tags) areas.push(...task.tags)})
            //only makes sense to filter if the task list is larger than 1

            if(areas.length > 0){
                areas = areas.map(area => new ObjectId(area))
                const tags = await Areas.find(
                    {_id: {$in: areas}}
                ).toArray()
                return tags
            }

            return []
        }
    },
    Task: {
        goal: async({ goal }) => {
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            return await Goals.findOne({ _id: new ObjectId(goal) })
        },
        tags: async(task) => {
                try {
                    const db = await DbConnection.Get()
                    const Areas = db.collection('areas')
                    if(task.tags) return await Areas.find({_id: {$in: task.tags.map(sourceid => {return new ObjectId(sourceid)})}}).toArray()
                    else return []
                }
                 catch (error) {
                    return []
                }
        },
        tasks: async(parent, __, { req }) => {
            try {
                const db = await DbConnection.Get()
                const Tasks = db.collection('tasks')
                if(parent.subtasks){
                const subtasks = await Tasks.find({_id: {
                    $in: parent.subtasks.map(function(link) {
                        return new ObjectId(link)
                    })
                }}).toArray()

                //order the results based on the order of the array. Not sure this is the best approach, but it works.
                const orderedResult = parent.subtasks.map(subtaskId => {return subtasks.find(doc => doc._id.equals(new ObjectId(subtaskId)))})
                return orderedResult}
                else {return []}
            }
             catch (error) {
                console.log(error)
                return []
            }
        },
        parenttask: async(task, __, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            
            //return a single parent task for now.
            const taskid = task._id.toString()
            const parenttask = await Tasks.findOne({subtasks: taskid})
            if (parenttask){
                return parenttask
            } else return null
        }
    },
    TaskTag: {
        area: async parent => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return await Areas.findOne({ _id: new ObjectId(parent.area) })
        },
        task: async parent => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            return await Tasks.findOne({ _id: new ObjectId(parent.taskid) })
        }
    },
    Mutation: {
        newTask: async(_, args, { req }) => {
            //need to move business logic to server.
            
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            args.profileid = getprofileid(req.session)
            if (args.parenttask) args.type = 'subtask'
            else args.type = 'task'

            const taskid = await createNewTask(args)
            if (args.parenttask) {
                Tasks.updateOne({profileid: getprofileid(req.session), _id: new ObjectId(args.parenttask)}, {$push: {subtasks: taskid}})
            }
            activityrecord({taskid: taskid, notes: 'Task created.', req: req, created: true})
            if (args.insightid) linkInsightTask(taskid, args.insightid)
            return taskid
        },
        editTask: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            var updates = new Object()
            
            updates.daytask = true

            if (!args.goal && !args.date) {updates.schedule = true}
            else updates.schedule = false

            if(args.date) {updates.starttime = new Date(args.date)} //time set from client argument
            if(args.title) updates.title = args.title
            if(args.complete !== null) updates.complete = args.complete
            if(args.description !== null) updates.description = args.description
            if(args.goal) {
                updates.goal = args.goal
                updates.goalglow = true
            }
            else {updates.goal = null}
            if(args.tags) {updates.tags = args.tags}
            //would be better to check links before deleting and inserting. Separate into function.
            await Tasks.updateMany({subtasks: args.taskid}, {$pull: {subtasks: args.taskid}})
            if (args.parenttask) {
                Tasks.updateOne({profile: getprofileid(req.session), _id: new ObjectId(args.parenttask)}, {$push: {subtasks: args.taskid}})
                updates.type = 'subtask'
            } else {
                updates.type = 'task' //remove subtask type so task appears again.
            }

            var updatetask = new Object()
            updatetask.$set = updates
            if (args.reschedule){
                updatetask.$inc = { rescheduled: 1}
            }

            const result = await Tasks.updateOne(
                {_id: new ObjectId(args.taskid)},
                updatetask
            )
            return result.modifiedCount === 1
        },
        deleteTask: async(_, args, { req }) => {
            
            return await deleteTask(args.taskid, req)
        },
        listTask: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const result = await Tasks.updateOne(
                {_id: new ObjectId(args.taskid)},
                {
                    $set: {
                        schedule: true,
                        listglow: true
                    }, 
                    $unset: {
                        starttime: null,
                        listorder: null,
                        dayorder: null
                    }
                }
            )
            activityrecord({taskid: args.taskid, notes: 'Listed in priority list.', req: req, priorityadded: true})
            return result.modifiedCount === 1
        },
        unlistTask: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const result = await Tasks.updateOne(
                {_id: new ObjectId(args.taskid)},
                {
                    $unset: { 
                        schedule: null,
                        starttime: null,
                        listorder: null,
                        dayorder: null
                    },
                    $inc: { priorityremoved: 1}
                }
            )
            activityrecord({taskid: args.taskid, notes: 'Unlisted from priority list.', req: req, priorityremoved: true})
            return result.modifiedCount === 1
        },
        updateDayTaskOrder: async(parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            args.tasks.map(function(_id, count) {
                Tasks.updateOne(
                    { _id: new ObjectId(_id) },
                    { $set: { dayorder: count } },
                )
            })
            return true
        },
        updateGoalTaskOrder: async(parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            args.tasks.map(function(_id, count) {
                Tasks.updateOne(
                    { _id: new ObjectId(_id) },
                    { $set: { goalorder: count } },
                )
            })
            return true
        },
        updateTaskListOrder: async(parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            args.tasks.map(function(_id, count) {
                Tasks.updateOne(
                    { _id: new ObjectId(_id) },
                    { $set: { listorder: count } },
                )
            })
            return true
        },
        updateSubTaskListOrder: async(parent, {task, subtasks}, { req }) => {
            //update the main goal list order rank. persist in database.
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            Tasks.updateOne(
                { _id: new ObjectId(task) },
                { $set: { subtasks: subtasks} },
            )
            return true
        },
        scheduleTask: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            var updates = new Object()

            const task = await Tasks.findOne({ _id: new ObjectId(args.taskid) });
            if (task.date) {
                updates.$inc = { rescheduled: 1 };
            }
            
            if(args.date) {
                const date = new Date(args.date) //time set from client argument
                activityrecord({taskid: args.taskid, notes: 'Scheduled for ' + date2str(date,'dd-MM-yyyy'), req: req, reschedule: true})
                updates.$set = {
                    starttime: date,
                    daytask: true,
                    dayglow: true
                }
                updates.$unset = {
                    schedule: null,
                    listorder: null,
                    dayorder: null
                }
            } else {
                activityrecord({taskid: args.taskid, notes: 'Listed in priority list.', req: req, priorityadded: true})
                updates.$unset = { //unsetting, variables don't matter.
                    starttime: '',
                    listorder: null,
                    dayorder: null
                }
                updates.$set = {
                    schedule: true,
                    listglow: true
                }
            }

            const result = await Tasks.updateOne(
                {_id: new ObjectId(args.taskid)},
                updates
            )
            return result.modifiedCount === 1   
        },
        scheduleTasks: async(_, {date, taskids}, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            var updates = new Object()
            
            if(date) {
                const newdate = new Date(date) //time set from client argument
                //activityrecord({taskid: args.taskid, notes: 'Scheduled for ' + date2str(date,'dd-MM-yyyy'), req: req})
                updates.$set = {
                    starttime: newdate, //new Date(date)
                    daytask: true,
                    dayglow: true
                }
                updates.$inc = {rescheduled: 1}
                updates.$unset = {
                    schedule: null,
                    listorder: null,
                    dayorder: null
                }

                taskids.map(function(taskid) {
                    activityrecord({taskid: taskid, notes: 'Scheduled for ' + date2str(newdate,'dd-MM-yyyy'), req: req, reschedule: true})
                    Tasks.updateOne(
                        {_id: new ObjectId(taskid)},
                        updates
                    )
                })

            } else {
                updates.$unset = {starttime: ''}
                updates.$set = {schedule: true}
                taskids.map(function(taskid) {
                    activityrecord({taskid: taskid, notes: 'Listed in priority list.', req: req, priorityadded: true})
                    //unsetting, variables don't matter.
                    Tasks.updateOne(
                        {_id: new ObjectId(taskid)},
                        updates
                    )
                })
            } 
            
            return true 
        },
        unlistTasks: async(_, {taskids}, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            var updates = new Object()

            updates.$unset = { schedule: null, starttime: null }
            updates.$inc = { rescheduled: 1 }

            taskids.map(function(taskid) {
                activityrecord({taskid: taskid, notes: 'Unlisted.', req: req, priorityremoved: true})
                //unsetting, variables don't matter.
                Tasks.updateOne(
                    {_id: new ObjectId(taskid)},
                    updates
                )
            })
            return true
        },
        checkTask: async(_, args, { req }) => {
            const response = await checkTask(args, req)
            if (response === 0) return triggererror('Not all subtasks are marked as completed.')
            else return response
        },
        removeTaskGoal: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const result = await Tasks.updateOne(
                {_id: new ObjectId(args.taskid)},
                {$unset: {goal:''}}
            )
            return result.modifiedCount === 1
        },
        setTaskGoal: async(_, {taskid,goalid}, {req}) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const result = await Tasks.updateOne(
                {_id: new ObjectId(taskid)},
                {$set: {goal: goalid, goalglow: true}}
            )
            return result.modifiedCount === 1
        },
        setSelectedTasksGoal: async(_, {goalid, taskids}, {req}) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            taskids.map(function(subtaskid) {
                Tasks.updateOne(
                    {_id: new ObjectId(subtaskid)},
                    {$set: {goal: goalid, goalglow: true}}
                )
            })
            return 1
        },
        newSubTask: async(_, {taskid,task}, {req}) => {
            const db = await DbConnection.Get()
            const subtaskid = await createNewTask({title: task, profileid: getprofileid(req.session), type: 'subtask'})
            activityrecord({taskid: subtaskid, notes: 'Task created.', req: req, created: true})
            const Tasks = db.collection('tasks')
            
            if(taskid !== subtaskid){
                Tasks.updateOne({_id: new ObjectId(taskid)},{$push: {subtasks: subtaskid}})
                return true
            }else{
                return triggererror('Can\'t link task to the same task')
            }
        },
        linkTask: async(_, {parenttaskid,subtaskid}, {req}) => {
            
            return await linksubtask({parenttaskid, subtaskid, req})
        },
        linkSelectedTasks: async(_, {parenttaskid, newparenttask, taskids}, {req}) => {
            
            //this is lazy.
            var parentid 
            if (newparenttask) {
                parentid = await createNewTask({title: newparenttask, profileid: getprofileid(req.session)})
                activityrecord({taskid: parentid, notes: 'Task created.', req: req, created: true})
            } else {
                parentid = parenttaskid
            }
            
            taskids.map(function(subtaskid) {
                if(subtaskid !== parentid) linksubtask({parenttaskid: parentid, subtaskid, req})
                //else ignore
            })
            return true
        },
        //removeTaskLink(parenttaskid: String!, subtaskid: String!): Boolean
        /* removeTaskLink: async(_, {parenttaskid,subtaskid}, {req}) => {
            
            const db = await DbConnection.Get()
            const result = await TaskLinks.deleteMany({profileid: getprofileid(req.session), parenttask: parenttaskid, subtask: subtaskid})
            console.log(result)
            return true
        }, */
        //removeTaskParentLinks(subtaskid: String!): Boolean
        /* removeTaskParentLinks: async(_, {subtaskid}, {req}) => {
            
            const db = await DbConnection.Get()
            
            const result = await TaskLinks.deleteMany({profileid: getprofileid(req.session), subtask: subtaskid})
            console.log(result)
            return true
        }, */

        linkInsightToTask: async(_, {taskid,insightid}, {req}) => {
            return await linkInsightTask(taskid, insightid)
        },

        linkSourceToTask: async(_, {taskid,sourceid}, {req}) => {
            return await linkSourceTask(taskid, sourceid)
        },

        unlinkInsightToTask: async(_, {taskid,insightid}, {req}) => {
            return await unlinkInsightTask(taskid, insightid)
        },

        unlinkSourceToTask: async(_, {taskid,sourceid}, {req}) => {
            return await unlinkSourceTask(taskid, sourceid)
        },
        snoozeTask: async(root, {taskid, snooze}, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            //const profileid = getprofileid(req.session)
            let snoozedatetime = new Date(snooze) //time set from client argument
            //const snoozed = snoozedate.setHours(0, 0, 0, 0) //snooze till date (not time yet.)
            
            await Tasks.updateOne(
                { _id: new ObjectId(taskid) },
                { $set: { snooze: snoozedatetime }}
            )

            activityrecord({taskid: taskid, req: req, notes: 'Task snoozed to ' + date2str(snoozedatetime,'MM-dd-yyyy hh:mm'), snoozed: true})
            return true
        },
        unglowTask: async(root, {taskid, listtype}, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            let update = new Object()
            if(listtype === 'day') update.dayglow = null
            if(listtype === 'goal') update.goalglow = null
            if(listtype === 'priority') update.listglow = null
            await Tasks.updateOne(
                { _id: new ObjectId(taskid), profile: getprofileid(req.session) },
                { $unset: update}
            )
            return true
        },
    }
}

export async function linkInsightTask(taskid, insightid){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const result = await Tasks.updateOne(
        {_id: new ObjectId(taskid)},
        {$push: {insights: insightid}}
    )
    return result.modifiedCount === 1
}

export async function linkSourceTask(taskid, sourceid){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const result = await Tasks.updateOne(
        {_id: new ObjectId(taskid)},
        {$push: {sources: sourceid}}
    )
    return result.modifiedCount === 1
}

export async function unlinkInsightTask(taskid, insightid){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const result = await Tasks.updateOne(
        {_id: new ObjectId(taskid)},
        {$pull: {insights: insightid}}
    )
    return result.modifiedCount === 1
}

export async function unlinkSourceTask(taskid, sourceid){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const result = await Tasks.updateOne(
        {_id: new ObjectId(taskid)},
        {$pull: {sources: sourceid}}
    )
    return result.modifiedCount === 1
}

export async function createRepeatTask(taskid, req){
    //need to move business logic to server.
    
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')

    //get template to copy.
    let tasktorepeat = new Object()
    tasktorepeat = await Tasks.findOne( 
        {
            profile: getprofileid(req.session),
            _id: new ObjectId(taskid)
        }
    )
    delete tasktorepeat._id
    tasktorepeat.created = new Date()
    tasktorepeat.repeattaskid = taskid
    tasktorepeat.schedule = true
    delete tasktorepeat.complete
    delete tasktorepeat.completed
    delete tasktorepeat.starttime
    delete tasktorepeat.rescheduled
    delete tasktorepeat.subtasks

    //create new task from template and get id.
    const newtaskid = (await Tasks.insertOne(tasktorepeat)).insertedId.toString()
    activityrecord({taskid: newtaskid, notes: 'Task copied. Repeat task.', req: req, created: true})

    //get all task template links
    copySubTasksFromTask(taskid, newtaskid, req)
    return newtaskid
    //create and link all new sub tasks from templates
}

async function copySubTasksFromTask(taskid, newtaskid, req) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')

    //search for links to task template.
    const task = await Tasks.findOne({_id: new ObjectId(taskid)}) 

    //get subtask templates.
    if (task.subtasks) {
        let subtasks = await Tasks.find({
            profile: getprofileid(req.session), 
            _id: {
                $in: task.subtasks.map(function(link) {
                    return new ObjectId(link)
                })
            }
        }).toArray()

        //create all subtasks.
        let insertSubTasks = subtasks.map(task => {
            return {
                title: task.title,
                profile: task.profile,
                description: task.description,
                goal: task.goal,
                created: new Date(),
                type: "subtask",
                insights: task.insights,
                repeattaskid: task._id.toString() //record repeat task id for future reference.
            }
        })
        let newSubTasks = (await Tasks.insertMany(insertSubTasks)).insertedIds
        const subtaskIDs = Object.values(newSubTasks)
        //link all subtasks to the parent task.
        subtaskIDs.map(subtaskid => {
            //no activity records or history recorded against templates yet.
            linksubtask({parenttaskid: newtaskid, subtaskid: subtaskid.toString(), req: req})
        })
    }
}

async function deleteTask(taskid, req){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const task = await Tasks.find({_id: new ObjectId(taskid)})

    if (task.subtasks > 0) await task.subtasks.map(link => {
        return deleteTask(link, req) //delete all subtasks.
    })
    await Tasks.updateMany({subtasks: taskid}, {$pull: {subtasks: taskid}}) //delete all links.
    const result = await Tasks.deleteOne({_id: new ObjectId(taskid)}) //delete task.
    return result.deletedCount === 1
}

async function createNewTask({title, description, goal, complete, date, starttime, profileid, type, tags}) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')

    var task = new Object({title: title, description: description, complete: complete, tags: tags })
    task.starttime = starttime ? new Date(starttime) : (date ? new Date(date) : null) //time set from client argument
    task.created = new Date()

    if (!goal && !starttime && !date) {
        task.schedule = true
        task.listglow = true
    } else task.schedule = false

    if (goal) {
        task.goal = goal
        task.goalglow = true
    }
    
    task.daytask = true
    task.dayglow = true
    task.profile = profileid
    task.type = type

    return (await Tasks.insertOne(task)).insertedId.toString()
}

export async function checkTask(args, req){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')

    var updatetask = new Object()
    if(args.checked) {
        //check all subtasks to see if they're complete
        const task = await Tasks.findOne({_id: new ObjectId(args.taskid)}) 
        if (task.subtasks){          
            const subtaskids = task.subtasks.map(function(link) {
                return new ObjectId(link)
            })
            if (subtaskids.length > 0){
                const subtasks = await Tasks.find({_id: {
                    $in: subtaskids
                }}).toArray()
                const incomplete = subtasks.filter(task => task.complete !== true)
                if (incomplete.length > 0) return 0 //don't update task to complete.
            }
        }

        updatetask.schedule = true //listing as scheduled so it appears in the day record.
        updatetask.completed = args.datetime ? new Date(args.datetime) : new Date()
        //activityrecord({taskid: args.taskid, checked: args.checked, notes: 'Marked as done. 🎉', req: req})
    } else {
        activityrecord({taskid: args.taskid, notes: 'Re-opened.', req: req, reopened: true})
    }
    updatetask.complete = args.checked

    const result = await Tasks.updateOne(
        {_id: new ObjectId(args.taskid)},
        {$set: updatetask}
    )
    return result.modifiedCount === 1
}

export async function linksubtask({parenttaskid, subtaskid, req}){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')

    if(parenttaskid !== subtaskid){ //new linking.
        Tasks.updateOne({_id: new ObjectId(parenttaskid)}, {$push: {subtasks: subtaskid}})
        Tasks.updateOne({_id: new ObjectId(subtaskid)}, {$set: {type: 'subtask'}, $unset: {starttime: null}})
        return true
    }else{
        return triggererror('Can\'t link task to the same task')
    }
}