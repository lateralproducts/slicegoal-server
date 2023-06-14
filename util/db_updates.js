import DbConnection from '../src/database'
//import { ObjectId } from 'mongodb'
//import { getprofileid } from '../src/users';
//use playground http://localhost:3001/ and run mutation: "mutation{runUpdate}"

export const typeDefs = `
    extend type Mutation {
        migrateUpdateGoalTimesUserIDs: Boolean
    }`

export const resolvers = {
    Mutation: {
        migrateUpdateGoalTimesUserIDs: async() => {
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            //const TaskLinks = db.collection('tasklinks')

            GoalTimes.updateMany({}, { $rename: { userid: 'profileid' } })
            return true
        }
        //updateAreaToSource(areaid: String, resource: String, profileid: String): Boolean
        /* updateTaskLinks: async(parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Tasks = db.collection('tasks')
            const TaskLinks = db.collection('tasklinks')

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
            if (!req.session.user) throw new Error('Invalid Session')
            if (args.profileid !== getprofileid(req.session)) throw new Error('Wrong profile')

            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const Sources = db.collection('sources')
            const InsightTags = db.collection('insighttags')
            const SourceTags = db.collection('sourcetags')
            //prod profileid = '5d2adcf120f52b0d7d7faba0'
            
            try {
                const Area = await Areas.findOne({_id: ObjectId(args.areaid)});

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
                throw new Error('error updating area to source')
            }

            await InsightTags.deleteMany({area: args.areaid})
            await Areas.deleteOne({_id: ObjectId(args.areaid)})
            
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
