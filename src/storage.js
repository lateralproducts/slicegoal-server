const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');

const S3 = new AWS.S3({
    signatureVersion: "v4",
    apiVersion: '2006-03-01',
    accessKeyId: 'REDACTED_AWS_ACCESS_KEY_ID',
    secretAccessKey: 'REDACTED_AWS_SECRET_ACCESS_KEY',
    region: 'ap-southeast-2'
  })

const s3bucket = 'cavestep-bucket-test'

//var filePath = path.join(__dirname, "files/cavesteplong.png")
export function savefile(file,res){ //incomplete
    /* S3.putObject({
        Key: "cavesteplong.png", //filename
        Body: fs.createReadStream(filePath),
        Bucket: s3bucket,
    }, (err, data) => {
        if (err) {
            console.log("Error: " + err);
        } else {
            console.log("Upload successful: " + data);
        }
    }) */
}

export function getfile(file,res){
    S3.getObject({
        Key: file,
        Bucket: s3bucket
    }, (err, data) => {
        if (err) {
            return res.send({ "error": err }) //could send local error image
        }
        res.writeHead(200, {'Content-Type': 'image/png'});
        res.write(data.Body, 'binary');
        res.end(null, 'binary');
        return //res.send(data)
    })
}