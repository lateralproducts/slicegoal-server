import DbConnection from './database'

import { getprofileid, getwheelid } from './users'

export const schema = `
    type Tag {
        tagid: String
        tagname: String
    }
`

export const typeDefs = `
    extend type Query {
        tags(type: String, areas: [AreaTagIn]) : [area]
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
            if(args.type === 'insight') {
                alltags = await InsightTags.find({profileid: getprofileid(req.session)})
                    .toArray()
            }
            else if(args.type === 'goals') {
                alltags = await GoalTags.find({profileid: getprofileid(req.session)})
                    .toArray()
            }

            // Result set initialised to all areas on wheel
            const resAreas = await Areas.find({wheelid: getwheelid(req.session)})
                .toArray()
            let resSet = new Set(resAreas.map(area => area._id.toString()))

            function tagsbyareas(queryAreas, tags) {
                if(queryAreas.length === 0) return resSet

                const tagSet = new Set() // set of insighttags or goaltags
                tags.forEach(tag => {
                    if(tag.area === queryAreas[0]._id)
                        tagSet.add(tag) 
                })

                resSet = resSet.forEach(area => {
                    if(tagSet.some(tag => {tag.area === area._id.toString()}))
                        return area
                })

                queryAreas.splice(0, 1)
                tagsbyareas(resSet, tags)
            }

            return tagsbyareas(args.areas, alltags)
        } 
    }
}