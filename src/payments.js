import { ObjectId } from "mongodb"
import fetch from "node-fetch"

import DbConnection from "./database"

const TRANSACTION_TIMEOUT = 10 //(second)
const TRANSACTION_STATUS_POLLING_PERIOD = 0.5 //(seconds)

export const typeDefs = `
    extend type Query {
        transactionStatus(accessCode: String!): String
    }

    extend type Mutation {
        getAccessCode: PaymentFormFields
        chargeCustomer(accessCode: String!): Boolean
    }

    type PaymentFormFields {
        firstname: String
        lastname: String
        redirectURL: String
        accessCode: String
        formActionUrl: String
    }

    type Transaction {
        responseMessage: String
        timestamp: String
    }
`

export const resolvers = {

    Query: {
        
        transactionStatus: async (root, { accessCode }, req) => {

            const db = await DbConnection.Get();
            const Transactions = db.collection("transactions")
            let transaction
            let counter = 0

            return new Promise((resolve,reject) => {
                //IIFE 
                (async function check() {
                    transaction = await Transactions.findOne({accessCode: accessCode})

                    if(transaction === null) {
                        return reject(new Error("Transaction not found"))
                    }

                    if(transaction.responseMessage !== null){
                        return resolve(transaction.responseMessage)
                    } 

                    counter++
                    if(counter < TRANSACTION_TIMEOUT/TRANSACTION_STATUS_POLLING_PERIOD){
                        setTimeout(() => {
                            check()
                        }, TRANSACTION_STATUS_POLLING_PERIOD*1000)
                    } else {
                        return reject(new Error("Transaction timed out"))
                    }
                })()
            })
            .then((result) => {
                return result
            },
            (error) => {
                return error
            })
        }
    },

    Mutation: {

        getAccessCode: async (root, {req} ) => {
            var firstname = req.session.user.firstname 
            var lastname = req.session.user.lastname
    
            let result = await fetch(`${process.env.PAYMENT_ACCESS_CODE_URL}`, {
                method: "POST",
                headers: {
                "Authorization": `${process.env.PAYMENT_AUTHORIZATION_HEADER}`,
                "Content-Type": "application/json"
                },
                body: JSON.stringify(
                    {"Customer":{
                        "FirstName": firstname,
                        "LastName": lastname,
                        "Country": "au"
                    },
                    "Payment": {"TotalAmount": `${process.env.PAYMENT_ACCESS_CODE_AMOUNT}`},
                    "RedirectUrl": `${process.env.PAYMENT_REDIRECT_URL}`,
                    "Method": "CreateTokenCustomer",
                    "TransactionType": "Purchase"
                })
            })
            result = await result.json()

            var return_Obj = {
                firstname: firstname,
                lastname: lastname,
                accessCode: result.AccessCode,
                formActionUrl: result.FormActionURL
            }

            const db = await DbConnection.Get()
            const Transactions = db.collection("transactions")

            Transactions.insertOne({
                user: getuserid(req.session), 
                accessCode: return_Obj.accessCode,
                responseMessage: null 
            })

            return return_Obj
        },

        chargeCustomer: async (root, { accessCode }, { req }) => {
            var response = await fetch(`${process.env.PAYMENT_CUSTOMER_TOKEN_URL}${accessCode}`, {
                method: "GET",
                headers: {
                    "Authorization": `${process.env.PAYMENT_AUTHORIZATION_HEADER}`,
                },
            })
            
            // Wait for CustomerToken
            response = await response.json()
            const TokenCustomerID = response.TokenCustomerID

            // Attach TokenCustomerID to user
            const user_id = getuserid(req.session)
            const db = await DbConnection.Get()
            const Users = db.collection("users")
            Users.updateOne({_id: ObjectId(user_id)}, {$set: {TokenCustomerId: TokenCustomerID}})

            return chargeToken(req, TokenCustomerID, accessCode)
        }
    }
};

async function chargeToken(req, TokenCustomerID, accessCode) {

    //Charge with token
    var response = await fetch(`${process.env.PAYMENT_TRANSACTION_URL}`, {
        method: "POST",
        headers: {
            "Authorization": `${process.env.PAYMENT_AUTHORIZATION_HEADER}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(
            {
            "Customer": {
                "TokenCustomerID": TokenCustomerID
            },
            "Payment": {
                "TotalAmount": `${process.env.PAYMENT_MONTHLY_COST}`
            },
            "Method": "ProcessPayment",
            "TransactionType": "Recurring"
        })
    })

    response = await response.json()

    const db = await DbConnection.Get()
    const Transactions = db.collection("transactions")
    if(accessCode) {
        Transactions.updateOne(
            {accessCode: accessCode}, 
            {$set: {
                responseMessage: response.ResponseMessage,
                timestamp: new Date()
            }}
        )
    }
    else {
        Transactions.insertOne(
            {
                user: getuserid(req.session),
                responseMessage: response.ResponseMessage,
                timestamp: new Date()
            })
    }
    return true
}