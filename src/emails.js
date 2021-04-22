const fs = require("fs");
var nodemailer = require("nodemailer");

var auth = {
  user: "daniel@cavestep.com",
  pass: "nfquwbjifgfjkkov"
};

var env = "test";

var URLpath = `${process.env.URLpath}`;
if (URLpath == "undefined") {
  URLpath = "https://www.cavestep.com/app/"; //must have a slash at the end
  env = "prod";
  //override address if necessary
}

var transporter = nodemailer.createTransport({
  service: "gmail",
  auth
});

var Mustache = require("mustache");

var newinnovator = fs
  .readFileSync(__dirname + "/emailtemplates/newinnovator.html")
  .toString();

export async function objectivesummaryemail(user, links, objectives) {
  var mailOptions = {
    from: auth.user,
    to: user.email,
    subject: "Your Cavestep Objectives",
    html:
      "<head><style>a {cursor: help;} .objective { margin: 3px; }</style></head>" +
      "<div>Hey " +
      user.firstname +
      ", here are your top objectives for today!</div>" +
      objectives
        .map(function(obj) {
          return (
            "<div class='objective'>• <a href='" +
            URLpath +
            "?objective=" +
            obj._id +
            "'>" +
            obj.objective +
            "</a></div>"
          );
        })
        .join("") +
      "<br/><img width='100' src='https://www.cavestep.com/static/media/cavesteplong.67b5763d.png'/>"
  };

  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
}

export async function newClientEmail(client, coach, viewname) {
  from = auth.user;
  to = client.email;
  subject = "You’ve been invited to Cavestep"; //to Cavestep🦶
  email =
    "<head><style>a {cursor: help;}</style></head><div>" +
    (client.firstname ? "Hey " + client.firstname + ", " : "") +
    "<br/>" +
    (coach.firstname
      ? coach.firstname + " has invited you to a Cavestep coaching wheel!"
      : "You've been invited to a Cavestep coaching wheel.") + // to Cavestep🦶
    "<br/>" +
    "Click here to start your journey: <a href='" +
    URLpath +
    "?page=verify&user=" +
    client._id +
    "&code=" +
    client.code +
    "'>" +
    "get set up" + //start your Cavestep journey
    "</a>" + //cavestep
    "<br/>" +
    "<br/>" +
    "<img width='100' src='https://www.cavestep.com/static/media/cavesteplong.67b5763d.png'/>" +
    "</div>";

  sendEmail(from, to, subject, email);

  from = auth.user;
  to = "daniel@cavestep.com";
  subject = "New User!"; //to Cavestep🦶
  email =
    "<head><style>a {cursor: help;}</style></head><div>" +
    "name: " +
    client.firstname +
    " " +
    client.lastname +
    "<br/>" +
    "email: " +
    client.email +
    "<br/>" +
    "<br/>" +
    "coach: " +
    coach.firstname +
    " " +
    coach.lastname +
    "<br/>" +
    "email: " +
    coach.email +
    "<br/>" +
    "<br/>" +
    "view name: " +
    viewname +
    "<br/>" +
    "<br/>" +
    "verify link: " + //cavestep
    URLpath +
    "?page=verify&user=" +
    client._id +
    "&code=" +
    client.code +
    "<br/>" +
    "<br/>" +
    "<img width='100' src='https://www.cavestep.com/static/media/cavesteplong.67b5763d.png'/>" +
    "</div>";
  sendEmail(from, to, subject, email);
}

export async function newInnovatorEmail(innovator) {
  var from = auth.user;
  var to = innovator.email;
  var subject = "Looks like you've signed up for Cavestep!";
  var email = Mustache.render(newinnovator, {
    name: innovator.firstname ? innovator.firstname : "",
    URLpath: URLpath,
    innovatorid: innovator._id,
    innovatorcode: innovator.code
  });

  sendEmail(from, to, subject, email);
}

export async function newCoachEmail(coach) {
  from = auth.user;
  to = coach.email;
  subject = "You’ve signed up to Cavestep";
  email =
    "<head><style>a {cursor: help;}</style></head>" +
    (coach.firstname ? "Hey " + coach.firstname + ", " : "") +
    "we got your request to create an account. Great to have you with us." +
    "<br/>" +
    "<br/>" +
    "Click below to start your Cavestep journey." + //cavestep
    "<br/>" +
    "<a href='" +
    URLpath +
    "?page=verify&user=" +
    coach._id +
    "&code=" +
    coach.code +
    "'>" +
    "start my Cavestep journey" + //start your Cavestep journey
    "</a>" +
    "<br/>" +
    "<br/>" +
    "Warm regards," +
    "<br/>" +
    "Daniel Schrader" +
    "<br/>" +
    "Founder" +
    "<br/>" +
    "<img width='100' src='https://www.cavestep.com/static/media/cavesteplong.67b5763d.png'/>";
  sendEmail(from, to, subject, email);
}

async function sendEmail(from, to, subject, email) {
  var mailOptions = {
    from: from,
    to: to,
    subject: subject,
    html: email
  };
  transporter.sendMail(mailOptions, function(error, info) {
    if (error) {
      console.log(error);
    } else {
      console.log("Email to:" + to + " - " + info.response);
    }
  });
}
