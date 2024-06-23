import { ObjectId } from 'mongodb' 
import DbConnection from './database'
import { emailGoalNudge, emailRerankNudge, emailFunnel, reSendEmail, emailMessageNudge, emailWeeklySummary } from './emails'
import { createreport, weeklysummaryemail } from './reporting'
import { date2str } from '../util/functions'
import { getunreadmessageusers } from './chat'

let schedule = require('node-schedule')

schedule.scheduleJob({ hour: 15, minute: 0 }, function() { //15:00 UTC = 2:00am, 20:30 UTC = 7:30am Sydney/Melbourne time
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
    //set to UTC time for server 22 UTC = 8am Melbourne Time. dayOfWeek: 0, hour: 22, minute: 0 is 8am Monday in Melbourne
    weeklysummaryemail(); //holding off sending these messages again for a little bit.
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
