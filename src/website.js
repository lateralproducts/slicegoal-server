import DbConnection from './database'
import { getipaddress } from './users'

import {
    emailHabitGuide
} from './emails'
import { validateemail } from './functions';

export const typeDefs = `   
    extend type Mutation {
        trackpage(page: String, search: String, action: String, actioninfo: String, abconfig: String, pagetrack: String, screenwidth: Int, browser: Browser): Boolean
        sendofferrequest(name: String, email: String!, offer: String!): Boolean
    }
`

export const schema = `
    input Browser {         
        name: String         
        version: String
    }
`
export const resolvers = {
    Mutation: {
        trackpage: async(_, args, { req }) => {
            //action: click, update, delete, etc
            //actioninfo: pass parameters (like wheel name, etc)
            //abconfig: pass parameter to log for A/B testing
            //pagetrack: if loading a webpage with a unique identifer, to track over sessions
            //if(args.actioninfo) console.log(args.actioninfo)
            sessiontrack(
                req,
                args,
                args.page,
                args.action,
                args.result,
                args.actioninfo,
                args.abconfig,
                args.screenwidth,
                args.browser,
            )
        },
        sendofferrequest: async(_, args, { req }) => {
            if(validateemail(args.email)){ //check that the email is valid
                const db = await DbConnection.Get()
                const Leads = db.collection('leads')
                offeraction(args)
                args.date = new Date()
                await Leads.insertOne(args) //insert request into leads database.
                return true //assume everything processed.
            } else throw new Error('Invalid email.')
        }
    }
}

function offeraction(args) {
    switch(args.offer){
        case '5stephabitguide':
            emailHabitGuide(args.name, args.email)
            return
        case 'freeintrosession':
            //emailFreeIntroSession(args.name, args.email)    
            return   
        default:
            throw new Error('Sorry, we can\'t find that offer.')
    }
}

export async function sessiontrack(
    req,
    args,
    page,
    action,
    result,
    actioninfo,
    abconfig,
    screenwidth,
    browser,
) {
    const db = await DbConnection.Get()
    const Sessions = db.collection('sessions')
    const Session = await Sessions.findOne({
        session: req.session.id
    })
    //currently query string coming through as different fields on website and app.
    const query = args.search ? args.search : args.url
    let update = { lastrequest: new Date() }
    if (args.email)
        update.email = req.session.user ? req.session.user.email : args.email
    if (page === 'signup' || page === 'googlesignup')
        update.signedup = { email: update.email, time: new Date() }

    //check if bot and tag as bot for tracking records.
    const ipaddress = getipaddress(req)
    const botRegexList = [/.*66.249.*./, /.*115.70.*./, /.*85.76.*./, /.*72.14.*./, /.*114.119.*./, /.*17.121.*./, /.*122.199.*./];
    const isBot = botRegexList.some(rx => rx.test(ipaddress));

    if (Session) {
        const pageentry = new Object()
        pageentry.time = new Date()
        pageentry.page = page
        if (abconfig) pageentry.abconfig = querytojson(abconfig)
        if (action) pageentry.action = action
        if (actioninfo) pageentry.actioninfo = actioninfo
        if (result) pageentry.result = result
        if (query) pageentry.query = query
        if (isBot) pageentry.bot = isBot
        pageentry.ip = getipaddress(req)
        pageentry.email = update.email

        Sessions.updateOne(
            {
                session: req.session.id
            },
            {
                $set: update,
                $push: {
                    pages: pageentry
                }
            },
        )
    } else {
        const newsession = new Object()
        newsession.session = req.session.id
        newsession.landedip = getipaddress(req)
        newsession.email = args.email
        newsession.landpage = page ? page : 'app'
        if (screenwidth) newsession.screenwidth = screenwidth
        if (browser) newsession.browser = browser
        if (abconfig) newsession.abconfig = querytojson(abconfig)
        newsession.landed = new Date()
        newsession.lastrequest = new Date()
        if (query) {
            newsession.campaignquery = query
            newsession.campaign = querytojson(query)
        }

        const pageentry = new Object()
        pageentry.time = new Date()
        pageentry.page = page
        if (abconfig) pageentry.abconfig = querytojson(abconfig)
        if (action) pageentry.action = action
        if (actioninfo) pageentry.actioninfo = actioninfo
        if (result) pageentry.result = result
        if (query) pageentry.query = query
        pageentry.ip = getipaddress(req)
        pageentry.email = args.email

        newsession.pages = [pageentry]

        Sessions.insertOne(newsession)
    }
}

export function querytojson(search) {
    try {
        const json = JSON.parse(
            '{"' +
                decodeURI(search)
                    .replace(/"/g, '\\"')
                    .replace(/&/g, '","')
                    .replace(/=/g, '":"') +
                '"}',
        )
        return json
    } catch (error) {
        return error
    }
}
