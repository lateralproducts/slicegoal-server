import DbConnection from './database'
import { ObjectId } from 'mongodb'

export const typeDefs = `
  extend type Query {
    interactions(): [Interaction]
  }

  extend type Mutation {
    
  }
`

export const schema = `
    type Interaction {
        _id: String
        from: String
        to: String
        triggered: String
        interaction: String
        status: String
        liked: Boolean
        thanked: Boolean
        history: [Status]
    }

    type Status {
        status: String
        action: String
        channel: Channel
        datetime: String
    }
`

export async function newIx(from, to, type, content, message){
    try {
        const db = await DbConnection.Get()
        const Interactions = db.collection('interactions')
        let ix = new Object()
        ix.to = to //userid
        ix.from = from //userid
        ix.type = type //eg. shareinsight
        ix.content = content
        ix.message = message
        ix.triggered = new Date()
        ix.status = 'pending'
        ix.history = [{time: new Date(), action: 'triggered', channel: 'app'}]
        return await Interactions.insertOne(ix)
    } catch (error) {
        console.log(error)
    }
}

export async function updateIx(ixid, status, action, channel){
    const db = await DbConnection.Get()
    const Interactions = db.collection('interactions')
    let fields = new Object()
    if(status) fields.status = status
    try {
        Interactions.update(
            { _id: ObjectId(ixid) },
            {
                $set: fields,
                $push: {
                    history: {
                        time: new Date(),
                        action: action,
                        channel: channel
                    }
                }
            },
        )
    } catch (error) {
        console.log("error logging ix update - " + error)
    }
}

