import { ObjectId } from 'mongodb'
import { getuserid, getuserIpAddress } from './users'
import DbConnection from './database'
import rapid from 'eway-rapid'

var apiKey = `${process.env.PAYMENT_API_KEY}`,
    password = `${process.env.PAYMENT_API_PASS}`,
    rapidEndpoint = `${process.env.PAYMENT_API_ENV}`

var client = rapid.createClient(apiKey, password, rapidEndpoint)

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
            const Users = db.collection('users')

            return new Promise((resolve, reject) => {

                //IIFE
                (async function check() {
                    let response = await client.queryTransaction(accessCode)
                    const transaction = response.attributes.Transactions[0]
                    if (transaction == null) {
                        return reject(new Error('Transaction not found'))
                    }
                    
                    const TokenCustomerID = transaction.TokenCustomerID
    
                    // Attach TokenCustomerID to user
                    const user_id = getuserid(req.session)
                    Users.updateOne(
                        { _id: ObjectId(user_id) },
                        { $set: { TokenCustomerId: TokenCustomerID } },
                    )
                        
                    // Record transaction
                    Transactions.updateOne(
                        { accessCode: accessCode },
                        {
                            $set: {
                                response: transaction,
                                responsetimestamp: new Date(),
                            },
                        },
                    )
    
                    if (transaction.ResponseCode) {
                        return resolve(transaction.ResponseCode) //This will give messages for success and common erro
                    } else if (response.Errors) {
                        return reject('An error has occurred') //could interpret the errors? - 
                    }
                })()
            }).then(
                result => {
                    let message = responseMessage(result)
                    return message
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
            const db = await DbConnection.Get()
            const Transactions = db.collection('transactions')

            let firstname = req.session.user.firstname
            let lastname = req.session.user.lastname

            return client
                .createTransaction(rapid.Enum.Method.TRANSPARENT_REDIRECT, {
                    Customer: {
                        FirstName: firstname,
                        LastName: lastname,
                        Country: 'au',
                    },
                    Payment: {
                        TotalAmount: 1900, //to get the access code, we just send 0
                    },
                    RedirectUrl: `${process.env.PAYMENT_REDIRECT_URL}`,
                    Method: 'ProcessPayment',
                    TransactionType: 'Purchase',
                    SaveCustomer: true,
                })
                .then(function(response) {
                    let result = response.attributes

                    Transactions.insertOne({
                        initiated: new Date(),
                        ipaddress: getuserIpAddress(req),
                        user: getuserid(req.session),
                        accessCode: result.AccessCode,
                    })

                    return {
                        //PaymentFormFields
                        firstname: firstname,
                        lastname: lastname,
                        accessCode: result.AccessCode,
                        formActionUrl: result.FormActionURL,
                    }
                })
        },

        chargeCustomer: async (root, { accessCode }, { req }) => {
            let response = await client
                .queryTransaction(accessCode)
                .then(function(result) {
                    debugger
                    return result.attributes.Transactions[0]
                })

            const TokenCustomerID = response.TokenCustomerID

            // Attach TokenCustomerID to user
            const user_id = getuserid(req.session)
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            Users.updateOne(
                { _id: ObjectId(user_id) },
                { $set: { TokenCustomerId: TokenCustomerID } },
            )
            //With using the rapid SDK, we can charge the customer immediately once they put their details in, then save the token.
            //so commenting out the below.
            //return chargeToken(req, TokenCustomerID, accessCode)

            const Transactions = db.collection('transactions')
            Transactions.updateOne(
                { accessCode: accessCode },
                {
                    $set: {
                        response: response,
                        responsetimestamp: new Date(),
                    },
                },
            )
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
    //Charge with token.
    let response = await client.createTransaction(
        rapid.Enum.Method.TRANSPARENT_REDIRECT,
        {
            Customer: {
                TokenCustomerID: TokenCustomerID,
            },
            Payment: {
                TotalAmount: `${process.env.PAYMENT_MONTHLY_COST}`,
            },
            Method: 'ProcessPayment',
            TransactionType: 'Recurring',
        },
    )

    const db = await DbConnection.Get()
    const Transactions = db.collection('transactions')
    if (accessCode) {
        Transactions.updateOne(
            { accessCode: accessCode },
            {
                $set: {
                    response: response,
                    timestamp: new Date(),
                },
            },
        )
    } else {
        Transactions.insertOne({
            user: getuserid(req.session),
            response: response,
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

    return result === undefined ? responseCode : result
}
