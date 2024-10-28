import DbConnection from './database'
import { ObjectId } from 'mongodb' 
import { triggererror } from './graphqlserver';
import { getprofileid, getuserid } from './users'
import { getUploadLinkFromAWS, getReadLinkfromAWS, copyS3File } from './storage'
import { log } from './logging';

export const schema = `
    type FileUploadLink {
        uploadlink: String
        fileid: String
    }

    type FilePreview {
        _id: String
        type: String
        show: String
        fileurl: String
        name: String
    }
`

export const typeDefs = `
    extend type Query {
        fileDownloadUrl(fileid: String): String
        filePreview(fileid: String!): FilePreview
        filePreviews(fileids: [String!]): [FilePreview]
    }
    
    extend type Mutation {
        getUploadLink(name: String, type: String, size: Int): FileUploadLink
        saveFileToInsight(fileid: String, insightid: String): Boolean
        saveFileToSource(fileid: String, sourceid: String): Boolean
    }
`

export const resolvers = {
    Query: {
        filePreview: async(_, {fileid}, { req }) => {
            return await getfileid(req, fileid)
        },
        filePreviews: async(_, {fileids}, { req }) => {
            return await getPreviews(req, fileids)
        },
        fileDownloadUrl: async(_, {fileid}, { req }) => {
            
            const db = await DbConnection.Get()
            const Files = db.collection('files')
            const file = (await Files.find({_id: new ObjectId(fileid), profileid: getprofileid(req.session)}))

            if(file) {
                var awsfile = new Object()
                awsfile.folder = getprofileid(req.session) //set folder as profileid
                awsfile.name = fileid
                return await getReadLinkfromAWS(awsfile)
            }
            else throw Error('File not found.')
        }
    },
    Mutation: {
        getUploadLink: async(_, {name, type, size}, { req }) => {
            
            const db = await DbConnection.Get()
            const Files = db.collection('files')
            const uuid = (await Files.insertOne({name: name, type: type, profileid: getprofileid(req.session), uploadedby: getuserid(req.session), uploaded: new Date()})).insertedId.toString()

            var file = new Object()
            file.name = uuid
            file.type = type
            file.size = size
            file.folder = getprofileid(req.session)
            //could control file sizes here. checking the if size > xxxx then return Error.
            const uploadurl = await getUploadLinkFromAWS(file)

            var returnurl = new Object()
            returnurl.uploadlink = uploadurl
            returnurl.fileid = uuid
            return returnurl
        },
        saveFileToInsight: async(_, {fileid, insightid}, { req }) => {
            
            const db = await DbConnection.Get()
            const Files = db.collection('files')
            const file = (await Files.find({_id: new ObjectId(fileid), profileid: getprofileid(req.session)}))
            if (!file) throw Error('File not found.')

            const Insights = db.collection('insights')
            Insights.updateOne(
                { _id: new ObjectId(insightid) },
                { $set: { file: fileid } },
                function(err) {
                    if (err) throw err
                },
            )
        },
        saveFileToSource: async(_, {fileid, sourceid}, { req }) => {
            
            const db = await DbConnection.Get()
            const Files = db.collection('files')
            const file = (await Files.find({_id: new ObjectId(fileid), profileid: getprofileid(req.session)}))
            if (!file) throw Error('File not found.')

            const Sources = db.collection('sources')
            Sources.updateOne(
                { _id: new ObjectId(sourceid) },
                { $set: { file: fileid } },
                function(err) {
                    if (err) throw err
                },
            )
        }
    }
}

export async function getfileid(req, fileid) {
    const db = await DbConnection.Get()
    const Files = db.collection('files')


    var file = await Files.findOne({_id: new ObjectId(fileid), profileid: getprofileid(req.session)})
    if (!file) throw Error('File not found.')
    
    var awsfile = new Object()
    awsfile.folder = getprofileid(req.session) //set folder as profileid
    awsfile.name = fileid

    var preview = new Object()
    preview.type = file.type
    preview.name = file.name
    preview._id = fileid

    const image_test = /^image/ //check if the file type is an image. If so, send the link.
    if(image_test.test(file.type)){
        preview.fileurl = await getReadLinkfromAWS(awsfile)
        preview.show = 'image'
    } else {
        preview.show = 'fileicon'
    }
    
    return preview
}

export async function shareFileToUser({req, fileid, userid}) {
    if (fileid && userid){
        const db = await DbConnection.Get()
        const Files = db.collection('files')
        const file = await Files.findOne({_id: new ObjectId(fileid), profileid: getprofileid(req.session)})
        if (!file) throw Error('File not found.')
        
        const newfile = {
            name: file.name,
            type: file.type,
            userid: userid,
            sharedby: getuserid(req.session),
            shared: new Date(),
            uploadedby: file.uploadedby,
            uploaded: file.uploaded
        }

        const result = await Files.insertOne(newfile)
        copyS3File({fromfileid: fileid, fromfolder: getprofileid(req.session), tofileid: result.insertedId.toString(), tofolder: userid})

        return result.insertedId.toString()
    } else {
        return null
    }
}

export async function copyFileToProfile({req, fileid, profileid}) {
    try {
        if (profileid){
            const db = await DbConnection.Get()
            const Files = db.collection('files')
            const file = await Files.findOne({_id: new ObjectId(fileid), userid: getuserid(req.session)})
            if (!file) throw Error('File not found.')
            
            const newfile = {
                name: file.name,
                type: file.type,
                profileid: profileid,
                acceptedby: getuserid(req.session),
                accepted: new Date(),
                sharedby: file.sharedby,
                shared: file.shared,
                uploadedby: file.uploadedby,
                uploaded: file.uploaded
            }

            const result = await Files.insertOne(newfile)
            copyS3File({fromfileid: fileid, fromfolder: getuserid(req.session), tofileid: result.insertedId.toString(), tofolder: profileid})
            return result.insertedId.toString()
        } else {
            throw Error('User not found.')
        }
    } catch (error) {
        log(error)
    }
}

export async function getPreviews(req, fileids) {
    const db = await DbConnection.Get()
    const Files = db.collection('files')

    if (!fileids) return null
    const previews = []
    for (const fileid of fileids) {
        if (!fileid) continue 
        const file = await Files.findOne({_id: new ObjectId(fileid), $or: [{profileid: getprofileid(req.session)},{userid: getuserid(req.session)}]})
        if (file.profileid || file.userid) {
            const awsfile = {
                folder: file.profileid ? file.profileid : file.userid,
                name: fileid
            }

            const preview = {
                type: file.type,
                name: file.name,
                _id: fileid
            }

            const image_test = /^image/ //check if the file type is an image. If so, send the link.
            if (image_test.test(file.type)) {
                preview.fileurl = await getReadLinkfromAWS(awsfile)
                preview.show = 'image'
            } else {
                preview.show = 'fileicon'
            }

            previews.push(preview)
        }
    }

    return previews
}