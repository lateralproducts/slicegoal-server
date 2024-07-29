import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';
import bcrypt from 'bcryptjs'

import {
    emailNewClient,
    emailNewPersonal,
    emailResetPassword,
    newUserNotificationEmail
} from './emails'

import { sessiontrack } from './website'

let pjson = require('../package.json')
import DbConnection from './database'
import { setLastAccessedView } from './areas';
import { longdatestring } from '../util/functions';

//import { verifier } from "google-id-token-verifier";
const { OAuth2Client } = require('google-auth-library')

let googleclientId = `${process.env.GOOGLE_CLIENTID}`
const oAuth2Client = new OAuth2Client({
    clientId: googleclientId
})

const PASSWORD_MAX_LENGTH = 64
const PASSWORD_MIN_LENGTH = 8

export const typeDefs = `

  extend type Query {
      isLoggedin (url: String, timezoneoffset: Int): User
      getConnectedUsers: [User]
      onboarding: Onboarding
      preferences: Preferences
  }

  extend type Mutation {
    googleLogin(token: String, googleid: String, uiversion: String, urlparams: String): User
    login(email: String!, pwd: String!, setView: String, uiversion: String): User
    setSignUpContext(account: String): Boolean
    signup(email: String, firstname: String, uiversion: String, account: String, queryStringParams: String): Boolean!
    verifyAccount(code: String, setView: String, password: String, firstname: String, lastname: String): User
    logout: Boolean!

    updateProfile(firstname: String, lastname: String, email: String, startarea: String): User
    createClient(email: String!): createClientResponse
    
    resetPassword(email: String): Boolean
    setPassword(codedate: String, code: String, password: String): User
    updatePassword(userid: String, oldpassword: String, newpassword: String): User

    finishOnboarding: Boolean
  }
`

export const schema = `
  type User {
    _id: String
    firstname: String
    lastname: String
    email: String
    startarea: String
    area: Area
    serverversion: String
    profile: String
    views: [View]
    currentview: View
    url: String
    state: String
    offeractive: String
    hideupgrade: Boolean
    showservice: Boolean
    onboarding: Onboarding
  }

  type createClientResponse {
    success: Boolean
    message: String
  }

  type Onboarding {
    show: Boolean
    wheel: String
    rank: String
    goal: String
  }

  type Preferences {
    rightsidebar: String  
  }

  type ChatUser {
    _id: String
    name: String
  }
`

export const resolvers = {
    Query: {
        onboarding: async(_, args, { req }) => {
            if (req.session.user) {
                const db = await DbConnection.Get()
                const Users = db.collection('users')
                let user = await Users.findOne({
                    _id: new ObjectId(getuserid(req.session))
                })
                return user.onboarding
            }
        },
        preferences: async(_, args, { req }) => {
            if (req.session.user) {
                const db = await DbConnection.Get()
                const Users = db.collection('users')
                let user = await Users.findOne({
                    _id: new ObjectId(getuserid(req.session))
                })
                if(!user.onboarding || !user.onboarding.show){
                    if(!user.preferences) {return {rightsidebar: 'goals'}}
                    else {return user.preferences}
                }
                if (user.onboarding.goal === 'active') {return {rightsidebar: 'goals'}}
                if (user.onboarding.rank === 'active') {return {rightsidebar: 'wheel'}}
                return user.preferences
            }
        },
        isLoggedin: async(_, args, { req }) => {
            //this is publicly accessible
            //const db = await DbConnection.Get()
            //const Users = db.collection('users')

            req.session.timezone = args.timezoneoffset
            req.session.ipaddress = getipaddress(req) //add ip address to session.
            if (!req.session.url) req.session.url = args.url //set the URL string to send back once logged in to load state. rerank. mostly for google auth.
        
            if (req.session.user) {
                sessiontrack(req, args, 'app', 'arrived', 'session refresh')
                return req.session.user
            } else {
                sessiontrack(req, args, 'app', 'arrived')
                return null
            }
        },
        getConnectedUsers: async(_, __, { req }) => {
            const db = await DbConnection.Get()
            const Community = db.collection('community')
            const Users = db.collection('users')

            const community = await Community.find(
                {user: getuserid(req.session)}
            )
            .toArray()

            const user_ids = community.map(connection => {
                return new ObjectId(connection.friend)
            })
            return await Users.find(
                {_id: {$in: user_ids}}
            ).toArray()

        }
    },
    User: {
        area: async({ startarea }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            return startarea
                ? await Areas.findOne({ _id: new ObjectId(startarea) })
                : null
        },
        views: async(_, __, { req }) => {
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            let query = new Object()
            query.user = getuserid(req.session)
            return await Views.find(query).toArray()
        },
        currentview: async(_, __, { req }) => {
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            let query = new Object()
            let userid = getuserid(req.session)

            if (userid) {
                query.user = userid
            } else {
                return null
            }

            const view = await Views.findOne(query, { sort: { lastaccessed: -1 } })
            req.session.view = view //set the session view as well, especially for mobile and watch.
            return  view
        }
    },
    Mutation: {
        updateProfile: async(_, args, { req }) => {
            
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            let user = await Users.findOneAndUpdate(
                { _id: new ObjectId(getuserid(req.session)) }, //update this
                { $set: args },
                { returnOriginal: false },
            )
            return user.value
        },

        createClient: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            const Views = db.collection('views')

            if (req.session.view.type !== 'owner')
                return triggererror('Not owner of wheel')
            else {
                const user = await Users.findOne({
                    email: args.email.toLowerCase()
                })

                let userid
                if (user) {
                    userid = user._id.toString()
                    args.code = user.code
                    args._id = userid
                    if (userid === getuserid(req.session)) {
                        return {
                            success: false,
                            message: 'Cannot share wheel with yourself!'
                        }
                    } else {
                        //Find if this user has already been invited/a view added
                        return Views.findOne({
                            wheel: req.session.view.wheel,
                            email: args.email.toLowerCase()
                        })
                        .then(result => {
                                // User exists and has already been invited
                                if(result){
                                    emailNewClient(
                                        args,
                                        req.session.user,
                                        req.session.view,
                                        result._id.toString(),
                                        'accept'
                                    )
                                    return {
                                        success: true,
                                        message: 'email invite re-sent'
                                    }
                                } else {
                                    // User exists but hasn't been invited to this wheel
                                    return createNewViewProfile(args, userid, req)
                                        .then(result => {
                                            emailNewClient(
                                                args,
                                                req.session.user,
                                                req.session.view.name,
                                                result.insertedId,
                                                'accept',
                                            )
                                            return {
                                                success: true,
                                                message: 'email invite sent'
                                            }
                                        })
                                        .catch(() => {
                                            return {
                                                success: false,
                                                message: 'error sharing wheel'
                                            }
                                        })
                                }
                            })
                            .catch(err => {
                                throw err
                            })
                        }
                    } else {

                        //Completely new SliceGoal user
                        args.state = 'new'
                        args.code = bcrypt.hashSync('verifythisyo', 7)
                        args.created = new Date()
                        args.email = args.email.toLowerCase()
                        args.onboarding = { wheel: 'done', rank: 'active', goal: 'inactive', show: true }
                        let newuser = await Users.insertOne(args) //create record to return id
                        args._id = newuser.insertedId.toString() //use args to pass new user id for email link
                        userid = newuser.insertedId.toString() //pass id for creating view and profiles

                        return createNewViewProfile(args, userid, req)
                            .then(result => {
                                emailNewClient(
                                    args,
                                    req.session.user,
                                    req.session.view.name,
                                    result.insertedId,
                                    'verify'
                                )
                            })
                            .then(() => {
                                return {
                                    success: true,
                                    message: 'email invite sent'
                                }
                            })
                            .catch(() => {
                                return {
                                    success: false,
                                    message: 'error sharing wheel'
                                }
                            })
                }
            }
        },

        verifyAccount: async(_, args, { req }) => {
            //This function is publicly accessible
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            let user = await Users.findOne({
                code: args.code
            })
            if(!user) return triggererror('Verify details not found. You can try and reset password again.')

            if(user.lastreset){
                let validdate = new Date() //valid to reset for 24 hours.
                validdate.setDate(user.lastreset.getDate() + 1)
                if(validdate < new Date()){
                    return triggererror("Your link has expired. Please try and reset again.")
                }
            }else if (user.state !== 'new') {
                sessiontrack(req, args, 'app', 'verify', 'already registered')
                return triggererror(
                    "Your account didn't verify. If you've signed up before, try logging in.",
                )
            }

            checkPasswordFormat(args.password)

            user = await Users.findOneAndUpdate(
                { code: args.code },
                {
                    $set: {
                        state: 'verified',
                        password: bcrypt.hashSync(args.password, 10),
                        firstname: args.firstname,
                        lastname: args.lastname
                        //keep the code so that someone can't hack it.
                    }
                },
                {returnDocument: 'after'} // return the updated document.
            )

            //overriding state to verified as it doesn't update in returned value.
            sessiontrack(req, args, 'app', 'verify', 'success')
            return await login(user.value, args, req)
        },

        setPassword: async(_, args, { req }) => {
            //This function is publicly accessible
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            //don't allow someone to try and reset without a code.
            if(!args.code) return triggererror('Reset details not found. Please try and reset your password again.')
            
            let user = await Users.findOne({ codecreated: args.codedate, code: args.code })
            if(!user) return triggererror('Reset details not found. Please try and reset your password again.')

            if(user.lastreset){
                let validdate = new Date() //valid to reset for 24 hours.
                validdate.setDate(user.lastreset.getDate() + 1)
                if(validdate < new Date()){
                    return triggererror('Reset details not found. Please try and reset your password again.')
                }
            }
            
            checkPasswordFormat(args.password)

            user = await Users.findOneAndUpdate(
                { codecreated: args.codedate, code: args.code },
                {
                    $set: {
                        password: bcrypt.hashSync(args.password, 10),
                        incorrecttries: 0
                    },
                    $unset: { code: ''} //remove the code so that someone can't brute force it.
                },
            )
            
            sessiontrack(req, args, 'app', 'verify', 'success')
            return await login(user.value, args, req)
        },

        login: async(_, args, { req }) => {
            //public function
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            const user = await Users.findOne({
                email: args.email.toLowerCase()
            })
            //const user = data[email];

            if (user) {
                if (!user.password){
                    sessiontrack(req, args, 'app', 'emaillogin', 'failed - password not set up')
                    return triggererror('Password has not been set up.')}

                if (await bcrypt.compareSync(args.pwd, user.password)) {
                    if((user.incorrecttries < 6 || user.incorrecttries === undefined) && user.state == 'verified'){
                        return await login(user, args, req)
                    } else {
                        sessiontrack(req, args, 'app', 'login-failed', 'failed - too many incorrect tries or not verified', 'email')
                        await Users.updateOne(
                            { _id: new ObjectId(user._id) },
                            {
                                $set: {
                                    incorrecttries:
                                        (user.incorrecttries ? user.incorrecttries : 0) + 1
                                }
                            },
                        )
                        return triggererror('Login Failed.')
                    }
                } else {
                    await Users.updateOne(
                        { _id: new ObjectId(user._id) },
                        {
                            $set: {
                                incorrecttries:
                                    (user.incorrecttries
                                        ? user.incorrecttries
                                        : 0) + 1
                            }
                        },
                    )

                    sessiontrack(req, args, 'app', 'emaillogin', 'failed - wrong password')
                    return triggererror('Incorrect password.')
                }
            }

            sessiontrack(req, args, 'app', 'emaillogin', 'failed - not registered')
            //return triggererror('Email not registered')
            return triggererror('Email not registered')
        },

        setSignUpContext: async(_, { account }, { req }) => {
            req.session.signupcontext = account
            return true
        },

        signup: async(_, args, { req }) => {
            //This is publicly accessible
            const db = await DbConnection.Get()
            const IPAddresses = db.collection('ipaddresses')
            const Users = db.collection('users')
        
            //possibly threatening checks
        
            const ipprofile = await IPAddresses.findOne({
                ip: getipaddress(req)
            })
        
            if (ipprofile) {
                if (ipprofile.block === true) {
                    sessiontrack(
                        req,
                        args,
                        'app',
                        'signup',
                        'failed, blocked ip',
                    )
                    return triggererror(
                        'An error has occured', //don't be descriptive with error in case malicious
                    )
                }
            }
            
            /*
            var urlcheck = /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)?/gi
            var urlregex = new RegExp(urlcheck)
        
            if (args.firstname.match(urlregex)) { //checking firstname has url
                sessiontrack(
                    req,
                    args,
                    'app',
                    'signup',
                    'failed, url in name',
                )
                IPAddresses.insertOne({
                    ip: getipaddress(req),
                    block: true,
                    reason: 'attempted to put link in firstname'
                })
                return triggererror(
                    'An error occured', //don't be descriptive with error in case malicious
                )
            }
            */

            const ipaddress = await Users.find({
                createdip: getipaddress(req)
            })
        
            //possibly threatening checks
        
            if (ipaddress.length > 15) { //if created more than 15 accounts block.
                sessiontrack(
                    req,
                    args,
                    'app',
                    'signup',
                    'failed, 15 account limit, blocking',
                )
                IPAddresses.insertOne({
                    ip: getipaddress(req),
                    block: true,
                    reason: 'account limit at 15'
                })
                return triggererror(
                    'An error occured.', //don't be descriptive with error in case malicious
                )
            }
            /*
            if (args.firstname.length > 30) {//checking firstname length
                sessiontrack(
                    req,
                    args,
                    'app',
                    'signup',
                    'failed, firstname length too long',
                )
                return triggererror(
                    'An error occured', //don't be descriptive with error in case malicious
                )
            }
            */
            //non-threatening checks
        
            const user = await Users.findOne({
                email: args.email.toLowerCase()
            })
        
            if (user && user.state === 'verified') { //checking if already signed up.
                sessiontrack(
                    req,
                    args,
                    'app',
                    'signup',
                    'failed, profile already exist and is verifed',
                )
                return triggererror(
                    'If you already have a SliceGoal profile with this email you can log in.',
                )
            }
            
            let emailuser 
            if (user && user.state === 'new') {
                emailuser = user
            }
            else {
                const date = new Date()
                let newuser = {
                    email: args.email.toLowerCase(),
                    firstname: args.firstname,
                    code: bcrypt.hashSync(date.toString() + args.email.toLowerCase(), 7),
                    codecreated: longdatestring(date),
                    uiversion: args.uiversion,
                    serverversion: pjson.version,
                    state: 'new',
                    onboarding: { wheel: 'active', rank: 'inactive', goal: 'inactive', show: true },
                    profile: args.account,
                    created: date,
                    createdip: getipaddress(req)
                }
                emailuser = await signup(newuser, args, req)
            }

            const queryStringParams = args.queryStringParams ? args.queryStringParams : '' 
            //if (args.account === 'coach') emailNewCoach(emailuser, queryStringParams)
            emailNewPersonal(emailuser, queryStringParams)
            sessiontrack(req, args, 'app', 'signup-success', 'success','email')
        
            return true
        },
        resetPassword: async(_, args, { req }) => {
            //This is publicly accessible
            const db = await DbConnection.Get()
            const IPAddresses = db.collection('ipaddresses')
            const Users = db.collection('users')
        
            //possibly threatening check: checking if ip is blacklisted.
            const ipprofile = await IPAddresses.findOne({
                ip: getipaddress(req)
            })
        
            if (ipprofile) {
                if (ipprofile.block === true) {
                    sessiontrack(
                        req,
                        args,
                        'app',
                        'signup',
                        'failed, blocked ip',
                    )
                    return triggererror(
                        'An error has occured', //don't be descriptive with error in case malicious
                    )
                }
            }

            const codedate = longdatestring(new Date())
            //Get user profile.
            const date = new Date()
            const newcode = bcrypt.hashSync(date.toString() + args.email.toLowerCase(), 7)
            const user = await Users.findOneAndUpdate(
                { email: args.email.toLowerCase() },
                { $set: {
                    code: newcode,
                    codecreated: codedate,
                    lastreset: new Date()
                }}
            )
            
            let emailuser 
            if (user.value) {
                emailuser = user.value
            }
            else {
                let newuser = {
                    email: args.email.toLowerCase(),
                    firstname: args.firstname,
                    code: newcode,
                    codecreated: codedate,
                    uiversion: args.uiversion,
                    serverversion: pjson.version,
                    state: 'new',
                    onboarding: { wheel: 'active', rank: 'inactive', goal: 'inactive', show: true },
                    profile: args.account,
                    created: date,
                    createdip: getipaddress(req)
                }
                emailuser = await signup(newuser, args, req)
            }

            if (emailuser.state === "verified"){
                const queryStringParams = args.queryStringParams ? args.queryStringParams : '' 
                emailResetPassword(emailuser, codedate, newcode, queryStringParams)
                sessiontrack(req, args, 'app', 'password-reset', 'success','email')
                return true
            } else return triggererror(
                'Email is not verified.', //don't be descriptive with error in case malicious
            )
        },

        googleLogin: async(_, args, { req }) => {
            //This is publicly accessible, used for signup too.
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            const client = await oAuth2Client

            //Google certificates queried here: https://www.googleapis.com/oauth2/v3/certs

            try {
                const ticket = await client.verifyIdToken({
                    idToken: args.token,
                    audience: args.googleid, //clientid
                });
                if (ticket.payload) {
                    const payload = ticket.payload
                    args.email = payload.email
                    args.firstname = payload.given_name
                    args.lastname = payload.family_name
                    args.googleid = payload.sub
                }
            } catch (message) {
                sessiontrack(req, args, 'app', 'login-failed', message,'google')
                return triggererror('Error authenticating with google.')
            }

            if(!args.email) {
                sessiontrack(req, args, 'app', 'login-failed', 'error: no email','google')
                return triggererror('Error authenticating with google. Email not found.')
            }
            if(!args.token) {
                sessiontrack(req, args, 'app', 'login-failed', 'error: no token','google')
                return triggererror('Error authenticating with google. Token not found.')
            }
            if(!args.googleid) {
                sessiontrack(req, args, 'app', 'login-failed', 'error: no googleid','google')
                return triggererror('Error authenticating with google. Googleid not found.')
            }

            req.session.googleToken = args.token
            delete args.token //don't save google token to DB for security.
            if (args.email) {
                //check token authentication...
                let user = await Users.findOne({
                    email: args.email.toLowerCase()
                })
                if (!user) {
                    //sign up new google user.
                    args.profile = '' //can't just be coach. need to fix this.
                    args.state = 'verified'
                    args.serverversion = pjson.version
                    args.lastip = getipaddress(req)
                    args.type = 'personal'
                    args.onboarding = { wheel: 'active', rank: 'inactive', goal: 'inactive', show: true },
                    //googleid, firstname and lastname should already be on args.
                    args.created = new Date()
                    user = args
                    let newuser = await signup(user, args, req) //automatically sign up google login.
                    sessiontrack(req, args, 'app', 'signup-success', 'success','google')
                    return await login(newuser, args, req)
                } else {
                    if (user.state !== 'verified') {
                        //if the user exists and isn't verified, verify them, because we have their google id verified
                        await Users.updateOne(
                            { _id: user._id },
                            {
                                $set: {
                                    state: 'verified',
                                    googleid: args.googleid
                                }
                            },
                        )
                    }
                    if (!user.googleid) {
                        //if the user exists and isn't verified, verify them, because we have their google id verified
                        let fields = new Object()
                        fields.googleid = args.googleid
                        if(!user.firstname) fields.firstname = args.firstname
                        if(!user.lastname) fields.lastname = args.lastname
                        await Users.updateOne(
                            { _id: user._id },
                            {
                                $set: fields
                            },
                        )
                    }
                    sessiontrack(req, args, 'app', 'login-success', 'successful google login','google')
                    return await login(user, args, req)
                }
            }
            sessiontrack(req, args, 'app', 'login-failed', 'failed google login','google')
            return triggererror('Error authenticating with google')

            // https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=%22ya29.GltCByku5ux1wZwDEZziUSrMh_3BVkjqHcpafZF_hC621Z4WivwtzTOysquVDgq73gHoueqReNMgnkoTjUKkdMXbHku_XO1onwyZ_rnGj-yW71foQfBo2NkNlDhx%22
            // https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=%22ya29.GltCByku5ux1wZwDEZziUSrMh_3BVkjqHcpafZF_hC621Z4WivwtzTOysquVDgq73gHoueqReNMgnkoTjUKkdMXbHku_XO1onwyZ_rnGj-yW71foQfBo2NkNlDhx%22
        },

        logout: async(_, __, { req }) => {
            const db = await DbConnection.Get()
            const Sessions = db.collection('sessions')
            Sessions.updateOne(
                {
                    session: req.session.id
                },
                {
                    $set: {
                        lastrequest: new Date()
                    },
                    $push: {
                        pages: {
                            page: 'logout',
                            time: new Date(),
                            ip: getipaddress(req)
                        }
                    }
                },
            )
            if (req.session.googleToken)
                try {
                    await oAuth2Client.revokeToken(req.session.googleToken)
                    console.log('revoked')
                } catch (error) {
                    console.log(error)
                }
            delete req.session.user
            req.session.destroy()
            console.log('logged out, session destroyed')
            return true
        },

        updatePassword: async(_, args) => {
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            let user = await Users.findOne({ _id: new ObjectId(args.userid) })
            if (user.state !== 'verified')
                return triggererror(
                    'Password cannot be updated on unverified account',
                )

            const check = bcrypt.compareSync(args.oldpassword, user.password)
            if (!check) return triggererror('Incorrect current password')

            user = await Users.findOneAndUpdate(
                { _id: new ObjectId(args.userid) },
                {
                    $set: {
                        password: bcrypt.hashSync(args.newpassword, 10)
                    }
                },
            )

            return user.value
        },
        finishOnboarding: async(_, __, { req }) => {
            const user = req.session.user
            if (user.onboarding && user.onboarding.show) updateUserOnboarding(getuserid(req.session), 'finish')
            req.session.user.onboarding.show = false
            return true
        }
    }
}

export function getname(firstname, lastname, email) {
    return firstname ? firstname + (lastname ? ' ' + lastname : '') : email
}

export function getprofileid(session) {
    if (session.profile) return session.profile._id.toString() 
    else return "no profileid"
}

export function getuserid(session) {
    if (session.user) return session.user._id.toString()
    else return null
}

export function getwheelid(session) {
    if (session.view) { return session.view.wheel }
    else return "no wheelid"
}

export const getipaddress = request => {
    const headers = request.headers
    if (!headers) return null
    const ipAddress = headers['x-forwarded-for']
    if (!ipAddress) return null
    return ipAddress
}

async function login(user, args, req) {
    const db = await DbConnection.Get()
    const Users = db.collection('users')
    const Views = db.collection('views')
    const Profiles = db.collection('profiles')
    
    user.serverversion = pjson.version
    req.session.user = user //add user to the session.
    req.session.ipaddress = getipaddress(req) //add ip address to session.

    let view
    let query = new Object()
    query.user = user._id ? user._id.toString() : "noid" //set id no matter what so it's not possible to attach a random user/view/profile is attached.
    //if(args.setView) query._id = new ObjectId(args.setView)
    //if(user.activeofferid !== 2) query.type = 'owner'
    view = await Views.findOne(query, { sort: { lastaccessed: -1 } })

    if (view) {
        req.session.view = view
        let query = new Object()

        //if (view.type !== 'coach') query.user = user._id.toString() //deciding which profile to pull. Needs more thought.
        
        query.wheel = view.wheel
        const profile = await Profiles.findOne(query, {sort: { type: -1 }})

        if (profile) req.session.profile = profile
    }
    sessiontrack(req, args, 'app', 'login-success', 'success - user profile loaded', 'email')

    //update user profile with last login details.
    await Users.updateOne( 
        { _id: new ObjectId(user._id) },
        {
            $set: {
                uiversion: args.uiversion,
                lastip: getipaddress(req),
                lastlogin: new Date()
            }
        },
    )
    user.url = req.session.url
    return user
}

export async function createNewViewProfile(args, userid, req) {
    const db = await DbConnection.Get()
    const Views = db.collection('views')
    const Profiles = db.collection('profiles')
    //create new view
    let newview = {
        user: userid,
        wheel: req.session.view.wheel,
        name: req.session.view.name,
        type: 'shared',
        created: new Date(),
        email: args.email.toLowerCase(),
        sharedby: req.session.user._id
    }
    const view = await Views.insertOne(newview)
    const profiles = await Profiles.find({
        wheel: req.session.view.wheel
    })
    if (profiles.length === 1)
        Profiles.updateOne(
            { wheel: req.session.view.wheel },
            { $set: { type: 'shared' } },
        )
    if (args.profile) {
        //need to implement this as an option in the front end.
        let newprofile = {
            user: userid,
            wheel: req.session.view.wheel,
            name: getname(args.firstname, args.lastname, args.email),
            type: 'member',
            created: new Date()
        }
        Profiles.insertOne(newprofile)
    } 

    return view
}

async function signup(newuser, __, req) {
    const db = await DbConnection.Get()
    const Users = db.collection('users')
    newuser.lastip = getipaddress(req)
    let userid = (await Users.insertOne(newuser)).insertedId.toString()

    if (userid) {
        newUserNotificationEmail(newuser)
        newuser._id = userid
        return newuser
    } else {
        return triggererror(
            'Sign up failed for some reason. Sorry. Please try again.',
        )
    }
}

function checkPasswordFormat(password) {
    const alpha_char = /[a-z]/i //regex of alphabetical chars
    const numeric_char = /[0-9]/
    // eslint-disable-next-line no-useless-escape
    const special_char = /[!"#$%&'()*+,-.\/:;<=>?@[\]^_`{|}~]/
    let return_message = ''
    if (password.length > PASSWORD_MAX_LENGTH)
        return_message +=
            'Password must be fewer than ' +
            `${PASSWORD_MAX_LENGTH} characters ` +
            'in length '
    if (password.length < PASSWORD_MIN_LENGTH)
        return_message +=
            'Password must be more than ' +
            `${PASSWORD_MIN_LENGTH} characters ` +
            'in length '
    if (!alpha_char.test(password))
        return_message +=
            'Password must contain at least ' + 'one alphabetical character'
    if (!special_char.test(password))
        return_message +=
            'Password must contain at least ' +
            'one of the following characters: ' +
            '!"#$%&\'()*+,-./:;<=>?@[]^_`{|}~ '
    if (!numeric_char.test(password))
        return_message += 'Password must contain at least ' + 'one number'

    if (return_message.length > 0) return triggererror(return_message)
    return return_message
}

export const updateUserOnboarding = async (userId, onboarding) => {
    const db = await DbConnection.Get()
    const Users = db.collection('users')

    //{ wheel: 'active', rank: 'inactive', goal: 'inactive', show: true }
    let setonboarding = {}
    switch (onboarding) {
        case 'wheel':
            setonboarding = { wheel: 'done', rank: 'active', goal: 'inactive', show: true }
            break;
        case 'rank':
            setonboarding = { wheel: 'done', rank: 'done', goal: 'active', show: true }
            break;
        case 'goal':
            setonboarding = { wheel: 'done', rank: 'done', goal: 'done', show: true }
            break;
        case 'finish':
            setonboarding.show = false
            break;
        default:
            setonboarding = { wheel: 'active', rank: 'inactive', goal: 'inactive', show: true }
    }

    const updatedUser = await Users.findOneAndUpdate(
        { _id: new ObjectId(userId) },
        { $set: { onboarding: setonboarding } },
        { returnOriginal: false }
    );

    return updatedUser.value;
};

