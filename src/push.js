import { admin } from "../util/firebase-admin.js";

export async function pushNotification(token, title, body, data) {
    
    try {
        const message = {
          token,
          notification: {
            title,
            body,
          },
          data: data || {},
          apns: {
            payload: {
              aps: {
                sound: "default",
              },
            },
          },
        };
    
        const response = await admin.messaging().send(message);
        console.log("Successfully sent push notification:", response);
      } catch (err) {
        console.error("Error sending FCM message:", err);
      }

}
    