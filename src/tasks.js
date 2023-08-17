import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';

import DbConnection from './database'
import { getprofileid } from './users'
import { activityrecord } from './pomodoros';
import { date2str, startOfDay, daylater } from '../util/functions';
//import { activityrecord } from './pomodoros'

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
        completed: String,
        schedule: Boolean,
        rescheduled: Int,
        tasks: [Task]
        parenttask: Task
        tags: [Area]
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
        tasks(starttime: String, endtime: String, scheduled: Boolean, complete: Boolean, today: String, goal: String, list: String, filter: String) : [Task]
        task(taskid: String!): Task
        searchTasks(search: String!): [Task]
        pastTasks(date: String!, filter: String): [Task]
        taskInsights(taskid: String!): [Insight]
        taskDayListTags(day: String): [Area]
        taskMainListTags(date: String!): [Area]
    }
    
    extend type Mutation {
        newTask(setdate: String, starttime: String, endtime: String, title: String, description: String, insightid: String, goal: String, parenttask: String, complete: Boolean, schedule: Boolean, tags: [String]) : String        
        editTask(taskid: String!, starttime: String, endtime: String, title: String, description: String, setdate: String, goal: String, parenttask: String, complete: Boolean, schedule: Boolean, reschedule: Boolean, tags: [String]) : Boolean
        deleteTask(taskid: String!) : Boolean

        listTask(taskid: String!) : Boolean
        unlistTask(taskid: String!) : Boolean
        
        scheduleTask(taskid: String!, setdate: String, reschedule: Boolean) : Boolean
        
        checkTask(taskid: String!, checked: Boolean) : Boolean
        setTaskGoal(taskid: String!, goalid: String!): Boolean
        removeTaskGoal(taskid: String!): Boolean
        
        updateDayTaskOrder(tasks: [String]): Boolean
        updateGoalTaskOrder(tasks: [String]): Boolean
        updateTaskListOrder(tasks: [String]): Boolean
        
        newSubTask(taskid: String!, task: String!): Boolean

        addTaskLink(parenttaskid: String!, subtaskid: String!): Boolean
        linkInsightToTask(taskid: String!, insightid: String!): Boolean
        linkSourceToTask(taskid: String!, sourceid: String!): Boolean
    }
`

export const resolvers = {
    Query: {
        tasks: async(_, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            let query = new Object()

            const daytime = new Date(args.starttime) //time set from client argument
            const starttime = startOfDay(daytime)
            const endtime = daylater(daytime)

            if(args.filter) {
                query.tags = args.filter
            } 

            if(!args.complete) {
                query.$or = [ //only return if complete not equal to true (or doesn't exist)
                    {complete: null},
                    {complete: false},
                    {complete: {$exists: false}},
                ]
                if(args.starttime || args.endtime){
                    query.$and = [
                            {'starttime': {$gte: starttime}},
                            {'starttime': {$lt: endtime}}
                        ]
                }
            }
            else {
                query.complete = true
                if (!args.goal) query.$or = [ //only check day if day query, not goal.
                    {$and: [
                        {'completed': {$gte: starttime}},
                        {'completed': {$lt: endtime}}
                    ]},
                    {$and: [ //if no completed date, use the start time. Phase this out.
                        {'completed': {$exists: false}},
                        {'starttime': {$gte: starttime}},
                        {'starttime': {$lt: endtime}}
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
            if (!req.session.user) return triggererror('Invalid Session')
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
        searchTasks: async(_, {search}, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            return await Tasks.find({profile: getprofileid(req.session), title: new RegExp(search, 'i')}).sort({created: -1}).toArray()
        },
        pastTasks: async(_, {date, filter}, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
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
            if (!req.session.user) return triggererror('Invalid Session')
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
            if (!req.session.user) return triggererror('Invalid Session')
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
        taskMainListTags: async(_, {date}, { req }) => {
            //could replace the day task list query with this one.
            if (!req.session.user) return triggererror('Invalid Session')
            //return triggererror('Test Error')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const Areas = db.collection('areas')
            let query = new Object()
            const today = new Date(date) //time set from client argument
            
            query.$and = [
                {$or: [
                    {schedule: true},
                    {starttime: {$lt: today}}
                ]},
                {$or:[ //only return if complete not equal to true (or doesn't exist)
                    {complete: null},
                    {complete: false},
                    {complete: {$exists: false}},
                ]}
            ]

            query.type = {$ne: 'subtask'}
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
                const TaskLinks = db.collection('tasklinks')
                
                const tasklist = await TaskLinks.find({parenttask: parent._id.toString()}).toArray()
                
                return await Tasks.find({_id: {
                    $in: tasklist.map(function(link) {
                        return new ObjectId(link.subtask)
                    })
                }}).toArray()
            }
             catch (error) {
                return []
            }
        },
        parenttask: async(task, __, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const TaskLinks = db.collection('tasklinks')
            
            //return a single parent task for now.
            const taskid = task._id.toString()
            const tasklink = await TaskLinks.findOne({subtask: taskid})
            if (tasklink){
                const parenttask = await Tasks.findOne({_id: new ObjectId(tasklink.parenttask)})
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
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const TaskLinks = db.collection('tasklinks')

            args.profileid = getprofileid(req.session)
            if (args.parenttask) args.type = 'subtask'
            else args.type = 'task'

            const taskid = await createNewTask(args)
            if (args.parenttask) {
                TaskLinks.insertOne({profileid: getprofileid(req.session), parenttask: args.parenttask, subtask: taskid, created: new Date()})
            }
            activityrecord({taskid: taskid, notes: 'Task created.', req: req})
            if (args.insightid) linkInsightTask(taskid, args.insightid)
            return taskid
        },
        editTask: async(_, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const TaskLinks = db.collection('tasklinks')

            var updates = new Object()
            if (args.endtime) {
                updates.endtime = new Date(args.endtime), //time set from client argument
                updates.daytask = false
            }
            else {
                updates.daytask = true
                updates.endtime = null
            }

            if (!args.goal && !args.starttime) updates.schedule = true
            else updates.schedule = false

            if(args.setdate || args.starttime) 
                {updates.starttime = args.starttime ? new Date(args.starttime) : new Date(args.setdate)} //time set from client argument
            /* else 
                updates.starttime = null */
            if(args.title) updates.title = args.title
            if(args.complete !== null) updates.complete = args.complete
            if(args.description !== null) updates.description = args.description
            if(args.goal) {updates.goal = args.goal}
            else {updates.goal = null}
            if(args.tags) {updates.tags = args.tags}
            //would be better to check links before deleting and inserting. Separate into function.
            await TaskLinks.deleteMany({profileid: getprofileid(req.session), subtask: args.taskid})
            if (args.parenttask) {
                TaskLinks.insertOne({profileid: getprofileid(req.session), parenttask: args.parenttask, subtask: args.taskid, created: new Date()})
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
            if (!req.session.user) return triggererror('Invalid Session')
            return await deleteTask(args.taskid, req)
        },
        listTask: async(_, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const result = await Tasks.updateOne(
                {_id: new ObjectId(args.taskid)},
                {
                    $set: {schedule: true}, 
                    $unset: {starttime: null}
                }
            )
            return result.modifiedCount === 1
        },
        unlistTask: async(_, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const result = await Tasks.updateOne(
                {_id: new ObjectId(args.taskid)},
                {
                    $unset: { schedule: null },
                    $inc: { rescheduled: 1}
                }
            )
            return result.modifiedCount === 1
        },
        updateDayTaskOrder: async(parent, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
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
            if (!req.session.user) return triggererror('Invalid Session')
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
            if (!req.session.user) return triggererror('Invalid Session')
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
        scheduleTask: async(_, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            var updates = new Object()

            if (args.reschedule){ //if date existing, then increment reschedule count.
                updates.$inc = { rescheduled: 1}
            }
            
            if(args.setdate) {
                const date = args.starttime ? new Date(args.starttime) : new Date(args.setdate) //time set from client argument
                activityrecord({taskid: args.taskid, notes: 'Scheduled for ' + date2str(date,'MM-dd-yyyy'), req: req})
                updates.$set = {
                    starttime: date,
                    daytask: true,
                    endtime: null
                }
                updates.$unset = {schedule: null}
            } else {
                activityrecord({taskid: args.taskid, notes: 'Scheduled date unset.', req: req})
                updates.$unset = { //unsetting, variables don't matter.
                    starttime: ''
                }
                updates.$set = {
                    schedule: true
                }
            }

            const result = await Tasks.updateOne(
                {_id: new ObjectId(args.taskid)},
                updates
            )
            return result.modifiedCount === 1   
        },
        checkTask: async(_, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const response = await checkTask(args, req)
            if (response === 0) return triggererror('Not all subtasks are marked as completed.')
            else return response
        },
        removeTaskGoal: async(_, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const result = await Tasks.updateOne(
                {_id: new ObjectId(args.taskid)},
                {$unset: {goal:''}}
            )
            return result.modifiedCount === 1
        },
        setTaskGoal: async(_, {taskid,goalid}, {req}) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const result = await Tasks.updateOne(
                {_id: new ObjectId(taskid)},
                {$set: {goal: goalid}}
            )
            return result.modifiedCount === 1
        },
        newSubTask: async(_, {taskid,task}, {req}) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const subtaskid = await createNewTask({title: task, profileid: getprofileid(req.session), type: 'subtask'})
            activityrecord({taskid: subtaskid, notes: 'Task created.', req: req})
            const TaskLinks = db.collection('tasklinks')
            
            if(taskid !== subtaskid){
                const result = await TaskLinks.insertOne({profileid: getprofileid(req.session), parenttask: taskid, subtask: subtaskid, created: new Date()})
                return result.acknowledged === true
            }else{
                return triggererror('Can\'t link task to the same task')
            }
        },
        addTaskLink: async(_, {parenttaskid,subtaskid}, {req}) => {
            if (!req.session.user) return triggererror('Invalid Session')
            return await linksubtask({parenttaskid, subtaskid, req})
        },
        //removeTaskLink(parenttaskid: String!, subtaskid: String!): Boolean
        /* removeTaskLink: async(_, {parenttaskid,subtaskid}, {req}) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const TaskLinks = db.collection('tasklinks')
            const result = await TaskLinks.deleteMany({profileid: getprofileid(req.session), parenttask: parenttaskid, subtask: subtaskid})
            console.log(result)
            return true
        }, */
        //removeTaskParentLinks(subtaskid: String!): Boolean
        /* removeTaskParentLinks: async(_, {subtaskid}, {req}) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const TaskLinks = db.collection('tasklinks')
            
            const result = await TaskLinks.deleteMany({profileid: getprofileid(req.session), subtask: subtaskid})
            console.log(result)
            return true
        }, */
        linkInsightToTask: async(_, {taskid,insightid}, {req}) => {
            if (!req.session.user) return triggererror('Invalid Session')
            return await linkInsightTask(taskid, insightid)
        },
        linkSourceToTask: async(_, {taskid,sourceid}, {req}) => {
            if (!req.session.user) return triggererror('Invalid Session')
            return await linkSourceTask(taskid, sourceid)
        }
    }
}

export async function linkInsightTask(taskid, insightid){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const result = await Tasks.updateOne(
        {_id: new ObjectId(taskid)},
        {$push: {insights: insightid}}
    )
    return true
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

export async function createRepeatTask(taskid, req){
    //need to move business logic to server.
    if (!req.session.user) return triggererror('Invalid Session')
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
    delete tasktorepeat.endtime
    delete tasktorepeat.rescheduled

    //create new task from template and get id.
    const newtaskid = (await Tasks.insertOne(tasktorepeat)).insertedId.toString()
    activityrecord({taskid: newtaskid, notes: 'Task created.', req: req})

    //get all task template links
    copySubTasksFromTask(taskid, newtaskid, req)
    return newtaskid
    //create and link all new sub tasks from templates
}

async function copySubTasksFromTask(taskid, newtaskid, req) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const TaskLinks = db.collection('tasklinks')

    //search for links to task template.
    let links = await TaskLinks.find({profileid: getprofileid(req.session), parenttask: taskid}).toArray()
    //get subtask templates.
    if (links.length > 0) {
        let subtasks = await Tasks.find({
            profile: getprofileid(req.session), 
            _id: {
                $in: links.map(function(link) {
                    return new ObjectId(link.subtask)
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
        
        //link all subtasks to the parent task.
        newSubTasks.map(subtaskid => {
            //no activity records or history recorded against templates yet.
            linksubtask({parenttaskid: newtaskid, subtaskid: subtaskid.toString(), req: req})}
        )
    }
}

async function deleteTask(taskid, req){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const TaskLinks = db.collection('tasklinks')
    const tasklinks = await TaskLinks.find({parenttask: taskid}).toArray()
    if (tasklinks.length > 0) await tasklinks.map(link => {
        return deleteTask(link.subtask, req) //delete all subtasks.
    })
    await TaskLinks.deleteMany({
        profileid: getprofileid(req.session),
        $or: [
            {parenttask: taskid},
            {subtask: taskid}
        ]
    }) //delete all links.
    const result = await Tasks.deleteOne({_id: new ObjectId(taskid)})
    return result.deletedCount === 1
}

async function createNewTask({title, description, goal, complete, setdate, starttime, endtime, profileid, type, tags}) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')

    var task = new Object({title: title, description: description, goal: goal, complete: complete, tags: tags })
    task.starttime = starttime ? new Date(starttime) : (setdate ? new Date(setdate) : null) //time set from client argument
    task.created = new Date()

    if (!goal && !starttime) task.schedule = true
    else task.schedule = false
    
    if (endtime) {
        task.endtime = new Date(endtime), //time set from client argument
        task.daytask = false
    }
    else {
        task.daytask = true
        task.endtime = null
    }
    task.profile = profileid
    task.type = type

    return (await Tasks.insertOne(task)).insertedId.toString()
}

export async function checkTask(args, req){
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const TaskLinks = db.collection('tasklinks')

    var updatetask = new Object()
    if(args.checked) {
        //check all subtasks to see if they're complete
        const tasklist = await TaskLinks.find({parenttask: args.taskid}).toArray()           
        if (tasklist.length > 0){
            const subtasks = await Tasks.find({_id: {
                $in: tasklist.map(function(link) {
                    return new ObjectId(link.subtask)
                })
            }}).toArray()
            const incomplete = subtasks.filter(task => task.complete !== true)
            if (incomplete.length > 0) return 0 //don't update task to complete.
        }

        updatetask.schedule = true //listing as scheduled so it appears in the day record.
        updatetask.completed = new Date()
        activityrecord({taskid: args.taskid, notes: 'Marked as done.', req: req})
    } else {
        activityrecord({taskid: args.taskid, notes: 'Re-opened.', req: req})
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
    const TaskLinks = db.collection('tasklinks')

    if(parenttaskid !== subtaskid){ //new linking.
        const result = await TaskLinks.insertOne({profileid: getprofileid(req.session), parenttask: parenttaskid, subtask: subtaskid, created: new Date()})
        return true
    }else{
        return triggererror('Can\'t link task to the same task')
    }
}