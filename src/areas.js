import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';

import DbConnection from './database'
import { getWeekNumber, getWeekYear, getuiversion } from '../util/functions'
import { getuserid, getprofileid, getwheelid, getname } from './users'
import { sessiontrack } from './website'
let pjson = require('../package.json')

/*
    goaltimes(areaId: String): [GoalTime]
    lastgoaltime(areaId: String): GoalTime
*/

export const typeDefs = `

    extend type Query {
        wheel(wheelid: String):[Wheel]
        wheels(tag: String):[Wheel]
        allviews (type: String): [View]
        sharedviews: [View]
        profiles: [Profile]
        area(_id: String!, navdirection: String, readdate: String): Area
        areas (wheelid: String, readdate: String, search: String, limit: Int): [Area]
        arealinks(areaid: String): [AreaLink]
        ranktimes(areaId: String): [RankTime]
        lastranktime(areaId: String): RankTime
        viewsOnWheel(wheelid: String!): [View]
        areatree(areaid: String): [Area]
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
        createRankTime(anchorarea: String, area: String, rank: Int, datetime: String, note: String): Boolean
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
        rankdue: Boolean
        count: Int
    }

    type AreaReturn {
        count: Int
        area: Area
    }

    type View {
        _id: String
        type: String
        wheel: Wheel
        user: ViewUser
        name: String
        email: String
        promptupgrade: Boolean
        sharedby: User
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
        unseen: Boolean
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
        date: String
        goaldate: String
    }
`

export const resolvers = {
    Query: {
        allviews: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            const Users = db.collection('users')
            const user = await Users.findOne({_id: new ObjectId(getuserid(req.session))}) //don't use session user instance, as that doesn't work.
            let query = new Object()
            query.user = getuserid(req.session)
            if (args.type === 'notcurrent')
                query.wheel = { $ne: getwheelid(req.session) }
            if (args.type === 'default') query.default = true //defaultview //if asking for default profile only return the default.
            var views = await Views.find(query).toArray()
            return views.map(view => {
                if(view.type === 'shared' && user.activeofferid !== 2) view.promptupgrade = true
                return view
            })
        },
        sharedviews: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            const Users = db.collection('users')
            const user = await Users.findOne({_id: new ObjectId(getuserid(req.session))}) //don't use session user instance, as that doesn't work.
            let query = new Object()
            query.user = getuserid(req.session)
            query.type = 'shared' //asking for shared wheels.
            var views = await Views.find(query).toArray()
            return views.map(view => {
                if(view.type === 'shared' && user.activeofferid !== 2) view.promptupgrade = true
                return view
            })
        },
        wheel: async(_, { wheelid }) => {
            //This is a **publicly** accessible call, used on the website. Don't need to login to retrieve.
            //Could potentially have a completely different server running this in the future.
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            return await Wheels.findOne({
                _id: new ObjectId(wheelid),
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
        areas: async(_, {wheelid, search, limit=0}, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const wheel = !wheelid ? getwheelid(req.session) : wheelid

            let query = new Object()
            query.wheelid = wheel
            if (search) query.name = new RegExp(search, 'i')
            let areas = await Areas.find(query) // , $or: [{ { global: true }, wheelid: getwheelid(req.session)] if we want to use global areas to define wheels. Needs more thought.
            .sort({ lasttagged: -1, lastclicked: -1 })
            .limit(limit).toArray()
            return areas
        },
        profiles: async(_, __, { req }) => {
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
            
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            logareaclick(_id, navdirection, req)

            let area = await Areas.findOne({
                _id: new ObjectId(_id),
                $or: [{ wheelid: getwheelid(req.session) }, { global: true }]
            })
            return area
        },
        areatree: async(_, { areaid }, { req }) => {
            const areatree = await getareatree({tags:[areaid], tasklist, req})
            
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            
            let areas = await Areas.find({
                _id: {$in: areatree.map(id => {return new ObjectId(id)})}
            }).toArray()
            return areas
        },
        ranktimes: async(_, { areaId }, { req }) => {
            
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
            
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            return await AreaLinks.find({
                rootarea: { $not: { $eq: null } },
                area: args.areaid,
                wheelid: getwheelid(req.session)
            }).toArray()
        },
        /* goaltimes: async(_, __, { req }) => {
            
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            return await GoalTimes.find({ profileid: getprofileid(req.session) })
                .sort({ date: -1 })
                .toArray()
        }, */
        lastranktime: async(_, { areaId }, { req }) => {
            
            const db = await DbConnection.Get()
            const RankTimes = db.collection('ranktimes')
            //if coach, return average of coachees.
            return await RankTimes.findOne(
                { areaId: areaId, profileid: getprofileid(req.session) },
                { sort: { date: -1 } },
            )
        },
        /* lastgoaltime: async(_, { areaId }, { req }) => {
            
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            return await GoalTimes.findOne(
                { areaId: areaId, profileid: getprofileid(req.session) },
                { sort: { date: -1 } },
            )
        }, */
        viewsOnWheel: async(_, { wheelid }, { req }) => {
            
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
            if (!owner) return triggererror('Request not from wheel owner')

            views.splice(ownersview, 1) //remove owners view from the list
            return views
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
            //if (args.default) query._id = new ObjectId(parent.view.defaultprofile); //if asking for default profile only return the default.
            return await Profiles.find(query)
                .sort({ type: -1, name: 1 })
                .toArray()
        },
        startarea: async parent => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            let query = new Object()
            query._id = new ObjectId(parent.startarea)
            return await Areas.findOne(query)
        },
        unseen: async(parent, __, { req }) => {
            
            const db = await DbConnection.Get()
            const Chats = db.collection('chats')

            const wheelid = parent.view.wheel
            const userid = getuserid(req.session)

            const chat = await Chats.findOne({wheelid: wheelid, unseen: userid})
            if (chat) {return true} //check if user has seen this chat.
            else return false
        }
    },
    Profile: {
        wheel: async parent => {
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            return await Wheels.findOne({
                _id: new ObjectId(parent.wheel)
            })
        }
    },
    AreaLink: {
        linkedarea: async parent => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return parent.rootarea
                ? await Areas.findOne({
                      _id: new ObjectId(parent.rootarea)
                  })
                : { _id: new ObjectId(parent.area), name: null }
        }
    },
    View: {
        wheel: async obj => {
            const db = await DbConnection.Get()
            const Wheels = db.collection('wheels')
            let wheel = await Wheels.findOne({
                _id: new ObjectId(obj.wheel)
            })
            if (wheel) wheel.view = obj
            return wheel
        },
        user: async view => {
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            return await Users.findOne({
                _id: new ObjectId(view.user)
            })
        },
        sharedby: async view => {
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            return await Users.findOne({
                _id: new ObjectId(view.sharedby)
            })
        }
    },
    Area: {
        clicks: async({ _id }, __, { req }) => {
            return 0
            /* const db = await DbConnection.Get()
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
            }) */
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
                        return new ObjectId(id)
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

                    //returning the average of the area for coaching
                    const rank = await RankTimes.aggregate(
                        [{
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
                        }]
                    )
                     
                    if (rank[0]) return {
                        rank: parseInt(data[0].rank),
                        note: 'team average'
                    }
                    else return null
                    
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
                { area: _id.toString(), profileid: getprofileid(req.session) },
                { sort: { date: -1 } },
            )
            return goal ? goal : null
        },
        time: async({ _id }, {datetime}, { req }) => {
            const db = await DbConnection.Get()
            const AreaWeekAggregate = db.collection('aggareaweek')

            if (!datetime) datetime = new Date(new Date().toLocaleString("en-US", {timeZone: "Australia/Melbourne"}))
            else datetime = new Date(new Date(datetime).toLocaleString("en-US", {timeZone: "Australia/Melbourne"}))
            const week = getWeekNumber(datetime)
            const weekyear = getWeekYear(datetime) //different at start of year sometimes.

            const weekagg = await AreaWeekAggregate.findOne({area: _id, week: week, year: weekyear})

            return {count: weekagg ? weekagg.logtime : 0}
        },
        rankdue: async area => {
            let checkDate = new Date()
            const weekAgo = checkDate.getDate() - 7
            checkDate.setDate(weekAgo)

            if(!area.lastranked ||
                area.lastranked < checkDate)
                return true
            else 
                return false
        }
    },
    Mutation: {
        setView: async(_, { viewid }, { req }) => {
            if (viewid) return await setView(viewid, req)
            else return setLastAccessedView(req)
        },
        deleteView: async(_, { viewid }, { req }) => {
            
            const db = await DbConnection.Get()
            const Views = db.collection('views')

            if (await isWheelOwner(req, viewid)) {
                //if owner delete the wheel, areas etc. from DB
                deleteWheelAll(req, viewid)
            } else {
                //if not owner, just delete the view
                await Views.findOneAndDelete({
                    _id: new ObjectId(viewid),
                    user: getuserid(req.session)
                })
            }
            return await Views.findOne({ user: getuserid(req.session) })
        },
        removeViewFromUser: async(_, { viewid }, { req }) => {
            
            const db = await DbConnection.Get()
            const Views = db.collection('views')

            //Find the view object that should be deleted
            const view = await Views.findOne({
                _id: new ObjectId(viewid)
            })

            //Use view to check if request comes from owner of wheel
            const isOwner = await isWheelOwner(req, view._id)

            if (!isOwner) return triggererror('Unauthorised Deletion of View')

            Views.deleteOne({ _id: new ObjectId(viewid) }, function(err) {
                if (err) throw err
            })
            return true
        },
        createNewWheel: async(_, args, { req }) => {
            
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
            
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            await Users.updateOne(
                { _id: new ObjectId(getprofileid(req.session)) },
                { $set: { startarea: null } },
            )

            return true
        },
        updateStartArea: async(_, { areaid }, { req }) => {
            
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            const Wheels = db.collection('wheels')

            Wheels.findOne({ _id: new ObjectId(getwheelid(req.session)) })
                .then(wheel => {
                    return Areas.findOne({ _id: new ObjectId(wheel.startarea) })
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
                        { _id: new ObjectId(getwheelid(req.session)) },
                        { $set: { startarea: areaid } },
                    )
                })

            return true
        },
        toggleFocusFlag: async(_, args, { req }) => {
            
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
                { _id: new ObjectId(args.area) },
                { $set: { focus: focusflag } },
            )
            return focusflag
        },
        deleteArea: async(_, { areaid }, { req }) => {
            
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            const InsightTags = db.collection('insighttags')
            const GoalTags = db.collection('goaltags')
            const Pomodoros = db.collection('pomodoros')
            const Wheels = db.collection('wheels')

            //Check for right to delete area
            const area = await Areas.findOne({ _id: new ObjectId(areaid) })
            const wheel = await Wheels.findOne({ _id: new ObjectId(area.wheelid) })
            if (wheel.user !== getuserid(req.session))
                return triggererror('Unauthorised area delete')
            else {
                const areaDel = Areas.deleteOne({ _id: new ObjectId(areaid) })
                const areaLinksDel = AreaLinks.deleteMany({
                    area: areaid
                })
                const insightTagsDel = InsightTags.deleteMany({
                    area: areaid
                })
                const goalTagsDel = GoalTags.deleteMany({
                    areaid: areaid
                })
                const pomodorosDel = Pomodoros.deleteMany({
                    araed: areaid
                })
                const result = await Promise.all([
                    areaDel,
                    areaLinksDel,
                    insightTagsDel,
                    goalTagsDel,
                    pomodorosDel
                ])
                if (result) return true
                else return false
            }
        },
        setProfile: async(_, { profileid }, { req }) => {
            
            const db = await DbConnection.Get()
            const Profiles = db.collection('profiles')
            const profile = await Profiles.findOne({
                _id: new ObjectId(profileid),
                wheel: req.session.view.wheel
            })

            if (!profile) return triggererror('user could not be retrieved.')

            req.session.profile = profile
            return profile
        },
        copyWheel: async(_, { wheelid }, { req }) => {
            
            copywheel(wheelid, getuserid(req.session))
            return true
        },
        deleteAreaLink: async(_, { rootarea, area }, { req }) => {
            
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            const res = await AreaLinks.deleteMany(
                {
                    rootarea: rootarea,
                    area: area,
                    wheelid: getwheelid(req.session)
                }
            )
            return res
        },
        createAreaLink: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const AreaLinks = db.collection('arealinks')
            await AreaLinks.insertOne({
                rootarea: args.rootarea,
                area: args.area,
                wheelid: getwheelid(req.session).toString(),
                created: new Date()
            })
            return true
        },
        createArea: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            args.wheelid = getwheelid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.created = new Date()

            const res = await Areas.insertOne(args)
            await AreaLinks.insertOne({
                rootarea: args.rootarea,
                area: res.insertedId.toString(),
                areaname: args.name,
                wheelid: getwheelid(req.session),
                serverversion: pjson.version,
                uiversion: getuiversion(req.session)
            })
            return await Areas.findOne({
                _id: res.insertedId,
                wheelid: getwheelid(req.session)
            })
        },
        createCoachArea: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const AreaLinks = db.collection('arealinks')
            args.wheelid = getwheelid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.created = new Date()
            args.coach = true

            const res = await Areas.insertOne(args)

            await AreaLinks.insertOne({
                rootarea: args.rootarea,
                area: res.insertedId.toString(),
                areaname: args.name,
                wheelid: getwheelid(req.session),
                serverversion: pjson.version,
                uiversion: getuiversion(req.session)
            })

            const area = await Areas.findOne({
                _id: res.insertedId,
                wheelid: getwheelid(req.session)
            })

            return area
        },
        createRankTime: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const RankTimes = db.collection('ranktimes')
            const Areas = db.collection('areas')

            Areas.updateOne(
                {_id: new ObjectId(args.anchorarea)},
                {$set: {lastranked: new Date(args.datetime)}} //time set from client argument
            )
            
            const ranktimeargs = {
                profileid: getprofileid(req.session),
                date: new Date(args.datetime), //time set from client argument
                rank: args.rank,
                note: args.note,
                area: args.area
            }

            return await RankTimes.insertOne(ranktimeargs)
                .then(ranktime => {
                    if(ranktime.insertedCount) return true
                })
        },
        createGoalTime: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const GoalTimes = db.collection('goaltimes')
            args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.date = new Date(args.datetime) //time set from client argument
            if (args.goaldate) args.goaldate = new Date(args.goaldate) //time set from client argument
            const res = await GoalTimes.insertOne(args)
            return {
                _id: res.insertedId,
                message: 'new goal entry created'
            }
        },
        updateArea: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            await Areas.updateOne(
                { _id: new ObjectId(args.area), wheelid: getwheelid(req.session) },
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
        { _id: new ObjectId(startArea) },
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

        const newAreasIDs = Object.values(newAreas)
        //Setting up the AreaLink records
        let insertAreaLinks = newAreasIDs.map(areaid => {
            return {
                area: areaid.toString(),
                rootarea: startArea,
                wheelid: wheelid,
                uiversion: uiversion,
                serverversion: pjson.version
            }
        })

        AreaLinks.insertMany(insertAreaLinks) //inserting in one request
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
        _id: new ObjectId(wheelid)
        //need to work out security here.
    })

    if (!newwheel) {
        return triggererror('Wheel not found to copy')
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

        let insertedareas = (await Areas.insertMany(newareas)).insertedIds

        let newstartareaid = insertedareas[0]
        /* insertedareas
            .find(o => o.copyarea === newwheel.startarea)
            ._id.toString() */

        Wheels.updateOne(
            { _id: new ObjectId(newwheelid) },
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

        if(newarealinks.length > 0) AreaLinks.insertMany(newarealinks)
        
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
                    _id: new ObjectId(_id)
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
    const view = await Views.findOne({ _id: new ObjectId(viewid) }) //find view to get wheel.

    let query = new Object()
    query.wheel = view.wheel
    query.user = getuserid(req.session)
    query.type = 'owner' 
    const userview = await Views.findOne(query)

    if (userview === null) return false
    else return true
}

async function deleteWheelAll(req, viewid) {
    const db = await DbConnection.Get()
    const Areas = db.collection('areas')
    const AreaLinks = db.collection('arealinks')
    const Goals = db.collection('goals')
    const GoalTags = db.collection('goaltags')
    const Insights = db.collection('insights')
    const InsightTags = db.collection('insighttags')
    const Wheels = db.collection('wheels')
    const Views = db.collection('views')
    const Profiles = db.collection('profiles')

    //assuming only owner can call this function.

    const view = await Views.findOne({
        _id: new ObjectId(viewid),
        user: getuserid(req.session)
    })

    const deleteprofiles = await Profiles.find({
        wheel: view.wheel
    }).toArray()

    deleteprofiles.map(function({ _id }) {
        Goals.deleteMany({ profileid: _id })
        GoalTags.deleteMany({ profileid: _id })
        Insights.deleteMany({ profileid: _id })
        InsightTags.deleteMany({ profileid: _id })
        Profiles.deleteOne({ _id: _id }) //delete profile last
    })

    Views.deleteMany({ wheel: view.wheel })
    Areas.deleteMany({ wheelid: view.wheel })
    AreaLinks.deleteMany({ wheelid: view.wheel })
    Wheels.deleteMany({ _id: new ObjectId(view.wheel) })
}

export async function getareatree({tags, req, tasklist}) {
    const db = await DbConnection.Get()
    const AreaLinks = db.collection('arealinks')
    const Tasks = db.collection('tasks')
    
    let startareaid
    if (req) {
        const Wheels = db.collection('wheels')
        const Areas = db.collection('areas')

        const startarea = await Wheels.findOne({ _id: new ObjectId(getwheelid(req.session)) })
        .then(wheel => {
            return Areas.findOne({ _id: new ObjectId(wheel.startarea) })
        })
        startareaid = startarea._id.toString()
    }

    let areatree = tags || []
    let newareas = []
    let checkareas = tags || []

    const tasks = await Tasks.find(
        {_id: {
            $in: tasklist.map(taskid => new ObjectId(taskid))
        }}
    ).toArray()

    if (tasks) {
        let tags = tasks.flatMap(task => task.tags || [])
        areatree = areatree.concat(tags)
        checkareas = areatree
    }
    
    while (checkareas.length > 0) {
        //find all parent goals linked to goals
        let addareas = await AreaLinks.find(
            {area: {
                $in: checkareas
            }}
        ).toArray()

        let theseareas = addareas.map(
            link => link.rootarea
        )
        //turn into set for more efficient processing (need to confirm)
        let areaset = new Set(areatree); 
        newareas = theseareas.filter(item => !areaset.has(item));
        //add all new parent areas to the tree.
        areatree = areatree.concat(newareas)

        //update checkgoals to new areas and loop
        if (newareas.includes(startareaid)) {
            //if root area reached, stop building tree.
            checkareas = []
            //console.log("got to start area")
        }
        else checkareas = newareas
    }

    return areatree
}

export async function setView(viewid, req) {
    const db = await DbConnection.Get()
    const Views = db.collection('views')
    const Users = db.collection('users')
    const Profiles = db.collection('profiles')

    const user = await Users.findOne({ _id: new ObjectId(req.session.user._id) })

    //set wheel, view, and profile to the context.
    let query = new Object()
    query._id = new ObjectId(viewid)
    query.user = getuserid(req.session)
    const view = await Views.findOne(query)
    if (!view) return triggererror('View not found')

    if (view.type === "shared" && user.activeofferid !== 2) {
        //block access if not upgraded.
        return triggererror('Plan needs to be upgraded to access wheel.')
    } else {
        let query = new Object()
        query.wheel = view.wheel
        if (view.type === 'shared')
            query.$or = [{ user: getuserid(req.session) }, { type: 'shared' }] //access allowed to all profiles for coach.

        const profile = await Profiles.findOne(query)

        if (!profile) return triggererror('View Profile combination not found')

        req.session.view = view
        req.session.profile = profile

        // Update the lastaccessed field of the selected view
        await Views.updateOne({ _id: new ObjectId(viewid) }, { $set: { lastaccessed: new Date() } })

        return view //need to return the view, area.
    }
}

export async function setLastAccessedView(req) {
    const db = await DbConnection.Get()
    const Views = db.collection('views')

    const view = await Views.findOne({}, { sort: { lastaccessed: -1 } })
    if (!view) return triggererror('View not found')

    if (view.type === "shared" && user.activeofferid !== 2) {
        //block access if not upgraded.
        return triggererror('Plan needs to be upgraded to access wheel.')
    } else {
        let query = new Object()
        query.wheel = view.wheel
        if (view.type === 'shared')
            query.$or = [{ user: getuserid(req.session) }, { type: 'shared' }] //access allowed to all profiles for coach.

        const profile = await Profiles.findOne(query)

        if (!profile) return triggererror('View Profile combination not found')

        req.session.view = view
        req.session.profile = profile

        // Update the lastaccessed field of the selected view
        await Views.updateOne({ _id: new ObjectId(viewid) }, { $set: { lastaccessed: new Date() } })

        return view //need to return the view, area.
    }
}
