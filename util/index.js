/* export const prepare = o => {
    o._id = o._id.toString()
    return o
} */

export function getuiversion(session) {
    if (session.user) return session.user.uiversion
    else return 'test'
}

export const typeDefs = `

    extend type Mutation {
        runUpdate101: Boolean
    }`

export const resolvers = {
    Mutation: {
        runUpdate101: async(parent, args, { req }) => {
            Areas.updateMany({}, { $rename: { userid: 'wheelid' } })
            Areas.updateMany({}, { $rename: { userid: 'wheelid' } })
            AreaTags.updateMany({}, { $rename: { userid: 'wheelid' } })
            RankTimes.updateMany({}, { $rename: { userid: 'profileid' } })
            Insights.updateMany({}, { $rename: { userid: 'profileid' } })
            InsightLinks.updateMany({}, { $rename: { userid: 'profileid' } })
            Goals.updateMany({}, { $rename: { userid: 'profileid' } })
            GoalLinks.updateMany({}, { $rename: { userid: 'profileid' } })

            //use playground http://localhost:3001/ and run mutation: "mutation{runUpdate}"
            /* const users = await Users.find().toArray();

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
            }); */

            // runUpdate: Boolean
            /* const goals = await Goals.find().toArray();

            goals.map(function(goal) {
            migrategoals(goal);
            }); */

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

            return true
        }
    }
}
