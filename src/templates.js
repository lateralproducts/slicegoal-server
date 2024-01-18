import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver'

import DbConnection from './database'
import { getprofileid } from './users'
import { linksubtask } from './tasks'
import { activityrecord } from './pomodoros'
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
        
        linkInsightToTemplate(templateid: String!, insightid: String!): Boolean
        linkSourceToTemplate(templateid: String!, sourceid: String!): Boolean

        createTaskFromTemplate(templateid: String!): String
        createTemplateFromTask(taskid: String!): String
    }
`

export const resolvers = {
    Query: {
        templateslist: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('templates')
            return await Tasks.find({profile: getprofileid(req.session), type: {$ne: 'subtask'}}).toArray()
        },
        templates: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const template = await Templates.findOne({_id: new ObjectId(args.templateid)})
            if(template.templates){
                const subtemplates = await Templates.find({
                    _id: {
                        $in: template.templates.map(function(link) {
                            return new ObjectId(link)
                        })
                    }
                }).toArray()
                return subtemplates
        } else return []
        },
        template: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')

            return await Templates.findOne(
                {
                    profile: getprofileid(req.session),
                    _id: new ObjectId(args.templateid)
                }
            )
        },
        searchTemplates: async(_, {search}, { req }) => {
            
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            return await Templates.find({profile: getprofileid(req.session), title: new RegExp(search, 'i')}).sort({created: -1}).toArray()
        },
        templateInsights: async(_, {templateid}, { req }) => {
            
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const Insights = db.collection('insights')
            const template = await Templates.findOne({profile: getprofileid(req.session), _id: new ObjectId(templateid)})

            if (template.insights) 
                return await Insights.find({
                    _id: {
                        $in: template.insights.map(insightid => {return new ObjectId(insightid)})
                    }
                }).toArray()
            else return []
        }
    },
    Template: {
        goal: async({ goal }) => {
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            return await Goals.findOne({ _id: new ObjectId(goal) })
        },
        templates: async(parent, __, { req }) => {
                try {
                    const db = await DbConnection.Get()
                    const Templates = db.collection('templates')

                    const template = await Templates.findOne({profileid: getprofileid(req.session), _id: new ObjectId(parent._id.toString())})
                    if(template.templates){
                    return await Templates.find({
                        profile: getprofileid(req.session), 
                        _id: {
                            $in: template.templates.map(function(link) {
                                return new ObjectId(link)
                            })
                        }
                    }).toArray()} else return []
                }
                 catch (error) {
                    return []
                }
        },
        parenttemplate: async(parent, __, { req }) => {
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            
            //return a single parent template for now.
            const template = await Templates.findOne({subtemplate: parent._id.toString()})
            if (template){
                return template
            } else return null
        }
    },
    Mutation: {
        newTemplate: async(_, args, { req }) => {
            //need to move business logic to server.
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')

            args.profileid = getprofileid(req.session)
            if (args.parenttemplate) args.type = 'subtask'
            const templateid = await createNewTemplate(args)
            if (args.parenttemplate) {
                Templates.updateOne({profileid: getprofileid(req.session), _id: new ObjectId(args.parenttemplate)},{$push: {templates: templateid}})
            }
            if (args.insightid) linkInsightTemplate(templateid, args.insightid)
            return templateid
        },
        createTaskFromTemplate: async(_, {templateid}, { req }) => {
            //need to move business logic to server.
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const Tasks = db.collection('tasks')

            //get template to copy.
            let template = new Object()
            template = await Templates.findOne( 
                {
                    profile: getprofileid(req.session),
                    _id: new ObjectId(templateid)
                }
            )
            delete template._id
            template.created = new Date()
            template.templateid = templateid
            template.schedule = true
            delete template.subtasks

            //create new task from template and get id.
            const newtaskid = (await Tasks.insertOne(template)).insertedId.toString()
            activityrecord({taskid: newtaskid, notes: 'Task created from template.', req: req})

            //get all task template links
            createSubTasksFromTemplate(templateid, newtaskid, req)
            return newtaskid
            //create and link all new sub tasks from templates
            
        },
        createTemplateFromTask: async(_, {taskid}, { req }) => {
            //need to move business logic to server.
            
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const Tasks = db.collection('tasks')

            //get template to copy.
            let task = new Object()
            task = await Tasks.findOne( 
                {
                    profile: getprofileid(req.session),
                    _id: new ObjectId(taskid)
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
            
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')

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
            await Templates.updateMany({profileid: getprofileid(req.session), templates: args.templateid}, {$pull: {templates: args.templateid}})
            if (args.parenttemplate) Templates.updateOne({profileid: getprofileid(req.session), _id: new ObjectId(args.parenttemplate)}, {$push: {templates: args.templateid}})

            const result = await Templates.updateOne(
                {_id: new ObjectId(args.templateid)},
                updatetemplate
            )
            return result.modifiedCount === 1
        },
        deleteTemplate: async(_, args, { req }) => {
            
            return await deleteTemplate(args.templateid, req)
        },
        updateTemplateListOrder: async(parent, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            args.templates.map(function(_id, count) {
                Templates.updateOne(
                    { _id: new ObjectId(_id) },
                    { $set: { listorder: count } },
                )
            })
            return true
        },
        removeTemplateGoal: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')

            const result = await Templates.updateOne(
                {_id: new ObjectId(args.templateid)},
                {$unset: {goal:''}}
            )
            return result.modifiedCount === 1
        },
        setTemplateGoal: async(_, {templateid,goalid}, {req}) => {
            
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')

            const result = await Templates.updateOne(
                {_id: new ObjectId(templateid)},
                {$set: {goal: goalid}}
            )
            return result.modifiedCount === 1
        },
        newSubTemplate: async(_, {templateid,template}, {req}) => {
            
            const db = await DbConnection.Get()
            const subtemplateid = await createNewTemplate({title: template, profileid: getprofileid(req.session), type: 'subtask'})
            const Templates = db.collection('templates')
            
            if(templateid !== subtemplateid){
                const result = await Templates.updateOne({profileid: getprofileid(req.session), _id: new ObjectId(templateid)}, {$push: {subtemplate: subtemplateid}})
                return result.insertedId ? true : false
            }else{
                return triggererror('Can\'t link template to the same template')
            }
        },
        addTemplateLink: async(_, {parenttemplateid,subtemplateid}, {req}) => {
            
            
        },
        // removeTemplateLink(parenttemplateid: String!, subtemplateid: String!): Boolean
        /* removeTemplateLink: async(_, {parenttemplateid,subtemplateid}, {req}) => {
            
            const db = await DbConnection.Get()
            const result = await TemplateLinks.deleteMany({profileid: getprofileid(req.session), parenttemplate: parenttemplateid, subtemplate: subtemplateid})
            console.log(result)
            return true
        }, */
        // removeTemplateParentLinks(subtemplateid: String!): Boolean
        /* removeTemplateParentLinks: async(_, {subtemplateid}, {req}) => {
            
            const db = await DbConnection.Get()
            return (await TemplateLinks.deleteMany({profileid: getprofileid(req.session), subtemplate: subtemplateid})).result.ok === 1
        }, */
        linkInsightToTemplate: async(_, {templateid,insightid}, {req}) => {
            
            return await linkInsightTemplate(templateid, insightid)
        },
        linkSourceToTemplate: async(_, {templateid,sourceid}, {req}) => {
            
            return await linkSourceTemplate(templateid, sourceid)
        }
    }
}

export async function linkInsightTemplate(templateid, insightid){
    const db = await DbConnection.Get()
    const Templates = db.collection('templates')
    const result = await Templates.updateOne(
        {_id: new ObjectId(templateid)},
        {$push: {insights: insightid}}
    )
    return result.modifiedCount === 1
}

export async function linkSourceTemplate(templateid, sourceid){
    const db = await DbConnection.Get()
    const Templates = db.collection('templates')
    const result = await Templates.updateOne(
        {_id: new ObjectId(templateid)},
        {$push: {sources: sourceid}}
    )
    return result.modifiedCount === 1
}

async function deleteTemplate(templateid, req){
    const db = await DbConnection.Get()
    const Templates = db.collection('templates')
    const template = await Templates.findOne({profileid: getprofileid(req.session), _id: new ObjectId(templateid)})
    if (template.templates) await template.templates.map(link => {
        return deleteTemplate(link, req) //delete all subtemplates. Self-referencing function.
    })
    const result = await Templates.deleteOne({profileid: getprofileid(req.session), _id: new ObjectId(templateid)})
    return result.deletedCount === 1
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
    const Templates = db.collection('templates')
    const Tasks = db.collection('tasks')

    //search for links to task template.
    const template = await Templates.findOne({_id: new ObjectId(templateid)})
    //get subtask templates.
    if (template.templates) {
    let subtemplates = await Templates.find({
        profile: getprofileid(req.session), 
        _id: {
            $in: template.templates.map(function(link) {
                return new ObjectId(link)
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
    const subtaskIDs = Object.values(newSubTasks)
    subtaskIDs.map(subtaskid => {
        activityrecord({taskid: subtaskid.toString(), notes: 'Task created from template.', req: req})
        linksubtask({parenttaskid: newtaskid, subtaskid: subtaskid.toString(), req: req})}
    )}
}

async function createSubTemplatesFromSubTasks(taskid, newtemplateid, req) {
    const db = await DbConnection.Get()
    const Tasks = db.collection('tasks')
    const Templates = db.collection('templates')

    //search for links to task template.
    let task = await Tasks.findOne({_id: new ObjectId(taskid)})
    //get subtask templates.
    if (task.subtasks) {
        let subtemplates = await Tasks.find({
            profile: getprofileid(req.session), 
            _id: {
                $in: task.subtasks.map(function(link) {
                    return new ObjectId(link)
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
        
        const newSubTemplatesIDs = Object.values(newSubTemplates)

        //link all subtasks to the parent task.
        if(newSubTemplatesIDs) newSubTemplatesIDs.map(subtemplateid => {
            //no activity records or history recorded against templates yet.
            linksubtemplate({parenttemplateid: newtemplateid, subtemplateid: subtemplateid.toString(), req: req})}
        )
    }
}

async function linksubtemplate({parenttemplateid, subtemplateid, req}){
    const db = await DbConnection.Get()
    const Templates = db.collection('templates')

    if(parenttemplateid !== subtemplateid){ //new linking.
        Templates.updateOne({_id: new ObjectId(parenttemplateid)},{$push: {templates: subtemplateid}})
        return true
    }else{
        return triggererror('Can\'t link template to the same template')
    }
}