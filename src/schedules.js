import { ObjectId } from "mongodb";
import DbConnection from "./database";
import { emailObjectiveNudge, emailRerankNudge } from "./emails";

var schedule = require("node-schedule");

schedule.scheduleJob({ hour: 14, minute: 53 }, function() {
  //set to UTC time for server
  objectivenudge("daniel@lateralproducts.com");
});

schedule.scheduleJob({ dayOfWeek: 0, hour: 22, minute: 0 }, function() {
  //nudging once a week
  //set to UTC time for server 22 UTC = 8am Melbourne Time. dayOfWeek: 0, hour: 22, minute: 0 is 8am Monday in Melbourne
  //ranknudge(); //holding off sending these messages again for a little bit.
});

async function objectivenudge(email) {
  const db = await DbConnection.Get();
  const Users = db.collection("users");
  const FocusLinks = db.collection("focuslinks");
  const Objectives = db.collection("objectives");

  const user = await Users.findOne({ email: email });

  const links = await FocusLinks.find({
    userid: user._id.toString(),
    $or: [{ snooze: null }, { snooze: { $lt: new Date() } }]
  })
    .sort({ orderrank: 1 })
    .limit(3)
    .toArray();

  const objectives = await Objectives.find({
    _id: {
      $in: links.map(function(link) {
        return ObjectId(link.objective);
      })
    },
    $or: [{ snooze: null }, { snooze: { $lt: new Date() } }]
  })
    .sort({ orderrank: 1 })
    .limit(100)
    .toArray();

  emailObjectiveNudge(user, links, objectives);
}

async function ranknudge() {
  var olduserranks = await new Promise(function(resolve, reject) {
    var twoweeksago = new Date();
    twoweeksago.setDate(twoweeksago.getDate() - 6);

    RankTimes.aggregate(
      //group by user (profile) and see which haven't had a rank for over two weeeks.
      {
        $group: {
          _id: "$userid", //profiles
          user: { $first: "$userid" }, //profiles
          lastrank: { $max: "$date" }
        }
      },
      {
        $match: { lastrank: { $gte: twoweeksago } } //I'm currently also missing all the people who have not updated their ranks.
      },

      function(err, userrankss) {
        if (err) throw err;
        if (userrankss) resolve(userrankss.map(prepare));
        else resolve(null);
      }
    );
  });

  const profiles = await Profiles.find({
    _id: {
      $nin: olduserranks.map(function(userrank) {
        return userrank._id ? ObjectId(userrank._id) : null;
      })
    }
  }).toArray();

  const sendtousers = await Users.find({
    _id: {
      $in: profiles.map(function(profile) {
        return profile.user ? ObjectId(profile.user) : null;
      })
    }
    //state: "verified" //could add this later on to ensure that these emails are only sent to users who are verified.
  }).toArray();

  sendtousers.map(async (user, count) => {
    //needs to be async because waiting for response from email client...
    await new Promise(resolve => setTimeout(resolve, count * 5000)); //delay 5 seconds per index, because gmail blocks using as transactional email client
    //will need/want to update email client to AWS SES or another scaled email service.
    var emailresponse = await emailRerankNudge(user);
  });
}
