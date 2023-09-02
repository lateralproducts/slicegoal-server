import DbConnection from './database'
import { getipaddress } from './users'

import {
    emailHabitGuide,
    emailNotifyNewLeadCoaching,
    signupEmailFunnel,
    emailLateralProducts
} from './emails'
import { validateemail, botips } from '../util/functions';
import { createreport } from './reporting';
import { triggererror } from './graphqlserver';

export const typeDefs = `   
    extend type Mutation {
        trackpage(page: String, search: String, action: String, actioninfo: String, abconfig: String, pagetrack: String, screenwidth: Int, browser: Browser): Boolean
        sendofferrequest(name: String, email: String, offer: String!): String
        sendunsubscriberequest(email: String, reason: String): String
        senddailyreport: Boolean
        sendlateralproductsemail(name:String, email: String, phone: String, interest: String, message: String): Boolean
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
                var response = offeraction(args)
                args.date = new Date()
                args.session = req.session.id
                await Leads.insertOne(args) //insert request into leads database.
                sessiontrack(req,args,'offer','signup', 'success')
                return response //assume everything processed.
            } else return triggererror('That email format doesn\'t look right. Can you check it?')
        },
        senddailyreport: async(_, args, { req }) => {
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
        },
        sendlateralproductsemail: async(_, args, { req }) => {

            if(args.email){
                if (validateemail(args.email)){ //check that the email is valid
                    emailLateralProducts(args)
                } else return triggererror('That email format doesn\'t look right. Can you check it?')
            } else {
                if(args.phone) emailLateralProducts(args)
                else return triggererror('Please add an email or phone number.')
            }

            try {
                const db = await DbConnection.Get()
                const LateralProducts = db.collection('lateralproducts')
                args.date = new Date()
                await LateralProducts.insertOne(args)
                //save request in DB
            } catch (error) {
                console.log(error)
            }

            return true
        },
        sendunsubscriberequest: async(_, args, { req }) => {
            if(validateemail(args.email)){ //check that the email is valid
                const db = await DbConnection.Get()
                const Leads = db.collection('leads')
                const LeadFunnel = db.collection('leadfunnel')
                await Leads.updateOne(
                    {email: args.email}, 
                    {$set:{
                        subscribed: false,
                        reason: args.reason,
                        unsubscribed: new Date()
                    }}
                    )
                await LeadFunnel.updateMany(
                        {'emails.email': args.email}, 
                        {
                            $pull: {
                                'emails': {email: args.email}
                            }
                        }
                        )
                sessiontrack(req,args,'unsubscribe','unsubscribe', 'success')
                return "We've unsubscribed you."
            } else return triggererror('That email format doesn\'t look right. Can you check it?')
        }
    }
}

async function offeraction(args) {
    try {
        switch(args.offer){
            case '5stephabitguide':
                emailHabitGuide(args.name, args.email)
                signupEmailFunnel('habitfunnel', args.name, args.email)
                return "We've sent you your free habit guide! Nice work."
            case 'habitfunnelsignup':
                //added in order to manually sign up leads
                signupEmailFunnel('habitfunnel', args.name, args.email)
                return "You've signed up for the free habit pack! Nice work."
            case 'freeintrosession':
                //emailFreeIntroSession(args.name, args.email)
                emailNotifyNewLeadCoaching(args.name, args.email)   
                return "Great! We've got your request for your FREE session. We'll be in touch to organise a time with you."
            default:
                return triggererror('Sorry, we can\'t find that offer.')
        }
    } catch (error){
        console.log(error)
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
    const session = await Sessions.findOne({
        session: req.session.id
    })
    //currently query string coming through as different fields on website and app.
    const query = args.search ? args.search : args.url ? args.url.replace(/\?/g, '') : ''
    let update = { lastrequest: new Date() }
    if (args.email)
        update.email = req.session.user ? req.session.user.email : args.email
    if (page === 'signup' || page === 'googlesignup')
        update.signedup = { email: update.email, time: new Date() }

    //check if bot and tag as bot for tracking records.
    const ipaddress = getipaddress(req)
    var isBot = false
    try {
        isBot = botips.some(rx => rx.test(ipaddress));
    } catch (error) {
        console.log(ipaddress)
        console.log(botips)
        console.log(error)
    }

    if (session) {
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
            newsession.query = query
            newsession.querydata = querytojson(query) 
        }
        
        // utm parameters use lowercase and separated by - ie. utm_campaign=habits-promotion_version-2
        // utm_source: referrer, ie. google, newsletter, facebook, etc.
        // utm_medium: marketing medium, ie. cpc, banner, email
        // utm_campaign: campaign name, ie. 'build habits' etc.
        // utm_term: identify segment, category or author of the post, position of link, audience (acquisition, retargeting)
        // utm_content: 
        // ?utm_source=google&utm_medium=cpc&utm_term=acquisition&utm_campaign=habit-builder-guide&utm_content=version-1


        //test messages: 'build your habits in 5 steps without frustration'
        //test messages: '5 steps to build your habits without frustration'
        //test messages: '5 steps for good habits without the struggle' //not using 'your'
        //test messages: 'the secret 5 step guide to building your habits' //using number
        //test messages: 'the secret guide to building habits' //not using number
        //test messages: 'the 5 steps to achieve your goals, without frustration'
        //test messages: 'the secret 5 step guide to building your habits, without frustration'

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
    var convert
    try {
        convert = search.toString() //format the string for a json object.
        .replace(/^\?/g, '')
        .replace(/\n/g, '')
        .replace(/"/g, '\\"')
        .replace(/&/g, '","')
        .replace(/=/g, '":"')
    } catch (error) {
        console.log('replace function error')
        return error
    }

    try {
        const json = JSON.parse(
            '{"' +
                decodeURI(convert) 
            + '"}',
        )
        return json
    } catch (error) {
        console.log('decodeURI function error')
        return error
    }
}
