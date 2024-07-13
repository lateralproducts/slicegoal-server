import DbConnection from './database'
import { emailStats, emailWeeklySummary } from './emails'
import { botips, getEndDateFromWeek, getStartDateFromWeek, getWeekNumber, getWeekYear, ignoreips } from '../util/functions';

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

export async function weeklysummaryemail() {
    const db = await DbConnection.Get()
    //const Profiles = db.collection('profiles')
    //const RankTimes = db.collection('ranktimes')
    const Users = db.collection('users')
    const AggWeek = db.collection('aggweek')

    //get last week's date
    let yesterday = new Date() //email triggered on monday so use yesterday (So we can get the last week's data)
    yesterday.setDate(yesterday.getDate() - 1)

    const week = getWeekNumber(yesterday)
    const year = getWeekYear(yesterday)

    const weeklydata = await AggWeek.find({
        week: week,
        year: year
    }).toArray()

    //need to consider the end of the year and change of weeks/year.
    let weekbefore = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() - 7);

    //get previous week's data for comparison.
    const weekbeforedata = await AggWeek.find({
        week: getWeekNumber(weekbefore),
        year: getWeekYear(weekbefore),
    }).toArray()

    weeklydata.map(async(weekly) => {
        if (weekly.userid === "64d6a5338fe6f205016bc8b1" || weekly.userid === "5d2adcf120f52b0d7d7faba0"){
            const user = await Users.findOne({email: "daniel@lateralproducts.com"})
            // Find the corresponding data for the previous week
            const previousWeekData = weekbeforedata.find(data => data.userid === weekly.userid) || new Object() //if no data, then create an empty object to reference 0 for comparison.
            const weekdatacomparison = calculateDeltaAndPercentageDelta(weekly, previousWeekData)
            
            weekly.startday = getStartDateFromWeek(week, year)
            weekly.endday = getEndDateFromWeek(week, year)

            emailWeeklySummary(user, weekdatacomparison, weekly)
        }

    })
}

export function calculateDeltaAndPercentageDelta(currentData, previousData) {
    //calculate the delta and percentage delta for each metric and present as structured data like logcount: {value, delta, percentageDelta}
    let keys = ['logcount', 'logtime', 'goalcount', 'goaltime', 'messagetotal', 'rankcount', 'ranktime', 'taskcreated', 'alreadydone', 'taskcopied', 'taskcompleted', 'taskcompletedgoal', 'taskrescheduled', 'taskreopened', 'tasksnoozed', 'taskpriorityadded'];
    const delta = {};
    const percentageDelta = {};

    keys.forEach(key => {
        delta[key] = (currentData[key] || 0) - (previousData[key] || 0);
        percentageDelta[key] = calculatePercentageDelta(currentData[key], previousData[key]);
    });

    const structuredData = {};
    keys.forEach(key => {
        const isNegative = delta[key] < 0;
        //if(isNegative) console.log('key' + key)
        structuredData[key] = {
            value: currentData[key] || 0,
            delta: (isNegative?"":"+") + delta[key], //a plus sign for positive deltas
            percentageDelta: (isNegative?"":"+") + percentageDelta[key], //a plus sign for positive deltas
            isNegative: isNegative
        };
    });

    return structuredData;
}

function calculatePercentageDelta(currentValue, previousValue) {
    currentValue = currentValue || 0;
    previousValue = previousValue || 0;
    if (currentValue === 0 && previousValue === 0) {
        return 0;
    } else if (previousValue === 0) {
        return 100;
    } else if (currentValue === 0) {
        return -100;
    } else {
        return Math.round(((currentValue - previousValue) / previousValue) * 100);
    }
}
