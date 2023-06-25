const AWS = require('aws-sdk')
import {
    //CreateBucketCommand,
    //DeleteObjectCommand,
    //DeleteBucketCommand,
    PutObjectCommand,
    GetObjectCommand
} from "@aws-sdk/client-s3"
import { S3Client } from "@aws-sdk/client-s3" // Helper function that creates an Amazon S3 service client module.
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const s3config = {
    signatureVersion: 'v4',
    apiVersion: '2006-03-01',
    accessKeyId: `${process.env.AWS_ACCESS_KEY_ID}`,
    secretAccessKey: `${process.env.AWS_SECRET_ACCESS_KEY}`,
    region: `${process.env.AWS_DEFAULT_REGION}`
}
const S3 = new AWS.S3(s3config)
const s3Client = new S3Client(s3config)
const s3bucket = `${process.env.AWS_BUCKET}`

export const linkParams = (file) => {
    return {
        //bucket access permissions defined against authenticated IAM user and/or bucket in AWS.
        Bucket: s3bucket,
        Key: file.folder + '/' + file.name,
        ContentType: file.type,
        //VersionId: <aws-s3-object-version-id> // for file version.
    }
};

const requestheader = {
    expiresIn: 60, //in seconds.
    //mode: 'no-cors', //cors policy set on s3 bucket.
    //origin: `${process.env.PATH_URL}` //www.slicegoal.com
}

export async function getUploadLinkFromAWS(file){ 
    //generating a publicly accessible link to upload a new file.
    const params = linkParams(file)
    try {
        const putcommand = new PutObjectCommand(params) //PUT object link
        const signedUrl = await getSignedUrl(s3Client, putcommand, requestheader)
        return signedUrl
    } catch (err) {
        console.log("Error creating presigned URL for upload.", err);
        return triggererror("Error creating presigned URL for upload.")
    }
}

export async function getReadLinkfromAWS(file){ 
    //generating a publicly accessible link to download a new file.
    const params = linkParams(file)
    try {
        const getcommand = new GetObjectCommand(params) //Get object link
        const signedGetUrl = await getSignedUrl(s3Client, getcommand, requestheader)
        return signedGetUrl
    } catch (err) {
        console.log("Error creating presigned URL for read.", err);
        return triggererror("Error creating presigned URL for read.")
    }
}

export async function getfile(file,res){
    //passing the file through the server.
    S3.getObject({
        Key: file,
        Bucket: s3bucket
    }, (err, data) => {
        if (err) {
            return res.send({ 'error': err }) //could send local error image
        }
        if (file === 'pixel.png') {
            //set headers to make sure email clients don't cache files for tracking pixel.
            res.writeHead(200, 
            {'Content-Type': 'image/png',
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Cache-Control': 'post-check=0, pre-check=0',
            'Pragma': 'no-cache'})
        }
        res.write(data.Body, 'binary')
        res.end(null, 'binary')
        return //res.send(data)
    })
}