require('dotenv-flow').config()
const fs = require('fs')
var nodemailer = require('nodemailer')

import DbConnection from './database'
//not 100% sure why it works loading in emails.js for environment variables.
//environment variables not accessible here when it's loaded in start.js, but loaded here, they're available in start.js.
//may need to revisit when breaking up into more modules.

var auth = {
  user: `${process.env.EMAILCLIENT_USR}`,
  pass: `${process.env.EMAILCLIENT_PWD}`,
}
var sender = 'Cavestep 🦶<' + auth.user + '>'

var URLpath = `${process.env.URLpath}`

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth,
})

var Mustache = require('mustache')

var newpersonal = fs
  .readFileSync(__dirname + '/emailtemplates/newpersonal.html')
  .toString()

var rerank = fs
  .readFileSync(__dirname + '/emailtemplates/rerank.html')
  .toString()

var feedbackTemplate = fs
  .readFileSync(__dirname + '/emailtemplates/feedback.html')
  .toString()

var newUserTemplate = fs
  .readFileSync(__dirname + '/emailtemplates/newUserNotificationEmail.html')
  .toString()

async function sendEmail(to, subject, email) {
  const db = await DbConnection.Get()
  const Emails = db.collection('emails')
  var mailOptions = {
    from: sender,
    to: to,
    subject: subject,
    html: email,
  }
  var response = await new Promise(function(resolve, reject) {
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
  var to = user.email
  var subject = 'Your Cavestep Objectives'
  var email =
    '<head><style>a {cursor: help;} .objective { margin: 3px; }</style></head>' +
    '<div>Hey ' +
    user.firstname +
    ', here are your top objectives for today!</div>' +
    objectives
      .map(function(obj) {
        return (
          "<div class='objective'>• <a href='" +
          URLpath +
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
  var to = client.email
  var subject = 'You’ve been invited to Cavestep' //to Cavestep🦶
  var email =
    '<head><style>a {cursor: help;}</style></head><div>' +
    (client.firstname ? 'Hey ' + client.firstname + ', ' : '') +
    '<br/>' +
    (coach.firstname
      ? coach.firstname + ' has invited you to a Cavestep coaching wheel!'
      : "You've been invited to a Cavestep coaching wheel.") + // to Cavestep🦶
    '<br/>' +
    "Click here to start your journey: <a href='" +
    URLpath +
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
    URLpath +
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
  var to = personal.email
  var subject = "Looks like you've signed up for Cavestep!"
  var email = Mustache.render(newpersonal, {
    name: personal.firstname ? ' ' + personal.firstname : '', //using space in front here to manage formatting.
    URLpath: URLpath,
    personalid: personal._id,
    personalcode: personal.code,
  })

  sendEmail(to, subject, email)
}

export async function emailRerankNudge(user) {
  var from = sender
  var to = user.email
  var subject = 'Time to rank your wheel'
  var email = Mustache.render(rerank, {
    name: user.firstname ? ' ' + user.firstname : '', //using space in front here to manage formatting.
    URLpath: URLpath,
  })

  return await sendEmail(to, subject, email)
}

export async function emailNewCoach(coach) {
  var to = coach.email
  var subject = 'You’ve signed up to Cavestep'
  var email =
    '<head><style>a {cursor: help;}</style></head>' +
    (coach.firstname ? 'Hey ' + coach.firstname + ', ' : '') +
    'we got your request to create an account. Great to have you with us.' +
    '<br/>' +
    '<br/>' +
    'Click below to start your Cavestep journey.' + //cavestep
    '<br/>' +
    "<a href='" +
    URLpath +
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
  var to = `${process.env.FEEDBACK_EMAIL}`
  var subject = `Feedback from ${user.firstname}`
  var email = Mustache.render(feedbackTemplate, {
    from: `${user.firstname} ${user.lastname || ''}`,
    email: `${user.email}`,
    time: new Date(),
    feedback: feedback,
  })
  return await sendEmail(to, subject, email)
}

export async function newUserNotificationEmail(user) {
  var to = `${process.env.NEW_USER_NOTIFICATION_EMAIL_ADDRESS}`
  var subject = `New Cavestep user! ${user.firstname} ${user.lastname || ''}`
  var email = Mustache.render(newUserTemplate, {
    name: `${user.firstname} ${user.lastname || ''}`,
    email: `${user.email}`,
  })
  return await sendEmail(to, subject, email)
}
