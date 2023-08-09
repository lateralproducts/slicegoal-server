import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';

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

            const inputareas = args.areas

            if(args.type === 'insights') {
                alltags = await InsightTags.find({ profileid: getprofileid(req.session) })
                    .toArray()
                tagsonarea = await InsightTags.find({ area: inputareas[0]._id })
                    .toArray()
            }else if(args.type === 'goals') {
                alltags = await GoalTags.find({ profileid: getprofileid(req.session) })
                    .toArray()
                tagsonarea = await GoalTags.find({ area: inputareas[0]._id })
                    .toArray()
            }

            let insightspromptset = []
            let insightspromptdue = []

            if(args.type === 'spaced') {

                // Check insights for which prompt is set 
                insightspromptset = (await Insights.find({
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
                insightspromptdue = (await Spaced.find(
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
                        inputareas.length > 0 ? { area: inputareas[0]._id } : {},
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
                const areaobjectids = areaids.map(area => {return new ObjectId(area)})
                
                return (await Areas.find({_id: {$in: areaobjectids}})
                    .toArray())
                    .map(area => {
                        return {
                            _id: area._id.toString(),
                            name: area.name,
                            inputareas: inputareas
                        }
                    })
            }
            else 
                return []
        } 
    },
    Area: {
        count: async(parent, __, { req }) => {
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')
            const InsightTags = db.collection('insighttags')
            const Spaced = db.collection('spaced')

            // Check insights with prompt set
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

            let alltags = await InsightTags.find({ 
                $and: [
                    { profileid: getprofileid(req.session)},
                    { insightid: {$in: insightspromptset }},
                    { insightid: {$in: insightspromptdue }}
                ]
             })
            .toArray()

            let tagsonarea = await InsightTags.find({ 
                $and: [
                    { area: parent._id },
                    { profileid: getprofileid(req.session)},
                    { insightid: {$in: insightspromptset }},
                    { insightid: {$in: insightspromptdue }}
                ]
            })
            .toArray()

            if(!alltags) return []

            let keeptags = tagsonarea // intialise to keep all tags on area
            for(let i=0; i < parent.inputareas.length; i++) {

                tagsonarea = alltags.filter(tag => 
                    tag.area === parent.inputareas[i]._id
                )

                keeptags = keeptags.filter(tag => {
                    return (tagsonarea.some(tagonarea => tagonarea.insightid === tag.insightid) &&
                        insightspromptset.some(id => { return id === tag.insightid }) &&
                        insightspromptdue.some(id => { return id === tag.insightid })
                    )
                })
            }

            return keeptags.length
        }
    }
}