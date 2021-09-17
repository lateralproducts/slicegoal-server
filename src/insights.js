import { ObjectId } from 'mongodb'

let pjson = require('../package.json')
import { getuiversion } from '../util/index'
import { getprofileid, getuserid } from './users'
import DbConnection from './database'

export const typeDefs = `

  extend type Query {
    insights(area: String): [InsightLink]
    insightLinks(insightid: String): [InsightLink]
    searchinsights(search: String, spaced: Boolean): [Insight]
    newsharedinsights: Int
    getSharedInsights: SharedInsightList
  }

  extend type Mutation {
    createInsight(datetime: String, profileid: String, prompt: String, answer: String, areatags: [AreaTagIn]): Spaced
    updateInsight(insightid: String, datetime: String, prompt: String, answer: String): Spaced 
    createInsightLink(insightid: String!, profileid: String, area: String, areaname: String): Boolean
    updateInsightLink(linkid: String!, notes: String): Boolean
    removeInsightLink(linkid: String): Boolean
    markSpacedYes(insightid: String, datetime: String): Boolean
    markSpacedNo(insightid: String, datetime: String): Boolean
    removeInsight(insightid: String!): Boolean
    shareInsight(insightid: String!, targetUser: String!): ShareResponse
    popSharedInsight(insightid: String!): Boolean
  }
`

export const schema = `

    type Insight {
        _id: String
        area: String
        prompt: String
        answer: String
        spaced: Spaced
        insightlink: String
        sharedfrom: String
        datetimeshared: String
    }
    type SharedInsightList {
        numberOfInsights: Int
        insightsGroupBySharer: [SharedInsight]
    }
    type SharedInsight {
        name: String
        insights: [Insight]
    }
    type InsightLink {
        _id: String
        insightid: String
        areaid: String
        area: Area
        insight: Insight
        notes: String 
    }
    type Spaced {
        _id: String
        insightid: String
        insight: Insight
        area: String
        datetimecreated: Float
        datetimelast: Float
        fib0: String
        fib1: String
        datenext: String
    }
    type ShareResponse {
        success: Boolean
        message: String
    }
`

export const resolvers = {
    Query: {
        insights: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const insightlinks = await InsightLinks.find(
                {
                    area: args.area,
                    profileid: getprofileid(req.session),
                    $or: [
                        { nextdate: null },
                        { nextdate: { $lte: new Date() } },
                    ],
                },
                { sort: { datecreated: -1 } }, //return reverse chron. Last insight created at top of list.
            ).toArray()

            return insightlinks
        },
        searchinsights: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const insights = await Insights.find(
                {
                    $or: [
                        { answer: new RegExp(args.search, 'i') },
                        { prompt: new RegExp(args.search, 'i') },
                    ],
                    profileid: getprofileid(req.session),
                },
                { sort: { datecreated: -1 } }, //return reverse chron. Last note created at top of list.
            ).toArray()

            return insights
        },
        newsharedinsights: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')

            const user = await Users.findOne({
                _id: ObjectId(getuserid(req.session)),
            })

            const found = await Insights.find({
                email: user.email,
                status: 'newshared',
            }).toArray()

            if (found) return found.length
            else return 0
        },
        getSharedInsights: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')
            const user = await Users.findOne({
                _id: ObjectId(getuserid(req.session)),
            })

            const totalSharedInsights = await Insights.find({
                email: user.email,
                status: 'newshared',
            }).toArray()

            const distinctSharers = await Insights.distinct('sharedfrom', {
                email: user.email,
                status: 'newshared',
            })
            return {
                numberOfInsights: totalSharedInsights.length,
                distinctSharers: distinctSharers,
            }
        },
        insightLinks: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const insightlinks = await InsightLinks.find({
                insightid: args.insightid,
                profileid: getprofileid(req.session),
            }).toArray()
            return insightlinks
        },
    },
    Insight: {
        spaced: async (parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Spaced = db.collection('spaced')
            let spaced = await Spaced.findOne({
                insightid: parent._id.toString(),
                userid: getprofileid(req.session),
            })
            return spaced
        },
    },
    InsightLink: {
        area: async (parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return await Areas.findOne({ _id: ObjectId(parent.area) })
        },
        insight: async (parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            return await Insights.findOne({ _id: ObjectId(parent.insightid) })
        },
    },
    SharedInsightList: {
        insightsGroupBySharer: async (parent, args, { req }) => {
            return parent.distinctSharers
        },
    },
    SharedInsight: {
        name: async (userid, args, { req }) => {
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            const user = await Users.findOne({
                _id: ObjectId(userid),
            })

            return user.lastname
                ? user.firstname + ' ' + user.lastname
                : user.firstname
        },
        insights: async (userid, args, { req }) => {
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')

            return await Insights.find({
                status: 'newshared',
                sharedfrom: userid,
            }).toArray()
        },
    },
    Mutation: {
        markSpacedYes: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Spaced = db.collection('spaced')
            const InsightLinks = db.collection('insightlinks')
            args.date = new Date(args.datetime)
            const insightId = args.insightId
            delete args.insightId
            const spaced = await Spaced.findOne({
                insightid: insightId,
                userid: getprofileid(req.session),
            })
            if (spaced.fib1) {
                args.fib1 = spaced.fib0 + spaced.fib1
                args.fib0 = spaced.fib1
            } else {
                args.fib1 = 1
                args.fib0 = 1
            }
            let nextdate = new Date(args.datetime) //set nextdate for today + fibonacci sequence
            nextdate.setDate(nextdate.getDate() + args.fib1)
            args.datenext = nextdate

            InsightLinks.update(
                { insightid: insightId, profileid: getprofileid(req.session) },
                {
                    $set: { nextdate: nextdate },
                },
                { multi: true },
            )

            Spaced.update(
                { insightid: insightId, userid: getprofileid(req.session) },
                {
                    $set: args,
                },
            )
            return true
        },
        markSpacedNo: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const Spaced = db.collection('spaced')
            args.date = new Date(args.datetime)
            args.fib0 = 0
            args.fib1 = 1
            const insightId = args.insightId
            delete args.insightId
            let nextdate = new Date()
            nextdate.setDate(nextdate.getDate() + 1)
            args.datenext = nextdate

            const spaced = await Spaced.findOne({
                insightid: insightId,
                userid: getprofileid(req.session),
            })

            await InsightLinks.update(
                { insightid: insightId, profileid: getprofileid(req.session) },
                {
                    $set: { nextdate: nextdate },
                },
                { multi: true },
            )

            args.markedno = spaced.markedno ? spaced.markedno + 1 : 1

            await Spaced.update(
                { insightid: insightId, userid: getprofileid(req.session) },
                {
                    $set: args,
                },
            )
            return true
        },
        updateInsight: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            args.lastedited = new Date(args.datetime)
            let insightid = args.insightid
            delete args.insightid
            const res = await Insights.updateOne(
                { _id: ObjectId(insightid) },
                { $set: args },
            )
            return {
                _id: insightid,
                message: 'insight updated',
            }
        },
        createInsightLink: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const Areas = db.collection('areas')
            if (!args.profileid) args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.datecreated = new Date()

            let areaid
            if (!args.area) {
                let newarea = new Object() //create new area.
                newarea.wheelid = args.profileid //update: check to see if this should be profileid, not wheelid...
                newarea.name = args.areaname
                const inserted = await Areas.insertOne(newarea) //only creating new area if "areaname is added"
                areaid = inserted.insertedId.toString()
            } else {
                areaid = args.area

                Areas.updateOne(
                    {
                        wheelid: getwheelid(req.session),
                        _id: ObjectId(areaid),
                    },
                    { $inc: { tagged: 1 }, $set: { lasttagged: new Date() } },
                )
            }

            const link = await InsightLinks.insertOne({
                //insert the link to connect insight and new area.
                insightid: args.insightid,
                profileid: args.profileid,
                area: areaid,
                datecreated: new Date(),
            })

            return link.insertedId ? true : false
        },
        updateInsightLink: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            args.profileid = getprofileid(req.session)
            InsightLinks.updateOne(
                { _id: ObjectId(args.linkid) },
                { $set: { notes: args.notes } },
                function (err, obj) {
                    if (err) throw err
                },
            )
            return true
        },
        removeInsightLink: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            args.profileid = getprofileid(req.session)
            InsightLinks.deleteOne(
                {
                    _id: ObjectId(args.linkid),
                    profileid: args.profileid,
                },
                function (err, obj) {
                    if (err) throw err
                },
            )
            return true
        },
        /* createNewInsightLink: async (root, args, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const InsightLinks = db.collection('insightlinks')
            let newarea = new Object() //create new area.
            newarea.wheelid = getprofileid(req.session)
            newarea.name = args.areaname
            const res = await Areas.insert(newarea)

            await InsightLinks.insertOne({
                //insert the link to connect insight and new area.
                insightid: args.insightid,
                profileid: getprofileid(req.session),
                area: res.insertedIds[0].toString(),
                datecreated: new Date(args.datetime),
            })
            return res.insertedIds[1] ? true : false
        }, */
        createInsight: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.datecreated = new Date(args.datetime)
            args.lastedited = new Date(args.datetime)
            const insertedId = await createinsight(args, req)

            return {
                _id: insertedId,
                message: 'new insight created',
            }
        },
        removeInsight: async (root, { insightid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const Insights = db.collection('insights')
            const Profiles = db.collection('profiles')

            //Check ownership
            Insights.findOne({ _id: ObjectId(insightid) }).then((insight) => {
                Profiles.findOne({ _id: ObjectId(insight.profileid) }).then(
                    (profile) => {
                        if (profile.user !== getuserid(req.session)) {
                            throw new Error('Unauthorised Insight Delete')
                        } else {
                            InsightLinks.deleteMany(
                                { insightid: insightid },
                                function (err, obj) {
                                    if (err) throw err
                                },
                            )
                            Insights.deleteOne(
                                { _id: ObjectId(insightid) },
                                function (err, obj) {
                                    if (err) throw err
                                },
                            )
                            return true
                        }
                    },
                )
            })
        },
        shareInsight: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')

            const user = await Users.findOne({
                _id: ObjectId(getuserid(req.session)),
            })

            if (args.targetUser === user.email)
                return {
                    success: false,
                    message: 'Cannot share with yourself - try duplicating',
                }
            else {
                // Find insight being copied from
                const insight = await Insights.findOne({
                    _id: ObjectId(args.insightid),
                })

                return await Insights.insertOne({
                    sharedfrom: getuserid(req.session),
                    status: 'newshared',
                    datetimeshared: new Date(),
                    email: args.targetUser,
                    datecreated: insight.datecreated,
                    answer: insight.answer,
                })
                    .then(() => {
                        return {
                            success: true,
                            message: 'Insight shared',
                        }
                    })
                    .catch((err) => {
                        return {
                            success: false,
                            message: err.message,
                        }
                    })
            }
        },
        popSharedInsight: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')

            const user = await Users.findOne({
                _id: ObjectId(getuserid(req.session)),
            })

            const insight = await Insights.findOne({
                _id: ObjectId(args.insightid),
            })

            if (insight.email !== user.email)
                throw new Error('Unauthorised Operation')
            else {
                const result = await Insights.deleteOne({
                    _id: ObjectId(args.insightid),
                })
                if (result.result.ok === 1) return true
                else return false
            }
        },
    },
}

function getwheelid(session) {
    if (session.view) return session.view.wheel
    else return null
}

async function createinsight(newinsight, req) {
    //passing wheelid and profileid on newinsight object.
    const db = await DbConnection.Get()
    const Insights = db.collection('insights')
    const Spaced = db.collection('spaced')
    const Areas = db.collection('areas')
    const insightLinks = db.collection('insightlinks')

    const Profiles = db.collection('profiles')

    if (newinsight.profileid) {
        //get wheelid from profile.
        const profile = await Profiles.findOne({
            _id: ObjectId(newinsight.profileid),
        })
        if (profile) newinsight.wheelid = profile.wheel
    }
    if (!newinsight.profileid) newinsight.profileid = getprofileid(req.session)

    try {
        //first insert the insight into DB
        const result = await Insights.insertOne(newinsight)

        if (newinsight.prompt) {
            //this is functionality for spaced repetition. Only activated if the insight has a prompt.
            let spaced = new Object()
            spaced.insightid = result.insertedId.toString()
            spaced.profileid = newspaced.profileid
            spaced.fib0 = 0
            spaced.fib1 = 1
            let nextdate = new Date() //set nextdate for tomorrow.
            nextdate.setDate(nextdate.getDate() + 1)
            spaced.datenext = nextdate
            Spaced.insert(spaced)
        }

        if (newinsight.areatags)
            //if there are area tags, save the area tags
            newinsight.areatags.map(async (link) => {
                let areaid = link.area._id
                if (!areaid) {
                    //if area doesn't exist, create it.
                    let area = {
                        name: link.name,
                        wheelid: newinsight.wheelid
                            ? newinsight.wheelid
                            : getwheelid(req.session),
                        serverversion: pjson.version,
                        uiversion: getuiversion(req.session),
                        created: new Date(),
                    }

                    const res = await Areas.insert(area)
                    areaid = res.insertedIds[0].toString()
                }

                let insightlink = new Object()
                insightlink.insightid = result.insertedId.toString()
                insightlink.profileid = newinsight.profileid
                insightlink.area = areaid
                insightlink.notes = link.notes
                insightlink.datecreated = new Date()
                insightLinks.insert(insightlink)

                Areas.updateOne(
                    {
                        wheelid: newinsight.wheelid
                            ? newinsight.wheelid
                            : getwheelid(req.session),
                        _id: ObjectId(areaid),
                    },
                    { $inc: { tagged: 1 }, $set: { lasttagged: new Date() } },
                )
            })
        return result.insertedId.toString()
    } catch (error) {
        console.log(error)
    }
}
