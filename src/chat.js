import DbConnection from './database'
import { getprofileid, getuserid, getwheelid } from './users'
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
        task: Task
        started: String
        messages: [Message]
        userid: String
        firstmessage: Message
        lastmessage: Message
        unseen: Boolean
    }
    type Message {
        _id: String
        message: String
        type: String
        datetime: String
        userid: String
        name: String
        contextid: String
        rating: Float
        original: String
        responseid: String
    }
`

export const typeDefs = `
    extend type Query {
        chatprompts: [Prompt]
        gettaskchat(taskid: String!): Chat
        chatunseen(taskid: String!): Boolean
        anychatunseen: Boolean
        getchats: [Chat]
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
                const userid = getuserid(req.session)
                chat.userid = userid
                if (chat.unseen)
                    if(chat.unseen.includes(userid)){ //if not already seen, update seen status.
                        Chats.updateOne(
                            {taskid: args.taskid, profileid: profileid},
                            {$pull: {unseen: userid}}
                        )
                    }

                return chat
            } else {
                const empty = {userid: getuserid(req.session)}
                return empty
            }
        },
        getchats: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            const chats = await Chats.find({profileid: profileid}).toArray()
            //next order by unread, then last message.
            return chats
        },
        chatunseen: async(_, args, { req }) => { //check if task chat has been unseen by user.
            if (!req.session.user) throw new Error('Invalid Session')
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            const userid = getuserid(req.session)
            const chat = await Chats.findOne({taskid: args.taskid, profileid: profileid, unseen: userid})
            if (chat){return true}
            else return false
        },
        anychatunseen: async(_, args, { req }) => { //check if task chat has been unseen by user.
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            const profileid = getprofileid(req.session)
            const userid = getuserid(req.session)

            const chat = await Chats.findOne({profileid: profileid, unseen: userid})
            if (chat) {return true} //check if user has seen this chat.
            else return false
        }
    },
    Chat: {
        unseen: async({unseen}, __, { req }) => {
            const userid = getuserid(req.session)
            if (unseen){
                if(unseen.includes(userid)){return true}
                else {return false}
            } else return false
        },
        task: async({taskid}, __, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            if (taskid) return await Tasks.findOne({_id: ObjectId(taskid)})
            else return null
        },
    },
    Message: {
        name: async({userid, responseid}, __, { req }) => {
            if (userid){
                if (userid === getuserid(req.session)) return null
                const db = await DbConnection.Get()
                const Users = db.collection('users')
                const user = await Users.findOne({_id: ObjectId(userid)})
                
                if (user !== null) return user.firstname
                else return 'unknown'}
            else {
                if (responseid) return 'SliceGoal'
                else return null
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
            sendTaskChatMessage(profileid, args.taskid, message, userid, getwheelid(req.session))
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
                sendTaskChatMessage(profileid, args.taskid, message, userid, getwheelid(req.session))
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
            await sendTaskChatMessage(profileid, args.taskid, promptmessage, userid, getwheelid(req.session))

            const context = await ChatContext.findOne({promptid: args.promptid})
            if (context) {
                let response
                if (context.responseid) response = await Response.findOne({_id: ObjectId(context.responseid)})
                if (response) {
                    Response.updateOne( //update data on response usage.
                        {_id: ObjectId(context.responseid)}, 
                        { $inc: { used: 1 } }
                    )
                    let responsemessage
                    responsemessage = {responseid: response._id.toString(), contextid: context._id.toString(), message: response.message, datetime: new Date()}
                    sendTaskChatMessage(profileid, args.taskid, responsemessage, 'chatbot', getwheelid(req.session)) //userid is chatbot.
                }
            }
            return true
        }
    }
}

async function sendTaskChatMessage(profileid, taskid, message, userid, wheelid) {
    const db = await DbConnection.Get()
    const Chats = db.collection('chats')
    const Views = db.collection('views')
    const chat = await Chats.findOne({ taskid: taskid })

    const wheelviews = await Views.find({wheel: wheelid}).toArray() //subscribe all people with a view to the wheel to chat updates.
    const subscribelist = wheelviews.map(view => view.user).filter(user => user !== userid) //filter out this user's ID.

    if (!chat) {
        await Chats.insert( //create first record if it doesn't exist.
            { 
                wheelid: wheelid,
                profileid: profileid,
                taskid: taskid,
                started: new Date(),
                lastmessage: message,
                firstmessage: message,
                subscribe: subscribelist,
                unseen: subscribelist,
                messages: [message]
            })
    } else {
        Chats.updateOne(
            { taskid: taskid, profileid: profileid },
            {
                $set: {
                    lastmessage: message,
                    unseen: subscribelist
                },
                $push: {
                    messages: message
                }
            }
        )}
    }


export async function getunreadmessageusers() {
    const db = await DbConnection.Get()
    const Chats = db.collection('chats')
    const chats = await Chats.find({ unseen: {$ne: null} }).toArray()

    var unseen = []
    chats.map(chat => chat.unseen.map(userid => unseen.push(userid))) //only getting userid.
    //.push({userid: userid, chatid: chat._id}) to get all chats.

    const send = [...new Set(unseen)] //reduce duplicates
    
    //if we want more information on the email this could be one way to form the data to reference the chats.
    /* const send = unseen.reduce(function (r, a) { 
        r[a.userid] = r[a.userid] || [];
        r[a.userid].push(a);
        return r;
    }, []); */

    const Users = db.collection('users')
    const users = await Users.find({_id: { $in: send.map(function(id) { return ObjectId(id) })}}).toArray()

    return users
}