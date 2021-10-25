import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getprofileid } from './users'


export const typeDefs = `

    extend type Query {
        sources: [Source]
        insightSources(insightid: String!): [SourceTag]
    }

    extend type Mutation {
        createSource(name: String!): Source
    }
`

export const schema = `

    type Source {
        _id: String
        name: String
        datetime: String
        profileid: String
    }

    type SourceTag {
        _id: String
        resourceid: String
        resourcetype: String
        profileid: String
        source: Source
        note: String
    }

    input SourceTagIn {
        note: String
        name: String
        _id: String!
    }

`

export const resolvers = {
    Query: {
        sources: async function(_, args, { req }) {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')

            return await Sources.find(
                {profileid: getprofileid(req.session)}
                )
                .toArray()
        },
        insightSources: async function(_, { insightid }, { req }) {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const SourceTags = db.collection('sourcetags')

            return await SourceTags.find(
                {
                    resourcetype: 'insight',
                    resourceid: insightid
                }
            ).toArray()
        }
    },
    Mutation: {
        createSource: async function(_, args, { req }) {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')

            return await Sources.insertOne(
                {profileid: getprofileid(req.session),
                datetime: new Date(),
                name: args.name
                }
            )
            .then(source => {
                return {
                    _id: source.insertedId,
                    name: args.name
                }
            })
        }
    },
    SourceTag: {
        source: async function(parent) {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')

            return await Sources.findOne(
                {_id: ObjectId(parent.sourceid)}
            )
        }
    }
}

export async function attachSources(sourcelist, resourcetype, resourceid, profileid) {

    const db = await DbConnection.Get()
    const SourceTags = db.collection('sourcetags')

    const newsourcetags = sourcelist.map(source => {
        return {
            _id: source._id,
            resourcetype: resourcetype,
            resourceid: resourceid,
            note: source.note,
            datetime: new Date(),
            profileid: profileid
        }
    })

    // Remove necessary tags
    const newsourceids = newsourcetags.map(tag => {return tag._id})
    SourceTags.find(
        {
            resourceid: resourceid,
            sourceid: {$nin: newsourceids}
        }
    )
    .toArray()
    .then(deletetags => {
        const deletetagids = deletetags.map(tag => {return ObjectId(tag._id)})
        SourceTags.remove(
            {_id: {$in: deletetagids}}
        )
    })


    // Update/add tags
    const updatepromisearray = []
    newsourcetags.forEach(sourcetag => {
        updatepromisearray.push(SourceTags.updateOne(
                {
                    sourceid: sourcetag._id,
                    resourceid: resourceid
                },
                {   
                    sourceid: sourcetag._id,
                    resourcetype: resourcetype,
                    resourceid: resourceid,
                    note: sourcetag.note,
                    datetime: new Date(),
                    profileid: profileid
                },
                {upsert: true}
            )
        )
    })

    return await Promise.all(updatepromisearray)
}