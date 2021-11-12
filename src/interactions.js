import DbConnection from './database'
import { shareInsightEmail } from './emails'
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

export async function newIx(from, to, type, insight, sharenote){
    const db = await DbConnection.Get()
    const Interactions = db.collection('interactions')
    let ix = new Object()
    ix.to = to._id.toString() //userid
    ix.from = from._id.toString() //userid
    ix.type = type //eg. shareinsight
    ix.data = insight
    ix.triggered = new Date()
    ix.status = 'pending'
    ix.history = [{
        time: new Date(),
        action: 'triggered',
        channel: 'app'}]
    const interactionid = (await Interactions.insertOne(ix)).insertedId.toString()

    if(to.state === 'verified'){
        // Existing verified user
        shareInsightEmail(
            insight,
            from,
            to,
            sharenote,
            `${APP_PATH_URL}?sharedinsights=active`,
            interactionid
        )
    } else {
        // Existing but unverified user
        shareInsightEmail(
            insight,
            from,
            to,
            sharenote,
            `${APP_PATH_URL}?page=verify&user=${targetUser._id}&code=${targetUser.code}&sharedinsights=active`,
            interactionid
        )
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

