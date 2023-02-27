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
        chatid: String
    }
    type ChatContext {
        _id: String
    }
    type Chat {
        _id: String
        profileid: String
        taskid: String
        created: String
        messages: [Message]
    }
    type Message {
        _id: String
        message: String
        type: String
        sent: String
    }
`

export const typeDefs = `
    extend type Query {
        chatprompts: [Prompt]
    }

    extend type Mutation {
        createTaskChat(taskid: String!, promptid: String, message: String): Response
        sendContextRating(contextid: String!, chatid: String, rating: Int, ratemessage: String): Boolean
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
        }
    },
    Mutation: {
        sendContextRating: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const Chats = db.collection('chats')
            const context = await ChatContext.findOne({_id: ObjectId(args.contextid)})
            let oldrating = 0
            let newrating = 0
            if (context.match) oldrating = context.match 
            if (args.rating) newrating = (args.rating + (oldrating * context.count))/(context.count + 1) //average of all ratings + this rating.

            ChatContext.updateOne(
                { _id: ObjectId(args.contextid) },
                { 
                    $set: { match: newrating},
                    $push: {
                        ratings: {
                            message: args.ratemessage,
                            rating: args.rating,
                            time: new Date(),
                            chatid: args.chatid,
                        }
                    },
                    $inc: { count: 1 }
                }
            )

            Chats.updateOne(
                { _id: ObjectId(args.chatid) },
                { 
                    $push: {
                        messages: {
                            message: args.ratemessage,
                            rating: args.rating,
                            datetime: new Date(),
                            type: 'rating'
                        }
                    }
                }
            )
            return true
        },
        createTaskChat: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const Response = db.collection('chatresponses')
            const Chats = db.collection('chats')
            const context = await ChatContext.findOne({promptid: args.promptid})
            let response = await Response.findOne({_id: ObjectId(context.responseid)})

            const profileid = getprofileid(req.session)
            const userid = getuserid(req.session)

            const newchat = await Chats.insertOne(
                { 
                    profileid: profileid,
                    taskid: args.taskid,
                    started: new Date(),
                    messages: [
                        {promptid: args.promptid, message: args.message, userid: userid, datetime: new Date()},
                        {responsid: response._id, message: response.message, datetime: new Date()}
                    ]
                },
            )
            response.context = context
            response.chatid = newchat.insertedId.toString()
            return response
        }
    }
}
