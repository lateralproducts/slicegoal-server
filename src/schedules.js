import { ObjectId } from 'mongodb' 
import DbConnection from './database'
import { emailGoalNudge, emailRerankNudge, emailFunnel, reSendEmail, emailMessageNudge, emailWeeklySummary } from './emails'
import { createreport, dailyafternoonemail, dailymorningemail, weeklysummaryemail } from './reporting'
import { date2str, daylater, shiftTZ, startOfDay } from '../util/functions'
import { getunreadmessageusers } from './chat'
import { pushNotification } from './push'

let schedule = require('node-schedule')

console.log('✅ Node app started');
console.log('📋 Active jobs:', Object.keys(schedule.scheduledJobs));

const hard_coded_userids = ["6710df4f6ba00c0666607a8d", "5d2adcf120f52b0d7d7faba0"] //a8d is dev, ba0 is prod

schedule.scheduleJob({ minute: 45}, async function() { //15:00 UTC = 2:00am/1:00am, 20:30 UTC = 7:30am/6:30am Sydney/Melbourne time
    console.log('push notification test')
    //push notification
    //if there are tasks scheduled for today, send 1st task in list to the user, and link to day tasks.
    //if there are no tasks scheduled for today, send a push notification to the user to check in on their past tasks.
    try {
        const db = await DbConnection.Get()
        const Tasks = db.collection('tasks')

        const datetime = new Date() //time set from client argument
        const tzdatetime = shiftTZ({datetime: datetime, timezoneOffset: -11})
        const starttime = startOfDay(tzdatetime)
        const endtime = daylater(tzdatetime) // can retire this later if I want to migrate old DB records.

        let query = {}
        query.profile = { $in: hard_coded_userids }
        query.$or = [ //only return if complete not equal to true (or doesn't exist)
            {complete: null},
            {complete: false},
            {complete: {$exists: false}}
        ]

        query.$and = [ //only return if starttime is between starttime and endtime and snooze is null or snooze is in the past
            {'starttime': {$gte: starttime}},
            {'starttime': {$lt: endtime}},
            {$or: [
                {snooze: null},
                {snooze: {$exists: false}},
                {snooze: {$lt: new Date()}}
            ]}
        ]

        const tasks = await Tasks.find(query).toArray()

        if (tasks.length > 0) {
            console.log('scheduled task')
            pushNotification(
                'fJ7odiluI04AsQVnke5sSz:APA91bHj7xytmfiuBxjm7cvcfADVGgdrs8mhrHPfJvhnVbbj34C0rNrrHHxlBReyRuYYtjO-SczSxYvkdfno5zsvSGuO1UuZkQMMlYOSS4C1I7Urh_YF-1M',
                'Your tasks for today!',
                `${tasks[0].title}`,
                {url: '?rh=tasks&tnav=daytasklist'}
            )
        } else {
            console.log('no scheduled task')
            pushNotification(
                'fJ7odiluI04AsQVnke5sSz:APA91bHj7xytmfiuBxjm7cvcfADVGgdrs8mhrHPfJvhnVbbj34C0rNrrHHxlBReyRuYYtjO-SczSxYvkdfno5zsvSGuO1UuZkQMMlYOSS4C1I7Urh_YF-1M',
                'No tasks scheduled for today',
                'Do you need to reschedule past tasks?',
                {url: '?rh=tasks&tnav=past'}
            )
        }
    } catch (error) {
        console.error('Error in schedule:', error)
    }
})

schedule.scheduleJob({hour: 21, minute: 30}, async function() { //15:00 UTC = 2:00am/1:00am, 20:30 UTC = 7:30am/6:30am Sydney/Melbourne time
    //push notification.
    //Daily nudge to start the timer if there are tasks scheduled.
    try {
        const db = await DbConnection.Get()
        const Tasks = db.collection('tasks')

        const datetime = new Date() //time set from client argument
        const tzdatetime = datetime //shiftTZ({datetime: datetime, timezoneOffset: -11})
        const starttime = startOfDay(tzdatetime)
        const endtime = daylater(tzdatetime) // can retire this later if I want to migrate old DB records.

        let query = {}
        query.profile = { $in: hard_coded_userids }
        query.$or = [ //only return if complete not equal to true (or doesn't exist)
            {complete: null},
            {complete: false},
            {complete: {$exists: false}}
        ]

        query.$and = [ //only return if starttime is between starttime and endtime and snooze is null or snooze is in the past
            {'starttime': {$gt: starttime}},
            {'starttime': {$lte: endtime}},
            {$or: [
                {snooze: null},
                {snooze: {$exists: false}},
                {snooze: {$lt: new Date()}}
            ]}
        ]
        console.log(query)
        console.log(starttime)
        console.log(endtime)
        const tasks = await Tasks.find(query).toArray()
        console.log(tasks)

        if (tasks.length > 0) {
            pushNotification(
                'fJ7odiluI04AsQVnke5sSz:APA91bHj7xytmfiuBxjm7cvcfADVGgdrs8mhrHPfJvhnVbbj34C0rNrrHHxlBReyRuYYtjO-SczSxYvkdfno5zsvSGuO1UuZkQMMlYOSS4C1I7Urh_YF-1M',
                `${tasks[0].title}`,
                'Start the timer!',
                {url:  `?rh=timer&taskid=${tasks[0]._id}`}
            )
        }
    } catch (error) {
        console.error('Error in schedule:', error)
    }
})

schedule.scheduleJob({day: 1, hour: 24, minute: 0}, function() { //15:00 UTC = 2:00am/1:00am, 20:30 UTC = 7:30am/6:30am Sydney/Melbourne time
    //push notification.
    //Send a weekly reminder to check in on the top-level wheel.
    pushNotification(
        'fJ7odiluI04AsQVnke5sSz:APA91bHj7xytmfiuBxjm7cvcfADVGgdrs8mhrHPfJvhnVbbj34C0rNrrHHxlBReyRuYYtjO-SczSxYvkdfno5zsvSGuO1UuZkQMMlYOSS4C1I7Urh_YF-1M',
        'Wheel Check In',
        'How is your wheel going?',
        {url: '?rh=wheel'}
    )
})

schedule.scheduleJob({hour: 23, minute: 0}, function() { //15:00 UTC = 2:00am/1:00am, 20:30 UTC = 7:30am/6:30am Sydney/Melbourne time
    pushNotification(
        'fJ7odiluI04AsQVnke5sSz:APA91bHj7xytmfiuBxjm7cvcfADVGgdrs8mhrHPfJvhnVbbj34C0rNrrHHxlBReyRuYYtjO-SczSxYvkdfno5zsvSGuO1UuZkQMMlYOSS4C1I7Urh_YF-1M',
        'Check in on your priority list',
        'How is your wheel going?',
        {url: '?rh=tasks&tnav=priority'}
    )
})

schedule.scheduleJob({day: 1, hour: 24, minute: 0}, function() { //15:00 UTC = 2:00am/1:00am, 20:30 UTC = 7:30am/6:30am Sydney/Melbourne time
    //push notification.
    //Send a weekly reminder to check in on the goals.
    //This should really check to see if there are any goals. If not, prompt to create a goal.
    pushNotification(
        'fJ7odiluI04AsQVnke5sSz:APA91bHj7xytmfiuBxjm7cvcfADVGgdrs8mhrHPfJvhnVbbj34C0rNrrHHxlBReyRuYYtjO-SczSxYvkdfno5zsvSGuO1UuZkQMMlYOSS4C1I7Urh_YF-1M',
        'Check in on your goals',
        'These still your high priority goals?',
        {url: '?rh=goals'}
    )
})

//{url: '?rh=tasks&tnav=daytasklist'}
//{url: '?rh=tasks&tnav=past'}
//{url: '?rh=tasks&tnav=priority'}
//{url: '?rh=sources'}
//{url: '?rh=goals'}
//{url: '?rh=wheel'}

schedule.scheduleJob({ hour: 15, minute: 0 }, function() { //15:00 UTC = 2:00am/1:00am, 20:30 UTC = 7:30am/6:30am Sydney/Melbourne time
    //email daily stats.
    var today = new Date()
    var start = new Date()
    var end = today
    end.setDate(today.getDate() + 1)
    start.setHours(0,0,0,0) //set to midnight
    end.setHours(0,0,0,0) //set to midnight
    //set to Australian boundaries
    start.setHours(start.getHours() - 11) //-11 is Australian time in UTC
    end.setHours(end.getHours() - 11) //-11 is Australian time in UTC
    createreport([`${process.env.NOTIFICATION_EMAIL}`], start, end)
})

schedule.scheduleJob({ hour: 20, minute: 30 }, async function() { //20:30 UTC = 7:30am Sydney/Melbourne time. //set to UTC time for server
    const db = await DbConnection.Get()
    const LeadFunnel = db.collection('leadfunnel')
    const today = date2str(new Date(),'MM-dd-yyyy')
    const funnelemails = await LeadFunnel.findOne({day: today})
    if (funnelemails) funnelemails.emails.map(email => emailFunnel(email.email, email.name, email.funnel, email.step))
})  

schedule.scheduleJob({ minute: 10 }, async function() { //Every hour at 10 mins past, check unsent emails.
    reSendEmail()
})  

/* schedule.scheduleJob({ dayOfWeek: 0, hour: 22, minute: 0 }, function() {
    //summary once a week
    //set to UTC time for server 22 UTC = 8am Melbourne Time. dayOfWeek: 0, hour: 22, minute: 0 is 8am Monday in Melbourne
    //ranknudge(); //holding off sending these messages again for a little bit.
}) */

schedule.scheduleJob({ dayOfWeek: 0, hour: 14, minute: 0}, function() {
    //summary once a week
    //set to UTC time for server 22 UTC = 8am Melbourne Time. dayOfWeek: 0, hour: 14, minute: 0 is 12am Monday, Melbourne time
    weeklysummaryemail(); //holding off sending these messages again for a little bit.
})

schedule.scheduleJob({ hour: 7, minute: 30}, function() { //7:30 UTC = 5:30pm Sydney Time
    //daily summary email
    dailyafternoonemail(); 
})

schedule.scheduleJob({hour: 18, minute: 30}, function() { //18:30 UTC = 6:30am Sydney Time
    //daily summary email
    dailymorningemail(); 
})

schedule.scheduleJob({ hour: 21, minute: 0 }, async function() { //21:00 = 8am Sydney time
    //sending notice of unread messages via email. Only send once? Or keep sending? Could be annoying.
    //set to UTC time for server 22 UTC = 8am Melbourne Time. dayOfWeek: 0, hour: 22, minute: 0 is 8am Monday in Melbourne
    const users = await getunreadmessageusers()
    users.map(user => emailMessageNudge(user))
})

async function goalnudge(email) {
    const db = await DbConnection.Get()
    const Users = db.collection('users')
    const Goals = db.collection('goals')

    const user = await Users.findOne({ email: email })

    if (user) {
        const goals = await Goals.find({
            _id: {
                $in: links.map(function(link) {
                    return new ObjectId(link.goal)
                })
            },
            $or: [{ snooze: null }, { snooze: { $lt: new Date() } }]
        })
            .sort({ orderrank: 1 })
            .limit(100)
            .toArray()

        emailGoalNudge(user, links, goals)
    }
}

async function ranknudge() {
    const db = await DbConnection.Get()
    const Profiles = db.collection('profiles')
    const RankTimes = db.collection('ranktimes')
    const Users = db.collection('users')


    let twoweeksago = new Date()
    twoweeksago.setDate(twoweeksago.getDate() - 6)

    const aggCursor = await RankTimes.aggregate(
        //group by user (profile) and see which haven't had a rank for over two weeeks.
        [{
            $group: {
                _id: '$userid', //profiles
                user: { $first: '$userid' }, //profiles
                lastrank: { $max: '$date' }
            }
        },
        {
            $match: { lastrank: { $gte: twoweeksago } } //I'm currently also missing all the people who have not updated their ranks.
        }]
    )

    var olduserranks
    await aggCursor.forEach(doc => {
        olduserranks = doc
    })

    const profiles = await Profiles.find({
        _id: {
            $nin: olduserranks.map(function(userrank) {
                return userrank._id ? new ObjectId(userrank._id) : null
            })
        }
    }).toArray()

    const sendtousers = await Users.find({
        _id: {
            $in: profiles.map(function(profile) {
                return profile.user ? new ObjectId(profile.user) : null
            })
        }
        //state: "verified" //could add this later on to ensure that these emails are only sent to users who are verified.
    }).toArray()

    sendtousers.map(async(user) => {
        emailRerankNudge(user)
    })
}
