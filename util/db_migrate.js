import DbConnection from '../src/database'
import axios from 'axios'
const cheerio = require("cheerio")
//import { ObjectId } from 'mongodb'
//import { triggererror } from '../src/graphqlserver'
//import { startOfDayTZ } from './functions'
//import { getprofileid } from '../src/users';
//use playground http://localhost:3001/ and run mutation: "mutation{runUpdate}"

export const typeDefs = `
    extend type Mutation {
        migrateLinkInsights: Boolean
    }`

async function getWebpageTitle(url) {
    try {
        const response = await axios.get(url)
        const $ = cheerio.load(response.data)
        return $('title').text()
    } catch (error) {
        console.error('Error fetching webpage:', error)
        return "No Title"
    }
}

export const resolvers = {
    Mutation: {
        migrateLinkInsights: async(_, __, { req }) => {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')
            const Insights = db.collection('insights')
            const insights = await Insights.find({answer: {$regex: "^https?:\/\/[^\r\n]+"}, splitURLs: true}).toArray();
            
            insights.map(async insight => {
                // Extract URLs from the insight answer
                const urlRegex = /https?:\/\/[^\s/$.?#].[^\s]*/g;
                const urls = insight.answer.match(urlRegex);

                if (urls && urls.length > 0) {
                    // Insert a new source for each URL found
                    urls.forEach(async (url) => {
                        const title = await getWebpageTitle(url);
                        await Sources.insertOne({
                            profileid: insight.profileid,
                            name: title,
                            url: url,
                            datetime: insight.datecreated,
                            type: "Webpage",
                            fromsource: true
                        });
                    });

                    // Delete the original insight
                    //await Insights.deleteOne({_id: insight._id});
                }
            })
        }
        /* deleteAllOldTags: async(_, __, { req }) => {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')
            const Tasks = db.collection('tasks')
            Sources.update({}, { $unset: { tags: []} }, {multi: true})
            Tasks.update({}, { $unset: { tags: [], sources: [], insights: []} }, {multi: true})
        } */
        /* migrateDBAllTags: async(_, __, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){ //only allow my profile to run migration script: staging + prod.
                const db = await DbConnection.Get()
                const SourceTags = db.collection('sourcetags')
                const GoalTags = db.collection('goaltags')
                const Sources = db.collection('sources')
                const Tasks = db.collection('tasks')
                const InsightTags = db.collection('insighttags')
                
                
                SourceTags.find().forEach(function(doc) {
                    let newtag = new Object()
                    //mapping sourcetags to insighttags
                    newtag = {
                        profileid: doc.profileid, 
                        insightid: doc.resourceid,
                        sourceid: doc.sourceid,
                        datecreated: doc.created
                    }
                    if (doc.datetime)  newtag.updated = doc.datetime
                    if (doc.note) newtag.notes = doc.note
                    if (doc.pinned) newtag.pinned = doc.pinned

                    InsightTags.insertOne(newtag);
                });

                GoalTags.find().forEach(function(doc) {
                    let newtag = new Object()
                    //mapping sourcetags to insighttags
                    newtag = {
                        profileid: doc.profileid, 
                        goalid: doc.goalid,
                        area: doc.areaid,
                        datecreated: doc.datecreated,
                    }
                    if (doc.complete)  newtag.complete = doc.complete
                    if (doc.notes) newtag.notes = doc.notes
                    if (doc.lastupdated) newtag.updated = doc.lastupdated   
                    if (doc.orderrank) newtag.orderrank = doc.orderrank   
                    if (doc.snooze) newtag.snooze = doc.snooze   

                    InsightTags.insertOne(newtag);
                });

                Sources.find({tags: {$ne: null}}).forEach(function(doc) {
                    
                    if (doc.tags) {
                        doc.tags.map(tag => {
                            let newtag = new Object()
                            //mapping sourcetags to insighttags
                            newtag = {
                                profileid: doc.profileid, 
                                sourceid: doc._id.toString(),
                                area: tag,
                                datecreated: new Date(),
                            }

                            InsightTags.insertOne(newtag);
                        })
                    }
                });
 
                Tasks.find({}).forEach(function(doc) {
                    
                    if (doc.tags) {
                        doc.tags.map(tag => {
                            let newtag = new Object()
                            //mapping sourcetags to insighttags
                            newtag = {
                                profileid: doc.profileid, 
                                taskid: doc._id.toString(),
                                area: tag,
                                datecreated: new Date(),
                            }

                            InsightTags.insertOne(newtag);
                        })
                    }

                    if (doc.insights) {
                        doc.insights.map(tag => {
                            let newtag = new Object()
                            //mapping sourcetags to insighttags
                            newtag = {
                                profileid: doc.profile, 
                                taskid: doc._id.toString(),
                                insightid: tag,
                                datecreated: new Date(),
                            }

                            InsightTags.insertOne(newtag);
                        })
                    }

                    if (doc.sources) {
                        doc.sources.map(tag => {
                            let newtag = new Object()
                            //mapping sourcetags to insighttags
                            newtag = {
                                profileid: doc.profileid, 
                                taskid: doc._id.toString(),
                                sourceid: tag,
                                datecreated: new Date(),
                            }

                            InsightTags.insertOne(newtag);
                        })
                    }
                });
                
                return true 
            }
            return false
        }, */


        /* migrateDBchatPromptsToVariants: async(_, __, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){ //only allow my profile to run migration script: staging + prod.
                const db = await DbConnection.Get()
                const ChatPrompts = db.collection('chatprompts')
                const ChatVariants = db.collection('chatvariants')
                
                ChatPrompts.find().forEach(function(doc) {
                    ChatVariants.insertOne(
                        {
                            message: doc.message,
                            promptid: doc._id.toString()
                        }
                    );
                });
            }
        } */
        /* migrate: async() => {
            //any migration script here.
        } */ 
       /*  migrateDBSourceTags: async(_, __, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){ //only allow my profile to run migration script: staging + prod.
                const db = await DbConnection.Get()
                const SourceTags = db.collection('sourcetags')
                
                SourceTags.find().forEach(function(doc) {
                    // Extract the timestamp from the ObjectId
                    var createdDate = doc._id.getTimestamp();

                    // Update the document with the new 'created' field
                   SourceTags.updateOne(
                        { _id: doc._id },
                        { $set: { created: createdDate } }
                    );
                });
            } 
        } */
        /* migrateUpdateGoalLinkedReference: async() => {
            const db = await DbConnection.Get()
            const GoalLinks = db.collection('goallinks')
            const Goals = db.collection('goals')

            const links = await GoalLinks.find({}).toArray()
            links.map(link => {
                Goals.updateOne({_id: new ObjectId(link.goal)}, {$set: {linkreferenced: true}})
            })

            //GoalTimes.updateMany({}, { $rename: { userid: 'profileid' } })
            return true
        } */
        /* migrateUpdateGoalTimesUserIDs: async() => {
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')

            GoalTimes.updateMany({}, { $rename: { userid: 'profileid' } })
            return true
        } */
        //updateAreaToSource(areaid: String, resource: String, profileid: String): Boolean
        /* updateTaskLinks: async(parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')

            const taskwithlinks = await Tasks.find({'tasks': {$exists: true}}).toArray();
                taskwithlinks.map(task => {
                    task.tasks.map(subtask => {
                        let newtasklink = {
                            profileid: task.profile,
                            parenttask: task._id.toString(),
                            subtask: subtask,
                            created: new Date()
                        }
                        TaskLinks.insertOne(newtasklink)}
                    )
                    Tasks.updateOne(
                        { _id: task._id },
                        { $unset: { tasks: []} },
                    )
                })
            return true
        } */
        /* updateAreaToSource: async(parent, args, { req }) => {
            
            if (args.profileid !== getprofileid(req.session)) return triggererror('Wrong profile')

            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const Sources = db.collection('sources')
            const InsightTags = db.collection('insighttags')
            const SourceTags = db.collection('sourcetags')
            //prod profileid = '5d2adcf120f52b0d7d7faba0'
            
            try {
                const Area = await Areas.findOne({_id: new ObjectId(args.areaid)});

                let newsource = {
                    profileid: args.profileid,
                    name: Area.name,
                    notes: Area.definition,
                    datetime: Area.created,
                    type: args.resource
                }

                let source = await Sources.insertOne(newsource);
                let newsourceid = source.insertedId.toString()

                const insighttags = await InsightTags.find({area: args.areaid}).toArray();
                insighttags.map(insighttag => {
                    let newsourcetag = {
                        sourceid: newsourceid,
                        resourceid: insighttag.insightid,
                        datetime: insighttag.datecreated,
                        note: insighttag.notes,
                        profileid: args.profileid,
                        resourcetype: "insight"
                    }
                    SourceTags.insertOne(newsourcetag)
                })
            } catch (error) {
                console.log(error)
                return triggererror('error updating area to source')
            }

            await InsightTags.deleteMany({area: args.areaid})
            await Areas.deleteOne({_id: new ObjectId(args.areaid)})
            
            return true
        } */
    }
}

/* Past Updates Below...

**Update 1:**
Areas.updateMany({}, { $rename: { userid: 'wheelid' } })
Areas.updateMany({}, { $rename: { userid: 'wheelid' } })
AreaTags.updateMany({}, { $rename: { userid: 'wheelid' } })
RankTimes.updateMany({}, { $rename: { userid: 'profileid' } })
Insights.updateMany({}, { $rename: { userid: 'profileid' } })
InsightTags.updateMany({}, { $rename: { userid: 'profileid' } })
Goals.updateMany({}, { $rename: { userid: 'profileid' } })
GoalTags.updateMany({}, { $rename: { userid: 'profileid' } })

**Update 2:**
const users = await Users.find().toArray();
users.map(async user => {
//create new view
if (user.startarea) {
    let newwheel = {
    _id: user._id,
    user: user._id.toString(),
    email: user.email,
    startarea: user.startarea,
    name: "my wheel"
    };
    let wheel = await Wheels.insertOne(newwheel);

    let newview = {
    _id: user._id,
    user: user._id.toString(),
    email: user.email,
    wheel: wheel.insertedId.toString(),
    name: "my view",
    type:
        user.profile === "client"
        ? "shared"
        : user.profile === "daniel"
        ? "personal"
        : "coach"
    };
    Views.insertOne(newview);

    //create new profile
    let newprofile = {
    _id: user._id,
    user: user._id.toString(),
    email: user.email,
    name:
        user.profile === "coach"
        ? "Team Ranking"
        : getname(user.firstname, user.lastname, user.email),
    type:
        user.profile === "client"
        ? "member"
        : user.profile === "daniel"
        ? "personal"
        : "member",
    wheel: wheel.insertedId.toString()
    };
    Profiles.insertOne(newprofile);
}
});

// runUpdate: Boolean
const goals = await Goals.find().toArray();

goals.map(function(goal) {
migrategoals(goal);
}); 

/* const wheelareatags = await WheelAreaTags.find().toArray();
wheelareatags.map(function(wheelarealink) {
queryarea(wheelarealink);
});

const ranktimes = await RankTimes.find().toArray();
ranktimes.map(function(ranktime) {
updaterank(ranktime);
});

const goaltimes = await GoalTimes.find().toArray();
goaltimes.map(function(goaltime) {
updategoal(goaltime);
}); */
