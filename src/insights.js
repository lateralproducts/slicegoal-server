import { ObjectId } from 'mongodb'

let pjson = require('../package.json')
import { getuiversion } from '../util/index'
import { getprofileid, getuserid, getwheelid } from './users'
import { shareInsightEmail } from './emails'
import DbConnection from './database'
import { createUserConnection } from './community'
import { attachSources } from './sources'

export const typeDefs = `

  extend type Query {
    insights(areas: [AreaId]): [InsightTag]
    insightTags(insightid: String): [InsightTag]
    searchinsights(search: String!): [Insight]
    spaced(areas: [AreaId]): FilteredSpaced
    newsharedinsights: Int
    getSharedInsights: SharedInsightList
  }

  extend type Mutation {
    createInsight(datetime: String, profileid: String, prompt: String, answer: String, areatags: [AreaTagIn], sources: [SourceTagIn]): Spaced
    updateInsight(insightid: String!, datetime: String, prompt: String, answer: String, sources: [SourceTagIn]): Spaced 
    createInsightTag(insightid: String!, profileid: String, area: String, areaname: String): Tag
    updateInsightTag(tagid: String!, notes: String): Boolean
    removeInsightTag(tagid: String): Boolean
    markSpaced(insightid: String, datetime: String, check: String, marked: String): Boolean
    removeInsight(insightid: String!): Boolean
    shareInsight(insightid: String!, targetUser: String!, shareNote: String): ShareResponse
    popSharedInsight(insightid: String!): Boolean
    pinInsight(insightid: String!, areaid: String!, setpinned: Boolean): Boolean
  }
`

export const schema = `

    type Insight {
        _id: String
        area: String
        prompt: String
        answer: String
        spaced: Spaced
        insighttag: String
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
    type InsightTag {
        _id: String
        insightid: String
        areaid: String
        area: Area
        insight: Insight
        notes: String
        pinned: Boolean 
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
    type FilteredSpaced {
        count: Int 
        insights: [Insight]
    }
`

export const resolvers = {
    Query: {
        insights: async(_, { areas }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')

            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')

            let insighttags = await InsightTags.find(
                {
                    area: {$in: [...areas.map(area => {return area._id})]},
                    profileid: getprofileid(req.session)
                },
                { sort: { datecreated: -1 } }, //return reverse chron. Last insight created at top of list.
            )
            .toArray()
            
            // Get array of all UNIQUE insight ids for found tags
            let insightids = [...new Set(insighttags.map(tag => {
                return tag.insightid
            }))]

            // Make sure insights are tagged to EVERY area
            const filteredinsights = insightids.filter(insightid => {
                return areas.every(area => {
                    return insighttags.some(tag => 
                        tag.insightid === insightid && tag.area === area._id
                    )
                })
            })

            // Return results appropriately with index for rendering in React
            const insights = await InsightTags.find(
                {
                    insightid: {$in: filteredinsights},
                    profileid: getprofileid(req.session),
                    area: areas[0]._id
                },
                { sort: { pinned: -1, datecreated: -1 } }, //return reverse chron. Last insight created at top of list.
            )
            .toArray()
            return insights
        },
        spaced: async(_, { areas }, {req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Spaced = db.collection('spaced')
            const Insights = db.collection('insights')
            const InsightTags = db.collection('insighttags')

            // ids of insights that have prompt set
            const insightidsprompt = (await Insights.find({
                $and: [
                    { prompt: {$ne: null} },
                    { prompt: {$ne: ''} }
                ],
                profileid: getprofileid(req.session)
            },
                { sort: { nextdate: -1 } }, //return reverse chron. Last note created at top of list.
            )
            .toArray())
            .map(insight => insight._id.toString())

            // ids of insights that have prompt set and prompt is due
            const insightidspromptdue = (await Spaced.find(
                {
                    insightid: {$in: insightidsprompt},
                    $or: [
                        { datenext: null },
                        { datenext: { $lte: new Date() } }
                    ]
                }
            )
            .toArray())
            .map(insight => {
                return ObjectId(insight.insightid)
            })

            // insight objects to return/filter
            let insights = await Insights.find({ _id: {$in: insightidspromptdue} }).toArray()

            // All insights on profile if filter areas not given
            if(areas.length > 0) {
                const insighttags = await InsightTags.find({
                                        $and: [ {insightid: {$in: insightidspromptdue.map(id => {return id.toString()}) }},
                                                {area: {$in: areas.map(area => {return area._id}) }}
                                            ]}
                                        ).toArray()

                insights = insights.filter(insight => { 
                    return insighttags.some(tag => { 
                        return tag.insightid === insight._id.toString()
                        })
                    })
            }

            return {
                count: insights.length,
                insights: insights
            }
        },
        searchinsights: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')

            let query = new Object()
            query = {
                $or: [
                    { answer: new RegExp(args.search, 'i') },
                    { prompt: new RegExp(args.search, 'i') }
                ],
                profileid: getprofileid(req.session)
            }

            const insights = await Insights.find(
                query,
                { sort: { datecreated: -1 } }, //return reverse chron. Last note created at top of list.
            ).toArray()

            return insights
        },
        newsharedinsights: async(_, __, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')

            const found = await Insights.find({
                email: req.session.user.email,
                status: 'newshared'
            }).toArray()

            if (found) return found.length
            else return 0
        },
        getSharedInsights: async(_, __, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')
            const user = await Users.findOne({
                _id: ObjectId(getuserid(req.session))
            })

            const totalSharedInsights = await Insights.find({
                email: user.email,
                status: 'newshared'
            }).toArray()

            const distinctSharers = await Insights.distinct('sharedfrom', {
                email: user.email,
                status: 'newshared'
            })
            return {
                numberOfInsights: totalSharedInsights.length,
                distinctSharers: distinctSharers
            }
        },
        insightTags: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')
            const insighttags = await InsightTags.find({
                insightid: args.insightid,
                profileid: getprofileid(req.session)
            }).toArray()
            return insighttags
        }
    },
    Insight: {
        spaced: async(parent, __, { req }) => {
            const db = await DbConnection.Get()
            const Spaced = db.collection('spaced')
            let spaced = await Spaced.findOne({
                insightid: parent._id.toString(),
                userid: getprofileid(req.session)
            })
            return spaced
        }
    },
    InsightTag: {
        area: async parent => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return await Areas.findOne({ _id: ObjectId(parent.area) })
        },
        insight: async parent => {
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            return await Insights.findOne({ _id: ObjectId(parent.insightid) })
        }
    },
    SharedInsightList: {
        insightsGroupBySharer: async parent => {
            return parent.distinctSharers
        }
    },
    SharedInsight: {
        name: async userid => {
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            const user = await Users.findOne({
                _id: ObjectId(userid)
            })

            if(!user) return 'someone' //if a user is deleted, this function will fail here.

            return user.lastname
                ? user.firstname + ' ' + user.lastname
                : user.firstname
        },
        insights: async(userid, __, { req }) => {
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')

            const user = await Users.findOne({
                _id: ObjectId(getuserid(req.session))
            })

            return await Insights.find({
                status: 'newshared',
                sharedfrom: userid,
                email: user.email
            }).toArray()
        }
    },
    Mutation: {
        markSpaced: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Spaced = db.collection('spaced')
            const InsightTags = db.collection('insighttags')
            const insightid = args.insightid
            delete args.insightid //remove from inserted record

            const spaced = await Spaced.findOne({
                insightid: insightid,
                profileid: getprofileid(req.session)
            })
            let nextdate
            nextdate = new Date() //set nextdate for today + fibonacci sequence

            let newspaced = new Object()
            newspaced.insightid = insightid
            newspaced.profileid = getprofileid(req.session)
            newspaced.lastmarked = new Date()

            switch(args.marked){
                case 'remembered':
                    if (spaced) { //check if there is a spaced record, if not, create one.
                        nextdate.setDate(nextdate.getDate() + spaced.fib1)
                        args.datenext = nextdate
                        args.lastmarked = new Date()
                        args.fib1 = spaced.fib0 + spaced.fib1
                        args.fib0 = spaced.fib1
                        Spaced.update(
                            { insightid: insightid, profileid: getprofileid(req.session) },
                            {
                                $set: args,
                                $push: {
                                    checks: {
                                        time: new Date(),
                                        result: args.marked,
                                        check: args.check
                                    }
                                }
                            },
                        )
                    } else {
                        nextdate.setDate(nextdate.getDate() + 1)
                        newspaced.fib0 = 1
                        newspaced.fib1 = 1
                        newspaced.datenext = nextdate
                        newspaced.datecreated = new Date()
                        Spaced.insert(newspaced)
                    }
                    InsightTags.update(
                        { insightid: insightid, profileid: getprofileid(req.session) },
                        {
                            $set: { nextdate: nextdate }
                        },
                        { multi: true },
                    )
                    return true
                case 'forgot':
                default:
                    args.lastdate = new Date()
                    args.fib0 = 0
                    args.fib1 = 1
                    nextdate.setDate(nextdate.getDate() + 1)

                    if (spaced) { //check if there is a spaced record, if not, create one.
                        args.lastmarked = new Date()
                        args.datenext = nextdate
                        args.fib0 = 0
                        args.fib1 = 1
                        args.markedno = spaced.markedno ? spaced.markedno + 1 : 1
                        await Spaced.update(
                            { insightid: insightid, profileid: getprofileid(req.session) },
                            {
                                $set: args,
                                $push: {
                                    checks: {
                                        time: new Date(),
                                        result: args.marked,
                                        check: args.check
                                    }
                                }
                            },
                        )
                    } else {
                        //this is functionality for spaced repetition. Only activated if the insight has a prompt.
                        newspaced.fib0 = 0
                        newspaced.fib1 = 1
                        newspaced.markedno = 1
                        newspaced.datenext = nextdate
                        newspaced.datecreated = new Date()
                        Spaced.insert(newspaced)
                    }

                    await InsightTags.update(
                        { insightid: insightid, profileid: getprofileid(req.session) },
                        {
                            $set: { nextdate: nextdate }
                        },
                        { multi: true },
                    )

                    return true
            }
        },
        updateInsight: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Spaced = db.collection('spaced')
            args.lastedited = new Date(args.datetime)
            let insightid = args.insightid
            delete args.insightid
            Insights.updateOne(
                { _id: ObjectId(insightid) },
                { $set: args },
            )

            if(args.sources) {
                attachSources(
                    args.sources, 
                    'insight', 
                    insightid,
                    getprofileid(req.session)
                )
            }

            if (args.prompt){              
                const spaced = await Spaced.findOne({
                    insightid: insightid,
                    profileid: getprofileid(req.session)
                })
                if (spaced) {
                    let fib = new Object()
                    fib.fib0 = 0
                    fib.fib1 = 1
                    Spaced.update(
                        { insightid: insightid, userid: getprofileid(req.session) },
                        {
                            $set: fib
                        },
                    )
                } else {
                    //this is functionality for spaced repetition. Only activated if the insight has a prompt.
                    let newspaced = new Object()
                    newspaced.insightid = insightid
                    newspaced.profileid = getprofileid(req.session)
                    newspaced.fib0 = 0
                    newspaced.fib1 = 1
                    let nextdate = new Date() //set nextdate for tomorrow.
                    nextdate.setDate(nextdate.getDate() + 1)
                    newspaced.datenext = nextdate
                    Spaced.insert(newspaced)
                }
            }
            return {
                _id: insightid,
                message: 'insight updated'
            }
        },
        createInsightTag: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')
            const Areas = db.collection('areas')
            if (!args.profileid) args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.datecreated = new Date()

            let areaid
            if (!args.area) {
                let newarea = new Object() //create new area.
                newarea.wheelid = getwheelid(req.session)
                newarea.name = args.areaname
                const inserted = await Areas.insertOne(newarea) //only creating new area if "areaname is added"
                areaid = inserted.insertedId.toString()
            } else {
                areaid = args.area

                Areas.updateOne(
                    {
                        wheelid: getwheelid(req.session),
                        _id: ObjectId(areaid)
                    },
                    { $inc: { tagged: 1 }, $set: { lasttagged: new Date() } },
                )
            }

            const link = await InsightTags.insertOne({
                //insert the link to connect insight and new area.
                insightid: args.insightid,
                profileid: args.profileid,
                area: areaid,
                datecreated: new Date()
            })

            return {
                tagid: link.insertedId,
                tagname: args.areaname
            }
        },
        updateInsightTag: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')
            args.profileid = getprofileid(req.session)
            InsightTags.updateOne(
                { _id: ObjectId(args.tagid) },
                { $set: { notes: args.notes } },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        removeInsightTag: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')
            args.profileid = getprofileid(req.session)
            InsightTags.deleteOne(
                {
                    _id: ObjectId(args.tagid),
                    profileid: args.profileid
                },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        /* createNewInsightTag: async (root, args, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const InsightTags = db.collection('insighttags')
            let newarea = new Object() //create new area.
            newarea.wheelid = getprofileid(req.session)
            newarea.name = args.areaname
            const res = await Areas.insert(newarea)

            await InsightTags.insertOne({
                //insert the link to connect insight and new area.
                insightid: args.insightid,
                profileid: getprofileid(req.session),
                area: res.insertedIds[0].toString(),
                datecreated: new Date(args.datetime),
            })
            return res.insertedIds[1] ? true : false
        }, */
        createInsight: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.datecreated = new Date(args.datetime)
            args.lastedited = new Date(args.datetime)

            createinsight(args, req)
                .then(insertedId => {
                    if (args.sources) {
                        attachSources(
                            args.sources, 
                            'insight', 
                            insertedId, 
                            getprofileid(req.session)
                        )
                        .then(() => {
                            return insertedId
                        })
                    }
                })
        },
        removeInsight: async(_, { insightid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')
            const Insights = db.collection('insights')
            const Profiles = db.collection('profiles')

            //Check ownership
            Insights.findOne({ _id: ObjectId(insightid) }).then(insight => {
                if (insight) Profiles.findOne({ _id: ObjectId(insight.profileid) }).then(
                    profile => {
                        if (profile.user !== getuserid(req.session)) {
                            throw new Error('Unauthorised Insight Delete')
                        } else {
                            InsightTags.deleteMany(
                                { insightid: insightid },
                                function(err) {
                                    if (err) throw err
                                },
                            )
                            Insights.deleteOne(
                                { _id: ObjectId(insightid) },
                                function(err) {
                                    if (err) throw err
                                },
                            )
                            return true
                        }
                    },
                )
            })
        },
        shareInsight: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')

            const currentUser = await Users.findOne({
                _id: ObjectId(getuserid(req.session))
            })

            await createUserConnection( //and creates user targetUser profile if new
                currentUser, 
                args.targetUser, 
                'insight share',
                args.insightid
            )

            const targetUser = await Users.findOne({
                email: args.targetUser
            })

            if (args.targetUser === currentUser.email)
                return {
                    success: false,
                    message: 'Cannot share with yourself - try duplicating'
                }
            else {

                return await Insights.findOne({
                    _id: ObjectId(args.insightid)
                })
                .then(insight => {
                    return Insights.insertOne({
                        sharedfrom: getuserid(req.session),
                        status: 'newshared',
                        datetimeshared: new Date(),
                        email: args.targetUser,
                        datecreated: insight.datecreated,
                        answer: insight.answer
                    })
                    .then(result => {
                        Insights.findOne({_id: ObjectId(result.insertedId)})
                        .then(result => { 
                            if(targetUser.state === 'verified'){
                                // Existing verified user
                                shareInsightEmail(
                                    result,
                                    currentUser,
                                    args.targetUser,
                                    args.shareNote,
                                    `${process.env.PATH_URL}?sharedinsights=active`
                                )
                            } else {
                                // Existing but unverified user
                                shareInsightEmail(
                                    result,
                                    currentUser,
                                    args.targetUser,
                                    args.shareNote,
                                    `${process.env.PATH_URL}?page=verify&user=${targetUser._id}&code=${targetUser.code}&sharedinsights=active`
                                )
                            }
                        })

                        return {
                            success: true,
                            message: 'Insight shared'
                        }
                    })
                    .catch(err => {
                        return {
                            success: false,
                            message: err.message
                        }
                    })
                })
            }
        },
        popSharedInsight: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')

            const user = await Users.findOne({
                _id: ObjectId(getuserid(req.session))
            })

            const insight = await Insights.findOne({
                _id: ObjectId(args.insightid)
            })

            if(!insight || !user) throw new Error("can\'t remove from the list")

            if (insight.email !== user.email)
                throw new Error('can\'t remove from the list')
            else {
                const result = await Insights.deleteOne({
                    _id: ObjectId(args.insightid)
                })
                if (result.result.ok === 1) return true
                else return false
            }
        },
        pinInsight: async(_, args) => {
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')

            return await InsightTags.updateOne(
                {
                    area: args.areaid,
                    insightid: args.insightid
                },
                {$set: {pinned: args.setpinned}}
            )
            .then(res => {
                if(res.result.n) return true
            })
        }
    }
}

async function createinsight(newinsight, req) {
    //passing wheelid and profileid on newinsight object.
    const db = await DbConnection.Get()
    const Insights = db.collection('insights')
    const Spaced = db.collection('spaced')
    const Areas = db.collection('areas')
    const insightTags = db.collection('insighttags')

    const Profiles = db.collection('profiles')

    if (newinsight.profileid) {
        //get wheelid from profile.
        const profile = await Profiles.findOne({
            _id: ObjectId(newinsight.profileid)
        })
        if (profile) newinsight.wheelid = profile.wheel
    } else newinsight.profileid = getprofileid(req.session)

    try {
        //first insert the insight into DB
        const result = await Insights.insertOne(newinsight)

        if (newinsight.prompt) {
            //this is functionality for spaced repetition. Only activated if the insight has a prompt.
            let spaced = new Object()
            spaced.insightid = result.insertedId.toString()
            spaced.profileid = newinsight.profileid
            spaced.fib0 = 0
            spaced.fib1 = 1
            let nextdate = new Date() //set nextdate for tomorrow.
            nextdate.setDate(nextdate.getDate() + 1)
            spaced.datenext = nextdate
            Spaced.insert(spaced)
        }

        if (newinsight.areatags)
            //if there are area tags, save the area tags
            newinsight.areatags.map(async link => {
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
                        created: new Date()
                    }

                    const res = await Areas.insert(area)
                    areaid = res.insertedIds[0].toString()
                }

                let insighttag = new Object()
                insighttag.insightid = result.insertedId.toString()
                insighttag.profileid = newinsight.profileid
                insighttag.area = areaid
                insighttag.notes = link.notes
                insighttag.datecreated = new Date()
                insightTags.insert(insighttag)

                Areas.updateOne(
                    {
                        wheelid: newinsight.wheelid
                            ? newinsight.wheelid
                            : getwheelid(req.session),
                        _id: ObjectId(areaid)
                    },
                    { $inc: { tagged: 1 }, $set: { lasttagged: new Date() } },
                )
            })
        return result.insertedId.toString()
    } catch (error) {
        console.log(error)
    }
}
