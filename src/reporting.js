import DbConnection from './database'
import { emailStats } from './emails'
import { botips, ignoreips } from '../util/functions';

export async function createreport(to,fromdate,todate){
    const db = await DbConnection.Get()
    const Sessions = db.collection('sessions')

    var stats = [] //{metric, measure}

    //filtering bot ips, and my ip from stats.
    var filterips = botips //ignore bot ips
    filterips.push(ignoreips) //ignore my ip too

    //Landed and bouncing. With no campaign.
    const websitelanded = await Sessions.find({
        'pages.1': {$exists: true}, //making sure we're only counting when someone has landed and also exists, as we get another action.
        'querydata.utm_campaign': {$exists: false},
        landed: {$gte: fromdate, $lt: todate},
        landedip: {$nin: filterips}
    }).toArray()
    stats.push({metric: "website landed", measure: websitelanded.length, notes: websitelanded.map(session => { return session.screenwidth + 'px' })})

    //Campaign landed and bouncing.
    const campaignlanded = await Sessions.find({
        'pages.1': {$exists: true}, 
        'querydata.utm_campaign': {$exists: true}, //reading the data where a campaign exists.
        landed: {$gte: fromdate, $lt: todate},
        landedip: {$nin: filterips}
    }).toArray()
    stats.push({metric: "website landed campaign", measure: campaignlanded.length, notes: campaignlanded.map(session => { return session.screenwidth + 'px' })})

    //Website Sessions (without Sessions) -  Sessions without Email
    const websitesessions = await Sessions.find({
        'pages.2': {$exists: true}, //not bouncing. Opening more than one page. Either campaign attribution or not.
        landed: {$gte: fromdate, $lt: todate},
        landedip: {$nin: filterips}
    }).toArray()
    stats.push({metric: "website sessions", measure: websitesessions.length, notes: websitesessions.map(session => { return session.screenwidth + 'px' })})

    //New Leads - Downloaded Lead Magnet
    const newleads = await Sessions.find({
        'pages.page':'/offer/building-habits/success',
        landed: {$gte: fromdate, $lt: todate},
        landedip: {$nin: filterips}
    }).toArray()
    stats.push({metric: "leads", measure: newleads.length, notes: newleads.map(session => { return session.email + ' : ' + session.screenwidth + 'px' })})


    //New Signups - Sessions with Signup
    const newsignups = await Sessions.find({
        'pages.action':'signup-success',
        landed: {$gte: fromdate, $lt: todate}
    }).toArray()
    stats.push({metric: "signups", measure: newsignups.length, notes: newsignups.map(session => { return session.email + ' : ' + session.screenwidth + 'px' })})

    //Active Users - Sessions with Emails - have logged in.
    const activesessions = await Sessions.find({
        'pages.action':'login-success', //old code: 'emaillogin' or 'googlelogin'
        landed: {$gte: fromdate, $lt: todate},
        email:{$nin:[null,"test@cavestep.com","daniel@lateralproducts.com", "daniel@cavestep.com"]}
    }).toArray()
    stats.push({metric: "active users", measure: activesessions.length, notes: activesessions.map(session => { return session.email + ' : ' + session.screenwidth + 'px' })})

    fromdate.setHours(fromdate.getHours() + 11) //adjust +11 hours for Aus time. Server on UTC.

    //send email...
    var title =  'Stats for ' + fromdate.getDate()  + "-" + (fromdate.getMonth()+1) + "-" + fromdate.getFullYear()
    to.map(email => emailStats( email, stats, title ))
}
