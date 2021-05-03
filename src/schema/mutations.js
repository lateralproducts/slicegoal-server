export const Mutations = `
    type Mutation {
      login(username: String!, pwd: String!, uiversion: String): User
      signup(email: String, firstname: String, uiversion: String, account: String): Boolean!
      googleLogin(firstname: String!, lastname: String!, email: String!, token: String!, googleid: String!, uiversion: String, urlparams: String): User
      googleSignup(firstname: String!, lastname: String!, email: String!, token: String!, googleid: String!, uiversion: String, urlparams: String): User
      logout: Boolean!
      createArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
      updateArea(rootarea: String, name: String, definition: String, vision: String, area: String): Area
      deleteArea(area: String): Area
      createAreaLink(rootarea: String, area: String, title: String, notes: String): Boolean
      deleteAreaLink(rootarea: String, area: String): Area
      createCoachArea(rootarea: String, name: String, definition: String, vision: String, notes: String): Area
      createRankTime(area: String, rank: Int, datetime: String, note: String): RankTime
      createGoalTime(area: String, goal: Int, datetime: String, note: String, goaldate: String): GoalTime
      createNote(datetime: String, prompt: String, answer: String, arealinks: [AreaLinkIn]): Spaced
      updateNote(noteid: String, datetime: String, prompt: String, answer: String): Spaced 
      createNoteLink(noteid: String, area: String): Boolean
      updateNoteLink(linkid: String, notes: String): Boolean
      removeNoteLink(linkid: String): Boolean
      createNewNoteLink(areaname: String!, noteid: String!): Boolean
      markSpacedYes(noteId: String, datetime: String): Boolean
      markSpacedNo(noteId: String, datetime: String): Boolean
      savePomodoro(area: String, links: [String], notes: String, objective: String, datetime: String, minutes: Int): Boolean!
      submitFeedback(title: String, description: String): Boolean
      toggleFocusFlag(rootarea: String!, area: String!): Boolean
      setSignUpContext(account: String): Boolean
      setView(viewid: String): View
      setProfile(profileid: String!): Profile
      updateProfile(firstname: String, lastname: String, email: String, startarea: String): User
      removeStartArea: Boolean!
      createObjective(datetime: String, objective: String, notes: String, keys:[KeyIn], arealinks: [AreaLinkIn]): Objective
      updateObjective(objectiveId: String!, objective: String, notes: String, datetime: String, complete: String, keys:[KeyIn]): Objective
      checkKey(objectiveId: String!, index: Int, check: Boolean): Boolean
      updateObjectiveOrder(objectives: [String]): Boolean
      updateFocusOrder(objectives: [String]): Boolean
      createObjectiveLink(objectiveid: String, areaid: String): Boolean
      createNewObjectiveLink(areaname: String!, objectiveid: String!): Boolean
      updateObjectiveLink(linkid: String!, notes: String, snooze: String): Boolean
      removeObjectiveLink(linkid: String!): Boolean
      snoozeObjectiveLink(objectiveid: String!, snooze: String!): Boolean
      saveFocusLink(area: String!, objective: String!, datetime: String!, links: [String]): Boolean
      snoozeFocusLink(objectiveid: String!, snooze: String!): Boolean
      createClient(email: String!, firstname: String, lastname: String): Boolean
      verifyAccount(userid: String, code: String, password: String): User
      createNewWheel(viewtype: String, templatewheel: String): View 
      copyWheel(wheelid: String!, viewtype: String!): Boolean
      runUpdate101: Boolean
    }
`;
