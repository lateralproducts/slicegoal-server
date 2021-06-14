export const Schema = `
    type AreaLink {
      _id: String
      rootarea: String
      area: String
      focus: Boolean
      linkedarea: Area
    }

    type Objective {
      _id: String
      objective: String
      notes: String
      area: String
      datetime: String
      complete: String
      date: String
      keys: [Key]
      time: PomodoroData
    }

    input KeyIn {
      title: String
      checked: Boolean
    }

    input AreaLinkIn {
      area: AreaId
      name: String
      notes: String
      _id: String
    }

    input AreaId {
      _id: String
    }

    type Key {
      title: String
      checked: Boolean
    }

    type ObjectiveLink {
      _id: String
      objectiveid: String
      areaid: String
      notes: String
      area: Area
      objective: Objective
    }

    type Focus {
      _id: String
      area: Area
      objective: Objective
      links: [String]
    }

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

    type Pomodoro {
      _id: String
      area: String
      links: String
      objective: String
      notes: String
      datetime: String
      minutes: Int
      date: String
    }

    type PomodoroData {
      _id: String
      count: Int
      records: Int
      direct: Int
      countdirect: Int
    }

    type ClickData {
      clicks: Int
    }

    type View {
      _id: String
      type: String
      wheel: Wheel
      name: String
    }

    type Wheel {
      _id: String
      name: String
      definition: String
      profile: String
      startarea: Area
      profiles: [Profile]
    }

    type Profile {
      _id: String
      name: String
      user: User
      wheel: Wheel
      type: String
    }

    type Area {
      _id: String
      name: String
      rank: RankTime
      goal: GoalTime
      definition: String
      focus: Boolean
      vision: String
      notes: String
      areas: [Area]
      time(readdate: String): PomodoroData
      clicks: ClickData
      coach: Boolean
    }

    type User {
      _id: String
      firstname: String
      email: String
      startarea: String
      area: Area
      serverversion: String
      profile: String
      views: [View]
      defaultview: View
      url: String
    }

    type RankTime {
      _id: String
      areaId: String
      rank: Int
      note: String
      date: String
    }

    type GoalTime {
      _id: String
      areaId: String
      goal: Int
      datetime: String
      note: String
      date: Float
      goaldate: String
    }
    
    schema {
      query: Query
      mutation: Mutation
    }
  `;
