import { ObjectId } from 'mongodb' 
import DbConnection from './database'
import { getprofileid } from './users'

export const schema = `
    type Person {
        _id: String
        name: String
        dob: Int
        profileid: String
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
                const profileid = await getprofileid(req.session)
                const id = args.id
                const result = await db.collection('people').findOne({ _id: ObjectId(id), profileid })
                return result
            } catch (error) {
                throw new Error(`Failed to get person by ID: ${error}`)
            }
        },

        getPersonById: async(_, args, { req }) => {
            try {
                const db = await DbConnection.Get()
                const profileid = await getprofileid(req.session)
                const id = args.id
                const result = await db.collection('people').findOne({ _id: ObjectId(id), profileid })
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
    Mutation: {
        createPerson: async(_, {person}, { req }) => {
            if (req.session.user.email === "daniel@lateralproducts.com"){
            try {
                const db = await DbConnection.Get()
                const profileid = await getprofileid(req.session)
                person.profileid = profileid
                const result = await db.collection('people').insertOne(person)
                console.log(result)

                /* if (args.areatags)
                    //if there are area tags, save the area tags
                    args.areatags.map(async link => {
                        let areaid = link.area._id
                        if (!areaid) {
                            //if area doesn't exist, create it.
                            let area = {
                                name: link.name,
                                wheelid: newinsight.wheelid
                                    ? newinsight.wheelid
                                    : getwheelid(req.session),
                                serverversion: pjson.version,
                                uiversion: getuiversion(req.session),
                                created: new Date()
                            }
        
                            const res = await Areas.insertOne(area)
                            areaid = res.insertedId
                        }
        
                        let insighttag = new Object()
                        insighttag.insightid = result.insertedId.toString()
                        insighttag.profileid = newinsight.profileid
                        insighttag.area = areaid
                        insighttag.notes = link.notes
                        insighttag.datecreated = new Date()
                        insightTags.insertOne(insighttag)
        
                        Areas.updateOne(
                            {
                                wheelid: newinsight.wheelid
                                    ? newinsight.wheelid
                                    : getwheelid(req.session),
                                _id: new ObjectId(areaid)
                            },
                            { $inc: { tagged: 1 }, $set: { lasttagged: new Date() } },
                        )
                    }) */

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
                const profileid = await getprofileid(req.session)
                const id = args.personid
                const result = await db.collection('people').findOneAndDelete({ _id: ObjectId(id), profileid })
                return true
            } catch (error) {
                throw new Error(`Failed to delete person: ${error}`)
            }
        }
    }
}
