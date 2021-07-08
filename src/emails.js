require('dotenv-flow').config()
const fs = require('fs')
let nodemailer = require('nodemailer')

import DbConnection from './database'
//not 100% sure why it works loading in emails.js for environment variables.
//environment variables not accessible here when it's loaded in start.js, but loaded here, they're available in start.js.
//may need to revisit when breaking up into more modules.

let auth = {
    user: `${process.env.EMAILCLIENT_USR}`,
    pass: `${process.env.EMAILCLIENT_PWD}`,
}
let sender = 'Cavestep 🦶<' + auth.user + '>'

let PATH_URL = `${process.env.PATH_URL}`

let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth,
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

async function sendEmail(to, subject, email) {
    const db = await DbConnection.Get()
    const Emails = db.collection('emails')
    let mailOptions = {
        from: sender,
        to: to,
        subject: subject,
        html: email,
    }
    let response = await new Promise(function(resolve, reject) {
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

export async function emailObjectiveNudge(user, links, objectives) {
    let to = user.email
    let subject = 'Your Cavestep Objectives'
    let email =
        '<head><style>a {cursor: help;} .objective { margin: 3px; }</style></head>' +
        '<div>Hey ' +
        user.firstname +
        ', here are your top objectives for today!</div>' +
        objectives
            .map(function(obj) {
                return (
                    "<div class='objective'>• <a href='" +
                    PATH_URL +
                    '?objective=' +
                    obj._id +
                    "'>" +
                    obj.objective +
                    '</a></div>'
                )
            })
            .join('') +
        "<br/><img width='100' src='https://www.cavestep.com/static/media/cavesteplong.67b5763d.png'/>"

    sendEmail(to, subject, email)
}

export async function emailNewClient(client, coach, viewname) {
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
        '?page=verify&user=' +
        client._id +
        '&code=' +
        client.code +
        "'>" +
        'get set up' + //start your Cavestep journey
        '</a>' + //cavestep
        '<br/>' +
        '<br/>' +
        "<img width='100' src='https://www.cavestep.com/static/media/cavesteplong.67b5763d.png'/>" +
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
        viewname +
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
        "<img width='100' src='https://www.cavestep.com/static/media/cavesteplong.67b5763d.png'/>" +
        '</div>'
    sendEmail(to, subject, email)
}

export async function emailNewPersonal(personal) {
    let to = personal.email
    let subject = "Looks like you've signed up for Cavestep!"
    let email = Mustache.render(newpersonal, {
        name: personal.firstname ? ' ' + personal.firstname : '', //using space in front here to manage formatting.
        PATH_URL: PATH_URL,
        personalid: personal._id,
        personalcode: personal.code,
    })

    sendEmail(to, subject, email)
}

export async function emailRerankNudge(user) {
    let from = sender
    let to = user.email
    let subject = 'Time to rank your wheel'
    let email = Mustache.render(rerank, {
        name: user.firstname ? ' ' + user.firstname : '', //using space in front here to manage formatting.
        PATH_URL: PATH_URL,
    })

    return await sendEmail(to, subject, email)
}

export async function emailNewCoach(coach) {
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
        '&code=' +
        coach.code +
        "'>" +
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
        "<img width='100' src='https://www.cavestep.com/static/media/cavesteplong.67b5763d.png'/>"
    sendEmail(to, subject, email)
}

export async function emailFeedback(user, feedback) {
    let to = `${process.env.FEEDBACK_EMAIL}`
    let subject = `Feedback from ${user.firstname}`
    let email = Mustache.render(feedbackTemplate, {
        from: `${user.firstname} ${user.lastname || ''}`,
        email: `${user.email}`,
        time: new Date(),
        feedback: feedback,
    })
    return await sendEmail(to, subject, email)
}

export async function newUserNotificationEmail(user) {
    let to = `${process.env.NEW_USER_NOTIFICATION_EMAIL_ADDRESS}`
    let subject = `New Cavestep user! ${user.firstname} ${user.lastname || ''}`
    let email = Mustache.render(newUserTemplate, {
        name: `${user.firstname} ${user.lastname || ''}`,
        email: `${user.email}`,
    })
    return await sendEmail(to, subject, email)
}
