import { ObjectId } from 'mongodb'
import bcrypt from 'bcryptjs'

import {
    emailNewClient,
    emailNewPersonal,
    emailNewCoach,
    newUserNotificationEmail,
} from './emails'

import { getuiversion } from '../util/index'

import { createWheel } from './areas'

let pjson = require('../package.json')
import DbConnection from './database'

//import { verifier } from "google-id-token-verifier";
const { OAuth2Client } = require('google-auth-library')

let googleclientId = `${process.env.GOOGLE_CLIENTID}`
const oAuth2Client = new OAuth2Client({
    clientId: googleclientId,
})

export const schema = `
  type User {
    _id: String
    firstname: String
    email: String
    startarea: String
    area: Area
    serverversion: String
    profile: String
    views: [View]
    currentview: View
    url: String
  }
`

export const typeDefs = `

  extend type Query {
      isLoggedin (url: String): User
  }

  extend type Mutation {
    updateProfile(firstname: String, lastname: String, email: String, startarea: String): User
    createClient(email: String!, firstname: String, lastname: String): Boolean
    verifyAccount(userid: String, code: String, password: String): User
    updatePassword(userid: String, oldpassword: String, newpassword: String): User
    login(username: String!, pwd: String!, uiversion: String): User
    setSignUpContext(account: String): Boolean
    signup(email: String, firstname: String, uiversion: String, account: String): Boolean!
    googleLogin(firstname: String!, lastname: String!, email: String!, token: String!, googleid: String!, uiversion: String, urlparams: String): User
    googleSignup(firstname: String!, lastname: String!, email: String!, token: String!, googleid: String!, uiversion: String, urlparams: String): User
    logout: Boolean!
  }

`

export const resolvers = {
    Query: {
        isLoggedin: async (root, args, { req, ip }) => {
            //this is publicly accessible
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            const Logins = db.collection('logins')

            if (!req.session.url) req.session.url = args.url //set the URL string to send back once logged in to load state. rerank. mostly for google auth.
            if (req.session.user) {
                const user = await Users.findOne({
                    _id: ObjectId(getuserid(req.session)),
                })

                await Logins.insertOne({
                    email: req.session.user.email,
                    url: args.url,
                    lastip: getuserIpAddress(req),
                    result: 'success',
                    type: 'loggedin refresh',
                    lastlogin: new Date(),
                })
                return user
            } else {
                await Logins.insertOne({
                    email: 'session removed',
                    url: args.url,
                    lastip: getuserIpAddress(req),
                    result: 'failed',
                    type: 'loggedin refresh',
                    lastlogin: new Date(),
                })

                throw new Error('User not logged in')
            }
        },
    },
    Mutation: {
        updateProfile: async (parent, args, { req }) => {
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

        createClient: async (parent, args, { req }) => {
            if (!req.session.user) throw new Error('Invalid Session')
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            const Views = db.collection('views')
            const Profiles = db.collection('profiles')

            let user = await Users.findOne({ email: args.email.toLowerCase() })
            let userid
            if (user) {
                userid = user._id.toString()
            } else {
                //args.profile = "client"; //this belongs on the view now
                args.state = 'new'
                args.code = bcrypt.hashSync('verifythisyo', 7)
                args.created = new Date()

                let newuser = await Users.insertOne(args) //create record to return id
                args._id = newuser.insertedId.toString() //use args to pass new user id for email link
                emailNewClient(args, req.session.user, req.session.view.name)

                userid = newuser.insertedId.toString() //pass id for creating view and profiles
            }

            //create new view
            let newview = {
                user: userid,
                wheel: req.session.view.wheel,
                name: req.session.view.name,
                type: 'team',
                created: new Date(),
            }
            Views.insertOne(newview)

            //create new profile
            let newprofile = {
                user: userid,
                wheel: req.session.view.wheel,
                name: getname(args.firstname, args.lastname, args.email),
                type: 'member',
                created: new Date(),
            }
            Profiles.insertOne(newprofile)

            return true
        },

        verifyAccount: async (parent, args, { req }) => {
            //This function is publicly accessible
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            let user = await Users.findOne(
                {
                    $and: [
                        {_id: ObjectId(args.userid)},
                        {code: args.code}
                    ]
                }
            )
            if(user.state !== 'new')
                throw new Error(
                    "Your account didn't verify. If you've signed up before, try logging in.",
                )

            const passwordCheck = checkPasswordFormat(args.password)
            if(passwordCheck !== 'Accepted')
                throw new Error(passwordCheck)
    
            user = await Users.findOneAndUpdate(
                { _id: ObjectId(args.userid), code: args.code, state: 'new' },
                {
                    $set: {
                        state: 'verified',
                        password: bcrypt.hashSync(args.password, 10),
                    },
                },
            )
            return user.value
        },

        login: async (parent, args, { req, ip }) => {
            //public function
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            const Logins = db.collection('logins')

            const user = await Users.findOne({
                email: args.username.toLowerCase(),
            })
            //const user = data[username];

            if (user) {
                if (!user.password)
                    throw new Error('Account has not been verified.')

                if (await bcrypt.compareSync(args.pwd, user.password)) {
                    let loggedinuser = await login(user, args, req)
                    return loggedinuser
                } else {
                    await Users.updateOne(
                        { _id: ObjectId(user._id) },
                        {
                            $set: {
                                incorrecttries:
                                    (user.incorrecttries
                                        ? user.incorrecttries
                                        : 0) + 1,
                            },
                        },
                    )

                    await Logins.insertOne({
                        email: user.email,
                        lastip: getuserIpAddress(req),
                        result: 'failed',
                        type: 'username login',
                        lastlogin: new Date(),
                    })

                    throw new Error('Incorrect password.')
                }
            }

            await Logins.insertOne({
                email: args.username,
                lastip: getuserIpAddress(req),
                result: 'not registered',
                type: 'username login',
                lastlogin: new Date(),
            })

            /*           await Users.insertOne({
          email: args.username,
          password: bcrypt.hashSync(args.pwd, 10),
          uiversion: args.uiversion,
          serverversion: pjson.version,
          state: "new",
          profile: "client",
          created: new Date()
        }); */
            throw new Error('Email not registered')
        },

        setSignUpContext: async (parent, { account }, { req }) => {
            req.session.signupcontext = account
            return true
        },

        signup: async (parent, args, { req }) => {
            //This is publicly accessible
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            const user = await Users.findOne({
                email: args.email.toLowerCase(),
            })
            if (user) {
                throw new Error(
                    'If you already have a Cavestep profile with this email you can log in.',
                )
            }

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
                createdip: getuserIpAddress(req),
            }
            let emailuser = await signup(newuser, args, req)

            if (args.account === 'coach') emailNewCoach(emailuser)
            else emailNewPersonal(emailuser)

            return true
        },

        googleLogin: async (parent, args, { req, ip }) => {
            //This is publicly accessible
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            const Logins = db.collection('logins')
            const tokenInfo = await oAuth2Client.getTokenInfo(args.token)
            if ((tokenInfo.email = args.email)) {
                //check token authentication...

                let user = await Users.findOne({
                    email: args.email.toLowerCase(),
                })
                if (!user) {
                    //sign up new google user.
                    args.profile = '' //can't just be coach. need to fix this.
                    args.state = 'verified'
                    args.serverversion = pjson.version
                    args.lastip = getuserIpAddress(req)
                    args.type = 'personal'
                    //req.session.user = user;
                    //args.token = null; //removing the token from saving in database for security
                    args.created = new Date()
                    user = args
                    let newuser = await signup(user, args, req) //automatically sign up google login.
                    return await login(newuser, args, req)
                } else {
                    return await login(user, args, req)
                }
            }
            await Logins.insertOne({
                email: args.email,
                result: 'failed',
                type: 'google login',
                ip: getuserIpAddress(req),
                lastlogin: new Date(),
            })
            throw new Error('Error authenticating with google')

            // https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=%22ya29.GltCByku5ux1wZwDEZziUSrMh_3BVkjqHcpafZF_hC621Z4WivwtzTOysquVDgq73gHoueqReNMgnkoTjUKkdMXbHku_XO1onwyZ_rnGj-yW71foQfBo2NkNlDhx%22
            // https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=%22ya29.GltCByku5ux1wZwDEZziUSrMh_3BVkjqHcpafZF_hC621Z4WivwtzTOysquVDgq73gHoueqReNMgnkoTjUKkdMXbHku_XO1onwyZ_rnGj-yW71foQfBo2NkNlDhx%22
        },

        logout: async (parent, args, { req }) => {
            if (req.session.user)
                if (req.session.user.token)
                    try {
                        await oAuth2Client.revokeToken(req.session.user.token)
                    } catch (error) {
                        console.log(error)
                    }
            delete req.session.user
            req.session.destroy()
            return true
        },

        updatePassword: async(parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Users = db.collection('users')

            let user = await Users.findOne(
                    {_id: ObjectId(args.userid)}
            )
            if(user.state !== 'verified')
                throw new Error('Password cannot be updated on unverified account')

            const check = bcrypt.compareSync(args.oldpassword, user.password)
            if(!check)
                throw new Error('Incorrect current password')
            
            user = await Users.findOneAndUpdate(
                { _id: ObjectId(args.userid)},
                {
                    $set: {
                        password: bcrypt.hashSync(args.newpassword, 10),
                    },
                },
            )

            return user.value
        }
    },
    User: {
        area: async ({ startarea }, args, { req }) => {
            const db = await DbConnection.Get()
            const Areas = db.collection('areas')
            const Views = db.collection('views')
            return startarea
                ? await Areas.findOne({ _id: ObjectId(startarea) })
                : null
        },
        views: async (parent, args, { req }) => {
            const db = await DbConnection.Get()
            const Views = db.collection('views')
            let query = new Object()
            query.user = getuserid(req.session)
            return await Views.find(query).toArray()
        },
        currentview: async (parent, args, { req }) => {
            if (req.session.view) return req.session.view
            else {
                const db = await DbConnection.Get()
                const Views = db.collection('views')
                let query = new Object()
                query.user = getuserid(req.session)
                return await Views.find(query)
                    .sort({ defaultview: 1 })
                    .limit(1)
                    .toArray()
            }
        },
    },
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

async function login(user, args, req) {
    const db = await DbConnection.Get()
    const Users = db.collection('users')
    const Logins = db.collection('logins')
    const Views = db.collection('views')
    const Profiles = db.collection('profiles')
    if (
        (user.incorrecttries < 6 || user.incorrecttries === undefined) &&
        user.state == 'verified'
    ) {
        user.serverversion = pjson.version
        req.session.user = user

        const view = await Views.findOne({
            user: user._id.toString(),
        })

        if (view) {
            req.session.view = view
            let query = new Object()

            if (view.type !== 'coach') query.user = user._id.toString()
            query.wheel = view.wheel
            const profile = await Profiles.findOne(query, {
                sort: { type: -1 },
            })

            if (profile) req.session.profile = profile
        } else {
            //createWheel(user, user._id.toString(), "personal");
            //this was causing problems with google logins creating two wheels.
        }

        await Logins.insertOne({
            email: user.email,
            lastip: getuserIpAddress(req),
            result: 'success',
            type: 'username login',
            lastlogin: new Date(),
        })

        await Users.updateOne(
            { _id: ObjectId(user._id) },
            {
                $set: {
                    uiversion: args.uiversion,
                    lastip: getuserIpAddress(req),
                    lastlogin: new Date(),
                },
            },
        )
        user.url = req.session.url
        return user
    }

    await Logins.insertOne({
        email: args.username,
        lastip: getuserIpAddress(req),
        result: 'failed',
        type: 'username login',
        lastlogin: new Date(),
    })

    await Users.updateOne(
        { _id: ObjectId(user._id) },
        {
            $set: {
                incorrecttries:
                    (user.incorrecttries ? user.incorrecttries : 0) + 1,
            },
        },
    )

    throw new Error('Login Failed.')
}

async function signup(newuser, args, req) {
    const db = await DbConnection.Get()
    const Users = db.collection('users')
    newuser.lastip = getuserIpAddress(req)
    let userid = (await Users.insertOne(newuser)).insertedId.toString()
    /* await createWheel(
        newuser,
        userid,
        args.account,
        'Your New Wheel',
        null,
        getuiversion(req.session),
    ) */
    newUserNotificationEmail(newuser)

    return newuser
}

export const getuserIpAddress = request => {
    const headers = request.headers
    if (!headers) return null
    const ipAddress = headers['x-forwarded-for']
    if (!ipAddress) return null
    return ipAddress
}

function checkPasswordFormat (password){
    const alpha_char = /[a-z]/i //regex of alphabetical chars
    let return_message = ''
    if(password.length > process.env.PASSWORD_MAX_LENGTH)
        return_message += `Password must be fewer than ` 
        + `${process.env.PASSWORD_MAX_LENGTH} characters `
        + `in length `
    if(password.length < process.env.PASSWORD_MIN_LENGTH)
        return_message += `Password must be more than ` 
        + `${process.env.PASSWORD_MIN_LENGTH} characters `
        + `in length `
    if(!alpha_char.test(password))
        return_message += 'Password must contain at least ' 
        + '1 alphabetical character'

    if(return_message.length === 0)
        return 'Accepted'

    return return_message
}
