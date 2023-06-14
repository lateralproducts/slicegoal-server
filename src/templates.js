import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getprofileid } from './users'
import { linksubtask } from './tasks';
import { activityrecord } from './pomodoros';
//import { activityrecord } from './pomodoros'

export const schema = `
    type Template {
        _id: String
        title: String
        description: String
        goal: Goal,
        templates: [Template]
        parenttemplate: Template
    }
`

export const typeDefs = `
    extend type Query {
        templateslist: [Task]
        templates(templateid: String!): [Task]
        template(templateid: String!): Template
        searchTemplates(search: String!): [Template]
        templateInsights(templateid: String!): [Insight]
    }
    
    extend type Mutation {
        newTemplate(title: String, description: String, insightid: String, goal: String, parenttemplate: String) : String        
        editTemplate(templateid: String!, title: String, description: String, goal: String, parenttemplate: String) : Boolean
        deleteTemplate(templateid: String!) : Boolean

        setTemplateGoal(templateid: String!, goalid: String!): Boolean
        removeTemplateGoal(templateid: String!): Boolean

        updateTemplateListOrder(templates: [String]): Boolean
        
        newSubTemplate(templateid: String!, template: String!): Boolean

        addTemplateLink(parenttemplateid: String!, subtemplateid: String!): Boolean
        removeTemplateLink(parenttemplateid: String!, subtemplateid: String!): Boolean
        removeTemplateParentLinks(subtemplateid: String!): Boolean
        linkInsightToTemplate(templateid: String!, insightid: String!): Boolean
        linkSourceToTemplate(templateid: String!, sourceid: String!): Boolean

        createTaskFromTemplate(templateid: String!): String
        createTemplateFromTask(taskid: String!): String
    }
`

export const resolvers = {
    Query: {
        templateslist: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Tasks = db.collection('templates')
            return await Tasks.find({profile: getprofileid(req.session), type: {$ne: 'subtask'}}).toArray()
        },
        templates: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const TemplateLinks = db.collection('templatelinks')
            const Templates = db.collection('templates')
            const links = await TemplateLinks.find({profileid: getprofileid(req.session), parenttemplate: args.templateid}).toArray()
            return await Templates.find({
                profile: getprofileid(req.session), 
                _id: {
                    $in: links.map(function(link) {
                        return ObjectId(link.subtemplate)
                    })
                }
            }).toArray()
        },
        template: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')

            return await Templates.findOne(
                {
                    profile: getprofileid(req.session),
                    _id: ObjectId(args.templateid)
                }
            )
        },
        searchTemplates: async(_, {search}, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            return await Templates.find({profile: getprofileid(req.session), title: new RegExp(search, 'i')}).sort({created: -1}).toArray()
        },
        templateInsights: async(_, {templateid}, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const Insights = db.collection('insights')
            const template = await Templates.findOne({profile: getprofileid(req.session), _id: ObjectId(templateid)})

            if (template.insights) 
                return await Insights.find({
                    _id: {
                        $in: template.insights.map(insightid => {return ObjectId(insightid)})
                    }
                }).toArray()
            else return []
        }
    },
    Template: {
        goal: async({ goal }) => {
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            return await Goals.findOne({ _id: ObjectId(goal) })
        },
        templates: async(parent, __, { req }) => {
                try {
                    const db = await DbConnection.Get()
                    const Templates = db.collection('templates')
                    const TemplateLinks = db.collection('templatelinks')
                    
                    const templatelist = await TemplateLinks.find({parenttemplate: parent._id.toString()}).toArray()
                    
                    return await Templates.find({_id: {
                        $in: templatelist.map(function(link) {
                            return ObjectId(link.subtemplate)
                        })
                    }}).toArray()
                }
                 catch (error) {
                    return []
                }
        },
        parenttemplate: async(parent, __, { req }) => {
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const TemplateLinks = db.collection('templatelinks')
            
            //return a single parent template for now.
            const templatelink = await TemplateLinks.findOne({subtemplate: parent._id.toString()})
            if (templatelink){
                const parenttemplate = await Templates.findOne({_id: ObjectId(templatelink.parenttemplate)})
                return parenttemplate
            } else return null
        }
    },
    Mutation: {
        newTemplate: async(_, args, { req }) => {
            //need to move business logic to server.
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const TemplateLinks = db.collection('templatelinks')

            args.profileid = getprofileid(req.session)
            if (args.parenttemplate) args.type = 'subtask'
            const templateid = await createNewTemplate(args)
            if (args.parenttemplate) {
                TemplateLinks.insertOne({profileid: getprofileid(req.session), parenttemplate: args.parenttemplate, subtemplate: templateid, created: new Date()})
            }
            if (args.insightid) linkInsightTemplate(templateid, args.insightid)
            return templateid
        },
        createTaskFromTemplate: async(_, {templateid}, { req }) => {
            //need to move business logic to server.
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const Tasks = db.collection('tasks')

            //get template to copy.
            let template = new Object()
            template = await Templates.findOne( 
                {
                    profile: getprofileid(req.session),
                    _id: ObjectId(templateid)
                }
            )
            delete template._id
            template.created = new Date()
            template.templateid = templateid
            template.schedule = true

            //create new task from template and get id.
            const newtaskid = (await Tasks.insertOne(template)).insertedId.toString()
            activityrecord({taskid: newtaskid, notes: 'Task created.', req: req})

            //get all task template links
            createSubTasksFromTemplate(templateid, newtaskid, req)
            return newtaskid
            //create and link all new sub tasks from templates
            
        },
        createTemplateFromTask: async(_, {taskid}, { req }) => {
            //need to move business logic to server.
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const Tasks = db.collection('tasks')

            //get template to copy.
            let task = new Object()
            task = await Tasks.findOne( 
                {
                    profile: getprofileid(req.session),
                    _id: ObjectId(taskid)
                }
            )
            delete task._id
            task.created = new Date()
            task.taskid = taskid

            //create new task from template and get id.
            const newtemplateid = (await Templates.insertOne(task)).insertedId.toString()
            activityrecord({templateid: newtemplateid, notes: 'Task template created.', req: req})

            //get all task template links
            createSubTemplatesFromSubTasks(taskid, newtemplateid, req)
            return newtemplateid
            //create and link all new sub tasks from templates
            
        },
        editTemplate: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const TemplateLinks = db.collection('templatelinks')

            var updates = new Object()
            if (args.parenttemplate) updates.type = 'subtask'
            else updates.type = null

            if(args.title) updates.title = args.title
            if(args.description !== null) updates.description = args.description
            if(args.goal) {updates.goal = args.goal}
            else {updates.goal = null}

            var updatetemplate = new Object()
            updatetemplate.$set = updates

            //would be better to check links before deleting and inserting. Separate into function.
            await TemplateLinks.deleteMany({profileid: getprofileid(req.session), subtemplate: args.templateid})
            if (args.parenttemplate) TemplateLinks.insertOne({profileid: getprofileid(req.session), parenttemplate: args.parenttemplate, subtemplate: args.templateid, created: new Date()})

            return (await Templates.updateOne(
                {_id: ObjectId(args.templateid)},
                updatetemplate
            )).result.ok === 1
        },
        deleteTemplate: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            return await deleteTemplate(args.templateid, req)
        },
        updateTemplateListOrder: async(parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            args.templates.map(function(_id, count) {
                Templates.updateOne(
                    { _id: ObjectId(_id) },
                    { $set: { listorder: count } },
                )
            })
            return true
        },
        removeTemplateGoal: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')

            return (await Templates.updateOne(
                {_id: ObjectId(args.templateid)},
                {$unset: {goal:''}}
            )).result.ok === 1
        },
        setTemplateGoal: async(_, {templateid,goalid}, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')

            return (await Templates.updateOne(
                {_id: ObjectId(templateid)},
                {$set: {goal: goalid}}
            )).result.ok === 1
        },
        newSubTemplate: async(_, {templateid,template}, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const subtemplateid = await createNewTemplate({title: template, profileid: getprofileid(req.session), type: 'subtask'})
            const TemplateLinks = db.collection('templatelinks')
            
            if(templateid !== subtemplateid){
                return (await TemplateLinks.insertOne({profileid: getprofileid(req.session), parenttemplate: templateid, subtemplate: subtemplateid, created: new Date()})).result.ok === 1
            }else{
                throw new Error('Can\'t link template to the same template')
            }
        },
        addTemplateLink: async(_, {parenttemplateid,subtemplateid}, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            
        },
        removeTemplateLink: async(_, {parenttemplateid,subtemplateid}, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const TemplateLinks = db.collection('templatelinks')
            return (await TemplateLinks.deleteMany({profileid: getprofileid(req.session), parenttemplate: parenttemplateid, subtemplate: subtemplateid})).result.ok === 1
        },
        removeTemplateParentLinks: async(_, {subtemplateid}, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const TemplateLinks = db.collection('templatelinks')
            return (await TemplateLinks.deleteMany({profileid: getprofileid(req.session), subtemplate: subtemplateid})).result.ok === 1
        },
        linkInsightToTemplate: async(_, {templateid,insightid}, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            return await linkInsightTemplate(templateid, insightid)
        },
        linkSourceToTemplate: async(_, {templateid,sourceid}, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            return await linkSourceTemplate(templateid, sourceid)
        }
    }
}

export async function linkInsightTemplate(templateid, insightid){
    const db = await DbConnection.Get()
    const Templates = db.collection('templates')
    return (await Templates.updateOne(
        {_id: ObjectId(templateid)},
        {$push: {insights: insightid}}
    )).result.ok === 1
}

export async function linkSourceTemplate(templateid, sourceid){
    const db = await DbConnection.Get()
    const Templates = db.collection('templates')
    return (await Templates.updateOne(
        {_id: ObjectId(templateid)},
        {$push: {sources: sourceid}}
    )).result.ok === 1
}

async function deleteTemplate(templateid, req){
    const db = await DbConnection.Get()
    const Templates = db.collection('templates')
    const TemplateLinks = db.collection('templatelinks')
    const templatelinks = await TemplateLinks.find({parenttemplate: templateid}).toArray()
    if (templatelinks.length > 0) await templatelinks.map(link => {
        return deleteTemplate(link.subtemplate, req) //delete all subtemplates.
    })
    await TemplateLinks.deleteMany({
        profileid: getprofileid(req.session),
        $or: [
            {parenttemplate: templateid},
            {subtemplate: templateid}
        ]
    }) //delete all links.
    return (await Templates.deleteOne({_id: ObjectId(templateid)})).result.ok === 1
}

async function createNewTemplate({title, description, goal, profileid, type}) {
    const db = await DbConnection.Get()
    const Templates = db.collection('templates')

    var template = new Object({title: title, description: description, goal: goal })
    template.created = new Date()
    template.profile = profileid
    template.type = type

    return (await Templates.insertOne(template)).insertedId.toString()
}

async function createSubTasksFromTemplate(templateid, newtaskid, req) {
    const db = await DbConnection.Get()
    const TemplateLinks = db.collection('templatelinks')
    const Templates = db.collection('templates')
    const Tasks = db.collection('tasks')

    //search for links to task template.
    let links = await TemplateLinks.find({profileid: getprofileid(req.session), parenttemplate: templateid}).toArray()
    //get subtask templates.
    if (links.length > 0) {
    let subtemplates = await Templates.find({
        profile: getprofileid(req.session), 
        _id: {
            $in: links.map(function(link) {
                return ObjectId(link.subtemplate)
            })
        }
    }).toArray()

    //create all subtasks.
    let insertTasks = subtemplates.map(template => {
        return {
            title: template.title,
            profile: template.profile,
            description: template.description,
            goal: template.goal,
            created: new Date(),
            type: "subtask",
            insights: template.insights,
            templateid: template._id.toString() //record template id for future reference.
        }
    })
    let newSubTasks = (await Tasks.insertMany(insertTasks)).insertedIds
    //link all subtasks to the parent task.
    newSubTasks.map(subtaskid => {
        activityrecord({taskid: subtaskid.toString(), notes: 'Task created.', req: req})
        linksubtask({parenttaskid: newtaskid, subtaskid: subtaskid.toString(), req: req})}
    )}
}

async function createSubTemplatesFromSubTasks(taskid, newtemplateid, req) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const TaskLinks = db.collection('tasklinks')
    const Templates = db.collection('templates')

    //search for links to task template.
    let links = await TaskLinks.find({profileid: getprofileid(req.session), parenttask: taskid}).toArray()
    //get subtask templates.
    if (links.length > 0) {
        let subtemplates = await Tasks.find({
            profile: getprofileid(req.session), 
            _id: {
                $in: links.map(function(link) {
                    return ObjectId(link.subtask)
                })
            }
        }).toArray()

        //create all subtasks.
        let insertSubTemplates = subtemplates.map(template => {
            return {
                title: template.title,
                profile: template.profile,
                description: template.description,
                goal: template.goal,
                created: new Date(),
                type: "subtask",
                insights: template.insights,
                templateid: template._id.toString() //record template id for future reference.
            }
        })
        let newSubTemplates = (await Templates.insertMany(insertSubTemplates)).insertedIds
        
        //link all subtasks to the parent task.
        newSubTemplates.map(subtemplateid => {
            //no activity records or history recorded against templates yet.
            linksubtemplate({parenttemplateid: newtemplateid, subtemplateid: subtemplateid.toString(), req: req})}
        )
    }
}

async function linksubtemplate({parenttemplateid, subtemplateid, req}){
    const db = await DbConnection.Get()
    const TemplateLinks = db.collection('templatelinks')

    if(parenttemplateid !== subtemplateid){ //new linking.
        return (await TemplateLinks.insertOne({profileid: getprofileid(req.session), parenttemplate: parenttemplateid, subtemplate: subtemplateid, created: new Date()})).result.ok === 1
    }else{
        throw new Error('Can\'t link template to the same template')
    }
}