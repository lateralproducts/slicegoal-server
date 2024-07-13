import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';

import DbConnection from './database'
import { getprofileid, getuserid, getwheelid } from './users'
import { createUserConnection } from './community'
import { newIx } from './interactions'
import { shareSourceEmail } from './emails'
import { linkSourceTask } from './tasks'
import { getPreviews } from './fileserver'

export const typeDefs = `

    extend type Query {
        sources(tags: [String]): [Source]
        insightSources(insightid: String!): [InsightTag]
        taskSources(taskid: String!): [Source]
        templateSources(templateid: String!): [Source]
        sourceInsights(sourceid: String!): [InsightTag]
        searchSources(search: String, areas: [AreaId]): [Source]
        source(sourceid: String!): Source
    }

    extend type Mutation {
        createSource(name: String!, url: String, type: String, notes: String, areas: [AreaTagIn], linktotask: String, fileids: [String]): Source
        editSource(sourceid: String!, name: String, url: String, type: String, notes: String, areas: [AreaTagIn], fileids: [String]) : Boolean
        deleteSource(sourceid: String!): Boolean
        shareSource(sourceid: String!, targetUser: String!, shareNote: String): ShareResponse
    }
`

export const schema = `

    type Source {
        _id: String
        name: String
        datetime: String
        profileid: String
        notes: String
        type: String
        url: String
        tags: [InsightTag]
        filedetails: [FilePreview]
    }

    input SourceTagIn {
        notes: String
        name: String
        _id: String!
    }
`

export const resolvers = {
    Query: {
        // all sources on a profile, ordered by last tagged
        sources: async function(_, {tags}, { req }) {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')
            const Tags = db.collection('insighttags')

            let searchtags = []
            if (tags && tags.length > 0) {
                let query = new Object()
                query.profileid = getprofileid(req.session)
                query.area = {$in: tags}
                query.sourceid = {$ne: null}
                searchtags = await Tags.find(query).limit(10).sort({accessedit: -1}).toArray()
            }
            if (tags && searchtags.length === 0) return []

            let querysources = new Object()
            querysources.profileid = getprofileid(req.session)
            if (searchtags.length > 0) querysources._id = {$in: searchtags.map(tag => {return new ObjectId(tag.sourceid)})}
            return await Sources.find(querysources).sort({accessedit: -1}).toArray()
        },
        source: async function(_, {sourceid}, { req }) {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')

            let query = new Object()
            query.profileid = getprofileid(req.session)
            query._id = new ObjectId(sourceid)
            return await Sources.findOne(query)
        },
        searchSources: async function(_, {areas, search}, { req }) {
            if(search === undefined && areas.length === 0) return []
            else {
                const db = await DbConnection.Get()
                const Tags = db.collection('insighttags')
                const Sources = db.collection('sources')

                let tags = []

                if (areas && areas.length > 0) {
                    let query = new Object()
                    query.profileid = getprofileid(req.session)
                    query.area = {$in: [...areas.map(area => {return area._id})]}
                    query.sourceid = {$ne: null}

                    tags = await Tags.find(query).limit(10).sort({accessedit: -1}).toArray()
                    if (tags.length === 0) return []
                }

                let querysources = new Object()
                querysources.profileid = getprofileid(req.session)
                if (tags.length > 0) querysources._id = {$in: tags.map(tag => {return new ObjectId(tag.sourceid)})}
                if (search) querysources.$or = [
                    { name: new RegExp(search, 'i') },
                    { notes: new RegExp(search, 'i') }
                ]
                const sources = await Sources.find(querysources).toArray()
                
                return sources
            }
        },
        // all sources on an insight
        insightSources: async function(_, { insightid }, { req }) {
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')

            return await Tags.find(
                {
                    sourceid: {$ne: null},
                    insightid: insightid
                }
            ).toArray()
        },
        // all sources on an task
        taskSources: async(_, {taskid}, { req }) => {
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')
            const Sources = db.collection('sources')
            const tags = await Tags.findOne({profile: getprofileid(req.session), taskid: taskid, sourceid: {$ne: null}})

            if (tags) 
                return await Sources.find({
                    _id: {
                        $in: tags.map(tag => {return new ObjectId(tag.sourceid)})
                    }
                }).toArray()
            else return []
        },
        // all sources on an template
        templateSources: async(_, {templateid}, { req }) => {
            
            const db = await DbConnection.Get()
            const Templates = db.collection('templates')
            const Sources = db.collection('sources')
            const template = await Templates.findOne({profile: getprofileid(req.session), _id: new ObjectId(templateid)})

            if (template.sources) 
                return await Sources.find({
                    _id: {
                        $in: template.sources.map(sourceid => {return new ObjectId(sourceid)})
                    }
                }).toArray()
            else return []
        },
        // all insights associated with given source
        sourceInsights: async function(_, { sourceid }, { req }) {
            
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')

            return await Tags.find({
                insightid: {$ne: null},
                sourceid: sourceid
                },
                { sort: { pinned: -1, datecreated: -1 } }
            )
            .toArray()
        },
    },
    Source: {
        tags: async function(source, _, { req }) {
            try {
                const db = await DbConnection.Get()
                const Tags = db.collection('insighttags')

                const tags = await Tags.find({
                    area: {$ne: null}, //only return area tags
                    sourceid: source._id.toString(),
                    profileid: getprofileid(req.session)
                }).toArray()
                return tags
            }
             catch (error) {
                console.log(error)
                return []
            }
        },
        filedetails: async function(source, _, { req }) {
            return source.fileids ? await getPreviews(req, source.fileids) : null
        }
    },
    Mutation: {
        createSource: async function(_, args, { req }) {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')
            const Tags = db.collection('insighttags')
            const Areas = db.collection('areas')

            return await Sources.insertOne(
                {
                    profileid: getprofileid(req.session),
                    datetime: new Date(),
                    accessedit: new Date(),
                    name: args.name,
                    url: args.url,
                    notes: args.notes,
                    type: args.type,
                    fileids: args.fileids
                }
            )
            .then(source => {
                if(args.linktotask) linkSourceTask(args.linktotask, source.insertedId, req)

                if (args.areas)
                    args.areas.map(async link => {
                        let areaid = link._id
    
                        if (!areaid) {
                            let area = {
                                name: link.name,
                                wheelid: getwheelid(req.session),
                                created: new Date()
                            }
    
                            const res = await Areas.insertOne(area)
                            areaid = res.insertedId.toString()
                        }
    
                        let sourceareatag = new Object()
                        sourceareatag.sourceid = source.insertedId.toString()
                        sourceareatag.profileid = getprofileid(req.session)
                        sourceareatag.area = areaid
                        sourceareatag.datecreated = new Date()
                        Tags.insertOne(sourceareatag)
                    })
                return {
                    _id: source.insertedId,
                    name: args.name
                }
            })
        },
        editSource: async function(_, args, { req }) {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')

            attachAreas(args.areas, {sourceid: args.sourceid}, getprofileid(req.session), req)

            return (await Sources.updateOne(
                {_id: new ObjectId(args.sourceid)},
                {$set: {name: args.name, url: args.url, type: args.type, notes: args.notes, fileids: args.fileids}}
            )).matchedCount === 1

        },
        deleteSource: async function(_, { sourceid }, { req }) {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')
            const Tags = db.collection('insighttags')

            // Remove tags to source and then tag itself 
            return (await Tags.deleteMany({ sourceid: sourceid })
                .then(() => {
                    return Sources.deleteOne({ _id: new ObjectId(sourceid) })
                })).deleteCount === 1
        },
        shareSource: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Sources = db.collection('sources')
            const Users = db.collection('users')

            const currentUser = await Users.findOne({
                _id: new ObjectId(getuserid(req.session))
            })

            await createUserConnection( //and creates user targetUser profile if new
                currentUser, 
                args.targetUser, 
                'source share',
                args.sourceid
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
                let interactionid = (await newIx(currentUser._id.toString(),targetUser._id.toString(),'share source email', args.sourceid, args.shareNote)).insertedId.toString()
                return await Sources.findOne({
                    _id: new ObjectId(args.sourceid)
                })
                .then(source => {
                    //save shared source to be accessed.
                    return Sources.insertOne({
                        sharedfrom: getuserid(req.session),
                        status: 'newshared',
                        datetimeshared: new Date(),
                        email: args.targetUser,
                        datecreated: source.datecreated,
                        title: source.title
                    })
                    .then(result => {
                        Sources.findOne({_id: new ObjectId(result.insertedId)})
                        .then(result => { 
                            //save interaction to track
                            try {
                                
                                if(targetUser.state === 'verified'){
                                    // Existing verified user
                                    shareSourceEmail(
                                        source,
                                        currentUser,
                                        targetUser,
                                        args.shareNote,
                                        `?sharedsources=active`,
                                        interactionid
                                    )
                                } else {
                                    // Existing but unverified user
                                    shareSourceEmail(
                                        source,
                                        currentUser,
                                        targetUser,
                                        args.shareNote,
                                        `?page=verify&user=${targetUser._id}&code=${targetUser.code}&sharedsources=active`,
                                        interactionid
                                    )
                                }
                            }catch (error) {
                                console.log("failed to send shared sources email - " + error)
                            }
                        })

                        return {
                            success: true,
                            message: 'Source shared'
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
        }
    }
}

export async function attachSources({sources, insightid, profileid}) {

    const db = await DbConnection.Get()
    const Tags = db.collection('insighttags')
    const Sources = db.collection('sources')

    // Remove necessary tags
    const newsourceids = sources.map(source => {return source._id})
    Tags.find(
        {
            insightid: insightid,
            sourceid: {$nin: newsourceids},
            sourceid: {$ne: null}
        }
    )
    .toArray()
    .then(deletetags => {
        const deletetagids = deletetags.map(tag => {return new ObjectId(tag._id)})
        Tags.deleteOne(
            {_id: {$in: deletetagids}}
        )
    })


    //Update/add tags
    //const updatepromisearray = []
    sources.forEach(sourcetag => {
        //updatepromisearray.push(
            Tags.updateOne(
                {
                    sourceid: sourcetag._id,
                    insightid: insightid,
                    profileid: profileid
                },
                {$set: {
                    notes: sourcetag.notes,
                    updated: new Date()
                },
                $setOnInsert: {
                    datecreated: new Date()
                }},
                {upsert: true}
            )

            Sources.updateOne(
                {
                    _id: new ObjectId(sourcetag._id),
                    profileid: profileid
                },  
                {$set: {accessedit: new Date()}}
            )
        //)
    })

    return //await Promise.all(updatepromisearray) //not using this at the moment, so removing it.
}

export async function attachAreas(areatags, attach, profileid, req) {
    //attach area to task, source, etc.
    const db = await DbConnection.Get()
    const Tags = db.collection('insighttags')
    const Areas = db.collection('areas')

    // Remove all area tags
    let query = Object.assign({}, attach) //attach task, source, etc.
    query.area = {$ne: null}

    await Tags.find(query).toArray()
    .then(deletetags => {
        deletetags.map(tag => {
            Tags.deleteOne({_id: tag._id})
        })
    })
    //Add new area tags
    areatags.map(async (areatag) => {
        let areaid = areatag._id
    
        if (!areaid) {
            const area = {
                name: areatag.name,
                wheelid: getwheelid(req.session),
                created: new Date()
            };
    
            const res = await Areas.insertOne(area)
            areaid = res.insertedId.toString()
        }
    
        const update =  Object.assign({}, attach)
        update.area = areaid
        update.profileid = profileid
        delete update.$and
        delete update._id

        Tags.updateOne(
            update,
            {$set: {
                notes: areatag.notes,
                updated: new Date()
            },
            $setOnInsert: {
                datecreated: new Date()
            }},
            {upsert: true}
        )
    
        await Areas.updateOne(
            {
                _id: new ObjectId(areatag._id),
                profileid: profileid
            },
            { $set: { accessedit: new Date() } }
        )
    })
}