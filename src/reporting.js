import DbConnection from './database'
import { emailStats } from './emails'

export async function createreport(to,fromdate,todate){
    const db = await DbConnection.Get()
    const Sessions = db.collection('sessions')

    var stats = []

    //Website Sessions (without Sessions) -  Sessions without Email
    const websitesessions = await Sessions.find({
        'pages.2': {$exists: true}, //not bouncing. Opening more than one page.
        email: null,
        landed: {$gte: fromdate, $lt: todate},
        landedip:{$nin:[/.*66.249.*./, /.*115.70.*./, /.*85.76.*./, /.*72.14.*./, /.*114.119.*./, /.*17.121.*./, /.*122.199.*./]}
    }).toArray()
    console.log(websitesessions.length)

    stats.push({metric: "website sessions", measure: websitesessions.length})
    //email:{$nin:["test@cavestep.com","daniel@lateralproducts.com", "daniel@cavestep.com", "calebschrader@hotmail.com"]}}
    //landedip:{$nin:[/.*66.249.*./, /.*115.70.*./, /.*85.76.*./, /.*72.14.*./, /.*114.119.*./, /.*17.121.*./, /.*122.199.*./]}

    //New Signups - Sessions with Signup
    //{'pages.action':'signup'}
    const newsignups = await Sessions.find({
        'pages.action':'signup',
        landed: {$gte: fromdate, $lt: todate}
    }).toArray()
    console.log(newsignups.length)
    stats.push({metric: "signups", measure: newsignups.length})

    //Active Users - Sessions with Emails - have logged in.
    const activesessions = await Sessions.find({
        'pages.action':'emaillogin',
        'pages.action':'googlelogin',
        landed: {$gte: fromdate, $lt: todate},
        email:{$nin:[null,"test@cavestep.com","daniel@lateralproducts.com", "daniel@cavestep.com", "calebschrader@hotmail.com"]}
    }).toArray()
    console.log(activesessions.length)
    stats.push({metric: "active users", measure: activesessions.length})
    //{'pages.action':'emaillogin','pages.action':'googlelogin'}
    //{email:{$nin:[null,"test@cavestep.com","daniel@lateralproducts.com", "daniel@cavestep.com", "calebschrader@hotmail.com"]}}

    //{_id:"$campaign.ad", count: { $sum : 1 }}

    //email...
    var title =  'Stats for ' + fromdate.getDate()  + "-" + (fromdate.getMonth()+1) + "-" + fromdate.getFullYear()
    to.map(email => emailStats( email, stats, title ))
}
