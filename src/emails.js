require('dotenv-flow').config()
const fs = require('fs')
let nodemailer = require('nodemailer')

import DbConnection from './database'
//not 100% sure why it works loading in emails.js for environment variables.
//environment variables not accessible here when it's loaded in start.js, but loaded here, they're available in start.js.
//may need to revisit when breaking up into more modules.

let auth = {
    user: `${process.env.EMAILCLIENT_USR}`,
    pass: `${process.env.EMAILCLIENT_PWD}`
}
let sender = 'CAVESTEP<' + auth.user + '>'

let PATH_URL = `${process.env.PATH_URL}`
let LOGO_PATH_URL = PATH_URL

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth
})

let Mustache = require('mustache')

let newpersonal = fs
    .readFileSync(__dirname + '/emailtemplates/newpersonal.html')
    .toString()

let rerank = fs
    .readFileSync(__dirname + '/emailtemplates/rerank.html')
    .toString()

let feedbackTemplate = fs
    .readFileSync(__dirname + '/emailtemplates/feedback.html')
    .toString()

let newUserTemplate = fs
    .readFileSync(__dirname + '/emailtemplates/newUserNotificationEmail.html')
    .toString()

let shareInsightTemplate = fs
    .readFileSync(__dirname + '/emailtemplates/shareInsight.html')
    .toString()

let shareInsightNewUser = fs
    .readFileSync(__dirname + '/emailtemplates/shareInsightNewUser.html')
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
    let email =
        '<head><style>a {cursor: help;} .goal { margin: 3px; }</style></head>' +
        '<div>Hey ' +
        user.firstname +
        ', here are your top goals for today!</div>' +
        goals
            .map(function(obj) {
                return (
                    "<div class='goal'>• <a href='" +
                    PATH_URL +
                    '?goal=' +
                    obj._id +
                    "&email=GoalNudge'>" +
                    obj.goal +
                    '</a></div>'
                )
            })
            .join('') +
        "<br/><a href='" +
        LOGO_PATH_URL +
        "?email=GoalNudge'><img width='100' src='" +
        logopath +
        "'/></a>"

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
    let email =
        '<head><style>a {cursor: help;}</style></head><div>' +
        (client.firstname ? 'Hey ' + client.firstname + ', ' : '') +
        '<br/>' +
        (coach.firstname
            ? coach.firstname + ' has invited you to a Cavestep coaching wheel!'
            : "You've been invited to a Cavestep coaching wheel.") + // to Cavestep🦶
        '<br/>' +
        "Click here to start your journey: <a href='" +
        PATH_URL +
        '?page=' +
        page +
        '&user=' +
        client._id +
        '&code=' +
        client.code +
        (newView ? '&view=' + newView : '') +
        "&email=NewClient'>" +
        'get set up' + //start your Cavestep journey
        '</a>' + //cavestep
        '<br/>' +
        '<br/>' +
        "<a href='" +
        LOGO_PATH_URL +
        "?email=NewClient'><img width='100' src='" +
        logopath +
        "'/></a>" +
        '</div>'

    sendEmail(to, subject, email)
    to = 'daniel@cavestep.com'
    subject = 'New User!' //to Cavestep🦶
    email =
        '<head><style>a {cursor: help;}</style></head><div>' +
        'name: ' +
        client.firstname +
        ' ' +
        client.lastname +
        '<br/>' +
        'email: ' +
        client.email +
        '<br/>' +
        '<br/>' +
        'coach: ' +
        coach.firstname +
        ' ' +
        coach.lastname +
        '<br/>' +
        'email: ' +
        coach.email +
        '<br/>' +
        '<br/>' +
        'view name: ' +
        view.name +
        '<br/>' +
        '<br/>' +
        'verify link: ' + //cavestep
        PATH_URL +
        '?page=verify&user=' +
        client._id +
        '&code=' +
        client.code +
        '<br/>' +
        '<br/>' +
        '<a href=' +
        LOGO_PATH_URL +
        "'><img width='100' src='" +
        logopath +
        "'/></a>" +
        '</div>'
        sendEmail(to, subject, email)
}

export async function emailNewPersonal(personal, queryStringParams) {
    let to = personal.email
    let subject = "Looks like you've signed up for Cavestep!"
    let email = Mustache.render(newpersonal, {
        name: personal.firstname ? ' ' + personal.firstname : '', //using space in front here to manage formatting.
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
    let email =
        '<head><style>a {cursor: help;}</style></head>' +
        (coach.firstname ? 'Hey ' + coach.firstname + ', ' : '') +
        'we got your request to create an account. Great to have you with us.' +
        '<br/>' +
        '<br/>' +
        'Click below to start your Cavestep journey.' + //cavestep
        '<br/>' +
        "<a href='" +
        PATH_URL +
        '?page=verify&user=' +
        coach._id +
        '&'+ queryStringParams +
        '&code=' +
        coach.code +
        "&email=NewCoach'>" +
        'start my Cavestep journey' + //start your Cavestep journey
        '</a>' +
        '<br/>' +
        '<br/>' +
        'Warm regards,' +
        '<br/>' +
        'Daniel Schrader' +
        '<br/>' +
        'Founder' +
        '<br/>' +
        "<a href='" +
        LOGO_PATH_URL +
        "?email=NewCoach'><img width='100' src='" +
        logopath +
        "'/></a>"
    sendEmail(to, subject, email)
}

export async function emailFeedback(user, feedback) {
    let to = `${process.env.FEEDBACK_EMAIL}`
    let subject = `Feedback from ${user.firstname}`
    let email = Mustache.render(feedbackTemplate, {
        from: `${user.firstname} ${user.lastname || ''}`,
        email: `${user.email}`,
        time: new Date(),
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
    acceptLink,
    newUser
    ) { 
        const sharerName = `${sharer.firstname} ${sharer.lastname || ''}`
        const subject = `${sharerName} shared an insight with you`
        const email = Mustache.render(newUser ? shareInsightNewUser : shareInsightTemplate, {
            insightText: insight.answer,
            sharerName: sharerName,
            sharerEmail: `${sharer.email}`,
            logoPath: logopath,
            acceptLink: acceptLink
        })
        return await sendEmail(receiverEmail, subject, email)
    }