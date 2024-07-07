import { ObjectId } from 'mongodb' 
import DbConnection from './database'
import { getprofileid } from './users'

export const schema = `
    type Person {
        _id: String
        name: String
        dob: Int
        profileId: String
    }

    input PersonInput {
        name: String
        notes: String
        tags: [String]
    }
`

export const typeDefs = `
    extend type Query {
        getPersonById(id: String!): Person
        getAllPeople: [Person]
        personInsights(personid: String!): [Insight]
    }

    extend type Mutation {
        createPerson(person: PersonInput!): Boolean
        updatePerson(personid: String!, updates: PersonInput!): Boolean
        deletePerson(personid: String!): Boolean
    }
`

export const resolvers = {
    Query: {        
        personInsights: async(_, args, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileId = await getprofileid(req.session)
                const id = args.id
                const result = await db.collection('people').findOne({ _id: ObjectId(id), profileId })
                return result
            } catch (error) {
                throw new Error(`Failed to get person by ID: ${error}`)
            }
        },

        getPersonById: async(_, args, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileId = await getprofileid(req.session)
                const id = args.id
                const result = await db.collection('people').findOne({ _id: ObjectId(id), profileId })
                return result
            } catch (error) {
                throw new Error(`Failed to get person by ID: ${error}`)
            }
        },

        getAllPeople: async(_, args, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileId = await getprofileid(req.session)
                const result = await db.collection('people').find({ profileId }).toArray()
                console.log(result)
                return result
            } catch (error) {
                throw new Error(`Failed to get all people: ${error}`)
            }
        }
    },
    Mutation: {
        createPerson: async(_, args, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
            try {
                const db = await DbConnection.Get()
                const profileId = await getprofileid(req.session)
                const person = args.person
                person.profileId = profileId
                const result = await db.collection('people').insertOne(person)
                console.log(result)
                return true
            } catch (error) {
                console.log(error)
                throw new Error(`Failed to create person`)
            }
        } else { throw new Error(`Failed to create person`) }
        },

        updatePerson: async(_, args, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileId = await getprofileid(req.session)
                const id = args.personid
                const updates = args.updates
                updates.profileId = profileId
                const result = await db.collection('people').findOneAndUpdate(
                    { _id: ObjectId(id) },
                    { $set: updates },
                    { returnOriginal: false }
                )
                return true
            } catch (error) {
                throw new Error(`Failed to update person: ${error}`)
            }
        },

        deletePerson: async(_, args, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileId = await getprofileid(req.session)
                const id = args.personid
                const result = await db.collection('people').findOneAndDelete({ _id: ObjectId(id), profileId })
                return true
            } catch (error) {
                throw new Error(`Failed to delete person: ${error}`)
            }
        }
    }
}
