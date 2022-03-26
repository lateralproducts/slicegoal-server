import { ObjectId } from 'mongodb'
import { getuserid, getipaddress } from './users'
import DbConnection from './database'
import rapid from 'eway-rapid'

var apiKey = `${process.env.PAYMENT_API_KEY}`,
    password = `${process.env.PAYMENT_API_PASS}`,
    rapidEndpoint = `${process.env.PAYMENT_API_ENV}`

var ewayclient = rapid.createClient(apiKey, password, rapidEndpoint)

export const typeDefs = `
    extend type Query {
        transactionStatus(accessCode: String!): String
        lastNameRecorded: Boolean
        offers: Offers
    }

    extend type Mutation {
        getAccessCode(offerid: Int): PaymentFormFields
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

export const schema = `
    type Offers {
        activeid: Int
        highlightid: Int
        offers: [Offer]
    }
    type Offer {
        offerid: Int
        inclusions: [String]
        offer: String
        price: Price
        highlight: Boolean
    }
    type Price {
        amount: Int
        period: String
    }
`

//masked credit card on eway: 444433XXXXXX1111
//to get the masked card number, query: client.queryCustomer("917758625852") where "917758625852" is the TokenCustomerID
//TokenPayment function will be used to 

//Old Packages:
//'• 1 single-layer personal wheel \n• 1 single-layer coach/team wheel \n • up to 3 clients or team members \n • free for clients & team members \n • access to free templates'
//'• 4 single-layer personal wheels \n• 2 single-layer coach/team wheels \n • 4 to 10 clients or team members \n • free for clients & team members \n • access to expert templates'
//'• 4 multi-layer personal wheels\n• 8 single-layer coach/team wheels\n• 11 to 30 clients or team members \n • free for clients & team members\n • access to expert templates'

//Do I control the feature switch in the server?
//How do we load the feature switch in the front end?
//How do we control the feature usage in the server?
//Need to decide where the subscription sits. Has to be the account.

//Need to log charges. Then log transactions against those charges.
//Need state management for accounts... ie. if paid, account active, if not paid, disable certain features (if already enabled)

const offers = [
    {
        offerid: 0,
        offer: 'Free Plan',
        inclusions: [
            'Productivity tips',
            'Goal setting and tracking',
            'Task setting and tracking',
            'Access to free templates',
            '5000 insights',
            '100 sources',
            'Break down goals and tasks'
        ],
        price: {
            amount: 0 //0 dollars
        }
    },
    {
        offerid: 1,
        offer: 'Productivity Pack',
        inclusions: [
            'Memory tools',
            'Pomodoros',
            'Data Insights for Productivity',
            '20,000 insights',
            '1000 sources',
            'everything in Free Plan'
        ],
        price: {
            amount: 15, //15 dollars
            period: 'month'
        },
        highlight: true
    },
    {
        offerid: 2,
        offer: 'Coaching Enabled',
        inclusions: [
            'Enable coaching functions',
            'Get coaching direction and support',
            'Access to expert templates',
            'Everything in Productivity Pack',
            'Everything in Free Plan'
        ],
        price: {
            amount: 30, //30 dollars
            period: 'month'
        }
    },
    {
        offerid: 3, //offer disabled for now until I work through what is a good offer. Trying productivity tools.
        disabled: true,
        offer: 'Super Coach',
        inclusions: [
            'Coach your own clients',
            'Create custom templates',
            'Multiple wheels for clients',
            'Plus coaching enabled features',
            'Plus all free tools',
        ],
        price: {
            amount: 30, //30 dollars
            period: 'month'
        }
    },
]

/* function returnResult(result) {
    switch (result) {
        case '':
            return 'Processing... '
        case 'error':
        case 'failed':
            return 'Transaction failed'
        case 'success':
            return 'Upgrade successful!'
        default:
            return result
    }
} */

//use for messaging in-app, and also, to apply to the subscription on payment.
const campaigns = [
    { 
        promo: 'Free First Month',
        discount: {
            type: 'onceoff',
            amount: 1.0, //as percentage? this is a voucher...
        },
        validofferids: [0,1,2],
        active: {
            startdate: '01-01-2022',
            enddate: '01-02-2022'
        }
    },
    { 
        promo: '30% Off For Life - Limited',
        promoid: 1,
        message: 'To celebrate the launch of Cavestep, we\'re offering a limited time offer. If you sign up now, you\'ll get 30% off for life.',
        discount: {
            type: 'percentage',
            amount: 0.3,
            valid: 'life'
        },
        validofferids: [0,1,2],
        active: {
            startdate: '01-01-2022',
            enddate: '01-02-2022'
        }
    },
    { 
        promo: '30% Off For First 2 Months',
        promoid: 1,
        message: 'To celebrate the launch of Cavestep, we\'re offering a limited time offer. If you sign up now, you\'ll get 30% off for life.',
        discount: {
            type: 'percentage',
            amount: 0.3,
            valid: '2 months'
        },
        validofferids: [0,1,2],
        active: {
            startdate: '01-01-2022',
            enddate: '01-02-2022'
        }
    },
]

//how do I track credit and payments on accounts, profiles, and wheels?

export const resolvers = {
    Query: {
        transactionStatus: async(_, { accessCode }, { req }) => {
            const db = await DbConnection.Get()
            const Transactions = db.collection('transactions')
            const Users = db.collection('users')

            const transaction = await Transactions.findOne(
                { accessCode: accessCode }
            )

            return new Promise((resolve, reject) => {
                //IIFE
                (async function check() {
                    let response = await ewayclient.queryTransaction(accessCode)
                    const txnresponse = response.attributes.Transactions[0]
                    if (txnresponse == null) {
                        return reject(new Error('Transaction not found'))
                    }

                    // Update/Record transaction details
                    Transactions.updateOne(
                        { accessCode: accessCode },
                        {
                            $set: {
                                response: txnresponse,
                                responsetimestamp: new Date(),
                                status: 'checked'
                            }
                        },
                    )

                    //const TokenCustomerID = transaction.TokenCustomerID

                    if (txnresponse.ResponseCode) {
                        return resolve(txnresponse) //This will give messages for success and common errors
                    } else if (response.Errors) {
                        return reject('An error has occurred') //could interpret the errors? -
                    }
                })()
            }).then(
                (txnresponse) => {
                    let message = responseMessage(txnresponse.ResponseCode)
                    // Attach TokenCustomerID to user
                    const user_id = getuserid(req.session)

                    Users.updateOne(
                        { _id: ObjectId(user_id) },
                        { $set: { 
                            TokenCustomerId: txnresponse.TokenCustomerID,
                            hideupgrade: (txnresponse.ResponseCode === '00' || txnresponse.ResponseCode === '08' ) ? true: false,
                            activeofferid: transaction.offer.offerid,
                            offeractive: transaction.offer.offer,
                            lastpaid: new Date()
                        } },
                    )

                    return message
                },
                error => {
                    return error
                },
            )
        },

        lastNameRecorded: async(_, __, { req }) => {
            if (req.session.lastname == null) return false
            return true
        },
        offers: async(_, __, { req }) => {
            var returnoffers = new Object()
            if(req.session.user.activeofferid) returnoffers.activeid = req.session.user.activeofferid
            returnoffers.highlightid = (req.session.user.activeofferid === 1 ? 2 : 1)
            returnoffers.offers = offers.filter(offer => {
                return offer.disabled != true
            })
            return returnoffers
        }
    },
    Mutation: {
        //the transaction itself is triggered from the form directly to EWay.
        //Test credit card no. "4444333322221111"
        getAccessCode: async(_, args, { req }) => {
            const db = await DbConnection.Get()
            const Transactions = db.collection('transactions')

            let firstname = req.session.user.firstname
            let lastname = req.session.user.lastname

            const offer = offers.find(offer => offer.offerid === args.offerid)
            
            //future build to check validity when offering promos.
            //if(offer.active.startdate <= today && offer.active.enddate >= today) //need to work out timezones

            return ewayclient
                .createTransaction(rapid.Enum.Method.TRANSPARENT_REDIRECT, {
                    Customer: {
                        FirstName: firstname,
                        LastName: lastname,
                        Country: 'au'
                    },
                    Payment: {
                        TotalAmount: offer.price.amount * 100 //to just get the access code, we can just send 0
                    },
                    RedirectUrl: `${process.env.PAYMENT_REDIRECT_URL}`,
                    Method: 'ProcessPayment',
                    TransactionType: 'Purchase',
                    SaveCustomer: true
                })
                .then(function(response) {
                    let result = response.attributes

                    Transactions.insertOne({
                        initiated: new Date(),
                        ipaddress: getipaddress(req),
                        user: getuserid(req.session),
                        accessCode: result.AccessCode,
                        offer: offer,
                        status: 'pending'
                    })

                    return {
                        //PaymentFormFields
                        firstname: firstname,
                        lastname: lastname,
                        accessCode: result.AccessCode,
                        formActionUrl: result.FormActionURL
                    }
                })
        },

        //only commenting out for now, because may use for scheduled monthly subscriptions.
        /* chargeCustomer: async (root, { accessCode }, { req }) => {
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
        }, */

        addLastNameToUser: async(_, { lastname }, { req }) => {
            const user_id = getuserid(req.session)
            const db = await DbConnection.Get()
            const Users = db.collection('users')
            Users.updateOne(
                { _id: ObjectId(user_id) },
                { $set: { lastname: lastname } },
            )
            return true
        }
    }
}

function responseMessage(responseCode) {
    let result = {
        '00': 'success',
        '08': 'success',
        '01': 'Your card issuer has indicated problem with card number. Please contact your bank.',
        '03': 'No Merchant - please contact your bank to ensure your merchant account is active and is an Ecommerce terminal.',
        '05': 'Your bank has declined your payment for an unspecified reason.',
        '06': 'Transaction failed. Please ensure card details are correct.',
        '12': 'Transaction failed. Please ensure card details are correct.',
        '14': 'Transaction failed. Please ensure card details are correct.',
        '51': 'Your card issuer has declined the transaction because of insufficient funds.'
    }[responseCode]

    return result === undefined ? responseCode : result
}
