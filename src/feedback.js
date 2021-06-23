
export const typeDefs = `
    extend type Mutation {
    submitFeedback(title: String, description: String): Boolean
    }
`;


const resolvers = {
    Mutation: {
      submitFeedback: async (root, args, { req }) => {
        const db = await DbConnection.Get()
        const Emails = db.collection("emails")
        const Feedback = db.collection("feedback")
        args.userid = getuserid(req.session);
        args.serverversion = pjson.version;
        args.uiversion = getuiversion(req.session);
        args.date = new Date(args.datetime);
  
        var emailresponse = await emailFeedback(
          req.session.user,
          args.description
        );
        Emails.insertOne(emailresponse);
        await Feedback.insertOne(args);
        return true;
      },
    }
  };