import { ObjectId } from 'mongodb' 
import DbConnection from './database'
import { getprofileid } from './users'

export const schema = `
    type Person {
        _id: String
        name: String
        dob: Int
        tags: [Area]
    }

    input PersonInput {
        _id: String
        name: String
        notes: String
        tags: [String]
    }
`

export const typeDefs = `
    extend type Query {
        getPersonById(id: String!): Person
        getAllPeople: [Person]
        personInsights(personid: String!): [InsightTag]
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
            const db = await DbConnection.Get()
            const Tags = db.collection('insighttags')

            return await Tags.find({
                insightid: {$ne: null},
                personid: args.personid
                },
                { sort: { pinned: -1, created: -1 } }
            )
            .toArray()
        },

        getPersonById: async(_, { id }, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileid = await getprofileid(req.session)
                const result = await db.collection('people').findOne({ _id: new ObjectId(id), profileid })
                console.log(result)
                return result
            } catch (error) {
                throw new Error(`Failed to get person by ID: ${error}`)
            }
        },

        getAllPeople: async(_, args, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileid = await getprofileid(req.session)
                const result = await db.collection('people').find({ profileid }).toArray()
                console.log(result)
                return result
            } catch (error) {
                throw new Error(`Failed to get all people: ${error}`)
            }
        }
    },
    Person: {
        tags: async(person) => {
            try {
                const db = await DbConnection.Get()
                const Areas = db.collection('areas')
                if(person.tags) return await Areas.find({_id: {$in: person.tags.map(areaid => {return new ObjectId(areaid)})}}).toArray()
                else return []
            }
             catch (error) {
                return []
            }
        }
    },
    Mutation: {
        createPerson: async(_, {person}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
            try {
                const db = await DbConnection.Get()
                const profileid = await getprofileid(req.session)
                person.profileid = profileid
                await db.collection('people').insertOne(person)
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
                const profileid = await getprofileid(req.session)
                const id = args.personid
                const updates = args.updates
                updates.profileid = profileid
                await db.collection('people').findOneAndUpdate(
                    { _id: new ObjectId(id) },
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
                const profileid = await getprofileid(req.session)
                const id = args.personid
                await db.collection('people').findOneAndDelete({ _id: new ObjectId(id), profileid })
                return true
            } catch (error) {
                throw new Error(`Failed to delete person: ${error}`)
            }
        }
    }
}
