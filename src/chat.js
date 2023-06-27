import DbConnection from './database'
import { getprofileid, getuserid, getwheelid } from './users'
import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';

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
        chatprompts(search: String): [Prompt]
        getchat(chatid: String): Chat
        getchatid(taskid: String): String
        taskchatunseen(taskid: String!): Boolean
        anychatunseen: Boolean
        getchats: [Chat]
    }

    extend type Mutation {
        sendChatPrompt(chatid: String, promptid: String, message: String): Boolean
        sendChatMessage(chatid: String, message: String!): Boolean
        sendRating(contextid: String, chatid: String!, rating: Int!, ratemessage: String, original: String): Boolean
    }
`

export const resolvers = {
    Query: {
        chatprompts: async(_, {search}, { req }) => {
            //autocomplete for chat coaching.
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Prompts = db.collection('chatprompts')
            const regex = /\b[\S]+\b$/;
            const match = search.trim().match(regex)
            const lastword = match ? match[0] : null;
            if (lastword && lastword.length > 2){
                const prompts = await Prompts.find({message: new RegExp('.*' + lastword + '.*', 'i')})
                return prompts.toArray()
            } else return null
        },
        /* promptsuggest: async(_, {search}, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const Prompts = db.collection('chatprompts')
            const prompts = await Prompts.find({message: new RegExp('.*' + search.trim() + '.*')})
            return prompts.toArray()
        }, */
        getchatid: async(_, {taskid}, { req }) => {
            //get chat id.
            if (!req.session.user) return triggererror('Invalid Session')
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')

            if (taskid){ //if taskid, check existing chat for the taskid.
                const chat = await Chats.findOne({taskid: taskid, profileid: profileid})
                if (chat) {
                    return chat._id.toString()
                }
            }
            //if no chatid or taskid, create new chat.
            const chat = await startChat(
                getprofileid(req.session), 
                taskid,
                getuserid(req.session), 
                getwheelid(req.session)
            )
            console.log('new chat')
            console.log(chat)
            return chat._id.toString()
        },
        getchat: async(_, {chatid}, { req }) => {
            //get chat id.
            if (!req.session.user) return triggererror('Invalid Session')
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            if (chatid){ //if chatid, check existing chat for the chatid.
                const chat = await Chats.findOne({_id: ObjectId(chatid), profileid: profileid})
                if (chat !== undefined) {
                    const userid = getuserid(req.session)
                    chat.userid = userid
                    if (chat.unseen)
                        if(chat.unseen.includes(userid)){ //if not already seen, update seen status.
                            Chats.updateOne(
                                {_id: ObjectId(chatid), profileid: profileid},
                                {$pull: {unseen: userid}}
                            )
                        }
                    return chat
                }
            } else return triggererror('Chat not found.')
        },
        getchats: async(_, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            const chats = await Chats.find({profileid: profileid, messages: {$exists: true}}).sort({ 'lastmessage.datetime': -1 }).toArray()
            //const userid = getuserid(req.session)
            //next order by unread, then last message. 'unseen.' + userid
            return chats
        },
        taskchatunseen: async(_, args, { req }) => { //check if task chat has been unseen by user.
            if (!req.session.user) return triggererror('Invalid Session')
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            const userid = getuserid(req.session)
            const chat = await Chats.findOne({taskid: args.taskid, profileid: profileid, unseen: userid})
            if (chat){return true}
            else return false
        },
        anychatunseen: async(_, args, { req }) => { //check if task chat has been unseen by user.
            if (!req.session.user) return triggererror('Invalid Session')
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
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            /* const userid = getuserid(req.session)
            const profileid = getprofileid(req.session) */
            
            if (args.contextid) { //rate context if there is a context.
                const context = await ChatContext.findOne({_id: ObjectId(args.contextid)})
            
                let newrating = 0
                if (context.match > -1) {
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
            /* const message = {
                contextid: args.contextid,
                message: args.ratemessage,
                rating: args.rating,
                datetime: new Date(),
                type: 'rating',
                userid: getuserid(req.session),
                original: args.original
            } */
            //sendTaskChatMessage(profileid, args.chatid, message, userid, getwheelid(req.session))
            return true
        },
        sendChatMessage: async(root, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            if (args.message){
                const userid = getuserid(req.session)
                const profileid = getprofileid(req.session)
                const message = { //create message structure.
                    message: args.message,
                    datetime: new Date(),
                    userid: userid
                }
                sendTaskChatMessage(profileid, args.chatid, message, userid, getwheelid(req.session))
            }
            return true
        },
        sendChatPrompt: async(root, args, { req }) => {
            if (!req.session.user) return triggererror('Invalid Session')
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const Prompts = db.collection('chatprompts')
            const Response = db.collection('chatresponses')
            const profileid = getprofileid(req.session)
            const userid = getuserid(req.session)
            
            try {

                const promptmessage = {promptid: args.promptid, message: args.message, userid: userid, datetime: new Date()}
                
                Prompts.updateOne( //update data on prompt usage.
                    { _id: ObjectId(args.promptid) },
                    { $inc: { selected: 1 } }
                )
                //record sent prompt to the chat.
                await sendTaskChatMessage(profileid, args.chatid, promptmessage, userid, getwheelid(req.session))
                //find all the responses linked to the prompt.
                const contexts = await ChatContext.find({promptid: args.promptid}).toArray()

                if (contexts) {
                    const responses = await Response.find( //find and update multiple responses
                        {_id: {
                            $in: contexts.map(function(context) {
                                if (context.responseid) return ObjectId(context.responseid)
                            })}
                        }
                    ).sort({ match: -1 }).toArray()
                    if (responses) {
                        //update the increment.
                        //{ $inc: { used: 1 } } //increment used flag

                        //create messages for the chat.
                        const responsemessages = responses.map(response => {
                            return {
                                responseid: response._id.toString(), 
                                contextid: contexts.find(context => context.responseid === response._id.toString())._id.toString(), //find the context with the responseid.
                                message: response.message, 
                                datetime: new Date()
                            }
                        })
                        responsemessages.map(responsemessage => 
                            //userid is chatbot.
                            sendTaskChatMessage(profileid, args.chatid, responsemessage, 'chatbot', getwheelid(req.session))
                        )
                    }
                }
                return true
            } catch(error) {
                //could log this if necessary.
                return true //just return true.
            }
        }
    }
}

async function sendTaskChatMessage(profileid, chatid, message, userid, wheelid) {
    const db = await DbConnection.Get()
    const Chats = db.collection('chats')
    const Views = db.collection('views')
    const chat = await Chats.findOne({ _id: ObjectId(chatid) })

    const wheelviews = await Views.find({wheel: wheelid}).toArray() //subscribe all people with a view to the wheel to chat updates.
    const subscribelist = wheelviews.map(view => view.user).filter(user => user !== userid) //filter out this user's ID.

    if (chat) {
        Chats.updateOne(
            { _id: ObjectId(chatid), profileid: profileid },
            {
                $set: {
                    lastmessage: message,
                    unseen: subscribelist
                },
                $push: {
                    messages: message
                }
            }
        )
    }
}

async function startChat(profileid, taskid, userid, wheelid){
    const db = await DbConnection.Get()
    const Chats = db.collection('chats')
    const Views = db.collection('views')
    const wheelviews = await Views.find({wheel: wheelid}).toArray() //subscribe all people with a view to the wheel to chat updates.
    const subscribelist = wheelviews.map(view => view.user).filter(user => user !== userid) 
    //filter out this user's ID. Only being used for visibility on messages at the moment.
    //could use it for visibility of chat altogether.

    let chat = new Object({ 
        wheelid: wheelid,
        usercreated: userid,
        profileid: profileid,
        started: new Date(),
        subscribe: subscribelist,
    })
    if (taskid) chat.taskid = taskid
    const newchat = (await Chats.insert(chat)).ops[0]
    console.log(newchat)
    return newchat
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