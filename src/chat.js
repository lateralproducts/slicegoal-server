import DbConnection from './database'
import { getprofileid, getuserid } from './users'
import { ObjectId } from 'mongodb'

export const schema = `
    type Prompt {
        _id: String
        message: String
    }
    type Response {
        _id: String
        message: String
        context: ChatContext
        taskid: String
    }
    type ChatContext {
        _id: String
    }
    type Chat {
        _id: String
        profileid: String
        taskid: String
        started: String
        messages: [Message]
        userid: String
    }
    type Message {
        _id: String
        message: String
        type: String
        datetime: String
        userid: String
        contextid: String
        rating: Float
        original: String
    }
`

export const typeDefs = `
    extend type Query {
        chatprompts: [Prompt]
        gettaskchat(taskid: String!): Chat
    }

    extend type Mutation {
        sendChatPrompt(taskid: String!, promptid: String, message: String): Boolean
        sendChatMessage(taskid: String!, message: String!): Boolean
        sendRating(contextid: String, taskid: String!, rating: Int!, ratemessage: String, original: String): Boolean
    }
`

export const resolvers = {
    Query: {
        chatprompts: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Prompts = db.collection('chatprompts')
            const prompts = await Prompts.find({message: {$exists: true}})
            return prompts.toArray()
        },
        gettaskchat: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            const chat = await Chats.findOne({taskid: args.taskid, profileid: profileid})
            if (chat) {
                chat.userid = getuserid(req.session)
                return chat
            } else {
                const empty = {userid: getuserid(req.session)}
                return empty
            }
        }
    },
    Mutation: {
        sendRating: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const userid = getuserid(req.session)
            const profileid = getprofileid(req.session)
            
            if (args.contextid) { //rate context if there is a context.
                const context = await ChatContext.findOne({_id: ObjectId(args.contextid)})
            
                let newrating = 0
                if (context.match !== null) {
                    const oldrating = context.match 
                    newrating = (args.rating + (oldrating * context.count))/(context.count + 1) //average of all ratings + this rating.
                } else {newrating = args.rating}

                ChatContext.updateOne(
                { _id: ObjectId(args.contextid) },
                { 
                    $set: { match: newrating},
                    $push: {
                        ratings: {
                            message: args.ratemessage,
                            rating: args.rating,
                            time: new Date(),
                            taskid: args.taskid,
                            original: args.original
                        }
                    },
                    $inc: { count: 1 }
                }
            )}

            //save the rating as a message.
            const message = {
                contextid: args.contextid,
                message: args.ratemessage,
                rating: args.rating,
                datetime: new Date(),
                type: 'rating',
                userid: getuserid(req.session),
                original: args.original
            }
            sendTaskChatMessage(profileid, args.taskid, message, userid)
            return true
        },
        sendChatMessage: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            if (args.message){
                const userid = getuserid(req.session)
                const profileid = getprofileid(req.session)
                const message = { //create message structure.
                    message: args.message,
                    datetime: new Date(),
                    userid: userid
                }
                sendTaskChatMessage(profileid, args.taskid, message, userid)
            }
            return true
        },
        sendChatPrompt: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const Prompts = db.collection('chatprompts')
            const Response = db.collection('chatresponses')
            const profileid = getprofileid(req.session)
            const userid = getuserid(req.session)
            
            const promptmessage = {promptid: args.promptid, message: args.message, userid: userid, datetime: new Date()}
            
            Prompts.updateOne( //update data on prompt usage.
                { _id: ObjectId(args.promptid) },
                { $inc: { selected: 1 } }
            )
            await sendTaskChatMessage(profileid, args.taskid, promptmessage, userid)

            const context = await ChatContext.findOne({promptid: args.promptid})
            console.log('context')
            if (context) {
                console.log(context)
                let response
                if (context.responseid) response = await Response.findOne({_id: ObjectId(context.responseid)})
                if (response) {
                    Response.updateOne( //update data on response usage.
                        {_id: ObjectId(context.responseid)}, 
                        { $inc: { used: 1 } }
                    )
                    let responsemessage
                    responsemessage = {responseid: response._id.toString(), contextid: context._id.toString(), message: response.message, datetime: new Date()}
                    sendTaskChatMessage(profileid, args.taskid, responsemessage, 'chatbot') //userid is chatbot.
                }
            }
            console.log('outside')
            return true
        }
    }
}

async function sendTaskChatMessage(profileid, taskid, message, userid) {
    const db = await DbConnection.Get()
    const Chats = db.collection('chats')
    
    const chat = await Chats.findOne({ taskid: taskid })

    if (!chat) {
        await Chats.insert( //create first record if it doesn't exist.
            { 
                profileid: profileid,
                taskid: taskid,
                started: new Date(),
                lastmessage: new Date(),
                firstmessage: message,
                seen: [userid],
                messages: [message]
            })
    } else {
        Chats.updateOne(
            { taskid: taskid, profileid: profileid },
            {
                $set: {
                    lastmessage: new Date(),
                    seen: [userid]
                },
                $push: {
                    messages: message
                }
            }
        )}
    }
