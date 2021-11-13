import { ObjectId } from 'mongodb'

import DbConnection from './database'
import { getprofileid } from './users'

export const typeDefs = `

    extend type Query {
        sources: [Source]
        insightSources(insightid: String!): [SourceTag]
        sourceInsights(sourceid: String!): [SourceInsight]
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
        pinned: Boolean
    }

    input SourceTagIn {
        note: String
        name: String
        _id: String!
    }

    type SourceInsight {
        insight: Insight
        pinned: Boolean
    }
`

export const resolvers = {
    Query: {
        // all sources on a profile, ordered by last tagged
        sources: async function(_, __, { req }) {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const SourceTags = db.collection('sourcetags')

           return await SourceTags.aggregate([
                {$match: {profileid: getprofileid(req.session)}},
                {$group: {
                    _id: '$sourceid',
                    lasttagged: {$max: '$datetime'}
                }},
                {$addFields: {sourceobjectid: {$toObjectId: '$_id'}}},
                {$sort: {lasttagged: -1}},
                {$lookup: {
                    from: 'sources',
                    localField: 'sourceobjectid',
                    foreignField: '_id',
                    as: 'sources'
                }},
                {$unwind: '$sources'}
            ])
            .toArray()
            .then(tags => {
                return tags.map(tag => {
                    return tag.sources
                })
            })
        },
        // all sources on an insight
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
        },
        // all insights associated with given source
        sourceInsights: async function(_, { sourceid }, { req }) {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const SourceTags = db.collection('sourcetags')

            const sourcetags = await SourceTags.find({
                resourcetype: 'insight',
                sourceid: sourceid
                },
                { sort: { pinned: -1, datetime: -1 } }
            )
            .toArray()

            return sourcetags.map(tag => {
                return {
                    insightid: ObjectId(tag.resourceid),
                    pinned: tag.pinned || false
                }
            })

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
    },
    SourceInsight: {
        insight: async({ insightid }) => {
            const db = await DbConnection.Get()
            const Insights = db.collection('insights')

            return await Insights.findOne(
                { _id: insightid }
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