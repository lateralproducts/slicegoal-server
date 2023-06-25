import bcrypt from 'bcryptjs'
import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';

import DbConnection from './database'
const pjson = require('../package.json')


export async function createUserConnection(user, friendemail, eventtype, eventid) {
    const db = await DbConnection.Get()
    const Users = db.collection('users')

    const friendid = await Users.findOne({email: friendemail})
        .then(result => {
            // If user needs to be created
            if(!result){
                //create user
                const date = new Date()
                const newUser = {
                    email: friendemail,
                    code: bcrypt.hashSync(date.toString(), 7),
                    serverversion: pjson.version,
                    state: 'new',
                    created: date
                }
                return Users.insertOne(newUser)
                    .then(result => {
                        if(result.insertedCount===1) return result.insertedId.toString()
                    })
            }
            else 
                return result._id.toString()
        })

    addCommunityConnection(user._id.toString(), friendid)
        .then(result => {
            if(result)
                addCommunityInteraction(user._id.toString(), friendid, eventtype, eventid)
        })

    // Add connection in opposite way (friend with user)
    addCommunityConnection(friendid, user._id.toString())

}

async function addCommunityConnection(userid, friendid) {
    const db = await DbConnection.Get()
    const Community = db.collection('community')

    return Community.findOne({user: userid, friend: friendid})
        .then(connection => {
            if(!connection) {
                return Community.insertOne({
                    user: userid,
                    friend: friendid, 
                    datetimecreated: new Date(),
                    events: []
                })
            }
            else return connection
        })
}

async function addCommunityInteraction(userid, friendid, eventtype, eventid) {
    const db = await DbConnection.Get()
    const Community = db.collection('community')


    //remove once interaction complete.
    //attaching interaction to community connection
    return await Community.findOne({user: userid, friend: friendid})
        .then(connection => {
            if(!connection) {
                return addCommunityConnection(userid, friendid)
            } 
            else return connection._id.toString()
        })
        .then(connectionid => {

            return Community.updateOne(
                {_id: ObjectId(connectionid)},
                {$push: {events: {
                    type: eventtype,
                    id: eventid,
                    datetime: new Date()
                    }
                }}
            )
            .then(result => {
                if(result.acknowledged) return true
                else return false
            })
        })
}
