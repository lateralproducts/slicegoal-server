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
        tags(type: String, areas: [AreaTagIn]) : [area]
    } 
`

export const resolvers = {
    Query: {
        tags: async(_, args, { req }) => {
            const db = await DbConnection.Get()

            const GoalTags = db.collection('goaltags')
            const InsightTags = db.collection('insighttags')

            let alltags // goaltags or insighttags
            if(args.type === 'insight') {
                alltags = await InsightTags.find({profileid: getprofileid(req.session)})
                    .toArray()
            }
            else if(args.type === 'goals') {
                alltags = await GoalTags.find({profileid: getprofileid(req.session)})
                    .toArray()
            }

            // Initialise result set to unique values of area id on tags
            let resset = [...new Set(alltags.map(tag => tag.area))]
            let tagsonarea

            function tagsbyareas(queryareas, tags) {
                if(queryareas.length === 0) return tags
                
                // Only tags with id 'area' = current checking area id 
                tagsonarea = tags.filter(tag => tag.area === queryareas[0]._id) 

                // Only leave result area ids if there remains some tag with that area id 
                resset = resset.filter(area => tagsonarea.some(tag => {tag.area === area}))

                // Move to next area and recurse
                queryareas.splice(0, 1)
                tagsbyareas(queryareas, resset)
            }

            return tagsbyareas(args.areas, alltags).map(tag => {
                return tag.area
            })
        } 
    }
}