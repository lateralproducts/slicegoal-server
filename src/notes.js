import { ObjectId } from "mongodb";

var pjson = require("../package.json");
import { prepare, getuiversion } from "../util/index";
import { getprofileid } from "./users"
import DbConnection from "./database"


export const schema = `

    type Note {
        _id: String
        area: String
        prompt: String
        answer: String
        spaced: Spaced
        notelink: String
    }

    type NoteLink {
        _id: String
        noteid: String
        areaid: String
        area: Area
        note: Note
        notes: String 
    }

    type Spaced {
        _id: String
        noteid: String
        note: Note
        area: String
        datetimecreated: Float
        datetimelast: Float
        fib0: String
        fib1: String
        datenext: String
    }
`

export const typeDefs = `

  extend type Query {
    noteLinks(noteid: String): [NoteLink]
    notes(area: String): [NoteLink]
    searchnotes(search: String, spaced: Boolean): [Note]
  }

  extend type Mutation {
    markSpacedYes(noteId: String, datetime: String): Boolean
    markSpacedNo(noteId: String, datetime: String): Boolean
    updateNote(noteid: String, datetime: String, prompt: String, answer: String): Spaced 
    createNoteLink(noteid: String, area: String): Boolean
    updateNoteLink(linkid: String, notes: String): Boolean
    removeNoteLink(linkid: String): Boolean
    createNewNoteLink(areaname: String!, noteid: String!): Boolean
    createNote(datetime: String, prompt: String, answer: String, arealinks: [AreaLinkIn]): Spaced
  }

`

export const resolvers = {

    Query: {
        notes: async (parent, args, { req }) => { 
            const db = await DbConnection.Get();
            const NoteLinks = db.collection("notelinks")
            const notelinks = (await NoteLinks.find(
                {
                area: args.area,
                profileid: getprofileid(req.session),
                $or: [{ nextdate: null }, { nextdate: { $lte: new Date() } }]
                },
                { sort: { datecreated: -1 } } //return reverse chron. Last note created at top of list.
            ).toArray()).map(prepare);
    
            return notelinks.map(prepare);
        },
        searchnotes: async (parent, args, { req }) => {
                        
            const db = await DbConnection.Get();
            const Notes = db.collection("notes")
            const notes = (await Notes.find(
                {
                answer: new RegExp(args.search, "i"),
                profileid: getprofileid(req.session),
                prompt: args.spaced ? { $not: { $eq: "" } } : ""
                },
                { sort: { datecreated: -1 } } //return reverse chron. Last note created at top of list.
            ).toArray()).map(prepare);
    
            return notes.map(prepare);
        },
        noteLinks: async (parent, args, { req }) => {
            const db = await DbConnection.Get();
            const NoteLinks = db.collection("notelinks")
            const notelinks = (await NoteLinks.find({
                noteid: args.noteid,
                profileid: getprofileid(req.session)
            }).toArray()).map(prepare);
            return notelinks;
        },
    },
    Mutation:{
        markSpacedYes: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const Spaced = db.collection("spaced")
            const NoteLinks = db.collection("notelinks")
            args.date = new Date(args.datetime);
            const noteId = args.noteId;
            delete args.noteId;
            const spaced = await Spaced.findOne({
                noteid: noteId,
                userid: getprofileid(req.session)
            });
            if (spaced.fib1) {
                args.fib1 = spaced.fib0 + spaced.fib1;
                args.fib0 = spaced.fib1;
            } else {
                args.fib1 = 1;
                args.fib0 = 1;
            }
            var nextdate = new Date(args.datetime); //set nextdate for today + fibonacci sequence
            nextdate.setDate(nextdate.getDate() + args.fib1);
            args.datenext = nextdate;

            NoteLinks.update(
                { noteid: noteId, profileid: getprofileid(req.session) },
                {
                $set: { nextdate: nextdate }
                },
                { multi: true }
            );

            Spaced.update(
                { noteid: noteId, userid: getprofileid(req.session) },
                {
                $set: args
                }
            );
            return true;
        },
        markSpacedNo: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const NoteLinks = db.collection("notelinks");
            const Spaced = db.collection("spaced");
            args.date = new Date(args.datetime);
            args.fib0 = 0;
            args.fib1 = 1;
            const noteId = args.noteId;
            delete args.noteId;
            var nextdate = new Date();
            nextdate.setDate(nextdate.getDate() + 1);
            args.datenext = nextdate;

            const spaced = await Spaced.findOne({
                noteid: noteId,
                userid: getprofileid(req.session)
            });

            await NoteLinks.update(
                { noteid: noteId, profileid: getprofileid(req.session) },
                {
                $set: { nextdate: nextdate }
                },
                { multi: true }
            );

            args.markedno = spaced.markedno ? spaced.markedno + 1 : 1;

            await Spaced.update(
                { noteid: noteId, userid: getprofileid(req.session) },
                {
                $set: args
                }
            );
            return true;
        },
        updateNote: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const Notes = db.collection("notes")
            args.lastedited = new Date(args.datetime);
            var noteid = args.noteid;
            delete args.noteid;
            const res = await Notes.updateOne(
                { _id: ObjectId(noteid) },
                { $set: args }
            );
            return {
                _id: noteid,
                message: "note updated"
            };
        },
        createNoteLink: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const NoteLinks = db.collection("notelinks")
            args.profileid = getprofileid(req.session);
            args.serverversion = pjson.version;
            args.uiversion = getuiversion(req.session);
            args.datecreated = new Date();
            const res = await NoteLinks.insert(args);
            return res.insertedIds[1] ? true : false;
        },
        updateNoteLink: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const NoteLinks = db.collection("notelinks")
            args.profileid = getprofileid(req.session);
            NoteLinks.updateOne(
                { _id: ObjectId(args.linkid) },
                { $set: { notes: args.notes } },
                function(err, obj) {
                if (err) throw err;
                }
            );
            return true;
        },
        removeNoteLink: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const NoteLinks = db.collection("notelinks")
            args.profileid = getprofileid(req.session);
            NoteLinks.deleteOne(
                {
                _id: ObjectId(args.linkid),
                profileid: args.profileid
                },
                function(err, obj) {
                if (err) throw err;
                }
            );
            return true;
        },
        createNewNoteLink: async (root, args, { req }) => {
            const db = await DbConnection.Get();
            const Areas = db.collection("areas")
            const NoteLinks = db.collection("notelinks")
            var newarea = new Object(); //create new area.
            newarea.wheelid = getprofileid(req.session);
            newarea.name = args.areaname;
            const res = await Areas.insert(newarea);
    
            await NoteLinks.insertOne({
                //insert the link to connect note and new area.
                noteid: args.noteid,
                profileid: getprofileid(req.session),
                area: res.insertedIds[0].toString(),
                datecreated: new Date(args.datetime)
            });
            return res.insertedIds[1] ? true : false;
        },
        createNote: async (root, args, { req }) => {
            args.profileid = getprofileid(req.session);
            args.serverversion = pjson.version;
            args.uiversion = getuiversion(req.session);
            args.datecreated = new Date(args.datetime);
            args.lastedited = new Date(args.datetime);
            createnote(args, req);
    
            return {
                _id: 1,
                message: "new note created"
            };
        },
    },
    Note: {
        spaced: async ({ _id }, args, { req }) => {
            const db = await DbConnection.Get();
            const Spaced = db.collection("spaced")
            var spaced = await Spaced.findOne({
            noteid: _id,
            userid: getprofileid(req.session)
            });
            return spaced;
        }
    },
    NoteLink: {
        area: async (parent, args, { req }) => {
            const db = await DbConnection.Get();
            const Areas = db.collection("areas")
            return prepare(
                await Areas.findOne({
                    _id: ObjectId(parent.area)
                })
            );
        },
        note: async ({ noteid }, args, { req }) => {
            const db = await DbConnection.Get();
            const Notes = db.collection("notes")
            return prepare(
                await Notes.findOne({
                    _id: ObjectId(noteid)
                })
            );
        }
    }
}

async function createnote(newnote, req) {

    const db = await DbConnection.Get();
    const Notes = db.collection("notes");
    const Spaced = db.collection("spaced");
    const Areas = db.collection("areas");
    const NoteLinks = db.collection("notelinks");

    try {
        const result = await Notes.insertOne(newnote);

        var note = new Object();
        note.noteid = result.insertedId.toString();
        note.profileid = newnote.profileid;
        note.fib0 = 0;
        note.fib1 = 1;
        var nextdate = new Date(); //set nextdate for tomorrow.
        if (newnote.prompt) nextdate.setDate(nextdate.getDate() + 1);
        note.datenext = nextdate;
        Spaced.insert(note);

        if (newnote.arealinks)
        newnote.arealinks.map(async link => {
            var areaid = link.area._id;
            if (!areaid) {
            var area = {
                name: link.name,
                wheelid: getprofileid(req.session),
                serverversion: pjson.version,
                uiversion: getuiversion(req.session),
                created: new Date()
            };

            const res = await Areas.insert(area);
            areaid = res.insertedIds[0].toString();
            }

            var notelink = new Object();
            notelink.noteid = result.insertedId.toString();
            notelink.profileid = newnote.profileid;
            notelink.area = areaid;
            notelink.notes = link.notes;
            notelink.datecreated = new Date();
            NoteLinks.insert(notelink);
        });
    } catch (error) {
        console.log(error);
    }
}
