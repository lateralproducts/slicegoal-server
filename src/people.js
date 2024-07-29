import { ObjectId } from 'mongodb' 
import DbConnection from './database'
import { getprofileid } from './users'
import { attachAreas } from './sources'
import { triggererror } from './graphqlserver'

export const schema = `
    type Person {
        _id: String
        name: String
        notes: String
        tags: [InsightTag]
    }

    input PersonInput {
        _id: String
        name: String
        notes: String
    }
`

export const typeDefs = `
    extend type Query {
        getPersonById(personid: String!): Person
        getAllPeople: [Person]
        personInsights(personid: String!): [InsightTag]
    }

    extend type Mutation {
        createPerson(person: PersonInput!, areatags: [AreaTagIn]): Boolean
        updatePerson(personid: String!, updates: PersonInput!, areatags: [AreaTagIn]): Boolean
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

        getPersonById: async(_, { personid }, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileid = await getprofileid(req.session)
                const result = await db.collection('people').findOne({ _id: new ObjectId(personid), profileid })
                return result
            } catch (error) {
                console.log(error)
                return triggererror(`Failed to get person by ID`)
            }
        },

        getAllPeople: async(_, args, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileid = await getprofileid(req.session)
                const result = await db.collection('people').find({ profileid }).sort({lasttagged: -1, created: -1}).toArray()
                return result
            } catch (error) {
                console.log(error)
                return triggererror(`Failed to get all people.`)
            }
        }
    },
    Person: {
        tags: async(person, _, { req }) => {
            try {
                const db = await DbConnection.Get()
                const Tags = db.collection('insighttags')
                const tags = await Tags.find({
                    area: {$ne: null}, //only return area tags
                    personid: person._id.toString(),
                    profileid: getprofileid(req.session)
                }).toArray()
                return tags
            }
             catch (error) {
                console.log(error)
                return []
            }
        }
    },
    Mutation: {
        createPerson: async(_, {person, areatags}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
            try {
                const db = await DbConnection.Get()
                const profileid = await getprofileid(req.session)
                person.profileid = profileid
                person.created = new Date()
                person.lasttagged = new Date()
                const personid = (await db.collection('people').insertOne(person)).insertedId.toString()
                attachAreas(areatags, {personid: personid}, profileid, req) 
                return true
            } catch (error) {
                console.log(error)
                return triggererror('Failed to create person')
            }
        } else { 
            return triggererror('Failed to create person') 
        }
        },

        updatePerson: async(_, {personid, updates, areatags}, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileid = await getprofileid(req.session)
                updates.profileid = profileid
                await db.collection('people').findOneAndUpdate(
                    { _id: new ObjectId(personid) },
                    { $set: updates },
                    { returnOriginal: false }
                )
                attachAreas(areatags, {personid: personid}, profileid, req) 
                return true
            } catch (error) {
                console.log(error)
                return triggererror(`Failed to update person.`)
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
                console.log(error)
                return triggererror(`Failed to delete person.`)
            }
        }
    }
}
