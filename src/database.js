import { MongoClient } from 'mongodb'
import { log } from './logging'

let DbConnection = () => {
    let db = null
    async function DbConnect() {
        let MONGO_AUTH = process.env.MONGODB_PWD ? `${process.env.MONGODB_USR}:${process.env.MONGODB_PWD}@` : ''
        let MONGO_URL = `mongodb://${MONGO_AUTH}${process.env.MONGODB_URL}`
        let client = await MongoClient.connect(MONGO_URL)
        var _db = client.db(`${process.env.MONGODB_DB}`);
        return _db
    }

    async function Get() {
        if (db != null) {
            return db
        } else {
            db = await DbConnect()
            log({type: 'info', message:'connected to db'})
            return db
        }
    }

    return {
        Get: Get,
    }
}

export default DbConnection()
