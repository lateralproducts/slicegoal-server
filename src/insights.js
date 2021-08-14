import { ObjectId } from 'mongodb'

let pjson = require('../package.json')
import { getuiversion } from '../util/index'
import { getprofileid } from './users'
import DbConnection from './database'

export const typeDefs = `

  extend type Query {
    insightLinks(noteid: String): [InsightLink]
    insights(area: String): [InsightLink]
    searchinsights(search: String, spaced: Boolean): [Insight]
  }

  extend type Mutation {
    markSpacedYes(noteid: String, datetime: String): Boolean
    markSpacedNo(noteid: String, datetime: String): Boolean
    updateInsight(noteid: String, datetime: String, prompt: String, answer: String): Spaced 
    createInsightLink(noteid: String!, area: String, areaname: String): Boolean
    updateInsightLink(linkid: String!, notes: String): Boolean
    removeInsightLink(linkid: String): Boolean
    createInsight(datetime: String, prompt: String, answer: String, arealinks: [AreaLinkIn]): Spaced
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
    }

    type InsightLink {
        _id: String
        noteid: String
        areaid: String
        area: Area
        note: Insight
        notes: String 
    }

    type Spaced {
        _id: String
        noteid: String
        insight: Insight
        area: String
        datetimecreated: Float
        datetimelast: Float
        fib0: String
        fib1: String
        datenext: String
    }
`

export const resolvers = {
    Query: {
        insights: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('notelinks')
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
            const Insights = db.collection('notes')
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
        insightLinks: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('notelinks')
            const insightlinks = await InsightLinks.find({
                noteid: args.noteid,
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
                noteid: parent._id.toString(),
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
        note: async (parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Insights = db.collection('notes')
            return await Insights.findOne({ _id: ObjectId(parent.noteid) })
        },
    },
    Mutation: {
        markSpacedYes: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Spaced = db.collection('spaced')
            const InsightLinks = db.collection('notelinks')
            args.date = new Date(args.datetime)
            const noteId = args.noteId
            delete args.noteId
            const spaced = await Spaced.findOne({
                noteid: noteId,
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
                { noteid: noteId, profileid: getprofileid(req.session) },
                {
                    $set: { nextdate: nextdate },
                },
                { multi: true },
            )

            Spaced.update(
                { noteid: noteId, userid: getprofileid(req.session) },
                {
                    $set: args,
                },
            )
            return true
        },
        markSpacedNo: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('notelinks')
            const Spaced = db.collection('spaced')
            args.date = new Date(args.datetime)
            args.fib0 = 0
            args.fib1 = 1
            const noteId = args.noteId
            delete args.noteId
            let nextdate = new Date()
            nextdate.setDate(nextdate.getDate() + 1)
            args.datenext = nextdate

            const spaced = await Spaced.findOne({
                noteid: noteId,
                userid: getprofileid(req.session),
            })

            await InsightLinks.update(
                { noteid: insightId, profileid: getprofileid(req.session) },
                {
                    $set: { nextdate: nextdate },
                },
                { multi: true },
            )

            args.markedno = spaced.markedno ? spaced.markedno + 1 : 1

            await Spaced.update(
                { noteid: insightId, userid: getprofileid(req.session) },
                {
                    $set: args,
                },
            )
            return true
        },
        updateInsight: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('notes')
            args.lastedited = new Date(args.datetime)
            let noteid = args.noteid
            delete args.insightid
            const res = await Insights.updateOne(
                { _id: ObjectId(noteid) },
                { $set: args },
            )
            return {
                _id: noteid,
                message: 'insight updated',
            }
        },
        createInsightLink: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('notelinks')
            const Areas = db.collection('areas')
            args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.datecreated = new Date()

            let areaid
            if (!args.area) {
                let newarea = new Object() //create new area.
                newarea.wheelid = getprofileid(req.session) //update: check to see if this should be profileid, not wheelid...
                newarea.name = args.areaname
                const inserted = await Areas.insertOne(newarea) //only creating new area if "areaname is added"
                areaid = inserted.insertedId.toString()
            } else {
                areaid = args.area
            }

            const link = await InsightLinks.insertOne({
                //insert the link to connect insight and new area.
                noteid: args.noteid,
                profileid: getprofileid(req.session),
                area: areaid,
                datecreated: new Date(),
            })

            return link.insertedId ? true : false
        },
        updateInsightLink: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('notelinks')
            args.profileid = getprofileid(req.session)
            InsightLinks.updateOne(
                { _id: ObjectId(args.linkid) },
                { $set: { notes: args.notes } },
                function(err, obj) {
                    if (err) throw err
                },
            )
            return true
        },
        removeInsightLink: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('notelinks')
            args.profileid = getprofileid(req.session)
            InsightLinks.deleteOne(
                {
                    _id: ObjectId(args.linkid),
                    profileid: args.profileid,
                },
                function(err, obj) {
                    if (err) throw err
                },
            )
            return true
        },
        /* createNewInsightLink: async (root, args, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const InsightLinks = db.collection('notelinks')
            let newarea = new Object() //create new area.
            newarea.wheelid = getprofileid(req.session)
            newarea.name = args.areaname
            const res = await Areas.insert(newarea)

            await InsightLinks.insertOne({
                //insert the link to connect insight and new area.
                noteid: args.insightid,
                profileid: getprofileid(req.session),
                area: res.insertedIds[0].toString(),
                datecreated: new Date(args.datetime),
            })
            return res.insertedIds[1] ? true : false
        }, */
        createInsight: async (root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.datecreated = new Date(args.datetime)
            args.lastedited = new Date(args.datetime)
            createinsight(args, req)

            return {
                _id: 1,
                message: 'new insight created',
            }
        },
    },
}

async function createinsight(newinsight, req) {
    const db = await DbConnection.Get()
    const Insights = db.collection('notes')
    const Spaced = db.collection('spaced')
    const Areas = db.collection('areas')
    const insightLinks = db.collection('notelinks')

    try {
        const result = await Insights.insertOne(newinsight)

        let insight = new Object()
        insight.noteid = result.insertedId.toString()
        insight.profileid = newinsight.profileid
        insight.fib0 = 0
        insight.fib1 = 1
        let nextdate = new Date() //set nextdate for tomorrow.
        if (newinsight.prompt) nextdate.setDate(nextdate.getDate() + 1)
        insight.datenext = nextdate
        Spaced.insert(insight)

        if (newinsight.arealinks)
            newinsight.arealinks.map(async link => {
                let areaid = link.area._id
                if (!areaid) {
                    let area = {
                        name: link.name,
                        wheelid: getprofileid(req.session),
                        serverversion: pjson.version,
                        uiversion: getuiversion(req.session),
                        created: new Date(),
                    }

                    const res = await Areas.insert(area)
                    areaid = res.insertedIds[0].toString()
                }

                let insightlink = new Object()
                insightlink.noteid = result.insertedId.toString()
                insightlink.profileid = newinsight.profileid
                insightlink.area = areaid
                insightlink.notes = link.insights
                insightlink.datecreated = new Date()
                insightLinks.insert(insightlink)
            })
    } catch (error) {
        console.log(error)
    }
}
