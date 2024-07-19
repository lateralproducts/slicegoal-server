//import { ObjectId } from 'mongodb'
//import { triggererror } from './graphqlserver';
import { getprofileid } from './users'
import DbConnection from './database'
import { getuiversion } from '../util/functions'
let pjson = require('../package.json')

export const typeDefs = `
    extend type Query {
        recap(date: String!): Recap
        mission(date: String!): Mission
    }

    extend type Mutation {
        createRecap(recap: String!, date: String!): Boolean
        updateRecap(recap: String!, date: String!): Boolean
        deleteRecap(date: String!): Boolean

        createMission(mission: String!, date: String!): Boolean
        updateMission(mission: String!, date: String!): Boolean
        deleteMission(date: String!): Boolean
    }
`

export const schema = `
    type Recap {
        _id: String
        recap: String
        period: String
        day: String
        week: Int
        month: Int
        year: Int
        modified: String
        created: String
    }

    type Mission {
        _id: String
        mission: String
        period: String
        day: String
        week: Int
        month: Int
        year: Int
        modified: String
        created: String
    }
`

export const resolvers = {
    Query: {
        recap: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Recaps = db.collection('recaps')

            let query = new Object()
            query.profileid = getprofileid(req.session) //show goals from profileid.
            query.date = new Date(args.date) //time set from client argument

            return args.date ? await Recaps.findOne(query) : null
        },
        mission: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Missions = db.collection('missions')

            let query = new Object()
            query.profileid = getprofileid(req.session) //show goals from profileid.
            query.date = new Date(args.date) //time set from client argument

            return args.date ? await Missions.findOne(query) : null
        }
    },
    Mutation: {
        createRecap: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Recaps = db.collection('recaps')

            args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.date = args.date ? new Date(args.date) : null //time set from client argument
            args.created = new Date()
            Recaps.insertOne(args)
            return true
        },
        updateRecap: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Recaps = db.collection('recaps')

            args.profileid = getprofileid(req.session)
            Recaps.updateOne(
                {   
                    date: new Date(args.date), //time set from client argument
                    profileid: getprofileid(req.session)
                },
                { $set: { recap: 
                    args.recap, 
                    modified: new Date() 
                } },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        deleteRecap: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Recaps = db.collection('recaps')

            Recaps.deleteOne(
                {
                    date: new Date(args.date), //time set from client argument
                    profileid: args.profileid
                },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        createMission: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Missions = db.collection('missions')

            args.profileid = getprofileid(req.session)
            args.serverversion = pjson.version
            args.uiversion = getuiversion(req.session)
            args.date = args.date ? new Date(args.date) : null //time set from client argument
            args.created = new Date()
            Missions.insertOne(args)
            return true
        },
        updateMission: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Missions = db.collection('missions')

            args.profileid = getprofileid(req.session)
            Missions.updateOne(
                {   
                    date: new Date(args.date), //time set from client argument
                    profileid: getprofileid(req.session)
                },
                { $set: { mission: 
                    args.mission, 
                    modified: new Date() 
                } },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        },
        deleteMission: async(root, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Missions = db.collection('missions')

            Missions.deleteOne(
                {
                    date: new Date(args.date), //time set from client argument
                    profileid: args.profileid
                },
                function(err) {
                    if (err) throw err
                },
            )
            return true
        }
    }
}