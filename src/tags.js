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
        tags(type: String!, areas: [AreaTagIn]) : [Area]
    } 
`

export const resolvers = {
    Query: {
        tags: async(_, args, { req }) => {
            const db = await DbConnection.Get()

            const GoalTags = db.collection('goaltags')
            const InsightTags = db.collection('insighttags')
            const Areas = db.collection('areas')

            let alltags // goaltags or insighttags
            let tagsonarea
            if(args.type === 'insights') {
                alltags = await InsightTags.find({ profileid: getprofileid(req.session) })
                    .toArray()
                tagsonarea = await InsightTags.find({ area: args.areas[0].area._id })
                    .toArray()
            }
            else if(args.type === 'goals') {
                alltags = await GoalTags.find({ profileid: getprofileid(req.session) })
                    .toArray()
                tagsonarea = await GoalTags.find({ area: args.areas[0].area._id })
                    .toArray()
            }

            // If no tags return empty array
            if(!alltags)
                return []

            // Initialise to only tags for which there exists a tag on first area to that tags insight
            alltags = alltags.filter(tag => {
                return tagsonarea.some(tagonarea => tagonarea.insightid === tag.insightid)
            })

            let keeptags = alltags // intialise to keep all initialised alltags
            for(let i=1; i < args.areas.length; i++) {
                // tags on current area
                tagsonarea = alltags.filter(tag => 
                    tag.area === args.areas[i].area._id
                )
                // keep only tags for which there exists a tag on current area to that tags insight 
                keeptags = keeptags.filter(tag => {
                    return tagsonarea.some(tagonarea => 
                        tagonarea.insightid === tag.insightid
                    )})
            }

            // Filter out input areas and take only areaid from tags
            const areaids = [...new Set(keeptags
                .filter(tag => !args.areas.some(area => area.area._id === tag.area)) // Filter out input areas
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
    }
}