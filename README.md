# Welcome to the SliceGoal Server

SliceGoal is a tracker for goals, insights, and coaching.
Designed to support optimal outcomes for users.
Helping people focus on the right things at the right time for the best results.

For Local Development

You need to start Mongodb for Local development
mongod --dbpath "$HOME/.local/var/mongodb" --logpath "$HOME/.local/var/log/mongod.log" --fork

```
yarn develop - this starts the server with nodemon which means you can run diagnostics
yarn start - start server without diagnostics
```
