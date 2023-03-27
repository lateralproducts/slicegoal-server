require('dotenv-flow').config()
const fs = require('fs')
const nodemailer = require('nodemailer')

import DbConnection from './database'
import { newIx } from './interactions'
import { date2str } from '../util/functions'
//not 100% sure why it works loading in emails.js for environment variables.
//environment variables not accessible here when it's loaded in start.js, but loaded here, they're available in start.js.
//may need to revisit when breaking up into more modules.

const auth = {
    user: `${process.env.EMAILCLIENT_USR}`,
    pass: `${process.env.EMAILCLIENT_PWD}`
}
const sender = 'Cavestep<' + auth.user + '>'

const PATH_URL = `${process.env.PATH_URL}`
const APP_PATH_URL = `${PATH_URL}/app`
const LOGO_PATH_URL = `${PATH_URL}/files/cavesteplong.png`

const transporter = `${process.env.NODE_ENV}` === 'development' || `${process.env.NODE_ENV}` === 'test' ? 
nodemailer.createTransport({ //test and development email client
    port: 1025,
    tls: {
        ciphers: 'SSLv3'
    }
}) : nodemailer.createTransport({ //production email client.
    service: 'gmail',
    auth
})

const Mustache = require('mustache')

const newpersonal = fs
    .readFileSync(__dirname + '/emailtemplates/newpersonal.html')
    .toString()

const resetpassword = fs
    .readFileSync(__dirname + '/emailtemplates/resetPassword.html')
    .toString()

const rerank = fs
    .readFileSync(__dirname + '/emailtemplates/rerank.html')
    .toString()

const lateralproducts = fs
    .readFileSync(__dirname + '/emailtemplates/lateralproducts.html')
    .toString()

const feedbackTemplate = fs
    .readFileSync(__dirname + '/emailtemplates/feedback.html')
    .toString()

const newUserTemplate = fs
    .readFileSync(__dirname + '/emailtemplates/newUserNotificationEmail.html')
    .toString()

const shareInsightTemplate = fs
    .readFileSync(__dirname + '/emailtemplates/shareInsight.html')
    .toString()

const shareSourceTemplate = fs
    .readFileSync(__dirname + '/emailtemplates/shareSource.html')
    .toString()

const goalNudge = fs
    .readFileSync(__dirname + '/emailtemplates/goalNudge.html')
    .toString()

const dailyStats = fs
    .readFileSync(__dirname + '/emailtemplates/dailystats.html')
    .toString()

const inviteToCoachingWheel = fs
    .readFileSync(__dirname + '/emailtemplates/inviteToCoachingWheel.html')
    .toString()

const adminEmailNewUser = fs
    .readFileSync(__dirname + '/emailtemplates/adminEmailNewUser.html')
    .toString()

const newCoach = fs  
    .readFileSync(__dirname + '/emailtemplates/newCoach.html')
    .toString()

const habitGuide = fs  
    .readFileSync(__dirname + '/emailtemplates/habitGuide.html')
    .toString()

const newSessionLead = fs  
    .readFileSync(__dirname + '/emailtemplates/newLeadSession.html')
    .toString()

let funnelpackage1 = {emails: [
    {subject: 'Bad Habits Are Costing You Your Life', template: 'email1', day: 1}, //CTA - Click webpage (or download) about stats on bad habits (and habits?).
    {subject: 'Your Ideal Future', template: 'email2', day: 2}, //CTA - Take this survey 
    {subject: '6 Habits That Could Help', template: 'email3', day: 3}, //CTA Download: List of habits that build my day.
    {subject: 'Hey', template: 'email4', day: 4}, //- Your Biggest Habit - Your Most Valuable Habit - AB test.
    {subject: 'Habit Booster For A Limited Time', template: 'email5', day: 5} //$50 1 on 1 habit building coaching session - Habit Building Boost - Limited time
    //-> sign up page. Straight to transaction? AB test.
]}

async function sendEmail(to, subject, email, attachments, retryid) {
    const db = await DbConnection.Get()
    const Emails = db.collection('emails')
    let mailOptions = {
        from: sender,
        to: to,
        subject: subject,
        html: email,
        attachments: attachments,
        retry: retryid
    }
    let response = await new Promise(function(resolve) {
        transporter.sendMail(mailOptions, function(error, info) {
            if (error) {
                mailOptions.error = error
                console.log('email error: ' + error)
            } else {
                mailOptions.response = info.response
                console.log('email sent: ' + info.response)
            }
            mailOptions.triggered = new Date()
            resolve(mailOptions)
        })
    })
    Emails.insertOne(response)
    return response
}

export async function reSendEmail() {
    const db = await DbConnection.Get()
    const Emails = db.collection('emails')
    var emails = await Emails.find({response:{$exists: false}}).toArray()
    emails.map(email => {
        sendEmail(email.to, email.subject, email.html, email.attachments, email._id)
        Emails.update({_id: email._id}, {$set: {response: 'retried'}})
    })
}

export async function emailGoalNudge(user, links, goals) {
    let to = user.email
    let subject = 'Your Cavestep Goals'
    const email = Mustache.render(goalNudge, {
        goals: goals,
        pathurl: APP_PATH_URL,
        logopath: LOGO_PATH_URL,
        user: user
    })
    sendEmail(to, subject, email)
}

export async function emailStats(email, stats, title) { //stats an array of metrics and measures {metric,measure}
    let to = email
    let subject = title
    const body = Mustache.render(dailyStats, {
        stats: stats,
        logopath: LOGO_PATH_URL,
        title: title
    })
    sendEmail(to, subject, body)
}

export async function emailNewClient(
    client,
    coach,
    view,
    newView,
    page,
) {
    let to = client.email
    let name = `${coach.firstname} ${coach.lastname || ''}`
    let subject = name ? (`${name.trim()}` + ' invited you to Cavestep') : 'You’ve been invited to Cavestep' //to Cavestep🦶
    let email = Mustache.render(inviteToCoachingWheel , {
        name: client.firstname ? client.firstname : '',
        client: client,
        logopath: LOGO_PATH_URL,
        view: newView ? '&view=' + newView : '',
        page: page,
        intro: coach.firstname
            ? coach.firstname + ' has invited you to a Cavestep coaching wheel.'
            : 'You\'ve been invited to a Cavestep coaching wheel.',  // to Cavestep🦶
        pathurl: APP_PATH_URL
    })

    sendEmail(to, subject, email)
    to = `${process.env.NOTIFICATION_EMAIL}`
    subject = 'New User!' //to Cavestep🦶
    email = Mustache.render(adminEmailNewUser, {
        clientname: client.firstname + client.lastname,
        clientemail: client.email,
        clientid: client._id.toString(),
        clientcode: client.code,
        coachname: coach.firstname + coach.lastname,
        coachemail: coach.email,
        pathurl: APP_PATH_URL,
        logopath: LOGO_PATH_URL,
        viewname: view
    })
        
    sendEmail(to, subject, email)
}

export async function emailNewPersonal(personal, queryStringParams) {
    let to = personal.email
    let subject = "Looks like you've signed up for Cavestep"
    let email = Mustache.render(newpersonal, {
        pathurl: APP_PATH_URL,
        personalid: personal._id,
        personalcode: personal.code,
        logopath: LOGO_PATH_URL,
        queryStringParams: queryStringParams
    })

    sendEmail(to, subject, email)
}

export async function emailResetPassword(personal, newcode, queryStringParams) {
    let to = personal.email
    let subject = "Looks like you asked for a password reset"
    let email = Mustache.render(resetpassword, {
        pathurl: APP_PATH_URL,
        personalid: personal._id,
        personalcode: newcode,
        logopath: LOGO_PATH_URL,
        queryStringParams: queryStringParams
    })

    sendEmail(to, subject, email)
}

export async function emailRerankNudge(user) {
    let to = user.email
    let subject = 'Time to rank your wheel'
    let email = Mustache.render(rerank, {
        name: user.firstname ? ' ' + user.firstname : '', //using space in front here to manage formatting.
        pathurl: APP_PATH_URL,  
        logopath: LOGO_PATH_URL
    })

    return await sendEmail(to, subject, email)
}

export async function emailLateralProducts({name, email, interest, message}) {
    let to = `${process.env.NOTIFICATION_EMAIL}` //send to lateral products.
    let subject = "New Lateral Products Website Message"
    let lpemail = Mustache.render(lateralproducts, {
        name: name,
        email: email,
        interest: interest,
        message: message
    })

    return await sendEmail(to, subject, lpemail)
}

export async function emailNewCoach(coach, queryStringParams) {
    let to = coach.email
    let subject = 'You’ve signed up to Cavestep'
    let email = Mustache.render(newCoach, {
        pathurl: APP_PATH_URL,
        coach: coach,
        queryStringParams: '&' + queryStringParams,
        logopath: LOGO_PATH_URL
    })
    sendEmail(to, subject, email)
}

export async function signupEmailFunnel(funnelpackage, name, email){
    //future: map funnelpackage to different funnels.
    const db = await DbConnection.Get()
    const LeadFunnel = db.collection('leadfunnel')
    const today = new Date()

    funnelpackage1.emails.map((funnelemail, count) => {
        let emaildate = new Date()
        emaildate.setDate(today.getDate() + funnelemail.day)

        try { //scheduling emails to be sent on days specified.
            LeadFunnel.update(
                { day: date2str(emaildate,'MM-dd-yyyy') },
                {
                    $push: {emails: {
                        email: email,
                        name: name,
                        funnel: funnelpackage,
                        day: funnelemail.day,
                        step: count
                    }}
                },
                {upsert: true}
            )
        } catch (error) {
            console.log("error creating funnel email schedule " + error)
        }
    })
}

export async function emailHabitGuide(
        name,
        toemail
    ){
    let interactionid = (await newIx('cavestep - funnel - habits', toemail, 'lead magnet email', 'habit guide', '')).insertedId.toString()
    let to = toemail
    let subject = 'Here\'s your Free Habit Guide'
    let email = Mustache.render(habitGuide, {
        name: name === '' ? '!' : ' ' + name + ',',
        pathurl: PATH_URL,
        logopath: LOGO_PATH_URL,
        email: toemail,
        interactionid: interactionid
    })
    let attachments = [{
        filename: '5StepHabitBuilderGuide.pdf',
        content: fs.createReadStream(__dirname + '/files/5StepHabitBuilderGuide.pdf')
    }]
    sendEmail(to, subject, email, attachments)
}


//toemail: 'daniel@cavestep.com', package: 'funnel1', emailstep: 0

export async function emailFunnel(
        toemail,
        name,    
        funnelpackage,
        emailstep
    ){
    //future: map funnelpackage to be able to handle other packages 
    
    try{
        let interactionid = (await newIx(funnelpackage + ' - ' + emailstep, toemail, 'funnel email', funnelpackage1.emails[emailstep].subject, '')).insertedId.toString()
        let template = funnelpackage1.emails[emailstep].template
        
        const emailtemplate = fs
        .readFileSync(__dirname + '/emailtemplates/' + funnelpackage + '/' + template + '.html')
        .toString()

        let to = toemail
        let subject = funnelpackage1.emails[emailstep].subject
        let email = Mustache.render(emailtemplate, {
            name: name === '' ? ',' : ' ' + name + ',', //used in template with greeting, ie. "Hi"
            pathurl: PATH_URL,
            logopath: LOGO_PATH_URL,
            email: toemail,
            interactionid: interactionid
        })

        let filename = funnelpackage1.emails[emailstep].file
        let attachments = filename ? [{ //attempt to create attachment only if there is a file.
            filename: filename,
            content: fs.createReadStream(__dirname + '/files/' + filename)
        }] : null 
        sendEmail(to, subject, email, attachments)
    } catch (error) {
        console.log('funnel email failed to send -> ' +  toemail + ' ' + name + ' ' + funnelpackage + ' ' + emailstep)
        console.log(error)
    }
}

export async function emailNotifyNewLeadCoaching(name, toemail) {
    let to = `${process.env.NOTIFICATION_EMAIL}`
    let subject = 'New Coaching Lead! Session request'
    let email = Mustache.render(newSessionLead, {
        name: name === '' ? '!' : ' ' + name + ',',
        email: toemail,
        logopath: LOGO_PATH_URL
    })
    sendEmail(to, subject, email)
}

export async function emailFeedback(user, feedback, datetime) {
    let to = `${process.env.FEEDBACK_EMAIL}`
    let subject = `Feedback from ${user.firstname}`
    let email = Mustache.render(feedbackTemplate, {
        from: `${user.firstname} ${user.lastname || ''}`,
        email: `${user.email}`,
        time: datetime.toString(),
        feedback: feedback
    })
    return await sendEmail(to, subject, email)
}

export async function newUserNotificationEmail(user) {
    let to = `${process.env.NOTIFICATION_EMAIL}`
    let subject = `New Cavestep User!`
    let email = Mustache.render(newUserTemplate, {
        email: `${user.email}`
    })
    return await sendEmail(to, subject, email)
}

export async function shareInsightEmail( 
    insight,
    sharer,
    receiver,
    shareNote,
    acceptLink,
    interactionid
    ) { 
        const sharerName = `${sharer.firstname} ${sharer.lastname || ''}`
        const subject = `${sharerName.trim()} shared an insight with you`
        const email = Mustache.render(shareInsightTemplate, {
            insightText: insight.answer,
            sharerName: sharerName,
            sharerEmail: `${sharer.email}`,
            logopath: LOGO_PATH_URL,
            acceptLink: `${APP_PATH_URL}` + acceptLink,
            shareNote: shareNote,
            interactionid: interactionid
        })
        return await sendEmail(receiver.email, subject, email)
    }

export async function shareSourceEmail( 
    source,
    sharer,
    receiver,
    shareNote,
    acceptLink,
    interactionid
    ) { 
        const sharerName = `${sharer.firstname} ${sharer.lastname || ''}`
        const subject = `${sharerName.trim()} shared a source with you`
        const email = Mustache.render(shareSourceTemplate, {
            sourceText: source.name,
            sourceLink: source.url,
            sourceType: source.type,
            sharerName: sharerName,
            sharerEmail: `${sharer.email}`,
            logopath: LOGO_PATH_URL,
            acceptLink: `${APP_PATH_URL}` + acceptLink,
            shareNote: shareNote,
            interactionid: interactionid
        })
        return await sendEmail(receiver.email, subject, email)
    }