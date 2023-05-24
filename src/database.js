import { MongoClient } from 'mongodb'

let DbConnection = () => {
    let db = null
    async function DbConnect() {
        let MONGO_AUTH = process.env.MONGODB_PWD ? `${process.env.MONGODB_USR}:${process.env.MONGODB_PWD}@` : ''
        let MONGO_URL = `mongodb://${MONGO_AUTH}${process.env.MONGODB_URL}`
        console.log('attempting to open server: ' + `${process.env.MONGODB_URL}` + ' with auth')
        let _db = await MongoClient.connect(MONGO_URL)
        return _db
    }

    async function Get() {
        if (db != null) {
            return db
        } else {
            db = await DbConnect()
            console.log('connected to db')

            return db
        }
    }

    return {
        Get: Get,
    }
}

export default DbConnection()
