import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getprofileid } from './users'

export const schema = `
    type Tag {
        tagid: String
        tagname: String
    }
`

export const typeDefs = `
    extend type Query {
        tags(type: String!, areas: [AreaId]) : [Area]
    } 
`

export const resolvers = {
    Query: {
        tags: async(_, args, { req }) => {
            const db = await DbConnection.Get()

            const GoalTags = db.collection('goaltags')
            const Insights = db.collection('insights')
            const InsightTags = db.collection('insighttags')
            const Spaced = db.collection('spaced')
            const Areas = db.collection('areas')

            let alltags // goaltags or insighttags
            let tagsonarea

            // ignore first area (start area) for spaced scenario (want to return a tag for it)
            const inputareas = args.type === 'spaced' ? args.areas.splice(0, 1) : args.areas

            if(args.type === 'insights') {
                alltags = await InsightTags.find({ profileid: getprofileid(req.session) })
                    .toArray()
                tagsonarea = await InsightTags.find({ area: inputareas[0]._id })
                    .toArray()
            }
            else if(args.type === 'goals') {
                alltags = await GoalTags.find({ profileid: getprofileid(req.session) })
                    .toArray()
                tagsonarea = await GoalTags.find({ area: inputareas[0]._id })
                    .toArray()
            } 

            // Check insights for which prompt is set 
            const insightspromptset = (await Insights.find({
                profileid: getprofileid(req.session),
                $and: [
                    { prompt: {$ne: null} },
                    { prompt: {$ne: ''} }
                ]
            })
            .toArray())
            .map(insight => {
                return insight._id.toString()
            })

            // Check spaced entries which have a memory prompt due
            const insightspromptdue = (await Spaced.find(
                {
                    profileid: getprofileid(req.session),
                    $or: [
                        { datenext: null },
                        { datenext: { $lte: new Date() } }
                    ]
                }
            )
            .toArray())
            .map(spaced => {
                return spaced.insightid.toString()
            })
            
            if(args.type === 'spaced') {

                alltags = await InsightTags.find({ 
                    $and: [
                        { profileid: getprofileid(req.session)},
                        { insightid: {$in: insightspromptset }},
                        { insightid: {$in: insightspromptdue }}
                    ]
                 })
                .toArray()

                tagsonarea = await InsightTags.find({ 
                    $and: [
                        inputareas.length > 0 ? { area: inputareas[0]._id } : '',
                        { profileid: getprofileid(req.session)},
                        { insightid: {$in: insightspromptset }},
                        { insightid: {$in: insightspromptdue }}
                    ]
                })
                .toArray()
            } else {
                // Initialise to only tags for which there exists a tag on first area to that tags insight
                alltags = alltags.filter(tag => {
                    return tagsonarea.some(tagonarea => tagonarea.insightid === tag.insightid)
                })
            }

            // If no tags return empty array
            if(!alltags)
                return []

            let keeptags = alltags // intialise to keep all initialised alltags
            for(let i=1; i < args.areas.length; i++) {

                // tags on current area
                tagsonarea = alltags.filter(tag => 
                    tag.area === args.areas[i]._id
                )
                // keep only tags for which there exists a tag on current area to that tags insight
                if(args.type === 'insights') {
                    keeptags = keeptags.filter(tag => {
                        return tagsonarea.some(tagonarea =>
                            tagonarea.insightid === tag.insightid
                        )
                    })
                }
                else if(args.type === 'spaced') {
                    keeptags = keeptags.filter(tag => {
                        return (tagsonarea.some(tagonarea => tagonarea.insightid === tag.insightid) &&
                            insightspromptset.some(id => { return id === tag.insightid }) &&
                            insightspromptdue.some(id => { return id === tag.insightid })
                        )
                    })
                }
            }
            
            // Filter out input areas and take only areaid from tags
            const areaids = [...new Set(keeptags
                .filter(tag => !args.areas.some(area => area._id === tag.area)) // Filter out input areas
                .map(tag => {return tag.area}))]

            // Get area objects from resultant areaids
            if(areaids) {
                const areaobjectids = areaids.map(area => {return ObjectId(area)})
                
                return (await Areas.find({_id: {$in: areaobjectids}})
                    .toArray())
            }
            else 
                return []
        } 
    },
    Area: {
        count: async(area, __, { req }) => {
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const InsightTags = db.collection('insighttags')
            const Spaced = db.collection('spaced')

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

            const insighttags = await InsightTags.find(
                    {$and: [
                        {area: area._id.toString()},
                        {insightid: {$in: insightidsprompt}}
                        ]
                    }
                )
                .toArray()

            const spaced = await Spaced.find(
                    {
                        insightid: {$in: insighttags.map(tag => {return tag.insightid})},
                        $or: [
                            { datenext: null },
                            { datenext: { $lte: new Date() } }
                        ]
                    }
                )
                .toArray()

            return spaced.length
        }
    }
}