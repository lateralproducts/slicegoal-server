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

export async function newIx({from, to, type, message, insightid, sourceid, fileid, profileid}){
    try {
        const db = await DbConnection.Get()
        const Interactions = db.collection('interactions')
        let ix = new Object()
        ix.to = to //userid
        ix.from = from //userid
        ix.type = type //eg. shareinsight
        ix.message = message
        ix.triggered = new Date()
        ix.status = 'pending'

        if(insightid) ix.insightid = insightid
        if(sourceid) ix.sourceid = sourceid
        if(fileid) ix.fileid = fileid
        if(profileid) ix.profileid = profileid

        ix.history = [{time: new Date(), action: 'triggered', channel: 'app'}]
        
        return await Interactions.insertOne(ix)
    } catch (error) {
        console.log(error)
    }
}

export async function updateIx(ixid, status, action, channel, ip){
    const db = await DbConnection.Get()
    const Interactions = db.collection('interactions')
    let fields = new Object()
    if(status) fields.status = status
    try {

        const result = await Interactions.findOneAndUpdate(
            { _id: new ObjectId(ixid) },
            {
                $set: fields,
                $push: {
                    history: {
                        time: new Date(),
                        action: action,
                        channel: channel,
                        ip: ip
                    }
                }
            },
            {upsert: true} //if the interaction doesn't already exist, create it.
        )
        console.log(result)
        return (result !== null)
    } catch (error) {
        console.log("error logging ix update - " + error)
    }
}

export async function getIxFile(ixid){
    const db = await DbConnection.Get()
    const Interactions = db.collection('interactions')
    try {
        const interaction = await Interactions.findOne({ _id: new ObjectId(ixid) })
        if (interaction) return interaction.to + '/' + interaction.fileid
        else return null
    } catch (error) {
        console.log("error logging ix update - " + error)
    }
}

