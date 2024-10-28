import DbConnection from './database'

export async function log(args) {
    const db = await DbConnection.Get()
    const Logging = db.collection('logging')

    if(args && args.message) {
        if (args.type === 'info') {
            console.log(args.message)
            return
        }
        else {
            let lg = {}
            if (args.type) lg.type = args.type
            if (args.source) lg.source = args.source
            if (args.message) lg.message = args.message
            lg.date = new Date()
            
            Logging.insertOne(lg)
            return 
        }
    }
    else {
        const lg = {
            message: args,
            date: new Date()
        }
        Logging.insertOne(lg)
        return
    }
}