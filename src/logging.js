import DbConnection from './database'

export async function log(args) {
    try {
        const db = await DbConnection.Get()
        const Logging = db.collection('logging')

        if(args && args.message) {
            if (args.type === 'console') {
                console.log(args.message)
            }
            
            let lg = {}
            if (args.type) lg.type = args.type
            if (args.source) lg.source = args.source
            if (args.message) lg.message = args.message
            lg.date = new Date()
            
            Logging.insertOne(lg)
            return 
        }
        else {
            const lg = {
                message: args,
                date: new Date()
            }
            Logging.insertOne(lg)
            return
        }
    } catch (error) {
        console.log('Error with logging:', error.message)
        return
    }
}