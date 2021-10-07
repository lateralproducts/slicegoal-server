import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getuiversion } from '../util/index'
import { getuserid, getprofileid, getwheelid, getname } from './users'
import { sessiontrack } from './website'
let pjson = require('../package.json')

export const typeDefs = `

    extend type Query {
        wheel(wheelid: String):[Wheel]
        wheels(tag: String):[Wheel]
        views (type: String): [View]
        profiles: [Profile]
        area(_id: String!, navdirection: String, readdate: String): Area
        areas (wheelid: String, readdate: String): [Area]
        arealinks(areaid: String): [AreaLink]
        ranktimes(areaId: String): [RankTime]
        lastranktime(areaId: String): RankTime
        goaltimes(areaId: String): [GoalTime]
        lastgoaltime(areaId: String): GoalTime
        focusLinks(limit: Int, area: String): [Focus]
        focusLink(focuslink: String): Focus
        viewsOnOwnWheel(wheelid: String!): [View]
        rankDue: Boolean
    }
    
    extend type Mutation {
        setView(viewid: String): View
        deleteView(viewid: String!): View
        removeViewFromUser(viewid: String!): Boolean
        createNewWheel(wheelname: String!, areas: [AreaIn]): View
        removeStartArea: Boolean!
        updateStartArea(areaid: String!): Boolean
        toggleFocusFlag(rootarea: String!, area: String!): Boolean
        deleteArea(areaid: String!): Boolean
        updateArea(rootarea: String, name: String, definition: String, vision: String, area: String): Area
        setProfile(profileid: String!): Profile
        copyWheel(wheelid: String!): Boolean
        createAreaLink(rootarea: String, area: String, title: String, notes: String): Boolean
        deleteAreaLink(rootarea: String, area: String): Area
        createArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
        createCoachArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
        createRankTime(area: String, rank: Int, datetime: String, note: String): RankTime
        createGoalTime(area: String, goal: Int, datetime: String, note: String, goaldate: String): GoalTime
    }
`

export const schema = `

    type AreaLink {
        _id: String
        rootarea: String
        area: String
        focus: Boolean
        linkedarea: Area
    }

    input AreaTagIn {
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
        goal: Goal
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
        user: ViewUser
        name: String
        email: String
    }

    type ViewUser {
        firstname: String
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

export const resolvers = {
    Query: {
        views: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            let query = new Object()
            query.user = getuserid(req.session)
            if (args.type === 'notcurrent')
                query.wheel = { $ne: getwheelid(req.session) }
            if (args.type === 'default') query.default = true //defaultview //if asking for default profile only return the default.
            return await Views.find(query).toArray()
        },
        wheel: async(_, { wheelid }) => {
            //This is a **publicly** accessible call, used on the website. Don't need to login to retrieve.
            //Could potentially have a completely different server running this in the future.
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            return await Wheels.findOne({
                _id: ObjectId(wheelid),
                global: true
            })
        },
        wheels: async(_, { tag }) => {
            //This is a **publicly** accessible call, used on the website. Don't need to login to retrieve.
            //Could potentially have a completely different server running this in the future.
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            const query = new Object()
            query.global = true
            if (tag) query.tag = tag
            return await Wheels.find(query)
                .sort({ templateorder: -1 })
                .toArray()
        },
        focusLinks: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const FocusLinks = db.collection('focuslinks')
            return await FocusLinks.find({
                userid: getprofileid(req.session),
                $or: [{ snooze: null }, { snooze: { $lt: new Date() } }],
                links: args.area
            }) //update sort at some stage.
                .sort({ orderrank: 1 })
                .limit(args.limit)
                .toArray()
        },
        focusLink: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const FocusLinks = db.collection('focuslinks')
            return await FocusLinks.findOne(
                {
                    userid: getprofileid(req.session),
                    _id: ObjectId(args.focuslink)
                },
                { sort: { date: -1 } }, //update sort at some stage.
            )
        },
        areas: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const wheel = !args.wheelid ? getwheelid(req.session) : args.wheelid
            let areas = await Areas.find({
                wheelid: wheel // , $or: [{ { global: true }, wheelid: getwheelid(req.session)] if we want to use global areas to define wheels. Needs more thought.
            })
                .sort({ lasttagged: -1, lastclicked: -1 })
                .toArray()

            return areas
        },
        profiles: async(_, __, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Profiles = db.collection('profiles')
            if (req.session.view.type === 'coach') {
                const profiles = await Profiles.find({
                    wheel: getwheelid(req.session) //return all profiles on wheel
                })
                    .sort({ type: -1, name: 1 })
                    .toArray() //.map(function(client) {return client._id;})
                return profiles
            }

            return await Profiles.find({
                wheel: getwheelid(req.session),
                $or: [
                    { user: getuserid(req.session) },
                    { type: 'shared' },
                    { type: 'average' }
                ] //return both personal profile and shared wheels
            })
                .sort({ type: -1, name: 1 })
                .toArray()
        },
        area: async(_, { _id, navdirection }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            logareaclick(_id, navdirection, req)

            let area = await Areas.findOne({
                _id: ObjectId(_id),
                $or: [{ wheelid: getwheelid(req.session) }, { global: true }]
            })
            return area
        },
        ranktimes: async(_, { areaId }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const RankTimes = db.collection('ranktimes')
            return await RankTimes.find({
                areaId: areaId,
                profileid: getprofileid(req.session)
            })
                .sort({ date: -1 })
                .toArray()
        },
        arealinks: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            return await AreaLinks.find({
                rootarea: { $not: { $eq: null } },
                area: args.areaid,
                wheelid: getwheelid(req.session)
            }).toArray()
        },
        goaltimes: async(_, __, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            return await GoalTimes.find({ userid: getprofileid(req.session) })
                .sort({ date: -1 })
                .toArray()
        },
        lastranktime: async(_, { areaId }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const RankTimes = db.collection('ranktimes')
            //if coach, return average of coachees.
            return await RankTimes.findOne(
                { areaId: areaId, profileid: getprofileid(req.session) },
                { sort: { date: -1 } },
            )
        },
        lastgoaltime: async(_, { areaId }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            return await GoalTimes.findOne(
                { areaId: areaId, userid: getprofileid(req.session) },
                { sort: { date: -1 } },
            )
        },
        viewsOnOwnWheel: async(_, { wheelid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            const views = await Views.find({
                wheel: wheelid
            }).toArray()

            const ownersview = views.find(
                view =>
                    view.user === getuserid(req.session) &&
                    view.type === 'owner',
            )

            const owner = await isWheelOwner(req, ownersview._id)
            if (!owner) throw new Error('Request not from wheel owner')

            views.splice(ownersview, 1) //remove owners view from the list
            return views
        },
        rankDue: async(_, __, { req }) => {
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            const Areas = db.collection('areas')

            let checkDate = new Date()
            const weekAgo = checkDate.getDate() - 7
            checkDate.setDate(weekAgo)

            return await Wheels.findOne({_id: ObjectId(getwheelid(req.session))})
                .then(wheel => {
                    return Areas.findOne({_id: ObjectId(wheel.startarea)})
                        .then(rootarea => {
                            if(rootarea.lastranked &&
                                rootarea.lastranked < checkDate)
                                return true
                            else 
                                return false
                        })
                })
        }
    },
    Wheel: {
        profiles: async(parent, __, { req }) => {
            const db = await DbConnection.Get()
            const Profiles = db.collection('profiles')
            let query = new Object()
            query.wheel = parent._id.toString()
            if (parent.view.type !== 'coach')
                query.$or = [
                    { user: getuserid(req.session) },
                    { type: 'shared' },
                    { type: 'average' }
                ]
            //if (args.default) query._id = ObjectId(parent.view.defaultprofile); //if asking for default profile only return the default.
            return await Profiles.find(query)
                .sort({ type: -1, name: 1 })
                .toArray()
        },
        startarea: async parent => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            let query = new Object()
            query._id = ObjectId(parent.startarea)
            return await Areas.findOne(query)
        }
    },
    Profile: {
        wheel: async parent => {
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            return await Wheels.findOne({
                _id: ObjectId(parent.wheel)
            })
        }
    },
    AreaLink: {
        linkedarea: async parent => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return parent.rootarea
                ? await Areas.findOne({
                      _id: ObjectId(parent.rootarea)
                  })
                : { _id: ObjectId(parent.area), name: null }
        }
    },
    View: {
        wheel: async obj => {
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            let wheel = await Wheels.findOne({
                _id: ObjectId(obj.wheel)
            })
            if (wheel) wheel.view = obj
            return wheel
        },
        user: async view => {
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            return await Users.findOne({
                _id: ObjectId(view.user)
            })
        }
    },
    Area: {
        clicks: async({ _id }, __, { req }) => {
            const db = await DbConnection.Get()
            const Clicks = db.collection('clicks')
            let currentDate = new Date()
            currentDate.setDate(currentDate.getDate() - 7) //currently reading one week's trailing data.
            return new Promise(function(resolve) {
                Clicks.aggregate(
                    {
                        $match: {
                            areaid: _id.toString(),
                            userid: getuserid(req.session),
                            date: {
                                $gte: currentDate
                            }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            clicks: { $sum: 1 }
                        }
                    },

                    function(err, data) {
                        if (err) throw err
                        resolve(data[0] ? data[0] : 0)
                    },
                )
            })
        },
        areas: async(parent, __, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            const query = {
                rootarea: parent._id.toString(), //using parent ID from Area object on Graph. No need for global boolean on AreaLink for now.
                wheelid: parent.wheelid
            }
            const arealinks = await AreaLinks.distinct('area', query)

            return await Areas.find({
                _id: {
                    $in: arealinks.map(function(id) {
                        return ObjectId(id)
                    })
                },
                $or: [
                    {
                        wheelid: req.session.view
                            ? getwheelid(req.session)
                            : 'public' //placeholder, to stop error calling.
                    },
                    { global: true }
                ] //need to return areas where global: true.
            }).toArray()
        },
        rank: async({ _id }, __, { req }) => {
            const db = await DbConnection.Get()
            const Profiles = db.collection('profiles')
            const RankTimes = db.collection('ranktimes')
            if (req.session.profile)
                if (req.session.profile.type === 'average') {
                    //was previously using "coach" in area to decide to aggregate rank
                    const profiles = await Profiles.find({
                        wheel: req.session.profile.wheel
                    }).toArray()

                    return new Promise(function(resolve) {
                        //returning the average of the area for coaching
                        RankTimes.aggregate(
                            {
                                $match: {
                                    area: _id.toString(),
                                    //userid: req.session.profile.wheel
                                    profileid: {
                                        $in: profiles.map(profile => {
                                            return profile._id.toString()
                                        })
                                    }
                                }
                            },
                            {
                                $group: {
                                    _id: {
                                        area: '$area',
                                        profileid: '$userid'
                                    },
                                    date: {
                                        $last: '$date'
                                    },
                                    rank: { $last: '$rank' }
                                }
                            },
                            {
                                $group: {
                                    _id: '$*_*id.area',
                                    rank: { $avg: '$rank' }
                                }
                            },

                            function(err, data) {
                                if (err) throw err
                                resolve(
                                    data[0]
                                        ? {
                                              rank: parseInt(data[0].rank),
                                              note: 'team average'
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
                            profileid: getprofileid(req.session)
                        },
                        { sort: { date: -1 } },
                    )
                    return rank ? rank : null
                }
        },
        goal: async({ _id }, __, { req }) => {
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            const goal = await GoalTimes.findOne(
                { area: _id.toString(), userid: getprofileid(req.session) },
                { sort: { date: -1 } },
            )
            return goal ? goal : null
        },
        time: async({ _id }, args, { req }) => {
            const db = await DbConnection.Get()
            const Pomodoros = db.collection('pomodoros')

            return new Promise(function(resolve) {
                let currentDate = new Date()
                currentDate.setDate(currentDate.getDate() - 7) //currently reading one week's trailing data.
                Pomodoros.aggregate(
                    {
                        $match: {
                            userid: getprofileid(req.session),
                            date: {
                                $gte: currentDate
                            },
                            $or: [
                                /*{
                                    area: _id,
                                }, */
                                {
                                    links: _id.toString()
                                }
                            ]
                        }
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
                                        else: 0
                                    }
                                }
                            },
                            countdirect: {
                                $sum: {
                                    $cond: {
                                        if: { $eq: ['$area', _id.toString()] },
                                        then: '$minutes',
                                        else: 0
                                    }
                                }
                            }
                        }
                    },

                    function(err, data) {
                        if (err) throw err
                        resolve(data[0] ? data[0] : 0)
                    },
                )
            })
        }
    },
    Mutation: {
        setView: async(_, { viewid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            const Profiles = db.collection('profiles')

            //set wheel, view, and profile to the context.
            const view = await Views.findOne({
                _id: ObjectId(viewid),
                user: getuserid(req.session) //check that this user own's the view. If not, return error.
            })
            let query = new Object()
            query.wheel = view.wheel
            if (view.type === 'shared')
                query.$or = [{ user: getuserid(req.session) }, { type: 'shared' }] //access allowed to all profiles for coach.

            const profile = await Profiles.findOne(query)

            if (!profile) throw new Error('View Profile combination not found')

            req.session.view = view
            req.session.profile = profile

            return view //need to return the view, area.
        },
        deleteView: async(_, { viewid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Views = db.collection('views')

            if (await isWheelOwner(req, viewid)) {
                //if owner delete the wheel, areas etc. from DB
                deleteWheelAll(req, viewid)
            } else {
                //if not owner, just delete the view
                await Views.findOneAndDelete({
                    _id: ObjectId(viewid),
                    user: getuserid(req.session)
                })
            }
            return await Views.findOne({ user: getuserid(req.session) })
        },
        removeViewFromUser: async(_, { viewid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Views = db.collection('views')

            //Find the view object that should be deleted
            const view = await Views.findOne({
                _id: ObjectId(viewid)
            })

            //Use view to check if request comes from owner of wheel
            const isOwner = await isWheelOwner(req, view._id)

            if (!isOwner) throw new Error('Unauthorised Deletion of View')

            Views.removeOne({ _id: ObjectId(viewid) }, function(err) {
                if (err) throw err
            })
            return true
        },
        createNewWheel: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            //set wheel, view, and profile to the context.
            let { newview, newprofile } = await createWheel(
                req.session.user,
                req.session.user._id.toString(),
                'owner',
                args.wheelname,
                args.areas,
                getuiversion(req.session),
            )
            req.session.view = newview
            req.session.profile = newprofile
            sessiontrack(req, args, 'app', 'createwheel', 'success')

            return newview //need to return the view, area.
        },
        removeStartArea: async(_, __, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            await Users.updateOne(
                { _id: ObjectId(getprofileid(req.session)) },
                { $set: { startarea: null } },
            )

            return true
        },
        updateStartArea: async(_, { areaid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            const Wheels = db.collection('wheels')

            Wheels.findOne({ _id: ObjectId(getwheelid(req.session)) })
                .then(wheel => {
                    return Areas.findOne({ _id: ObjectId(wheel.startarea) })
                })
                .then(previousStartArea => {
                    AreaLinks.insertOne({
                        area: previousStartArea._id.toString(),
                        areaname: previousStartArea.name,
                        wheelid: getwheelid(req.session),
                        uiversion: getuiversion(req.session),
                        serverversion: pjson.version
                    })

                    Wheels.updateOne(
                        { _id: ObjectId(getwheelid(req.session)) },
                        { $set: { startarea: areaid } },
                    )
                })

            return true
        },
        toggleFocusFlag: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            const Areas = db.collection('areas')
            const area = await AreaLinks.findOne({
                rootarea: args.rootarea,
                area: args.area
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
        deleteArea: async(_, { areaid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            const InsightLinks = db.collection('insightlinks')
            const GoalLinks = db.collection('goallinks')
            const Pomodoros = db.collection('pomodoros')
            const Wheels = db.collection('wheels')

            //Check for right to delete area
            const area = await Areas.findOne({ _id: ObjectId(areaid) })
            const wheel = await Wheels.findOne({ _id: ObjectId(area.wheelid) })
            if (wheel.user !== getuserid(req.session))
                throw new Error('Unauthorised area delete')
            else {
                const areaDel = Areas.deleteOne({ _id: ObjectId(areaid) })
                const areaLinksDel = AreaLinks.deleteMany({
                    area: areaid
                })
                const insightLinksDel = InsightLinks.deleteMany({
                    area: areaid
                })
                const goalLinksDel = GoalLinks.deleteMany({
                    areaid: areaid
                })
                const pomodorosDel = Pomodoros.deleteMany({
                    araed: areaid
                })
                const result = await Promise.all([
                    areaDel,
                    areaLinksDel,
                    insightLinksDel,
                    goalLinksDel,
                    pomodorosDel
                ])
                if (result) return true
                else return false
            }
        },
        setProfile: async(_, { profileid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Profiles = db.collection('profiles')
            const profile = await Profiles.findOne({
                _id: ObjectId(profileid),
                wheel: req.session.view.wheel
            })

            if (!profile) throw new Error('user could not be retrieved.')

            req.session.profile = profile
            return profile
        },
        copyWheel: async(_, { wheelid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            copywheel(wheelid, getuserid(req.session))
            return true
        },
        deleteAreaLink: async(_, { rootarea, area }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            const res = await AreaLinks.deleteMany(
                {
                    rootarea: rootarea,
                    area: area,
                    wheelid: getwheelid(req.session)
                },
                { $set: { arealink: null } },
            )
            return res
        },
        createAreaLink: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            // args.userid = getwheelid(req.session);
            // args.serverversion = pjson.version;
            // args.uiversion = getuiversion(req.session);
            await AreaLinks.insertOne({
                rootarea: args.rootarea,
                area: args.area,
                wheelid: getwheelid(req.session).toString(),
                created: new Date()
            })

            return true
        },
        createArea: async(_, args, { req }) => {
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
                uiversion: getuiversion(req.session)
            })
            return await Areas.findOne({
                _id: res.insertedIds[0],
                wheelid: getwheelid(req.session)
            })
        },
        createCoachArea: async(_, args, { req }) => {
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
                uiversion: getuiversion(req.session)
            })

            const area = await Areas.findOne({
                _id: res.insertedIds[0],
                wheelid: getwheelid(req.session)
            })

            return area
        },
        createRankTime: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const RankTimes = db.collection('ranktimes')
            const Areas = db.collection('areas')

            Areas.findOne({_id: ObjectId(args.area)})
                .then(area => {
                    Areas.updateOne(
                        {_id: ObjectId(area.rootarea)},
                        {$set: {lastranked: new Date(args.datetime)}}
                )})

            args.profileid = getprofileid(req.session)
            args.date = new Date(args.datetime)
            const res = await RankTimes.insert(args)
            return {
                _id: res.insertedIds[1],
                message: 'new rank entry created'
            }
        },
        createGoalTime: async(_, args, { req }) => {
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
                message: 'new goal entry created'
            }
        },
        updateArea: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            await Areas.updateOne(
                { _id: ObjectId(args.area), wheelid: getwheelid(req.session) },
                { $set: args },
            )
            args._id = args.area
            return args
        }
    }
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

    //First area passed is root/start area
    const startArea = (await Areas.insertOne({
        user: userid,
        name: wheelname,
        email: user.email,
        created: new Date()
    })).insertedId.toString()

    //Create wheel object
    wheelid = (await Wheels.insertOne({
        user: userid,
        created: new Date(),
        startarea: startArea,
        name: wheelname
    })).insertedId.toString()

    //Update startarea to have correct wheelid
    Areas.updateOne(
        { _id: ObjectId(startArea) },
        { $set: { wheelid: wheelid } },
    )

    //Setting up the Area records
    if (areas.length > 0) {
        //Blank wheel will have zero attached areas.
        let insertAreas = areas.map(area => {
            return {
                name: area.name,
                wheelid: wheelid,
                definition: area.definition,
                rootarea: startArea,
                uiversion: uiversion,
                created: new Date(),
                serverversion: pjson.version
            }
        })

        let newAreas = (await Areas.insertMany(insertAreas)).insertedIds //insert all records in one go.

        //Setting up the AreaLink records
        let insertAreaLinks = newAreas.map(areaid => {
            return {
                area: areaid.toString(),
                rootarea: startArea,
                wheelid: wheelid,
                uiversion: uiversion,
                serverversion: pjson.version
            }
        })

        AreaLinks.insert(insertAreaLinks) //inserting in one request
    }

    //create new view
    let newview = {
        user: userid,
        email: user.email,
        wheel: wheelid, //req.session.view.wheel,
        created: new Date(),
        name: wheelname,
        type: viewtype
    }
    Views.insertOne(newview)

    //create new profile
    let newprofile = {
        user: userid,
        wheel: wheelid,
        email: user.email,
        created: new Date(),
        name: getname(user.firstname, user.lastname, user.email),
        type: 'shared' //create the first shared profile.
    }
    Profiles.insertOne(newprofile)

    return { newview, newprofile }
}

async function copywheel(wheelid, userid) {
    const db = await DbConnection.Get()
    const Wheels = db.collection('wheels')
    const Areas = db.collection('areas')
    const AreaLinks = db.collection('arealinks')
    const Views = db.collection('views')
    const Profiles = db.collection('profiles')
    const viewtype = 'owner'

    //only using userid as a tag to keep track of the copy.
    //wheel - global
    let newwheel = await Wheels.findOne({
        _id: ObjectId(wheelid)
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
        let insertedareas = (await Areas.insertMany(newareas)).ops

        let newstartareaid = insertedareas
            .find(o => o.copyarea === newwheel.startarea)
            ._id.toString()

        Wheels.updateOne(
            { _id: ObjectId(newwheelid) },
            { $set: { startarea: newstartareaid } },
        )
        //arealinks - global
        let newarealinks = await AreaLinks.find({
            wheelid: wheelid
        }).toArray()

        newarealinks.map(arealink => {
            const newarea = insertedareas.find(
                area => area.copyarea === arealink.area,
            )
            const newrootarea = insertedareas.find(
                o => o.copyarea === arealink.rootarea,
            )
            arealink.user = userid //this is just copied as a reference for ease
            arealink.wheelid = newwheelid //this is the id used for returning arealinks
            arealink.rootarea = newrootarea._id.toString()
            arealink.area = newarea._id.toString()
            arealink.copywheel = wheelid
            arealink.copylink = arealink._id.toString()
            arealink.created = new Date()
            delete arealink._id
            return arealink
        })

        AreaLinks.insertMany(newarealinks)

        //create new profile
        let newprofile = {
            user: userid,
            wheel: newwheelid,
            created: new Date(),
            name: newwheel.name,
            type: 'shared' //create the first shared profile.
        }
        Profiles.insertOne(newprofile)

        //create new view
        let newview = {
            user: userid,
            wheel: newwheelid, //req.session.view.wheel,
            created: new Date(),
            name: newwheel.name,
            type: viewtype
        }
        Views.insertOne(newview)

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
                areaid: _id
            })

            Areas.updateOne(
                {
                    wheelid: getprofileid(req.session),
                    _id: ObjectId(_id)
                },
                { $inc: { clicks: 1 }, $set: { lastclicked: new Date() } },
            )
        }
    } catch (error) {
        console.log(error)
    }
}

async function isWheelOwner(req, viewid) {
    const db = await DbConnection.Get()
    const Views = db.collection('views')
    const view = await Views.findOne({ _id: ObjectId(viewid) }) //find view to get wheel.

    let query = new Object()
    query.wheel = view.wheel
    query.user = getuserid(req.session)
    query.type = 'owner' //if the userview is "owner", then this person is the owner. Will probably change owner to "Owner" at some point.
    const userview = await Views.findOne(query)

    if (userview === null) return false
    else return true
}

async function deleteWheelAll(req, viewid) {
    const db = await DbConnection.Get()
    const Areas = db.collection('areas')
    const AreaLinks = db.collection('arealinks')
    const Goals = db.collection('goals')
    const GoalLinks = db.collection('goallinks')
    const Insights = db.collection('insights')
    const InsightLinks = db.collection('insightlinks')
    const Wheels = db.collection('wheels')
    const Views = db.collection('views')
    const Profiles = db.collection('profiles')

    //assuming only owner can call this function.

    const view = await Views.findOne({
        _id: ObjectId(viewid),
        user: getuserid(req.session)
    })

    const deleteprofiles = await Profiles.find({
        wheel: view.wheel
    }).toArray()

    deleteprofiles.map(function({ _id }) {
        Goals.deleteMany({ profileid: _id })
        GoalLinks.deleteMany({ profileid: _id })
        Insights.deleteMany({ profileid: _id })
        InsightLinks.deleteMany({ profileid: _id })
        Profiles.deleteOne({ _id: _id }) //delete profile last
    })

    Views.deleteMany({ wheel: view.wheel })
    Areas.deleteMany({ wheelid: view.wheel })
    AreaLinks.deleteMany({ wheelid: view.wheel })
    Wheels.deleteMany({ _id: ObjectId(view.wheel) })
}
