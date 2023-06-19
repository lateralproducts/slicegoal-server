import { ObjectId } from 'mongodb'
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
import { getoffers } from './payments';

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
      isLoggedin (url: String): User
      getConnectedUsers: [User]
  }

  extend type Mutation {
    googleLogin(firstname: String, lastname: String, email: String, token: String, googleid: String, uiversion: String, urlparams: String): User
    login(email: String!, pwd: String!, setView: String, uiversion: String): User
    setSignUpContext(account: String): Boolean
    signup(email: String, firstname: String, uiversion: String, account: String, queryStringParams: String): Boolean!
    verifyAccount(userid: String, code: String, setView: String, password: String, firstname: String, lastname: String): User
    logout: Boolean!

    updateProfile(firstname: String, lastname: String, email: String, startarea: String): User
    createClient(email: String!, firstname: String, lastname: String): createClientResponse
    
    resetPassword(email: String): Boolean
    setPassword(userid: String, code: String, password: String): User
    updatePassword(userid: String, oldpassword: String, newpassword: String): User
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
  }

  type createClientResponse {
    success: Boolean
    message: String
  }

  type ChatUser {
    _id: String
    name: String
  }
`

export const resolvers = {
    Query: {
        isLoggedin: async(_, args, { req }) => {
            //this is publicly accessible
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            if (!req.session.url) req.session.url = args.url //set the URL string to send back once logged in to load state. rerank. mostly for google auth.
            if (req.session.user) {
                sessiontrack(req, args, 'app', 'arrived', 'session refresh')
                const user = await Users.findOne({
                    _id: ObjectId(getuserid(req.session))
                })
                return user
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
                return ObjectId(connection.friend)
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
                ? await Areas.findOne({ _id: ObjectId(startarea) })
                : null
        },
        views: async(_, __, { req }) => {
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            let query = new Object()
            query.user = getuserid(req.session)
            return await Views.find(query).toArray()
        },
        currentview: async(parent, __, { req }) => {
            if (parent.newView) return parent.newView
            else if (req.session.view) return req.session.view
            else {
                const db = await DbConnection.Get()
                const Views = db.collection('views')
                const Users = db.collection('users')
                const user = await Users.findOne({_id: ObjectId(req.session.user._id)})
                let query = new Object()
                query.user = getuserid(req.session)
                if(user.activeofferid !== 2) query.type = 'owner' //block shared views if not upgraded.
                return await Views.findOne(query) //could improve to find 'default' once ready to do that.
                
            }
        }
    },
    Mutation: {
        updateProfile: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            let user = await Users.findOneAndUpdate(
                { _id: ObjectId(getuserid(req.session)) }, //update this
                { $set: args },
                { returnOriginal: false },
            )
            return user.value
        },

        createClient: async(_, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')

            const db = await DbConnection.Get()
            const Users = db.collection('users')
            const Views = db.collection('views')

            if (req.session.view.type !== 'owner')
                throw new Error('Not owner of wheel')
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
                $and: [{ _id: ObjectId(args.userid) }, { code: args.code }]
            })
            if(!user) throw new Error('Verify details not found. You can try and reset password again.')

            if(user.lastreset){
                let validdate = new Date() //valid to reset for 24 hours.
                validdate.setDate(user.lastreset.getDate() + 1)
                if(validdate < new Date()){
                    throw new Error("Your link has expired. Please try and reset again.")
                }
            }else if (user.state !== 'new') {
                sessiontrack(req, args, 'app', 'verify', 'already registered')
                throw new Error(
                    "Your account didn't verify. If you've signed up before, try logging in.",
                )
            }

            checkPasswordFormat(args.password)

            user = await Users.findOneAndUpdate(
                { _id: ObjectId(args.userid), code: args.code },
                {
                    $set: {
                        state: 'verified',
                        password: bcrypt.hashSync(args.password, 10),
                        firstname: args.firstname,
                        lastname: args.lastname
                        //keep the code so that someone can't hack it.
                    }
                },
            )
            user.value.state = 'verified'
            //overriding state to verified as it doesn't update in returned value.
            sessiontrack(req, args, 'app', 'verify', 'success')
            return await login(user.value, args, req)
        },

        setPassword: async(_, args, { req }) => {
            //This function is publicly accessible
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            //don't allow someone to try and reset without a code.
            if(!args.code) throw new Error('Reset details not found. Please try and reset your password again.')

            let user = await Users.findOne({
                $and: [{ _id: ObjectId(args.userid) }, { code: args.code }]
            })
            if(!user) throw new Error('Reset details not found. Please try and reset your password again.')

            if(user.lastreset){
                let validdate = new Date() //valid to reset for 24 hours.
                validdate.setDate(user.lastreset.getDate() + 1)
                if(validdate < new Date()){
                    throw new Error('Reset details not found. Please try and reset your password again.')
                }
            }

            checkPasswordFormat(args.password)

            user = await Users.findOneAndUpdate(
                { _id: ObjectId(args.userid), code: args.code },
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
                    sessiontrack(req, args, 'app', 'emaillogin', 'failed - not verified')
                    throw new Error('Account has not been verified.')}

                if (await bcrypt.compareSync(args.pwd, user.password)) {
                    if((user.incorrecttries < 6 || user.incorrecttries === undefined) && user.state == 'verified'){
                        return await login(user, args, req)
                    } else {
                        sessiontrack(req, args, 'app', 'login-failed', 'failed - too many incorrect tries or not verified', 'email')
                        await Users.updateOne(
                            { _id: ObjectId(user._id) },
                            {
                                $set: {
                                    incorrecttries:
                                        (user.incorrecttries ? user.incorrecttries : 0) + 1
                                }
                            },
                        )
                        throw new Error('Login Failed.')
                    }
                } else {
                    await Users.updateOne(
                        { _id: ObjectId(user._id) },
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
                    throw new Error('Incorrect password.')
                }
            }

            sessiontrack(req, args, 'app', 'emaillogin', 'failed - not registered')
            throw new Error('Email not registered')
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
                    throw new Error(
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
                IPAddresses.insert({
                    ip: getipaddress(req),
                    block: true,
                    reason: 'attempted to put link in firstname'
                })
                throw new Error(
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
                IPAddresses.insert({
                    ip: getipaddress(req),
                    block: true,
                    reason: 'account limit at 15'
                })
                new Error(
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
                throw new Error(
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
                throw new Error(
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
                    code: bcrypt.hashSync(date.toString(), 7),
                    uiversion: args.uiversion,
                    serverversion: pjson.version,
                    state: 'new',
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
                    throw new Error(
                        'An error has occured', //don't be descriptive with error in case malicious
                    )
                }
            }

            //Get user profile.
            const date = new Date()
            const newcode = bcrypt.hashSync(date.toString(), 7)
            const user = await Users.findOneAndUpdate(
                { email: args.email.toLowerCase() },
                { $set: {
                    code: newcode,
                    lastreset: new Date()
                }}
            )
            
            let emailuser 
            if (user.value) {
                emailuser = user.value
            }
            else {
                //const date = new Date()
                let newuser = {
                    email: args.email.toLowerCase(),
                    firstname: args.firstname,
                    code: newcode,
                    uiversion: args.uiversion,
                    serverversion: pjson.version,
                    state: 'new',
                    profile: args.account,
                    created: date,
                    createdip: getipaddress(req)
                }
                emailuser = await signup(newuser, args, req)
            }

            const queryStringParams = args.queryStringParams ? args.queryStringParams : '' 
            emailResetPassword(emailuser, newcode, queryStringParams)
            sessiontrack(req, args, 'app', 'password-reset', 'success','email')
            return true
        },

        googleLogin: async(_, args, { req }) => {
            //This is publicly accessible, used for signup too.
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            const client = await oAuth2Client

            //generated 27.03 at 9:30
            //const token = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijk4NmVlOWEzYjc1MjBiNDk0ZGY1NGZlMzJlM2U1YzRjYTY4NWM4OWQiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2FjY291bnRzLmdvb2dsZS5jb20iLCJuYmYiOjE2Nzk4Njk3MzMsImF1ZCI6IjIwMDQ0Mjg2NDU3MC1yMnJvN3JoM2FwcDU1ZzgzZzJicXRmZGt0N28zOThjai5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbSIsInN1YiI6IjEwNzM5NzYxOTU3NTA2NDY1OTUwOSIsImhkIjoibGF0ZXJhbHByb2R1Y3RzLmNvbSIsImVtYWlsIjoiZGFuaWVsQGxhdGVyYWxwcm9kdWN0cy5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiYXpwIjoiMjAwNDQyODY0NTcwLXIycm83cmgzYXBwNTVnODNnMmJxdGZka3Q3bzM5OGNqLmFwcHMuZ29vZ2xldXNlcmNvbnRlbnQuY29tIiwibmFtZSI6IkRhbmllbCBTY2hyYWRlciIsInBpY3R1cmUiOiJodHRwczovL2xoMy5nb29nbGV1c2VyY29udGVudC5jb20vYS9BR05teXhhdHhweGFhVDVZcUpGNld6RWhZUzJBOHo1SEdJUTNVRHdQa2R3RD1zOTYtYyIsImdpdmVuX25hbWUiOiJEYW5pZWwiLCJmYW1pbHlfbmFtZSI6IlNjaHJhZGVyIiwiaWF0IjoxNjc5ODcwMDMzLCJleHAiOjE2Nzk4NzM2MzMsImp0aSI6ImNiMjVhZWMxNTkwOTA1NjllZWUwMzYwYTUyNTUyMTc4MTU2Mzg3NWIifQ.TeuZ8q0I4If_PkGUTKsJXbULSixryi-rZ3Tp8w5SxVz3O8qvjqL5DjXES9Z_J6C2NQIR7PXTQbXnQbH5_4-o_RnAeBtvpm9m5r0XxZUD4a9gO9pNaOPT0hTGd1OtXNFwmAj_KRsVMh7f6rR-6jXdpPBZ8kqbK0stmV_6WYvKOPqXZKp0vLJxydgINXbyLHt9wHjLRHB_98UlqDaQ_rwaXAh8LMzm5m4n0yzpZk3W2dhbkGxegrnNZAAna6Yb6UeUtWmIZp1tD917fK3q9OXqindgC5pivhDKKi1ECvML9rSgGAjIi2eaVtVGhzaalAKMbvdcVMCESYB_9zM2TWqEwQ"
            //Google certificates queried here: https://www.googleapis.com/oauth2/v3/certs

            try {
                const ticket = await client.verifyIdToken({
                    idToken: args.token,
                    audience: googleclientId,
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
                throw new Error('Error authenticating with google.')
            }

            if(!args.email) {
                sessiontrack(req, args, 'app', 'login-failed', 'error: no email','google')
                throw new Error('Error authenticating with google. Email not found.')
            }
            if(!args.token) {
                sessiontrack(req, args, 'app', 'login-failed', 'error: no token','google')
                throw new Error('Error authenticating with google. Token not found.')
            }
            if(!args.googleid) {
                sessiontrack(req, args, 'app', 'login-failed', 'error: no googleid','google')
                throw new Error('Error authenticating with google. Googleid not found.')
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
            throw new Error('Error authenticating with google')

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

            let user = await Users.findOne({ _id: ObjectId(args.userid) })
            if (user.state !== 'verified')
                throw new Error(
                    'Password cannot be updated on unverified account',
                )

            const check = bcrypt.compareSync(args.oldpassword, user.password)
            if (!check) throw new Error('Incorrect current password')

            user = await Users.findOneAndUpdate(
                { _id: ObjectId(args.userid) },
                {
                    $set: {
                        password: bcrypt.hashSync(args.newpassword, 10)
                    }
                },
            )

            return user.value
        }
    }
}

export function getname(firstname, lastname, email) {
    return firstname ? firstname + (lastname ? ' ' + lastname : '') : email
}

export function getprofileid(session) {
    if (session.profile) return session.profile._id.toString()
    else return null
}

export function getuserid(session) {
    if (session.user) return session.user._id.toString()
    else return null
}

export function getwheelid(session) {
    if (session.view) return session.view.wheel
    else return null
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
    req.session.user = user

    let view
    let query = new Object()
    query.user = getuserid(req.session)
    if(args.setView) query._id = ObjectId(args.setView)
    if(user.activeofferid !== 2) query.type = 'owner'
    view = await Views.findOne(query)

    if (view) {
        req.session.view = view
        let query = new Object()

        //if (view.type !== 'coach') query.user = user._id.toString() //deciding which profile to pull. Needs more thought.
        
        query.wheel = view.wheel
        const profile = await Profiles.findOne(query, {
            sort: { type: -1 }
        })

        if (profile) req.session.profile = profile
    }
    sessiontrack(req, args, 'app', 'login-success', 'success - user profile loaded', 'email')

    //update user profile with last login details.
    await Users.updateOne( 
        { _id: ObjectId(user._id) },
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

async function createNewViewProfile(args, userid, req) {
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
        return newuser
    } else {
        throw new Error(
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

    if (return_message.length > 0) throw new Error(return_message)
    return return_message
}
