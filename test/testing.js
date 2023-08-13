import DbConnection from '../src/database'
import { ObjectId } from 'mongodb' 

export async function newtest(userid) {
    const db = await DbConnection.Get()
    const Users = db.collection('users')
    const user = await Users.findOne({
        _id: new ObjectId(userid)
    })
    return user
}