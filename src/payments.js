import { ObjectId } from "mongodb"
import fetch from "node-fetch"

var DbConnection = require("./database")

export const typeDefs = `
    extend type Query {
        getAccessCode: PaymentFormFields
        lastTransaction: Transaction
    }

    extend type Mutation {
        getCustomerToken(accessCode: String!): Boolean
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
            return return_Obj
        },

        lastTransaction: async (root, req) => {
            const user_id = getuserid(req.session)
            let db = await DbConnection.Get();
            const Payments = db.collection("payments");
            const most_recent_payment = await Payments
            .find({ user: user_id }).sort({timestamp: -1}).next()
        
            if(most_recent_payment == null)
                return 0
            else
            var return_Obj = {
                responseMessage: most_recent_payment.ResponseMessage,
                timestamp: most_recent_payment.timestamp
            }
            return return_Obj
        }
    },

    Mutation: {
        getCustomerToken: async (root, { accessCode }, { req }) => {
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
            const user_id = ObjectId(getuserid(req.session))
            let db = await DbConnection.Get();
            const Users = db.collection("users");
            Users.updateOne({_id: ObjectId(user_id)}, {$set: {TokenCustomerId: TokenCustomerID}})

            return chargeToken(req, TokenCustomerID)
        }
    }
};

async function chargeToken(req, TokenCustomerID) {

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
    const user_id = getuserid(req.session)

    let db = await DbConnection.Get();
    const Payments = db.collection("payments");

    Payments.insertOne( 
        {user: user_id, 
        timestamp: new Date(), 
        ResponseMessage: response.ResponseMessage, 
        TokenCustomerId: TokenCustomerID})

    return response.ResponseMessage === "A2000"
}