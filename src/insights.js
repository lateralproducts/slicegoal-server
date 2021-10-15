import { ObjectId } from 'mongodb'

let pjson = require('../package.json')
import { getuiversion } from '../util/index'
import { getprofileid, getuserid, getwheelid } from './users'
import { shareInsightEmail } from './emails'
import DbConnection from './database'

export const typeDefs = `

  extend type Query {
    insights(area: String): [InsightLink]
    insightLinks(insightid: String): [InsightLink]
    searchinsights(search: String!): [Insight]
    spaced: [InsightLink]
    newsharedinsights: Int
    getSharedInsights: SharedInsightList
  }

  extend type Mutation {
    createInsight(datetime: String, profileid: String, prompt: String, answer: String, areatags: [AreaTagIn]): Spaced
    updateInsight(insightid: String, datetime: String, prompt: String, answer: String): Spaced 
    createInsightLink(insightid: String!, profileid: String, area: String, areaname: String): Tag
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
        insights: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const insightlinks = await InsightLinks.find(
                {
                    area: args.area,
                    profileid: getprofileid(req.session),
                    $or: [ //for spaced repetition.
                        { nextdate: null },
                        { nextdate: { $lte: new Date() } }
                    ]
                },
                { sort: { datecreated: -1 } }, //return reverse chron. Last insight created at top of list.
            ).toArray()

            return insightlinks
        },
        spaced: async(_,__,{req}) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const Insights = db.collection('insights')

            const insights = await Insights.find({
                $and: [
                    { prompt: {$ne: null} },
                    { prompt: {$ne: ""} }
                ],
                profileid: getprofileid(req.session)
            },
                { sort: { nextdate: -1 } }, //return reverse chron. Last note created at top of list.
            ).toArray()

            const insightlinks = await new Promise(function(resolve) {
                InsightLinks.aggregate(
                    {
                        $match: {
                            insightid: {$in: insights.map(insight => insight._id.toString())},
                            $or: [
                                { nextdate: null },
                                { nextdate: { $lte: new Date() } }
                            ],
                            profileid: getprofileid(req.session)
                        }
                    },
                    {
                        $group: {
                            _id: '$insightid',
                            doc: { $first: '$$ROOT' }
                        }
                    },
                    {
                        $replaceRoot: {
                            newRoot: '$doc'
                        }
                    },

                    function(err, data) {
                        if (err) throw err
                        resolve(data ? data : [])
                    },
                )
            })
            return insightlinks
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
        insightLinks: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const insightlinks = await InsightLinks.find({
                insightid: args.insightid,
                profileid: getprofileid(req.session)
            }).toArray()
            return insightlinks
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
    InsightLink: {
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
        markSpacedYes: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Spaced = db.collection('spaced')
            const InsightLinks = db.collection('insightlinks')
            args.lastdate = new Date(args.datetime) //record when insight was last marked
            const insightid = args.insightid
            delete args.insightid
            const spaced = await Spaced.findOne({
                insightid: insightid,
                profileid: getprofileid(req.session)
            })
            if (spaced) {
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
                { insightid: insightid, profileid: getprofileid(req.session) },
                {
                    $set: { nextdate: nextdate }
                },
                { multi: true },
            )

            Spaced.update(
                { insightid: insightid, profileid: getprofileid(req.session) },
                {
                    $set: args
                },
            )
            return true
        },
        markSpacedNo: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const Spaced = db.collection('spaced')
            args.lastdate = new Date(args.datetime) //record when insight was last marked
            args.fib0 = 0
            args.fib1 = 1
            const insightid = args.insightid
            delete args.insightid
            let nextdate = new Date()
            nextdate.setDate(nextdate.getDate() + 1)
            args.datenext = nextdate

            const spaced = await Spaced.findOne({
                insightid: insightid,
                profileid: getprofileid(req.session)
            })

            await InsightLinks.update(
                { insightid: insightid, profileid: getprofileid(req.session) },
                {
                    $set: { nextdate: nextdate }
                },
                { multi: true },
            )

            args.markedno = spaced.markedno ? spaced.markedno + 1 : 1

            await Spaced.update(
                { insightid: insightid, profileid: getprofileid(req.session) },
                {
                    $set: args
                },
            )
            return true
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
        createInsightLink: async(_, args, { req }) => {
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

            const link = await InsightLinks.insertOne({
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
        updateInsightLink: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            args.profileid = getprofileid(req.session)
            InsightLinks.updateOne(
                { _id: ObjectId(args.linkid) },
                { $set: { notes: args.notes } },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        removeInsightLink: async(root, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            args.profileid = getprofileid(req.session)
            InsightLinks.deleteOne(
                {
                    _id: ObjectId(args.linkid),
                    profileid: args.profileid
                },
                function(err) {
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
        createInsight: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.datecreated = new Date(args.datetime)
            args.lastedited = new Date(args.datetime)
            const insertedId = await createinsight(args, req)

            return {
                _id: insertedId,
                message: 'new insight created'
            }
        },
        removeInsight: async(_, { insightid }, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const InsightLinks = db.collection('insightlinks')
            const Insights = db.collection('insights')
            const Profiles = db.collection('profiles')

            //Check ownership
            Insights.findOne({ _id: ObjectId(insightid) }).then(insight => {
                Profiles.findOne({ _id: ObjectId(insight.profileid) }).then(
                    profile => {
                        if (profile.user !== getuserid(req.session)) {
                            throw new Error('Unauthorised Insight Delete')
                        } else {
                            InsightLinks.deleteMany(
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
                            
                            if(targetUser){
                                if(targetUser.state === 'verified'){
                                    // Existing verified user
                                    shareInsightEmail(
                                        result,
                                        currentUser,
                                        args.targetUser,
                                        `${process.env.PATH_URL}?sharedinsights=active`,
                                        false // new user?
                                    )
                                } else {
                                    // Existing but unverified user
                                    shareInsightEmail(
                                        result,
                                        currentUser,
                                        args.targetUser,
                                        `${process.env.PATH_URL}?page=verify&user=${targetUser._id}&code=${targetUser.code}&sharedinsights=active`,
                                        false // new user?
                                    )
                                }
                            } else {
                                // Completely new user
                                shareInsightEmail(
                                    result,
                                    currentUser,
                                    args.targetUser,
                                    `${process.env.PATH_URL}?page=signup&sharedinsights=active`,
                                    true // new user?
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

            if (insight.email !== user.email)
                throw new Error('Unauthorised Operation')
            else {
                const result = await Insights.deleteOne({
                    _id: ObjectId(args.insightid)
                })
                if (result.result.ok === 1) return true
                else return false
            }
        }
    }
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
