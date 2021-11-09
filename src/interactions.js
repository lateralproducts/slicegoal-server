import { ObjectId } from 'mongodb'
import { getprofileid, getuserid, getwheelid } from './users'

const PATH_URL = `${process.env.PATH_URL}`
const APP_PATH_URL = `${PATH_URL}/app`

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

export async function newIx({from, to, type, data}){
    const db = await DbConnection.Get()
    const Interactions = db.collection('interactions')
    let ix = new Object()
    ix.to = to //userid
    ix.from = from //userid
    ix.type = type //eg. shareinsight
    ix.data = data
    ix.triggered = new Date()
    return (await Interactions.insertOne(ix)).insertedId.toString()
}

export async function updateIx({ixid, from, to, type, status, action, channel}){
    const db = await DbConnection.Get()
    const Interactions = db.collection('interactions')
    let fields = new Object()
    fields.googleid = args.googleid
    if(status) fields.status = status
    if(action) fields.action = action
    Interactions.update(
        { _id: ixid },
        {
            $set: fields,
            $push: {
                history: {
                    time: new Date(),
                    result: args.marked,
                    check: args.check
                }
            }
        },
    )
}

