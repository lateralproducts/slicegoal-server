import DbConnection from './database'
import { getuserid } from './users'
import { getuiversion } from '../util/functions'
import { emailFeedback } from './emails'
let pjson = require('../package.json')

export const typeDefs = `
    extend type Mutation {
        submitFeedback(title: String, description: String): Boolean
    }
`

export const resolvers = {
    Mutation: {
        submitFeedback: async (root, args, { req }) => {
            const db = await DbConnection.Get()
            const Feedback = db.collection('feedback')
            args.userid = getuserid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.date = new Date()

            await emailFeedback(
                req.session.user,
                args.description,
                args.date
            )
            await Feedback.insertOne(args)
            return true
        },
    },
}
