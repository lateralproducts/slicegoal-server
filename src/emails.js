require('dotenv-flow').config()
const fs = require('fs')
const nodemailer = require('nodemailer')

import DbConnection from './database'
//not 100% sure why it works loading in emails.js for environment variables.
//environment variables not accessible here when it's loaded in start.js, but loaded here, they're available in start.js.
//may need to revisit when breaking up into more modules.

const auth = {
    user: `${process.env.EMAILCLIENT_USR}`,
    pass: `${process.env.EMAILCLIENT_PWD}`
}
const sender = 'CAVESTEP<' + auth.user + '>'

const PATH_URL = `${process.env.PATH_URL}`
const LOGO_PATH_URL = PATH_URL

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth
})

const Mustache = require('mustache')

const newpersonal = fs
    .readFileSync(__dirname + '/emailtemplates/newpersonal.html')
    .toString()

const rerank = fs
    .readFileSync(__dirname + '/emailtemplates/rerank.html')
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

const goalNudge = fs
    .readFileSync(__dirname + '/emailtemplates/goalNudge.html')
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

const logopath =
    'https://www.cavestep.com/static/media/cavesteplong.d8a54789.png'

async function sendEmail(to, subject, email) {
    const db = await DbConnection.Get()
    const Emails = db.collection('emails')
    let mailOptions = {
        from: sender,
        to: to,
        subject: subject,
        html: email
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

export async function emailGoalNudge(user, links, goals) {
    let to = user.email
    let subject = 'Your Cavestep Goals'
    const email = Mustache.render(goalNudge, {
        goals: goals,
        pathurl: `${process.env.PATH_URL}`,
        logopath: logopath,
        user: user
    })
    sendEmail(to, subject, email)
}

export async function emailNewClient(
    client,
    coach,
    view,
    newView,
    page,
) {
    let to = client.email
    let subject = 'You’ve been invited to Cavestep' //to Cavestep🦶
    let email = Mustache.render(inviteToCoachingWheel , {
        client: client,
        logopath: logopath,
        view: newView ? '&view=' + newView : '',
        page: page,
        intro: coach.firstname
            ? coach.firstname + ' has invited you to a Cavestep coaching wheel!'
            : 'You\'ve been invited to a Cavestep coaching wheel.',  // to Cavestep🦶
        pathurl: `${process.env.PATH_URL}`
    })

    sendEmail(to, subject, email)
    to = 'daniel@cavestep.com'
    subject = 'New User!' //to Cavestep🦶
    email = Mustache.render(adminEmailNewUser, {
        clientname: client.firstname + client.lastname,
        clientemail: client.email,
        clientid: client._id.toString(),
        clientcode: client.code,
        coachname: coach.firstname + coach.lastname,
        coachemail: coach.email,
        pathurl: `${process.env.PATH_URL}`,
        logopath: logopath,
        viewname: newView ? '&view=' + newView : ''
    })
        
    sendEmail(to, subject, email)
}

export async function emailNewPersonal(personal, queryStringParams) {
    let to = personal.email
    let subject = "Looks like you've signed up for Cavestep!"
    let email = Mustache.render(newpersonal, {
        PATH_URL: PATH_URL,
        LOGO_PATH_URL: LOGO_PATH_URL,
        personalid: personal._id,
        personalcode: personal.code,
        logo: logopath,
        queryStringParams: queryStringParams
    })

    sendEmail(to, subject, email)
}

export async function emailRerankNudge(user) {
    let to = user.email
    let subject = 'Time to rank your wheel'
    let email = Mustache.render(rerank, {
        name: user.firstname ? ' ' + user.firstname : '', //using space in front here to manage formatting.
        PATH_URL: PATH_URL,
        LOGO_PATH_URL: LOGO_PATH_URL,
        logo: logopath
    })

    return await sendEmail(to, subject, email)
}

export async function emailNewCoach(coach, queryStringParams) {
    let to = coach.email
    let subject = 'You’ve signed up to Cavestep'
    let email = Mustache.render(newCoach, {
        pathurl: `${process.env.PATH_URL}`,
        coach: coach,
        queryStringParams: '&' + queryStringParams,
        logopath: logopath
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
    let to = `${process.env.NEW_USER_NOTIFICATION_EMAIL_ADDRESS}`
    let subject = `New Cavestep user! ${user.firstname} ${user.lastname || ''}`
    let email = Mustache.render(newUserTemplate, {
        name: `${user.firstname} ${user.lastname || ''}`,
        email: `${user.email}`
    })
    return await sendEmail(to, subject, email)
}

export async function shareInsightEmail( 
    insight,
    sharer,
    receiverEmail,
    shareNote,
    acceptLink
    ) { 
        const sharerName = `${sharer.firstname} ${sharer.lastname || ''}`
        const subject = `${sharerName} shared an insight`
        const email = Mustache.render(shareInsightTemplate, {
            insightText: insight.answer,
            sharerName: sharerName,
            sharerEmail: `${sharer.email}`,
            logoPath: logopath,
            acceptLink: acceptLink,
            shareNote: shareNote
        })
        return await sendEmail(receiverEmail, subject, email)
    }