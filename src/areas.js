import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getuiversion } from '../util/index'
import { getuserid, getprofileid, getname } from './users'
let pjson = require('../package.json')

export const schema = `

    type AreaLink {
        _id: String
        rootarea: String
        area: String
        focus: Boolean
        linkedarea: Area
    }

    input AreaLinkIn {
        area: AreaId
        name: String
        notes: String
        _id: String
    }

    input AreaId {
        _id: String
    }

    input AreaIn {
        name: String
        definition: String
    }

    type Focus {
        _id: String
        area: Area
        objective: Objective
        links: [String]
    }

    type ClickData {
        clicks: Int
    }

    type Area {
        _id: String
        name: String
        rank: RankTime
        goal: GoalTime
        definition: String
        focus: Boolean
        vision: String
        notes: String
        areas: [Area]
        time(readdate: String): PomodoroData
        clicks: ClickData
        coach: Boolean
    }

    type View {
        _id: String
        type: String
        wheel: Wheel
        name: String
    }

    type Wheel {
        _id: String
        name: String
        definition: String
        profile: String
        startarea: Area
        profiles: [Profile]
    }

    type Profile {
        _id: String
        name: String
        user: User
        wheel: Wheel
        type: String
    }

    type RankTime {
        _id: String
        areaId: String
        rank: Int
        note: String
        date: String
      }
  

    type GoalTime {
        _id: String
        areaId: String
        goal: Int
        datetime: String
        note: String
        date: Float
        goaldate: String
    }
`

export const typeDefs = `

    extend type Query {
        wheels:[Wheel]
        views: [View]
        profiles: [Profile]
        area(_id: String!, navdirection: String, readdate: String): Area
        areas (readdate: String): [Area]
        arealinks(area: String): [AreaLink]
        ranktimes(areaId: String): [RankTime]
        lastranktime(areaId: String): RankTime
        goaltimes(areaId: String): [GoalTime]
        lastgoaltime(areaId: String): GoalTime
        focusLinks(limit: Int, area: String): [Focus]
        focusLink(focuslink: String): Focus
    }
    
    extend type Mutation {
        setView(viewid: String): View
        createNewWheel(viewtype: String, wheelname: String!, areas: [AreaIn]): View
        removeStartArea: Boolean!
        toggleFocusFlag(rootarea: String!, area: String!): Boolean
        deleteArea(area: String): Area
        updateArea(rootarea: String, name: String, definition: String, vision: String, area: String): Area
        setProfile(profileid: String!): Profile
        copyWheel(wheelid: String!, viewtype: String!): Boolean
        createAreaLink(rootarea: String, area: String, title: String, notes: String): Boolean
        deleteAreaLink(rootarea: String, area: String): Area
        createArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
        createCoachArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
        createRankTime(area: String, rank: Int, datetime: String, note: String): RankTime
        createGoalTime(area: String, goal: Int, datetime: String, note: String, goaldate: String): GoalTime
    }

`

export const resolvers = {
    Query: {
        views: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            let query = new Object()
            query.user = getuserid(req.session)
            if (args.default) query._id = ObjectId(args.defaultview) //if asking for default profile only return the default.
            return await Views.find(query).toArray()
        },
        wheels: async (parent, args, { req }) => {
            //This is a publicly accessible call.
            //Could potentially have a completely different server running this in the future.
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            return await Wheels.find({ global: true }).toArray()
        },
        focusLinks: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const FocusLinks = db.collection('focuslinks')
            return await FocusLinks.find({
                userid: getprofileid(req.session),
                $or: [{ snooze: null }, { snooze: { $lt: new Date() } }],
                links: args.area,
            }) //update sort at some stage.
                .sort({ orderrank: 1 })
                .limit(args.limit)
                .toArray()
        },
        focusLink: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const FocusLinks = db.collection('focuslinks')
            return await FocusLinks.findOne(
                {
                    userid: getprofileid(req.session),
                    _id: ObjectId(args.focuslink),
                },
                { sort: { date: -1 } }, //update sort at some stage.
            )
        },
        areas: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            let areas = await Areas.find({
                wheelid: getwheelid(req.session), // , $or: [{ { global: true }, wheelid: getwheelid(req.session)] if we want to use global areas to define wheels. Needs more thought.
            })
                .sort({ clicks: -1 })
                .toArray()

            return areas
        },
        profiles: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Profiles = db.collection('profiles')
            if (req.session.view.type === 'coach') {
                const profiles = await Profiles.find({
                    wheel: getwheelid(req.session), //return all profiles on wheel
                })
                    .sort({ type: -1, name: 1 })
                    .toArray() //.map(function(client) {return client._id;})
                return profiles
            }

            return await Profiles.find({
                wheel: getwheelid(req.session),
                $or: [
                    { user: getuserid(req.session) },
                    { type: 'team' },
                    { type: 'average' },
                ], //return both personal profile and team wheels
            })
                .sort({ type: -1, name: 1 })
                .toArray()
        },
        area: async (root, { _id, navdirection }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            logareaclick(_id, navdirection, req)

            let area = await Areas.findOne({
                _id: ObjectId(_id),
                $or: [{ wheelid: getwheelid(req.session) }, { global: true }],
            })
            return area
        },
        ranktimes: async (root, { areaId }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const RankTimes = db.collection('ranktimes')
            return await RankTimes.find({
                areaId: areaId,
                profileid: getprofileid(req.session),
            })
                .sort({ date: -1 })
                .toArray()
        },
        arealinks: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            return await AreaLinks.find({
                rootarea: { $not: { $eq: null } },
                area: args.area,
                wheelid: getwheelid(req.session),
            }).toArray()
        },
        goaltimes: async (root, { _id }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            return await GoalTimes.find({ userid: getprofileid(req.session) })
                .sort({ date: -1 })
                .toArray()
        },
        lastranktime: async (root, { areaId }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const RankTimes = db.collection('ranktimes')
            //if coach, return average of coachees.
            return await RankTimes.findOne(
                { areaId: areaId, profileid: getprofileid(req.session) },
                { sort: { date: -1 } },
            )
        },
        lastgoaltime: async (root, { areaId }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            return await GoalTimes.findOne(
                { areaId: areaId, userid: getprofileid(req.session) },
                { sort: { date: -1 } },
            )
        },
    },
    Mutation: {
        setView: async (parent, { viewid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            const Profiles = db.collection('profiles')

            //set wheel, view, and profile to the context.
            const view = await Views.findOne({
                _id: ObjectId(viewid),
                user: getuserid(req.session), //check that this user own's the view. If not, return error.
            })

            let query = new Object()
            query.wheel = view.wheel
            if (view.type === 'team') query.user = getuserid(req.session) //access allowed to all profiles for coach.

            const profile = await Profiles.findOne(query)

            if (!profile) throw new Error('View Profile combination not found')

            req.session.view = view
            req.session.profile = profile

            return view //need to return the view, area.
        },
        createNewWheel: async (
            parent,
            { viewtype, wheelname, areas },
            { req },
        ) => {
            if (!req.session.user) throw new Error('Invalid Session')
            //set wheel, view, and profile to the context.
            let { newview, newprofile } = await createWheel(
                req.session.user,
                req.session.user._id.toString(),
                viewtype,
                wheelname,
                areas,
                getuiversion(req.session),
            )
            req.session.view = newview
            req.session.profile = newprofile

            return newview //need to return the view, area.
        },
        removeStartArea: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            await Users.updateOne(
                { _id: ObjectId(getprofileid(req.session)) },
                { $set: { startarea: null } },
            )

            return true
        },
        toggleFocusFlag: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            const Areas = db.collection('areas')
            const area = await AreaLinks.findOne({
                rootarea: args.rootarea,
                area: args.area,
            })
            let focusflag

            if (area.focus) focusflag = false
            else focusflag = true

            await AreaLinks.updateOne(
                { rootarea: args.rootarea, area: args.area },
                { $set: { focus: focusflag } },
            )
            await Areas.updateOne(
                { _id: ObjectId(args.area) },
                { $set: { focus: focusflag } },
            )
            return focusflag
        },
        deleteArea: async (root, { rootarea, area }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            let message = ''
            AreaLinks.deleteOne(
                {
                    rootarea: rootarea,
                    area: area,
                    wheelid: getwheelid(req.session),
                },
                function(err, obj) {
                    if (err) throw err
                    message = obj.deletedCount + ' area(s) deleted'
                },
            )
            return { _id: areaId, title: message }
        },
        setProfile: async (parent, { profileid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Profiles = db.collection('profiles')
            const profile = await Profiles.findOne({
                _id: ObjectId(profileid),
                wheel: req.session.view.wheel,
            })

            if (!profile) throw new Error('user could not be retrieved.')

            req.session.profile = profile
            return profile
        },
        copyWheel: async (parent, { wheelid, viewtype }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            let user = await Users.findOne({
                _id: ObjectId(getuserid(req.session)),
            })
            if (user)
                createWheel(
                    user,
                    user._id.toString(),
                    viewtype,
                    wheelid,
                    getuiversion(req.session),
                )
            return true
        },
        deleteAreaLink: async (root, { rootarea, area }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            const res = await AreaLinks.deleteMany(
                {
                    rootarea: rootarea,
                    area: area,
                    wheelid: getwheelid(req.session),
                },
                { $set: { arealink: null } },
            )
            return res
        },
        createAreaLink: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            // args.userid = getwheelid(req.session);
            // args.serverversion = pjson.version;
            // args.uiversion = getuiversion(req.session);
            await AreaLinks.insertOne({
                rootarea: args.rootarea,
                area: args.area,
                wheelid: getwheelid(req.session),
                created: new Date(),
            })

            return true
        },
        createArea: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            args.wheelid = getwheelid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.created = new Date()

            const res = await Areas.insert(args)

            await AreaLinks.insertOne({
                rootarea: args.rootarea,
                area: res.insertedIds[0].toString(),
                areaname: args.name,
                wheelid: getwheelid(req.session),
                serverversion: pjson.version,
                uiversion: getuiversion(req.session),
            })
            return await Areas.findOne({
                _id: res.insertedIds[0],
                wheelid: getwheelid(req.session),
            })
        },
        createCoachArea: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            args.wheelid = getwheelid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.created = new Date()
            args.coach = true

            const res = await Areas.insert(args)

            await AreaLinks.insertOne({
                rootarea: args.rootarea,
                area: res.insertedIds[0].toString(),
                areaname: args.name,
                wheelid: getwheelid(req.session),
                serverversion: pjson.version,
                uiversion: getuiversion(req.session),
            })

            const area = await Areas.findOne({
                _id: res.insertedIds[0],
                wheelid: getwheelid(req.session),
            })

            return area
        },
        createRankTime: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const RankTimes = db.collection('ranktimes')
            args.profileid = getprofileid(req.session)
            args.date = new Date(args.datetime)
            const res = await RankTimes.insert(args)
            return {
                _id: res.insertedIds[1],
                message: 'new rank entry created',
            }
        },
        createGoalTime: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            args.userid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.date = new Date(args.datetime)
            if (args.goaldate) args.goaldate = new Date(args.goaldate)
            const res = await GoalTimes.insert(args)
            return {
                _id: res.insertedIds[1],
                message: 'new goal entry created',
            }
        },
        updateArea: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            await Areas.updateOne(
                { _id: ObjectId(args.area), wheelid: getwheelid(req.session) },
                { $set: args },
            )
            args._id = args.area
            return args
        },
    },
    Wheel: {
        profiles: async (parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Profiles = db.collection('profiles')
            let query = new Object()
            query.wheel = parent._id.toString()
            if (parent.view.type !== 'coach')
                query.user = getuserid(req.session)
            //if (args.default) query._id = ObjectId(parent.view.defaultprofile); //if asking for default profile only return the default.
            return await Profiles.find(query)
                .sort({ type: -1, name: 1 })
                .toArray()
        },
        startarea: async (parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            let query = new Object()
            query._id = ObjectId(parent.startarea)
            return await Areas.findOne(query)
        },
    },
    Profile: {
        wheel: async (parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            return await Wheels.findOne({
                _id: ObjectId(parent.wheel),
            })
        },
    },
    AreaLink: {
        linkedarea: async (parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return parent.rootarea
                ? await Areas.findOne({
                      _id: ObjectId(parent.rootarea),
                  })
                : { _id: ObjectId(parent.area), name: null }
        },
    },
    View: {
        wheel: async (obj, args, context, info) => {
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            let wheel = await Wheels.findOne({
                _id: ObjectId(obj.wheel),
            })
            wheel.view = obj
            return wheel
        },
        //user: async (view, args, { req }) => {
        //    return (
        //      await Users.findOne({
        //        _id: ObjectId(view.user)
        //     })
        //    );
        //}
    },
    Area: {
        clicks: async ({ _id }, args, { req }) => {
            const db = await DbConnection.Get()
            const Clicks = db.collection('clicks')
            let currentDate = new Date()
            currentDate.setDate(currentDate.getDate() - 7) //currently reading one week's trailing data.
            return new Promise(function(resolve, reject) {
                Clicks.aggregate(
                    {
                        $match: {
                            areaid: _id.toString(),
                            userid: getuserid(req.session),
                            date: {
                                $gte: currentDate,
                            },
                        },
                    },
                    {
                        $group: {
                            _id: null,
                            clicks: { $sum: 1 },
                        },
                    },

                    function(err, data) {
                        if (err) throw err
                        resolve(data[0] ? data[0] : 0)
                    },
                )
            })
        },
        areas: async (parent, args, { req }, info) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            const query = {
                rootarea: parent._id.toString(), //using parent ID from Area object on Graph. No need for global boolean on AreaLink for now.
                wheelid: parent.wheelid,
            }
            const arealinks = await AreaLinks.distinct('area', query)

            return await Areas.find({
                _id: {
                    $in: arealinks.map(function(id) {
                        return ObjectId(id)
                    }),
                },
                $or: [
                    {
                        wheelid: req.session.view
                            ? getwheelid(req.session)
                            : 'public', //placeholder, to stop error calling.
                    },
                    { global: true },
                ], //need to return areas where global: true.
            }).toArray()
        },
        rank: async ({ _id, coach }, args, { req }) => {
            const db = await DbConnection.Get()
            const Profiles = db.collection('profiles')
            const RankTimes = db.collection('ranktimes')
            if (req.session.profile)
                if (req.session.profile.type === 'average') {
                    //was previously using "coach" in area to decide to aggregate rank
                    const profiles = await Profiles.find({
                        wheel: req.session.profile.wheel,
                    }).toArray()

                    return new Promise(function(resolve, reject) {
                        //returning the average of the area for coaching
                        RankTimes.aggregate(
                            {
                                $match: {
                                    area: _id.toString(),
                                    //userid: req.session.profile.wheel
                                    profileid: {
                                        $in: profiles.map(profile => {
                                            return profile._id.toString()
                                        }),
                                    },
                                },
                            },
                            {
                                $group: {
                                    _id: {
                                        area: '$area',
                                        profileid: '$userid',
                                    },
                                    date: {
                                        $last: '$date',
                                    },
                                    rank: { $last: '$rank' },
                                },
                            },
                            {
                                $group: {
                                    _id: '$*_*id.area',
                                    rank: { $avg: '$rank' },
                                },
                            },

                            function(err, data) {
                                if (err) throw err
                                resolve(
                                    data[0]
                                        ? {
                                              rank: parseInt(data[0].rank),
                                              note: 'team average',
                                          }
                                        : null,
                                )
                            },
                        )
                    })
                } else {
                    const rank = await RankTimes.findOne(
                        {
                            area: _id.toString(),
                            profileid: getprofileid(req.session),
                        },
                        { sort: { date: -1 } },
                    )
                    return rank ? rank : null
                }
        },
        goal: async ({ _id }, args, { req }) => {
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            const goal = await GoalTimes.findOne(
                { area: _id.toString(), userid: getprofileid(req.session) },
                { sort: { date: -1 } },
            )
            return goal ? goal : null
        },
        time: async ({ _id }, args, { req }, query) => {
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')
            if (args || item) {
            }
            return new Promise(function(resolve, reject) {
                let currentDate = new Date()
                currentDate.setDate(currentDate.getDate() - 7) //currently reading one week's trailing data.
                Pomodoros.aggregate(
                    {
                        $match: {
                            userid: getprofileid(req.session),
                            date: {
                                $gte: currentDate,
                            },
                            $or: [
                                /*{
                                    area: _id,
                                }, */
                                {
                                    links: _id.toString(),
                                },
                            ],
                        },
                    },
                    {
                        $group: {
                            _id: { links: null }, //"$area"
                            count: { $sum: '$minutes' },
                            records: { $sum: 1 },
                            direct: {
                                $sum: {
                                    $cond: {
                                        if: { $eq: ['$area', _id.toString()] },
                                        then: 1,
                                        else: 0,
                                    },
                                },
                            },
                            countdirect: {
                                $sum: {
                                    $cond: {
                                        if: { $eq: ['$area', _id.toString()] },
                                        then: '$minutes',
                                        else: 0,
                                    },
                                },
                            },
                        },
                    },

                    function(err, data) {
                        if (err) throw err
                        resolve(data[0] ? data[0] : 0)
                    },
                )
            })
        },
    },
}

export async function createWheel(
    user,
    userid,
    viewtype,
    wheelname,
    areas,
    uiversion,
) {
    const db = await DbConnection.Get()
    const Areas = db.collection('areas')
    const AreaLinks = db.collection('arealinks')
    const Views = db.collection('views')
    const Profiles = db.collection('profiles')
    const Wheels = db.collection('wheels')
    let wheelid

    switch (viewtype) {
        case 'coach': //currently not copying wheel for coach. Just creating a blank wheel.
            let startareaid = (await Areas.insertOne({
                name: 'Coaching Wheel',
                email: user.email,
                created: new Date(),
            })).insertedId.toString()

            wheelid = (await Wheels.insertOne({
                name: user.email + "'s new coach wheel",
                startarea: startareaid,
            })).insertedId.toString()

            Areas.updateOne(
                { _id: ObjectId(startareaid) },
                {
                    $set: {
                        wheelid: wheelid,
                    },
                },
            )
            break
        case 'client':
        default:
            viewtype = 'personal'

            //First area passed is root/start area
            const startArea = (await Areas.insertOne({
                user: userid,
                name: wheelname,
                email: user.email,
                created: new Date(),
            })).insertedId.toString()

            //Create wheel object
            wheelid = (await Wheels.insertOne({
                user: userid,
                created: new Date(),
                startarea: startArea,
                name: wheelname,
            })).insertedId.toString()

            //Update startarea to have correct wheelid
            Areas.updateOne(
                { _id: ObjectId(startArea) },
                { $set: { wheelid: wheelid } },
            )

            //Insert the rest of the areas
            if (areas) {
                await areas.map(area => {
                    Areas.insertOne({
                        name: area.name,
                        wheelid: wheelid,
                        definition: area.definition,
                        rootarea: startArea,
                        uiversion: uiversion,
                        created: new Date(),
                        serverversion: pjson.version,
                    })
                })

                //Insert the area links
                let newAreas = Areas.find({ rootarea: startArea })
                await newAreas.map(area => {
                    AreaLinks.insertOne({
                        area: area._id.toString(),
                        areaname: area.name,
                        rootarea: area.rootarea,
                        wheelid: wheelid,
                        uiversion: uiversion,
                        serverversion: pjson.version,
                    })
                })
            }
    }

    //create new view
    let newview = {
        user: userid,
        email: user.email,
        wheel: wheelid, //req.session.view.wheel,
        created: new Date(),
        name:
            viewtype === 'coach'
                ? getname(user.firstname, '', user.email) + "'s Coaching"
                : wheelname,
        type: viewtype,
    }
    Views.insertOne(newview)

    //create new profile
    let newprofile = {
        user: userid,
        wheel: wheelid,
        email: user.email,
        created: new Date(),
        name:
            viewtype === 'coach'
                ? 'Team Profile'
                : getname(user.firstname, user.lastname, user.email),
        type: viewtype === 'coach' ? 'team' : viewtype, //create the first team profile.
    }
    Profiles.insertOne(newprofile)

    return { newview, newprofile }
}

async function copywheel(wheelid, userid) {
    const db = await DbConnection.Get()
    const Wheels = db.collection('wheels')
    const Areas = db.collection('areas')
    const AreaLinks = db.collection('arealinks')

    //only using userid as a tag to keep track of the copy.
    //wheel - global
    let newwheel = await Wheels.findOne({
        _id: ObjectId(wheelid),
        //need to work out security here.
    })

    if (!newwheel) {
        throw new Error('Wheel not found to copy')
    } else {
        newwheel.copy = wheelid
        newwheel.user = userid
        newwheel.created = new Date()
        delete newwheel._id
        delete newwheel.global
        let newwheelid = (await Wheels.insertOne(
            newwheel,
        )).insertedId.toString()
        //areas - global
        let newareas = await Areas.find({ wheelid: wheelid }).toArray()
        newareas.map(area => {
            area.user = userid
            area.wheelid = newwheelid
            area.copywheel = wheelid
            area.copyarea = area._id.toString()
            area.created = new Date()
            delete area._id
            return area
        })

        await Areas.insertMany(newareas)
        let newstartareaid = (await Areas.findOne({
            user: userid,
            copyarea: newwheel.startarea,
            wheelid: newwheelid, //this is the id used for returning wheels
        }))._id.toString()

        Wheels.updateOne(
            { _id: ObjectId(newwheelid) },
            { $set: { startarea: newstartareaid } },
        )
        //arealinks - global
        let newarealinks = await AreaLinks.find({
            wheelid: wheelid,
        }).toArray()
        newarealinks.map(arealink => {
            arealink.user = userid //this is just copied as a reference for ease
            arealink.wheelid = newwheelid //this is the id used for returning arealinks
            arealink.rootarea = newareas
                .find(o => o.copyarea === arealink.rootarea)
                ._id.toString()
            arealink.area = newareas
                .find(o => o.copyarea === arealink.area)
                ._id.toString()
            arealink.copywheel = wheelid
            arealink.copylink = arealink._id.toString()
            arealink.created = new Date()
            delete arealink._id
            return arealink
        })
        AreaLinks.insertMany(newarealinks)
        //return wheel
        return newwheelid
    }
}
export async function logareaclick(_id, navdirection, req) {
    const db = await DbConnection.Get()
    const Clicks = db.collection('clicks')
    const Areas = db.collection('areas')

    try {
        if (navdirection == 'forward') {
            Clicks.insertOne({
                userid: getuserid(req.session),
                date: new Date(),
                areaid: _id,
            })

            Areas.updateOne(
                {
                    wheelid: getprofileid(req.session),
                    _id: ObjectId(_id),
                },
                { $inc: { clicks: 1 }, $set: { lastclicked: new Date() } },
            )
        }
    } catch (error) {
        console.log(error)
    }
}
function getwheelid(session) {
    if (session.view) return session.view.wheel
    else return null
}
