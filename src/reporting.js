import DbConnection from './database'
import { emailStats } from './emails'

export async function createreport(to,fromdate,todate){
    const db = await DbConnection.Get()
    const Sessions = db.collection('sessions')

    var stats = [] //{metric, measure}

    //Landed and bouncing. With no campaign.
    const websitelanded = await Sessions.find({
        'pages.1': {$exists: true}, 
        'campaign.campaign': {$exists: false},
        email: null,
        landed: {$gte: fromdate, $lt: todate},
        landedip:{$nin:[/.*66.249.*./, /.*115.70.*./, /.*85.76.*./, /.*72.14.*./, /.*114.119.*./, /.*17.121.*./, /.*122.199.*./]}
    }).toArray()
    stats.push({metric: "website landed", measure: websitelanded.length})

    //Campaign landed and bouncing.
    const campaignlanded = await Sessions.find({
        'pages.1': {$exists: true}, 
        'campaign.campaign': {$exists: true},
        email: null,
        landed: {$gte: fromdate, $lt: todate},
        landedip:{$nin:[/.*66.249.*./, /.*115.70.*./, /.*85.76.*./, /.*72.14.*./, /.*114.119.*./, /.*17.121.*./, /.*122.199.*./]}
    }).toArray()
    stats.push({metric: "website landed campaign", measure: campaignlanded.length})

    //Website Sessions (without Sessions) -  Sessions without Email
    const websitesessions = await Sessions.find({
        'pages.2': {$exists: true}, //not bouncing. Opening more than one page.
        email: null,
        landed: {$gte: fromdate, $lt: todate},
        landedip:{$nin:[/.*66.249.*./, /.*115.70.*./, /.*85.76.*./, /.*72.14.*./, /.*114.119.*./, /.*17.121.*./, /.*122.199.*./]}
    }).toArray()
    stats.push({metric: "website sessions", measure: websitesessions.length})

    //New Signups - Sessions with Signup
    const newsignups = await Sessions.find({
        'pages.action':'signup',
        landed: {$gte: fromdate, $lt: todate}
    }).toArray()
    stats.push({metric: "signups", measure: newsignups.length})

    //Active Users - Sessions with Emails - have logged in.
    const activesessions = await Sessions.find({
        'pages.action':'emaillogin',
        'pages.action':'googlelogin',
        landed: {$gte: fromdate, $lt: todate},
        email:{$nin:[null,"test@cavestep.com","daniel@lateralproducts.com", "daniel@cavestep.com", "calebschrader@hotmail.com"]}
    }).toArray()
    stats.push({metric: "active users", measure: activesessions.length})

    fromdate.setHours(fromdate.getHours() + 11) //+ 11 hours for Aus time

    //send email...
    var title =  'Stats for ' + fromdate.getDate()  + "-" + (fromdate.getMonth()+1) + "-" + fromdate.getFullYear()
    to.map(email => emailStats( email, stats, title ))
}
