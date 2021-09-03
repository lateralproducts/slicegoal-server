import DbConnection from './database'
import { getuserIpAddress } from './users'

export const typeDefs = `   
    extend type Mutation {
        trackpage(page: String, search: String): Boolean
    }
`
export const resolvers = {
    Mutation: {
        trackpage: async (root, args, { req }) => {
            const db = await DbConnection.Get()
            const Sessions = db.collection('sessions')

            const Session = await Sessions.findOne({
                session: req.session.id,
            })

            if (Session) {
                Sessions.updateOne(
                    {
                        session: req.session.id,
                    },
                    {
                        $set: {
                            lastrequest: new Date(),
                        },
                        $push: {
                            pages: {
                                page: args.page,
                                time: new Date(),
                                ip: getuserIpAddress(req),
                                query: args.search,
                            },
                        },
                    },
                )
            } else {
                Sessions.insertOne({
                    session: req.session.id,
                    email: null,
                    landpage: args.page,
                    landed: new Date(),
                    lastrequest: new Date(),
                    campaignquery: args.search,
                    campaign: args.search ? querytojson(args.search) : null,
                    landedip: getuserIpAddress(req),
                    pages: [
                        {
                            page: args.page,
                            time: new Date(),
                            ip: getuserIpAddress(req),
                            query: args.search,
                        },
                    ],
                })
            }
        },
    },
}

function querytojson(search) {
    const json = JSON.parse(
        '{"' +
            decodeURI(search)
                .replace(/"/g, '\\"')
                .replace(/&/g, '","')
                .replace(/=/g, '":"') +
            '"}',
    )
    return json
}
