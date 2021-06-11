import { MongoClient } from "mongodb"

var DbConnection = () => {

    var db = null;
    async function DbConnect() {
        var MONGO_URL = `${process.env.MONGODB_URL}`;
        console.log("attempting to open server: " + MONGO_URL);
        let _db = await MongoClient.connect(MONGO_URL);
        return _db
}

    async function Get() {

        if (db != null) {
            return db;
        } else {
            db = await DbConnect();
            console.log("connected now for the dbs");

            return db; 
        }
    }

    return {
        Get: Get
    }
}

export default DbConnection();