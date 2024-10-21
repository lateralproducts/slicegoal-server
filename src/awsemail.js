// Load the AWS SDK for Node.js
var AWS = require('aws-sdk');
// Set the region 
AWS.config.update({region: 'ap-southeast-2'});

export async function sendSESEmail(mailOptions, handleResponse){
    // Create the promise and SES service object
    var sendPromise = new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(mapemail(mailOptions)).promise();

    // Handle promise's fulfilled/rejected states
    sendPromise.then(function(data) {
      mailOptions.response = data.MessageId
      handleResponse(mailOptions);
    }).catch(function(err) {
      console.log(err,err.stack)
      mailOptions.error = err.stack
      handleResponse(mailOptions);
    });
}

function mapemail(mailOptions) {
  // Create sendEmail params 
  var params = {
    Source: mailOptions.from, /* required */
    Destination: { /* required */
      ToAddresses: [
        mailOptions.to
        /* more items */
      ]
      /*CcAddresses: [
        'daniel.c.schrader@gmail.com',
        // more items
      ], */
    },
    Message: { /* required */
      ReplyToAddresses: [
        'daniel@lateralproducts.com',
        //more items 
      ],
      Subject: {
        Charset: 'UTF-8',
        Data: mailOptions.subject
      },
      Body: { /* required */
        Html: {
          Charset: "UTF-8",
          Data: mailOptions.html
        }
      },
    }
  };
  return params
}