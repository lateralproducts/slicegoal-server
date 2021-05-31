export const Queries = `
    type Query {
      isLoggedin (url: String): User
      areas (readdate: String): [Area]
      views: [View]
      profiles: [Profile]
      ranktimes(areaId: String): [RankTime]
      goaltimes(areaId: String): [GoalTime]
      area(_id: String!, navdirection: String, readdate: String): Area
      lastranktime(areaId: String): RankTime
      lastgoaltime(areaId: String): GoalTime
      arealinks(area: String): [AreaLink]
      readPomoData(area: String): PomodoroData
      readObjectivePomoData(objective: String): PomodoroData
      objectives(area: String!): [Objective]
      objectiveLinks(area: String, objective: String, search: String, date: String): [ObjectiveLink]
      pomodoros(objectiveId: String): [Pomodoro]
      notes(area: String): [NoteLink]
      searchnotes(search: String, spaced: Boolean): [Note]
      noteLinks(noteid: String): [NoteLink]
      focusLinks(limit: Int, area: String): [Focus]
      focusLink(focuslink: String): Focus
      wheels:[Wheel]
    }
`;
