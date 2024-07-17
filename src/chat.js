import DbConnection from './database'
import { getprofileid, getuserid, getwheelid } from './users'
import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';
import { shiftTZ, startOfDay } from '../util/functions';

export const schema = `
    type Prompt {
        _id: String
        message: String
        responses: [Response]
        variants: [Variant]
    }
    type Variant {
        _id: String
        message: String
        promptid: String
        prompt: Prompt
        responses: [Response]
    }
    type Response {
        _id: String
        message: String
        context: ChatContext
        taskid: String
        prompts: [Prompt]
    }
    type ChatContext {
        _id: String
        prompt: Prompt
        response: Response
    }
    type Chat {
        _id: String
        task: Task
        started: String
        messages: [Message]
        userid: String
        area: Area
        day: String
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
        promptid: String
        variantid: String
    }
    type Feedback {
        _id: String
        message: String
        time: String
        feedback: String
        responseid: String
        promptid: String
        chatid: String
        contextid: String
        variantid: String
        variant: Variant
        response: Response
    }
`

export const typeDefs = `
    extend type Query {
        chatprompts(search: String): [Prompt]
        chatvariants(search: String): [Variant]
        getchat(chatid: String): Chat
        gettaskchatid(taskid: String): String
        getdaychatid(date: String): String
        getareachatid(area: String): String
        taskchatunseen(taskid: String!): Boolean
        anychatunseen: Boolean
        getchats: [Chat]
        getfeedback: [Feedback]
        getresponse(responseid: String!): Response
        getprompt(promptid: String!): Prompt
        getresponses(search: String): [Response]
        getprompts(search: String): [Prompt]
        getvariants(search: String): [Variant]
    }

    extend type Mutation {
        sendChatPrompt(chatid: String, wrote: String, variantid: String): Boolean
        sendChatMessage(chatid: String, message: String!): Boolean
        sendRating(contextid: String, chatid: String!, rating: Int!, ratemessage: String, original: String): Boolean
        sendFeedback(contextid: String, promptid: String, responseid: String, variantid: String, chatid: String!, feedback: String!, message: String!): Boolean
        archivechat(chatid: String!): Boolean

        ackfeedback(feedbackid: String!): Boolean
        updateVariant(variantid: String!, message: String!): Boolean
        updateResponse(responseid: String!, message: String!): Boolean
        updatePrompt(promptid: String!, message: String!): Boolean
        createVariant(promptid: String!, newvariant: String!): Boolean
        createPrompt(responseid: String, newprompt: String!): Boolean
        createResponse(promptid: String, newresponse: String!): Boolean
        linkPromptResponse(promptid: String!, responseid: String!): Boolean
        blockPromptResponse(promptid: String!, responseid: String!): Boolean
    }
`

//tagChat(chatid: String, areatags: [String]): Boolean

export const resolvers = {
    Query: {
        chatprompts: async(_, {search}, { req }) => {
            //autocomplete for chat coaching.
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
        chatvariants: async(_, {search}, { req }) => {
            //autocomplete for chat coaching.
            const db = await DbConnection.Get()
            const Variants = db.collection('chatvariants')
            const regex = /\b[\S]+\b$/;
            const match = search.trim().match(regex)
            const lastword = match ? match[0] : null;
            if (lastword && lastword.length > 2){
                const variants = await Variants.find({message: new RegExp('.*' + lastword + '.*', 'i')})
                return variants.toArray()
            } else return null
        },
        /* promptsuggest: async(_, {search}, { req }) => {
            
            const db = await DbConnection.Get()
            const Prompts = db.collection('chatprompts')
            const prompts = await Prompts.find({message: new RegExp('.*' + search.trim() + '.*')})
            return prompts.toArray()
        }, */
/*         getchatid: async(_, __, { req }) => {
            //if no chatid or taskid, create new chat.
            const chatid = await startChat({
                profileid: getprofileid(req.session), 
                userid: getuserid(req.session), 
                wheelid: getwheelid(req.session)
            })
            return chatid.toString()
        }, */
        gettaskchatid: async(_, {taskid}, { req }) => {
            //get chat id.
            
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
            const chatid = await startChat({
                profileid: getprofileid(req.session), 
                userid: getuserid(req.session), 
                wheeldid: getwheelid(req.session),
                taskid
            })
            return chatid.toString()
        },
        getdaychatid: async(_, {date}, { req }) => {
            //get chat id.
            
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')

            const day = startOfDay(shiftTZ({datetime: new Date(date), timezoneOffset: +11})) //shifting the datetime by timezoneOffset for UTC server. Then reading the date.

            if (date){ //if taskid, check existing chat for the taskid.
                const chat = await Chats.findOne({day: day, profileid: profileid})
                if (chat) {
                    return chat._id.toString()
                }
            }
            //if no day, create new chat with today's date.
            const chatid = await startChat({
                profileid: getprofileid(req.session), 
                userid: getuserid(req.session), 
                wheelid: getwheelid(req.session),
                day
            })
            return chatid.toString()
        },
        getareachatid: async(_, {area}, { req }) => {
            //get chat id.
            
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')

            if (area){ //if taskid, check existing chat for the taskid.
                const chat = await Chats.findOne({area: area, profileid: profileid})
                if (chat) {
                    return chat._id.toString()
                }
            }
            //if no day, create new chat with today's date.
            const chatid = await startChat({
                profileid: getprofileid(req.session), 
                userid: getuserid(req.session), 
                wheelid: getwheelid(req.session),
                area
            })
            return chatid.toString()
        },
        getchat: async(_, {chatid}, { req }) => {
            //get chat id.
            
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            if (chatid){ //if chatid, check existing chat for the chatid.
                const chat = await Chats.findOne({_id: new ObjectId(chatid), profileid: profileid})
                if (chat !== undefined) {
                    const userid = getuserid(req.session)
                    chat.userid = userid
                    if (chat.unseen)
                        if(chat.unseen.includes(userid)){ //if not already seen, update seen status.
                            Chats.updateOne(
                                {_id: new ObjectId(chatid), profileid: profileid},
                                {$pull: {unseen: userid}}
                            )
                        }
                    return chat
                }
            } else return triggererror('Chat not found.')
        },
        getchats: async(_, args, { req }) => {
            
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            const chats = await Chats.find({profileid: profileid, messages: {$exists: true}, archive: {$ne: true}}).sort({ 'lastmessage.datetime': -1 }).toArray()
            //const userid = getuserid(req.session)
            //next order by unread, then last message. 'unseen.' + userid
            return chats
        },
        taskchatunseen: async(_, args, { req }) => { //check if task chat has been unseen by user.
            
            const profileid = getprofileid(req.session)
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            const userid = getuserid(req.session)
            const chat = await Chats.findOne({taskid: args.taskid, profileid: profileid, unseen: userid})
            if (chat){return true}
            else return false
        },
        anychatunseen: async(_, args, { req }) => { //check if task chat has been unseen by user.
            
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')
            const profileid = getprofileid(req.session)
            const userid = getuserid(req.session)

            const chat = await Chats.findOne({profileid: profileid, unseen: userid})
            if (chat) {return true} //check if user has seen this chat.
            else return false
        },
        getfeedback: async(_,args,{req}) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatFeedback = db.collection('chatfeedback')
                const feedbacks = await ChatFeedback.find({'ack': {$ne: true}}).toArray()
                return feedbacks
            }
        },
        getprompt: async(_, args, {promptid}) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatPrompts = db.collection('chatprompts')
                const chatprompt = await ChatPrompts.find({_id: new ObjectId(promptid)})
                return chatprompt
            } 
        },
        getresponse: async(_, args, {responseid}) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatResponses = db.collection('chatresponses')
                const chatresponse = await ChatResponses.find({_id: new ObjectId(responseid)})
                return chatresponse
            } 
        },
        getresponses: async(_, {search}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatResponses = db.collection('chatresponses')
                let query = {}
                if (search) query = {message: new RegExp('.*' + search + '.*', 'i')}
                const chatresponses = await ChatResponses.find(query).toArray()
                return chatresponses 
            } 
        },
        getprompts: async(_, {search}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatPrompts = db.collection('chatprompts')
                let query = {}
                if (search) query = {message: new RegExp('.*' + search + '.*', 'i')}
                const chatprompts = await ChatPrompts.find(query).toArray()
                return chatprompts
            } 
        },
        getvariants: async(_, {search}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatVariants = db.collection('chatvariants')
                let query = {}
                if (search) query = {message: new RegExp('.*' + search + '.*', 'i')}
                const chatvariants = await ChatVariants.find(query).toArray()
                return chatvariants
            } 
        }
    },
    Variant: {
        prompt: async({promptid}, __, { req }) => {
            const db = await DbConnection.Get()
            const Prompts = db.collection('chatprompts')
            return await Prompts.findOne({_id: new ObjectId(promptid)})
        },
        responses: async({_id}, __, { req }) => {
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const Responses = db.collection('chatresponses')
            const contexts = await ChatContext.find({promptid: _id.toString()}).toArray()
            const responses = await Responses.find({_id: {$in: contexts.map(context => new ObjectId(context.responseid))}}).toArray()
                
            return responses
        }
    },
    Prompt: {
        responses: async({_id}, __, { req }) => {
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const Responses = db.collection('chatresponses')
            const contexts = await ChatContext.find({promptid: _id.toString()}).toArray()
            const responses = await Responses.find({_id: {$in: contexts.map(context => new ObjectId(context.responseid))}}).toArray()
                
            return responses
        },
        variants: async({_id}, __, { req }) => {
            const db = await DbConnection.Get()
            const ChatVariants = db.collection('chatvariants')
            return await ChatVariants.find({promptid: _id.toString()}).toArray()
        }
    },
    Response: {
        prompts: async({_id}, __, { req }) => {
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const Prompts = db.collection('chatprompts')
            const contexts = await ChatContext.find({responseid: _id.toString()}).toArray()
            const prompts = await Prompts.find({_id: {$in: contexts.map(context => new ObjectId(context.promptid))}}).toArray()
                
            return prompts
        }
    },
    ChatContext: {
        prompt: async({promptid}, __, { req }) => {
            const db = await DbConnection.Get()
            const Prompts = db.collection('chatprompts')
            return await Prompts.findOne({_id: new ObjectId(promptid)})
        },
        response: async({responseid}, __, { req }) => {
            const db = await DbConnection.Get()
            const Responses = db.collection('chatresponses')
            return await Responses.findOne({_id: new ObjectId(responseid)})
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
            if (taskid) return await Tasks.findOne({_id: new ObjectId(taskid)})
            else return null
        },
        area: async({area}, __, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            if (area) return await Areas.findOne({_id: new ObjectId(area)})
            else return null
        },
    },
    Message: {
        name: async({userid, responseid}, __, { req }) => {
            if (userid){
                if (userid === getuserid(req.session)) return null
                const db = await DbConnection.Get()
                const Users = db.collection('users')
                const user = await Users.findOne({_id: new ObjectId(userid)})
                
                if (user !== null) return user.firstname
                else return 'unknown'}
            else {
                if (responseid) return 'SliceGoal'
                else return null
            }
        }
    },
    Feedback: {
        variant: async({variantid}, __, { req }) => {
            const db = await DbConnection.Get()
            const Variants = db.collection('chatvariants')
            if (variantid) return await Variants.findOne({_id: new ObjectId(variantid)})
            else return null
        },
        response: async({responseid}, __, { req }) => {
            const db = await DbConnection.Get()
            const Responses = db.collection('chatresponses')
            if (responseid) return await Responses.findOne({_id: new ObjectId(responseid)})
            else return null
        }
    },
    Mutation: {
        updateVariant: async(root, args, { req }) => {
            const db = await DbConnection.Get()
            const ChatVariants = db.collection('chatvariants')
            ChatVariants.updateOne(
                { _id: new ObjectId(args.variantid) },
                { 
                    $set: { message: args.message},
                }
            )  
        },
        updateResponse: async(root, args, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatResponses = db.collection('chatresponses')
                ChatResponses.updateOne(
                    { _id: new ObjectId(args.responseid) },
                    { 
                        $set: { message: args.message },
                    }
                )  
            } else triggererror('Not available.')
        },
        updatePrompt: async(root, args, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatPrompts = db.collection('chatprompts')
                ChatPrompts.updateOne(
                    {_id: new ObjectId(args.promptid)}, 
                    {$set: {message: args.message}}
                )
            }
        },
        sendRating: async(root, args, { req }) => {
            const userid = getuserid(req.session)
            const profileid = getprofileid(req.session)

            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const ChatFeedback = db.collection('chatfeedback')
            
            if (args.contextid) { //rate context if there is a context.
                const context = await ChatContext.findOne({_id: new ObjectId(args.contextid)})
            
                let newrating = 0
                if (context.ratingweight > -1) {
                    const oldrating = context.ratingweight 
                    newrating = (args.rating + (oldrating * context.ratingcount))/(context.ratingcount + 1) //average of all ratings + this rating.
                } else {newrating = args.rating}

                ChatContext.updateOne(
                    { _id: new ObjectId(args.contextid) },
                    { 
                        $set: { ratingweight: newrating},
                        $inc: { ratingcount: 1 },
                        $push: {
                            ratings: {
                                message: args.ratemessage,
                                rating: args.rating,
                                time: new Date(),
                                original: args.original
                            }
                        },
                    }
                )
            }

            ChatFeedback.insertOne({
                feedback: args.ratemessage,
                rating: args.rating,
                time: new Date(),
                message: args.original,
                chatid: args.chatid,
                contextid: args.contextid,
                userid: userid,
                profileid: profileid
            })

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
        sendFeedback: async(root, {variantid, contextid, responseid, promptid, chatid, feedback, message}, { req }) => {
            
            const db = await DbConnection.Get()
            const ChatFeedback = db.collection('chatfeedback')
            const ChatContext = db.collection('chatcontext')
            const userid = getuserid(req.session)
            const profileid = getprofileid(req.session)
            let findcontext

            if(contextid && !promptid) {
                findcontext = await ChatContext.findOne({_id: new ObjectId(contextid)})
            }

            ChatFeedback.insertOne({
                feedback: feedback,
                time: new Date(),
                message: message,
                chatid: chatid,
                contextid: contextid,
                responseid: responseid,
                variantid: variantid,
                promptid: promptid ? promptid : (findcontext ? findcontext.promptid : null),
                userid: userid,
                profileid: profileid
            })

            return true
        },
        ackfeedback: async(root, {feedbackid}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatFeedback = db.collection('chatfeedback')
                ChatFeedback.updateOne({_id: new ObjectId(feedbackid)},{$set: {ack: true}})
            }
        },
        createVariant: async(root, {promptid, newvariant}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatVariants = db.collection('chatvariants')
                ChatVariants.insertOne({promptid: promptid, message: newvariant})
                return true
            }
        },
        createPrompt: async(root, {responseid, newprompt}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatPrompts = db.collection('chatprompts')
                const insertedprompt = await ChatPrompts.insertOne({message: newprompt})
                const ChatVariants = db.collection('chatvariants')
                ChatVariants.insertOne({promptid: insertedprompt.insertedId.toString(), message: newprompt})
                if(responseid) {
                    const ChatContext = db.collection('chatcontext')
                    ChatContext.insertOne(
                        {
                            promptid: insertedprompt.insertedId.toString(),
                            responseid: responseid
                        }
                    )
                }
                return true
            }
        },
        createResponse: async(root, {promptid, newresponse}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatResponses = db.collection('chatresponses')
                const insertedresponse = await ChatResponses.insertOne({message: newresponse})
                if(promptid) {
                    const ChatContext = db.collection('chatcontext')
                    ChatContext.insertOne(
                        {
                            promptid: promptid,
                            responseid: insertedresponse.insertedId.toString()
                        }
                    )
                }
                return true
            }
        },
        linkPromptResponse: async(root, {promptid, responseid}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatContext = db.collection('chatcontext')
                ChatContext.insertOne(
                    {
                        promptid: promptid,
                        responseid: responseid
                    }
                )
                return true
            }
        },
        blockPromptResponse: async(root, {promptid, responseid}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
                const db = await DbConnection.Get()
                const ChatContext = db.collection('chatcontext')
                ChatContext.updateMany({promptid: promptid, responseid: responseid}, {$set: {block: true}})
                return true
            }
        },
        archivechat: async(root, {chatid}, { req }) => {
                const db = await DbConnection.Get()
                const Chats = db.collection('chats')
                Chats.updateOne({_id: new ObjectId(chatid), profileid: getprofileid(req.session)},{$set: {archive: true}})
                return true
        },
        sendChatMessage: async(root, args, { req }) => {
            
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
            
            const db = await DbConnection.Get()
            const ChatContext = db.collection('chatcontext')
            const Prompts = db.collection('chatprompts')
            const Variants = db.collection('chatvariants')
            const Response = db.collection('chatresponses')
            const profileid = getprofileid(req.session)
            const userid = getuserid(req.session)
            
            try {
                //find all the responses linked to the prompt.
                const variant = await Variants.findOne({_id: new ObjectId(args.variantid)})
                if (!variant) triggererror("Prompt not found.")
                //const prompt = await Prompts.findOne({_id: new ObjectId(args.promptid)})
                
                Prompts.updateOne( //update data on prompt usage.
                    { _id: new ObjectId(variant.promptid) },
                    { 
                        $inc: {selected: 1 },
                        $push: {triggered: new Date()},
                        $set: {lasttriggered: new Date()},
                        $inc: {[variant._id]: 1}
                    }
                )
                Variants.updateOne( //update data on prompt usage.
                    { _id: new ObjectId(args.variantid) },
                    { 
                        $inc: {selected: 1 },
                        $push: {wrote: args.wrote},
                        $push: {triggered: new Date()},
                        $set: {lasttriggered: new Date()},
                    }
                )

                //record sent prompt to the chat.
                const promptmessage = {promptid: variant.promptid, variantid: args.variantid, message: variant.message, wrote: args.wrote, userid: userid, datetime: new Date()}
                await sendTaskChatMessage(profileid, args.chatid, promptmessage, userid, getwheelid(req.session))

                const contexts = await ChatContext.find({promptid: variant.promptid, block: {$ne: true}}).sort({ ratingweight: -1 }).toArray()

                if (contexts) {
                    ChatContext.updateMany(
                        {promptid: variant.promptid},
                        {
                            $inc: {matched:1},
                            $push: {triggered: new Date()},
                            $set: {lasttriggered: new Date()}
                        }
                    )
                    const responses = await Response.find( //find and update multiple responses
                        {_id: {
                            $in: contexts.map(function(context) {
                                if (context.responseid) return new ObjectId(context.responseid)
                            })}
                        }
                    ).toArray()
                    if (responses) {
                        //update the increment.
                        //{ $inc: { used: 1 } } //increment used flag

                        //create messages for the chat.
                        const responsemessages = responses.map(response => {
                            return {
                                variantid: args.variantid,
                                promptid: variant.promptid,
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
                } else {
                    //no response
                }
                return true
            } catch(error) {
                triggererror("Prompt failed for some reason.")
                return false //just return true.
            }
        }
    }
}

async function sendTaskChatMessage(profileid, chatid, message, userid, wheelid) {
    const db = await DbConnection.Get()
    const Chats = db.collection('chats')
    const Views = db.collection('views')
    const chat = await Chats.findOne({ _id: new ObjectId(chatid) })

    const wheelviews = await Views.find({wheel: wheelid}).toArray() //subscribe all people with a view to the wheel to chat updates.
    const subscribelist = wheelviews.map(view => view.user).filter(user => user !== userid) //filter out this user's ID.

    if (chat) {
        Chats.updateOne(
            { _id: new ObjectId(chatid), profileid: profileid },
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

async function startChat({profileid, taskid, userid, wheelid, day, area}){
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
    //link chat to task, area, or day. Default to day.
    if (taskid) chat.taskid = taskid
    if (area) chat.area = area
    if (!taskid && !area) {
        if (day) chat.day = day
        else chat.day = startOfDay(shiftTZ({datetime: new Date(), timezoneOffset: +11})) //shifting the datetime by timezoneOffset for UTC server. Then reading the date.
    }
    const chatsaved = await Chats.insertOne(chat)
    return chatsaved.insertedId
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
    const users = await Users.find({_id: { $in: send.map(function(id) { return new ObjectId(id) })}}).toArray()

    return users
}