import { ObjectId } from 'mongodb'
import fetch from 'node-fetch'

import { getuserid } from './users'
import DbConnection from './database'

const TRANSACTION_TIMEOUT = 10 //(second)
const TRANSACTION_STATUS_POLLING_PERIOD = 0.5 //(seconds)

export const typeDefs = `
    extend type Query {
        transactionStatus(accessCode: String!): String
        lastNameRecorded: Boolean
    }

    extend type Mutation {
        getAccessCode: PaymentFormFields
        chargeCustomer(accessCode: String!): Boolean
        addLastNameToUser(lastname: String!): Boolean
    }

    type PaymentFormFields {
        firstname: String
        lastname: String
        redirectURL: String
        accessCode: String
        formActionUrl: String
    }

`

export const resolvers = {
    Query: {
        transactionStatus: async (root, { accessCode }, req) => {
            const db = await DbConnection.Get()
            const Transactions = db.collection('transactions')
            let transaction
            let counter = 0

            return new Promise((resolve, reject) => {
                //IIFE
                ;(async function check() {
                    transaction = await Transactions.findOne({
                        accessCode: accessCode,
                    })

                    if (transaction === null) {
                        return reject(new Error('Transaction not found'))
                    }

                    if (transaction.responseCode !== null) {
                        return resolve(transaction.responseCode)
                    }

                    counter++
                    if (
                        counter <
                        TRANSACTION_TIMEOUT / TRANSACTION_STATUS_POLLING_PERIOD
                    ) {
                        setTimeout(() => {
                            check()
                        }, TRANSACTION_STATUS_POLLING_PERIOD * 1000)
                    } else {
                        return reject(new Error('Transaction timed out'))
                    }
                })()
            }).then(
                result => {
                    return responseMessage(result)
                },
                error => {
                    return error
                },
            )
        },

        lastNameRecorded: async (root, args, { req }) => {
            if (req.session.lastname == null) return false
            return true
        },
    },

    Mutation: {
        getAccessCode: async (root, args, { req }) => {
            let firstname = req.session.user.firstname
            let lastname = req.session.user.lastname

            let result = await fetch(`${process.env.PAYMENT_ACCESS_CODE_URL}`, {
                method: 'POST',
                headers: {
                    Authorization: `${process.env.PAYMENT_AUTHORIZATION_HEADER}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    Customer: {
                        FirstName: firstname,
                        LastName: lastname,
                        Country: 'au',
                    },
                    Payment: {
                        TotalAmount: `${process.env.PAYMENT_ACCESS_CODE_AMOUNT}`,
                    },
                    RedirectUrl: `${process.env.PAYMENT_REDIRECT_URL}`,
                    Method: 'CreateTokenCustomer',
                    TransactionType: 'Purchase',
                }),
            })
            result = await result.json()

            let return_Obj = {
                firstname: firstname,
                lastname: lastname,
                accessCode: result.AccessCode,
                formActionUrl: result.FormActionURL,
            }

            const db = await DbConnection.Get()
            const Transactions = db.collection('transactions')

            await Transactions.insertOne({
                user: getuserid(req.session),
                accessCode: return_Obj.accessCode,
                responseCode: null,
            })

            return return_Obj
        },

        chargeCustomer: async (root, { accessCode }, { req }) => {
            let response = await fetch(
                `${process.env.PAYMENT_CUSTOMER_TOKEN_URL}${accessCode}`,
                {
                    method: 'GET',
                    headers: {
                        Authorization: `${process.env.PAYMENT_AUTHORIZATION_HEADER}`,
                    },
                },
            )

            // Wait for CustomerToken
            response = await response.json()
            const TokenCustomerID = response.TokenCustomerID

            // Attach TokenCustomerID to user
            const user_id = getuserid(req.session)
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            Users.updateOne(
                { _id: ObjectId(user_id) },
                { $set: { TokenCustomerId: TokenCustomerID } },
            )

            return chargeToken(req, TokenCustomerID, accessCode)
        },

        addLastNameToUser: async (root, { lastname }, { req }) => {
            const user_id = getuserid(req.session)
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            Users.updateOne(
                { _id: ObjectId(user_id) },
                { $set: { lastname: lastname } },
            )
            return true
        },
    },
}

async function chargeToken(req, TokenCustomerID, accessCode) {
    //Charge with token
    let response = await fetch(`${process.env.PAYMENT_TRANSACTION_URL}`, {
        method: 'POST',
        headers: {
            Authorization: `${process.env.PAYMENT_AUTHORIZATION_HEADER}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            Customer: {
                TokenCustomerID: TokenCustomerID,
            },
            Payment: {
                TotalAmount: `${process.env.PAYMENT_MONTHLY_COST}`,
            },
            Method: 'ProcessPayment',
            TransactionType: 'Recurring',
        }),
    })

    response = await response.json()

    const db = await DbConnection.Get()
    const Transactions = db.collection('transactions')
    if (accessCode) {
        Transactions.updateOne(
            { accessCode: accessCode },
            {
                $set: {
                    responseCode: response.ResponseCode,
                    timestamp: new Date(),
                },
            },
        )
    } else {
        Transactions.insertOne({
            user: getuserid(req.session),
            responseCode: response.ResponseCode,
            timestamp: new Date(),
        })
    }
    return true
}

function responseMessage(responseCode) {
    let result = {
        '00': 'success',
        '08': 'success',
        '01': 'Issuer has indicated problem with card number',
        '03':
            'No Merchant - please contact your bank to ensure \
        your merchant account is active and is an Ecommerce terminal',
        '05':
            'Your bank has declined your payment for an \
        unspecified reason',
        '06': 'Please ensure card details are correct',
        '12': 'Please ensure card details are correct',
        '14': 'Please ensure card details are correct',
        '51':
            'Your card issuer has declined the transaction \
        on basis of insufficient funds',
    }[responseCode]

    return result == 'undefined' ? 'error' : result
}
