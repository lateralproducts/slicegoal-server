import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';

let pjson = require('../package.json')
import { getuiversion } from '../util/functions'
import { getprofileid, getuserid, getwheelid } from './users'
import DbConnection from './database'
import { createUserConnection } from './community'
import { attachSources } from './sources'
import { newIx } from './interactions'
import { shareInsightEmail } from './emails'
import { linkInsightTask } from './tasks'
import { getPreviews, getfileid } from './fileserver';

export const typeDefs = `

  extend type Query {
    insights(areas: [AreaId]): [InsightTag]
    insightList(page: Int): [Insight]
    insightAreaTags(insightid: String): [InsightTag]
    insightPersonTags(insightid: String): [InsightTag]
    searchinsights(areas: [AreaId], search: String): [Insight]
    spaced(areas: [AreaId]): FilteredSpaced
    newsharedinsights: Int
    getSharedInsights: SharedInsightList
  }

  extend type Mutation {
    createInsight(datetime: String, profileid: String, prompt: String, fileids: [String], answer: String, areatags: [AreaTagIn], sources: [SourceTagIn], people: [PersonInput], taskid: String): Spaced
    updateInsight(insightid: String!, datetime: String, prompt: String, answer: String, fileids: [String], sources: [SourceTagIn]): Spaced 
    removeInsight(insightid: String!): Boolean

    pinInsight(insightid: String!, areaid: String, sourceid: String, setpinned: Boolean, resourcetype: String): Boolean
    shareInsight(insightid: String!, targetUser: String!, shareNote: String): ShareResponse
    popSharedInsight(insightid: String!): Boolean

    createInsightTag(insightid: String!, profileid: String, area: String, areaname: String): Tag
    updateInsightTag(tagid: String!, notes: String): Boolean
    removeInsightTag(tagid: String): Boolean
    
    markSpaced(insightid: String, datetime: String, check: String, marked: String): Boolean
    
    createInsightPersonTag(insightid: String!, person: PersonInput): Tag
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
        file: String
        filedetails: [FilePreview]
        files: [FilePreview]
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
        goalid: String
        area: Area
        insight: Insight
        source: Source
        person: Person
        notes: String
        pinned: Boolean
        spaced: Spaced
        goal: Goal
    }
    type Spaced {
        _id: String
        insightid: String
        insight: Insight
        area: String
        datetimecreated: String
        lastmarked: String
        fib0: String
        fib1: String
        datenext: String
        checks: [SpacedMark]
    }
    type SpacedMark {
        time: String
        result: String
        check: String
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
                return new ObjectId(insight.insightid)
            })

            // insight objects to return/filter
            let insights = await Insights.find({ _id: {$in: insightidspromptdue} }).toArray()

            if(areas.length > 0) {
                const insighttags = await InsightTags.find({
                    profileid: getprofileid(req.session),
                }).toArray()

                insights = insights.filter(insight => 
                    areas.every(area => 
                        insighttags.some(tag => 
                            tag.area === area._id && tag.insightid === insight._id.toString()
                        )
                    )
                )
            }

            return {
                count: insights.length,
                insights: insights
            }
        },
        searchinsights: async(_, {areas, search}, { req }) => {
            if(search === undefined && areas.length === 0) return []
            else {
                const db = await DbConnection.Get()
                const Insights = db.collection('insights')
                const InsightTags = db.collection('insighttags')

                let insightquery = new Object()
                
                if (areas && areas.length > 0){
                    let querytags = new Object()
                    querytags.area = {$in: [...areas.map(area => {return area._id})]}
                    querytags.profileid = getprofileid(req.session)

                    let insighttags = await InsightTags.find(
                        querytags,
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

                    const insightobjids = filteredinsights.map(insightid => {return new ObjectId(insightid)})
                    insightquery._id = {$in: insightobjids}
                }
                if (search !== '' && search !== null){
                    insightquery.$or = [
                        { answer: new RegExp(search, 'i') },
                        { prompt: new RegExp(search, 'i') }
                    ]
                }
                insightquery.profileid = getprofileid(req.session)

                const insights = await Insights.find(
                    insightquery,
                    { sort: { datecreated: -1 } }, //return reverse chron. Last note created at top of list.
                ).limit(10).toArray()

                return insights
            }
        },
        insightList: async(_, {page}, { req }) => {
            
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')

            var skip = 0
            if(page) skip = page*10
            try {
                const insights = await Insights.find({profileid: getprofileid(req.session)}).sort({datecreated: -1 }).skip(skip).limit(10).toArray() //.skip(page*10).limit(10)
                return insights
            } catch (error) {
                return []
            }
        },
        newsharedinsights: async(_, __, { req }) => {
            
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
            
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')
            const user = await Users.findOne({
                _id: new ObjectId(getuserid(req.session))
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
        insightAreaTags: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')
            const insighttags = await InsightTags.find({
                area: {$ne: null},
                insightid: args.insightid,
                profileid: getprofileid(req.session)
            }).toArray()
            return insighttags
        },
        insightPersonTags: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')
            const insighttags = await InsightTags.find({
                personid: {$ne: null},
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
                profileid: getprofileid(req.session)
            })
            return spaced
        },
        file: async(parent, __, { req }) => {
            return parent.file ? await getfileid(req, parent.file) : null
        },
        filedetails: async(insight, __, { req }) => {
            if (insight.fileids) return  await getPreviews(req, insight.fileids) || null
            else if (insight.file) return [await getfileid(req, insight.file)] || null
        }
    },
    InsightTag: {
        area: async parent => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return await Areas.findOne({ _id: new ObjectId(parent.area) })
        },
        person: async parent => {
            const db = await DbConnection.Get()
            const People = db.collection('people')
            return await People.findOne({ _id: new ObjectId(parent.personid) })
        },
        insight: async parent => {
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            return await Insights.findOne({ _id: new ObjectId(parent.insightid) })
        },
        source: async function(parent) {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')

            return await Sources.findOne(
                {_id: new ObjectId(parent.sourceid)}
            )
        },
        spaced: async parent => {
            const db = await DbConnection.Get()
            const Spaced = db.collection('spaced')
            let spaced = await Spaced.findOne({
                insightid: parent.insightid,
                profileid: getprofileid(req.session)
            })
            return spaced
        },
        goal: async({ goalid }) => {
            const db = await DbConnection.Get()
            const Goals = db.collection('goals')
            return await Goals.findOne({ _id: new ObjectId(goalid) })
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
                _id: new ObjectId(userid)
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
                _id: new ObjectId(getuserid(req.session))
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
                        nextdate.setDate(nextdate.getDate() + spaced.fib1) //setting the date of fib1 of last saved record fib1
                        args.datenext = nextdate
                        args.lastmarked = new Date()
                        args.fib1 = spaced.fib0 + spaced.fib1
                        args.fib0 = spaced.fib1
                        Spaced.updateMany(
                            { insightid: insightid, profileid: getprofileid(req.session) },
                            {
                                $set: args,
                                $push: {
                                    checks: {
                                        time: new Date(),
                                        result: args.marked,
                                        check: args.check,
                                        lastdate: spaced.datenext
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
                        Spaced.insertOne(newspaced)
                    }
                    InsightTags.updateMany(
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
                        await Spaced.updateMany(
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
                        Spaced.insertOne(newspaced)
                    }

                    await InsightTags.updateMany(
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
            
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Spaced = db.collection('spaced')
            args.lastedited = new Date(args.datetime) //time set from client argument
            let insightid = args.insightid
            delete args.insightid
            Insights.updateOne(
                { _id: new ObjectId(insightid) },
                { $set: args },
            )

            if(args.sources) {
                attachSources({
                    sources: args.sources, 
                    insightid,
                    profileid: getprofileid(req.session)
                })
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
                    Spaced.updateMany(
                        { insightid: insightid, profileid: getprofileid(req.session) },
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
                    Spaced.insertOne(newspaced)
                }
            }
            return {
                _id: insightid,
                message: 'insight updated'
            }
        },
        createInsightTag: async(_, args, { req }) => {
            
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
                        _id: new ObjectId(areaid)
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
            
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')
            args.profileid = getprofileid(req.session)
            InsightTags.updateOne(
                { _id: new ObjectId(args.tagid) },
                { $set: { notes: args.notes } },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        removeInsightTag: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const InsightTags = db.collection('insighttags')
            args.profileid = getprofileid(req.session)
            InsightTags.deleteOne(
                {
                    _id: new ObjectId(args.tagid),
                    profileid: args.profileid
                },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        createInsightPersonTag: async(_, {insightid, person}, { req }) => {
            await createInsightPersonTag(insightid, person, req)
            return true
        },
        /* createNewInsightTag: async (root, args, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const InsightTags = db.collection('insighttags')
            let newarea = new Object() //create new area.
            newarea.wheelid = getprofileid(req.session)
            newarea.name = args.areaname
            const res = await Areas.insertOne(newarea)

            await InsightTags.insertOne({
                //insert the link to connect insight and new area.
                insightid: args.insightid,
                profileid: getprofileid(req.session),
                area: res.insertedIds[0].toString(),
                datecreated: new Date(args.datetime), //time set from client argument
            })
            return res.insertedIds[1] ? true : false
        }, */
        createInsight: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.datecreated = args.datetime ? new Date(args.datetime) : new Date() //time set from client argument
            args.lastedited = args.datetime ? new Date(args.datetime) : new Date() //time set from client argument

            return await createinsight(args, req)
                .then(insertedId => {
                    if (args.taskid) {
                        Tags.insertOne({insightid: insertedId, taskid: args.taskid, profileid: args.profileid, datecreated: new Date()})
                    }

                    if (args.sources) {
                        attachSources({
                            sources: args.sources, 
                            insightid: insertedId, 
                            profileid: getprofileid(req.session)
                        })
                        .then(() => {
                            return {_id: insertedId}
                        })
                    }
                    if (args.taskid) {
                        linkInsightTask(args.taskid,insertedId, req)
                    }
                    return {_id: insertedId}
                })
        },
        removeInsight: async(_, { insightid }, { req }) => {
            
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')
            const Insights = db.collection('insights')
            const Profiles = db.collection('profiles')

            //Check ownership
            const insight = await Insights.findOne({ _id: new ObjectId(insightid) })
            if (insight) {
                const profile = await Profiles.findOne({ _id: new ObjectId(insight.profileid) })
                if (profile.user !== getuserid(req.session)) {
                    return triggererror('Unauthorised Insight Delete')
                } else {
                    await Tags.deleteMany(
                        { insightid: insightid },
                        function(err) {
                            if (err) throw err
                        },
                    )
                    await Insights.deleteOne(
                        { _id: new ObjectId(insightid) },
                        function(err) {
                            if (err) throw err
                        },
                    )
                    return true
                }
            } else {
                return triggererror("Insight not found")
            }
        },
        shareInsight: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')

            const currentUser = await Users.findOne({
                _id: new ObjectId(getuserid(req.session))
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
                //let to = args.targetUser
                let interactionid = (await newIx(currentUser._id.toString(),targetUser._id.toString(),'share insight email', args.insightid, args.shareNote)).insertedId.toString()
                return await Insights.findOne({
                    _id: new ObjectId(args.insightid)
                })
                .then(insight => {
                    //save shared insight to be accessed.
                    return Insights.insertOne({
                        sharedfrom: getuserid(req.session),
                        status: 'newshared',
                        datetimeshared: new Date(),
                        email: args.targetUser,
                        datecreated: insight.datecreated,
                        answer: insight.answer
                    })
                    .then(result => {
                        Insights.findOne({_id: new ObjectId(result.insertedId)})
                        .then(result => { 
                            //save interaction to track
                            try {
                                var ctalink;
                                if(targetUser.state === 'verified'){
                                    // Existing verified user
                                    ctalink = `?sharedinsights=active`
                                } else {
                                    // Existing but unverified user
                                    ctalink = `?page=verify&user=${targetUser._id}&code=${targetUser.code}&sharedinsights=active`
                                }
                                shareInsightEmail(
                                    insight,
                                    currentUser,
                                    targetUser,
                                    args.shareNote,
                                    ctalink,
                                    interactionid
                                )
                            }catch (error) {
                                console.log("failed to send shared insights email - " + error)
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
            
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const Users = db.collection('users')

            const user = await Users.findOne({
                _id: new ObjectId(getuserid(req.session))
            })

            const insight = await Insights.findOne({
                _id: new ObjectId(args.insightid)
            })

            if(!insight || !user) return triggererror("can\'t remove from the list")

            if (insight.email !== user.email)
                return triggererror('can\'t remove from the list')
            else {
                const result = await Insights.deleteOne({
                    _id: new ObjectId(args.insightid)
                })
                return true
            }
        },
        pinInsight: async(_, args) => {
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')

            let pintag = new Object()
            pintag.insightid = args.insightid
            if (args.sourceid) pintag.sourceid = args.sourceid //if pinned for source.
            if (args.areaid) pintag.area = args.areaid //if pinned for area.

            const resultsourcetags = await Tags.updateOne(
                pintag,
                {$set: {pinned: args.setpinned}}
            )
            return (resultsourcetags !== null)
        }
    }
}

async function createInsightPersonTag(insightid, person, req) {
    const db = await DbConnection.Get()
    const InsightTags = db.collection('insighttags')
    const People = db.collection('people')

    let personid = person._id
    let newperson = new Object()
    if (personid) newperson._id = ObjectId(personid) //search for ID only.
    else {
        newperson = {
            name: person.name,
            profileid: getprofileid(req.session)
        }
    }

    const returnperson = await People.findOneAndUpdate(
        newperson,
        { $inc: { tagged: 1 }, $set: { lasttagged: new Date() } }, 
        { returnOriginal: false, upsert: true }
    )
    if (returnperson.value) personid = returnperson.value._id.toString() //if person already exists, get the ID.
    if (returnperson.lastErrorObject) personid = returnperson.lastErrorObject.upserted.toString() //if person is new, get the ID.

    await InsightTags.updateOne(
        {
            insightid: insightid,
            profileid: getprofileid(req.session),
            personid: personid
        },
        { $set: { datecreated: new Date() } }, 
        {upsert: true}
    )

    return true
}

async function createinsight(newinsight, req) {
    //passing wheelid and profileid on newinsight object.
    const db = await DbConnection.Get()
    const Insights = db.collection('insights')
    const Spaced = db.collection('spaced')
    const Areas = db.collection('areas')
    const People = db.collection('people')
    const InsightTags = db.collection('insighttags')

    const Profiles = db.collection('profiles')

    if (newinsight.profileid) {
        //get wheelid from profile.
        const profile = await Profiles.findOne({
            _id: new ObjectId(newinsight.profileid)
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
            Spaced.insertOne(spaced)
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

                const res = await Areas.insertOne(area)
                areaid = res.insertedId
            }

            let insighttag = new Object()
            insighttag.insightid = result.insertedId.toString()
            insighttag.profileid = newinsight.profileid
            insighttag.area = areaid
            insighttag.notes = link.notes
            insighttag.datecreated = new Date()
            InsightTags.insertOne(insighttag)

            Areas.updateOne(
                {
                    wheelid: newinsight.wheelid
                        ? newinsight.wheelid
                        : getwheelid(req.session),
                    _id: new ObjectId(areaid)
                },
                { $inc: { tagged: 1 }, $set: { lasttagged: new Date() } },
            )
        })

        if (newinsight.people) //if there are people tags, save the people tags
        newinsight.people.map(async link => {
            let personid = link._id
            if (!personid) {
                //if person doesn't exist, create it.
                link.profileid = newinsight.profileid
                const res = await People.insertOne(link)
                personid = res.insertedId.toString()
            }

            let persontag = new Object()
            persontag.insightid = result.insertedId.toString()
            persontag.profileid = newinsight.profileid
            persontag.personid = personid
            persontag.notes = link.notes
            persontag.datecreated = new Date()
            InsightTags.insertOne(persontag)

            People.updateOne(
                {
                    profileid: newinsight.profileid,
                    _id: new ObjectId(personid)
                },
                { $inc: { tagged: 1 }, $set: { lasttagged: new Date() } },
            )
        })
        return result.insertedId.toString()
    } catch (error) {
        console.log(error)
    }
}
