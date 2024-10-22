import DbConnection from './database'
import { emailDailyMorning, emailDailySummary, emailStats, emailWeeklySummary } from './emails'
import { botips, getEndDateFromWeek, getStartDateFromWeek, getWeekNumber, getWeekYear, ignoreips, startOfDay, startOfDayTZ } from '../util/functions';
import { ObjectId } from 'mongodb';
import { wheelidfromprofileid } from './areas';
import { getGoals } from './goals';

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
        email:{$nin:[null,"test@slicegoal.com","daniel@lateralproducts.com", "daniel@slicegoal.com"]}
    }).toArray()
    stats.push({metric: "active users", measure: activesessions.length, notes: activesessions.map(session => { return session.email + ' : ' + session.screenwidth + 'px' })})

    fromdate.setHours(fromdate.getHours() + 11) //adjust +11 hours for Aus time. Server on UTC.

    //send email...
    var title =  'Stats for ' + fromdate.getDate()  + "-" + (fromdate.getMonth()+1) + "-" + fromdate.getFullYear()
    to.map(email => emailStats( email, stats, title ))
}

export async function dailyafternoonemail() {
    const db = await DbConnection.Get()
    const Users = db.collection('users')
    const Missions = db.collection('missions')
    const Profiles = db.collection('profiles')
    const AggDay = db.collection('aggday')
    //const Tasks = db.collection('tasks')

    const userids = ["64d6a5338fe6f205016bc8b1", "5d2adcf120f52b0d7d7faba0"]
    userids.map(async(userid) => {
        const user = await Users.findOne({_id: new ObjectId(userid)})
        if (user){
            const profiles = await Profiles.find({user: userid}).toArray()
            const profileid = profiles[0]._id.toString() //change this later.
            const mission = await Missions.findOne({profileid: profileid, date: startOfDay(today)})
            //const tasks = await Tasks.find({profileid: profileid, starttime: startOfDay(today)}).toArray()
            //const goals = await getGoals({profileid: profileid}) //top level goals

            let today = new Date() //get day data.
            let yesterday = new Date() //get yesterday's date
            yesterday.setDate(yesterday.getDate() - 1)

            const day = today.getDate()
            const month = today.getMonth() + 1
            const year = today.getFullYear()

            //get today's data
            const dailydata = await AggDay.find({
                day: day,
                month: month,
                year: year
            }).toArray()

            //get previous day's data for comparison.
            const daybeforedata = await AggDay.find({
                day: yesterday.getDate(),
                month: yesterday.getMonth() + 1,
                year: yesterday.getFullYear()
            }).toArray()

            const returned = await Promise.all(dailydata.map(async(daily) => {
                if (daily.userid === userid){
                    // Find the corresponding data for the previous day
                    const previousDayData = daybeforedata.find(data => data.userid === userid) || new Object() //if no data, then create an empty object to reference 0 for comparison.
                    const daydatacomparison = calculateDeltaAndPercentageDelta(daily, previousDayData)
                    daily.date = yesterday
        
                    const wheelid = await wheelidfromprofileid({profileid: daily.profileid})
        
                    const areapercentages = await calculateWeekAreaPercentages({wheelid: wheelid, userid: daily.userid, week: getWeekNumber(yesterday), year: getWeekYear(yesterday)})
                    const areapercent = areapercentages.map(area => {return { area: area.name, focus: area.focus, percentage: area.percentage }})
                    return {daydatacomparison, daily, areapercent}
                }
                
            }))
            if (returned) emailDailySummary(user, returned[0].daydatacomparison, returned[0].daily, returned[0].areapercent, mission ? mission.mission : null)
        }
    })

}

export async function dailymorningemail() {
    const db = await DbConnection.Get()
    const Users = db.collection('users')
    const Missions = db.collection('missions')
    const Profiles = db.collection('profiles')
    const Tasks = db.collection('tasks')

    let today = new Date()

    const userids = ["64d6a5338fe6f205016bc8b1", "5d2adcf120f52b0d7d7faba0"]
    userids.map(async(userid) => {
        const user = await Users.findOne({_id: new ObjectId(userid)})
        if (user){
            const profiles = await Profiles.find({user: userid}).toArray()
            const profileid = profiles[0]._id.toString() //change this later.
            const mission = await Missions.findOne({profileid: profileid, date: startOfDayTZ({datetime: today, timezoneOffset: 11})})
            const tasks = await Tasks.find({profileid: profileid, starttime: startOfDayTZ({datetime: today, timezoneOffset: 11})}).toArray()
            const goals = await getGoals({profileid: profileid}) //top level goals
            emailDailyMorning({user, mission, tasks, goals})
        }
    })
}

export async function weeklysummaryemail() {
    const db = await DbConnection.Get()
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
            weekly.profileid

            // Find the corresponding data for the previous week
            const previousWeekData = weekbeforedata.find(data => data.userid === weekly.userid) || new Object() //if no data, then create an empty object to reference 0 for comparison.
            const weekdatacomparison = calculateDeltaAndPercentageDelta(weekly, previousWeekData)
            
            weekly.startday = getStartDateFromWeek(week, year)
            weekly.endday = getEndDateFromWeek(week, year)

            const wheelid = await wheelidfromprofileid({profileid: weekly.profileid})

            const areapercentages = await calculateWeekAreaPercentages({wheelid: wheelid, userid: weekly.userid, week, year})
            const areapercent = areapercentages.map(area => {return { area: area.name, focus: area.focus, percentage: area.percentage }})
            .sort((a, b) => b.percentage - a.percentage)

            const user = await Users.findOne({email: "daniel@lateralproducts.com"})
            emailWeeklySummary(user, weekdatacomparison, weekly, areapercent)
        }

    })
}

export function calculateDeltaAndPercentageDelta(currentData, previousData) {
    //calculate the delta and percentage delta for each metric and present as structured data like logcount: {value, delta, percentageDelta}
    let keys = [
        ['logcount', 'Number of Logs'],
        ['logtime', 'Time Logged'],
        ['goalcount', 'Goals Completed'],
        ['goaltime', 'Time on Goals'],
        ['messagetotal', 'Messages Sent'],
        ['taskcreated', 'Tasks Created'],
        ['alreadydone', 'Tasks Already Done'],
        ['taskcopied', 'Tasks Copied'],
        ['taskcompleted', 'Tasks Completed'],
        ['taskcompletedgoal', 'Tasks Completed with Goal'],
        ['taskrescheduled', 'Tasks Rescheduled'],
        ['taskreopened', 'Tasks Reopened'],
        ['taskpriorityadded', 'Tasks Added to Priority List'],
        ['newinsight', 'New Insights'],
        ['newsource', 'New Sources'],
        ['impressions', 'Impressions'],
        ['highlights', 'Highlights']
    ];
    const delta = {};
    const percentageDelta = {};

     keys.forEach(key => {
        delta[key[0]] = (currentData[key[0]] || 0) - (previousData[key[0]] || 0);
        percentageDelta[key[0]] = calculatePercentageDelta(currentData[key[0]], previousData[key[0]]);
    }); 

    const structuredData = [];
    keys.forEach(key => {
        const isNegative = delta[key[0]] < 0;
        //if(isNegative) console.log('key' + key)
        structuredData.push({
            value: currentData[key[0]] || 0,
            delta: (isNegative?"":"+") + delta[key[0]], //a plus sign for positive deltas
            percentageDelta: (isNegative?"":"+") + percentageDelta[key[0]], //a plus sign for positive deltas
            isNegative: isNegative,
            description: key[1]
        });
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

export async function calculateWeekAreaPercentages({wheelid, userid, week, year}) {
    const db = await DbConnection.Get()
    const Areas = db.collection('areas')
    const Wheels = db.collection('wheels')
    const AreaLinks = db.collection('arealinks')
    const AreaWeekAggregate = db.collection('aggareaweek')

    const wheel = await Wheels.findOne({_id: new ObjectId(wheelid)})

    const query = {
        rootarea: wheel.startarea.toString(), //using parent ID from Area object on Graph. No need for global boolean on AreaLink for now.
        wheelid: wheelid
    }
    const arealinks = await AreaLinks.distinct('area', query)

    const areas = await Areas.find({
        _id: {
            $in: arealinks.map(function(id) {
                return new ObjectId(id)
            })
        }
    }).toArray() 
    

    const weekdata = await AreaWeekAggregate.find({
        wheelid: wheelid,
        week: week,
        year: year,
        area: { $in: arealinks.map(function(id) { return new ObjectId(id) })},
        userid: userid
    }).toArray()

    const totalLogTime = weekdata.reduce((sum, data) => sum + (data.logtime || 0), 0); 

/*     const weekbefore = new Date()
    weekbefore.setDate(weekbefore.getDate() - 7)

    const weekbeforedata = await AreaWeekAggregate.find({
        week: getWeekNumber(weekbefore),
        year: getWeekYear(weekbefore),
        area: { $in: arealinks.map(function(id) {
            return new ObjectId(id)            
        })}, 
        userid: userid
    }).toArray() */

    const result = areas.map(area => {
        const areaData = weekdata.find(data => data.area.toString() === area._id.toString()) || new Object()
        /* const previousAreaData = weekbeforedata.find(data => data.area.toString() === area._id.toString()) || new Object()
        const weekdatacomparison = calculateDeltaAndPercentageDelta(areaData, previousAreaData) */
        area.percentage = Math.round(((areaData.logtime || 0) / totalLogTime)* 100) || 0
        area.time = areaData.logtime || 0
        //area.weekdatacomparison = weekdatacomparison
        return area
    })

    return result
}
