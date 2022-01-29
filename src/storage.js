const AWS = require('aws-sdk')
const fs = require('fs')
const path = require('path')

const S3 = new AWS.S3({
    signatureVersion: 'v4',
    apiVersion: '2006-03-01',
    accessKeyId: `${process.env.AWS_ACCESS_KEY_ID}`,
    secretAccessKey: `${process.env.AWS_SECRET_ACCESS_KEY}`,
    region: `${process.env.AWS_DEFAULT_REGION}`
  })

const s3bucket = `${process.env.AWS_BUCKET}`

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

export async function getfile(file,res){
    S3.getObject({
        Key: file,
        Bucket: s3bucket
    }, (err, data) => {
        if (err) {
            return res.send({ 'error': err }) //could send local error image
        }
        res.writeHead(200, //to make sure email clients don't cache files for tracking pixel. Review when making full blown file server.
            {'Content-Type': 'image/png',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Cache-Control': 'post-check=0, pre-check=0',
            'Pragma': 'no-cache'})
        res.write(data.Body, 'binary')
        res.end(null, 'binary')
        return //res.send(data)
    })
}